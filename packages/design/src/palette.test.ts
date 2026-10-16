import { describe, expect, it } from "vitest";
import systeme from "../../../docs/maquettes-v3/Systeme.dc.html?raw";
import { complements, couleurs, teintesEtat } from "./couleurs";

const maquettes = import.meta.glob("../../../docs/maquettes-v3/*.dc.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** « Surface 2 » → « surface2 », « Orange · action » → « orange », « Ambre · le A » → « ambre ». */
function cle(etiquette: string): string {
  const nom = (etiquette.split("·")[0] ?? "").trim();
  return nom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toLowerCase();
}

/** Les pastilles de la planche : un aplat, son nom, puis son code hexadécimal en texte. */
function pastillesDeSysteme(): { cle: string; aplat: string; texte: string }[] {
  const motif =
    /<span style="height: 54px; border-radius: 12px; background: (#[0-9A-Fa-f]{6})[^"]*"><\/span><span style="font-size: 12px; font-weight: 700">([^<]+)<\/span><span style="[^"]*">(#[0-9A-Fa-f]{6})<\/span>/g;
  return [...systeme.matchAll(motif)].map((m) => ({
    cle: cle(m[2] ?? ""),
    aplat: (m[1] ?? "").toUpperCase(),
    texte: (m[3] ?? "").toUpperCase(),
  }));
}

describe("palette et Systeme.dc.html", () => {
  const pastilles = pastillesDeSysteme();

  it("lit les 12 pastilles de la planche", () => {
    expect(pastilles).toHaveLength(12);
  });

  it("chaque pastille a le même code en aplat et en texte", () => {
    for (const p of pastilles) expect(p.aplat, p.cle).toBe(p.texte);
  });

  it("reprend exactement les 12 couleurs de la planche, sans en ajouter à leur groupe", () => {
    const attendu = Object.fromEntries(pastilles.map((p) => [p.cle, p.aplat]));
    const { gris, ...planche } = couleurs;
    expect(planche).toEqual(attendu);
    expect(gris).toBe("#7F8A9E");
  });

  it("le Gris est bien utilisé dans la planche Système", () => {
    expect(systeme.toUpperCase()).toContain(couleurs.gris);
  });

  it("les teintes d'état vert et rouge du ticket sont dans la planche Système", () => {
    const haut = systeme.toUpperCase();
    for (const nom of ["vertFond", "vertBord", "rougeFond"] as const) {
      expect(haut, nom).toContain(teintesEtat[nom]);
    }
  });

  it("toutes les valeurs hexadécimales sont bien formées et en majuscules", () => {
    for (const valeur of [
      ...Object.values(couleurs),
      ...Object.values(teintesEtat),
      ...Object.values(complements),
    ]) {
      expect(valeur).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("aucune couleur n'est inventée : chacune est présente dans au moins une planche", () => {
    const toutes = Object.values(maquettes).join("\n").toUpperCase();
    expect(Object.keys(maquettes).length).toBeGreaterThan(70);
    for (const [nom, valeur] of Object.entries({
      ...couleurs,
      ...teintesEtat,
      ...complements,
    })) {
      expect(toutes, nom).toContain(valeur);
    }
  });

  it("aucune valeur en double entre les trois groupes", () => {
    const valeurs = [
      ...Object.values(couleurs),
      ...Object.values(teintesEtat),
      ...Object.values(complements),
    ];
    expect(new Set(valeurs).size).toBe(valeurs.length);
  });
});
