import { describe, expect, it } from "vitest";
import {
  aleaCrypto,
  emettreCodeRetrait,
  estCodeBillet,
  estCodeRetrait,
  genererCodeBillet,
  genererCodeBilletUnique,
  genererCodeRetrait,
  hacherCodeRetrait,
  verifierCodeRetrait,
} from "./codes";
import { aleaGraine } from "./testing/alea";

describe("code du billet : 4 chiffres", () => {
  it("a toujours 4 chiffres, zéros initiaux compris", () => {
    const alea = aleaGraine(1);
    const codes = Array.from({ length: 2000 }, () => genererCodeBillet(alea));
    expect(codes.every(estCodeBillet)).toBe(true);
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
  });

  it("est unique parmi ceux du départ, même quand presque tous sont pris", () => {
    const alea = aleaGraine(2);
    const pris = new Set<string>();
    for (let n = 0; n < 9999; n++) pris.add(String(n).padStart(4, "0"));
    expect(genererCodeBilletUnique(alea, pris)).toBe("9999");
    pris.add("9999");
    expect(() => genererCodeBilletUnique(alea, pris)).toThrow();
  });

  it("refuse un générateur hors de [0, 1)", () => {
    expect(() => genererCodeBillet(() => 1)).toThrow(RangeError);
  });
});

describe("code de retrait : 6 chiffres, haché", () => {
  it("a 6 chiffres", () => {
    const alea = aleaGraine(3);
    for (let i = 0; i < 500; i++) expect(estCodeRetrait(genererCodeRetrait(alea))).toBe(true);
  });

  it("n'est jamais stocké en clair : le haché ne contient pas le code et dépend du sel", async () => {
    const a = await hacherCodeRetrait("482913", "sel-a");
    const b = await hacherCodeRetrait("482913", "sel-b");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("482913");
    expect(a).not.toBe(b);
    expect(await hacherCodeRetrait("482913", "sel-a")).toBe(a);
  });

  it("vérifie le bon code et refuse les autres", async () => {
    const { code, hache, sel } = await emettreCodeRetrait(aleaGraine(4), "poivre");
    expect(estCodeRetrait(code)).toBe(true);
    expect(await verifierCodeRetrait(code, hache, sel, "poivre")).toBe(true);
    const faux = code === "000000" ? "000001" : "000000";
    expect(await verifierCodeRetrait(faux, hache, sel, "poivre")).toBe(false);
    expect(await verifierCodeRetrait(code, hache, sel, "autre-poivre")).toBe(false);
    expect(await verifierCodeRetrait("12345", hache, sel, "poivre")).toBe(false);
    expect(await verifierCodeRetrait("abcdef", hache, sel, "poivre")).toBe(false);
  });

  it("refuse de hacher autre chose que 6 chiffres", async () => {
    await expect(hacherCodeRetrait("1234", "s")).rejects.toThrow(RangeError);
  });
});

describe("aleaCrypto", () => {
  it("renvoie des nombres dans [0, 1)", () => {
    const alea = aleaCrypto();
    for (let i = 0; i < 100; i++) {
      const x = alea();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
