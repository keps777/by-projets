import { z } from "zod";

/**
 * Contrat de lecture « quels modules sont visibles pour moi » (`GET /modules/actifs`).
 *
 * Les contrats patron (`@afrimove/contrats`) couvrent le réglage (`ModulesAgence`,
 * `ChangerModule`) mais pas cette lecture, qui sert à toutes les apps : le schéma vit ici en
 * attendant qu'il rejoigne `packages/contrats` (hors du périmètre d'AM-126). L'API l'honore à
 * l'identique, et `apps/api/src/modules/parite.test.ts` valide chaque réponse avec ce schéma.
 */

/** Instant ISO 8601 à Douala (`+01:00`). */
const IsoDoualaSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/,
    "Instant ISO Africa/Douala attendu",
  );

export const ModuleActifSchema = z.strictObject({
  code: z.string().min(1),
  actif: z.boolean(),
});
export type ModuleActif = z.infer<typeof ModuleActifSchema>;

export const ModulesActifsSchema = z.strictObject({
  /** L'agence dont on lit les modules. */
  agenceId: z.string().min(1),
  /** La gare vue (celle du compte par défaut), ou `null`. */
  gareId: z.string().min(1).nullable(),
  /** La ville vue : celle de la gare, ou celle demandée. */
  ville: z.string().min(1).nullable(),
  /** Quand le serveur a calculé cet état. */
  calculeA: IsoDoualaSchema,
  /** Les 12 modules, dans l'ordre du catalogue. */
  modules: z.array(ModuleActifSchema),
});
export type ModulesActifs = z.infer<typeof ModulesActifsSchema>;

/** D'où l'on regarde. Tout est facultatif : le serveur déduit l'agence et la gare du compte. */
export interface ContexteModules {
  /** Agence (un voyageur ou AfriMove la nomme ; un compte d'agence ne peut lire que la sienne). */
  agence?: string;
  /** Gare vue (défaut : celle du compte). */
  gare?: string;
  /** Ville vue, sans gare (voyageur qui parcourt les départs d'une ville). */
  ville?: string;
}
