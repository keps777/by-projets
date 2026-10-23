// Historique du score : mise à jour pure de la valeur et de la courbe sur 6 mois.
import { SCORE_MAX, SCORE_MIN, borner } from './score.ts';
import { niveauDuScore, type Niveau } from './credit.ts';

export interface PointHistorique { mois: string; valeur: number }
export const MOIS_HISTORIQUE = 6;
const COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** Libellé court du mois d'une date (« oct. »), identique à celui de l'historique de démonstration. */
export const libelleMois = (d: Date) => COURTS[d.getMonth()];

/** Aligne la dernière barre sur le mois en cours (la crée si le mois a changé) et ne garde que les 6 derniers mois. */
export function synchroniserHistorique(historique: PointHistorique[], valeur: number, mois: string): PointHistorique[] {
  const h = historique.map((p) => ({ ...p }));
  const dernier = h[h.length - 1];
  if (dernier && dernier.mois === mois) dernier.valeur = valeur; else h.push({ mois, valeur });
  return h.slice(-MOIS_HISTORIQUE);
}
export interface ResultatPoints { avant: number; apres: number; reel: number; niveauAvant: Niveau; niveauApres: Niveau; historique: PointHistorique[] }
/** Applique un delta (borné à 400–900) et met la courbe à jour. */
export function appliquerPoints(valeur: number, delta: number, historique: PointHistorique[], mois: string): ResultatPoints {
  const apres = borner(valeur + delta);
  return { avant: valeur, apres, reel: apres - valeur, niveauAvant: niveauDuScore(valeur), niveauApres: niveauDuScore(apres), historique: synchroniserHistorique(historique, apres, mois) };
}
/** Points gagnés ce mois-ci : écart avec le mois précédent ; null s'il n'y a pas de mois de référence. */
export function gainDuMois(historique: PointHistorique[]): number | null {
  return historique.length < 2 ? null : historique[historique.length - 1].valeur - historique[historique.length - 2].valeur;
}
/** Position (0 à 1) sur la jauge 400–900. */
export const fractionJauge = (valeur: number) => (Math.max(SCORE_MIN, Math.min(SCORE_MAX, valeur)) - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
/** Barre de l'historique : 6 à 52 px sur l'échelle 400–900 (le score peut descendre sous 500). */
export const hauteurBarreScore = (valeur: number) => Math.round(fractionJauge(valeur) * 46) + 6;
/** Valeur de signal (0 à 100) poussée par un événement : 60 % des points, borné. */
export const pousserSignal = (signal: number, delta: number) => Math.max(0, Math.min(100, Math.round(signal + delta * 0.6)));
