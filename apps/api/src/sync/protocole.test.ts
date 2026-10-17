import { describe, expect, it } from "vitest";
import { TAILLE_LOT_MAX, LotInvalide, lireLot, validerEvenement } from "./protocole";
import { annulationAcceptee, siegeLibere, siegeOccupe } from "./sieges";

const ID = "00000000-0000-4000-8000-000000000001";
const AT = "2027-01-05T05:30:00.000+01:00";

const vente = (surcharge: Record<string, unknown> = {}, donnees: Record<string, unknown> = {}) => ({
  id: ID,
  type: "billet.vendu",
  at: AT,
  appareilId: "g2",
  auteurId: "p1",
  cible: { type: "billet", id: "b1" },
  numeroPlage: 1001,
  donnees: { billetId: "b1", departId: "d1", siege: 7, ...donnees },
  ...surcharge,
});

describe("lireLot", () => {
  const ligne = { ordre: 1, evenement: {}, signature: "ab" };

  it("accepte un lot vide (prise de nouvelles)", () => {
    expect(lireLot({ appareilId: "g2", envoyeA: AT, evenements: [] }).evenements).toEqual([]);
  });

  it("refuse tout ce qui n'est pas la forme du lot", () => {
    for (const corps of [
      null,
      "x",
      [],
      {},
      { appareilId: "", envoyeA: AT, evenements: [] },
      { appareilId: "g", envoyeA: "pas une date", evenements: [] },
      { appareilId: "g", envoyeA: AT },
      { appareilId: "g", envoyeA: AT, evenements: [null] },
      { appareilId: "g", envoyeA: AT, evenements: [{ ...ligne, ordre: 0 }] },
      { appareilId: "g", envoyeA: AT, evenements: [{ ...ligne, ordre: 1.5 }] },
      { appareilId: "g", envoyeA: AT, evenements: [{ ...ligne, ordre: "1" }] },
    ]) {
      expect(() => lireLot(corps), JSON.stringify(corps)).toThrow(LotInvalide);
    }
  });

  it(`refuse plus de ${TAILLE_LOT_MAX} événements`, () => {
    const lot = (n: number) => ({
      appareilId: "g",
      envoyeA: AT,
      evenements: Array.from({ length: n }, (_, i) => ({ ...ligne, ordre: i + 1 })),
    });
    expect(lireLot(lot(TAILLE_LOT_MAX)).evenements).toHaveLength(TAILLE_LOT_MAX);
    expect(() => lireLot(lot(TAILLE_LOT_MAX + 1))).toThrow(/trop gros/);
  });
});

