import { Injectable } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { versIsoDouala } from "../relais/temps";
import { agrementInconnu, vendeurSuspendu } from "./erreurs";
import type { Agrement, Vendeur } from "./modele";
import {
  AgrementsRepository,
  ComptesVendeurs,
  MessagesVendeurs,
  NumerosVendeurs,
  OffreBillets,
  VendeursRepository,
  VentesRepository,
} from "./ports";
import {
  COMMISSION_CLASSIQUE_DEFAUT,
  COMMISSION_VIP_DEFAUT,
  codeVendeur,
  debutDeMois,
  debutDuMoisSuivant,
  operateurProbable,
} from "./regles";
import type { AgrementDemande } from "./validation";
import { formaterFcfa } from "../colis/regles";

/** Ce que l'agence voit d'un vendeur qu'elle a agréé. */
export interface VueVendeurAgence {
  vendeurId: string;
  numero: string;
  nom: string;
  quartier: string;
  ville: string;
  etat: "actif" | "retire" | "suspendu";
  commissionClassique: number;
  commissionVip: number;
  accordeLe: string;
  billetsDuMois: number;
  commissionsDuMois: number;
}

const ACTEUR = (u: Utilisateur) => ({ id: u.id, role: u.role, compagnieId: u.compagnieId });

/**
 * L'agrément des vendeurs par les agences : un patron ou un superviseur agrée un vendeur pour sa
 * compagnie (son compte est créé au besoin, son numéro « V-0412 » est donné une fois pour toutes), fixe
 * sa commission, ou lui retire l'agrément. Un vendeur ne vend que les billets des agences qui l'ont
 * agréé. Ces routes ne sont pas dans les contrats : l'écran du vendeur n'en a pas besoin.
 */
