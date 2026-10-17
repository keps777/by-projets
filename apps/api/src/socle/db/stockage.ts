import type { AppConfig } from "../config/config";

/**
 * Où les modules métier rangent leurs données.
 *
 * Chaque module métier a deux familles d'adaptateurs derrière ses ports : la **mémoire** (tests,
 * démonstration, développement sans base) et **PostgreSQL** (Prisma). Le choix se fait au montage du
 * module, par cette fonction :
 *
 * - `API_STOCKAGE=postgres` : PostgreSQL, quel que soit l'environnement (développement avec la base
 *   de `docker compose`) ;
 * - `API_STOCKAGE=memoire` : mémoire, quel que soit l'environnement (en production, le garde-fou
 *   du module refuse alors de démarrer) ;
 * - sinon : PostgreSQL en production, mémoire ailleurs. Les tests (`NODE_ENV=test`) restent donc en
 *   mémoire sans rien configurer, et la production n'a jamais de stockage volatil par oubli.
 */
export const VARIABLE_STOCKAGE = "API_STOCKAGE";

export function stockageSurPostgres(
  config: Pick<AppConfig, "env">,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const choix = env[VARIABLE_STOCKAGE]?.trim().toLowerCase();
  if (choix === undefined || choix === "") return config.env === "production";
  if (choix === "postgres") return true;
  if (choix === "memoire") return false;
  // Une faute de frappe ne doit pas basculer silencieusement sur la mémoire.
  throw new Error(`${VARIABLE_STOCKAGE} : « postgres » ou « memoire » attendu (reçu : ${choix})`);
}
