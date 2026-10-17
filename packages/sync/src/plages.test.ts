import { describe, expect, it } from "vitest";
import { RepartitionImpossible, repartirPlages, verifierPlagesDisjointes } from "./plages";

describe("répartition des plages", () => {
  it("3 guichets et 4 convoyeurs : plages disjointes, celles du plan de numérotation", () => {
    const plages = repartirPlages([
      { appareilId: "g1", genre: "guichet" },
      { appareilId: "g2", genre: "guichet" },
      { appareilId: "g3", genre: "guichet" },
      { appareilId: "c1", genre: "convoyeur" },
      { appareilId: "c2", genre: "convoyeur" },
      { appareilId: "c3", genre: "convoyeur" },
      { appareilId: "c4", genre: "convoyeur" },
    ]);
    expect(plages.get("g1")).toEqual({ debut: 1, fin: 999 });
    expect(plages.get("g2")).toEqual({ debut: 1001, fin: 1999 });
    expect(plages.get("g3")).toEqual({ debut: 2001, fin: 2999 });
    expect(plages.get("c1")).toEqual({ debut: 3001, fin: 3249 });
    expect(plages.get("c4")!.fin).toBeLessThanOrEqual(3999);
    expect(() => verifierPlagesDisjointes([...plages.values()])).not.toThrow();
  });

  it("refuse un quatrième guichet et un appareil en double", () => {
    const quatre = [1, 2, 3, 4].map((i) => ({ appareilId: `g${i}`, genre: "guichet" as const }));
    expect(() => repartirPlages(quatre)).toThrow(RepartitionImpossible);
    expect(() =>
      repartirPlages([
        { appareilId: "g1", genre: "guichet" },
        { appareilId: "g1", genre: "guichet" },
      ]),
    ).toThrow(RepartitionImpossible);
  });

  it("détecte des plages qui se recouvrent", () => {
    expect(() =>
      verifierPlagesDisjointes([
        { debut: 1, fin: 999 },
        { debut: 999, fin: 1999 },
      ]),
    ).toThrow(/recouvrent/);
  });
});
