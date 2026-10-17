import { describe, expect, it } from "vitest";
import type { AppConfig } from "../socle/config/config";
import {
  VARIABLE_CLE_QR,
  VerificationStockageBilletterie,
  creerSignataire,
} from "./billetterie.module";
import {
  AvisMemoire,
  BilletsMemoire,
  CatalogueMemoire,
  ColisMemoire,
  CommandesMemoire,
  ConversionMemoire,
  DiffusionMemoire,
  EvenementsTraitesMemoire,
  InventaireMemoire,
  NumerotationEnLigneMemoire,
  PreferencesMemoire,
  ProchesMemoire,
  PromotionsMemoire,
  ScansMemoire,
} from "./memoire";
import { genererPaireQr } from "./qr";

const config = (env: AppConfig["env"]) => ({ env }) as AppConfig;

function garde(env: AppConfig["env"], signataire = creerSignataire(undefined)) {
  return new VerificationStockageBilletterie(
    config(env),
    new CatalogueMemoire(),
    new BilletsMemoire(),
    new InventaireMemoire(),
    new CommandesMemoire(),
    new ScansMemoire(),
    new EvenementsTraitesMemoire(),
    new PreferencesMemoire(),
    new PromotionsMemoire(),
    new ProchesMemoire(),
    new ConversionMemoire(),
    new NumerotationEnLigneMemoire(),
    new ColisMemoire(),
    signataire,
    new DiffusionMemoire(),
    new AvisMemoire(),
  );
}

describe("garde-fou de production", () => {
  it("refuse de démarrer en production tant que des ports sont en mémoire, et les nomme", () => {
    expect(() => garde("production").onModuleInit()).toThrowError(
      /BilletterieModule : Catalogue, Billets, Inventaire, Commandes, Scans, EvenementsTraites/,
    );
    expect(() => garde("production").onModuleInit()).toThrowError(/BILLETTERIE_QR_CLE_PRIVEE/);
  });

  it("laisse démarrer en développement et en test", () => {
    expect(() => garde("development").onModuleInit()).not.toThrow();
    expect(() => garde("test").onModuleInit()).not.toThrow();
  });

  it("une clé de signature fournie rend le signataire durable, sans clé il ne l'est pas", async () => {
    const { privee } = await genererPaireQr();
    expect(creerSignataire(undefined).durable).toBe(false);
    expect(creerSignataire("  ").durable).toBe(false);
    expect(creerSignataire(JSON.stringify(privee)).durable).toBe(true);
    expect(creerSignataire(Buffer.from(JSON.stringify(privee)).toString("base64")).durable).toBe(
      true,
    );
  });
});

describe("clé de signature des QR (BILLETTERIE_QR_CLE_PRIVEE)", () => {
  it("signe avec la clé fournie : le même QR est vérifiable après un redémarrage", async () => {
    const { privee, publique } = await genererPaireQr();
    const contenu = { numero: "ALP-DLA-261102-4001", code: "4821", departId: "d1" };
    const avant = creerSignataire(JSON.stringify(privee));
    const qr = await avant.signer(contenu);
    const apres = creerSignataire(JSON.stringify(privee));
    expect(await apres.verifier(qr)).toEqual(contenu);
    expect(await apres.clePublique()).toEqual(publique);
    // Un signataire sans clé fournie (clé tirée au hasard) ne reconnaît pas ce QR.
    expect(await creerSignataire(undefined).verifier(qr)).toBeNull();
  });

  it("refuse une clé illisible, publique seule ou d'une autre courbe", async () => {
    const { publique } = await genererPaireQr();
    expect(() => creerSignataire("pas du json")).toThrow(VARIABLE_CLE_QR);
    expect(() => creerSignataire(JSON.stringify(publique))).toThrow(/ECDSA P-256 privée/);
    expect(() =>
      creerSignataire(JSON.stringify({ kty: "EC", crv: "P-384", d: "a", x: "b", y: "c" })),
    ).toThrow(/ECDSA P-256/);
  });

  it("refuse de signer un identifiant de départ qui contiendrait « : »", async () => {
    await expect(
      creerSignataire(undefined).signer({
        numero: "ALP-DLA-261102-4001",
        code: "4821",
        departId: "a:b",
      }),
    ).rejects.toThrow(RangeError);
  });
});
