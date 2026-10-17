// Lance la recette si la machine a de quoi la jouer (PostgreSQL local joignable, Chromium), sinon le dit clairement.
//
// Pourquoi : `pnpm test` à la racine lance les tests de tous les paquets, y compris sur une machine sans PostgreSQL
// (l'intégration continue du dépôt n'en a pas). La recette a besoin de la vraie pile locale ; sans elle, elle ne
// peut pas être jouée, et elle ne doit pas faire croire qu'elle l'a été. `RECETTE_OBLIGATOIRE=1` transforme ce
// « non joué » en échec : c'est le réglage de la recette officielle.
import { spawnSync } from "node:child_process";

const serveur = (process.env.RECETTE_PG ?? "postgresql://afri@localhost:5432").replace(/\/$/, "");
const obligatoire = process.env.RECETTE_OBLIGATOIRE === "1";

const sonde = spawnSync("psql", [`${serveur}/postgres`, "-At", "-c", "select 1"], {
  stdio: "pipe",
});
if (sonde.status !== 0) {
  const raison =
    sonde.error?.code === "ENOENT"
      ? "le client « psql » est absent"
      : `PostgreSQL ne répond pas sur ${serveur}`;
  console.error(`RECETTE NON JOUÉE : ${raison}.`);
  console.error(
    "Elle exige un PostgreSQL local et joue l'API réelle ; voir tests/recette/README.md (RECETTE_PG).",
  );
  process.exit(obligatoire ? 1 : 0);
}

const vitest = spawnSync("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(vitest.status ?? 1);
