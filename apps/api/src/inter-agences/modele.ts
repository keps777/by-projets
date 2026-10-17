/**
 * Modèle de données du module inter-agences : ce que les ports de persistance gardent. Les montants
 * sont des entiers en FCFA, les instants des chaînes ISO de Douala (`+01:00`).
 */

export type StatutConvention = "proposee" | "active" | "suspendue" | "resiliee";
export type Renouvellement = "trimestriel" | "annuel";

/** Une ligne du tableau des parts : le montant de chaque compagnie (`null` : pas de part sur la ligne). */
export interface LigneParts {
  troncon: string;
  /** Clé : identifiant de la compagnie. */
  parts: Record<string, number | null>;
}

export interface PartsConvention {
  /** Le colis de référence : 3 kg à 3 000 F. */
  colisType: { poidsKg: number; prix: number };
  lignes: LigneParts[];
}

/** Un billet voyageur en correspondance proposé par la convention : « Yaoundé → Bamenda via Bafoussam ». */
export interface LigneVoyageurs {
  origine: string;
  via: string;
  destination: string;
  /** La compagnie qui conduit le voyageur de l'origine à la ville de correspondance ; l'autre prend la suite. */
  premiere: string;
  /** Part de chaque compagnie dans le prix du billet. */
  parts: Record<string, number>;
}

export interface VoyageursConvention {
  garantieMinutes: number;
  attenteMinutes: number;
  lignes: LigneVoyageurs[];
}

export interface SignatureConvention {
  compagnieId: string;
  personneId: string;
  signeLe: string;
}

export interface ConventionStockee {
  id: string;
  /** Concurrence optimiste : chaque écriture exige la version lue. */
  version: number;
  /** La compagnie qui propose (première signature) et celle qui accepte. */
  compagnieA: string;
  compagnieB: string;
  statut: StatutConvention;
  renouvellement: Renouvellement;
  parts: PartsConvention;
  voyageurs: VoyageursConvention;
  proposeeLe: string;
  signatures: SignatureConvention[];
  /** Entrée en vigueur : la signature du second patron. */
  activeLe: string | null;
  /** Sortie : qui la demande, quand, et quand elle prend effet (préavis de 30 jours). */
  denonciation: { par: string; le: string; effetLe: string } | null;
}

/* ------------------------------------------------------------------ colis */

export interface TronconPlan {
  rang: number;
  compagnieId: string;
  departId: string;
  origine: string;
  destination: string;
  heureDepart: string;
  heureArrivee: string;
  bus: string;
  /** Part de la compagnie sur ce tronçon, fixée à l'enregistrement. */
  part: number;
}

export interface ScanTransfertStocke {
  a: string;
  par: string;
  lieu: string | null;
}

/** Le passage de témoin entre le tronçon `rang` et le suivant : « remis à » puis « reçu ». */
export interface TransfertPlan {
  rang: number;
  cedantId: string;
  preneurId: string;
  remis: ScanTransfertStocke | null;
  recu: ScanTransfertStocke | null;
}

export interface ColisInterAgencesStocke {
  colisId: string;
  version: number;
  numero: string;
  conventionId: string;
  /** La compagnie qui a vendu le colis et encaissé le prix : elle doit leur part aux autres. */
  emettriceId: string;
  /** Le port payé par le client, base du partage. */
  prix: number;
  troncons: TronconPlan[];
  transferts: TransfertPlan[];
  creeLe: string;
  creePar: string;
}

/* ------------------------------------------------------------------ billets */

export type EtatTronconBillet = "prevu" | "embarque" | "replace";

export interface TronconBillet extends TronconPlan {
  etat: EtatTronconBillet;
  embarqueLe: string | null;
}

export interface ReplacementBillet {
  decideLe: string;
  /** Le départ suivant de la seconde compagnie, où le voyageur est replacé gratuitement. */
  departId: string;
  heureDepart: string;
  bus: string;
  /** Le retardataire, qui paie le siège perdu à la seconde compagnie. */
  retardataireId: string;
  montant: number;
}

export interface BilletCorrespondanceStocke {
  id: string;
  version: number;
  /** Le numéro du billet vendu : un seul pour tous les tronçons. */
  numero: string;
  conventionId: string;
  emettriceId: string;
  voyageur: { nom: string; telephone: string };
  prix: number;
  troncons: TronconBillet[];
  /** Arrivée réelle du premier bus, une fois constatée. */
  arriveePremierBus: { a: string; par: string; retardMinutes: number } | null;
  replacement: ReplacementBillet | null;
  creeLe: string;
  creePar: string;
}

/* ------------------------------------------------------------------ règlements */

export type TypeCreance = "colis" | "billet" | "replacement";

/** Ce qu'une compagnie doit à une autre pour une opération prouvée par un scan. */
export interface Creance {
  /** `colis:<id>`, `billet:<id>`, `replacement:<id>` : une opération ne se règle qu'une fois. */
  cle: string;
  type: TypeCreance;
  /** Identifiant du colis ou du billet : ce qu'une contestation désigne. */
  reference: string;
  numero: string;
  conventionId: string;
  debiteurId: string;
  creancierId: string;
  montant: number;
  /** L'instant du scan qui a rendu la créance certaine. */
  acquiseLe: string;
}

export type EtatReglement = "a_payer" | "paye" | "sans_solde";

export interface ReglementStocke {
  /** `<conventionId>:<AAMMJJ du lundi>` : un seul règlement par convention et par lundi. */
  cle: string;
  conventionId: string;
  paiementLe: string;
  /** Les scans de la période sont gelés au dimanche 20:00. */
  gelLe: string;
  lignes: Creance[];
  /** Qui paie : `null` quand le solde est nul. */
  debiteurId: string | null;
  creancierId: string | null;
  montant: number;
  etat: EtatReglement;
  reference: string | null;
  payeLe: string | null;
  /** Dernier échec d'envoi connu (sans donnée sensible). */
  erreur: string | null;
}

export type StatutContestation = "ouverte" | "accordee" | "rejetee" | "irrecevable";

export interface ContestationStockee {
  reference: string;
  /** Les conventions dont des opérations sont contestées. */
  conventionIds: string[];
  compagnieId: string;
  personneId: string;
  motif: string;
  /** Les opérations contestées (`Creance.cle`), figées au dépôt. */
  cles: string[];
  deposeeLe: string;
  recevable: boolean;
  statut: StatutContestation;
  resolueLe: string | null;
  resoluePar: string | null;
}

export interface InvitationStockee {
  reference: string;
  /** `<compagnieId>:<téléphone>:<AAMMJJ>` : la même invitation du jour n'est envoyée qu'une fois. */
  cle: string;
  compagnieId: string;
  personneId: string;
  nomCompagnie: string;
  telephone: string;
  envoyeeLe: string;
}

/* ------------------------------------------------------------------ annuaires */

export interface MomoCompagnie {
  telephone: string;
  operateur: "mtn" | "orange";
}

export interface CompagnieRef {
  id: string;
  /** Le nom court affiché dans les tableaux (« Alpha », « Oméga »). */
  nom: string;
  /** Le compte qui paie et reçoit le solde net ; `null` tant que la compagnie n'en a pas déclaré. */
  momo: MomoCompagnie | null;
}

export interface DepartInterAgences {
  id: string;
  compagnieId: string;
  origine: string;
  destination: string;
  heureDepart: string;
  arriveePrevue: string;
  bus: string;
}

export interface BilletEmis {
  id: string;
  numero: string;
  compagnieId: string;
  departId: string;
  voyageur: { nom: string; telephone: string };
  prix: number;
  annule: boolean;
}
