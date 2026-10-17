import type { StockageCle } from "@afrimove/impression";
import { ecrire, lire, retirer } from "@/coquille/stockage";

/**
 * Stockage de la file d'impression et de l'imprimante appairée : le localStorage du navigateur, par les
 * accès de la coquille qui ne cassent jamais (fenêtre privée, stockage bloqué).
 */
export const stockageLocal: StockageCle = {
  lire: (cle) => lire(cle),
  ecrire: (cle, valeur) => ecrire(cle, valeur),
  retirer: (cle) => retirer(cle),
};
