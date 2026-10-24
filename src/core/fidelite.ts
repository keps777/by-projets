// Fidélité : 1 point par 100 F de billet payé, paliers selon les points cumulés, parrainage, valeur d'un point à l'utilisation.
export interface Palier { id: 'bronze' | 'argent' | 'or' | 'platine'; nom: string; min: number }
export const PALIERS: Palier[] = [{ id: 'bronze', nom: 'Bronze', min: 0 }, { id: 'argent', nom: 'Argent', min: 500 }, { id: 'or', nom: 'Or', min: 2000 }, { id: 'platine', nom: 'Platine', min: 5000 }];
export const FCFA_PAR_POINT = 100;
/** Points pour obtenir un billet offert (palier Or). */
export const POINTS_BILLET_OFFERT = 2000;
export const POINTS_PARRAINAGE = 500;
/** Utiliser des points : 500 points = un bon de 500 F. */
export const POINTS_BON = 500;
export const VALEUR_BON = 500;

/** 1 point par tranche entière de 100 F payée (7 500 F → 75 points). */
export const pointsPourBillet = (prix: number) => Math.max(0, Math.floor(prix / FCFA_PAR_POINT));
/** Palier atteint pour un cumul de points gagnés (les points dépensés ne font pas redescendre). */
export function palierDe(cumul: number): Palier { let p = PALIERS[0]; for (const x of PALIERS) if (cumul >= x.min) p = x; return p; }
export const palierSuivant = (cumul: number): Palier | null => PALIERS.find((p) => p.min > cumul) ?? null;
/** Nombre de paliers atteints (1 à 4) pour la barre à 4 segments. */
export const nbPaliers = (cumul: number) => PALIERS.filter((p) => cumul >= p.min).length;
/** Points qui manquent pour le billet offert (0 si atteint). */
export const pointsAvantBilletOffert = (solde: number) => Math.max(0, POINTS_BILLET_OFFERT - solde);
export const pourcentBilletOffert = (solde: number) => Math.min(100, Math.round((solde / POINTS_BILLET_OFFERT) * 100));
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
/** Code de parrainage stable : PRÉNOM-NN, NN tiré des 4 derniers chiffres du numéro (AICHA-24 pour la voyageuse de démo). */
export function codeParrain(prenom: string, tel: string, id = ''): string {
  if (id === 'p-aicha') return 'AICHA-24';
  const fin = Number(tel.replace(/\D/g, '').slice(-4)) || 0;
  return `${sansAccent(prenom) || 'AMI'}-${String((fin % 90) + 10)}`;
}
