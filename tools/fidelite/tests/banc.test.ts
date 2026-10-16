import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executer, type Options } from "../src/banc";
import { capturerApp, ouvrirNavigateur } from "../src/capture";
import { chargerConfig } from "../src/config";
import { servirMaquettes } from "../src/maquettes";
import { demarrerEcranFactice, type EcranFactice } from "./ecran-factice";
import type { Browser } from "playwright";

const FIXTURES = resolve(import.meta.dirname, "fixtures/maquettes");
const MAQUETTES_REELLES = resolve(import.meta.dirname, "../../../docs/maquettes-v3");

let app: EcranFactice;
let navigateur: Browser;

beforeAll(async () => {
  app = await demarrerEcranFactice(MAQUETTES_REELLES);
  navigateur = await ouvrirNavigateur();
});
afterAll(async () => {
  await navigateur.close();
  await app.fermer();
});

const tmp = () => mkdtempSync(join(tmpdir(), "fidelite-"));

function options(
  extra: Partial<Omit<Options, "ecrans" | "seuils">> & { ecrans?: unknown; seuils?: unknown } = {},
): Options {
  const dossier = tmp();
  const { ecrans, seuils, ...reste } = extra;
  writeFileSync(join(dossier, "ecrans.json"), JSON.stringify({ ecrans: ecrans ?? {} }));
  writeFileSync(
    join(dossier, "seuils.json"),
    JSON.stringify(seuils ?? { defaut: 3, planches: {} }),
  );
  return {
    planches: ["Factice"],
    appUrl: app.url,
    maquettes: FIXTURES,
    sortie: join(dossier, "sortie"),
    ecrans: join(dossier, "ecrans.json"),
    seuils: join(dossier, "seuils.json"),
    ...reste,
  };
}

describe("chaîne complète sur un faux écran", () => {
  it("écran identique à la planche : 0 %, trois PNG et un rapport", async () => {
    const o = options({ ecrans: { Factice: { route: "/ecran" } } });
    const b = await executer(o);
    const r = b.resultats[0]!;
    expect(r.statut).toBe("ok");
    expect(r.pourcentage).toBe(0);
    expect(b.code).toBe(0);
    for (const f of ["maquette.png", "app.png", "diff.png"]) {
      expect(existsSync(join(o.sortie!, "Factice", f))).toBe(true);
    }
    const html = readFileSync(b.rapport, "utf8");
    expect(html).toContain("Factice/maquette.png");
    expect(html).toContain("Factice/diff.png");
    expect(r.urlApp).toContain("conception=1");
    expect(r.urlApp).toContain("scenario=Factice");
  }, 60_000);

  it("écran différent : dépasse le seuil de 3 % et fait échouer la commande", async () => {
    const o = options({ ecrans: { Factice: { route: "/ecran?variante=altere" } } });
    const b = await executer(o);
    expect(b.resultats[0]!.statut).toBe("depasse");
    expect(b.resultats[0]!.pourcentage).toBeGreaterThan(3);
    expect(b.code).toBe(1);
  }, 60_000);

  it("petit écart sous le seuil : conforme, mais l'écart est mesuré", async () => {
    const b = await executer(options({ ecrans: { Factice: { route: "/ecran?variante=leger" } } }));
    const r = b.resultats[0]!;
    expect(r.pourcentage).toBeGreaterThan(0);
    expect(r.pourcentage).toBeLessThanOrEqual(3);
    expect(r.statut).toBe("ok");
  }, 60_000);

  it("seuil propre à la planche, justifié : un écart plus grand passe et la justification figure au rapport", async () => {
    const b = await executer(
      options({
        ecrans: { Factice: { route: "/ecran?variante=altere" } },
        seuils: {
          defaut: 3,
          planches: {
            Factice: {
              seuil: 60,
              justification: "Variante de test : bouton volontairement différent.",
            },
          },
        },
      }),
    );
    expect(b.resultats[0]!.statut).toBe("ok");
    expect(readFileSync(b.rapport, "utf8")).toContain("volontairement différent");
  }, 60_000);

  it("--route et --scenario remplacent ecrans.json pour une planche", async () => {
    const b = await executer(options({ route: "/ecran", scenario: "Autre" }));
    expect(b.resultats[0]!.statut).toBe("ok");
    expect(b.resultats[0]!.urlApp).toContain("scenario=Autre");
  }, 60_000);

  it("écran qui répond 404 : écran absent, pas un échec", async () => {
    const b = await executer(options({ ecrans: { Factice: { route: "/interdit" } } }));
    expect(b.resultats[0]!.statut).toBe("absent");
    expect(b.resultats[0]!.raison).toMatch(/404/);
    expect(b.code).toBe(0);
    expect(
      (await executer(options({ ecrans: { Factice: { route: "/interdit" } }, strict: true }))).code,
    ).toBe(1);
  }, 60_000);

  it("planche à la taille du $preview quand le canevas n'a pas d'entrée (1280×900)", async () => {
    const b = await executer(
      options({ planches: ["Large"], ecrans: { Large: { route: "/large" } } }),
    );
    expect(b.resultats[0]).toMatchObject({
      statut: "ok",
      pourcentage: 0,
      largeur: 1280,
      hauteur: 900,
    });
  }, 60_000);

  it("une planche réelle comparée à sa propre copie : Controle 1280×900, 0 %", async () => {
    const o = options({
      planches: ["Controle"],
      maquettes: MAQUETTES_REELLES,
      ecrans: { Controle: { route: "/copie/Controle" } },
    });
    const b = await executer(o);
    expect(b.resultats[0]).toMatchObject({
      statut: "ok",
      pourcentage: 0,
      largeur: 1280,
      hauteur: 900,
    });
  }, 90_000);
});

