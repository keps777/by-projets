import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { utiliserBanc } from "../support/contexte";

/**
 * « Chaque case de la carte des parcours ouvre bien son écran » : on lit les cases (liens) de
 * docs/maquettes-v3/Parcours.dc.html et, pour chacune, on ouvre l'écran correspondant dans l'application
 * (route de tools/fidelite/ecrans.json) : la planche attendue s'affiche, dans un état utilisable.
 */
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const planche = readFileSync(resolve(racine, "docs/maquettes-v3/Parcours.dc.html"), "utf8");
const ecrans = JSON.parse(readFileSync(resolve(racine, "tools/fidelite/ecrans.json"), "utf8")) as {
  ecrans: Record<string, { route: string; scenario?: string }>;
};

interface Case {
  planche: string;
  libelle: string;
}

function lireCases(): Case[] {
  const cases: Case[] = [];
  for (const m of planche.matchAll(/<a href="([A-Za-z]+)\.dc\.html"[^>]*>(.*?)<\/a>/gs)) {
    const textes = [...m[2]!.matchAll(/<span[^>]*>([^<]*)<\/span>/g)]
      .map((x) => x[1]!.trim())
      .filter(Boolean);
    cases.push({ planche: m[1]!, libelle: textes.join(" · ") });
  }
  return cases;
}

const cases = lireCases();
const { ouvrir } = utiliserBanc();

describe("carte des parcours", () => {
  it("compte les cases attendues et chacune a une route dans l'application", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
    const sansRoute = cases.filter((c) => !ecrans.ecrans[c.planche]).map((c) => c.planche);
    expect(sansRoute, "cases sans route déclarée dans tools/fidelite/ecrans.json").toEqual([]);
  });

  it.each(cases.map((c) => [c.planche, c.libelle] as const))(
    "la case %s (%s) ouvre son écran",
    async (nom) => {
      const { route, scenario } = ecrans.ecrans[nom]!;
      const p = await ouvrir({ route, scenario: scenario ?? nom, role: "voyageur", planche: nom });
      await p.attendreEcran(nom);
      await p.absent(p.page.locator(`[data-planche="${nom}"][data-etat="erreur"]`));
      await p.absent(p.page.getByText(/introuvable/i));
      expect(p.etapes).toHaveLength(0);
    },
  );
});
