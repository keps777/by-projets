import type { AppConfig } from "../socle/config/config";

/** Un port de persistance déclare `durable = false` quand il vit en mémoire. */
export interface StockageAgence {
  readonly durable: boolean;
}

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de la caisse ou de la supervision est
 * encore branché sur la mémoire (sessions, demandes et journal seraient perdus au premier
 * redémarrage). Les adaptateurs PostgreSQL sont décrits dans les README de `src/caisse` et
 * `src/supervision`.
 */
export function exigerStockageDurable(
  module: string,
  config: AppConfig,
  ports: readonly [string, unknown][],
): void {
  if (config.env !== "production") return;
  const volatils = ports
    .filter(([, port]) => (port as Partial<StockageAgence>).durable === false)
    .map(([nom]) => nom);
  if (volatils.length > 0) {
    throw new Error(
      `${module} : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs PostgreSQL ` +
        "(tables à créer dans apps/api/prisma) avant de démarrer en production.",
    );
  }
}
