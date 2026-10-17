import { describe, expect, it } from "vitest";
import { ConfigPaiementsInvalide, chargerConfigPaiements } from "./config";

const SECRET = "s".repeat(40);
const HTTP = {
  PAIEMENTS_FOURNISSEUR: "http",
  PAIEMENTS_FOURNISSEUR_NOM: "agregateur-x",
  PAIEMENTS_API_URL: "https://api.agregateur.example/v1",
  PAIEMENTS_API_KEY: "k".repeat(24),
  PAIEMENTS_WEBHOOK_SECRET: SECRET,
};

const erreursDe = (env: Record<string, string>, production = false): string[] => {
  try {
    chargerConfigPaiements(env, production);
  } catch (e) {
    if (e instanceof ConfigPaiementsInvalide) return [...e.erreurs];
    throw e;
  }
  return [];
};

describe("configuration des paiements", () => {
  it("développement sans rien : agrégateur simulé, valeurs par défaut sûres", () => {
    const c = chargerConfigPaiements({});
    expect(c.agregateur).toEqual({ type: "simule", nom: "simule", issue: "reussi" });
    expect(c).toMatchObject({
      delaiMobileMs: 180_000,
      delaiCarteMs: 600_000,
      consultationApresMs: 20_000,
      disjoncteur: { seuilEchecs: 3, ouvertureMs: 30_000 },
      remboursementEssaisMax: 8,
      modeDegradeInitial: false,
      compteAfrimove: "afrimove",
      urlLienProche: "https://afrimove.app/payer",
      abonnerAvis: true,
      production: false,
    });
  });

  it("production sans réglage : aucun agrégateur (mode dégradé), jamais un simulateur par défaut", () => {
    const c = chargerConfigPaiements(
      { PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer" },
      true,
    );
    expect(c.agregateur).toEqual({ type: "aucun" });
    expect(c.production).toBe(true);
  });

  it("le simulateur est interdit en production", () => {
    expect(
      erreursDe(
        { PAIEMENTS_FOURNISSEUR: "simule", PAIEMENTS_URL_LIEN_PROCHE: "https://a.cm/p" },
        true,
      ),
    ).toEqual(["PAIEMENTS_FOURNISSEUR=simule est interdit en production"]);
  });

  it("agrégateur HTTP : adresse https, clé et secret assez longs", () => {
    const c = chargerConfigPaiements(HTTP);
    expect(c.agregateur).toEqual({
      type: "http",
      nom: "agregateur-x",
      urlApi: "https://api.agregateur.example/v1",
      cleApi: "k".repeat(24),
      secretWebhook: SECRET,
    });

    const erreurs = erreursDe({
      ...HTTP,
      PAIEMENTS_API_URL: "http://api.agregateur.example",
      PAIEMENTS_API_KEY: "courte",
      PAIEMENTS_WEBHOOK_SECRET: "trop-court",
    });
    expect(erreurs).toEqual([
      "PAIEMENTS_API_URL : adresse https",
      "PAIEMENTS_API_KEY : 16 caractères au moins",
      "PAIEMENTS_WEBHOOK_SECRET : 32 caractères au moins",
    ]);
  });

  it("production : une valeur d'exemple dans la clé ou le secret bloque le démarrage", () => {
    const erreurs = erreursDe(
      {
        ...HTTP,
        PAIEMENTS_API_KEY: "cle-dev-seulement-xxxxxxxxxxxx",
        PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
      },
      true,
    );
    expect(erreurs.some((e) => e.startsWith("PAIEMENTS_API_KEY porte une valeur d'exemple"))).toBe(
      true,
    );
  });

  it("production : l'adresse des liens est obligatoire", () => {
    expect(erreursDe({ PAIEMENTS_FOURNISSEUR: "aucun" }, true)).toEqual([
      "PAIEMENTS_URL_LIEN_PROCHE est obligatoire en production",
    ]);
  });

  it("toutes les erreurs sont signalées ensemble, en français", () => {
    const erreurs = erreursDe({
      PAIEMENTS_FOURNISSEUR: "paypal",
      PAIEMENTS_DELAI_MOBILE_MS: "5",
      PAIEMENTS_DISJONCTEUR_SEUIL: "abc",
      PAIEMENTS_MODE_DEGRADE: "peut-être",
      PAIEMENTS_URL_LIEN_PROCHE: "ftp://x",
      PAIEMENTS_COMPTE_AFRIMOVE: "compte avec espaces",
    });
    expect(erreurs).toEqual(
      expect.arrayContaining([
        "PAIEMENTS_FOURNISSEUR : « simule », « http » ou « aucun »",
        "PAIEMENTS_DELAI_MOBILE_MS doit être un entier entre 10000 et 3600000",
        "PAIEMENTS_DISJONCTEUR_SEUIL doit être un entier entre 1 et 100",
        "PAIEMENTS_MODE_DEGRADE : true ou false",
        "PAIEMENTS_URL_LIEN_PROCHE : adresse https",
      ]),
    );
    expect(erreurs).toHaveLength(6);
  });

  it("l'issue du simulateur est contrôlée", () => {
    expect(erreursDe({ PAIEMENTS_SIMULE_ISSUE: "peut-etre" })).toEqual([
      "PAIEMENTS_SIMULE_ISSUE : reussi, echoue ou en_attente",
    ]);
    expect(
      chargerConfigPaiements({ PAIEMENTS_SIMULE_ISSUE: "en_attente" }).agregateur,
    ).toMatchObject({
      issue: "en_attente",
    });
  });

  it("booléens, entiers et adresse nettoyée", () => {
    const c = chargerConfigPaiements({
      PAIEMENTS_MODE_DEGRADE: "oui",
      PAIEMENTS_ABONNER_AVIS: "0",
      PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer///",
      PAIEMENTS_REMBOURSEMENT_ESSAIS_MAX: " 3 ",
      PAIEMENTS_COMPTE_AFRIMOVE: "acct_afrimove.01",
    });
    expect(c).toMatchObject({
      modeDegradeInitial: true,
      abonnerAvis: false,
      urlLienProche: "https://afrimove.app/payer",
      remboursementEssaisMax: 3,
      compteAfrimove: "acct_afrimove.01",
    });
  });

  it("nom d'agrégateur : minuscules, chiffres, _ et -", () => {
    expect(erreursDe({ PAIEMENTS_FOURNISSEUR_NOM: "Mauvais Nom" })).toEqual([
      "PAIEMENTS_FOURNISSEUR_NOM : minuscules, chiffres, _ ou -, 24 caractères au plus",
    ]);
  });
});
