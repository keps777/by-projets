import { describe, expect, it } from "vitest";
import {
  ClotureMoisSchema,
  FichierExportSchema,
  ParamsApercuExportSchema,
  ParamsFichierExportSchema,
} from "./comptable";

describe("comptable : ajouts compatibles", () => {
  it("l'aperçu accepte un onglet facultatif (jamais vide) en plus de l'export et du mois", () => {
    expect(ParamsApercuExportSchema.safeParse({ exportId: "journal_ventes" }).success).toBe(true);
    expect(
      ParamsApercuExportSchema.safeParse({
        exportId: "journal_ventes",
        mois: "2026-12",
        onglet: "par_jour",
      }).success,
    ).toBe(true);
    expect(
      ParamsApercuExportSchema.safeParse({ exportId: "journal_ventes", onglet: "" }).success,
    ).toBe(false);
  });

  it("le fichier se demande par export et mois ; l'export doit être l'un des cinq", () => {
    expect(
      ParamsFichierExportSchema.safeParse({ exportId: "annulations", mois: "2026-12" }).success,
    ).toBe(true);
    expect(ParamsFichierExportSchema.safeParse({ exportId: "livre_de_paie" }).success).toBe(false);
    expect(
      ParamsFichierExportSchema.safeParse({ exportId: "annulations", onglet: "x" }).success,
    ).toBe(false);
  });

  it("un fichier remis porte ses octets, son nom et son type ; l'empreinte peut manquer", () => {
    const fichier = {
      nom: "journal.xlsx",
      typeMime: "application/octet-stream",
      empreinte: null,
      octets: new Uint8Array([1, 2, 3]),
    };
    expect(FichierExportSchema.safeParse(fichier).success).toBe(true);
    expect(FichierExportSchema.safeParse({ ...fichier, octets: "texte" }).success).toBe(false);
    expect(FichierExportSchema.safeParse({ ...fichier, octets: [1, 2, 3] }).success).toBe(false);
    expect(FichierExportSchema.safeParse({ ...fichier, nom: "" }).success).toBe(false);
  });

  it("la clôture porte facultativement le nombre de transactions traitées (un entier positif ou nul)", () => {
    const cloture = {
      mois: "2026-12",
      libelle: "Décembre 2026",
      statut: "cloture",
      clotureA: "2027-01-05T09:12:00.000+01:00",
      encaisse: { total: 10, cash: 6, momo: 4, ecart: 0 },
      verrouille: true,
      envoi: { destinataire: "cabinet@…", recuA: null, fichiers: [] },
      apercuJournal: [],
    };
    expect(ClotureMoisSchema.safeParse(cloture).success).toBe(true);
    expect(ClotureMoisSchema.safeParse({ ...cloture, transactionsTraitees: 4 }).success).toBe(true);
    expect(ClotureMoisSchema.safeParse({ ...cloture, transactionsTraitees: -1 }).success).toBe(
      false,
    );
    expect(ClotureMoisSchema.safeParse({ ...cloture, transactionsTraitees: 1.5 }).success).toBe(
      false,
    );
  });
});
