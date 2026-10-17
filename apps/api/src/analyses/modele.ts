/**
 * Faits que le module lit (jamais écrits ici) et constats qu'il en tire.
 *
 * Tous les jours sont des jours de Douala (`AAAA-MM-JJ`), les heures de départ `HH:MM`, les
 * montants des entiers de FCFA. Un fait ne porte jamais de donnée personnelle d'un voyageur : ni
 * nom, ni téléphone, ni pièce (le module ne compte que des billets).
 */

export type Classe = "classique" | "vip";

/* ------------------------------------------------------------------ référentiel */

export interface LigneRef {
  id: string;
  /** « Douala → Bafoussam ». */
  nom: string;
  /** Origine + destination sans tiret (`DLABAF`) : le même code chez toutes les compagnies. */
  code: string;
  origine: string;
  destination: string;
}

export interface BusRef {
  id: string;
  immatriculation: string;
  /** « Coaster ». */
  modele: string;
  capacite: number;
  annee: number;
  /** Chauffeur habituel. */
  chauffeurId: string | null;
  /** Nom tel que l'agence le dit (« Nana »). */
  chauffeurNom: string;
  /** Entretien à prévoir que la flotte a saisi (« pneus à changer », « visite technique »). */
  entretien: string | null;
}

export interface AgentRef {
  id: string;
  /** Nom que le patron connaît (« Joseph »). */
  nom: string;
}

export interface GareRef {
  id: string;
  nom: string;
  ville: string;
}

/* ------------------------------------------------------------------ faits d'exploitation */

export interface IncidentFait {
  nature: "panne" | "autre";
  description: string;
  dureeMinutes: number | null;
}

/**
 * Un départ réellement effectué (ou annulé) un jour donné, avec ce qu'il a rapporté et coûté.
 * Un fait par départ : 40 départs par jour pour une agence, 15 000 lignes pour une année.
 */
export interface DepartFait {
  departId: string;
  ligneId: string;
  jour: string;
  heure: string;
  classe: Classe;
  /** Tarif du billet ce jour-là. */
  prix: number;
  busId: string | null;
  chauffeurId: string | null;
  /** Places du bus. */
  capacite: number;
  /** Billets vendus, annulés et remplacés exclus. */
  billets: number;
  recetteBillets: number;
  /** Dont vendus en ligne (app, WhatsApp, USSD). */
  billetsEnLigne: number;
  /** Dont vendus en route par les convoyeurs. */
  billetsEnRoute: number;
  /** Arrêts où des billets ont été vendus en route (« Bafang », « Mbouda »). */
  arretsEnRoute: string[];
  /** Les billets vendus en route ont-ils tous été enregistrés ? */
  enRouteTousEnregistres: boolean;
  colis: number;
  recetteColis: number;
  annule: boolean;
  /** « soute colis », « clim »… */
  note: string | null;
  retardMinutes: number | null;
  incident: IncidentFait | null;
  carburant: number;
  coutPanne: number;
  autresDepenses: number;
}

export interface EcartCaisseFait {
  sessionId: string;
  agentId: string;
  gareId: string;
  /** « Guichet 2 ». */
  guichet: string;
  jour: string;
  /** Compté − attendu : négatif quand il manque de l'argent. */
  ecart: number;
  /** Tolérance d'écart de l'agence à l'ouverture de la session. */
  tolerance: number;
  /** Seules les caisses validées par un superviseur comptent. */
  validee: boolean;
}

/** Billets vendus en mode cadence par un agent sur un départ, et ceux restés sans numéro de téléphone. */
export interface VenteCadenceFait {
  agentId: string;
  gareId: string;
  departId: string;
  ligneId: string;
  heure: string;
  jour: string;
  billets: number;
  sansNom: number;
}

/* ------------------------------------------------------------------ marché */

/**
 * Un départ **publié** par une autre compagnie : ce que n'importe quel voyageur voit en cherchant
 * un billet sur AfriMove (compagnie, ligne, heure, prix). Rien d'autre d'une autre compagnie n'entre
 * ici : ni billets vendus, ni remplissage, ni recette.
 */
export interface OffrePublique {
  compagnie: string;
  ligneCode: string;
  jour: string;
  heure: string;
  prix: number;
}

/**
 * Moyenne **anonyme** du réseau sur un créneau d'une ligne : calculée par l'adaptateur sur les autres
 * compagnies, sans nom, sans identifiant, et seulement s'il y en a assez (`compagnies >= seuil`). Le
 * service refuse un agrégat sous le seuil même si l'adaptateur l'a rendu.
 */
export interface AgregatReseau {
  ligneCode: string;
  /** Début du créneau d'une heure : « 09:00 ». */
  creneau: string;
  /** Nombre de compagnies concernées (jamais leur nom). */
  compagnies: number;
  remplissageMoyenPct: number;
  jours: number;
}

/* ------------------------------------------------------------------ constats */

/** D'où vient un chiffre : chaque constat cite les siennes. */
export interface SourceDonnee {
  type:
    | "ventes"
    | "departs"
    | "ecarts_caisse"
    | "billets_cadence"
    | "pannes"
    | "colis"
    | "offres_publiques"
    | "reseau_anonyme";
  /** « 3 clôtures de caisse validées du 7 au 16 oct. ». */
  description: string;
  /** Nombre d'enregistrements lus. */
  nombre: number;
  du: string;
  au: string;
}

export type RegleDetection =
  | "ecarts_repetes_agent"
  | "pannes_repetees"
  | "concurrent_moins_cher"
  | "creux_jour"
  | "cadence_sans_nom";

export type TypeAction =
  | "controle_inopine"
  | "regle_cadence_numero"
  | "decaler_depart"
  | "ajouter_depart"
  | "voir_ligne";

/** Ce que l'action change, ou ce qu'elle ouvre. Stocké avec la proposition pour la rejouer à l'identique. */
export type ParametresAction =
  | { type: "controle_inopine"; agentId: string; gareId: string; jourSemaine: number }
  | { type: "regle_cadence_numero"; gareId: string }
  | {
      type: "decaler_depart";
      departId: string;
      ligneId: string;
      heure: string;
      nouvelleHeure: string;
    }
  | { type: "ajouter_depart"; ligneId: string; jourSemaine: number; heure: string; classe: Classe }
  | { type: "voir_ligne"; ligneId: string };

export interface ActionProposee {
  /** Lisible et stable : `type:cible[:détail]`. Le patron ne peut appliquer que ce que l'API a proposé. */
  id: string;
  libelle: string;
  type: TypeAction;
  parametres: ParametresAction;
}

export interface RemplissageSimule {
  libelle: string;
  remplis: number;
  capacite: number;
}

export interface SimulationFaite {
  scenarios: RemplissageSimule[];
  gainMensuel: number;
  /** Sur quelles données la simulation repose. */
  base: string;
  /** Baisse de prix : voyageurs en plus par départ pour gagner la même chose (`null` hors baisse). */
  passagersPourEquilibrer?: number | null;
}

export interface Constat {
  id: string;
  regle: RegleDetection;
  periodeJours: number;
  constat: string;
  explication: string;
  /** Montant cumulé (négatif quand il manque de l'argent), `null` quand on ne sait pas le chiffrer. */
  montantTotal: number | null;
  /** 1 = le plus ancien jour de la période. */
  joursConcernes: number[];
  sources: SourceDonnee[];
  actions: ActionProposee[];
  /** Pour les constats qui valent un gain : la simulation et l'action qui la réalise. */
  simulation: SimulationFaite | null;
}
