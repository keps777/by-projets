import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparer } from "../src/comparer";
import { chargerSeuils, nomPlanche, seuilPour } from "../src/config";
import { listerPlanches, tailleDePlanche } from "../src/maquettes";
import { construireUrlApp } from "../src/banc";

const MAQUETTES = resolve(import.meta.dirname, "../../../docs/maquettes-v3");

function png(
  l: number,
  h: number,
  rgba: [number, number, number, number],
  points: [number, number][] = [],
) {
  const p = new PNG({ width: l, height: h });
  for (let i = 0; i < l * h; i++) p.data.set(rgba, i * 4);
  for (const [x, y] of points) p.data.set([255, 255, 255, 255], (y * l + x) * 4);
  return PNG.sync.write(p);
}

describe("comparer", () => {
  it("deux images identiques : 0 %", () => {
    const a = png(10, 10, [11, 16, 25, 255]);
    expect(comparer(a, a).pourcentage).toBe(0);
  });

  it("compte les pixels différents en % du total", () => {
    const a = png(10, 10, [0, 0, 0, 255]);
    const b = png(
      10,
      10,
      [0, 0, 0, 255],
      [
        [0, 0],
        [5, 5],
      ],
    );
    const r = comparer(a, b);
    expect(r.pixelsDifferents).toBe(2);
    expect(r.pourcentage).toBe(2);
    expect(PNG.sync.read(r.diff).width).toBe(10);
  });

  it("tailles différentes : la zone manquante compte comme différence", () => {
    const r = comparer(png(10, 10, [0, 0, 0, 255]), png(10, 20, [0, 0, 0, 255]));
    expect(r.hauteur).toBe(20);
    expect(r.pourcentage).toBe(50);
  });
});

describe("seuils.json", () => {
  const ecrire = (contenu: unknown) => {
    const f = join(mkdtempSync(join(tmpdir(), "fidelite-")), "seuils.json");
    writeFileSync(f, JSON.stringify(contenu));
    return f;
  };

  it("3 % par défaut, seuil propre accepté avec justification", () => {
    const s = chargerSeuils(
      ecrire({
        planches: {
          Main: {
            seuil: 5,
            justification: "Carte du réseau rendue en SVG, anticrénelage différent.",
          },
        },
      }),
    );
    expect(seuilPour(s, "Pass")).toEqual({ seuil: 3, justification: null });
    expect(seuilPour(s, "Main").seuil).toBe(5);
    expect(seuilPour(s, "Main").justification).toMatch(/SVG/);
  });

  it("refuse un seuil sans justification écrite", () => {
    expect(() => chargerSeuils(ecrire({ planches: { Main: { seuil: 5 } } }))).toThrow(
      /justification/,
    );
    expect(() =>
      chargerSeuils(ecrire({ planches: { Main: { seuil: 5, justification: "ok" } } })),
    ).toThrow(/justification/);
  });

  it("refuse un seuil hors de ]0, 100]", () => {
    expect(() => chargerSeuils(ecrire({ defaut: 0 }))).toThrow();
    expect(() =>
      chargerSeuils(ecrire({ planches: { Main: { seuil: 150, justification: "x".repeat(20) } } })),
    ).toThrow();
  });

  it("le seuils.json du dépôt est valide", () => {
    expect(chargerSeuils().defaut).toBe(3);
  });
});

describe("planches réelles", () => {
  it("77 planches, tailles du canevas (Controle 1280×900)", () => {
    expect(listerPlanches(MAQUETTES).length).toBe(77);
    expect(tailleDePlanche(MAQUETTES, "Main")).toMatchObject({ largeur: 390, hauteur: 844 });
    expect(tailleDePlanche(MAQUETTES, "Controle")).toMatchObject({ largeur: 1280, hauteur: 900 });
    expect(tailleDePlanche(MAQUETTES, "Parcours")).toMatchObject({ largeur: 1760, hauteur: 1500 });
  });
});

describe("utilitaires", () => {
  it("nomPlanche accepte nom, fichier ou chemin", () => {
    expect(nomPlanche("Main")).toBe("Main");
    expect(nomPlanche("Main.dc.html")).toBe("Main");
    expect(nomPlanche("docs/maquettes-v3/Main.dc.html")).toBe("Main");
  });

  it("construireUrlApp ajoute scénario, flag conception et horloge", () => {
    const u = new URL(
      construireUrlApp("http://localhost:5173", "/voyager?x=1", "Main", {
        scenario: "scenario",
        conception: "conception",
        horloge: "horloge",
      }),
    );
    expect(u.pathname).toBe("/voyager");
    expect(u.searchParams.get("x")).toBe("1");
    expect(u.searchParams.get("scenario")).toBe("Main");
    expect(u.searchParams.get("conception")).toBe("1");
    expect(u.searchParams.get("horloge")).toBe("2027-01-05T07:38:00+01:00");
  });
});
