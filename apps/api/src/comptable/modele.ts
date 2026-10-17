/**
 * Vocabulaire du module comptable (AM-114) : ce que le module lit chez les autres (ventes, sessions de
 * caisse, annulations, relevés des opérateurs) et ce qu'il écrit (décisions de rapprochement, clôtures,
 * envois au cabinet). Aucune dépendance à Nest ici : ces types servent aux ports, aux règles et aux tests.
 * Les montants sont des entiers de FCFA, les instants des ISO Douala (`+01:00`).
 */

export const IDS_EXPORT = [
  "journal_ventes",
  "journal_caisse",
  "annulations",
  "ecritures_syscohada",
  "factures_afrimove",
] as const;
export type IdExport = (typeof IDS_EXPORT)[number];

export type FormatExport = "XLSX" | "CSV" | "PDF";

export function estIdExport(valeur: unknown): valeur is IdExport {
  return typeof valeur === "string" && (IDS_EXPORT as readonly string[]).includes(valeur);
}

/* ------------------------------------------------------------------ ce que le module lit */

export type OperateurMomo = "mtn" | "orange";

/** Comment une vente a été payée. `carte` passe par l'agrégateur (AM-165). */
export type MoyenEncaissement = "cash" | OperateurMomo | "carte";

/** Une ligne du journal des ventes : un billet ou un colis vendu. */
export interface VenteComptable {
  id: string;
  genre: "billet" | "colis";
  /** Numéro du billet (AGENCE-GARE-AAMMJJ-NNNN) ou du colis (C-GARE-AAMMJJ-NNNN). */
  numero: string;
  /** Instant de la vente. */
  at: string;
  /** Code de la ligne (« DLA-YDE »), « COLIS » pour un colis. */
  ligne: string;
  /** Heure de départ `HH:MM`, nulle pour un colis sans départ. */
  depart: string | null;
  siege: string | null;
  /** « CLASSIQUE », « VIP », « 3 kg »… */
  classe: string;
  /** Prix encaissé pour l'agence (hors frais de service d'AfriMove). */
  prix: number;
  moyen: MoyenEncaissement;
  /** Code du guichet (« GU1 ») ou du canal en ligne (« APP », « USSD », « WHATSAPP »). */
  guichet: string;
  /** Initiales de l'agent qui a vendu (« JM »), nulles pour une vente en ligne. */
  agent: string | null;
  sessionId: string | null;
  /** Référence de la transaction chez l'opérateur (paiement mobile ou carte). */
  referenceOperateur: string | null;
  /** Instant où la vente a été annulée (billet annulé), nul si elle tient toujours. */
  annuleeA: string | null;
}

/** Une session de caisse d'un guichet (ouverture, clôture, validation du superviseur). */
export interface SessionComptable {
  id: string;
  /** K-GARE-AAMMJJ-GUICHET-N */
  numero: string;
  guichet: string;
  agent: string;
  ouverteA: string;
  clotureeA: string | null;
  fond: number;
  cashAttendu: number | null;
  cashCompte: number | null;
  /** Compté moins attendu : négatif quand il manque de l'argent. */
  ecart: number | null;
  validePar: string | null;
  validation: "pin" | "empreinte" | null;
}

export type DecisionAnnulation = "rembourser" | "reporter" | "avoir" | "refuser";

/** Une demande d'annulation décidée par un superviseur (table `demande_annulation`). */
export interface AnnulationComptable {
  id: string;
  /** Instant de la décision. */
  at: string;
  numero: string;
  genre: "billet" | "colis";
  montant: number;
  decision: DecisionAnnulation;
  motif: string;
  demandePar: string;
  validePar: string;
  validation: "pin" | "empreinte" | null;
  /** Instant de la vente annulée : une annulation d'un mois clos ne le rouvre pas, elle s'écrit dans le mois courant. */
  venteAt: string;
  /** Comment le client a payé : dit sur quel compte l'argent est rendu. */
  moyen: MoyenEncaissement;
}

/** Une ligne du relevé de l'opérateur : de l'argent reçu sur le compte marchand de l'agence. */
export interface LigneReleve {
  /** Identifiant de la transaction chez l'opérateur (« MP261203.1142.A71290 »). */
  reference: string;
  recueA: string;
  /** Numéro du payeur, en clair : masqué dès l'entrée dans le module, jamais conservé ni renvoyé. */
  telephone: string;
  operateur: OperateurMomo;
  montant: number;
}

