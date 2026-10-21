import type { Prisma } from "../socle/db/generated/client";

/**
 * Petits outils partagés par les adaptateurs PostgreSQL de la caisse, du journal d'agence et de la
 * supervision.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Espace des verrous consultatifs de la caisse et de la supervision (numérotation : 7 017 161). */
export const VERROU_AGENCE = 7_017_164;

/** Verrou valable jusqu'à la fin de la transaction : sérialise les écritures d'une même clé. */
export async function verrouiller(tx: Prisma.TransactionClient, cle: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_AGENCE}::int, hashtext(${cle}))`;
}

/** Vrai si l'erreur (ou sa cause) porte ce code SQLSTATE : le pilote la remonte de façons variées. */
export function estErreurSql(e: unknown, sqlstate: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === sqlstate || o["originalCode"] === sqlstate) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0) || (e instanceof Error && e.message.includes(sqlstate));
}

export const date = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));
