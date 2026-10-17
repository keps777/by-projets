import { randomUUID } from "node:crypto";
import { FichesVoyageurMemoire, StockageConnexionMemoire } from "./memoire";
import { contratFichesVoyageur, contratStockageConnexion } from "./testing/contrat-stockage";

contratStockageConnexion("mémoire", async () => ({
  banc: { stockage: new StockageConnexionMemoire(), nouveauNumero: () => randomUUID() },
}));

contratFichesVoyageur("mémoire", async () => ({ fiches: new FichesVoyageurMemoire() }));
