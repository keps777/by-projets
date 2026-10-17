import { describe, expect, it } from "vitest";
import { resoudreSiege, type OperationSiege } from "./sieges";

const T0 = Date.parse("2027-01-05T08:00:00+01:00");
const MIN = 60_000;

let n = 0;
function op(
  kind: OperationSiege["kind"],
  billetId: string,
  minutes: number,
  appareilId = "g1",
): OperationSiege {
  n += 1;
  return {
    evenementId: `e${String(n).padStart(3, "0")}`,
    billetId,
    kind,
    at: T0 + minutes * MIN,
    appareilId,
    auteurId: `p-${appareilId}`,
  };
}

describe("resoudreSiege : le premier horodatage gagne", () => {
  it("un seul billet : il occupe le siège, aucun perdant", () => {
    expect(resoudreSiege([op("prend", "A", 0)])).toEqual({ occupant: "A", perdants: [] });
  });

  it("deux billets pour le même siège : le plus tôt gagne, l'autre est à replacer", () => {
    const a = op("prend", "A", 5, "g1");
    const b = op("prend", "B", 2, "g2");
    const r = resoudreSiege([a, b]);
    expect(r.occupant).toBe("B");
    expect(r.perdants).toEqual([
      {
        billetId: "A",
        evenementId: a.evenementId,
        gagnantBilletId: "B",
        appareilId: "g1",
        auteurId: "p-g1",
      },
    ]);
  });

  it("le résultat ne dépend pas de l'ordre d'arrivée", () => {
    const ops = [op("prend", "A", 5, "g1"), op("prend", "B", 2, "g2"), op("prend", "C", 9, "g3")];
    const attendu = resoudreSiege(ops);
    for (const permutation of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]) {
      expect(resoudreSiege(permutation.map((i) => ops[i]!))).toEqual(attendu);
    }
    expect(attendu.occupant).toBe("B");
    expect(attendu.perdants.map((p) => p.billetId).sort()).toEqual(["A", "C"]);
  });

  it("égalité à la milliseconde : l'appareil puis l'identifiant d'événement départagent, toujours pareil", () => {
    const a = op("prend", "A", 3, "g2");
    const b = op("prend", "B", 3, "g1");
    expect(resoudreSiege([a, b]).occupant).toBe("B");
    expect(resoudreSiege([b, a]).occupant).toBe("B");
    const c = op("prend", "C", 3, "g1");
    expect(resoudreSiege([c, b]).occupant).toBe(resoudreSiege([b, c]).occupant);
  });

  it("une libération datée d'avant la seconde vente rend le siège : pas de conflit", () => {
    const r = resoudreSiege([
      op("prend", "A", 0, "g1"),
      op("libere", "A", 10, "g1"),
      op("prend", "B", 20, "g2"),
    ]);
    expect(r).toEqual({ occupant: "B", perdants: [] });
  });

  it("une libération arrivée en retard mais datée d'avant lève le conflit", () => {
    const prend1 = op("prend", "A", 0, "g1");
    const prend2 = op("prend", "B", 20, "g2");
    expect(resoudreSiege([prend1, prend2]).perdants).toHaveLength(1);
    const avecLiberation = resoudreSiege([prend1, prend2, op("libere", "A", 10, "g1")]);
    expect(avecLiberation).toEqual({ occupant: "B", perdants: [] });
  });

  it("un perdant qui « libère » ne libère pas le siège du gagnant", () => {
    const r = resoudreSiege([
      op("prend", "A", 0, "g1"),
      op("prend", "B", 5, "g2"),
      op("libere", "B", 8, "g2"),
    ]);
    expect(r.occupant).toBe("A");
    expect(r.perdants.map((p) => p.billetId)).toEqual(["B"]);
  });

  it("le même billet rejoué sous un autre identifiant d'événement n'est pas un conflit", () => {
    const r = resoudreSiege([op("prend", "A", 0, "g1"), op("prend", "A", 0, "g1")]);
    expect(r).toEqual({ occupant: "A", perdants: [] });
  });

  it("aucune opération : siège libre", () => {
    expect(resoudreSiege([])).toEqual({ occupant: null, perdants: [] });
  });

  it("ne modifie pas la liste reçue", () => {
    const ops = [op("prend", "A", 5), op("prend", "B", 1, "g2")];
    const copie = [...ops];
    resoudreSiege(ops);
    expect(ops).toEqual(copie);
  });
});
