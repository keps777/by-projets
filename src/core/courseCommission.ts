// Commission AfriMove sur les courses moto / taxi : 10 % de la course, quel que soit le moyen de paiement. Pur.
import type { MoyenCourse } from './course.ts';

export const TAUX_COMMISSION_COURSE = 0.1;
const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
/** Commission AfriMove d'une course (FCFA, arrondie au franc). */
export const commissionCourse = (prix: number) => Math.round(prix * TAUX_COMMISSION_COURSE);

export interface DetailPaiementCourse {
  prix: number; commission: number; /** Ce que le conducteur garde. */ netConducteur: number;
  /** Espèces : la commission n'est pas retenue sur un paiement, elle est prélevée sur le compte du conducteur. */ prelevee: 'sur_paiement' | 'sur_compte_conducteur';
  /** Montant que la voyageuse remet au conducteur en main propre (0 si elle paie dans l'app). */ auConducteur: number; texte: string;
}
/** Qui touche quoi : MoMo, Orange Money et cagnotte retiennent la commission sur le paiement ; en espèces le conducteur encaisse tout et AfriMove prélève sa part sur son compte. */
export function detailPaiementCourse(prix: number, moyen: MoyenCourse): DetailPaiementCourse {
  const commission = commissionCourse(prix), netConducteur = prix - commission;
  if (moyen === 'especes') return { prix, commission, netConducteur, prelevee: 'sur_compte_conducteur', auConducteur: prix, texte: `Tu paies ${fmt(prix)} au conducteur · commission AfriMove ${fmt(commission)} prélevée sur son compte` };
  return { prix, commission, netConducteur, prelevee: 'sur_paiement', auConducteur: 0, texte: `Tu paies ${fmt(prix)} dans l’app · commission AfriMove ${fmt(commission)} retenue sur le paiement (conducteur : ${fmt(netConducteur)})` };
}
