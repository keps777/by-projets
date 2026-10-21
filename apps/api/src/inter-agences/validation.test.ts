import { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ErreurColis } from "../colis/erreurs";
import {
  lireArrivee,
  lireContestation,
  lireEmbarquement,
  lireEnregistrementBillet,
  lireEnregistrementColis,
  lireInvitation,
  lirePropositionConvention,
  lireResolution,
  lireScanTransfert,
} from "./validation";

function accepte(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof ErreurColis) return false;
    throw e;
  }
}

function chemins(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurColis) {
      return (e.getResponse() as { details: { chemin: string }[] }).details.map((d) => d.chemin);
    }
    throw e;
  }
  throw new Error("Aucune erreur levée");
}

/** Les lecteurs à la main doivent accepter et refuser exactement ce que le schéma zod du contrat accepte et refuse. */
function parite(
  nom: string,
  schema: { safeParse: (v: unknown) => { success: boolean } },
  lecteur: (v: unknown) => unknown,
  cas: unknown[],
) {
  it(`${nom} : mêmes cas acceptés et refusés que le schéma du contrat`, () => {
    for (const c of cas) {
      expect(
        accepte(() => lecteur(c)),
        JSON.stringify(c),
      ).toBe(schema.safeParse(c).success);
    }
  });
}