@Injectable()
export class AgrementsService {
  constructor(
    private readonly vendeurs: VendeursRepository,
    private readonly agrements: AgrementsRepository,
    private readonly numeros: NumerosVendeurs,
    private readonly comptes: ComptesVendeurs,
    private readonly offre: OffreBillets,
    private readonly ventes: VentesRepository,
    private readonly messages: MessagesVendeurs,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  private maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  private compagnieDe(u: Utilisateur): string {
    if (u.compagnieId === null) {
      throw new ErreurColis(403, "compagnie_requise", "Ce compte n'est rattaché à aucune agence");
    }
    return u.compagnieId;
  }

  /** Agrée un vendeur pour l'agence du connecté. Idempotent côté compte : même numéro, même fiche. */
  async agreer(
    u: Utilisateur,
    d: AgrementDemande,
  ): Promise<VueVendeurAgence & { nouveauCompte: boolean }> {
    const compagnieId = this.compagnieDe(u);
    const compagnie = await this.offre.compagnie(compagnieId);
    if (!compagnie) throw new ErreurColis(404, "compagnie_introuvable", "Agence introuvable");

    const compte = await this.comptes.ouvrir({ nom: d.nom, telephone: d.telephone });
    let vendeur = await this.vendeurs.trouver(compte.personneId);
    if (vendeur && !vendeur.actif) throw vendeurSuspendu();
    const maintenant = this.maintenant();
    if (!vendeur) {
      const nouveau: Vendeur = {
        id: compte.personneId,
        version: 1,
        numero: codeVendeur(await this.numeros.prochain()),
        nom: compte.nom || d.nom,
        telephone: d.telephone,
        quartier: d.quartier,
        ville: d.ville,
        momo: d.momo ?? {
          telephone: d.telephone,
          operateur: operateurProbable(d.telephone) ?? "mtn",
        },
        actif: true,
        creeA: maintenant,
      };
      // Deux agences qui agréent le même vendeur en même temps : l'une crée la fiche, l'autre la relit.
      vendeur = (await this.vendeurs.ajouter(nouveau))
        ? nouveau
        : await this.vendeurs.trouver(compte.personneId);
      if (!vendeur) throw new ErreurColis(409, "agrement_en_conflit", "Réessayez dans un instant");
    }

    const existant = await this.agrements.trouver(vendeur.id, compagnieId);
    if (existant?.etat === "actif") {
      throw new ErreurColis(409, "deja_agree", "Ce vendeur est déjà agréé par votre agence");
    }
    const agrement: Agrement = {
      vendeurId: vendeur.id,
      compagnieId,
      compagnieNom: compagnie.nom,
      etat: "actif",
      commissionClassique: d.commissionClassique ?? COMMISSION_CLASSIQUE_DEFAUT,
      commissionVip: d.commissionVip ?? COMMISSION_VIP_DEFAUT,
      accordeLe: maintenant,
      accordePar: u.id,
      retireLe: null,
    };
    await this.agrements.enregistrer(agrement);
    await this.audit.enregistrer({
      acteur: ACTEUR(u),
      action: "vendeur.agrement",
      resultat: "succes",
      cible: { type: "vendeur", id: vendeur.id },
      details: {
        compagnieId,
        commissionClassique: agrement.commissionClassique,
        commissionVip: agrement.commissionVip,
        nouveauCompte: compte.nouveau,
      },
    });
    await this.messages.prevenir(
      vendeur.telephone,
      `AfriMove : ${compagnie.nom} vous a agréé comme vendeur (n° ${vendeur.numero}). ` +
        `Commission par billet : ${formaterFcfa(agrement.commissionClassique)} (classique), ` +
        `${formaterFcfa(agrement.commissionVip)} (VIP), versée chaque lundi.`,
    );
    return { ...(await this.vue(vendeur, agrement)), nouveauCompte: compte.nouveau };
  }

  /** Les vendeurs de l'agence, avec leurs billets et leurs commissions du mois. */
  async lister(u: Utilisateur): Promise<{ vendeurs: VueVendeurAgence[] }> {
    const compagnieId = this.compagnieDe(u);
    const agrements = await this.agrements.deCompagnie(compagnieId);
    const fiches = await this.vendeurs.lister({ ids: agrements.map((a) => a.vendeurId) });
    const parId = new Map(fiches.map((v) => [v.id, v]));
    const vues: VueVendeurAgence[] = [];
    for (const agrement of agrements) {
      const vendeur = parId.get(agrement.vendeurId);
      if (vendeur) vues.push(await this.vue(vendeur, agrement));
    }
    return { vendeurs: vues.sort((a, b) => a.numero.localeCompare(b.numero)) };
  }

  async retirer(u: Utilisateur, vendeurId: string): Promise<VueVendeurAgence> {
    const { vendeur, agrement } = await this.agrementActif(u, vendeurId);
    const retire: Agrement = { ...agrement, etat: "retire", retireLe: this.maintenant() };
    await this.agrements.enregistrer(retire);
    await this.audit.enregistrer({
      acteur: ACTEUR(u),
      action: "vendeur.agrement_retire",
      resultat: "succes",
      cible: { type: "vendeur", id: vendeur.id },
      details: { compagnieId: agrement.compagnieId },
    });
    await this.messages.prevenir(
      vendeur.telephone,
      `AfriMove : ${agrement.compagnieNom} ne vous compte plus parmi ses vendeurs. Les billets déjà vendus restent valables.`,
    );
    return this.vue(vendeur, retire);
  }

  /** Change la commission des prochaines ventes ; les billets déjà vendus gardent la leur. */
  async fixerCommissions(
    u: Utilisateur,
    vendeurId: string,
    c: { commissionClassique: number; commissionVip: number },
  ): Promise<VueVendeurAgence> {
    const { vendeur, agrement } = await this.agrementActif(u, vendeurId);
    const change: Agrement = { ...agrement, ...c };
    await this.agrements.enregistrer(change);
    await this.audit.enregistrer({
      acteur: ACTEUR(u),
      action: "vendeur.commissions",
      resultat: "succes",
      cible: { type: "vendeur", id: vendeur.id },
      details: { compagnieId: agrement.compagnieId, ...c },
    });
    return this.vue(vendeur, change);
  }

  private async agrementActif(u: Utilisateur, vendeurId: string) {
    const compagnieId = this.compagnieDe(u);
    const agrement = await this.agrements.trouver(vendeurId, compagnieId);
    const vendeur = await this.vendeurs.trouver(vendeurId);
    if (!agrement || agrement.etat !== "actif" || !vendeur) throw agrementInconnu();
    return { vendeur, agrement };
  }

  private async vue(vendeur: Vendeur, agrement: Agrement): Promise<VueVendeurAgence> {
    const maintenant = this.maintenant();
    const duMois = (
      await this.ventes.duVendeur(vendeur.id, {
        etats: ["terminee"],
        depuis: debutDeMois(maintenant),
        avant: debutDuMoisSuivant(maintenant),
      })
    ).filter((v) => v.compagnieId === agrement.compagnieId);
    return {
      vendeurId: vendeur.id,
      numero: vendeur.numero,
      nom: vendeur.nom,
      quartier: vendeur.quartier,
      ville: vendeur.ville,
      etat: !vendeur.actif ? "suspendu" : agrement.etat,
      commissionClassique: agrement.commissionClassique,
      commissionVip: agrement.commissionVip,
      accordeLe: agrement.accordeLe,
      billetsDuMois: duMois.length,
      commissionsDuMois: duMois.reduce((somme, v) => somme + v.commission, 0),
    };
  }
}
