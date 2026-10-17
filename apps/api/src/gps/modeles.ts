/**
 * Modèles du suivi GPS. Les instants sont des chaînes ISO en heure de Douala (`+01:00`), comme
 * dans le reste de l'API ; les distances sont en kilomètres, les vitesses en km/h.
 */

/* ------------------------------------------------------------------ réseau de transport (lu) */

/** États d'un départ, tels que la billetterie les tient (`contrats.test.ts` vérifie la liste). */
export const ETATS_DEPART_GPS = [
  "programme",
  "en_vente",
  "embarquement",
  "parti",
  "arrive",
  "annule",
  "retarde",
  "fusionne",
] as const;
export type EtatDepartGps = (typeof ETATS_DEPART_GPS)[number];

export interface ArretTrajet {
  id: string;
  /** Nom affiché (« Douala Akwa », « Edéa »). */
  nom: string;
  /** Position dans la ligne (0 = origine). */
  ordre: number;
  latitude: number;
  longitude: number;
  /** Distance par la route depuis l'origine. */
  kmDepuisOrigine: number;
  /** Durée de l'arrêt prévue, en minutes (absente : le bus ne s'y arrête pas longtemps). */
  arretMinutes?: number;
  /** Voyageurs qui montent à cet arrêt (réservations en route comprises). */
  placesQuiMontent?: number;
  /** Le bus prend des voyageurs à cet arrêt. */
  montee: boolean;
}

/** Un départ vu par le suivi : sa ligne avec les coordonnées des arrêts, son bus, son équipage. */
export interface TrajetBus {
  departId: string;
  compagnie: { id: string; nom: string };
  classe: "classique" | "vip";
  /** « Douala → Yaoundé ». */
  ligneLibelle: string;
  /** « vers Yaoundé ». */
  sens: string;
  bus: { id: string; immatriculation: string } | null;
  chauffeurId: string | null;
  convoyeurId: string | null;
  etat: EtatDepartGps;
  /** Heure de départ prévue. */
  heureDepart: string;
  /** Heure réelle du départ (le bus est parti), sinon `null`. */
  partiA: string | null;
  /** Durée prévue du trajet, arrêts compris. */
  dureeMinutes: number;
  /** Arrêts dans l'ordre de la ligne, origine et destination comprises (au moins deux). */
  arrets: ArretTrajet[];
  /** Villes de la carte, dans l'ordre du trajet. */
  villes: string[];
  /** Gare d'arrivée citée dans le SMS au proche (« Mvan »). */
  gareArrivee: string;
  /** Voyageurs à bord (billets embarqués), si connu. */
  aBord?: number;
}

/** Un billet vu par le suivi. */
export interface BilletSuivi {
  billetId: string;
  departId: string;
  /** Le voyageur connecté qui a acheté le billet : lui seul suit le bus. */
  voyageurId: string;
  siege: number | null;
  /** Nom à citer dans le SMS au proche (prénom ou nom court). */
  passagerNom: string;
  /** `false` pour un billet annulé ou remboursé. */
  valide: boolean;
}

export interface ProcheSuivi {
  id: string;
  nom: string;
  /** Numéro international (+237…). */
  telephone: string;
}

/** Un arrêt dont on connaît le point de montée et la ligne (écran « Monter en route »). */
export interface PointArret {
  id: string;
  nom: string;
  latitude: number;
  longitude: number;
  /** « Point de montée : station Total Pouma, côté droit… » (saisi par la compagnie). */
  pointDeMontee: string;
  ligne: { libelle: string; sens: string; arrets: string[] };
}

export interface OffreMontee {
  placesLibres: number;
  /** Prix de la montée, au prorata de la distance restante. */
  prix: number;
  prorata: boolean;
}

/** Une livraison de colis à moto en cours. */
export interface MissionSuivie {
  colisId: string;
  livreurId: string;
  expediteurId: string | null;
  destinataireId: string | null;
  /** `false` quand la mission est terminée, annulée ou pas encore acceptée. */
  active: boolean;
  /** Le colis a été retiré à la gare ou chez l'expéditeur. */
  retire: boolean;
  retrait: { latitude: number; longitude: number };
  remise: { latitude: number; longitude: number };
}

/* ------------------------------------------------------------------ positions et état */

export interface Position {
  /** `bus:<departId>` ou `livraison:<colisId>`. */
  sujet: string;
  auteurId: string;
  instant: string;
  latitude: number;
  longitude: number;
  precisionM: number | null;
  vitesseKmh: number | null;
  /** Heure de réception par le serveur. */
  recuA: string;
}

/** Ce que le suivi d'un départ retient de ses positions (une ligne par départ). */
export interface EtatSuivi {
  departId: string;
  /** Compare-et-remplace : le premier enregistrement porte la version 1. */
  version: number;
  derniere: {
    instant: string;
    latitude: number;
    longitude: number;
    vitesseKmh: number;
  } | null;
  /** Kilomètres parcourus sur la ligne (ne recule jamais). */
  progressionKm: number;
  /** Premier instant de passage à chaque arrêt (identifiant d'arrêt → instant). */
  passages: Record<string, string>;
  /** Depuis quand le bus ne bouge plus, et où. */
  immobile: { depuis: string; latitude: number; longitude: number } | null;
  /** Alerte d'arrêt anormal ouverte pour ce départ. */
  alerteId: string | null;
}

export type SoupconArret = "panne" | "retard" | "autre";

export interface AlerteArret {
  id: string;
  departId: string;
  compagnieId: string;
  immatriculation: string;
  /** Dernier arrêt de la ligne passé (« Edéa »). */
  apres: string;
  /** Début de l'immobilité. */
  arretDepuis: string;
  ouverteA: string;
  latitude: number;
  longitude: number;
  soupcon: SoupconArret;
  aBord: number | null;
  resolueA: string | null;
}

/** Le SMS « j'arrive » d'un voyageur à un proche. */
export interface PrevenirProche {
  billetId: string;
  procheId: string;
  voyageurId: string;
  departId: string;
  minutesAvantArrivee: number;
  actif: boolean;
  creeA: string;
  /** Instant d'envoi du SMS (un seul SMS par billet et par proche). */
  envoyeA: string | null;
}

/* ------------------------------------------------------------------ messages */

/** Position d'un bus telle que la diffusent les canaux (le billet s'ajoute pour un voyageur). */
export interface MessageBusInterne {
  departId: string;
  instant: string;
  latitude: number;
  longitude: number;
  vitesseKmh: number;
  arriveeEstimee: string;
  retardMinutes: number;
  prochainArret?: string;
}

export interface BusEnRoute {
  departId: string;
  immatriculation: string;
  compagnie: string;
  ligne: string;
  instant: string;
  latitude: number;
  longitude: number;
  vitesseKmh: number;
  arriveeEstimee: string;
  retardMinutes: number;
  prochainArret?: string;
  /** Minutes d'immobilité hors arrêt quand une alerte est ouverte. */
  arretMinutes?: number;
  enDirect: boolean;
}

/** Élément « à traiter » de la salle de contrôle (forme de `patron.ATraiter`). */
export interface ATraiterBus {
  id: string;
  type: "bus_arrete";
  texte: string;
  quand: string;
}
