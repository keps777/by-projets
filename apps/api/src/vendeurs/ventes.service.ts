import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { ajouterMinutes, enMs, versIsoDouala } from "../relais/temps";
import {
  compagnieNonAgreee,
  demandeInvalide,
  departComplet,
  departFerme,
  departIntrouvable,
  moyenIndisponible,
  reglementEnAttente,
  reglementRefuse,
  venteEnCours,
} from "./erreurs";
import type { EtatVente, Vente } from "./modele";
import {
  CommissionsVendeurs,
  DepartNonVendable,
  MessagesVendeurs,
  OPTIONS_VENDEURS,
  OffreBillets,
  PlusDePlace,
  ReglementsAgence,
  VentesRepository,
  type EtatReglement,
  type OptionsVendeurs,
} from "./ports";
import {
  RETENUE_SIEGE_MINUTES,
  VEILLE_TARDIVE_HEURES,
  commissionPour,
  masquerTelephone,
  normaliser,
} from "./regles";
import type { VenteDemandee } from "./validation";
import { VendeursService } from "./vendeurs.service";

const OPERATEUR_DU_MOYEN = { mtn_momo: "mtn", orange_money: "orange" } as const;

const pause = (ms: number) => new Promise<void>((fin) => setTimeout(fin, ms));

/** `SchemaBilletVendu`. */
export interface BilletVendu {
  billetId: string;
  numero: string;
  departId: string;
  prix: number;
  commission: number;
  aRegler: number;
  smsEnvoyeA: string;
  venduLe: string;
}

/**
 * La vente d'un billet à un voisin, au nom du voisin. Le vendeur ne garde jamais l'argent du
 * billet : le voisin lui remet le prix, il le règle **aussitôt** à l'agence par mobile money (une
 * demande de confirmation part sur son téléphone), et l'argent va du compte du vendeur au compte de
 * la compagnie. Tant que l'agence n'a pas reçu l'argent, il n'y a ni billet, ni SMS, ni commission :
 * le siège est seulement retenu. Une seule vente à la fois par vendeur attend son règlement.
 *
 *   POST /vendeurs/moi/ventes ─► vente « en_attente » + siège retenu + demande de paiement
 *        │ attend la confirmation (60 s au plus)
 *        ├─ payée ─► billet émis, SMS au voisin, commission créditée ─► 201
 *        ├─ refusée ─► siège rendu, aucun billet ─► 402 reglement_refuse
 *        └─ pas de réponse ─► 409 reglement_en_attente ; la tâche de fond conclut :
 *             payée → billet + SMS ; refusée ou délai de 10 min dépassé → siège rendu.
 */
@Injectable()
export class VentesService {
  private readonly logger = new Logger("VentesService");

  constructor(
    private readonly vendeurs: VendeursService,
    private readonly ventes: VentesRepository,
    private readonly offre: OffreBillets,
    private readonly reglements: ReglementsAgence,
    private readonly commissions: CommissionsVendeurs,
    private readonly messages: MessagesVendeurs,
    private readonly chiffrement: ChiffrementService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(OPTIONS_VENDEURS) private readonly options: OptionsVendeurs,
  ) {}

  private maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /* -------------------------------------------------------------- vendre */

