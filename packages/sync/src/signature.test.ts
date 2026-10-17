import { describe, expect, it } from "vitest";
import {
  canonique,
  creerVerificateurPin,
  depuisHex,
  genererCleAppareil,
  pinCorrespond,
  signer,
  verifierSignature,
  versHex,
} from "./signature";

const EVENEMENT = {
  id: "3f2b8c1e-9a4d-4e7b-8c55-0d6f1a2b3c4d",
  type: "billet.vendu",
  at: "2027-01-05T08:30:00.000+01:00",
  appareilId: "a1",
  auteurId: "p1",
  cible: { type: "billet", id: "b1" },
  numeroPlage: 1001,
  donnees: { siege: 24, billetId: "b1", prix: 4000 },
};

describe("canonique", () => {
  it("trie les clés à tous les niveaux et ignore undefined", () => {
    const a = canonique({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } });
    const b = canonique({ a: { c: undefined, d: [1, { y: 2, z: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
  });
});

describe("signature de l'appareil", () => {
  it("signe et vérifie ; la clé privée n'est pas exportable", async () => {
    const cle = await genererCleAppareil();
    expect(cle.privee.extractable).toBe(false);
    const signature = await signer(cle.privee, EVENEMENT);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(await verifierSignature(cle.publique, EVENEMENT, signature)).toBe(true);
  });

  it("l'ordre des clés ne change pas la signature vérifiée", async () => {
    const cle = await genererCleAppareil();
    const signature = await signer(cle.privee, EVENEMENT);
    const remanie = JSON.parse(
      JSON.stringify({ ...EVENEMENT, donnees: { prix: 4000, billetId: "b1", siege: 24 } }),
    );
    expect(await verifierSignature(cle.publique, remanie, signature)).toBe(true);
  });

  it("refuse un événement modifié, une autre clé et une signature mal formée", async () => {
    const cle = await genererCleAppareil();
    const autre = await genererCleAppareil();
    const signature = await signer(cle.privee, EVENEMENT);
    expect(
      await verifierSignature(cle.publique, { ...EVENEMENT, numeroPlage: 1002 }, signature),
    ).toBe(false);
    expect(
      await verifierSignature(cle.publique, { ...EVENEMENT, donnees: { siege: 25 } }, signature),
    ).toBe(false);
    expect(await verifierSignature(autre.publique, EVENEMENT, signature)).toBe(false);
    expect(await verifierSignature(cle.publique, EVENEMENT, "zz")).toBe(false);
    expect(await verifierSignature(cle.publique, EVENEMENT, "")).toBe(false);
  });

  it("hex aller-retour", () => {
    const octets = new Uint8Array([0, 1, 15, 16, 255]);
    expect(versHex(octets)).toBe("00010f10ff");
    expect([...depuisHex("00010f10ff")]).toEqual([...octets]);
    expect(() => depuisHex("abc")).toThrow();
  });
});

describe("vérificateur de PIN superviseur", () => {
  it("accepte le bon PIN, refuse les autres, et ne contient pas le PIN", async () => {
    const v = await creerVerificateurPin("sup-1", "482915", { iterations: 1000 });
    expect(JSON.stringify(v)).not.toContain("482915");
    expect(await pinCorrespond(v, "482915")).toBe(true);
    expect(await pinCorrespond(v, "482916")).toBe(false);
    expect(await pinCorrespond(v, "")).toBe(false);
  });

  it("deux vérificateurs du même PIN diffèrent (sel)", async () => {
    const a = await creerVerificateurPin("sup-1", "482915", { iterations: 1000 });
    const b = await creerVerificateurPin("sup-1", "482915", { iterations: 1000 });
    expect(a.hache).not.toBe(b.hache);
  });
});
