import { z } from "zod";

/**
 * Protocole entre l'appareil et le serveur (`POST /sync/evenements`).
 *
 * L'appareil envoie sa file dans l'ordre où les gestes ont eu lieu ; le serveur rejoue, acquitte
 * chaque événement un par un et renvoie ce que l'appareil doit savoir : sa plage, sa part de
 * sièges hors ligne, un éventuel déblocage accordé par un superviseur et les billets passés
 * « à replacer ». Le serveur applique les mêmes types côté Nest (`apps/api/src/sync/protocole.ts`) :
 * un test d'intégration (apps/api) garde les deux côtés d'accord.
 */

/** L'événement tel qu'il voyage : l'enveloppe de `@afrimove/contrats` (agence), sans typage par type. */
export interface EvenementFile {
  id: string;
  type: string;
  /** Heure de l'appareil au moment du geste, ISO Douala. */
  at: string;
  appareilId: string;
  auteurId: string;
  cible: { type: string; id: string };
  /** Numéro pris dans la plage de l'appareil (types numérotés), sinon `null`. */
  numeroPlage: number | null;
  donnees: unknown;
}

/** Une ligne du lot : l'événement, son rang dans la file de l'appareil et sa signature. */
export interface LigneLot {
  /** Rang dans la file locale de l'appareil (croissant, sans trou). */
  ordre: number;
  evenement: EvenementFile;
  /** ECDSA P-256 / SHA-256 de l'événement canonique, en hexadécimal. */
  signature: string;
}

export interface LotEvenements {
  appareilId: string;
  /** Heure de l'appareil à l'envoi : le serveur mesure l'écart d'horloge. */
  envoyeA: string;
  evenements: LigneLot[];
}

const SchemaIso = z.string().min(10);
const SchemaPlageProtocole = z.object({
  debut: z.number().int().min(1).max(9999),
  fin: z.number().int().min(1).max(9999),
});

export const CODES_REJET = [
  "enveloppe_invalide",
  "type_inconnu",
  "donnees_invalides",
  "signature_invalide",
  "auteur_incoherent",
  "role_non_autorise",
  "appareil_incoherent",
] as const;
export type CodeRejet = (typeof CODES_REJET)[number];

export const SchemaResultatEvenement = z.object({
  evenementId: z.string(),
  /** `accepte` : rejoué ; `deja_recu` : connu, rien refait ; `rejete` : refusé, voir `code`. */
  statut: z.enum(["accepte", "deja_recu", "rejete"]),
  recuA: SchemaIso,
  code: z.string().optional(),
  message: z.string().optional(),
});
export type ResultatEvenement = z.infer<typeof SchemaResultatEvenement>;

/** Un billet passé « à replacer » : un autre appareil avait pris le siège en premier. */
export const SchemaConflit = z.object({
  /** Événement du billet perdant. */
  evenementId: z.string(),
  billetId: z.string(),
  departId: z.string(),
  siege: z.number().int(),
  gagnantBilletId: z.string(),
  detecteA: SchemaIso,
  motif: z.literal("siege_deja_pris"),
});
export type ConflitServeur = z.infer<typeof SchemaConflit>;

export const SchemaOctroi = z.object({
  option: z.enum(["synchroniser", "debloquer_4h", "telephone_secours"]),
  superviseurId: z.string(),
  accordeA: SchemaIso,
  /** Fin du déblocage de 4 h ; `null` pour les autres options. */
  debloqueJusqua: SchemaIso.nullable(),
});
export type Octroi = z.infer<typeof SchemaOctroi>;

export const SchemaVerificateurPin = z.object({
  superviseurId: z.string(),
  sel: z.string(),
  iterations: z.number().int().min(1),
  hache: z.string(),
});
export type VerificateurPin = z.infer<typeof SchemaVerificateurPin>;

export const SchemaReponseLot = z.object({
  serveurA: SchemaIso,
  resultats: z.array(SchemaResultatEvenement),
  appareil: z.object({
    derniereSyncA: SchemaIso,
    /** Plage attribuée à l'appareil (AM-161 la fait évoluer) ; `null` si inchangée. */
    plage: SchemaPlageProtocole.nullable(),
    /** Départ → sièges que cet appareil peut vendre hors ligne. */
    partsHorsLigne: z.record(z.string(), z.array(z.number().int())),
    /** Déblocage accordé par un superviseur, tant qu'il n'a pas été appliqué. */
    octroi: SchemaOctroi.nullable(),
    /** Vérificateurs de PIN superviseur, pour un déblocage sur place sans réseau. */
    verificateursPin: z.array(SchemaVerificateurPin).default([]),
  }),
  /** Billets de cet appareil passés « à replacer », pas encore notifiés. */
  conflits: z.array(SchemaConflit).default([]),
});
export type ReponseLot = z.infer<typeof SchemaReponseLot>;
