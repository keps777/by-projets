import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FichesVoyageurMemoire, StockageConnexionMemoire } from "./memoire";
import { contratStockageConnexion } from "./testing/contrat-stockage";

contratStockageConnexion("mémoire", async () => ({
  banc: { stockage: new StockageConnexionMemoire(), nouveauNumero: () => randomUUID() },
}));

describe("FichesVoyageurMemoire", () => {
  it("crée la fiche à la première ouverture et la garde ensuite", async () => {
    const fiches = new FichesVoyageurMemoire();
    const premiere = new Date("2027-01-05T08:00:00.000Z");
    const a = await fiches.ouvrir("p1", premiere);
    const b = await fiches.ouvrir("p1", new Date("2027-02-01T08:00:00.000Z"));
    expect(a).toEqual({
      personneId: "p1",
      inscritA: premiere,
      langue: "fr",
      pieceVerifiee: false,
      pieceQuatreDerniers: null,
    });
    expect(b.inscritA).toEqual(premiere);
    expect((await fiches.ouvrir("p2", premiere)).personneId).toBe("p2");
  });
});
