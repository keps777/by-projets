import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

/**
 * Démarre l'application web pour les parcours (vitest globalSetup).
 *
 * - `PARCOURS_APP_URL=http://localhost:5xxx` : on utilise cette application déjà lancée, rien n'est démarré.
 * - sinon : `vite build` (mode démo, mocks) puis `vite preview` sur un port libre de 5200 à 5999
 *   (`PARCOURS_PORT` pour en imposer un). Le serveur lancé ici est arrêté à la fin, par son propre PID.
 *   `PARCOURS_SANS_BUILD=1` réutilise `apps/web/dist` tel quel.
 *
 * L'URL est transmise aux tests par `inject("urlApp")`.
 */
const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, "../../..");
const dossierWeb = join(racine, "apps/web");

async function portLibre(): Promise<number> {
  const impose = Number(process.env["PARCOURS_PORT"]);
  const candidats = impose
    ? [impose]
    : Array.from({ length: 40 }, () => 5200 + Math.floor(Math.random() * 800));
  for (const port of candidats) {
    const libre = await new Promise<boolean>((fin) => {
      const s = createServer();
      s.once("error", () => fin(false));
      s.listen(port, "127.0.0.1", () => s.close(() => fin(true)));
    });
    if (libre) return port;
  }
  throw new Error("Aucun port libre entre 5200 et 5999 pour l'application des parcours.");
}

async function attendre(url: string): Promise<void> {
  const fin = Date.now() + 60_000;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`L'application ne répond pas sur ${url}`);
}

declare module "vitest" {
  export interface ProvidedContext {
    urlApp: string;
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const fournie = process.env["PARCOURS_APP_URL"];
  if (fournie) {
    await attendre(fournie);
    project.provide("urlApp", fournie.replace(/\/$/, ""));
    return () => undefined;
  }

  const vite = join(
    dirname(createRequire(join(dossierWeb, "package.json")).resolve("vite/package.json")),
    "bin/vite.js",
  );
  if (process.env["PARCOURS_SANS_BUILD"] !== "1" || !existsSync(join(dossierWeb, "dist"))) {
    execFileSync(process.execPath, [vite, "build"], { cwd: dossierWeb, stdio: "ignore" });
  }

  const port = await portLibre();
  const serveur: ChildProcess = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1"], {
    cwd: dossierWeb,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await attendre(url);
  } catch (e) {
    serveur.kill();
    throw e;
  }
  project.provide("urlApp", url);
  return () => {
    serveur.kill();
  };
}
