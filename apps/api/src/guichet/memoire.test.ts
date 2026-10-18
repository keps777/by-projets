import { randomUUID } from "node:crypto";
import { ImpressionsMemoire } from "./memoire";
import { contratImpressions } from "./testing/contrat-ports";

contratImpressions("mémoire", async () => ({
  impressions: new ImpressionsMemoire(),
  nouveauContexte: async () => ({ auteurId: randomUUID(), compagnieId: randomUUID() }),
  fermer: async () => undefined,
}));
