import { defineConfig } from "prisma/config";

// Charge apps/api/.env s'il existe (développement local). En production, les variables viennent
// de l'environnement du conteneur ; aucun secret n'est écrit dans le dépôt.
try {
  process.loadEnvFile(".env");
} catch {
  /* pas de fichier .env : on utilise l'environnement tel quel */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // `prisma generate` n'ouvre aucune connexion : une valeur factice suffit tant que
    // DATABASE_URL n'est pas définie. Les commandes qui se connectent échoueront clairement.
    url: process.env.DATABASE_URL ?? "postgresql://absent:absent@localhost:5432/absent",
  },
});
