import { cp, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { appliquerMigrations } from "../db/migrer";

/**
 * Base PostgreSQL des tests d'intégration. Ces tests sont ignorés quand aucune URL n'est donnée :
 *
 *   DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api test
 *
 * (`TEST_DATABASE_URL` est aussi lu, c'est l'ancien nom.) La base doit être JETABLE : son nom finit
 * par « _test » et son schéma public est vidé avant chaque fichier de tests.
 */
export const URL_BASE_TEST: string | undefined =
  process.env["DATABASE_URL_TEST"] || process.env["TEST_DATABASE_URL"] || undefined;

export const DOSSIER_MIGRATIONS = path.resolve(__dirname, "../../../prisma/migrations");

/** Clé du verrou consultatif qui fait passer les fichiers d'intégration l'un après l'autre. */
const VERROU_BASE_DE_TEST = 7_017_999;

export interface BaseDeTest {
  url: string;
  /** Connexion SQL brute. Elle porte le verrou : la fermer libère la base pour le fichier suivant. */
  sql: Client;
  fermer(): Promise<void>;
}

/**
 * Prend la base de test pour le fichier de tests en cours, la remet à zéro et applique les
 * migrations (toutes, ou celles dont le nom est donné). Vitest lance les fichiers en parallèle et
 * chacun remet le schéma à zéro : le verrou consultatif les sérialise.
 */
export async function preparerBaseDeTest(
  options: { migrations?: (nom: string) => boolean } = {},
): Promise<BaseDeTest> {
  const url = URL_BASE_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST absente : ces tests ne devraient pas s'exécuter");
  const nomBase = new URL(url).pathname.slice(1);
  if (!nomBase.endsWith("_test")) {
    throw new Error(
      `DATABASE_URL_TEST doit viser une base jetable dont le nom finit par _test (reçu : ${nomBase})`,
    );
  }
  const sql = new Client({ connectionString: url });
  await sql.connect();
  try {
    await sql.query("SELECT pg_advisory_lock($1)", [VERROU_BASE_DE_TEST]);
    await sql.query("DROP SCHEMA public CASCADE");
    await sql.query("CREATE SCHEMA public");
    if (options.migrations) {
      const copie = await mkdtemp(path.join(tmpdir(), "migrations-"));
      for (const nom of await readdir(DOSSIER_MIGRATIONS)) {
        if (options.migrations(nom)) {
          await cp(path.join(DOSSIER_MIGRATIONS, nom), path.join(copie, nom), { recursive: true });
        }
      }
      await appliquerMigrations(url, copie);
    } else {
      await appliquerMigrations(url, DOSSIER_MIGRATIONS);
    }
  } catch (e) {
    await sql.end().catch(() => undefined);
    throw e;
  }
  return { url, sql, fermer: () => sql.end() };
}