  async vendre(utilisateur: Utilisateur, demande: VenteDemandee): Promise<BilletVendu> {
    if (demande.reglementAgence === "carte") throw moyenIndisponible();
    const moyen = demande.reglementAgence;
    const { vendeur, agrements } = await this.vendeurs.moi(utilisateur);
    const depart = await this.offre.depart(demande.departId);
    if (!depart) throw departIntrouvable();
    const agrement = agrements.find((a) => a.compagnieId === depart.compagnieId);
    if (!agrement) throw compagnieNonAgreee();
    const maintenant = this.maintenant();
    if (enMs(depart.heureDepart) <= enMs(maintenant)) throw departFerme();
    if (vendeur.momo.operateur !== OPERATEUR_DU_MOYEN[moyen]) {
      throw demandeInvalide(
        "moyen_incoherent",
        `Ton numéro enregistré est ${vendeur.momo.operateur === "mtn" ? "MTN" : "Orange"} : choisis le même moyen`,
      );
    }

    const vente: Vente = {
      id: randomUUID(),
      version: 1,
      vendeurId: vendeur.id,
      compagnieId: depart.compagnieId,
      departId: depart.departId,
      billetId: randomUUID(),
      billetNumero: null,
      siege: null,
      voisin: { nom: demande.voisin.nom.trim(), telephone: demande.voisin.telephone },
      voisinIndex: this.chiffrement.indexAveugle(demande.voisin.telephone, "vendeur.voisin"),
      empreinte: this.chiffrement.indexAveugle(
        `${normaliser(demande.voisin.nom)}|${demande.voisin.telephone}`,
        "vendeur.voisin.nom",
      ),
      origine: depart.origine,
      destination: depart.destination,
      classe: depart.classe,
      departA: depart.heureDepart,
      prix: depart.prix,
      commission: commissionPour(depart.classe, agrement),
      moyen,
      etat: "en_attente",
      creeA: maintenant,
      expireA: ajouterMinutes(maintenant, RETENUE_SIEGE_MINUTES),
      reference: null,
      regleeA: null,
      cause: null,
      termineeA: null,
      majA: maintenant,
    };

    const ajout = await this.ventes.ajouter(vente);
    if (ajout.resultat === "vente_en_cours") throw venteEnCours();
    if (ajout.resultat === "billet_pris") {
      throw new ErreurColis(409, "vente_en_double", "Cette vente existe déjà");
    }
    if (ajout.resultat === "doublon") return this.rejouer(ajout.existante);

    // Le siège est retenu avant de demander l'argent : on ne fait pas payer pour une place qui n'existe plus.
    try {
      const { siege } = await this.offre.retenir({
        departId: depart.departId,
        par: vendeur.id,
        jusqua: vente.expireA,
      });
      vente.siege = siege;
      await this.ventes.transitionner(vente.id, ["en_attente"], { siege });
    } catch (e) {
      await this.abandonner(
        vente,
        "refusee",
        e instanceof PlusDePlace ? "plus_de_place" : "depart_ferme",
      );
      if (e instanceof PlusDePlace) throw departComplet();
      if (e instanceof DepartNonVendable) throw departFerme();
      throw e;
    }

    const resultat = await this.demanderEtAttendre(vente, vendeur.momo.telephone);
    return this.conclure(vente, resultat);
  }

  /** Lance la demande de paiement et attend la réponse de l'opérateur, au plus `delaiReglementMs`. */
  private async demanderEtAttendre(vente: Vente, telephone: string): Promise<EtatReglement> {
    const demander = async (): Promise<EtatReglement> => {
      try {
        return await this.reglements.regler({
          cle: vente.id,
          compagnieId: vente.compagnieId,
          vendeurId: vente.vendeurId,
          montant: vente.prix,
          moyen: vente.moyen,
          telephone,
        });
      } catch (e) {
        // Résultat inconnu (réseau, délai) : la même clé sera rejouée sans payer deux fois.
        this.logger.warn(`Règlement ${vente.id} : résultat inconnu (${(e as Error).name})`);
        return { etat: "inconnu" };
      }
    };
    let etat = await demander();
    const fin = Date.now() + this.options.delaiReglementMs;
    while ((etat.etat === "en_attente" || etat.etat === "inconnu") && Date.now() < fin) {
      await pause(Math.max(0, Math.min(this.options.sondageMs, fin - Date.now())));
      try {
        etat = await this.reglements.statut(vente.id, vente.compagnieId);
        if (etat.etat === "inconnu") etat = await demander();
      } catch {
        /* on regarde à nouveau au prochain passage */
      }
    }
    return etat;
  }

  private async conclure(vente: Vente, resultat: EtatReglement): Promise<BilletVendu> {
    if (resultat.etat === "reussi") return this.finaliser(vente.id, resultat.reference);
    if (resultat.etat === "refuse") {
      await this.abandonner(vente, "refusee", resultat.cause);
      throw reglementRefuse(resultat.cause);
    }
    throw reglementEnAttente();
  }

  /** La même vente envoyée deux fois (double clic, réponse perdue) donne le même billet. */
  private async rejouer(existante: Vente): Promise<BilletVendu> {
    if (existante.etat === "terminee") return this.reponse(existante);
    const etat = await this.reglements
      .statut(existante.id, existante.compagnieId)
      .catch((): EtatReglement => ({ etat: "inconnu" }));
    if (etat.etat === "reussi") return this.finaliser(existante.id, etat.reference);
    throw reglementEnAttente();
  }

  /* -------------------------------------------------------------- conclure une vente */

