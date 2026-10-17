import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  CompteMarchand,
  ConventionFinancement,
  DossierStocke,
  DossierTransmis,
  LignePaie,
  LotPaie,
  NotificationPartenaire,
  OffreCreditMateriel,
  PiecesAgence,
  Prelevement,
  ReglagesAgence,
  ReleveMomo,
  Salaire,
  VentesCertifiees,
} from "./modele";
import { STATUTS_OUVERTS } from "./modele";
import {
  ConventionsFinancement,
  DonneesAgence,
  DossiersFinancement,
  LotsPaie,
  NotificationInvalide,
  OffresCredit,
  PartenaireFinancier,
  PrelevementRefuse,
  Prelevements,
  ReglagesFinancement,
  SalairesAgence,
  VersementRefuse,
  VersementsPaie,
  type DemandeVersementPaie,
  type IssueRetrait,
  type RequeteNotification,
  type ResultatAjoutDossier,
  type ResultatReservationPrelevement,
  type Volatil,
} from "./ports";
import { JOUR_DE_PAIE_PAR_DEFAUT } from "./regles";
import { versIsoDouala } from "./temps";
import { lireNotificationJson } from "./validation";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `FinancementModule` refuse de démarrer en production avec elles (`durable = false`).
 * Les lignes sont copiées à l'entrée et à la sortie, comme une base.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

/* ------------------------------------------------------------------ dossiers */

const estOuvert = (d: DossierStocke): boolean =>
  (STATUTS_OUVERTS as readonly string[]).includes(d.statut) &&
  (d.statut !== "verse" || d.mandat.actif);

@Injectable()
export class DossiersMemoire extends DossiersFinancement implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, DossierStocke>();
  private readonly compteurs = new Map<number, number>();

  async ajouter(dossier: DossierStocke): Promise<ResultatAjoutDossier> {
    if (this.lignes.has(dossier.id)) return "numero_pris";
    for (const d of this.lignes.values()) {
      if (d.agenceId === dossier.agenceId && estOuvert(d)) return "demande_en_cours";
    }
    this.lignes.set(dossier.id, copie({ ...dossier, version: 1 }));
    return "ajoute";
  }

  async trouver(agenceId: string, id: string) {
    const d = this.lignes.get(id);
    return d && d.agenceId === agenceId ? copie(d) : null;
  }

  async parReference(referencePartenaire: string) {
    for (const d of this.lignes.values()) {
      if (d.referencePartenaire === referencePartenaire) return copie(d);
    }
    return null;
  }

  async ouvert(agenceId: string) {
    for (const d of this.lignes.values()) {
      if (d.agenceId === agenceId && estOuvert(d)) return copie(d);
    }
    return null;
  }

  async aPrelever(agenceId: string) {
    for (const d of this.lignes.values()) {
      if (d.agenceId === agenceId && d.statut === "verse" && d.mandat.actif) return copie(d);
    }
    return null;
  }

  async remplacer(dossier: DossierStocke, versionAttendue: number) {
    const actuel = this.lignes.get(dossier.id);
    if (!actuel || actuel.version !== versionAttendue) return false;
    this.lignes.set(
      dossier.id,
      copie({
        ...dossier,
        agenceId: actuel.agenceId,
        demandePar: actuel.demandePar,
        version: versionAttendue + 1,
      }),
    );
    return true;
  }

  async nonTransmis() {
    return [...this.lignes.values()]
      .filter((d) => d.statut === "envoye" && d.accuseA === null)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copie);
  }

  async enAnalyse() {
    return [...this.lignes.values()]
      .filter((d) => d.statut === "en_analyse")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copie);
  }

  async prochainNumero(annee: number) {
    const suivant = (this.compteurs.get(annee) ?? 0) + 1;
    this.compteurs.set(annee, suivant);
    return suivant;
  }
}

/* ------------------------------------------------------------------ prélèvements */

@Injectable()
export class PrelevementsMemoire extends Prelevements implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, Prelevement>();

  async reserver(
    demande: Parameters<Prelevements["reserver"]>[0],
  ): Promise<ResultatReservationPrelevement> {
    if (this.lignes.has(demande.cle)) return { resultat: "existe" };
    // Sans `await` entre la lecture et l'écriture : comme une transaction, aucune autre demande ne s'intercale.
    const reste = demande.totalDu - this.total(demande.dossierId);
    if (reste <= 0) return { resultat: "solde_nul" };
    const prelevement: Prelevement = {
      cle: demande.cle,
      dossierId: demande.dossierId,
      agenceId: demande.agenceId,
      venteId: demande.venteId,
      montantVente: demande.montantVente,
      montant: Math.min(demande.souhaite, reste),
      at: demande.at,
      etat: "en_attente",
      reference: null,
    };
    this.lignes.set(prelevement.cle, copie(prelevement));
    return { resultat: "reserve", prelevement };
  }

  async confirmer(cle: string, reference: string) {
    const p = this.lignes.get(cle);
    if (p) this.lignes.set(cle, { ...p, etat: "execute", reference });
  }

  async annuler(cle: string) {
    const p = this.lignes.get(cle);
    if (p && p.etat === "en_attente") this.lignes.delete(cle);
  }

  async enAttente() {
    return [...this.lignes.values()].filter((p) => p.etat === "en_attente").map(copie);
  }

  private total(dossierId: string): number {
    let total = 0;
    for (const p of this.lignes.values()) if (p.dossierId === dossierId) total += p.montant;
    return total;
  }

  async totalReserve(dossierId: string) {
    return this.total(dossierId);
  }

  async totalExecute(dossierId: string) {
    let total = 0;
    for (const p of this.lignes.values()) {
      if (p.dossierId === dossierId && p.etat === "execute") total += p.montant;
    }
    return total;
  }
}

