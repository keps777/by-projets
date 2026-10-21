import { describe, expect, it } from "vitest";
import { configTest } from "../testing/app-test";
import { AuditMemoire } from "../testing/memoire";
import { MASQUE, AuditService, masquer } from "./audit.service";
import { EMPREINTE_INITIALE, jsonCanonique } from "./chaine";

const creer = () => {
  const repo = new AuditMemoire();
  return { repo, audit: new AuditService(repo, configTest()) };
};

const acteur = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "patron" as const,
  compagnieId: null,
};

describe("masquage des données sensibles", () => {
  it("masque PIN, mots de passe, codes, jetons et téléphones, à tout niveau", () => {
    const sortie = masquer({
      pin: "123456",
      motDePasse: "x",
      password: "x",
      code: "482915",
      codeBillet: "1234",
      accessToken: "jwt",
      authorization: "Bearer x",
      telephone: "+237655000001",
      secret: "s",
      imbrique: { otp: "1", utile: "garde", liste: [{ pinHache: "h" }] },
      utile: 42,
      empreinteTelephone: "ab12",
    }) as Record<string, unknown>;
    expect(sortie).toMatchObject({
      pin: MASQUE,
      motDePasse: MASQUE,
      password: MASQUE,
      code: MASQUE,
      codeBillet: MASQUE,
      accessToken: MASQUE,
      authorization: MASQUE,
      telephone: MASQUE,
      secret: MASQUE,
      imbrique: { otp: MASQUE, utile: "garde", liste: [{ pinHache: MASQUE }] },
      utile: 42,
      empreinteTelephone: "ab12",
    });
  });
});

describe("journal d'audit en ajout seul", () => {
  it("chaîne les lignes : chacune porte l'empreinte de la précédente", async () => {
    const { repo, audit } = creer();
    const a = await audit.enregistrer({ action: "test.a", resultat: "succes", acteur });
    const b = await audit.enregistrer({ action: "test.b", resultat: "refus" });
    expect(a.hashPrecedent).toBe(EMPREINTE_INITIALE);
    expect(b.hashPrecedent).toBe(a.hash);
    expect(repo.lignes).toHaveLength(2);
    expect(await audit.verifierChaine()).toEqual({ valide: true, lignesVerifiees: 2 });
  });

  it("un journal vide est valide", async () => {
    expect(await creer().audit.verifierChaine()).toEqual({ valide: true, lignesVerifiees: 0 });
  });

  it("masque les détails avant écriture", async () => {
    const { repo, audit } = creer();
    await audit.enregistrer({ action: "x", resultat: "echec", details: { pin: "123456", nb: 2 } });
    expect(repo.lignes[0]?.details).toEqual({ pin: MASQUE, nb: 2 });
  });

  it("détecte une ligne modifiée", async () => {
    const { repo, audit } = creer();
    for (let i = 0; i < 5; i++)
      await audit.enregistrer({ action: `test.${i}`, resultat: "succes", acteur });
    const cible = repo.lignes[2];
    if (!cible) throw new Error("ligne absente");
    repo.lignes[2] = { ...cible, resultat: "echec" }; // falsification directe en base
    expect(await audit.verifierChaine(2)).toEqual({
      valide: false,
      lignesVerifiees: 2,
      premiereLigneEnDefaut: cible.seq,
    });
  });

  it("détecte une ligne supprimée au milieu", async () => {
    const { repo, audit } = creer();
    for (let i = 0; i < 4; i++)
      await audit.enregistrer({ action: `test.${i}`, resultat: "succes" });
    repo.lignes.splice(1, 1);
    const rapport = await audit.verifierChaine();
    expect(rapport.valide).toBe(false);
    expect(rapport.premiereLigneEnDefaut).toBe(3n);
  });

  it("détecte une empreinte recalculée avec une autre clé", async () => {
    const { repo, audit } = creer();
    await audit.enregistrer({ action: "test", resultat: "succes" });
    const autre = new AuditService(
      new AuditMemoire(),
      configTest({ AUDIT_HMAC_KEY: "une-autre-cle-d-audit-de-32-caracteres!" }),
    );
    const faux = await autre.enregistrer({ action: "test", resultat: "succes" });
    const ligne = repo.lignes[0];
    if (!ligne) throw new Error("ligne absente");
    repo.lignes[0] = { ...ligne, hash: faux.hash };
    expect((await audit.verifierChaine()).valide).toBe(false);
  });

  it("ne propose ni modification ni suppression", () => {
    const methodes = Object.getOwnPropertyNames(AuditService.prototype);
    expect(
      methodes.filter((m) => /modifier|supprimer|effacer|update|delete|remove/i.test(m)),
    ).toEqual([]);
  });
});

describe("json canonique", () => {
  it("trie les clés et ignore undefined", () => {
    expect(jsonCanonique({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"x":2,"y":1}]},"b":1}',
    );
  });
});