  /**
   * L'agence a reçu l'argent : émet le billet au nom du voisin, crédite la commission et prévient le
   * voisin. Chaque pas est idempotent (billet par identifiant, commission par clé) et l'état de la
   * vente ne change que par comparaison : la requête et la tâche de fond peuvent arriver ensemble,
   * un seul billet est émis, une seule commission créditée.
   */
  async finaliser(venteId: string, reference: string | null): Promise<BilletVendu> {
    let vente = await this.ventes.trouver(venteId);
    if (!vente) throw new ErreurColis(404, "vente_introuvable", "Vente introuvable");
    if (vente.etat === "en_attente") {
      const maintenant = this.maintenant();
      vente =
        (await this.ventes.transitionner(venteId, ["en_attente"], {
          etat: "reglee",
          reference,
          regleeA: maintenant,
          majA: maintenant,
        })) ?? (await this.ventes.trouver(venteId));
    }
    if (!vente) throw new ErreurColis(404, "vente_introuvable", "Vente introuvable");
    if (vente.etat === "terminee") return this.reponse(vente);
    if (vente.etat !== "reglee") {
      throw new ErreurColis(409, "vente_close", "Cette vente n'est plus en cours");
    }

    const maintenant = this.maintenant();
    let billet;
    try {
      billet = await this.offre.emettre({
        billetId: vente.billetId,
        departId: vente.departId,
        par: vente.vendeurId,
        siege: vente.siege,
        voisin: vente.voisin,
        moyen: vente.moyen,
        reference: vente.reference,
        at: maintenant,
      });
    } catch (e) {
      if (e instanceof PlusDePlace || e instanceof DepartNonVendable) {
        // L'agence est payée mais le billet ne peut plus être émis : AfriMove rembourse le vendeur.
        await this.ventes.transitionner(venteId, ["reglee"], {
          etat: "a_rembourser",
          cause: e instanceof PlusDePlace ? "plus_de_place" : "depart_ferme",
          majA: maintenant,
        });
        await this.audit.enregistrer({
          acteur: { id: vente.vendeurId, role: "vendeur", compagnieId: null },
          action: "vendeur.a_rembourser",
          resultat: "echec",
          cible: { type: "vente", id: vente.id },
          details: {
            prix: vente.prix,
            cause: e instanceof PlusDePlace ? "plus_de_place" : "depart_ferme",
          },
        });
        throw e instanceof PlusDePlace ? departComplet() : departFerme();
      }
      throw e;
    }

    if (vente.commission > 0) {
      await this.commissions.crediter({
        cle: `commission:${vente.id}`,
        vendeurId: vente.vendeurId,
        compagnieId: vente.compagnieId,
        montant: vente.commission,
        venteId: vente.id,
        at: maintenant,
      });
    }
    const terminee = await this.ventes.transitionner(venteId, ["reglee"], {
      etat: "terminee",
      billetNumero: billet.numero,
      siege: billet.siege,
      termineeA: billet.emisLe,
      majA: maintenant,
    });
    if (terminee) {
      await this.audit.enregistrer({
        acteur: { id: vente.vendeurId, role: "vendeur", compagnieId: null },
        action: "vendeur.vente",
        resultat: "succes",
        cible: { type: "billet", id: vente.billetId },
        details: {
          venteId: vente.id,
          departId: vente.departId,
          compagnieId: vente.compagnieId,
          prix: vente.prix,
          commission: vente.commission,
          moyen: vente.moyen,
        },
      });
    }
    const finale = terminee ?? (await this.ventes.trouver(venteId));
    if (!finale) throw new ErreurColis(404, "vente_introuvable", "Vente introuvable");

    // Le SMS ne bloque jamais la vente : la passerelle le reprend, et son envoi est idempotent.
    const depart = await this.offre.depart(vente.departId);
    if (depart) {
      await this.messages.envoyerBillet({
        billetId: vente.billetId,
        numero: billet.numero,
        siege: billet.siege,
        code: billet.code,
        destinataire: vente.voisin.telephone,
        depart,
        vendeurId: vente.vendeurId,
      });
    }
    return this.reponse(finale);
  }

  private reponse(vente: Vente): BilletVendu {
    return {
      billetId: vente.billetId,
      numero: vente.billetNumero as string,
      departId: vente.departId,
      prix: vente.prix,
      commission: vente.commission,
      // Le vendeur règle l'agence du prix du billet, en entier : sa commission lui est versée à part.
      aRegler: vente.prix,
      smsEnvoyeA: masquerTelephone(vente.voisin.telephone),
      venduLe: vente.termineeA as string,
    };
  }

