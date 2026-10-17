import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import { PlageChevauchante, PlageInvalide } from "./erreurs";
import type { DemandeAttribution } from "./plages.service";
import { AUTRE_GARE, COMPAGNIE, GARE, monterNumerotation } from "./testing/montage";

const guichet = (appareilId: string, rang: number, extra: Partial<DemandeAttribution> = {}) =>
  ({
    appareilId,
    genre: "guichet",
    rang,
    gareId: GARE,
    compagnieId: COMPAGNIE,
    ...extra,
  }) satisfies DemandeAttribution;

const convoyeur = (
  appareilId: string,
  rang: number,
  nbConvoyeurs: number,
  extra: Partial<DemandeAttribution> = {},
) =>
  ({
    appareilId,
    genre: "convoyeur",
    rang,
    nbConvoyeurs,
    gareId: GARE,
    compagnieId: COMPAGNIE,
    ...extra,
  }) satisfies DemandeAttribution;

describe("attribution des plages du plan de numérotation", () => {
  it("les trois guichets reçoivent 0001–0999, 1001–1999 et 2001–2999", async () => {
    const m = monterNumerotation();
    const plages = [];
    for (const rang of [1, 2, 3]) {
      plages.push((await m.plages.attribuer(guichet(`g${rang}`, rang))).plage);
    }
    expect(plages).toEqual([
      { debut: 1, fin: 999 },
      { debut: 1001, fin: 1999 },
      { debut: 2001, fin: 2999 },
    ]);
  });

  it("les plages sont celles du domaine (guichets, et convoyeurs de 1 à 12)", async () => {
    for (let rang = 1; rang <= 3; rang++) {
      const m = monterNumerotation();
      expect((await m.plages.attribuer(guichet("g", rang))).plage).toEqual(
        domaine.plageGuichet(rang),
      );
    }
    for (let nb = 1; nb <= 12; nb++) {
      const m = monterNumerotation();
      for (let rang = 1; rang <= nb; rang++) {
        const a = await m.plages.attribuer(convoyeur(`c${rang}`, rang, nb));
        expect(a.plage).toEqual(domaine.plageConvoyeur(rang, nb));
      }
    }
  });

  it("jamais deux plages qui se recouvrent dans une gare, pour 1 à 12 convoyeurs et les trois guichets", async () => {
    for (let nb = 1; nb <= 12; nb++) {
      const m = monterNumerotation();
      for (let rang = 1; rang <= 3; rang++) await m.plages.attribuer(guichet(`g${rang}`, rang));
      for (let rang = 1; rang <= nb; rang++)
        await m.plages.attribuer(convoyeur(`c${rang}`, rang, nb));
      const toutes = (await m.plages.lister({ gareId: GARE })).map((a) => a.plage);
      expect(toutes).toHaveLength(3 + nb);
      for (const [i, a] of toutes.entries()) {
        for (const b of toutes.slice(i + 1)) {
          expect(
            a.fin < b.debut || b.fin < a.debut,
            `${JSON.stringify(a)} / ${JSON.stringify(b)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("une plage qui recouvre celle d'un autre appareil de la gare est refusée, et ne change rien", async () => {
    const m = monterNumerotation();
    await m.plages.attribuer(guichet("g2", 2));
    const erreur = await m.plages
      .attribuer({ ...guichet("renfort", 2), rang: null, plage: { debut: 1900, fin: 2100 } })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(PlageChevauchante);
    expect((erreur as PlageChevauchante).enConflitAvec.appareilId).toBe("g2");
    expect(await m.plages.de("renfort")).toBeNull();
    expect((await m.plages.de("g2"))?.plage).toEqual({ debut: 1001, fin: 1999 });
  });

  it("deux demandes simultanées pour la même plage : une seule est acceptée", async () => {
    const m = monterNumerotation();
    const resultats = await Promise.allSettled([
      m.plages.attribuer(guichet("a", 1)),
      m.plages.attribuer(guichet("b", 1)),
    ]);
    expect(resultats.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("la même plage dans une autre gare est permise (le numéro imprimé porte la gare)", async () => {
    const m = monterNumerotation();
    await m.plages.attribuer(guichet("g2", 2));
    const autre = await m.plages.attribuer(guichet("g2-yde", 2, { gareId: AUTRE_GARE }));
    expect(autre.plage).toEqual({ debut: 1001, fin: 1999 });
  });

  it("rejouer la même demande, ou la renouveler pour le même appareil, remplace sans conflit", async () => {
    const m = monterNumerotation();
    const un = await m.plages.attribuer(guichet("g2", 2));
    const deux = await m.plages.attribuer(guichet("g2", 2));
    expect(deux.plage).toEqual(un.plage);
    const autre = await m.plages.attribuer(guichet("g2", 3));
    expect(autre.plage).toEqual({ debut: 2001, fin: 2999 });
    // l'ancienne plage est libre
    expect((await m.plages.attribuer(guichet("g2bis", 2))).plage).toEqual({
      debut: 1001,
      fin: 1999,
    });
  });

  it("libérer un appareil rend sa plage au téléphone de secours", async () => {
    const m = monterNumerotation();
    await m.plages.attribuer(guichet("g2", 2));
    await expect(m.plages.attribuer(guichet("secours", 2))).rejects.toBeInstanceOf(
      PlageChevauchante,
    );
    expect(await m.plages.liberer("g2")).not.toBeNull();
    expect(await m.plages.de("g2")).toBeNull();
    expect((await m.plages.attribuer(guichet("secours", 2))).plage).toEqual({
      debut: 1001,
      fin: 1999,
    });
    expect(await m.plages.liberer("g2")).toBeNull();
  });

  it("refuse ce qui n'existe pas au plan : guichet 4, convoyeur hors rang, plage mal formée", async () => {
    const m = monterNumerotation();
    const invalides: DemandeAttribution[] = [
      guichet("a", 4),
      guichet("a", 0),
      convoyeur("a", 3, 2),
      { ...convoyeur("a", 1, 2), nbConvoyeurs: null },
      { ...guichet("a", 1), rang: null },
      { ...guichet("a", 1), plage: { debut: 50, fin: 10 } },
      { ...guichet("a", 1), plage: { debut: 0, fin: 10 } },
      { ...guichet("a", 1), plage: { debut: 1.5, fin: 10 } },
      guichet("  ", 1),
    ];
    for (const demande of invalides) {
      await expect(m.plages.attribuer(demande), JSON.stringify(demande)).rejects.toBeInstanceOf(
        PlageInvalide,
      );
    }
    expect(await m.plages.lister()).toEqual([]);
  });

  it("aucun appareil ne reçoit les numéros du serveur (4001–9999)", async () => {
    const m = monterNumerotation();
    for (const plage of [
      { debut: 4001, fin: 4100 },
      { debut: 3900, fin: 4001 },
      { debut: 9000, fin: 9999 },
    ]) {
      await expect(
        m.plages.attribuer({ ...guichet("a", 1), rang: null, plage }),
      ).rejects.toBeInstanceOf(PlageInvalide);
    }
    const limite = await m.plages.attribuer({
      ...guichet("a", 1),
      rang: null,
      plage: { debut: 3991, fin: 4000 },
    });
    expect(limite.plage.fin).toBe(4000);
  });

  it("garde le titulaire, la date et l'auteur de l'attribution", async () => {
    const m = monterNumerotation();
    const a = await m.plages.attribuer(
      guichet("g2", 2, { titulaire: { id: "p-1", nom: "Marie Ngono" } }),
      "superviseur-1",
    );
    expect(a).toMatchObject({
      titulaire: { id: "p-1", nom: "Marie Ngono" },
      attribueePar: "superviseur-1",
      attribueeA: "2027-01-05T21:00:00.000+01:00",
      libereeA: null,
    });
  });
});

describe("AttributionPlagesServeur.plageDe", () => {
  const fiche = {
    id: "x",
    cle: null,
    genre: "guichet" as const,
    rang: 2,
    nbConvoyeurs: null,
    plage: null,
    gareId: GARE,
    compagnieId: COMPAGNIE,
    derniereSyncA: null,
    dernierOrdre: 0,
    octroi: null,
    retire: false,
  };

  it("l'attribution de l'administration passe avant la fiche, qui passe avant le rang", async () => {
    const m = monterNumerotation();
    expect(await m.attribution.plageDe(fiche)).toEqual({ debut: 1001, fin: 1999 });
    expect(await m.attribution.plageDe({ ...fiche, plage: { debut: 10, fin: 20 } })).toEqual({
      debut: 10,
      fin: 20,
    });
    await m.plages.attribuer({ ...guichet("x", 3) });
    expect(await m.attribution.plageDe({ ...fiche, plage: { debut: 10, fin: 20 } })).toEqual({
      debut: 2001,
      fin: 2999,
    });
  });

  it("convoyeur : part de 3001–3999 selon le rang ; rien quand le rang manque ou est invalide", async () => {
    const m = monterNumerotation();
    const c = { ...fiche, genre: "convoyeur" as const, rang: 2, nbConvoyeurs: 3 };
    expect(await m.attribution.plageDe(c)).toEqual(domaine.plageConvoyeur(2, 3));
    expect(await m.attribution.plageDe({ ...c, rang: 5 })).toBeNull();
    expect(await m.attribution.plageDe({ ...c, nbConvoyeurs: null })).toBeNull();
    expect(await m.attribution.plageDe({ ...c, rang: null })).toBeNull();
    expect(await m.attribution.plageDe({ ...fiche, genre: "autre" })).toBeNull();
    expect(await m.attribution.plageDe({ ...fiche, rang: 9 })).toBeNull();
  });
});