describe("validerEvenement", () => {
  it("accepte une vente complète et la rend telle quelle", () => {
    const r = validerEvenement(vente());
    expect(r).toMatchObject({
      ok: true,
      evenement: { id: ID, numeroPlage: 1001, type: "billet.vendu" },
    });
  });

  it("une vente sans siège est permise pour billet.vendu seulement", () => {
    expect(validerEvenement(vente({}, { siege: null })).ok).toBe(true);
    const cadence = validerEvenement(vente({ type: "billet.vendu_cadence" }, { siege: null }));
    expect(cadence).toMatchObject({ ok: false, code: "donnees_invalides" });
  });

  it.each([
    ["id pas UUID", { id: "abc" }, "enveloppe_invalide"],
    ["type inconnu", { type: "billet.offert" }, "type_inconnu"],
    ["heure sans le décalage de Douala", { at: "2027-01-05T04:30:00.000Z" }, "enveloppe_invalide"],
    ["heure illisible", { at: "hier" }, "enveloppe_invalide"],
    ["appareil manquant", { appareilId: "" }, "enveloppe_invalide"],
    ["auteur manquant", { auteurId: undefined }, "enveloppe_invalide"],
    ["cible inconnue", { cible: { type: "voiture", id: "x" } }, "enveloppe_invalide"],
    ["numéro manquant sur un type numéroté", { numeroPlage: null }, "enveloppe_invalide"],
    ["numéro à zéro", { numeroPlage: 0 }, "enveloppe_invalide"],
    ["numéro décimal", { numeroPlage: 3.5 }, "enveloppe_invalide"],
    ["numéro trop grand", { numeroPlage: 10_000 }, "enveloppe_invalide"],
    ["données absentes", { donnees: null }, "donnees_invalides"],
    ["données en liste", { donnees: [] }, "donnees_invalides"],
  ])("refuse : %s", (_nom, surcharge, code) => {
    expect(validerEvenement(vente(surcharge))).toMatchObject({ ok: false, code });
  });

  it("un type non numéroté refuse un numéro de plage", () => {
    const e = {
      id: ID,
      type: "caisse.ouverte",
      at: AT,
      appareilId: "g2",
      auteurId: "p1",
      cible: { type: "session", id: "s1" },
      numeroPlage: 12,
      donnees: {},
    };
    expect(validerEvenement(e)).toMatchObject({ ok: false, code: "enveloppe_invalide" });
    expect(validerEvenement({ ...e, numeroPlage: null }).ok).toBe(true);
  });

  it.each([
    [{ siege: 0 }],
    [{ siege: 1.5 }],
    [{ siege: "7" }],
    [{ billetId: "" }],
    [{ departId: undefined }],
  ])("refuse une vente aux champs de siège incorrects %j", (donnees) => {
    expect(validerEvenement(vente({}, donnees))).toMatchObject({
      ok: false,
      code: "donnees_invalides",
    });
  });

  it("valide les données d'un déblocage et d'une annulation", () => {
    const base = { appareilId: "g2", auteurId: "p1", at: AT, id: ID, numeroPlage: null };
    expect(
      validerEvenement({
        ...base,
        type: "appareil.debloque",
        cible: { type: "appareil", id: "g3" },
        donnees: { appareilId: "g3", option: "debloquer_4h", validePar: { superviseurId: "s1" } },
      }).ok,
    ).toBe(true);
    for (const donnees of [
      { appareilId: "g3", option: "tout", validePar: { superviseurId: "s1" } },
      { appareilId: "g3", option: "debloquer_4h", validePar: {} },
      { option: "debloquer_4h", validePar: { superviseurId: "s1" } },
    ]) {
      expect(
        validerEvenement({
          ...base,
          type: "appareil.debloque",
          cible: { type: "appareil", id: "g3" },
          donnees,
        }),
      ).toMatchObject({ ok: false, code: "donnees_invalides" });
    }
    expect(
      validerEvenement({
        ...base,
        type: "annulation.decidee",
        cible: { type: "demande", id: "r1" },
        donnees: { billetId: "b1", decision: "peut-etre" },
      }),
    ).toMatchObject({ ok: false, code: "donnees_invalides" });
  });
});

describe("lecture des sièges", () => {
  const e = (surcharge: Record<string, unknown>, donnees: Record<string, unknown> = {}) => {
    const r = validerEvenement(vente(surcharge, donnees));
    if (!r.ok) throw new Error(r.message);
    return r.evenement;
  };

  it("une vente occupe son siège, une vente sans siège n'occupe rien", () => {
    expect(siegeOccupe(e({}))).toEqual({ departId: "d1", billetId: "b1", siege: 7 });
    expect(siegeOccupe(e({}, { siege: null }))).toBeNull();
  });

  it("un autre type n'occupe aucun siège", () => {
    const ev = { ...e({}), type: "colis.enregistre" };
    expect(siegeOccupe(ev)).toBeNull();
    expect(siegeLibere(ev)).toBeNull();
  });

  it("quai.libere libère le siège", () => {
    expect(siegeLibere({ ...e({}), type: "quai.libere" })).toEqual({
      departId: "d1",
      billetId: "b1",
      siege: 7,
    });
  });

  it("une annulation acceptée libère le billet, un refus non", () => {
    const base = { ...e({}), type: "annulation.decidee" };
    expect(
      annulationAcceptee({ ...base, donnees: { billetId: "b1", decision: "rembourser" } }),
    ).toBe("b1");
    expect(annulationAcceptee({ ...base, donnees: { billetId: "b1", decision: "avoir" } })).toBe(
      "b1",
    );
    expect(
      annulationAcceptee({ ...base, donnees: { billetId: "b1", decision: "refuser" } }),
    ).toBeNull();
  });
});
