/**
 * Données du financement telles que le module les stocke. Les formes envoyées aux écrans
 * (`OffreFinancement`, `DossierFinancement`, `PaieLancee` de `@afrimove/contrats`) sont fabriquées
 * par `vues.ts` à partir de celles-ci. Tous les instants sont des ISO à Douala (`+01:00`).
 */

export type OperateurMobile = "mtn" | "orange";

/* ------------------------------------------------------------------ dossier d'avance */

export type StatutDossier = "envoye" | "en_analyse" | "verse" | "refuse" | "retire";

/** Statuts d'un dossier qui occupe encore la place : une agence n'en a qu'un à la fois. */
export const STATUTS_OUVERTS: readonly StatutDossier[] = ["envoye", "en_analyse", "verse"];

export interface ConditionsAvance {
  /** Part des ventes MoMo prélevée pour rembourser, en %. */
  remboursementPctVentesMomo: number;
  dureeEstimeeSemaines: number;
  /** Coût total en % : fixé par le partenaire, `null` tant qu'il n'a pas répondu. */
  coutTotalPct: number | null;
}

/** Une pièce jointe, figée à l'envoi : ce que le partenaire a reçu est ce que le patron voit. */
export interface PieceStockee {
  code: "ventes" | "releves_momo" | "registre" | "mandat";
  nom: string;
  detail: string;
  format: "pdf" | "csv";
}

/** Mandat de prélèvement signé par le PIN du patron : il n'autorise que le partenaire, sur ce compte. */
export interface MandatPrelevement {
  pourcentage: number;
  signeA: string;
  signePar: string;
  /** Référence du compte marchand MoMo de l'agence (jamais le numéro). */
  compteMarchandId: string;
  operateur: OperateurMobile;
  /** Faux une fois la dette soldée (révocable à solde zéro) : plus aucun prélèvement. */
  actif: boolean;
}

export interface DossierStocke {
  /** `AV-2027-0041`. */
  id: string;
  /** Concurrence optimiste : `remplacer(dossier, versionAttendue)`. */
  version: number;
  agenceId: string;
  demandePar: string;
  /** Montant demandé ; devient le montant versé si le partenaire en verse moins. */
  montant: number;
  statut: StatutDossier;
  partenaire: string | null;
  /** Référence chez le partenaire, donnée à l'accusé de réception. */
  referencePartenaire: string | null;
  conditions: ConditionsAvance;
  envoyeA: string;
  reponseAvant: string;
  /** Accusé de réception du partenaire. */
  accuseA: string | null;
  decisionA: string | null;
  verseA: string | null;
  retireA: string | null;
  motifRefus: string | null;
  pieces: PieceStockee[];
  mandat: MandatPrelevement;
  /** Total à rembourser (montant versé + coût), fixé au versement. */
  resteDu: number | null;
  rembourseA: string | null;
}

/* ------------------------------------------------------------------ prélèvements */

export interface Prelevement {
  /** Clé d'idempotence : `prelevement:<venteId>`. */
  cle: string;
  dossierId: string;
  agenceId: string;
  venteId: string;
  /** Montant de la vente MoMo sur laquelle le pourcentage est pris. */
  montantVente: number;
  montant: number;
  at: string;
  etat: "en_attente" | "execute";
  /** Référence de l'opération chez le partenaire, une fois exécuté. */
  reference: string | null;
}

/* ------------------------------------------------------------------ paie */

export interface LignePaie {
  personneId: string;
  nom: string;
  montant: number;
  operateur: OperateurMobile | null;
  /** Numéro MoMo en clair en mémoire ; chiffré par `ChiffrementService` dans l'adaptateur PostgreSQL. */
  telephone: string | null;
  etat: "en_attente" | "verse" | "refuse";
  /** Numéro de l'essai : une nouvelle clé est utilisée après un refus définitif. */
  tentative: number;
  reference: string | null;
  motif: string | null;
}

export interface LotPaie {
  id: string;
  version: number;
  agenceId: string;
  /** `AAAA-MM`. */
  mois: string;
  lancePar: string;
  lanceA: string;
  total: number;
  lignes: LignePaie[];
}

/* ------------------------------------------------------------------ réglages et conventions */

export interface ConventionFinancement {
  /** Nom de l'établissement financier partenaire. */
  partenaire: string;
  /** `null` tant que la convention n'est pas signée. */
  signeeA: string | null;
}

export interface ReglagesAgence {
  /** Option par agence : les voyageurs peuvent payer leur billet en 2 fois. */
  billetEnDeuxFois: boolean;
  /** Jour où les salaires sont versés, tel que l'écran l'écrit (« vendredi »). */
  jourDePaie: string;
}

export interface OffreCreditMateriel {
  description: string;
  montantTotal: number;
  mensualites: number;
  montantMensualite: number;
}

/* ------------------------------------------------------------------ données de l'agence */

/** Ce que la billetterie a certifié sur les 90 derniers jours. */
export interface VentesCertifiees {
  /** Jours couverts par l'historique (90 au plus). */
  joursCouverts: number;
  total: number;
  billets: number;
  colis: number;
  /** Part des ventes encaissée en mobile money. */
  ventesMomo: number;
}

export interface ReleveMomo {
  mois: number;
  /** Part des opérations MoMo rapprochées d'une vente, de 0 à 100. */
  correspondancePct: number;
}

export interface PiecesAgence {
  /** Registre de commerce et carte contribuable fournis à l'inscription, valides à ce jour. */
  registreEtCarteValides: boolean;
}

export interface CompteMarchand {
  id: string;
  operateur: OperateurMobile;
}

export interface Salaire {
  personneId: string;
  nom: string;
  /** Calculé sur les trajets et les primes du mois. */
  montant: number;
  compte: { operateur: OperateurMobile; telephone: string } | null;
}

/* ------------------------------------------------------------------ partenaire financier */

/** Ce que le partenaire reçoit à la création du dossier. */
export interface DossierTransmis {
  dossierId: string;
  agenceId: string;
  montant: number;
  conditions: ConditionsAvance;
  pieces: PieceStockee[];
  mandat: Pick<MandatPrelevement, "pourcentage" | "signeA" | "compteMarchandId" | "operateur">;
}

export type NotificationPartenaire =
  | { type: "accuse"; reference: string; at: string }
  | {
      type: "verse";
      reference: string;
      at: string;
      /** Montant réellement versé ; absent : le montant demandé. */
      montant?: number;
      /** Coût total en % fixé par le partenaire. */
      coutTotalPct: number;
    }
  | { type: "refuse"; reference: string; at: string; motif: string };
