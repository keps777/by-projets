import { describe, expect, it } from "vitest";
import { COMMANDES_FINANCIERES, COMMANDES_REGLAGES, COMMANDES_SIGNEES } from "./commandes";
import type { NomCommandeSignee } from "./commandes";
import { SignaturePinSchema, commandeSignee } from "./commun";
import { z } from "zod";

const SIGNATURE = {
  pin: "483920",
  methode: "pin",
  signeA: "2027-01-05T14:07:00.000+01:00",
} as const;

const TARIFS = { classique: 3500, vip: 5000, bagage: 1000 };
const DROITS = {
  vendreBilletsEtColis: true,
  annulerSansPinSuperviseur: false,
  modeCadence: true,
  voirCaissesDesAutres: false,
};

/** Un corps valide, sans signature, pour chaque écriture du patron. */
const CORPS: Record<NomCommandeSignee, Record<string, unknown>> = {
  "patron.reglages.ligne.modifier": { ligneId: "ligne-1", tarifs: TARIFS },
  "patron.reglages.ligne.creer": {
    origineGareId: "gare-a",
    destinationGareId: "gare-b",
    tarifs: TARIFS,
    arrets: ["Bafang"],
    capacite: 40,
  },
  "patron.reglages.personne.modifier": { personneId: "pers-1", champs: { salaire: 100000 } },
  "patron.reglages.personne.creer": {
    champs: {
      nom: "Nouvelle Recrue",
      telephone: "+237677000099",
      operateur: "MTN",
      role: "guichetier",
      gareId: "gare-a",
      guichet: "1",
      salaire: 90000,
      droits: DROITS,
    },
  },
  "patron.reglages.personne.desactiver": { personneId: "pers-1" },
  "patron.reglages.personne.pinProvisoire": { personneId: "pers-1" },
  "patron.reglages.regles.enregistrer": {
    regles: {
      annulation: {
        gratuiteJusqua: "1h_avant",
        retenue: "selon_classe",
        retenueParClassePct: { classique: 10, vip: 20 },
      },
      caisse: { toleranceEcart: 1000, auDela: "pin_superviseur_et_patron" },
      cadence: { numeroObligatoire: true },
      fraisService: { montant: 250, priseEnChargeParAgence: false },
    },
  },
  "patron.reglages.compteMomo.confirmer": { operateur: "mtn", nouveauNumero: "+237677000002" },
  "patron.reglages.compteMomo.changer": {
    operateur: "orange",
    nouveauNumero: "+237699000002",
    codeSms: "123456",
  },
  "patron.modules.changer": { code: "relais", actif: false, portee: { type: "agence" } },
  "patron.assistant.appliquer": { actionId: "decaler-1000" },
  "patron.comptable.rapprochement.appliquer": {
    mois: "2026-12",
    decisions: [{ reference: "MP261203.1142.A71290", action: "rembourser" }],
  },
  "patron.comptable.cloturer": { mois: "2026-12", envoyerAuCabinet: true },
  "patron.financement.demander": { montant: 6_000_000 },
  "patron.financement.retirer": { dossierId: "AV-2027-0041" },
  "patron.financement.billetEnDeuxFois": { actif: true },
  "patron.paie.lancer": { mois: "2027-01" },
};

const noms = Object.keys(COMMANDES_SIGNEES) as NomCommandeSignee[];

describe("signature PIN", () => {
  it("accepte un PIN à 6 chiffres daté à Douala, par PIN ou par empreinte", () => {
    expect(SignaturePinSchema.safeParse(SIGNATURE).success).toBe(true);
    expect(SignaturePinSchema.safeParse({ ...SIGNATURE, methode: "empreinte" }).success).toBe(true);
  });

  it.each([
    ["PIN trop court", { ...SIGNATURE, pin: "48392" }],
    ["PIN trop long", { ...SIGNATURE, pin: "4839201" }],
    ["PIN non numérique", { ...SIGNATURE, pin: "48392a" }],
    ["méthode inconnue", { ...SIGNATURE, methode: "sms" }],
    ["instant hors fuseau de Douala", { ...SIGNATURE, signeA: "2027-01-05T14:07:00.000Z" }],
    ["champ en trop", { ...SIGNATURE, extra: 1 }],
  ])("refuse : %s", (_cas, signature) => {
    expect(SignaturePinSchema.safeParse(signature).success).toBe(false);
  });

  it("commandeSignee ajoute une signature obligatoire à n'importe quel corps", () => {
    const schema = commandeSignee({ valeur: z.number().int() });
    expect(schema.safeParse({ valeur: 1 }).success).toBe(false);
    expect(schema.safeParse({ valeur: 1, signature: SIGNATURE }).success).toBe(true);
  });
});

describe("toute écriture du patron exige une signature PIN", () => {
  it("le registre couvre les réglages et les écritures financières, sans doublon", () => {
    expect(noms.length).toBe(
      Object.keys(COMMANDES_REGLAGES).length + Object.keys(COMMANDES_FINANCIERES).length,
    );
    expect(Object.keys(CORPS).sort()).toEqual([...noms].sort());
  });

  it.each(noms)("%s : un corps valide et signé est accepté", (nom) => {
    const resultat = COMMANDES_SIGNEES[nom].safeParse({ ...CORPS[nom], signature: SIGNATURE });
    expect(resultat.error?.issues).toBeUndefined();
    expect(resultat.success).toBe(true);
  });

  it.each(noms)("%s : sans signature, le contrat refuse", (nom) => {
    const resultat = COMMANDES_SIGNEES[nom].safeParse(CORPS[nom]);
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.some((i) => i.path[0] === "signature")).toBe(true);
  });

  it.each(noms)("%s : un PIN mal formé ou sans date est refusé", (nom) => {
    for (const signature of [
      { ...SIGNATURE, pin: "12345" },
      { pin: SIGNATURE.pin, methode: "pin" },
      null,
      "483920",
    ]) {
      expect(COMMANDES_SIGNEES[nom].safeParse({ ...CORPS[nom], signature }).success).toBe(false);
    }
  });

  it.each(noms)("%s : la signature est la clé `signature` du corps", (nom) => {
    const forme = COMMANDES_SIGNEES[nom].shape as Record<string, z.ZodType>;
    expect(Object.keys(forme)).toContain("signature");
    expect(forme["signature"]!.safeParse(undefined).success).toBe(false);
  });

  it("les réglages (ligne, personne, règles, comptes MoMo, modules) sont tous dans le registre", () => {
    expect(Object.keys(COMMANDES_REGLAGES)).toEqual(
      expect.arrayContaining([
        "patron.reglages.ligne.modifier",
        "patron.reglages.personne.modifier",
        "patron.reglages.regles.enregistrer",
        "patron.reglages.compteMomo.changer",
        "patron.modules.changer",
      ]),
    );
  });
});

describe("montants", () => {
  it("les montants des commandes sont des entiers de FCFA", () => {
    const corps = { ...CORPS["patron.financement.demander"], montant: 6_000_000.5 };
    expect(
      COMMANDES_SIGNEES["patron.financement.demander"].safeParse({
        ...corps,
        signature: SIGNATURE,
      }).success,
    ).toBe(false);
    const tarifs = { ...TARIFS, classique: 3500.5 };
    expect(
      COMMANDES_SIGNEES["patron.reglages.ligne.modifier"].safeParse({
        ligneId: "l",
        tarifs,
        signature: SIGNATURE,
      }).success,
    ).toBe(false);
  });
});
