import type { agence } from "@afrimove/contrats";

/** Le billet à imprimer : celui que renvoie la vente (`ResultatVente.billet`). */
export type BilletAImprimer = agence.BilletImprimable;

/**
 * Ce que l'écran demande à l'imprimante 58 mm. Interface locale : elle sera branchée sur `@afrimove/impression`
 * quand AM-075 sera livré (le package n'est pas importé ici). L'impression doit finir en 2 s.
 */
export interface ImpressionBillet {
  imprimerBillet(billet: BilletAImprimer): Promise<void>;
}

/**
 * Impression par défaut en attendant AM-075 : ne fait rien. La demande d'impression est tout de même enregistrée
 * dans le journal par `useImprimer` (événement `impression.demandee`).
 */
export const impressionParDefaut: ImpressionBillet = {
  imprimerBillet: () => Promise.resolve(),
};