  /** La vente n'aboutit pas : le siège revient à la vente, rien n'est dû à personne. */
  private async abandonner(
    vente: Vente,
    etat: Extract<EtatVente, "refusee" | "expiree">,
    cause: string,
  ): Promise<boolean> {
    const maintenant = this.maintenant();
    const changee = await this.ventes.transitionner(vente.id, ["en_attente"], {
      etat,
      cause,
      majA: maintenant,
    });
    if (!changee) return false;
    const siege = changee.siege ?? vente.siege;
    if (siege !== null) {
      await this.offre
        .liberer({ departId: vente.departId, par: vente.vendeurId, siege })
        .catch((e: unknown) =>
          this.logger.warn(`Siège de la vente ${vente.id} non rendu (${(e as Error).name})`),
        );
    }
    await this.audit.enregistrer({
      acteur: { id: vente.vendeurId, role: "vendeur", compagnieId: null },
      action: "vendeur.vente",
      resultat: "echec",
      cible: { type: "vente", id: vente.id },
      details: { etat, cause, prix: vente.prix },
    });
    return true;
  }

  /* -------------------------------------------------------------- tâche de fond */

  /**
   * Conclut les ventes restées en route : payée → billet et SMS ; refusée, ou délai de retenue
   * dépassé → siège rendu. Guette aussi, pendant 24 h, l'argent arrivé après coup sur une vente déjà
   * refusée ou expirée : l'agence a été payée sans billet, la vente passe à « à rembourser ».
   */
  async reprendre(): Promise<{
    terminees: number;
    abandonnees: number;
    aRembourser: number;
  }> {
    const bilan = { terminees: 0, abandonnees: 0, aRembourser: 0 };
    const maintenant = this.maintenant();

    for (const vente of await this.ventes.parEtats(["reglee"])) {
      try {
        await this.finaliser(vente.id, vente.reference);
        bilan.terminees += 1;
      } catch (e) {
        this.signaler(vente, e);
      }
    }

    for (const vente of await this.ventes.parEtats(["en_attente"])) {
      try {
        let etat = await this.reglements.statut(vente.id, vente.compagnieId);
        const dejaExpiree = enMs(vente.expireA) <= enMs(maintenant);
        if (etat.etat === "inconnu" && !dejaExpiree) {
          // La demande n'est jamais partie : on la relance (même clé, jamais deux paiements).
          etat = await this.reglements.regler({
            cle: vente.id,
            compagnieId: vente.compagnieId,
            vendeurId: vente.vendeurId,
            montant: vente.prix,
            moyen: vente.moyen,
            telephone: await this.numeroMomo(vente.vendeurId),
          });
        }
        if (etat.etat === "reussi") {
          await this.finaliser(vente.id, etat.reference);
          bilan.terminees += 1;
        } else if (etat.etat === "refuse") {
          if (await this.abandonner(vente, "refusee", etat.cause)) bilan.abandonnees += 1;
        } else if (dejaExpiree) {
          if (await this.abandonner(vente, "expiree", "delai_depasse")) bilan.abandonnees += 1;
        }
      } catch (e) {
        this.signaler(vente, e);
      }
    }

    const limite = enMs(maintenant) - VEILLE_TARDIVE_HEURES * 3_600_000;
    for (const vente of await this.ventes.parEtats(["refusee", "expiree"])) {
      if (enMs(vente.majA) < limite) continue;
      try {
        const etat = await this.reglements.statut(vente.id, vente.compagnieId);
        if (etat.etat !== "reussi") continue;
        const changee = await this.ventes.transitionner(vente.id, ["refusee", "expiree"], {
          etat: "a_rembourser",
          reference: etat.reference,
          majA: maintenant,
        });
        if (!changee) continue;
        bilan.aRembourser += 1;
        await this.audit.enregistrer({
          acteur: { id: vente.vendeurId, role: "vendeur", compagnieId: null },
          action: "vendeur.reglement_tardif",
          resultat: "echec",
          cible: { type: "vente", id: vente.id },
          details: { prix: vente.prix, compagnieId: vente.compagnieId },
        });
      } catch (e) {
        this.signaler(vente, e);
      }
    }
    return bilan;
  }

  private signaler(vente: Vente, e: unknown): void {
    this.logger.warn(`Vente ${vente.id} non conclue (${(e as Error).name})`);
  }

  /** Le numéro MoMo du vendeur (sa fiche), pour relancer une demande de paiement. */
  private async numeroMomo(vendeurId: string): Promise<string> {
    const fiche = await this.vendeurs.vendeurs.trouver(vendeurId);
    if (!fiche) throw new ErreurColis(404, "vendeur_introuvable", "Vendeur introuvable");
    return fiche.momo.telephone;
  }
}
