import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import type { Pile } from "./config";
import { attendre, envApi as envDeLApi, portLibre } from "./processus";

/**
 * Démarre la VRAIE pile locale de la recette (vitest globalSetup) :
 *
 * 1. une base PostgreSQL neuve (`afrimove_recette`, supprimée puis recréée) ;
 * 2. l'API NestJS compilée (`apps/api/dist`), migrations (`migrate.js`), seed (`seed.js`) puis données de
 *    recette (`semer-recette.cjs`), lancée avec `API_STOCKAGE=postgres` ;
 * 3. `apps/web` construit en mode HTTP (`VITE_API_MODE=http`, `VITE_API_URL` = l'API) et servi par `vite preview`.
 *
 * Variables : `RECETTE_PG` (serveur, défaut `postgresql://afri@localhost:5432`), `RECETTE_BASE`
 * (défaut `afrimove_recette`, le nom doit finir par `_recette` ou `_test`), `RECETTE_SANS_BUILD=1` (réutilise
 * `apps/api/dist`), `RECETTE_SANS_WEB=1` (ne construit pas le web), `RECETTE_API_URL` (API déjà lancée : rien n'est
 * démarré, la base n'est pas touchée), `RECETTE_PORT_API` / `RECETTE_PORT_WEB` (ports imposés, sinon 5200–5999).
 * Les processus lancés ici sont arrêtés à la fin, chacun par son propre PID.
 */
const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, "../../..");
const dossierApi = join(racine, "apps/api");
const dossierWeb = join(racine, "apps/web");

declare module "vitest" {
  export interface ProvidedContext {
    pile: Pile;
  }
}

function psql(serveur: string, base: string, sql: string): void {
  execFileSync("psql", [`${serveur}/${base}`, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], {
    stdio: "pipe",
  });
}

export default async function setup(project: TestProject): Promise<() => void> {
  const serveurPg = (process.env["RECETTE_PG"] ?? "postgresql://afri@localhost:5432").replace(
    /\/$/,
    "",
  );
  const base = process.env["RECETTE_BASE"] ?? "afrimove_recette";
  const apiFournie = process.env["RECETTE_API_URL"];
  if (apiFournie) {
    await attendre(`${apiFournie}/health`);
    project.provide("pile", {
      urlApi: apiFournie.replace(/\/$/, ""),
      urlWeb: process.env["RECETTE_WEB_URL"] ?? null,
      journalApi: process.env["RECETTE_JOURNAL_API"] ?? "",
      serveurPg,
      base,
      dossierApi,
      racine,
      apiPretA: null,
    });
    return () => undefined;
  }
  if (!/_(recette|test)$/.test(base)) {
    throw new Error(`Base « ${base} » refusée : le nom doit finir par _recette ou _test.`);
  }

  const enfants: ChildProcess[] = [];
  const nettoyage: Array<() => void> = [];
  const arreter = (): void => {
    for (const e of enfants) if (!e.killed) e.kill();
    for (const f of nettoyage) f();
  };

  try {
    const portApi = Number(process.env["RECETTE_PORT_API"]) || (await portLibre([]));
    const portWeb = Number(process.env["RECETTE_PORT_WEB"]) || (await portLibre([portApi]));
    const urlApi = `http://127.0.0.1:${portApi}`;
    const urlWeb = `http://127.0.0.1:${portWeb}`;

    // 1. Base neuve.
    psql(serveurPg, "postgres", `drop database if exists ${base} with (force)`);
    psql(serveurPg, "postgres", `create database ${base}`);

    // 2. API compilée.
    if (
      process.env["RECETTE_SANS_BUILD"] !== "1" ||
      !existsSync(join(dossierApi, "dist/main.js"))
    ) {
      execFileSync("pnpm", ["--filter", "@afrimove/api", "run", "build"], {
        cwd: racine,
        stdio: "pipe",
      });
    }
    const envApi = envDeLApi({
      serveurPg,
      base,
      portApi,
      origines: `${urlWeb},http://localhost:${portWeb}`,
    });
    const node = process.execPath;
    execFileSync(node, [join(dossierApi, "dist/migrate.js")], {
      cwd: dossierApi,
      env: envApi,
      stdio: "pipe",
    });
    execFileSync(node, [join(dossierApi, "dist/seed.js")], {
      cwd: dossierApi,
      env: envApi,
      stdio: "pipe",
    });
    execFileSync(node, [join(ici, "semer-recette.cjs"), dossierApi], {
      cwd: dossierApi,
      env: envApi,
      stdio: "pipe",
    });

    // Le journal de l'API garde les « SMS » du simulateur : c'est là que les scénarios lisent les codes de connexion.
    const dossierJournal = mkdtempSync(join(tmpdir(), "afrimove-recette-api-"));
    nettoyage.push(() => rmSync(dossierJournal, { recursive: true, force: true }));
    const journalApi = join(dossierJournal, "api.log");
    const sortieApi = openSync(journalApi, "a");
    const api = spawn(node, [join(dossierApi, "dist/main.js")], {
      cwd: dossierApi,
      env: envApi,
      stdio: ["ignore", sortieApi, sortieApi],
    });
    closeSync(sortieApi);
    enfants.push(api);
    await attendre(`${urlApi}/health`);
    const apiPretA = Date.now();

    // 3. Web en mode HTTP.
    let urlWebServie: string | null = null;
    if (process.env["RECETTE_SANS_WEB"] !== "1") {
      const vite = join(
        dirname(createRequire(join(dossierWeb, "package.json")).resolve("vite/package.json")),
        "bin/vite.js",
      );
      const sortie = mkdtempSync(join(tmpdir(), "afrimove-recette-web-"));
      nettoyage.push(() => rmSync(sortie, { recursive: true, force: true }));
      execFileSync(node, [vite, "build", "--outDir", sortie, "--emptyOutDir"], {
        cwd: dossierWeb,
        env: { ...process.env, VITE_API_MODE: "http", VITE_API_URL: urlApi },
        stdio: "pipe",
      });
      const web = spawn(
        node,
        [vite, "preview", "--host", "127.0.0.1", "--port", String(portWeb), "--outDir", sortie],
        { cwd: dossierWeb, env: { ...process.env, PORT: String(portWeb) }, stdio: "ignore" },
      );
      enfants.push(web);
      await attendre(urlWeb);
      urlWebServie = urlWeb;
    }

    project.provide("pile", {
      urlApi,
      urlWeb: urlWebServie,
      journalApi,
      serveurPg,
      base,
      dossierApi,
      racine,
      apiPretA,
    });
  } catch (e) {
    arreter();
    throw e;
  }
  return arreter;
}
