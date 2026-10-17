import type { AlerteSync } from "../sync/ports";
import type { GenreNumero, Plage } from "./regles";

/**
 * Ports de persistance de la numérotation (AM-161).
 *
 * Toute la logique (attribution, contrôle, trous, alertes) ne parle qu'à ces classes abstraites.
 * `memoire.ts` en fournit des versions en mémoire (tests, développement). **Les versions PostgreSQL
 * ne sont pas écrites** : elles demandent des tables que la migration d'AM-017 n'a pas
 * (`apps/api/prisma/**`, hors du périmètre d'AM-161) ; le README du dossier donne leur schéma et les
 * contraintes qui garantissent l'unicité. `NumerotationModule` refuse de démarrer en production
 * tant qu'un de ces ports est en mémoire.
 */

export interface StockageNumerotation {
  /** `true` pour un adaptateur qui garde ses données après un redémarrage. */
  readonly durable: boolean;
}

export interface Titulaire {
  id: string;
  nom: string;
}

/** La plage de numéros confiée à un appareil (guichet ou convoyeur). */
export interface AttributionPlage {
  appareilId: string;
  genre: "guichet" | "convoyeur";
  /** Rang dans la gare ; `null` pour une plage donnée explicitement. */
  rang: number | null;
  nbConvoyeurs: number | null;
  plage: Plage;
  gareId: string | null;
  compagnieId: string | null;
  /** La personne qui porte l'appareil : c'est elle que nomme l'alerte. */
  titulaire: Titulaire | null;
  attribueeA: string;
  attribueePar: string | null;
  /** Renseigné quand l'appareil est remplacé : la plage redevient disponible. */
  libereeA: string | null;
}

export type ResultatAttribution =
  | { ok: true; attribution: AttributionPlage }
  | { ok: false; enConflitAvec: AttributionPlage };

export abstract class PlagesAttribuees {
  /** L'attribution en cours de cet appareil (non libérée). */
  abstract trouver(appareilId: string): Promise<AttributionPlage | null>;
  abstract lister(filtre?: {
    gareId?: string | null;
    compagnieId?: string | null;
  }): Promise<AttributionPlage[]>;
  /**
   * Pose (ou remplace) la plage de l'appareil, **à condition** qu'elle ne chevauche aucune plage en
   * cours d'un autre appareil de la même gare. La vérification et l'écriture sont atomiques : en
   * PostgreSQL, une contrainte d'exclusion (voir le README).
   */
  abstract attribuer(attribution: AttributionPlage): Promise<ResultatAttribution>;
  abstract liberer(appareilId: string, libereeA: string): Promise<AttributionPlage | null>;
}

/** Un numéro vu : une ligne du registre `numero_vu`. */
export interface EntreeRegistre {
  /** Portée de l'unicité (voir `porteeDe`). */
  portee: string;
  gareId: string | null;
  compagnieId: string | null;
  appareilId: string;
  /** AAMMJJ. */
  jour: string;
  genre: GenreNumero;
  numero: number;
  evenementId: string;
  recuA: string;
}

export type ResultatReservation =
  | { statut: "reserve" }
  /** Le même événement revient (rejeu) : rien à signaler. */
  | { statut: "rejeu" }
  /** Un autre événement avait déjà ce numéro. */
  | { statut: "doublon"; evenementIdExistant: string };

/**
 * Registre des numéros reçus ou attribués. Un numéro n'y entre qu'une fois par
 * `(portée, jour, genre, numéro)` : c'est l'index unique qui rend « un numéro n'est jamais attribué
 * deux fois » vrai même quand deux requêtes se croisent.
 */
export abstract class RegistreNumeros {
  /** Réserve le numéro, ou répond qui l'avait déjà. Atomique. */
  abstract reserver(entree: EntreeRegistre): Promise<ResultatReservation>;
  /**
   * Prend le plus petit numéro libre de la plage pour cette portée (numérotation par le serveur).
   * Idempotent par `evenementId` : la même référence rend toujours le même numéro. `null` si la
   * plage est épuisée. Atomique.
   */
  abstract prendreSuivant(
    demande: Omit<EntreeRegistre, "numero"> & { plage: Plage },
  ): Promise<{ numero: number; nouveau: boolean } | null>;
  abstract entrees(portee: string, jour: string, genre: GenreNumero): Promise<EntreeRegistre[]>;
  abstract duJour(jour: string): Promise<EntreeRegistre[]>;
}

/**
 * Les alertes de numérotation (trou dans une plage). Même forme que celles de la synchronisation
 * (`AlerteSync`, type `trou_dans_la_plage`) pour qu'elles se lisent au même endroit.
 */
export abstract class AlertesNumerotation {
  /** Crée l'alerte ou met à jour celle qui a le même identifiant. */
  abstract enregistrer(alerte: AlerteSync): Promise<void>;
  abstract lister(filtre: {
    gareId?: string | null;
    compagnieId?: string | null;
    jour?: string;
    ouvertesSeulement?: boolean;
  }): Promise<AlerteSync[]>;
  abstract resoudre(id: string, resolueA: string): Promise<void>;
}
