import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

/**
 * Applique les migrations SQL de `prisma/migrations` sans le CLI Prisma (absent de l'image de
 * production). Compatible avec `prisma migrate deploy/dev` : même table `_prisma_migrations`,
 * même somme de contrôle (SHA-256 du fichier), même ordre (nom du dossier). Les deux outils
 * peuvent donc se succéder sur la même base.
 *
 * Chaque migration s'exécute dans sa propre transaction ; un verrou consultatif empêche deux
 * instances de migrer en même temps.
 */

const VERROU_MIGRATION = 7_017_002;

const CREATION_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export class MigrationInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationInvalide";
  }
}

export function sommeDeControle(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function listerMigrations(
  dossier: string,
): Promise<Array<{ nom: string; sql: string; somme: string }>> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const noms = entrees
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const migrations = [];
  for (const nom of noms) {
    const sql = await readFile(path.join(dossier, nom, "migration.sql"), "utf8");
    migrations.push({ nom, sql, somme: sommeDeControle(sql) });
  }
  return migrations;
}

/** Renvoie les noms des migrations appliquées pendant cet appel. */
export async function appliquerMigrations(
  databaseUrl: string,
  dossier: string,
  journal: (message: string) => void = () => undefined,
): Promise<string[]> {
  const migrations = await listerMigrations(dossier);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const appliquees: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [VERROU_MIGRATION]);
    await client.query(CREATION_TABLE);
    const { rows } = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`);

    const terminees = new Map<string, string>();
    for (const r of rows) {
      if (r.rolled_back_at) continue;
      if (!r.finished_at) {
        throw new MigrationInvalide(
          `La migration ${r.migration_name} a échoué auparavant : résoudre à la main (prisma migrate resolve) avant de relancer`,
        );
      }
      terminees.set(r.migration_name, r.checksum);
    }
    for (const m of migrations) {
      const somme = terminees.get(m.nom);
      if (somme !== undefined && somme !== m.somme) {
        throw new MigrationInvalide(
          `La migration ${m.nom} a été modifiée après son application (somme de contrôle différente)`,
        );
      }
    }
    for (const m of migrations) {
      if (terminees.has(m.nom)) continue;
      journal(`Migration ${m.nom}…`);
      try {
        await client.query("BEGIN");
        await client.query(m.sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
           VALUES ($1,$2,$3,now(),1)`,
          [randomUUID(), m.somme, m.nom],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw new MigrationInvalide(
          `Échec de la migration ${m.nom} : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      appliquees.push(m.nom);
    }
    return appliquees;
  } finally {
    await client.end();
  }
}
