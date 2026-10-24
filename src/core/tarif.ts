// Prix : tarif de ligne + règles activables par le patron (Config → Tarifs).
export interface ReglesPrix { dynamique: boolean; etudiant: boolean }
export const REDUCTION_ETUDIANT = 0.2;
/** Prix dynamique : −500 F sous 50 % de remplissage à J−1, +500 F au-dessus de 90 %. */
export function prixDynamique(base: number, remplissage: number, joursAvant: number, actif: boolean): number {
  if (!actif) return base;
  if (remplissage > 0.9) return base + 500;
  if (remplissage < 0.5 && joursAvant <= 1) return Math.max(0, base - 500);
  return base;
}
export const prixEtudiant = (prix: number) => Math.round((prix * (1 - REDUCTION_ETUDIANT)) / 50) * 50;
export const fmtF = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`.replace(/[\u202f\u00a0]/g, ' ');
/** Frais de service retenus sur un remboursement à l'initiative du voyageur. */
export const TAUX_FRAIS_ANNULATION = 0.1;
export const DELAI_ANNULATION_MIN = 120;
export interface Remboursement { possible: boolean; frais: number; rembourse: number; raison: string }
/** Annulation par le voyageur : 10 % de frais jusqu'à 2 h avant le départ, rien après. Annulation par la compagnie : remboursement intégral. */
export function remboursement(prix: number, minutesAvantDepart: number, parCompagnie = false): Remboursement {
  if (parCompagnie) return { possible: true, frais: 0, rembourse: prix, raison: 'Départ annulé par la compagnie : remboursement intégral' };
  if (minutesAvantDepart < DELAI_ANNULATION_MIN) return { possible: false, frais: 0, rembourse: 0, raison: 'Moins de 2 h avant le départ : le billet n’est plus remboursable' };
  const frais = Math.round((prix * TAUX_FRAIS_ANNULATION) / 50) * 50;
  return { possible: true, frais, rembourse: prix - frais, raison: 'Frais d’annulation (2 h avant · 10 %)' };
}
