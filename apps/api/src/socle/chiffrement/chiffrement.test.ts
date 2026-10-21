import { describe, expect, it } from "vitest";
import { configTest } from "../testing/app-test";
import { ChiffrementInvalide, ChiffrementService } from "./chiffrement.service";

const service = (surcharge: Record<string, string> = {}) =>
  new ChiffrementService(configTest(surcharge));

describe("chiffrement au repos (AES-256-GCM)", () => {
  it("chiffre et déchiffre, sans jamais laisser la valeur en clair", () => {
    const s = service();
    const c = s.chiffrer("+237655000001", "personne.telephone");
    expect(c.startsWith("enc:v1:k1:")).toBe(true);
    expect(c).not.toContain("655000001");
    expect(s.dechiffrer(c, "personne.telephone")).toBe("+237655000001");
  });

  it("produit un chiffré différent à chaque appel (nonce aléatoire)", () => {
    const s = service();
    expect(s.chiffrer("x", "ctx")).not.toBe(s.chiffrer("x", "ctx"));
  });

  it("refuse un chiffré altéré", () => {
    const s = service();
    const c = s.chiffrer("secret", "ctx");
    const altere = `${c.slice(0, -2)}${c.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => s.dechiffrer(altere, "ctx")).toThrow(ChiffrementInvalide);
  });

  it("lie le chiffré à son contexte : copié dans une autre colonne, il est refusé", () => {
    const s = service();
    const c = s.chiffrer("+237655000001", "personne.telephone");
    expect(() => s.dechiffrer(c, "billet.passager")).toThrow(ChiffrementInvalide);
  });

  it("refuse une valeur non chiffrée et une clé inconnue", () => {
    const s = service();
    expect(() => s.dechiffrer("+237655000001", "ctx")).toThrow(ChiffrementInvalide);
    const autre = service({
      ENCRYPTION_KEY_ID: "k9",
      ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    });
    expect(() => s.dechiffrer(autre.chiffrer("x", "ctx"), "ctx")).toThrow(/inconnue/);
  });

  it("une autre clé ne déchiffre pas", () => {
    const s = service();
    const faux = service({ ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64") });
    expect(() => faux.dechiffrer(s.chiffrer("x", "ctx"), "ctx")).toThrow(ChiffrementInvalide);
  });

  it("rotation : l'ancienne clé déchiffre, la nouvelle chiffre, rechiffrer migre", () => {
    const ancienneCle = Buffer.alloc(32, 7).toString("base64"); // = ENCRYPTION_KEY de test
    const avant = service();
    const chiffreAncien = avant.chiffrer("donnee", "ctx");

    const apres = service({
      ENCRYPTION_KEY_ID: "k2",
      ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
      ENCRYPTION_PREVIOUS_KEYS: `k1:${ancienneCle}`,
    });
    expect(apres.dechiffrer(chiffreAncien, "ctx")).toBe("donnee");
    expect(apres.doitEtreRechiffre(chiffreAncien)).toBe(true);
    const migre = apres.rechiffrer(chiffreAncien, "ctx");
    expect(migre.startsWith("enc:v1:k2:")).toBe(true);
    expect(apres.doitEtreRechiffre(migre)).toBe(false);
    expect(apres.dechiffrer(migre, "ctx")).toBe("donnee");
  });

  it("chiffre du JSON", () => {
    const s = service();
    const passager = { nom: "Awa", telephone: "+237655000009", pieceQuatreDerniers: "4821" };
    const c = s.chiffrerJson(passager, "billet.passager");
    expect(c).not.toContain("Awa");
    expect(s.dechiffrerJson(c, "billet.passager")).toEqual(passager);
  });
});

describe("index aveugle", () => {
  it("est déterministe, propre au contexte et ne contient pas la valeur", () => {
    const s = service();
    const a = s.indexAveugle("+237655000001", "telephone");
    expect(a).toBe(s.indexAveugle("+237655000001", "telephone"));
    expect(a).not.toBe(s.indexAveugle("+237655000002", "telephone"));
    expect(a).not.toBe(s.indexAveugle("+237655000001", "autre"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dépend de la clé (sans elle, on ne peut pas tester des numéros)", () => {
    const a = service().indexAveugle("+237655000001", "telephone");
    const b = service({ BLIND_INDEX_KEY: Buffer.alloc(32, 1).toString("base64") }).indexAveugle(
      "+237655000001",
      "telephone",
    );
    expect(a).not.toBe(b);
  });
});
