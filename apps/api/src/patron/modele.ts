import type { patron as c } from "@afrimove/contrats";

/**
 * Les faits que le module lit chez les autres modules (ou dans ses propres tables), plats et sans
 * mise en forme : les services en tirent les contrats de l'espace patron (`@afrimove/contrats` →
 * `patron`). Les montants sont des entiers de FCFA, les instants des `Date`.
 *
 * Les formes des réponses sont celles des contrats ; le paquet n'est importé qu'en `import type`
 * (effacé à la compilation) : l'API ne dépend pas de zod à l'exécution.
 */

export type RoleEquipe = c.RoleEquipe;
export type EtatPersonne = c.EtatPersonne;
export type Droits = c.DroitsPersonne;

/** L'ordre des rôles dans les listes du patron. */
export const ROLES_EQUIPE: readonly RoleEquipe[] = [
  "guichetier",
  "superviseur",
  "convoyeur",
  "chauffeur",
  "relais",
  "comptable",
];

export const estRoleEquipe = (valeur: unknown): valeur is RoleEquipe =>
  typeof valeur === "string" && (ROLES_EQUIPE as readonly string[]).includes(valeur);

/**
 * Droits d'une personne qui n'a pas encore été réglée par le patron. Provisoire (à confirmer) : le
 * guichetier vend, le superviseur voit toutes les caisses de sa gare et annule avec son propre PIN.
 */
export function droitsParDefaut(role: RoleEquipe): Droits {
  return {
    vendreBilletsEtColis: role === "guichetier",
    annulerSansPinSuperviseur: role === "superviseur",
    modeCadence: false,
    voirCaissesDesAutres: role === "superviseur" || role === "comptable",
  };
}

export type OperateurPersonne = "MTN" | "Orange";

export interface OptionsLigne {
  venteEnLigne: boolean;
  fusionAuto: boolean;
}

/* ------------------------------------------------------------------ référentiel */

export interface CompagniePatron {
  id: string;
  nom: string;
}

export interface GarePatron {
  id: string;
  code: string;
  nom: string;
  ville: string;
  /** Les guichets de la gare, par rang. */
  guichets: Array<{ id: string; rang: number }>;
  /** Plus grand numéro de quai des départs de la gare (0 = aucun départ encore). */
  nbQuais: number;
  /** Les téléphones de guichet enregistrés (non retirés) et ceux qui se sont annoncés récemment. */
  appareils: {
    total: number;
    synchronises: number;
    derniereSyncA: Date | null;
    /** La dernière synchronisation du téléphone de chaque guichet qui en a un. */
    parRang: Array<{ rang: number; derniereSyncA: Date | null }>;
  };
}

/** Une ligne du journal signé de l'agence (`journal_agence`) pour une gare. */
export interface EvenementJournal {
  at: Date;
  resume: string;
  cibleId: string;
}

/* ------------------------------------------------------------------ exploitation */

export interface DepartExploitation {
  departId: string;
  gareId: string;
  origine: string;
  destination: string;
  heureDepart: Date;
  etat: string;
  quai: number | null;
  bus: string | null;
  /** Places du bus (0 si le départ n'a pas de bus). */
  capacite: number;
  /** Places occupées par un billet vivant. */
  vendus: number;
  chauffeur: string | null;
  convoyeur: string | null;
  /** Heure du premier billet embarqué. */
  embarquementA: Date | null;
  note: string | null;
}

export interface ArretBus {
  id: string;
  departId: string;
  immatriculation: string;
  apres: string;
  arretDepuis: Date;
  soupcon: "panne" | "retard" | "autre";
  aBord: number | null;
}

export interface PanneSignalee {
  id: string;
  departId: string;
  immatriculation: string;
  description: string;
  signaleA: Date;
}

export interface PropositionEnAttente {
  actionId: string;
  libelle: string;
  proposeeLe: Date;
}

export interface DossierEnAttente {
  /** « AV-2027-0041 » */
  id: string;
  montant: number;
  statut: "envoye" | "en_analyse";
  envoyeA: Date;
}

/** Une alerte du patron telle qu'elle est écrite (table `alerte_patron`). */
export interface AlerteEcrite {
  id: string;
  type: string;
  gareId: string | null;
  message: string;
  details: Record<string, unknown>;
  creeA: Date;
}

/* ------------------------------------------------------------------ équipe */

