import type {
  AlerteArret,
  BilletSuivi,
  EtatSuivi,
  MissionSuivie,
  OffreMontee,
  Position,
  PointArret,
  PrevenirProche,
  ProcheSuivi,
  TrajetBus,
} from "./modeles";

/**
 * Ports du suivi GPS : tout ce que le module lit ou écrit passe par ces classes abstraites.
 * `memoire.ts` en donne des versions en mémoire (tests, développement) ; les adaptateurs PostgreSQL
 * (tables décrites dans le README) et ceux des autres tickets les remplacent dans le module.
 * `GpsModule` refuse de démarrer en production tant qu'un port est encore en mémoire.
 */

/* ------------------------------------------------------------------ lu chez les autres modules */

/** Lignes, départs, bus et arrêts avec coordonnées : lus dans la billetterie et l'administration. */
export abstract class ReseauTransport {
  abstract trajet(departId: string): Promise<TrajetBus | null>;
  /** Départs de la compagnie en embarquement ou en route. */
  abstract trajetsEnRoute(compagnieId: string): Promise<TrajetBus[]>;
  abstract arret(arretId: string): Promise<PointArret | null>;
  /** L'arrêt le plus proche d'une position, dans un rayon (m) ; `null` si aucun. */
  abstract arretLePlusProche(
    latitude: number,
    longitude: number,
    rayonM: number,
  ): Promise<PointArret | null>;
  /**
   * Départs de toutes les compagnies (en vente, en embarquement ou en route) qui ont un arrêt à
   * moins de `rayonM` mètres de ce point.
   */
  abstract trajetsPres(
    point: { latitude: number; longitude: number },
    rayonM: number,
  ): Promise<TrajetBus[]>;
}

export abstract class BilletsSuivis {
  abstract billet(billetId: string): Promise<BilletSuivi | null>;
}

/** Les proches d'un voyageur (comptes). */
export abstract class ProchesASuivre {
  abstract trouver(voyageurId: string, procheId: string): Promise<ProcheSuivi | null>;
  /** Le proche proposé par défaut (« Prévenir Maman quand j'arrive »), s'il y en a un. */
  abstract proposition(voyageurId: string): Promise<ProcheSuivi | null>;
}

/** Les livraisons de colis à moto (colis, AM-163). */
export abstract class MissionsSuivies {
  abstract mission(colisId: string): Promise<MissionSuivie | null>;
}

/** Places libres et prix de la montée en route (billetterie). */
export abstract class OffresDeMontee {
  abstract offre(departId: string, arretId: string): Promise<OffreMontee | null>;
}

/* ------------------------------------------------------------------ écrit par ce module */

export abstract class Positions {
  /**
   * Enregistre une position. Clé : (sujet, auteur, instant) ; `false` si elle existe déjà
   * (l'appareil a renvoyé son lot).
   */
  abstract ajouter(position: Position): Promise<boolean>;
  abstract derniere(sujet: string): Promise<Position | null>;
  /** Les dernières positions, de la plus ancienne à la plus récente. */
  abstract recentes(sujet: string, nombre: number): Promise<Position[]>;
}

/** L'état d'un départ : une ligne par départ, mise à jour en comparant la version. */
export abstract class EtatsSuivi {
  abstract lire(departId: string): Promise<EtatSuivi | null>;
  /**
   * Écrit `etat` si la version stockée est `etat.version - 1` (0 : pas encore de ligne). `false`
   * si quelqu'un d'autre a écrit entre-temps : l'appelant relit et recommence.
   */
  abstract ecrire(etat: EtatSuivi): Promise<boolean>;
}

export abstract class AlertesArret {
  /** Ouvre l'alerte ; `null` si une alerte est déjà ouverte pour ce départ (index unique partiel). */
  abstract ouvrir(alerte: AlerteArret): Promise<AlerteArret | null>;
  /** Ferme l'alerte ; `null` si elle l'était déjà. */
  abstract resoudre(id: string, a: string): Promise<AlerteArret | null>;
  abstract trouver(id: string): Promise<AlerteArret | null>;
  abstract ouvertes(compagnieId: string): Promise<AlerteArret[]>;
}

export abstract class PrevenirProches {
  /** Crée ou met à jour (minutes, actif) ; l'envoi déjà fait est conservé. */
  abstract enregistrer(
    p: Omit<PrevenirProche, "envoyeA" | "creeA"> & { creeA: string },
  ): Promise<PrevenirProche>;
  abstract deBillet(billetId: string): Promise<PrevenirProche[]>;
  /** Les SMS actifs d'un départ qui ne sont pas encore partis. */
  abstract enAttente(departId: string): Promise<PrevenirProche[]>;
  /** Note l'envoi ; `false` s'il était déjà noté. */
  abstract marquerEnvoye(billetId: string, procheId: string, a: string): Promise<boolean>;
  abstract desactiver(billetId: string, procheId: string): Promise<PrevenirProche | null>;
}

/* ------------------------------------------------------------------ avis et temps réel */

export interface AvisProche {
  /** Clé d'idempotence : le même avis ne produit jamais deux SMS. */
  cle: string;
  billetId: string;
  compagnieId: string;
  voyageurId: string;
  proche: ProcheSuivi;
  voyageurNom: string;
  gareArrivee: string;
  compagnieNom: string;
  arriveeEstimee: string;
}

/**
 * Ce que le suivi demande aux autres : le SMS au proche (passerelle SMS, AM-166 : gabarit
 * `alerte_proche`, avec `cle` comme clé d'idempotence) et l'alerte d'arrêt anormal (SMS ou
 * notification au superviseur et au patron).
 */
export abstract class AvisSuivi {
  abstract prevenirProche(avis: AvisProche): Promise<void>;
  abstract alerteArret(alerte: AlerteArret): Promise<void>;
}

/** Diffusion temps réel entre les instances de l'API (mémoire ici ; Redis ou NOTIFY ensuite). */
export abstract class DiffusionGps {
  abstract publier(canal: string, message: unknown): void;
  abstract souscrire(canal: string, ecouteur: (message: unknown) => void): () => void;
}

export const canalBus = (departId: string): string => `gps:bus:${departId}`;
export const canalLivraison = (colisId: string): string => `gps:livraison:${colisId}`;
export const canalControle = (compagnieId: string): string => `gps:controle:${compagnieId}`;
export const sujetBus = (departId: string): string => `bus:${departId}`;
export const sujetLivraison = (colisId: string): string => `livraison:${colisId}`;
