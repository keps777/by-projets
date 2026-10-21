import { Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePatrons } from "./annuaire";
import { compagnieDe, erreur, modifier } from "./commun";
import { ConventionsService } from "./conventions.service";
import { SMS } from "./contenu";
import { tronconDeDepart } from "./echanges.service";
import type { BilletCorrespondanceStocke, DepartInterAgences, TronconBillet } from "./modele";
import {
  AnnuaireCompagnies,
  BilletsCorrespondance,
  BilletsEmis,
  DepartsInterAgences,
} from "./ports";
import {
  correspondanceGarantie,
  issueDeLaCorrespondance,
  ligneVoyageurs,
  memeVille,
  partsDesTroncons,
  repartir,
  type IssueCorrespondance,
} from "./regles";
import { heureCourte, versIsoDouala } from "./temps";

export interface ResultatArrivee {
  billet: BilletCorrespondanceStocke;
  issue: IssueCorrespondance;
}

/**
 * Les billets voyageurs en plusieurs tronçons, vendus sous un seul numéro : le billet vendu par la première
 * compagnie reçoit un second tronçon chez une compagnie liée par une convention. La correspondance est garantie
 * (25 minutes entre les deux bus, le second attend 15 minutes, sinon replacement gratuit sur le départ suivant
 * aux frais du retardataire). Une part n'est due que pour un tronçon où le voyageur est monté (scan).
 */
