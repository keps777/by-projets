import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { DOSSIER_OUTIL } from "./config";

export type Taille = {
  largeur: number;
  hauteur: number;
  origine: "canvas.json" | "$preview" | "défaut";
};

const TAILLE_DEFAUT = { largeur: 390, hauteur: 844 };

export function listerPlanches(dossier: string): string[] {
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".dc.html"))
    .map((f) => f.replace(/\.dc\.html$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Taille de capture d'une planche : celle du canevas (canvas.json, boards[X].w/h), sinon le
 * `$preview` de son script x-dc, sinon 390×844. Controle = 1280×900, Parcours = 1760×1500, etc.
 */
export function tailleDePlanche(dossier: string, planche: string): Taille {
  const canvas = join(dossier, "canvas.json");
  if (existsSync(canvas)) {
    const c = JSON.parse(readFileSync(canvas, "utf8")) as {
      boards?: Record<string, { w?: number; h?: number }>;
    };
    const b = c.boards?.[`${planche}.dc.html`];
    if (b?.w && b?.h) return { largeur: b.w, hauteur: b.h, origine: "canvas.json" };
  }
  const html = readFileSync(join(dossier, `${planche}.dc.html`), "utf8");
  const m = html.match(/data-props='([^']*)'/);
  if (m?.[1]) {
    try {
      const p = (JSON.parse(m[1]) as { $preview?: { width?: number; height?: number } }).$preview;
      if (p?.width && p?.height)
        return { largeur: p.width, hauteur: p.height, origine: "$preview" };
    } catch {
      /* repli sur la taille par défaut */
    }
  }
  return { ...TAILLE_DEFAUT, origine: "défaut" };
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export type ServeurMaquettes = { url: string; fermer: () => Promise<void> };

/**
 * Sert docs/maquettes-v3 en HTTP local. Les planches demandent `./support.js`, absent du dépôt
 * (il est fourni par le canevas) : on répond avec support/support.js, le minimum pour les
 * afficher seules. Un vrai support.js déposé à côté des planches reste prioritaire.
 */
export async function servirMaquettes(dossier: string): Promise<ServeurMaquettes> {
  const racine = resolve(dossier);
  const supportMinimal = resolve(DOSSIER_OUTIL, "support", "support.js");
  const serveur: Server = createServer((req, res) => {
    const chemin = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    let fichier = normalize(join(racine, chemin));
    if (fichier !== racine && !fichier.startsWith(racine + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(fichier) && chemin === "/support.js") fichier = supportMinimal;
    if (!existsSync(fichier)) {
      res.writeHead(404).end("introuvable");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(fichier)] ?? "application/octet-stream" });
    res.end(readFileSync(fichier));
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  const { port } = serveur.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    fermer: () => new Promise<void>((ok) => serveur.close(() => ok())),
  };
}
