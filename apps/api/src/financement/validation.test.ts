import { patron } from "@afrimove/contrats";
import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  lireDemandeAvance,
  lireLancementPaie,
  lireNotificationJson,
  lireRetrait,
  lireSignature,
} from "./validation";

/**
 * L'API ne peut pas importer zod à l'exécution : ces tests comparent ses lecteurs aux schémas des
 * contrats sur des cas valides et invalides (même verdict des deux côtés).
 */

const signature = {
  pin: "482915",
  methode: "pin",
  signeA: "2027-01-05T10:04:00.000+01:00",
};

function accepte(lecteur: (corps: unknown) => unknown, corps: unknown): boolean {
  try {
    lecteur(corps);
    return true;
  } catch (e) {
    if (e instanceof HttpException) return false;
    throw e;
  }
}

function statut(lecteur: (corps: unknown) => unknown, corps: unknown): number | null {
  try {
    lecteur(corps);
    return null;
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : -1;
  }
}

const sansSignature = { montant: 6_000_000 };

describe("demande d'avance (DemanderAvanceSchema)", () => {
  const cas: [string, unknown][] = [
    ["valide", { montant: 6_000_000, signature }],
    ["montant nul", { montant: 0, signature }],
    ["empreinte", { montant: 100_000, signature: { ...signature, methode: "empreinte" } }],
    ["montant décimal", { montant: 1000.5, signature }],
    ["montant négatif", { montant: -1, signature }],
    ["montant texte", { montant: "6000000", signature }],
    ["sans montant", { signature }],
    ["champ inconnu", { montant: 1000, signature, dossier: "x" }],
    ["PIN à 5 chiffres", { montant: 1000, signature: { ...signature, pin: "48291" } }],
    ["PIN lettres", { montant: 1000, signature: { ...signature, pin: "48a915" } }],
    ["méthode inconnue", { montant: 1000, signature: { ...signature, methode: "sms" } }],
    [
      "heure sans fuseau",
      { montant: 1000, signature: { ...signature, signeA: "2027-01-05T10:04:00Z" } },
    ],
    ["signature avec champ en trop", { montant: 1000, signature: { ...signature, x: 1 } }],
    ["sans signature", sansSignature],
    ["corps nul", null],
    ["corps tableau", []],
  ];
  it.each(cas)("même verdict que le contrat : %s", (_nom, corps) => {
    const zod = patron.DemanderAvanceSchema.safeParse(corps).success;
    expect(accepte(lireDemandeAvance, corps)).toBe(zod);
  });

  it("lit montant et signature", () => {
    expect(lireDemandeAvance({ montant: 6_000_000, signature })).toEqual({
      montant: 6_000_000,
      signature,
    });
  });
});

describe("retrait (RetirerDemandeSchema)", () => {
  const cas: [string, unknown][] = [
    ["valide", { dossierId: "AV-2027-0041", signature }],
    ["identifiant vide", { dossierId: "", signature }],
    ["sans identifiant", { signature }],
    ["identifiant nombre", { dossierId: 41, signature }],
    ["champ inconnu", { dossierId: "AV-2027-0041", signature, force: true }],
    ["sans signature", { dossierId: "AV-2027-0041" }],
  ];
  it.each(cas)("même verdict que le contrat : %s", (_nom, corps) => {
    expect(accepte(lireRetrait, corps)).toBe(patron.RetirerDemandeSchema.safeParse(corps).success);
  });
});

describe("paie (LancerPaieSchema)", () => {
  const cas: [string, unknown][] = [
    ["valide", { mois: "2027-01", signature }],
    ["mois sans zéro", { mois: "2027-1", signature }],
    ["mois avec jour", { mois: "2027-01-05", signature }],
    ["mois nombre", { mois: 202701, signature }],
    ["sans mois", { signature }],
    ["champ inconnu", { mois: "2027-01", signature, total: 1 }],
    ["sans signature", { mois: "2027-01" }],
  ];
  it.each(cas)("même verdict que le contrat : %s", (_nom, corps) => {
    expect(accepte(lireLancementPaie, corps)).toBe(
      patron.LancerPaieSchema.safeParse(corps).success,
    );
  });
});

describe("signature absente ou illisible", () => {
  it.each([
    ["absente", { montant: 1000 }],
    ["texte", { montant: 1000, signature: "482915" }],
    ["PIN court", { montant: 1000, signature: { ...signature, pin: "1234" } }],
    ["corps nul", null],
  ])("répond 401 PIN_REQUIS avant toute autre lecture : %s", (_nom, corps) => {
    expect(statut(lireDemandeAvance, corps)).toBe(401);
    try {
      lireSignature(corps);
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({ code: "PIN_REQUIS" });
    }
  });

  it("un corps signé mais invalide répond 422 COMMANDE_INVALIDE avec les champs fautifs", () => {
    try {
      lireDemandeAvance({ montant: "beaucoup", extra: 1, signature });
      expect.unreachable();
    } catch (e) {
      const h = e as HttpException;
      expect(h.getStatus()).toBe(422);
      const corps = h.getResponse() as { code: string; details: { chemin: string }[] };
      expect(corps.code).toBe("COMMANDE_INVALIDE");
      expect(corps.details.map((d) => d.chemin).sort()).toEqual(["extra", "montant"]);
    }
  });
});

describe("notification du partenaire", () => {
  const at = "2027-01-05T16:00:00.000+01:00";

  it("lit l'accusé, le versement et le refus", () => {
    expect(lireNotificationJson({ type: "accuse", reference: "P1", at })).toEqual({
      type: "accuse",
      reference: "P1",
      at,
    });
    expect(
      lireNotificationJson({
        type: "verse",
        reference: "P1",
        at,
        coutTotalPct: 5,
        montant: 5_000_000,
      }),
    ).toEqual({ type: "verse", reference: "P1", at, coutTotalPct: 5, montant: 5_000_000 });
    expect(lireNotificationJson({ type: "verse", reference: "P1", at, coutTotalPct: 0 })).toEqual({
      type: "verse",
      reference: "P1",
      at,
      coutTotalPct: 0,
    });
    expect(
      lireNotificationJson({ type: "refuse", reference: "P1", at, motif: "Dossier incomplet" }),
    ).toEqual({
      type: "refuse",
      reference: "P1",
      at,
      motif: "Dossier incomplet",
    });
  });

  it.each([
    ["type inconnu", { type: "paye", reference: "P1", at }],
    ["sans référence", { type: "accuse", at }],
    ["heure sans fuseau", { type: "accuse", reference: "P1", at: "2027-01-05T16:00:00Z" }],
    ["versement sans coût", { type: "verse", reference: "P1", at }],
    ["coût négatif", { type: "verse", reference: "P1", at, coutTotalPct: -1 }],
    ["coût au-dessus de 100", { type: "verse", reference: "P1", at, coutTotalPct: 101 }],
    ["montant nul", { type: "verse", reference: "P1", at, coutTotalPct: 5, montant: 0 }],
    ["montant décimal", { type: "verse", reference: "P1", at, coutTotalPct: 5, montant: 10.5 }],
    ["refus sans motif", { type: "refuse", reference: "P1", at }],
    ["pas un objet", "verse"],
    ["nul", null],
  ])("refuse : %s", (_nom, brut) => {
    expect(lireNotificationJson(brut)).toBeNull();
  });
});