describe("lecture des corps de requête de l'inter-agences", () => {
  parite("scan de transfert", contrats.SchemaScanTransfert, lireScanTransfert, [
    { colisId: "c1", sens: "remis_a", compagnie: "Oméga" },
    { colisId: "c1", sens: "recu", compagnie: "Oméga", lieu: "Bafoussam" },
    { colisId: "c1", sens: "recu", compagnie: "Oméga", champInconnu: true },
    { colisId: "", sens: "recu", compagnie: "Oméga" },
    { colisId: "c1", sens: "donne", compagnie: "Oméga" },
    { colisId: "c1", sens: "recu", compagnie: "" },
    { colisId: "c1", sens: "recu" },
    { colisId: "c1", sens: "recu", compagnie: "Oméga", lieu: 4 },
    { colisId: 12, sens: "recu", compagnie: "Oméga" },
    {},
    null,
    "texte",
  ]);

  parite("contestation", contrats.SchemaContestationReglement, lireContestation, [
    { motif: "Colis jamais reçu" },
    { motif: "Colis jamais reçu", colisIds: ["c1", "c2"] },
    { motif: "Colis jamais reçu", colisIds: [] },
    { motif: "" },
    { motif: "x".repeat(1001) },
    { motif: "x".repeat(1000) },
    { motif: "ok", colisIds: [""] },
    { motif: "ok", colisIds: "c1" },
    { motif: "ok", colisIds: [3] },
    { colisIds: ["c1"] },
    [],
    null,
  ]);

  parite("invitation", contrats.SchemaInvitationCompagnie, lireInvitation, [
    { compagnie: "Oméga Voyages", patron: "+237691000001" },
    { compagnie: "", patron: "+237691000001" },
    { compagnie: "Oméga" },
    { patron: "+237691000001" },
    { compagnie: "Oméga", patron: 237691000001 },
    null,
  ]);

  it("un scan ne garde que les champs du contrat", () => {
    const lu = lireScanTransfert({ colisId: "c1", sens: "recu", compagnie: "Oméga", admin: true });
    expect(lu).toEqual({ colisId: "c1", sens: "recu", compagnie: "Oméga" });
  });

  it("un corps illisible donne tous les chemins fautifs d'un coup", () => {
    expect(chemins(() => lireScanTransfert({ colisId: "", sens: "donne" }))).toEqual(
      expect.arrayContaining(["colisId", "sens", "compagnie"]),
    );
  });

  describe("routes ajoutées", () => {
    const base = {
      compagnieId: "c2",
      parts: {
        colisType: { poidsKg: 3, prix: 3000 },
        lignes: [{ troncon: "Douala → Bafoussam", parts: { c1: 1400, c2: null } }],
      },
    };

    it("proposition : les valeurs par défaut sont celles de la convention type", () => {
      const lu = lirePropositionConvention(base);
      expect(lu.renouvellement).toBe("trimestriel");
      expect(lu.voyageurs).toEqual({ garantieMinutes: 25, attenteMinutes: 15, lignes: [] });
      expect(lu.parts.lignes[0]?.parts).toEqual({ c1: 1400, c2: null });
    });

    it("proposition : refuse un prix nul, un poids nul, un renouvellement inconnu, un montant négatif", () => {
      const refuse = (v: unknown) =>
        expect(accepte(() => lirePropositionConvention(v))).toBe(false);
      refuse({ ...base, parts: { ...base.parts, colisType: { poidsKg: 0, prix: 3000 } } });
      refuse({ ...base, parts: { ...base.parts, colisType: { poidsKg: 3, prix: 0 } } });
      refuse({ ...base, renouvellement: "mensuel" });
      refuse({ ...base, parts: { ...base.parts, lignes: [{ troncon: "T", parts: { c1: -1 } }] } });
      refuse({ ...base, parts: { ...base.parts, lignes: [{ troncon: "", parts: {} }] } });
      refuse({ ...base, parts: { ...base.parts, lignes: "aucune" } });
      refuse({ ...base, voyageurs: { garantieMinutes: 0 } });
      refuse({
        ...base,
        voyageurs: {
          lignes: [
            { origine: "A", via: "B", destination: "C", premiere: "c1", parts: { c1: null } },
          ],
        },
      });
      refuse({});
      refuse(null);
    });

    it("proposition : les chemins des erreurs désignent le champ de la ligne fautive", () => {
      expect(
        chemins(() =>
          lirePropositionConvention({
            ...base,
            parts: { ...base.parts, lignes: [{ troncon: "T", parts: { c1: -5 } }] },
          }),
        ),
      ).toEqual(["parts.lignes[0].parts.c1"]);
    });

    it("enregistrement d'un colis : 2 à 5 départs", () => {
      expect(accepte(() => lireEnregistrementColis({ colisId: "c", departIds: ["a", "b"] }))).toBe(
        true,
      );
      expect(accepte(() => lireEnregistrementColis({ colisId: "c", departIds: ["a"] }))).toBe(
        false,
      );
      expect(
        accepte(() =>
          lireEnregistrementColis({ colisId: "c", departIds: ["a", "b", "c", "d", "e", "f"] }),
        ),
      ).toBe(false);
      expect(accepte(() => lireEnregistrementColis({ departIds: ["a", "b"] }))).toBe(false);
    });

    it("enregistrement d'un billet, embarquement, arrivée, résolution", () => {
      expect(lireEnregistrementBillet({ billet: "ALP-1", departId: "d" })).toEqual({
        billet: "ALP-1",
        departId: "d",
      });
      expect(accepte(() => lireEnregistrementBillet({ billet: "ALP-1" }))).toBe(false);
      expect(lireEmbarquement({ rang: 2 })).toEqual({ rang: 2 });
      expect(accepte(() => lireEmbarquement({ rang: 0 }))).toBe(false);
      expect(accepte(() => lireEmbarquement({ rang: 1.5 }))).toBe(false);
      expect(accepte(() => lireEmbarquement({ rang: "2" }))).toBe(false);
      expect(lireArrivee({ arriveeLe: "2026-11-02T15:55:00.000+01:00" }).arriveeLe).toBe(
        "2026-11-02T15:55:00.000+01:00",
      );
      expect(accepte(() => lireArrivee({ arriveeLe: "demain" }))).toBe(false);
      expect(accepte(() => lireArrivee({}))).toBe(false);
      expect(lireResolution({ issue: "rejetee" })).toEqual({ issue: "rejetee" });
      expect(accepte(() => lireResolution({ issue: "peut-etre" }))).toBe(false);
    });
  });
});
