/**
 * Modèles de l'administration (lot De) : lignes, horaires, bus, départs, appareils.
 *
 * Les heures sont des ISO de Douala (`2027-01-05T05:30:00.000+01:00`) comme partout dans l'API, les
 * montants des entiers en FCFA.
 */

export type ClasseDepart = "classique" | "vip";

export const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;
export type Jour = (typeof JOURS)[number];

export type EtatDepart =
  | "programme"
  | "en_vente"
  | "embarquement"
  | "parti"
  | "arrive"
  | "annule"
  | "retarde"
  | "fusionne";

export interface CompagnieAdmin {
  id: string;
  /** Code agence de 3 lettres (ALP, DEM…). */
  code: string;
  nom: string;
}

export interface GareAdmin {
  id: string;
  compagnieId: string;
  /** Code gare de 3 lettres (DLA, YDE…). */
  code: string;
  nom: string;
  ville: string;
}

export interface Tarifs {
  classique: number;
  vip: number;
  bagage: number;
}

/** Un arrêt d'une ligne, origine et terminus compris (rang 0 = origine). */
export interface ArretLigne {
  nom: string;
  kmDepuisOrigine: number;
  montee: boolean;
}

export interface LigneAdmin {
  id: string;
  compagnieId: string;
  /** Origine + destination sans tiret (DLAYDE). */
  code: string;
  origineGareId: string;
  destinationGareId: string;
  tarifs: Tarifs;
  dureeMinutes: number;
  arrets: ArretLigne[];
}

export interface HoraireLigne {
  id: string;
  ligneId: string;
  /** HH:MM, heure de Douala. */
  heure: string;
  classe: ClasseDepart;
  actif: boolean;
  note: string | null;
  /** Jours de circulation ; vide = tous les jours. */
  jours: Jour[];
}

export interface PlanLigne {
  capacite: number;
  disposition: string;
  rangees: number;
}

export interface OptionsLigne {
  venteEnLigne: boolean;
  fusionAuto: boolean;
}

/** Un horaire dans une modification : `id` nul pour un horaire qui vient d'être ajouté. */
export interface HoraireModifie {
  id: string | null;
  heure: string;
  classe: ClasseDepart;
  actif: boolean;
  note: string | null;
  jours: Jour[];
}

/** L'état voulu d'une ligne (ce que « publier » écrit). */
export interface EtatLigne {
  tarifs: Tarifs;
  /** Arrêts en route, sans l'origine ni le terminus. */
  arrets: { nom: string; montee: boolean }[];
  horaires: HoraireModifie[];
  plan: PlanLigne;
  options: OptionsLigne;
}

/** Les sections d'une modification enregistrée pour plus tard (celles qui changent seulement). */
export type SectionsLigne = Partial<EtatLigne>;

export interface ReglageLigne {
  ligneId: string;
  plan: PlanLigne;
  options: OptionsLigne;
  brouillon: SectionsLigne | null;
  /** Jour d'effet du brouillon, AAAA-MM-JJ. */
  effetDu: string | null;
}

export interface BusAdmin {
  id: string;
  compagnieId: string;
  immatriculation: string;
  capacite: number;
  capaciteSoute: number;
  classe: ClasseDepart;
  modele: string;
  annee: number;
}

export type NouveauBus = Omit<BusAdmin, "id">;

export interface DepartAdmin {
  id: string;
  /** AGENCE-LIGNE-AAMMJJ-HHMM */
  numero: string;
  ligneId: string;
  busId: string | null;
  classe: ClasseDepart;
  /** ISO de Douala. */
  heureDepart: string;
  etat: EtatDepart;
  quai: number | null;
  chauffeurId: string | null;
  convoyeurId: string | null;
}

export interface NouveauDepart extends DepartAdmin {
  historique: unknown[];
}

export type RessourceEquipage = "bus" | "chauffeur" | "convoyeur";

/** Ce que l'on change dans l'équipage d'un départ : seules les clés présentes changent. */
export interface ChangementEquipage {
  busId?: string | null;
  chauffeurId?: string | null;
  convoyeurId?: string | null;
  quai?: number | null;
}

export interface FiltreDeparts {
  compagnieId: string;
  ligneId?: string;
  /** Départs dont la ligne part de cette gare. */
  origineGareId?: string;
  /** Bornes de l'heure de départ, ISO de Douala (début inclus, fin exclue). */
  du?: string;
  au?: string;
}

/** Une ligne de la liste des départs : le départ et ce qu'il faut pour l'afficher. */
export interface DepartListe extends DepartAdmin {
  ligneCode: string;
  origineGareId: string;
  billetsVendus: number;
}

export type GenreAppareil = "guichet" | "convoyeur" | "autre";

export interface EnrolementAppareil {
  appareilId: string;
  compagnieId: string;
  gareId: string | null;
  libelle: string | null;
  /** Le code d'enrôlement attend d'être utilisé jusqu'à cette date. */
  codeExpireA: string | null;
  enroleA: string | null;
  /** Un secret d'appareil est en vigueur (téléphone enrôlé et non retiré). */
  actif: boolean;
  creeA: string;
}

export interface CommandeAppareil {
  id: string;
  appareilId: string;
  type: "effacer";
  emiseA: string;
  emisePar: string | null;
  motif: string | null;
  acquitteeA: string | null;
}

export interface RapportEffacement {
  effaceA: string;
  complet: boolean;
  etapes: { nom: string; ok: boolean; detail?: string }[];
}
