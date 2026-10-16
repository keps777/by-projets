import type { ContexteSeed } from "./seed";

/**
 * POINT D'ENTRÉE du seed depuis les fixtures (@afrimove/fixtures, AM-011).
 *
 * Le ticket AM-011 n'est pas encore fusionné : rien n'est semé ici pour l'instant. Quand il le
 * sera, ce fichier lira les fixtures, les convertira (téléphones chiffrés via `ctx.comptes`,
 * historiques en JSONB) et les écrira avec `ctx.prisma`, de façon rejouable (upsert par numéro).
 *
 * Note : @afrimove/fixtures et @afrimove/domain sont du TypeScript non compilé (pas de dossier
 * dist) ; avant de les importer ici, il faudra leur donner un vrai build (voir apps/api/README.md).
 */
export async function semerFixtures(ctx: ContexteSeed): Promise<void> {
  ctx.journal("Fixtures AM-011 : point d'entrée prêt, rien à semer pour l'instant.");
}
