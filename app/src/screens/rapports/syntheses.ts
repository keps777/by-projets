// Synthèses par jour pour les récapitulatifs (semaine, mois) et les archives. Fonctions pures.
import type { Jour } from '@core/types.ts';
import { atteint, calculerPoints, type DonneesRapport, type PointCalcule, type PointPrepare } from './calcul.ts';
import { joursDe } from './periodes.ts';

export interface JourCalcule { jour: Jour; points: PointCalcule[]; atteints: number; comptes: number; futur: boolean }

/** Calcule chaque jour de la période (les jours après `aujourdhui` sont marqués `futur`, sans calcul). */
export function calculerJours(prep: PointPrepare[], d: DonneesRapport, debut: Jour, fin: Jour, aujourdhui: Jour): JourCalcule[] {
  return joursDe({ debut, fin }).map((jour) => {
    if (jour > aujourdhui) return { jour, points: [], atteints: 0, comptes: 0, futur: true };
    const points = calculerPoints(prep, d, jour, jour);
    return { jour, points, atteints: points.filter((p) => atteint(p.ratio)).length, comptes: points.filter((p) => p.ratio != null).length, futur: false };
  });
}

/** Pourcentage de points atteints sur les jours passés (null s'il n'y a rien à compter). */
export function pctJours(jours: JourCalcule[]): number | null {
  let a = 0, n = 0;
  for (const j of jours) { a += j.atteints; n += j.comptes; }
  return n ? Math.round((a / n) * 100) : null;
}

/** Ratios d'un point jour après jour (null pour les jours futurs ou sans objectif). */
export function ratiosDuPoint(jours: JourCalcule[], pointId: string): (number | null)[] {
  return jours.map((j) => (j.futur ? null : j.points.find((p) => p.point.id === pointId)?.ratio ?? null));
}

/** Niveau d'une case (0 vide, 1 commencé, 2 bien avancé, 3 atteint) pour la grille du mois et les barres de la semaine. */
export function niveau(r: number | null): 0 | 1 | 2 | 3 {
  if (r == null || r <= 0) return 0;
  if (r >= 1) return 3;
  return r >= 0.5 ? 2 : 1;
}

export const formatPct = (p: number | null) => (p == null ? '—' : `${p} %`);