describe("écrans absents", () => {
  it("--all sans aucun écran déclaré : tout est « absent », code 0, rapport écrit", async () => {
    const b = await executer(options({ planches: "toutes", maquettes: MAQUETTES_REELLES }));
    expect(b.resultats.length).toBe(77);
    expect(b.resultats.every((r) => r.statut === "absent")).toBe(true);
    expect(b.code).toBe(0);
    expect(readFileSync(b.rapport, "utf8")).toContain("écran absent");
  });

  it("app éteinte : écrans déclarés « absents » sans lancer le navigateur, code 0", async () => {
    const b = await executer(
      options({ appUrl: "http://127.0.0.1:1", ecrans: { Factice: { route: "/ecran" } } }),
    );
    expect(b.resultats[0]!.statut).toBe("absent");
    expect(b.resultats[0]!.raison).toMatch(/injoignable/);
    expect(b.code).toBe(0);
  });

  it("planche inconnue : erreur d'usage", async () => {
    await expect(executer(options({ planches: ["Nexiste"] }))).rejects.toThrow(/inconnue/);
  });
});

describe("horloge figée et flag conception", () => {
  const taille = { largeur: 390, hauteur: 844, origine: "défaut" as const };

  it("l'app voit le 05/01/2027 07:38 (Africa/Douala) et le badge TOUCHE 2 quand le flag est actif", async () => {
    const url = `${app.url}/ecran?conception=1`;
    const r = await capturerApp(navigateur, chargerConfig(), url, taille);
    expect(r.etat).toBe("ok");
    if (r.etat === "ok") {
      expect(r.capture.texte).toContain("mardi 5 janvier 2027 · 07:38");
      expect(r.capture.texte).toContain("TOUCHE 2");
    }
  }, 30_000);

  it("le flag conception est aussi posé dans le localStorage", async () => {
    const r = await capturerApp(navigateur, chargerConfig(), `${app.url}/ecran`, taille);
    expect(r.etat === "ok" && r.capture.texte.includes("TOUCHE 2")).toBe(true);
  }, 30_000);

  it("badge manquant dans l'app : avertissement dans le résultat", async () => {
    const b = await executer(options({ ecrans: { Factice: { route: "/sans-flag" } } }));
    expect(b.resultats[0]!.avertissements.join(" ")).toMatch(/TOUCHE n/);
  }, 60_000);
});

describe("support.js manquant", () => {
  it("le serveur de planches fournit le support minimal : <helmet> remonté, x-dc en bloc", async () => {
    const s = await servirMaquettes(MAQUETTES_REELLES);
    try {
      const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await page.goto(`${s.url}/Controle.dc.html`);
      await page.waitForSelector("html[data-planche-prete]");
      expect(await page.evaluate(() => document.querySelectorAll("helmet").length)).toBe(0);
      expect(
        await page.evaluate(() => getComputedStyle(document.querySelector("x-dc")!).display),
      ).toBe("block");
      expect(await page.evaluate(() => document.body.innerText)).toContain("EN DIRECT");
      await ctx.close();
    } finally {
      await s.fermer();
    }
  }, 30_000);
});
