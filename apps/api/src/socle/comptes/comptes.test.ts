import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RolesInvalides } from "../auth/roles";
import { creerAppTest, type AppTest } from "../testing/app-test";
import { SecretFaible, verifierMotDePasse, verifierPin } from "./comptes.service";
import { TelephoneDejaUtilise } from "./personnes.repository";

describe("politique des secrets", () => {
  it.each(["000000", "111111", "123456", "654321", "345678", "12345", "1234567", "12a456", ""])(
    "PIN refusé : %j",
    (pin) => {
      expect(() => verifierPin(pin)).toThrow(SecretFaible);
    },
  );

  it.each(["482915", "907314", "135790"])("PIN accepté : %s", (pin) => {
    expect(() => verifierPin(pin)).not.toThrow();
  });

  it("mot de passe : 12 caractères minimum, pas répétitif", () => {
    expect(() => verifierMotDePasse("court")).toThrow(SecretFaible);
    expect(() => verifierMotDePasse("aaaaaaaaaaaaaaaa")).toThrow(SecretFaible);
    expect(() => verifierMotDePasse("Un-mot-de-passe-solide")).not.toThrow();
  });
});

describe("création de comptes", () => {
  let t: AppTest;
  beforeAll(async () => {
    t = await creerAppTest();
  });
  afterAll(() => t.fermer());

  it("chiffre le téléphone, l'indexe et hache le PIN avec argon2id", async () => {
    const p = await t.creerCompte({
      nom: "Awa",
      telephone: "655 00 00 10",
      roles: ["guichetier"],
      pin: "482915",
    });
    expect(p.telephoneChiffre.startsWith("enc:v1:")).toBe(true);
    expect(p.telephoneChiffre).not.toContain("655000010");
    expect(p.telephoneIndex).toMatch(/^[0-9a-f]{64}$/);
    expect(p.pinHache).toMatch(/^\$argon2id\$/);
    expect(p.pinHache).not.toContain("482915");
    expect(p.motDePasseHache).toBeNull();
    expect(t.comptes.telephoneEnClair(p)).toBe("+237655000010");
    expect((await t.comptes.trouverParTelephone("+237 655000010"))?.id).toBe(p.id);
  });

  it("deux comptes ne partagent pas un numéro", async () => {
    await t.creerCompte({ nom: "A", telephone: "+237655000011", roles: ["voyageur"] });
    await expect(
      t.creerCompte({ nom: "B", telephone: "655000011", roles: ["voyageur"] }),
    ).rejects.toBeInstanceOf(TelephoneDejaUtilise);
  });

  it("exige le secret qui correspond au rôle", async () => {
    await expect(
      t.creerCompte({ nom: "X", telephone: "+237655000012", roles: ["guichetier"] }),
    ).rejects.toBeInstanceOf(SecretFaible);
    await expect(
      t.creerCompte({ nom: "X", telephone: "+237655000012", roles: ["patron"], pin: "482915" }),
    ).rejects.toBeInstanceOf(SecretFaible);
  });

  it("AfriMove ne peut pas être créé avec un rôle de vente", async () => {
    await expect(
      t.creerCompte({
        nom: "X",
        telephone: "+237655000013",
        roles: ["afrimove", "guichetier"],
        pin: "482915",
        motDePasse: "Un-mot-de-passe-solide",
      }),
    ).rejects.toBeInstanceOf(RolesInvalides);
  });
});