/* ------------------------------------------------------------------ paie */

@Injectable()
export class LotsPaieMemoire extends LotsPaie implements Volatil {
  readonly durable = false as const;
  readonly lots = new Map<string, LotPaie>();

  async creer(lot: LotPaie) {
    for (const l of this.lots.values()) {
      if (l.agenceId === lot.agenceId && l.mois === lot.mois) return false;
    }
    this.lots.set(lot.id, copie({ ...lot, version: 1 }));
    return true;
  }

  async trouver(agenceId: string, mois: string) {
    for (const l of this.lots.values()) {
      if (l.agenceId === agenceId && l.mois === mois) return copie(l);
    }
    return null;
  }

  async marquerLigne(
    lotId: string,
    personneId: string,
    modif: Partial<
      Pick<LignePaie, "etat" | "reference" | "motif" | "tentative" | "operateur" | "telephone">
    >,
    depuisEtat?: LignePaie["etat"],
  ) {
    const ligne = this.lots.get(lotId)?.lignes.find((l) => l.personneId === personneId);
    if (!ligne || (depuisEtat !== undefined && ligne.etat !== depuisEtat)) return false;
    Object.assign(ligne, modif);
    return true;
  }

  async incomplets() {
    return [...this.lots.values()]
      .filter((l) => l.lignes.some((x) => x.etat === "en_attente"))
      .map(copie);
  }
}

@Injectable()
export class SalairesMemoire extends SalairesAgence implements Volatil {
  readonly durable = false as const;
  readonly parAgence = new Map<string, Salaire[]>();

  async calculer(agenceId: string, _mois: string) {
    return copie(this.parAgence.get(agenceId) ?? []);
  }
}

/** Opérateur simulé : garde les ordres reçus ; `refuser` et `panne` règlent les cas d'erreur. */
@Injectable()
export class VersementsPaieMemoire extends VersementsPaie implements Volatil {
  readonly durable = false as const;
  readonly ordres = new Map<string, DemandeVersementPaie & { reference: string }>();
  /** Téléphones que l'opérateur refuse pour de bon. */
  readonly refuses = new Set<string>();
  /** Vrai : l'opérateur ne répond pas (résultat inconnu). */
  panne = false;
  /** Nombre d'appels, rejeux compris. */
  appels = 0;

  async verser(demande: DemandeVersementPaie) {
    this.appels += 1;
    if (this.panne) throw new Error("opérateur injoignable");
    const connu = this.ordres.get(demande.cle);
    if (connu) return { reference: connu.reference };
    if (this.refuses.has(demande.telephone)) throw new VersementRefuse("numéro inconnu");
    const reference = `MOMO-${randomUUID().slice(0, 8)}`;
    this.ordres.set(demande.cle, { ...demande, reference });
    return { reference };
  }
}

/* ------------------------------------------------------------------ partenaire */

export const SECRET_PARTENAIRE_TEST = "secret-partenaire-test";
export const ENTETE_SECRET_PARTENAIRE = "x-partenaire-secret";

/** Partenaire simulé : il répond comme un vrai (accusé, retrait, prélèvement) et se règle depuis les tests. */
@Injectable()
export class PartenaireSimule extends PartenaireFinancier implements Volatil {
  readonly durable = false as const;
  readonly recus = new Map<string, DossierTransmis & { reference: string }>();
  readonly retires = new Set<string>();
  readonly prelevements = new Map<string, { reference: string; montant: number }>();
  /** Décision du partenaire pour une référence (ce que `etat` répond). */
  readonly decisions = new Map<string, NotificationPartenaire>();
  /** Vrai : le partenaire ne répond pas. */
  panne = false;
  /** Références pour lesquelles `retirer` répond « déjà versé » ou « déjà refusé ». */
  readonly dejaVerses = new Set<string>();
  readonly dejaRefuses = new Set<string>();
  /** Vrai : le partenaire refuse tout prélèvement pour de bon. */
  prelevementRefuse = false;
  /** Nombre d'appels à `transmettre`, rejeux compris. */
  transmissions = 0;

