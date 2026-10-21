import { describe, expect, it } from "vitest";
import systeme from "../../../docs/maquettes-v3/Systeme.dc.html?raw";
import main from "../../../docs/maquettes-v3/Main.dc.html?raw";
import fontsCss from "../css/fonts.css?raw";
import tokensCss from "../css/tokens.css?raw";
import { couleurVar, cssPolices, cssTokens, variablesCss } from "./css";
import { espaces, gouttiere, pulse, rayonPilule, rayons, rayonsComplementaires } from "./formes";
import {
  famillesPolices,
  hauteursLigne,
  interlettrage,
  poidsPolices,
  policesLocales,
  prechargementPolices,
  stylesTexte,
  tailles,
  taillesMinimales,
} from "./typographie";

const maquettes = import.meta.glob("../../../docs/maquettes-v3/*.dc.html", {
  query: "?raw",
  import: "default",
  eager: true,
});
const toutes = Object.values(maquettes).join("\n");

const fichiersPolices = Object.keys(
  import.meta.glob("../fonts/*.woff2", { query: "?url", import: "default", eager: true }),
).map((chemin) => chemin.split("/").pop());

/** Les fichiers CSS sont mis en forme par Prettier : on compare sans tenir compte des espaces. */
const compact = (texte: string) => texte.replace(/\s+/g, " ").trim();

describe("fichiers CSS", () => {
  it("css/tokens.css correspond aux objets TypeScript", () => {
    expect(compact(tokensCss)).toBe(compact(cssTokens()));
  });

  it("css/fonts.css correspond à la liste des polices locales", () => {
    expect(compact(fontsCss)).toBe(compact(cssPolices()));
  });

  it("toutes les variables sont préfixées --am- et ont une valeur", () => {
    const variables = variablesCss();
    for (const [nom, valeur] of Object.entries(variables)) {
      expect(nom).toMatch(/^--am-[a-z0-9-]+$/);
      expect(valeur).not.toBe("");
    }
    expect(Object.keys(variables).length).toBe(new Set(Object.keys(variables)).size);
  });

  it("expose les variables attendues", () => {
    const v = variablesCss();
    expect(v["--am-nuit"]).toBe("#0B1019");
    expect(v["--am-surface-2"]).toBe("#1B2435");
    expect(v["--am-craie-2"]).toBe("#B5BDCB");
    expect(v["--am-vert-fond"]).toBe("#0E2A1E");
    expect(v["--am-font-titre"]).toContain("Bricolage Grotesque");
    expect(v["--am-fs-14"]).toBe("14px");
    expect(v["--am-radius-pill"]).toBe("999px");
    expect(couleurVar("ambre")).toBe("var(--am-ambre)");
    expect(couleurVar("surface2")).toBe("var(--am-surface-2)");
    expect(couleurVar("vertFond")).toBe("var(--am-vert-fond)");
  });

  it("chaque variable de couleur référencée par couleurVar existe", () => {
    const v = variablesCss();
    for (const nom of ["nuit", "surface2", "craie2", "vertFond", "traitFort"] as const) {
      expect(Object.keys(v)).toContain(couleurVar(nom).slice(4, -1));
    }
  });
});