/** Une vente proche d'une transaction, vue pour trouver sa cause probable. */
export interface VenteProche {
  numero: string;
  genre: "billet" | "colis";
  at: string;
  montant: number;
  ligne: string;
  depart: string | null;
  referenceOperateur: string | null;
  /** Vendue à un guichet (`guichet`) ou par l'app, l'USSD, WhatsApp (`en_ligne`). */
  canal: "guichet" | "en_ligne";
}

/** Un paiement en ligne resté sans réponse jusqu'à l'expiration du siège (15 minutes). */
export interface PaiementExpire {
  expireA: string;
  montant: number;
  ligne: string;
  depart: string | null;
}

/** Un colis payé à l'arrivée, sans scan de dépôt. */
export interface ColisSansDepot {
  numero: string;
  montant: number;
  relais: string | null;
}

/* ------------------------------------------------------------------ réglages du comptable */

export interface ParametresComptables {
  compagnieId: string;
  nomAgence: string;
  /** Adresse du cabinet comptable, en clair (jamais renvoyée : l'API la masque). */
  emailCabinet: string | null;
  /** Envoi automatique des exports du mois écoulé. */
  envoiAutomatique: boolean;
  /** Jour du mois de l'envoi automatique (le 2). */
  jourDEnvoi: number;
  /** Jour du mois où le mois précédent est clôturé (le 5). */
  jourDeCloture: number;
}

export const JOUR_ENVOI_PAR_DEFAUT = 2;
export const JOUR_CLOTURE_PAR_DEFAUT = 5;

/* ------------------------------------------------------------------ rapprochement */

export type ActionRapprochement = "rembourser" | "rattacher" | "demander";
export type CauseRapprochement =
  | "doublon_paiement"
  | "paiement_apres_expiration"
  | "scan_depot_manquant"
  | "inconnue";

/** Une transaction du relevé qu'aucune vente ne porte, avec sa cause probable. */
export interface TransactionRapprochee {
  reference: string;
  recueA: string;
  telephoneMasque: string;
  operateur: OperateurMomo;
  montant: number;
  cause: CauseRapprochement;
  explication: string;
  actionProposee: ActionRapprochement;
  cibleSuggeree: string | null;
}

/** Le résultat du rapprochement d'un mois, avant les décisions. */
export interface ResultatRapprochement {
  /** Lignes du relevé reçues dans le mois. */
  references: number;
  /** Lignes du relevé que portait une vente. */
  rapprochees: number;
  recuMarchand: number;
  /** Ventes payées en mobile money (MTN, Orange) du mois, annulées exclues. */
  ventesMobile: { nombre: number; montant: number };
  /** Montant des ventes mobiles du mois, annulées comprises : l'opérateur a reçu cet argent avant de le rendre. */
  montantMobileBrut: number;
  sansCorrespondance: TransactionRapprochee[];
}

export type ExecutionDecision = "faite" | "en_attente";

/** Une décision prise sur une transaction sans correspondance : définitive, tracée 7 ans. */
export interface DecisionRapprochement {
  compagnieId: string;
  mois: string;
  reference: string;
  action: ActionRapprochement;
  /** Colis ou billet auquel la transaction est rattachée. */
  cible: string | null;
  montant: number;
  operateur: OperateurMomo;
  telephoneMasque: string;
  cause: CauseRapprochement;
  explication: string;
  decideA: string;
  parId: string;
  parNom: string;
  /** Ligne du journal d'audit qui a signé la décision. */
  journalId: string;
  /** Comment le patron a signé. */
  methode: "pin" | "empreinte";
  /** `en_attente` tant que le remboursement, le rattachement ou la réclamation n'est pas parti. */
  execution: ExecutionDecision;
  referenceExecution: string | null;
}

/* ------------------------------------------------------------------ tableaux et fichiers */

/** Une cellule d'un tableau d'export : texte, entier de FCFA ou vide. */
export type Cellule = string | number | null;