  async transmettre(dossier: DossierTransmis) {
    this.transmissions += 1;
    if (this.panne) throw new Error("partenaire injoignable");
    const connu = this.recus.get(dossier.dossierId);
    if (connu) return { reference: connu.reference, accuseA: versIsoDouala(new Date()) };
    const reference = `PART-${dossier.dossierId}`;
    this.recus.set(dossier.dossierId, { ...copie(dossier), reference });
    return { reference, accuseA: versIsoDouala(new Date()) };
  }

  async retirer(reference: string): Promise<IssueRetrait> {
    if (this.panne) throw new Error("partenaire injoignable");
    if (this.dejaVerses.has(reference)) return "deja_verse";
    if (this.dejaRefuses.has(reference)) return "deja_refuse";
    this.retires.add(reference);
    return "retire";
  }

  async etat(reference: string) {
    if (this.panne) throw new Error("partenaire injoignable");
    return this.decisions.get(reference) ?? null;
  }

  async prelever(ordre: { cle: string; reference: string; montant: number; venteId: string }) {
    if (this.panne) throw new Error("partenaire injoignable");
    if (this.prelevementRefuse) throw new PrelevementRefuse("mandat révoqué");
    const connu = this.prelevements.get(ordre.cle);
    if (connu) return { reference: connu.reference };
    const reference = `PREL-${randomUUID().slice(0, 8)}`;
    this.prelevements.set(ordre.cle, { reference, montant: ordre.montant });
    return { reference };
  }

  async lireNotification(requete: RequeteNotification): Promise<NotificationPartenaire> {
    if (requete.entetes[ENTETE_SECRET_PARTENAIRE] !== SECRET_PARTENAIRE_TEST) {
      throw new NotificationInvalide("authentification", "Appel non authentifié");
    }
    let brut: unknown;
    try {
      brut = JSON.parse(requete.corpsBrut ?? "");
    } catch {
      throw new NotificationInvalide("format", "Notification illisible");
    }
    const notification = lireNotificationJson(brut);
    if (!notification) throw new NotificationInvalide("format", "Notification illisible");
    return notification;
  }
}

/* ------------------------------------------------------------------ données de l'agence */

@Injectable()
export class DonneesAgenceMemoire extends DonneesAgence implements Volatil {
  readonly durable = false as const;
  readonly ventesParAgence = new Map<string, VentesCertifiees>();
  readonly releves = new Map<string, ReleveMomo>();
  readonly piecesParAgence = new Map<string, PiecesAgence>();
  readonly comptes = new Map<string, CompteMarchand>();
  readonly prix = new Map<string, number>();

  async ventes(agenceId: string, _jusqua: string): Promise<VentesCertifiees> {
    return (
      this.ventesParAgence.get(agenceId) ?? {
        joursCouverts: 0,
        total: 0,
        billets: 0,
        colis: 0,
        ventesMomo: 0,
      }
    );
  }

  async releveMomo(agenceId: string, _jusqua: string): Promise<ReleveMomo> {
    return this.releves.get(agenceId) ?? { mois: 3, correspondancePct: 0 };
  }

  async pieces(agenceId: string): Promise<PiecesAgence> {
    return this.piecesParAgence.get(agenceId) ?? { registreEtCarteValides: false };
  }

  async compteMarchand(agenceId: string) {
    return this.comptes.get(agenceId) ?? null;
  }

  async prixBilletExemple(agenceId: string) {
    return this.prix.get(agenceId) ?? null;
  }
}

@Injectable()
export class ConventionsMemoire extends ConventionsFinancement implements Volatil {
  readonly durable = false as const;
  readonly conventions = new Map<string, ConventionFinancement>();

  async pour(agenceId: string) {
    return this.conventions.get(agenceId) ?? null;
  }
}

@Injectable()
export class OffresCreditMemoire extends OffresCredit implements Volatil {
  readonly durable = false as const;
  readonly offres = new Map<string, OffreCreditMateriel>();

  async pour(agenceId: string) {
    return this.offres.get(agenceId) ?? null;
  }
}

@Injectable()
export class ReglagesMemoire extends ReglagesFinancement implements Volatil {
  readonly durable = false as const;
  readonly reglages = new Map<string, ReglagesAgence>();

  async lire(agenceId: string): Promise<ReglagesAgence> {
    return (
      this.reglages.get(agenceId) ?? {
        billetEnDeuxFois: false,
        jourDePaie: JOUR_DE_PAIE_PAR_DEFAUT,
      }
    );
  }

  async definirBilletEnDeuxFois(agenceId: string, actif: boolean) {
    this.reglages.set(agenceId, { ...(await this.lire(agenceId)), billetEnDeuxFois: actif });
  }
}
