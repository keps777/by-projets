import { describe, expect, it } from "vitest";
import type { Ecran } from "./ecran";
import { ecrans } from "./ecrans";
import { HORLOGE } from "./horloge";
import { NOMS_PLANCHES, PLANCHES } from "./planches";
import type { NomPlanche } from "./planches";
import {
  contient,
  ecrituresNombre,
  feuilles,
  htmlPlanche,
  jetonSignificatif,
  jetons,
  jetonsPlanche,
  nomsPlanchesHtml,
  textePlanche,
} from "./testing/planches";
import { problemes } from "./validation";
import { MONDE } from "./monde";

const canvas = JSON.parse(
  Object.values(
    import.meta.glob("../../../docs/maquettes-v3/canvas.json", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  )[0] as string,
) as { boards: Record<string, { title: string }> };

describe("couverture des 77 planches", () => {
  it("le canevas des maquettes compte 77 planches, toutes dans le tableau PLANCHES", () => {
    const duCanevas = Object.keys(canvas.boards)
      .map((k) => k.replace(".dc.html", ""))
      .sort();
    expect(duCanevas).toHaveLength(77);
    expect([...NOMS_PLANCHES].sort()).toEqual(duCanevas);
    expect(nomsPlanchesHtml()).toEqual(duCanevas);
  });

  it("chaque planche a son scénario, dans l'index `ecrans`", () => {
    expect(Object.keys(ecrans).sort()).toEqual([...NOMS_PLANCHES].sort());
  });

  it("les titres viennent du canevas", () => {
    for (const nom of NOMS_PLANCHES) {
      expect(PLANCHES[nom].titre, nom).toBe(canvas.boards[`${nom}.dc.html`]?.title);
    }
  });
});

describe.each(NOMS_PLANCHES)("planche %s", (nom) => {
  const e = (ecrans as Partial<Record<NomPlanche, Ecran<unknown>>>)[nom];
  if (!e) {
    it("a un scénario", () => expect.fail(`Pas de scénario pour ${nom}`));
    return;
  }
  const page = textePlanche(htmlPlanche(nom));

  it("porte son nom, son titre et l'horloge figée", () => {
    expect(e.planche).toBe(nom);
    expect(e.titre).toBe(PLANCHES[nom].titre);
    expect(e.horloge).toBe(HORLOGE);
    expect(e.maintenant.slice(0, 10)).toBe("2027-01-05");
  });

  it("ses objets passent la validation du domaine", () => {
    expect(problemes(e.entites, MONDE)).toEqual([]);
  });

  it("n'affiche rien que la planche n'affiche pas", () => {
    const absents: string[] = [];
    const jetonsDePage = jetonsPlanche(page);
    const sources = [...feuilles(e.donnees), ...feuilles(e.copie, "copie")];
    for (const { chemin, valeur } of sources) {
      if (typeof valeur === "string") {
        if (valeur.trim() !== "" && !contient(page, valeur))
          absents.push(`${chemin} = « ${valeur} »`);
      } else if (!ecrituresNombre(valeur).some((t) => jetonsDePage.has(t))) {
        absents.push(`${chemin} = ${valeur}`);
      }
    }
    expect(absents).toEqual([]);
  });

  it("montre tous les nombres de la planche", () => {
    const connus = new Set<string>();
    for (const { valeur } of [...feuilles(e.donnees), ...feuilles(e.copie, "copie")]) {
      if (typeof valeur === "string") jetons(valeur).forEach((j) => connus.add(j));
      else ecrituresNombre(valeur).forEach((j) => connus.add(j));
    }
    const ignores = new Set(e.ignorer);
    const manquants = [...jetonsPlanche(page)].filter(
      (j) => jetonSignificatif(j) && !connus.has(j) && !ignores.has(j),
    );
    expect(manquants.sort()).toEqual([]);
  });

  it("n'ignore que des jetons présents sur la planche", () => {
    const jetonsDePage = jetonsPlanche(page);
    expect(e.ignorer.filter((j) => !jetonsDePage.has(j))).toEqual([]);
  });
});
