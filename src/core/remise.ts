// Avantages de la voyageuse au paiement : bons de fidélité (montants entiers) puis cagnotte AfriMove (gestes commerciaux).
// On garde toujours un minimum à régler en ligne : une remise ne rend jamais un billet gratuit.
export const MINIMUM_A_REGLER = 500;
export interface Remise { /** Nombre de bons consommés (dans l'ordre donné). */ bons: number; bon: number; cagnotte: number; total: number }
export const AUCUNE_REMISE: Remise = { bons: 0, bon: 0, cagnotte: 0, total: 0 };

/** Les bons d'abord (un bon n'est jamais coupé), puis la cagnotte ; le net ne descend pas sous `MINIMUM_A_REGLER`. */
export function calculerRemise(total: number, bons: number[], cagnotte: number, plancher = MINIMUM_A_REGLER): Remise {
  let reste = Math.max(0, total - plancher), nb = 0, bon = 0;
  for (const b of bons) { if (b <= 0 || b > reste) continue; reste -= b; bon += b; nb++; }
  const c = Math.max(0, Math.min(Math.floor(cagnotte), reste));
  return { bons: nb, bon, cagnotte: c, total: bon + c };
}
