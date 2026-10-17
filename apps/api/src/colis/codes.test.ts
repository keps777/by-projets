import { describe, expect, it } from "vitest";
import {
  emettreCodeRetrait,
  estCodeRetrait,
  genererCodeRetrait,
  genererSel,
  hacherCodeRetrait,
  poivreCodeRetrait,
  verifierCodeRetrait,
} from "./codes";

describe("code de retrait", () => {
  it("tire six chiffres, avec les zéros du début", () => {
    expect(genererCodeRetrait(() => 0)).toBe("000000");
    expect(genererCodeRetrait(() => 0.9999999)).toBe("999999");
    for (let i = 0; i < 200; i += 1) expect(genererCodeRetrait()).toMatch(/^\d{6}$/);
  });

  it("tire un sel de 16 octets en hexadécimal, différent à chaque fois", () => {
    const a = genererSel();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(genererSel()).not.toBe(a);
  });

  it("reconnaît un code à six chiffres seulement", () => {
    expect(estCodeRetrait("482913")).toBe(true);
    for (const faux of ["48291", "4829133", "48291a", " 482913", "", "482 913"]) {
      expect(estCodeRetrait(faux), faux).toBe(false);
    }
  });

  it("hache avec le sel et le poivre : le code ne se lit pas dans le haché", () => {
    const h = hacherCodeRetrait("482913", "sel", "poivre");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("482913");
    expect(hacherCodeRetrait("482913", "sel", "poivre")).toBe(h);
    expect(hacherCodeRetrait("482913", "autre sel", "poivre")).not.toBe(h);
    expect(hacherCodeRetrait("482913", "sel", "autre poivre")).not.toBe(h);
    expect(hacherCodeRetrait("482914", "sel", "poivre")).not.toBe(h);
    expect(() => hacherCodeRetrait("12", "sel", "poivre")).toThrow(RangeError);
  });

  it("vérifie le bon code et refuse tout le reste", () => {
    const { code, hache, sel } = emettreCodeRetrait("poivre");
    expect(verifierCodeRetrait(code, hache, sel, "poivre")).toBe(true);
    const autre = code === "000000" ? "000001" : "000000";
    expect(verifierCodeRetrait(autre, hache, sel, "poivre")).toBe(false);
    expect(verifierCodeRetrait(code, hache, sel, "autre poivre")).toBe(false);
    expect(verifierCodeRetrait("abc", hache, sel, "poivre")).toBe(false);
    expect(verifierCodeRetrait(code, hache.slice(0, 10), sel, "poivre")).toBe(false);
    expect(verifierCodeRetrait(code, "", sel, "poivre")).toBe(false);
  });

  it("dérive le poivre du secret du serveur sans le révéler", () => {
    const secret = Buffer.from("un-secret-serveur-de-32-octets-ok");
    const poivre = poivreCodeRetrait(secret);
    expect(poivre).toMatch(/^[0-9a-f]{64}$/);
    expect(poivre).not.toContain(secret.toString("hex").slice(0, 16));
    expect(poivreCodeRetrait(Buffer.from("autre"))).not.toBe(poivre);
  });
});
