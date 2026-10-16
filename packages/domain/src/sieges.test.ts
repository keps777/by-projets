import { describe, expect, it } from "vitest";
import {
  bloquerSiege,
  creerPlanSieges,
  libererSiege,
  occuperSiege,
  prochainSiegeHorsLigne,
  repartirPartsHorsLigne,
  siegeLibre,
  siegesLibres,
} from "./sieges";

const T0 = "2027-01-05T05:00:00+01:00";

describe("plan de sièges", () => {
  it("bloque un siège 15 min puis le rend", () => {
    const plan = bloquerSiege(creerPlanSieges(40), 7, "commande-1", T0);
    expect(siegeLibre(plan, 7, "2027-01-05T05:14:59+01:00")).toBe(false);
    expect(siegeLibre(plan, 7, "2027-01-05T05:15:00+01:00")).toBe(true);
    expect(() => bloquerSiege(plan, 7, "commande-2", "2027-01-05T05:05:00+01:00")).toThrow();
  });

  it("occupe un siège pour un billet, une seule fois, et le libère à l'annulation", () => {
    let plan = occuperSiege(creerPlanSieges(40), 19, "billet-1", T0);
    expect(siegesLibres(plan, T0)).toHaveLength(39);
    expect(() => occuperSiege(plan, 19, "billet-2", T0)).toThrow();
    plan = libererSiege(plan, 19);
    expect(siegesLibres(plan, T0)).toHaveLength(40);
  });

  it("un siège bloqué par une commande ne peut être pris que par cette commande", () => {
    const plan = bloquerSiege(creerPlanSieges(40), 3, "commande-1", T0);
    expect(() => occuperSiege(plan, 3, "billet-x", T0, "commande-2")).toThrow();
    const pris = occuperSiege(plan, 3, "billet-1", T0, "commande-1");
    expect(pris.bloques[3]).toBeUndefined();
    expect(pris.occupes[3]).toBe("billet-1");
  });

  it("refuse un siège inexistant", () => {
    expect(() => siegeLibre(creerPlanSieges(40), 41, T0)).toThrow(RangeError);
    expect(() => siegeLibre(creerPlanSieges(40), 0, T0)).toThrow(RangeError);
  });
});

describe("part de sièges hors ligne par guichet", () => {
  it("répartit sans chevauchement ni oubli, en gardant une réserve en ligne", () => {
    const plan = repartirPartsHorsLigne(creerPlanSieges(40), ["g1", "g2", "g3"], 4);
    const toutes = Object.values(plan.partsHorsLigne).flat();
    expect(new Set(toutes).size).toBe(toutes.length);
    expect(toutes).toHaveLength(36);
    expect(Math.max(...toutes)).toBe(36);
    expect(plan.partsHorsLigne["g1"]).toHaveLength(12);
  });

  it("un guichet hors ligne ne vend que dans sa part, même quand les autres sont pleins", () => {
    let plan = repartirPartsHorsLigne(creerPlanSieges(10), ["g1", "g2"]);
    const partG1 = plan.partsHorsLigne["g1"]!;
    for (let i = 0; i < partG1.length; i++) {
      const s = prochainSiegeHorsLigne(plan, "g1", T0);
      expect(s).not.toBeNull();
      expect(partG1).toContain(s);
      plan = occuperSiege(plan, s!, `b${i}`, T0);
    }
    expect(prochainSiegeHorsLigne(plan, "g1", T0)).toBeNull();
    expect(prochainSiegeHorsLigne(plan, "g2", T0)).toBe(plan.partsHorsLigne["g2"]![0]);
  });

  it("deux guichets qui vendent chacun jusqu'au bout n'occupent jamais le même siège", () => {
    let plan = repartirPartsHorsLigne(creerPlanSieges(40), ["g1", "g2", "g3"]);
    const ventes: number[] = [];
    for (let tour = 0; tour < 14; tour++) {
      for (const g of ["g1", "g2", "g3"]) {
        const s = prochainSiegeHorsLigne(plan, g, T0);
        if (s === null) continue;
        ventes.push(s);
        plan = occuperSiege(plan, s, `${g}-${tour}`, T0);
      }
    }
    expect(ventes).toHaveLength(40);
    expect(new Set(ventes).size).toBe(40);
  });
});
