import path from "node:path";
import { appliquerMigrations } from "./socle/db/migrer";

/** `node dist/migrate.js` : applique les migrations (commande DEV_MIGRATE_COMMAND d'infra/README.md). */
async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL est obligatoire");
    process.exit(1);
  }
  const dossier =
    process.env["MIGRATIONS_DIR"] ?? path.resolve(__dirname, "..", "prisma", "migrations");
  const faites = await appliquerMigrations(url, dossier, (m) => console.log(m));
  console.log(faites.length === 0 ? "Base à jour." : `${faites.length} migration(s) appliquée(s).`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