describe("polices", () => {
  it("les trois familles du ticket, avec leurs replis Arial Black / Arial / Courier New", () => {
    expect(famillesPolices.titre).toBe('"Bricolage Grotesque", "Arial Black", sans-serif');
    expect(famillesPolices.texte).toMatch(/^"Instrument Sans", Arial,/);
    expect(famillesPolices.mono).toBe('"Geist Mono", "Courier New", monospace');
  });

  it("les graisses sont celles demandées dans la planche Système", () => {
    const lien = systeme.match(/fonts\.googleapis\.com\/css2\?([^"]+)"/)?.[1] ?? "";
    const graisses = (famille: string) =>
      (new RegExp(`family=${famille}:wght@([0-9;]+)`).exec(lien)?.[1] ?? "").split(";").map(Number);
    expect(poidsPolices.titre).toEqual(graisses("Bricolage\\+Grotesque"));
    expect(poidsPolices.texte).toEqual(graisses("Instrument\\+Sans"));
    expect(poidsPolices.mono).toEqual(graisses("Geist\\+Mono"));
  });

  it("chaque police locale a un fichier woff2 dans fonts/ et un @font-face", () => {
    expect(policesLocales).toHaveLength(6);
    for (const p of policesLocales) {
      expect(fichiersPolices, p.fichier).toContain(p.fichier);
      expect(fontsCss).toContain(`url("../fonts/${p.fichier}") format("woff2")`);
    }
    expect(fichiersPolices).toHaveLength(policesLocales.length);
  });

  it("les graisses des @font-face couvrent celles de la famille", () => {
    const parFamille = {
      "Bricolage Grotesque": poidsPolices.titre,
      "Instrument Sans": poidsPolices.texte,
      "Geist Mono": poidsPolices.mono,
    } as const;
    for (const p of policesLocales) {
      const [min, max] = p.graisses.split(" ").map(Number);
      const attendues = parFamille[p.famille as keyof typeof parFamille];
      expect(min).toBe(Math.min(...attendues));
      expect(max).toBe(Math.max(...attendues));
    }
  });

  it("précharge uniquement le sous-ensemble latin, un fichier par famille", () => {
    expect(prechargementPolices).toHaveLength(3);
    for (const l of prechargementPolices) {
      expect(l.href).toMatch(/^fonts\/[a-z-]+-latin\.woff2$/);
      expect(l.type).toBe("font/woff2");
    }
  });
});

describe("échelle typographique", () => {
  it("les tailles du ticket y sont", () => {
    for (const t of [10, 11, 12, 13, 14, 15, 18, 20, 28]) {
      expect(tailles as readonly number[]).toContain(t);
    }
  });

  it("chaque taille est utilisée dans au moins une planche", () => {
    for (const t of tailles) expect(toutes, `${t}px`).toContain(`font-size: ${t}px`);
  });

  it("tailles minimales : 14 px texte courant, 18 px montant, 28 px code de retrait", () => {
    expect(taillesMinimales).toEqual({ texteCourant: 14, montant: 18, codeRetrait: 28 });
    expect(stylesTexte.texteCourant.fontSize).toBeGreaterThanOrEqual(taillesMinimales.texteCourant);
    expect(stylesTexte.montant.fontSize).toBeGreaterThanOrEqual(taillesMinimales.montant);
    expect(stylesTexte.codeRetrait.fontSize).toBeGreaterThanOrEqual(taillesMinimales.codeRetrait);
  });

  it("chaque style composé utilise une taille et une famille de l'échelle", () => {
    const familles = Object.values(famillesPolices) as string[];
    for (const [nom, s] of Object.entries(stylesTexte)) {
      expect(tailles as readonly number[], nom).toContain(s.fontSize);
      expect(familles, nom).toContain(s.fontFamily);
    }
  });

  it("les étiquettes mono sont en majuscules, interlettrage .14em", () => {
    expect(stylesTexte.etiquette.textTransform).toBe("uppercase");
    expect(stylesTexte.etiquette.letterSpacing).toBe(".14em");
    expect(interlettrage.etiquetteSerree).toBe(".12em");
  });

  it("interlettrages et hauteurs de ligne existent dans les planches", () => {
    for (const v of Object.values(interlettrage)) {
      expect(toutes, v).toContain(`letter-spacing: ${v}`);
    }
    for (const v of Object.values(hauteursLigne)) {
      const css = v < 1 ? `line-height: ${String(v).slice(1)}` : `line-height: ${v}`;
      expect(toutes, css).toContain(css);
    }
  });

  it("chaque style composé est présent tel quel dans Systeme.dc.html", () => {
    const attendus = [
      ["affiche", "font-size: 56px; font-weight: 800; letter-spacing: -.03em; line-height: .95"],
      ["titre", "font-size: 36px; font-weight: 800; letter-spacing: -.02em; line-height: 1.05"],
      ["codeBillet", "font-size: 48px; font-weight: 700; letter-spacing: .1em; line-height: 1"],
      ["etiquette", "font-size: 11px; letter-spacing: .14em; text-transform: uppercase"],
    ] as const;
    for (const [nom, extrait] of attendus) expect(systeme, nom).toContain(extrait);
  });
});

describe("rayons, espacements, animation", () => {
  it("rayons du ticket : 12, 14, 16, 18, 22 et 999", () => {
    expect([...rayons, rayonPilule]).toEqual([12, 14, 16, 18, 22, 999]);
  });

  it("chaque rayon est utilisé dans au moins une planche", () => {
    for (const r of [...rayons, rayonPilule, ...rayonsComplementaires]) {
      expect(toutes, `${r}px`).toContain(`border-radius: ${r}px`);
    }
  });

  it("chaque écart est utilisé comme gap ou padding dans au moins une planche", () => {
    for (const e of espaces) {
      const trouve = new RegExp(`(gap|padding)[^;"]*\\b${e}px`).test(toutes);
      expect(trouve, `${e}px`).toBe(true);
    }
    expect(gouttiere).toBe(16);
  });

  it("l'animation pulse est celle des planches : opacité 1 → .35, 1,6 s, infinie", () => {
    expect(main).toContain(pulse.keyframes);
    expect(main).toContain(`animation: ${pulse.animation}`);
    expect(pulse).toMatchObject({ duree: "1.6s", iteration: "infinite", opaciteMin: 0.35 });
    expect(tokensCss).toContain("@keyframes pulse");
    expect(tokensCss).toContain("animation: pulse 1.6s infinite");
  });
});
