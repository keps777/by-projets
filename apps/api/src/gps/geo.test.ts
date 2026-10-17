import { describe, expect, it } from "vitest";
import { distanceKm, distanceM, positionSurLigne, projeterSurSegment } from "./geo";
import { COORDONNEES, arretsLigne, pointAuKm } from "./testing/monde";

describe("distance", () => {
  it("Douala–Yaoundé à vol d'oiseau : environ 200 km", () => {
    const d = distanceKm(COORDONNEES.douala, COORDONNEES.yaounde);
    expect(d).toBeGreaterThan(190);
    expect(d).toBeLessThan(210);
  });

  it("est nulle pour le même point et symétrique", () => {
    expect(distanceKm(COORDONNEES.edea, COORDONNEES.edea)).toBe(0);
    expect(distanceKm(COORDONNEES.edea, COORDONNEES.pouma)).toBeCloseTo(
      distanceKm(COORDONNEES.pouma, COORDONNEES.edea),
      9,
    );
  });

  it("un degré de latitude vaut environ 111 km ; distanceM est en mètres", () => {
    const d = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(d).toBeCloseTo(111.2, 0);
    expect(distanceM({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
      d * 1000,
      6,
    );
  });
});

describe("projection sur un segment", () => {
  const a = { latitude: 4, longitude: 10 };
  const b = { latitude: 4, longitude: 11 };

  it("le milieu du segment est à la fraction 0,5, écart nul", () => {
    const p = projeterSurSegment({ latitude: 4, longitude: 10.5 }, a, b);
    expect(p.fraction).toBeCloseTo(0.5, 3);
    expect(p.ecartKm).toBeCloseTo(0, 3);
  });

  it("un point à côté du segment est projeté et son écart mesuré", () => {
    // 0,1° de latitude au nord du milieu : environ 11 km.
    const p = projeterSurSegment({ latitude: 4.1, longitude: 10.5 }, a, b);
    expect(p.fraction).toBeCloseTo(0.5, 3);
    expect(p.ecartKm).toBeCloseTo(11.1, 0);
  });

  it("avant le début ou après la fin, la fraction est bornée", () => {
    expect(projeterSurSegment({ latitude: 4, longitude: 9 }, a, b).fraction).toBe(0);
    expect(projeterSurSegment({ latitude: 4, longitude: 12 }, a, b).fraction).toBe(1);
  });

  it("un segment réduit à un point ne produit pas de NaN", () => {
    const p = projeterSurSegment({ latitude: 4.01, longitude: 10 }, a, a);
    expect(p.fraction).toBe(0);
    expect(Number.isFinite(p.ecartKm)).toBe(true);
  });
});

describe("position sur la ligne", () => {
  const arrets = arretsLigne("a");

  it("un arrêt se trouve à ses kilomètres", () => {
    expect(positionSurLigne(COORDONNEES.edea, arrets).progressionKm).toBeCloseTo(65, 1);
    expect(positionSurLigne(COORDONNEES.pouma, arrets).progressionKm).toBeCloseTo(110, 1);
    expect(positionSurLigne(COORDONNEES.douala, arrets).progressionKm).toBeCloseTo(0, 1);
    expect(positionSurLigne(COORDONNEES.yaounde, arrets).progressionKm).toBeCloseTo(250, 1);
  });

  it("applique la fraction du segment aux kilomètres de route", () => {
    for (const km of [20, 65, 90, 130, 200]) {
      const sur = positionSurLigne(pointAuKm(km), arrets);
      expect(sur.progressionKm).toBeCloseTo(km, 0);
      expect(sur.ecartKm).toBeLessThan(0.01);
    }
  });

  it("identifie le segment et mesure l'écart à la ligne", () => {
    const loin = { latitude: 3.4, longitude: 10.3 };
    const sur = positionSurLigne(loin, arrets);
    expect(sur.ecartKm).toBeGreaterThan(30);
    expect(sur.segment).toBe(1);
  });

  it("refuse une ligne d'un seul arrêt", () => {
    expect(() => positionSurLigne(COORDONNEES.douala, arrets.slice(0, 1))).toThrow(RangeError);
  });
});
