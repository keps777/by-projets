import { z } from "zod";
import { SchemaId, SchemaIsoDouala, SchemaSequence, SchemaUuid } from "./commun";

/**
 * Toute écriture de l'agence est un événement, compatible avec le moteur hors ligne (AM-160).
 *
 * Le corps d'une écriture est exactement l'`Evenement` du domaine (`@afrimove/domain`) :
 * `{ id, type, at, appareilId, auteurId, cible, numeroPlage, donnees }`.
 *
 * - `id` : UUID créé sur l'appareil, au moment du geste, jamais par le serveur. Le serveur
 *   dédoublonne sur cet identifiant : renvoyer le même événement (retour du réseau, relance) ne crée
 *   rien de plus (`statut: "deja_recu"`). C'est ce qui permet de rejouer une file hors ligne.
 * - `numeroPlage` : numéro pris dans la plage de l'appareil (guichet 0001–0999, 1001–1999…,
 *   convoyeurs 3001–3999) quand l'événement crée un document numéroté (billet, billet de cadence,
 *   vente en route, régularisation). Les événements de ce type exigent un entier de 1 à 9999 ; les
 *   autres portent `null`.
 * - `donnees` : le contenu métier, propre à chaque type.
 */

/** Types de documents ou d'objets sur lesquels porte un événement. */
export const TYPES_CIBLE = [
  "billet",
  "colis",
  "depart",
  "session",
  "appareil",
  "personne",
  "demande",
  "controle",
] as const;
export type TypeCible = (typeof TYPES_CIBLE)[number];

export const SchemaCibleEvenement = z.object({
  type: z.enum(TYPES_CIBLE),
  id: SchemaId,
});
export type CibleEvenement = z.infer<typeof SchemaCibleEvenement>;

/** Numéro pris dans la plage de l'appareil (NNNN). */
export const SchemaNumeroPlage = SchemaSequence;

/** Un événement d'agence typé : `T` le type, `D` les données, `N` vrai s'il crée un document numéroté. */
export interface EvenementAgence<T extends string, D, N extends boolean = false> {
  id: string;
  type: T;
  at: string;
  appareilId: string;
  auteurId: string;
  cible: CibleEvenement;
  numeroPlage: N extends true ? number : null;
  donnees: D;
}

/** La définition d'un type d'événement : son schéma, s'il est numéroté, sa cible. */
export interface DefinitionEvenement<T extends string, D extends z.ZodType, N extends boolean> {
  readonly type: T;
  readonly numerote: N;
  readonly donnees: D;
  /** Schéma complet de l'événement (le corps de l'écriture). */
  readonly schema: z.ZodType<EvenementAgence<T, z.infer<D>, N>>;
  /** Objet sur lequel porte l'événement, déduit des données. */
  readonly cible: (donnees: z.infer<D>) => CibleEvenement;
}

export function definirEvenement<T extends string, D extends z.ZodType, N extends boolean>(def: {
  type: T;
  numerote: N;
  donnees: D;
  cible: (donnees: z.infer<D>) => CibleEvenement;
}): DefinitionEvenement<T, D, N> {
  const schema = z.object({
    id: SchemaUuid,
    type: z.literal(def.type),
    at: SchemaIsoDouala,
    appareilId: SchemaId,
    auteurId: SchemaId,
    cible: SchemaCibleEvenement,
    numeroPlage: def.numerote ? SchemaNumeroPlage : z.null(),
    donnees: def.donnees,
  }) as unknown as z.ZodType<EvenementAgence<T, z.infer<D>, N>>;
  return { type: def.type, numerote: def.numerote, donnees: def.donnees, schema, cible: def.cible };
}

/** Le type TypeScript d'un événement défini par `definirEvenement`. */
export type EvenementDe<E> =
  E extends DefinitionEvenement<infer T, infer D, infer N>
    ? EvenementAgence<T, z.infer<D>, N>
    : never;

/** Les données d'un événement défini par `definirEvenement`. */
export type DonneesDe<E> =
  E extends DefinitionEvenement<string, infer D, boolean> ? z.infer<D> : never;

/**
 * Accusé de réception d'un événement. `deja_recu` : le serveur connaissait déjà cet identifiant,
 * il n'a rien créé de plus et renvoie le résultat de la première fois.
 */
export const SchemaAccuse = z.object({
  evenementId: SchemaUuid,
  statut: z.enum(["accepte", "deja_recu"]),
  recuA: SchemaIsoDouala,
});
export type Accuse = z.infer<typeof SchemaAccuse>;

/** Réponse des écritures qui ne renvoient que l'accusé. */
export const SchemaResultatSimple = z.object({ accuse: SchemaAccuse });
export type ResultatSimple = z.infer<typeof SchemaResultatSimple>;
