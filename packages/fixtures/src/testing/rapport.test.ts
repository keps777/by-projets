import { describe, expect, it } from "vitest";
import type { Ecran } from "../ecran";
import { ecrans } from "../ecrans";
import { nombre } from "../format";
import type { NomPlanche } from "../planches";
import { compacter, feuilles, htmlPlanche, segmentsPlanche } from "./planches";

/**
 * Outil de relecture (désactivé par défaut) : `RAPPORT=Main pnpm --filter @afrimove/fixtures exec
 * vitest run src/testing/rapport.test.ts` liste les segments de texte de la planche qu'aucune valeur
 * du scénario ne contient. Les libellés fixes de l'interface y figurent aussi : on y cherche les
 * noms, lieux et chiffres oubliés. `RAPPORT=tout` passe toutes les planches en revue.
 */
const demande = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env?.["RAPPORT"];

describe.skipIf(!demande)("rapport de relecture", () => {
  it("segments non repris", () => {
    const noms = demande === "tout" ? Object.keys(ecrans) : (demande ?? "").split(",");
    for (const nom of noms) {
      const e = (ecrans as Partial<Record<NomPlanche, Ecran<unknown>>>)[nom as NomPlanche];
      if (!e) continue;
      const textes = [...feuilles(e.donnees), ...feuilles(e.copie, "copie")].flatMap(
        ({ valeur }) =>
          typeof valeur === "string"
            ? [compacter(valeur)]
            : [String(Math.abs(valeur)), nombre(Math.abs(valeur))],
      );
      const manquants = segmentsPlanche(htmlPlanche(nom)).filter(
        (s) => !textes.some((t) => t.includes(s)),
      );
      console.info(
        `\n=== ${nom} : ${manquants.length} segment(s) non repris\n` +
          manquants.map((s) => `  | ${s}`).join("\n"),
      );
    }
    expect(true).toBe(true);
  });
});
