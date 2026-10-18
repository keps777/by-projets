import * as contrats from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ISO_ESSAIS, UUID_ESSAIS, variantes } from "../caisse/testing/mutations";
import { lireImpression } from "./evenements";
import { COPIES_MAX, DOCUMENTS_IMPRIMABLES } from "./ports";

/**
 * L'API ne peut pas importer `@afrimove/contrats` à l'exécution (paquet non compilé) : elle relit à la main
 * l'événement `impression.demandee`. Ce test compare le lecteur au schéma zod du contrat sur des événements
 * valides et sur des événements abîmés champ par champ : un lecteur plus permissif (ou plus strict) que le contrat
 * fait échouer la CI.
 */

const c = contrats.agence;
const schema = c.EVENEMENT_IMPRESSION_DEMANDEE.schema;

const valide = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "impression.demandee",
  at: "2026-11-02T09:00:00.000+01:00",
  appareilId: "GU1-DLA",
  auteurId: "agent-1",
  cible: { type: "billet", id: "b1" },
  numeroPlage: null,
  donnees: { document: "billet", documentId: "b1", copies: 1, reimpression: false },
};

const accepte = (v: unknown) => {
  try {
    lireImpression(v);
    return true;
  } catch {
    return false;
  }
};

describe("impression.demandee : le lecteur fait comme le schéma zod du contrat", () => {
  it("accepte ce que le contrat accepte (événement valide)", () => {
    expect(schema.safeParse(valide).success).toBe(true);
    expect(accepte(valide)).toBe(true);
  });

  it("refuse tout ce que le contrat refuse, champ par champ", () => {
    const divergences: string[] = [];
    let refuses = 0;
    for (const { nom, valeur } of variantes(valide)) {
      const zod = schema.safeParse(valeur).success;
      const lecteur = accepte(valeur);
      if (!zod) refuses += 1;
      if (zod !== lecteur) divergences.push(`${nom} : contrat ${zod}, lecteur ${lecteur}`);
    }
    expect(refuses).toBeGreaterThan(20);
    expect(divergences).toEqual([]);
  });

  it("même verdict sur les identifiants, les heures et les cibles", () => {
    for (const id of UUID_ESSAIS) {
      const e = { ...valide, id };
      expect(accepte(e), `id ${id}`).toBe(schema.safeParse(e).success);
    }
    for (const at of ISO_ESSAIS) {
      const e = { ...valide, at };
      expect(accepte(e), `at ${at}`).toBe(schema.safeParse(e).success);
    }
    for (const type of ["billet", "colis", "session", "depart", "autre"]) {
      const e = { ...valide, cible: { type, id: "x" } };
      expect(accepte(e), `cible ${type}`).toBe(schema.safeParse(e).success);
    }
  });

  it("même verdict sur les documents et sur le nombre de copies", () => {
    for (const document of [...DOCUMENTS_IMPRIMABLES, "facture", "", 3]) {
      const e = { ...valide, donnees: { ...valide.donnees, document } };
      expect(accepte(e), `document ${String(document)}`).toBe(schema.safeParse(e).success);
    }
    for (const copies of [0, 1, 2, COPIES_MAX, COPIES_MAX + 1, -1, 1.5, "2", null]) {
      const e = { ...valide, donnees: { ...valide.donnees, copies } };
      expect(accepte(e), `copies ${String(copies)}`).toBe(schema.safeParse(e).success);
    }
  });

  it("les documents imprimables sont ceux du contrat", () => {
    expect([...DOCUMENTS_IMPRIMABLES]).toEqual([...c.SchemaDocumentImprimable.options]);
  });

  it("refuse un autre type d'événement et un numéro de plage", () => {
    expect(accepte({ ...valide, type: "caisse.ouverte" })).toBe(false);
    expect(accepte({ ...valide, numeroPlage: 12 })).toBe(false);
    expect(schema.safeParse({ ...valide, numeroPlage: 12 }).success).toBe(false);
  });

  it("la cible déduite des données est celle du contrat", () => {
    for (const document of DOCUMENTS_IMPRIMABLES) {
      const donnees = { document, documentId: "d9", copies: 2, reimpression: true };
      const evt = { ...valide, donnees };
      expect(lireImpression(evt).cible).toEqual(c.EVENEMENT_IMPRESSION_DEMANDEE.cible(donnees));
    }
  });
});
