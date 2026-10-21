import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePatrons } from "./annuaire";
import { compagnieDe, erreur } from "./commun";
import { ConventionsService } from "./conventions.service";
import { SMS } from "./contenu";
import type {
  CompagnieRef,
  ContestationStockee,
  ConventionStockee,
  Creance,
  ReglementStocke,
} from "./modele";
import {
  AnnuaireCompagnies,
  BilletsCorrespondance,
  ColisInterAgences,
  CompteursReferences,
  Contestations,
  ReglementRefuse,
  Reglements,
  ReglementsMobile,
} from "./ports";
import {
  autreCompagnie,
  contestationRecevable,
  creancesDuBillet,
  creancesDuColis,
  periodeAffichee,
  periodesEchues,
  soldePour,
  type Periode,
  type SoldeNet,
} from "./regles";
import { aammjjDouala, enMs, trimestreDe, versIsoDouala } from "./temps";

const MS_PAR_JOUR = 24 * 3_600_000;

export interface Releve {
  convention: ConventionStockee;
  periode: Periode;
  /** Ce qui sera réglé au prochain lundi : scans acquis avant le gel du dimanche 20:00, hors litige. */
  creances: Creance[];
  /** Ce qui est contesté et reste en attente de la décision d'AfriMove. */
  enLitige: Creance[];
}

export interface BilanTrimestre {
  colisEchanges: number;
  litiges: number;
  /** Jours pris pour régler le dernier litige ; `null` s'il y en a un ouvert ou aucun. */
  delaiLitigeJours: number | null;
  netRecu: number;
  lundis: number;
}

/**
 * Le règlement hebdomadaire entre compagnies. Le solde net est calculé **uniquement** à partir des scans
 * (passages de témoin des colis, embarquements des billets, replacements constatés) : une opération sans scan
 * n'est jamais due. Les scans sont gelés le dimanche à 20:00 (fin de la contestation) et le solde net est réglé
 * par MoMo le lundi à 08:00. Une opération contestée reste hors du règlement jusqu'à la décision d'AfriMove.
 */
@Injectable()
export class ReglementsService {
  private readonly logger = new Logger("ReglementsService");