export interface MembrePatron {
  id: string;
  nom: string;
  role: RoleEquipe;
  gareId: string | null;
  gareNom: string | null;
  guichetId: string | null;
  guichetRang: number | null;
  /** Immatriculation du bus du jour (chauffeur, convoyeur). */
  bus: string | null;
  /** Ce que la personne fait en ce moment, sans tenir compte du blocage du compte. */
  situation: "en_service" | "a_bord" | "en_route" | "repos";
  /** Depuis quand elle est en service (caisse ouverte, dernière connexion du jour). */
  enServiceDepuis: Date | null;
  actif: boolean;
  bloqueJusqua: Date | null;
  pinProvisoireJusqua: Date | null;
  creeA: Date;
  telephoneChiffre: string;
  operateur: OperateurPersonne;
  salaire: number;
  jourDePaie: number;
  droits: Droits;
  /** Billets vendus sur les 90 derniers jours. */
  billets90: number;
}

export interface ActivitePersonne {
  billets: number;
  colis: number;
  litiges: number;
  /** Demandes d'annulation faites (quelle qu'en soit l'issue). */
  annulations: number;
}

export interface NouveauMembre {
  id: string;
  nom: string;
  telephoneChiffre: string;
  telephoneIndex: string;
  role: RoleEquipe;
  compagnieId: string;
  gareId: string | null;
  guichetId: string | null;
  pinHache: string | null;
  motDePasseHache: string | null;
  pinProvisoireJusqua: Date | null;
  operateur: OperateurPersonne;
  salaire: number;
  jourDePaie: number;
  droits: Droits;
}

export interface ChangementMembre {
  nom?: string;
  telephoneChiffre?: string;
  telephoneIndex?: string;
  role?: RoleEquipe;
  gareId?: string | null;
  guichetId?: string | null;
  operateur?: OperateurPersonne;
  salaire?: number;
  droits?: Droits;
}

/* ------------------------------------------------------------------ lignes */

export interface ArretLigne {
  nom: string;
  km: number;
  montee: boolean;
}

export interface HoraireLigne {
  id: string;
  heure: string;
  classe: "classique" | "vip";
  prix: number;
  actif: boolean;
  note: string | null;
  jours: string[];
}

export interface PlanLigne {
  capacite: number;
  disposition: string;
  rangees: number;
}

export interface LigneFait {
  id: string;
  code: string;
  origine: { id: string; nom: string; ville: string };
  destination: { id: string; nom: string; ville: string };
  tarifs: c.Tarifs;
  /** Tous les arrêts, origine et terminus compris, dans l'ordre. */
  arrets: ArretLigne[];
  /** Le plan réglé, ou `null` : la ligne n'a jamais été réglée (valeurs par défaut). */
  plan: PlanLigne | null;
  options: OptionsLigne;
  horaires: HoraireLigne[];
  /** Une modification datée en attente de son jour d'effet. */
  brouillon: { commande: CommandeLigne; effetDu: string } | null;
}

/** Le corps de `PUT /patron/reglages/lignes/:ligneId`, sans la signature. */
export type CommandeLigne = Omit<c.ModifierLigne, "signature">;

export interface ChangementLigne {
  departs?: Array<Omit<HoraireLigne, "id"> & { id: string | null }>;
  tarifs?: c.Tarifs;
  /** Tous les arrêts de la ligne, origine et terminus compris, avec leurs kilomètres. */
  arrets?: ArretLigne[];
  plan?: PlanLigne;
  options?: OptionsLigne;
}

export interface NouvelleLigne {
  id: string;
  code: string;
  origineGareId: string;
  destinationGareId: string;
  tarifs: c.Tarifs;
  arrets: ArretLigne[];
  plan: PlanLigne;
}

/* ------------------------------------------------------------------ règles et comptes mobile money */

export type OperateurMomo = c.OperateurMomo;

export interface ConfirmationMomo {
  empreinte: string;
  creeA: Date;
  expireA: Date;
  essais: number;
}

/**
 * Les règles de l'agence telles qu'elles sont réglées. La tolérance d'écart de caisse est `null`
 * quand la compagnie n'a rien réglé : la caisse applique alors sa règle par défaut.
 */
export interface ReglesLues {
  annulation: c.ReglesModifiables["annulation"];
  caisse: { toleranceEcart: number | null; auDela: c.ReglesModifiables["caisse"]["auDela"] };
  cadence: c.ReglesModifiables["cadence"];
  fraisService: c.ReglesModifiables["fraisService"];
}
