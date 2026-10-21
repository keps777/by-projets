import type { ActionBillet, EtatBillet } from "./etats/billet";
import type { ActionColis, EtatColis } from "./etats/colis";
import type { ActionDepart, EtatDepart } from "./etats/depart";
import type { ActionSession, EtatSession } from "./etats/session";
import type { EntreeHistorique } from "./machine";
import type { Fcfa } from "./money";
import type { IsoDouala } from "./temps";

/** Identifiant opaque (UUID créé sur l'appareil, voir `Evenement`). */
export type Id = string;

export interface Compagnie {
  id: Id;
  /** Code agence de 3 lettres utilisé dans les numéros (ALP, BEX…). */
  code: string;
  nom: string;
  actif: boolean;
}

export interface Gare {
  id: Id;
  compagnieId: Id;
  /** Code gare de 3 lettres (DLA, YDE, BAF…). */
  code: string;
  nom: string;
  ville: string;
}

export interface Guichet {
  id: Id;
  gareId: Id;
  /** Rang 1 à 3 : détermine la plage de numéros (voir `plageGuichet`). */
  rang: number;
}

export interface Arret {
  id: Id;
  nom: string;
  /** Distance depuis l'origine de la ligne ; sert au prorata des prix. */
  kmDepuisOrigine: number;
  /** Les voyageurs peuvent-ils monter à cet arrêt ? */
  montee: boolean;
}

export type ClasseBillet = "classique" | "vip";

export interface TarifsLigne {
  classique: Fcfa;
  vip: Fcfa;
  bagage: Fcfa;
}

export interface Ligne {
  id: Id;
  compagnieId: Id;
  /** Code de ligne sans tiret : origine + destination (DLAYDE). */
  code: string;
  origineGareId: Id;
  destinationGareId: Id;
  /** Arrêts dans l'ordre, origine et terminus compris. */
  arrets: readonly Arret[];
  tarifs: TarifsLigne;
}

export interface Depart {
  id: Id;
  /** AGENCE-LIGNE-AAMMJJ-HHMM */
  numero: string;
  ligneId: Id;
  busId: Id | null;
  classe: ClasseBillet;
  heureDepart: IsoDouala;
  etat: EtatDepart;
  historique: readonly EntreeHistorique<EtatDepart, ActionDepart>[];
  /** Renseigné quand le départ passe à « fusionné ». */
  fusionneDansId?: Id;
}

export interface Bus {
  id: Id;
  compagnieId: Id;
  immatriculation: string;
  capacite: number;
  classe: ClasseBillet;
}

export interface SiegeBloque {
  par: Id;
  jusqua: IsoDouala;
}

export interface PlanSieges {
  capacite: number;
  /** Siège → identifiant du billet. */
  occupes: Readonly<Record<number, Id>>;
  /** Blocage de 15 min pendant une commande. */
  bloques: Readonly<Record<number, SiegeBloque>>;
  /** Part de sièges réservée à chaque guichet pour vendre hors ligne (guichetId → sièges). */
  partsHorsLigne: Readonly<Record<Id, readonly number[]>>;
}

export type CanalVente = "guichet" | "convoyeur" | "en_ligne" | "vendeur";

export interface Passager {
  nom?: string;
  telephone?: string;
  /** 4 derniers chiffres de la pièce d'identité. */
  pieceQuatreDerniers?: string;
}

export interface Billet {
  id: Id;
  /** AGENCE-GARE-AAMMJJ-NNNN. Jamais modifié, même après annulation. */
  numero: string;
  /** NNNN seul (clé de la détection de trous). */
  sequence: number;
  compagnieId: Id;
  gareId: Id;
  departId: Id;
  siege: number | null;
  classe: ClasseBillet;
  prix: Fcfa;
  canal: CanalVente;
  guichetId?: Id;
  sessionId?: Id;
  passager: Passager;
  /** Code de 4 chiffres pour embarquer sans scanner. */
  codeBillet: string;
  creeA: IsoDouala;
  etat: EtatBillet;
  historique: readonly EntreeHistorique<EtatBillet, ActionBillet>[];
}

export type ModeColis = "gare" | "relais" | "moto";
export type CanalColis = "agence" | "app";

export interface Colis {
  id: Id;
  /** C-GARE-AAMMJJ-NNNN */
  numero: string;
  sequence: number;
  gareOrigineId: Id;
  gareDestinationId: Id;
  departId: Id | null;
  expediteur: { nom: string; telephone: string };
  destinataire: { nom: string; telephone: string };
  contenu: string;
  poidsKg: number;
  valeurDeclaree: Fcfa;
  assure: boolean;
  mode: ModeColis;
  canal: CanalColis;
  /** Code de retrait à 6 chiffres : seul le haché et son sel sont conservés. */
  codeRetraitHache: string;
  codeRetraitSel: string;
  prixTotal: Fcfa;
  creeA: IsoDouala;
  /** Date d'arrivée disponible (début des 7 jours de garde). */
  disponibleDepuis?: IsoDouala;
  etat: EtatColis;
  historique: readonly EntreeHistorique<EtatColis, ActionColis>[];
}

export interface SessionCaisse {
  id: Id;
  /** K-GARE-AAMMJJ-GUICHET-N */
  numero: string;
  guichetId: Id;
  agentId: Id;
  fondDeCaisse: Fcfa;
  ouverteA: IsoDouala;
  cloturee?: {
    at: IsoDouala;
    auto: boolean;
    cashCompte: Fcfa;
    cashAttendu: Fcfa;
    ecart: Fcfa;
  };
  validee?: { at: IsoDouala; superviseurId: Id };
  etat: EtatSession;
  historique: readonly EntreeHistorique<EtatSession, ActionSession>[];
}

export type Role =
  | "voyageur"
  | "guichetier"
  | "convoyeur"
  | "chauffeur"
  | "vendeur"
  | "controleur"
  | "superviseur"
  | "patron"
  | "comptable"
  | "relais"
  | "livreur"
  | "afrimove";

export interface Personne {
  id: Id;
  nom: string;
  telephone: string;
  roles: readonly Role[];
  compagnieId?: Id;
  gareId?: Id;
  actif: boolean;
}

export interface Module {
  code: string;
  nom: string;
  actif: boolean;
}

export type TypeAppareil = "telephone_guichet" | "telephone_secours" | "poste_controle" | "autre";

export interface Appareil {
  id: Id;
  type: TypeAppareil;
  gareId?: Id;
  guichetId?: Id;
  derniereSyncA: IsoDouala;
  /** Déblocage temporaire accordé par un superviseur (4 h). */
  debloqueJusqua?: IsoDouala;
}

/**
 * Événement métier : tout ce qui se passe est un événement horodaté, ajouté, jamais effacé.
 * Une annulation est un événement. L'identifiant est créé sur l'appareil (UUID) ; `numeroPlage`
 * porte le numéro pris dans la plage de l'appareil quand l'événement crée un document numéroté.
 */
export interface Evenement<T extends string = string> {
  id: Id;
  type: T;
  at: IsoDouala;
  appareilId: Id | null;
  auteurId: Id | null;
  cible: { type: "billet" | "colis" | "depart" | "session"; id: Id };
  numeroPlage?: number;
  donnees: Readonly<Record<string, unknown>>;
}