@Injectable()
export class BilletsService {
  constructor(
    readonly repo: BilletsCorrespondance,
    private readonly emis: BilletsEmis,
    private readonly departs: DepartsInterAgences,
    private readonly annuaire: AnnuaireCompagnies,
    private readonly conventions: ConventionsService,
    private readonly patrons: AnnuairePatrons,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  private static inconnu() {
    return erreur(404, "billet_introuvable", "Billet introuvable");
  }

  /** Équipe le billet vendu d'un second tronçon. Le billet est celui de la compagnie connectée. */
  async enregistrer(
    utilisateur: Utilisateur,
    saisie: { billet: string; departId: string },
  ): Promise<BilletCorrespondanceStocke> {
    const moi = compagnieDe(utilisateur);
    const vendu = await this.emis.trouver(saisie.billet);
    if (!vendu || vendu.compagnieId !== moi) throw BilletsService.inconnu();
    if (vendu.annule) throw erreur(409, "billet_annule", "Ce billet est annulé");
    const premier = await this.departs.trouver(vendu.departId);
    const second = await this.departs.trouver(saisie.departId);
    if (!premier || !second) throw erreur(404, "depart_introuvable", "Départ introuvable");
    if (premier.compagnieId !== moi) throw BilletsService.inconnu();
    if (second.compagnieId === moi) {
      throw erreur(422, "meme_compagnie", "Les deux tronçons sont à la même compagnie");
    }
    if (!memeVille(premier.destination, second.origine)) {
      throw erreur(
        422,
        "correspondance_impossible",
        "Le second tronçon ne part pas de la ville d'arrivée du premier",
      );
    }
    const convention = await this.conventions.activeEntre(moi, second.compagnieId);
    if (!convention) {
      throw erreur(422, "pas_de_convention", "Aucune convention en vigueur avec cette compagnie");
    }
    const ligne = ligneVoyageurs(
      convention.voyageurs,
      premier.origine,
      premier.destination,
      second.destination,
    );
    if (!ligne || ligne.premiere !== moi) {
      throw erreur(422, "ligne_non_prevue", "Ce trajet n'est pas prévu par la convention");
    }
    if (
      !correspondanceGarantie(
        premier.arriveePrevue,
        second.heureDepart,
        convention.voyageurs.garantieMinutes,
      )
    ) {
      throw erreur(
        422,
        "correspondance_trop_courte",
        `Il faut ${convention.voyageurs.garantieMinutes} min au moins entre l'arrivée du premier bus et le départ du second`,
      );
    }

    const compagnies = [premier.compagnieId, second.compagnieId];
    const parts = partsDesTroncons(compagnies, repartir(vendu.prix, ligne.parts, compagnies));
    const troncons: TronconBillet[] = [premier, second].map((d, i) => ({
      ...tronconDeDepart(i + 1, d, parts[i] ?? 0),
      etat: "prevu",
      embarqueLe: null,
    }));
    const billet: BilletCorrespondanceStocke = {
      id: vendu.id,
      version: 1,
      numero: vendu.numero,
      conventionId: convention.id,
      emettriceId: moi,
      voyageur: vendu.voyageur,
      prix: vendu.prix,
      troncons,
      arriveePremierBus: null,
      replacement: null,
      creeLe: this.maintenant(),
      creePar: utilisateur.id,
    };
    if (!(await this.repo.ajouter(billet))) {
      throw erreur(409, "deja_enregistre", "Ce billet est déjà en correspondance");
    }
    await this.tracer(utilisateur, "inter_agences.billet_enregistre", billet, {});
    return billet;
  }

  /** Un billet vu par une des compagnies de ses tronçons ; inconnu pour toute autre. */
  async lire(utilisateur: Utilisateur, reference: string): Promise<BilletCorrespondanceStocke> {
    const moi = compagnieDe(utilisateur);
    const billet =
      (await this.repo.trouver(reference)) ?? (await this.repo.trouverParNumero(reference));
    if (!billet || !billet.troncons.some((t) => t.compagnieId === moi))
      throw BilletsService.inconnu();
    return billet;
  }

  async liste(compagnieId: string): Promise<BilletCorrespondanceStocke[]> {
    const billets = await this.repo.lister({ compagnieId });
    return billets.sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe));
  }

  /**
   * Le voyageur monte dans le bus du tronçon `rang` (scan à l'embarquement, par la compagnie qui le conduit).
   * C'est ce scan qui rend la part de ce tronçon due. Il faut être monté dans le tronçon précédent.
   */
  async embarquer(
    utilisateur: Utilisateur,
    reference: string,
    rang: number,
  ): Promise<BilletCorrespondanceStocke> {
    const moi = compagnieDe(utilisateur);
    const lu = await this.lire(utilisateur, reference);
    const cible = lu.troncons.find((t) => t.rang === rang);
    if (!cible) throw erreur(422, "troncon_inconnu", "Ce billet n'a pas ce tronçon");
    if (cible.compagnieId !== moi) {
      throw erreur(403, "pas_votre_troncon", "Ce tronçon est conduit par une autre compagnie");
    }
    const maintenant = this.maintenant();
    let ecrit = false;
    const billet = await modifier(
      () => this.repo.trouver(lu.id),
      (b, v) => this.repo.remplacer(b, v),
      (b) => {
        const t = b.troncons.find((x) => x.rang === rang)!;
        if (t.etat === "embarque") return b;
        const precedent = b.troncons.find((x) => x.rang === rang - 1);
        if (precedent && precedent.etat !== "embarque") {
          throw erreur(
            409,
            "troncon_precedent",
            "Le voyageur n'est pas encore monté dans le tronçon précédent",
          );
        }
        ecrit = true;
        return {
          ...b,
          troncons: b.troncons.map((x) =>
            x.rang === rang ? { ...x, etat: "embarque" as const, embarqueLe: maintenant } : x,
          ),
        };
      },
      BilletsService.inconnu,
    );
    if (ecrit) await this.tracer(utilisateur, "inter_agences.billet_embarque", billet, { rang });
    return billet;
  }

  /**
   * Le premier bus est arrivé à `arriveeLe`. À l'heure, ou en retard dans l'attente du second bus : le voyageur
   * continue (le second bus attend). Au-delà, replacement gratuit sur le départ suivant de la seconde
   * compagnie, dont le siège perdu est à la charge du retardataire. La décision ne se prend qu'une fois.
   */
  async constaterArrivee(
    utilisateur: Utilisateur,
    reference: string,
    arriveeLe: string,
  ): Promise<ResultatArrivee> {
    const lu = await this.lire(utilisateur, reference);
    const [premier, second] = lu.troncons as [TronconBillet, TronconBillet];
    const convention = await this.conventions.repo.trouver(lu.conventionId);
    if (!convention) throw erreur(404, "convention_introuvable", "Convention introuvable");
    if (premier.etat !== "embarque") {
      throw erreur(409, "pas_embarque", "Le voyageur n'est pas monté dans le premier bus");
    }
    if (lu.arriveePremierBus) {
      return { billet: lu, issue: this.issueDeja(lu, convention.voyageurs.attenteMinutes) };
    }
    const issue = issueDeLaCorrespondance(
      arriveeLe,
      second.heureDepart,
      convention.voyageurs.attenteMinutes,
    );
    let prochain: DepartInterAgences | null = null;
    if (issue.type === "replacement") {
      prochain = await this.departs.prochain({
        compagnieId: second.compagnieId,
        origine: second.origine,
        destination: second.destination,
        apres: second.heureDepart,
      });
      if (!prochain) {
        throw erreur(409, "aucun_depart_suivant", "Aucun départ suivant pour replacer le voyageur");
      }
    }
    const maintenant = this.maintenant();
    const retard =
      issue.type === "a_l_heure"
        ? 0
        : issue.type === "attente"
          ? issue.minutes
          : issue.retardMinutes;
    let ecrit = false;
    const billet = await modifier(
      () => this.repo.trouver(lu.id),
      (b, v) => this.repo.remplacer(b, v),
      (b) => {
        if (b.arriveePremierBus) return b;
        ecrit = true;
        const base = {
          ...b,
          arriveePremierBus: { a: arriveeLe, par: utilisateur.id, retardMinutes: retard },
        };
        if (issue.type !== "replacement" || !prochain) return base;
        const ancien = b.troncons.find((t) => t.rang === second.rang)!;
        return {
          ...base,
          troncons: b.troncons.map((t) =>
            t.rang === second.rang
              ? {
                  ...t,
                  departId: prochain!.id,
                  heureDepart: prochain!.heureDepart,
                  heureArrivee: prochain!.arriveePrevue,
                  bus: prochain!.bus,
                  etat: "replace" as const,
                }
              : t,
          ),
          replacement: {
            decideLe: maintenant,
            departId: prochain.id,
            heureDepart: prochain.heureDepart,
            bus: prochain.bus,
            retardataireId: premier.compagnieId,
            montant: ancien.part,
          },
        };
      },
      BilletsService.inconnu,
    );
    if (ecrit) {
      await this.tracer(utilisateur, "inter_agences.correspondance_constatee", billet, {
        issue: issue.type,
        retardMinutes: retard,
      });
      await this.prevenirVoyageur(billet, issue, prochain);
    }
    return {
      billet,
      issue: ecrit ? issue : this.issueDeja(billet, convention.voyageurs.attenteMinutes),
    };
  }

  private issueDeja(billet: BilletCorrespondanceStocke, attente: number): IssueCorrespondance {
    if (billet.replacement) {
      return {
        type: "replacement",
        retardMinutes: billet.arriveePremierBus?.retardMinutes ?? attente,
      };
    }
    const retard = billet.arriveePremierBus?.retardMinutes ?? 0;
    return retard > 0 ? { type: "attente", minutes: retard } : { type: "a_l_heure" };
  }

  private async prevenirVoyageur(
    billet: BilletCorrespondanceStocke,
    issue: IssueCorrespondance,
    prochain: DepartInterAgences | null,
  ): Promise<void> {
    if (issue.type === "attente") {
      await this.patrons.prevenir(
        billet.voyageur.telephone,
        SMS.billetAttente(billet.numero, issue.minutes),
      );
    } else if (issue.type === "replacement" && prochain) {
      await this.patrons.prevenir(
        billet.voyageur.telephone,
        SMS.billetReplace(billet.numero, heureCourte(prochain.heureDepart)),
      );
    }
  }

  /** Les noms des compagnies d'un billet, pour les vues. */
  async noms(billet: BilletCorrespondanceStocke): Promise<Map<string, string>> {
    const noms = new Map<string, string>();
    for (const t of billet.troncons) {
      const c = await this.annuaire.trouver(t.compagnieId);
      if (c) noms.set(c.id, c.nom);
    }
    return noms;
  }

  private tracer(
    utilisateur: Utilisateur,
    action: string,
    billet: BilletCorrespondanceStocke,
    details: Record<string, unknown>,
  ): Promise<unknown> {
    return this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action,
      resultat: "succes",
      cible: { type: "billet", id: billet.id },
      details: { billet: billet.numero, ...details },
    });
  }
}