export interface Onglet {
  /** Identifiant stable (« ventes », « par_jour »…). */
  id: string;
  libelle: string;
  colonnes: string[];
  lignes: Cellule[][];
  /** Total du montant que l'onglet présente (FCFA). */
  totalMontant: number;
}

/** Le contenu d'un export, indépendant du format du fichier. */
export interface TableauFixe {
  id: IdExport;
  /** Nombre de lignes de l'export (nul pour un document non tabulaire). */
  lignes: number | null;
  onglets: Onglet[];
  /** Lignes de texte du PDF (factures) ; vide pour les autres formats. */
  texte: LignePdf[];
}

export interface LignePdf {
  texte: string;
  gras?: boolean;
  /** Taille de la police en points (10 par défaut). */
  taille?: number;
}

export interface FichierGenere {
  id: IdExport;
  format: FormatExport;
  /** « Journal des ventes · décembre » */
  nom: string;
  /** « journal-ventes-2026-12.xlsx » */
  nomFichier: string;
  typeMime: string;
  contenu: Buffer;
  /** HMAC-SHA-256 (hex) du contenu du tableau : toute retouche se détecte. */
  empreinte: string;
  genereA: string;
  colonnes: number;
  lignes: number | null;
  pages: number | null;
}

/** Un fichier figé à la clôture, avec le tableau qui a servi à l'aperçu (JSON compressé). */
export interface FichierFige extends FichierGenere {
  tableauGz: Buffer;
}

/* ------------------------------------------------------------------ clôture et envois */

export interface TransactionFigee extends TransactionRapprochee {
  decision: ActionRapprochement | null;
}

export interface EncaisseMois {
  total: number;
  cash: number;
  momo: number;
  carte: number;
  /** Reçu marchand − MoMo enregistré − lignes sans correspondance déjà traitées. */
  ecart: number;
}

export interface ExportFige {
  id: IdExport;
  nom: string;
  description: string;
  lignes: number | null;
  statut: "disponible" | "a_jour";
  format: FormatExport;
  tailleOctets: number;
  pages: number | null;
}

export interface Cloture {
  compagnieId: string;
  mois: string;
  clotureA: string;
  parId: string;
  parNom: string;
  journalId: string;
  encaisse: EncaisseMois;
  rapprochement: {
    tauxRapprochePct: number;
    ventesMobile: { nombre: number; montant: number };
    recuMarchand: number;
    sansCorrespondance: { transactions: number; montant: number };
  };
  lignes: TransactionFigee[];
  exports: ExportFige[];
  /** Les premières lignes (CSV brut) du journal des ventes. */
  apercuJournal: string[];
  destinataire: string | null;
  /** Le patron a demandé l'envoi au cabinet avec la clôture. */
  envoiDemande: boolean;
  envoiRecuA: string | null;
  fichiers: FichierFige[];
}

export type NatureEnvoi = "cloture" | "automatique";

export interface EnvoiCabinet {
  /** Clé d'idempotence : « cloture:<compagnie>:<mois> », « auto:<compagnie>:<mois> ». */
  cle: string;
  compagnieId: string;
  mois: string;
  nature: NatureEnvoi;
  /** Les exports étaient-ils définitifs (mois clôturé) ? */
  definitif: boolean;
  destinataire: string;
  envoyeA: string;
  recuA: string | null;
}

/* ------------------------------------------------------------------ chargement d'un mois */

/** Tout ce que les exports et le rapprochement d'un mois lisent, chargé une seule fois. */
export interface DonneesMois {
  compagnieId: string;
  mois: string;
  /** Premier instant du mois (inclus) et du suivant (exclu). */
  du: string;
  avant: string;
  ventes: VenteComptable[];
  /** Les ventes de la première semaine facturée quand elle commence avant le mois (pour sa facture). */
  ventesAvant: VenteComptable[];
  sessions: SessionComptable[];
  annulations: AnnulationComptable[];
  rapprochement: ResultatRapprochement;
  decisions: DecisionRapprochement[];
  parametres: ParametresComptables;
  /** Date de paiement des factures hebdomadaires, par dimanche (`AAAA-MM-JJ`) ; absente = impayée. */
  facturesPayees: ReadonlyMap<string, string>;
  /** Maintenant (ISO Douala) : une semaine n'est facturée qu'une fois terminée. */
  maintenant: string;
}
