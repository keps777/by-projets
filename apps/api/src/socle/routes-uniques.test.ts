import { Controller, Get, Put } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, describe, expect, it } from "vitest";
import { creerAppTest, type AppTest } from "./testing/app-test";

/**
 * Chaque couple (méthode, chemin) n'est servi que par un seul contrôleur dans l'application complète.
 *
 * Pourquoi un test à part : quand deux modules déclarent la même route (deux lots qui implémentent chacun
 * `PUT /patron/reglages/lignes/:ligneId`), le serveur répond avec le premier monté et l'autre est silencieusement
 * mort ; `/openapi.json` fusionne les deux dans une seule entrée et ne montre donc rien. On lit ici les routes
 * réellement enregistrées dans le serveur HTTP, les paramètres de chemin étant tenus pour équivalents
 * (`/a/:id` et `/a/:ligneId` se disputent les mêmes requêtes).
 */

interface CoucheExpress {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Les routes (méthode, chemin) enregistrées dans le serveur HTTP, une entrée par enregistrement. */
export function routesEnregistrees(app: NestExpressApplication): string[] {
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack: CoucheExpress[] };
    _router?: { stack: CoucheExpress[] };
  };
  const pile = (express.router ?? express._router)?.stack;
  if (!pile) throw new Error("Pile de routes Express introuvable");
  const routes: string[] = [];
  for (const couche of pile) {
    if (!couche.route) continue;
    const chemin = couche.route.path.replace(/:[^/]+/g, ":param");
    for (const methode of Object.keys(couche.route.methods)) {
      routes.push(`${methode.toUpperCase()} ${chemin}`);
    }
  }
  return routes;
}

/** Les (méthode, chemin) qui figurent plus d'une fois. */
export function routesEnDouble(routes: readonly string[]): string[] {
  const vues = new Map<string, number>();
  for (const r of routes) vues.set(r, (vues.get(r) ?? 0) + 1);
  return [...vues].filter(([, n]) => n > 1).map(([r]) => r);
}

describe("unicité des routes de l'application complète", () => {
  let t: AppTest | undefined;
  afterAll(async () => {
    await t?.fermer();
  });

  it("aucun couple (méthode, chemin) n'est servi deux fois", async () => {
    t = await creerAppTest();
    const routes = routesEnregistrees(t.app);
    // Garde contre un test vide : l'application sert bien ses routes.
    expect(routes.length).toBeGreaterThan(200);
    expect(routes).toContain("PUT /patron/reglages/lignes/:param");
    expect(routes).toContain("GET /patron/reglages");
    expect(routesEnDouble(routes)).toEqual([]);
  });

  it("les trois routes des lignes du patron n'existent qu'une fois (propriété du module administration)", async () => {
    t ??= await creerAppTest();
    const routes = routesEnregistrees(t.app);
    for (const route of [
      "GET /patron/reglages/lignes/:param",
      "PUT /patron/reglages/lignes/:param",
      "POST /patron/reglages/lignes",
    ]) {
      expect(
        routes.filter((r) => r === route),
        route,
      ).toHaveLength(1);
    }
  });

  it("le détecteur voit un doublon : un contrôleur de plus sur une route existante est signalé", async () => {
    @Controller("patron/reglages/lignes")
    class DoublonLignes {
      @Get(":id")
      lire(): string {
        return "doublon";
      }
      @Put(":autreNom")
      modifier(): string {
        return "doublon";
      }
    }
    const avecDoublon = await creerAppTest({ controleurs: [DoublonLignes] });
    try {
      expect(routesEnDouble(routesEnregistrees(avecDoublon.app)).sort()).toEqual([
        "GET /patron/reglages/lignes/:param",
        "PUT /patron/reglages/lignes/:param",
      ]);
    } finally {
      await avecDoublon.fermer();
    }
  });
});
