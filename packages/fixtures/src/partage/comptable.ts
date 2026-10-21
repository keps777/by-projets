/**
 * Décembre 2026 vu par les planches du comptable (Comptable, ComptableRapprochement, ComptableApercu,
 * ComptableCloture). Les totaux sont cohérents entre elles ; les nombres de lignes d'export ne le sont
 * pas (voir INCOHERENCES.md).
 */

const MOMO_ENREGISTRE = 7_648_000;
const MOMO_RECU = 7_632_000;
const CASH = 20_766_000;

export const DECEMBRE = {
  mois: "Décembre 2026",
  cloture: "clôture le 5 du mois",
  encaisse: CASH + MOMO_ENREGISTRE,
  cash: CASH,
  momo: {
    ventes: 1912,
    enregistre: MOMO_ENREGISTRE,
    recu: MOMO_RECU,
    /** Écart de rapprochement : enregistré − reçu. */
    sansCorrespondance: MOMO_ENREGISTRE - MOMO_RECU,
    transactions: 4,
  },
} as const;

/** Les 4 transactions MoMo sans billet ni colis (ComptableRapprochement). */
export const TRANSACTIONS_SANS_CORRESPONDANCE = [
  { reference: "MP261203.1142.A71290", montant: 4000 },
  { reference: "OM261209.0658.K01884", montant: 4000 },
  { reference: "MP261217.1930.B55012", montant: 5000 },
  { reference: "OM261228.1405.Q77731", montant: 3000 },
] as const;