  constructor(
    private readonly conventions: ConventionsService,
    private readonly colis: ColisInterAgences,
    private readonly billets: BilletsCorrespondance,
    readonly reglements: Reglements,
    readonly contestations: Contestations,
    private readonly annuaire: AnnuaireCompagnies,
    private readonly mobile: ReglementsMobile,
    private readonly patrons: AnnuairePatrons,
    private readonly compteurs: CompteursReferences,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /* -------------------------------------------------------------- calcul */

  /** Toutes les créances que les scans de la convention rendent certaines, réglées ou non. */
  async creancesDe(conventionId: string): Promise<Creance[]> {
    const [colis, billets] = await Promise.all([
      this.colis.lister({ conventionId }),
      this.billets.lister({ conventionId }),
    ]);
    return [...colis.flatMap(creancesDuColis), ...billets.flatMap(creancesDuBillet)];
  }

  /** Les créances pas encore réglées de la convention, séparées de celles qui sont en litige. */
  async enAttente(conventionId: string): Promise<{ libres: Creance[]; enLitige: Creance[] }> {
    const [toutes, arretes, contestations] = await Promise.all([
      this.creancesDe(conventionId),
      this.reglements.lister(conventionId),
      this.contestations.lister({ conventionId }),
    ]);
    const reglees = new Set(arretes.flatMap((r) => r.lignes.map((l) => l.cle)));
    const ecartees = new Set(
      contestations.filter((c) => c.statut === "accordee").flatMap((c) => c.cles),
    );
    const ouvertes = new Set(
      contestations.filter((c) => c.statut === "ouverte").flatMap((c) => c.cles),
    );
    const restantes = toutes.filter((c) => !reglees.has(c.cle) && !ecartees.has(c.cle));
    return {
      libres: restantes.filter((c) => !ouvertes.has(c.cle)),
      enLitige: restantes.filter((c) => ouvertes.has(c.cle)),
    };
  }

  /** Le relevé affiché à `instant` pour une convention. */
  async releve(convention: ConventionStockee, instant = this.maintenant()): Promise<Releve> {
    const periode = periodeAffichee(instant);
    const { libres, enLitige } = await this.enAttente(convention.id);
    const avantLeGel = (c: Creance) => enMs(c.acquiseLe) < enMs(periode.gelLe);
    return {
      convention,
      periode,
      creances: libres.filter(avantLeGel),
      enLitige: enLitige.filter(avantLeGel),
    };
  }

  /** Les relevés de toutes les conventions signées de la compagnie. */
  async relevesDe(compagnieId: string, instant = this.maintenant()): Promise<Releve[]> {
    const conventions = await this.conventions.mesConventions(compagnieId);
    return Promise.all(conventions.map((c) => this.releve(c, instant)));
  }

  soldeDe(compagnieId: string, releve: Releve): SoldeNet {
    return soldePour(compagnieId, releve.creances);
  }

  /* -------------------------------------------------------------- contestation */

  /**
   * Une compagnie conteste son relevé de la semaine (jusqu'au dimanche 20:00) : les colis ou billets désignés,
   * ou tout le relevé. Les opérations contestées sortent du règlement du lundi jusqu'à la décision. Après le
   * dimanche 20:00 la contestation est enregistrée mais non recevable : elle ne retient rien.
   */
  async contester(
    utilisateur: Utilisateur,
    saisie: { motif: string; colisIds?: string[] },
  ): Promise<ContestationStockee> {
    const moi = compagnieDe(utilisateur);
    const maintenant = this.maintenant();
    const jour = aammjjDouala(maintenant);
    const recevable = contestationRecevable(maintenant);

    let cles: string[] = [];
    let conventionIds: string[] = [];
    if (recevable) {
      const releves = await this.relevesDe(moi, maintenant);
      const demandees = saisie.colisIds ? new Set(saisie.colisIds) : null;
      const retenues = releves.flatMap((r) =>
        r.creances.filter((c) => demandees === null || demandees.has(c.reference)),
      );
      if (demandees) {
        const trouves = new Set(retenues.map((c) => c.reference));
        const absents = [...demandees].filter((id) => !trouves.has(id));
        if (absents.length > 0) {
          throw erreur(
            422,
            "colis_hors_releve",
            "Ces opérations ne figurent pas dans votre relevé",
            {
              colisIds: absents,
            },
          );
        }
      } else if (retenues.length === 0) {
        throw erreur(422, "releve_vide", "Votre relevé de la semaine est vide : rien à contester");
      }
      cles = retenues.map((c) => c.cle);
      conventionIds = [...new Set(retenues.map((c) => c.conventionId))];
    }

    const numero = await this.compteurs.prochain(`CTX-${jour}`);
    const contestation: ContestationStockee = {
      reference: `CTX-${jour}-${numero}`,
      conventionIds,
      compagnieId: moi,
      personneId: utilisateur.id,
      motif: saisie.motif,
      cles,
      deposeeLe: maintenant,
      recevable,
      statut: recevable ? "ouverte" : "irrecevable",
      resolueLe: null,
      resoluePar: null,
    };
    if (!(await this.contestations.ajouter(contestation))) {
      throw erreur(409, "reference_prise", "Référence de contestation déjà prise, réessayez");
    }
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: moi },
      action: "inter_agences.contestation",
      resultat: recevable ? "succes" : "refus",
      cible: { type: "contestation", id: contestation.reference },
      details: { operations: cles.length, recevable },
    });
    if (recevable) {
      const mienne = await this.annuaire.trouver(moi);
      for (const id of conventionIds) {
        const convention = await this.conventions.repo.trouver(id);
        if (!convention) continue;
        await this.patrons.prevenirPatrons(
          autreCompagnie(convention, moi),
          SMS.contestation(mienne?.nom ?? "Une compagnie", contestation.reference),
        );
      }
    }
    return contestation;
  }

  /** La décision d'AfriMove : accordée (les opérations sont écartées) ou rejetée (elles reviennent au règlement). */
  async resoudre(
    utilisateur: Utilisateur,
    reference: string,
    issue: "accordee" | "rejetee",
  ): Promise<ContestationStockee> {
    const lue = await this.contestations.trouver(reference);
    if (!lue) throw erreur(404, "contestation_introuvable", "Contestation introuvable");
    if (lue.statut !== "ouverte") {
      throw erreur(409, "deja_resolue", "Cette contestation est déjà résolue ou irrecevable");
    }
    const resolue: ContestationStockee = {
      ...lue,
      statut: issue,
      resolueLe: this.maintenant(),
      resoluePar: utilisateur.id,
    };
    if (!(await this.contestations.remplacer(resolue, "ouverte"))) {
      throw erreur(409, "deja_resolue", "Cette contestation vient d'être résolue");
    }
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: "inter_agences.contestation_resolue",
      resultat: "succes",
      cible: { type: "contestation", id: reference },
      details: { issue },
    });
    return resolue;
  }

  /* -------------------------------------------------------------- règlement du lundi */

  /**
   * Arrête et paie les règlements échus (lundi 08:00). Idempotent : un règlement par convention et par lundi,
   * une opération réglée une seule fois, le paiement rejoué avec la même clé. Renvoie le nombre de règlements
   * arrêtés et de paiements aboutis.
   */
  async executer(): Promise<{ arretes: number; payes: number }> {
    const maintenant = this.maintenant();
    let arretes = 0;
    let payes = 0;
    for (const convention of await this.conventions.repo.toutes()) {
      if (!convention.activeLe) continue;
      for (const periode of periodesEchues(convention.activeLe, maintenant)) {
        const cle = `${convention.id}:${periode.lundi}`;
        let reglement = await this.reglements.trouver(cle);
        if (!reglement) {
          const { libres } = await this.enAttente(convention.id);
          const dues = libres.filter((c) => enMs(c.acquiseLe) < enMs(periode.gelLe));
          if (convention.statut === "resiliee" && dues.length === 0) continue;
          const nouveau = this.arreter(convention, periode, dues);
          if (await this.reglements.ajouter(nouveau)) arretes += 1;
          reglement = (await this.reglements.trouver(cle)) ?? nouveau;
        }
        if (reglement.etat === "a_payer" && (await this.payer(reglement))) payes += 1;
      }
    }
    return { arretes, payes };
  }

  /** Le solde net de la période : la compagnie qui doit le plus paie la différence à l'autre. */
  private arreter(
    convention: ConventionStockee,
    periode: Periode,
    dues: Creance[],
  ): ReglementStocke {
    const duParA = dues
      .filter((c) => c.debiteurId === convention.compagnieA)
      .reduce((s, c) => s + c.montant, 0);
    const duParB = dues
      .filter((c) => c.debiteurId === convention.compagnieB)
      .reduce((s, c) => s + c.montant, 0);
    const ecart = duParA - duParB;
    return {
      cle: `${convention.id}:${periode.lundi}`,
      conventionId: convention.id,
      paiementLe: periode.paiementLe,
      gelLe: periode.gelLe,
      lignes: dues,
      debiteurId: ecart === 0 ? null : ecart > 0 ? convention.compagnieA : convention.compagnieB,
      creancierId: ecart === 0 ? null : ecart > 0 ? convention.compagnieB : convention.compagnieA,
      montant: Math.abs(ecart),
      etat: ecart === 0 ? "sans_solde" : "a_payer",
      reference: null,
      payeLe: null,
      erreur: null,
    };
  }

  private async payer(reglement: ReglementStocke): Promise<boolean> {
    const [debiteur, creancier] = await Promise.all([
      reglement.debiteurId ? this.annuaire.trouver(reglement.debiteurId) : null,
      reglement.creancierId ? this.annuaire.trouver(reglement.creancierId) : null,
    ]);
    if (!debiteur || !creancier) return false;
    if (!debiteur.momo || !creancier.momo) {
      await this.noterEchec(reglement, "compte_momo_manquant");
      return false;
    }
    let reference: string;
    try {
      ({ reference } = await this.mobile.regler({
        cle: reglement.cle,
        debiteur: { compagnieId: debiteur.id, momo: debiteur.momo },
        creancier: { compagnieId: creancier.id, momo: creancier.momo },
        montant: reglement.montant,
        libelle: `Règlement entre compagnies du ${reglement.paiementLe.slice(0, 10)}`,
      }));
    } catch (e) {
      const refus = e instanceof ReglementRefuse;
      if (!refus)
        this.logger.warn(`Règlement ${reglement.cle} : résultat inconnu (${(e as Error).name})`);
      await this.noterEchec(reglement, refus ? "refuse" : "inconnu");
      return false;
    }
    const paye: ReglementStocke = {
      ...reglement,
      etat: "paye",
      reference,
      payeLe: this.maintenant(),
      erreur: null,
    };
    if (!(await this.reglements.remplacer(paye, "a_payer"))) return false;
    await this.audit.enregistrer({
      acteur: null,
      action: "inter_agences.reglement_paye",
      resultat: "succes",
      cible: { type: "reglement", id: reglement.cle },
      details: { montant: reglement.montant, operations: reglement.lignes.length },
    });
    await this.prevenirDuReglement(paye, debiteur, creancier);
    return true;
  }

  private async noterEchec(reglement: ReglementStocke, motif: string): Promise<void> {
    if (reglement.erreur === motif) return;
    await this.reglements.remplacer({ ...reglement, erreur: motif }, "a_payer");
  }

  private async prevenirDuReglement(
    r: ReglementStocke,
    debiteur: CompagnieRef,
    creancier: CompagnieRef,
  ): Promise<void> {
    await this.patrons.prevenirPatrons(
      creancier.id,
      SMS.reglement(r.montant, debiteur.nom, "recu"),
    );
    await this.patrons.prevenirPatrons(
      debiteur.id,
      SMS.reglement(r.montant, creancier.nom, "verse"),
    );
  }

  /* -------------------------------------------------------------- bilan du trimestre */

  /** Les chiffres du trimestre civil en cours pour la convention, vus par la compagnie `moi`. */
  async bilan(
    convention: ConventionStockee,
    moi: string,
    instant = this.maintenant(),
  ): Promise<BilanTrimestre> {
    const { annee, numero } = trimestreDe(instant);
    const dans = (iso: string): boolean => {
      const t = trimestreDe(iso);
      return t.annee === annee && t.numero === numero;
    };
    const [plans, contestations, arretes] = await Promise.all([
      this.colis.lister({ conventionId: convention.id }),
      this.contestations.lister({ conventionId: convention.id }),
      this.reglements.lister(convention.id),
    ]);
    const colisEchanges = plans.filter((p) =>
      p.transferts.some((t) => t.recu !== null && dans(t.recu.a)),
    ).length;

    const litiges = contestations.filter((c) => c.statut !== "irrecevable" && dans(c.deposeeLe));
    const resolus = litiges.filter((c) => c.resolueLe !== null);
    const dernier = [...resolus].sort((a, b) => enMs(b.resolueLe!) - enMs(a.resolueLe!))[0];
    const delaiLitigeJours =
      litiges.some((c) => c.statut === "ouverte") || !dernier
        ? null
        : Math.max(
            1,
            Math.ceil((enMs(dernier.resolueLe!) - enMs(dernier.deposeeLe)) / MS_PAR_JOUR),
          );

    const dusAuTrimestre = arretes.filter(
      (r) => dans(r.paiementLe) && r.lignes.length > 0 && r.etat !== "a_payer",
    );
    const netRecu = dusAuTrimestre.reduce(
      (s, r) =>
        r.etat !== "paye"
          ? s
          : r.creancierId === moi
            ? s + r.montant
            : r.debiteurId === moi
              ? s - r.montant
              : s,
      0,
    );
    return {
      colisEchanges,
      litiges: litiges.length,
      delaiLitigeJours,
      netRecu,
      lundis: dusAuTrimestre.length,
    };
  }
}
