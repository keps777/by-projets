import { ErreurHttp } from "@afrimove/api-client";
import { describe, expect, it } from "vitest";
import { heureDouala, montant, nomSansTitre, prenom } from "./formats";
import {
  blocageEnCours,
  canonique,
  compteBloque,
  deriverCle,
  enregistrerBlocage,
  leverBlocage,
  pinRefuse,
  signer,
} from "./pin";

describe("canonique", () => {
  it("trie les clés à tous les niveaux et ignore undefined", () => {
    expect(canonique({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[{"y":2,"z":1}]},"b":1}',
    );
  });

  it("donne le même texte quel que soit l'ordre des clés", () => {
    expect(canonique({ a: 1, b: 2 })).toBe(canonique({ b: 2, a: 1 }));
  });
});

describe("signature de la décision", () => {
  const contenu = { decision: "valider", sessionId: "s1", ecart: -1000, commentaire: null };

  it("donne 64 caractères hexadécimaux, stables pour le même PIN et le même contenu", async () => {
    const cle = await deriverCle("246813", "pers-essono");
    const signature = await signer(cle, contenu);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await signer(await deriverCle("246813", "pers-essono"), contenu)).toBe(signature);
    // L'ordre des clés du contenu ne change rien.
    expect(
      await signer(cle, { ecart: -1000, commentaire: null, sessionId: "s1", decision: "valider" }),
    ).toBe(signature);
  });

  it("change avec le PIN, avec le superviseur et avec chaque champ de la décision", async () => {
    const base = await signer(await deriverCle("246813", "pers-essono"), contenu);
    const autres = await Promise.all([
      signer(await deriverCle("246814", "pers-essono"), contenu),
      signer(await deriverCle("246813", "pers-autre"), contenu),
      signer(await deriverCle("246813", "pers-essono"), { ...contenu, ecart: -999 }),
      signer(await deriverCle("246813", "pers-essono"), { ...contenu, decision: "refuser" }),
      signer(await deriverCle("246813", "pers-essono"), { ...contenu, commentaire: "x" }),
    ]);
    expect(new Set([base, ...autres]).size).toBe(6);
  });

  it("la clé dérivée n'est pas exportable : le PIN ne peut pas en être relu", async () => {
    const cle = await deriverCle("246813", "pers-essono");
    expect(cle.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", cle)).rejects.toThrow();
  });
});

describe("erreurs du serveur", () => {
  it("reconnaît un PIN refusé (401 ou PIN_INCORRECT), pas une autre erreur 403", () => {
    expect(pinRefuse(new ErreurHttp(401, "x"))).toBe(true);
    expect(pinRefuse(new ErreurHttp(403, "x", "PIN_INCORRECT"))).toBe(true);
    expect(pinRefuse(new ErreurHttp(403, "x", "SUPERVISEUR_REQUIS"))).toBe(false);
    expect(pinRefuse(new ErreurHttp(500, "x"))).toBe(false);
    expect(pinRefuse(new Error("x"))).toBe(false);
  });

  it("reconnaît un compte bloqué (423 ou PIN_BLOQUE)", () => {
    expect(compteBloque(new ErreurHttp(423, "x"))).toBe(true);
    expect(compteBloque(new ErreurHttp(403, "x", "PIN_BLOQUE"))).toBe(true);
    expect(compteBloque(new ErreurHttp(401, "x", "PIN_INCORRECT"))).toBe(false);
  });
});

describe("blocage du clavier", () => {
  it("se garde par superviseur jusqu'à son échéance, puis se lève", () => {
    expect(blocageEnCours("pers-essono", 1000)).toBeNull();
    enregistrerBlocage("pers-essono", 5000);
    expect(blocageEnCours("pers-essono", 1000)).toBe(5000);
    expect(blocageEnCours("pers-autre", 1000)).toBeNull();
    expect(blocageEnCours("pers-essono", 5000)).toBeNull();
    leverBlocage("pers-essono");
    expect(blocageEnCours("pers-essono", 1000)).toBeNull();
  });
});

describe("formats", () => {
  it("écrit les montants comme la planche", () => {
    expect(montant(695500)).toBe("695 500");
    expect(montant(-1000, true)).toBe("− 1 000");
    expect(montant(4000, true)).toBe("+ 4 000");
    expect(montant(0, true)).toBe("0");
    expect(montant(-4500)).toBe("− 4 500");
  });

  it("extrait l'heure de Douala, le prénom et le nom sans titre", () => {
    expect(heureDouala("2027-01-05T13:58:00.000+01:00")).toBe("13:58");
    expect(prenom("Joseph M.")).toBe("Joseph");
    expect(nomSansTitre("Mme Essono")).toBe("Essono");
    expect(nomSansTitre("M. Kamga")).toBe("Kamga");
    expect(nomSansTitre("Essono")).toBe("Essono");
  });
});
