// Vue Mois : calculs purs de la grille, de la charge par rubrique et des statistiques du mois.
import { ajouterJours, joursDuMois, jourSemaine, premierDuMois } from '@core/dates.ts';
import type { Jour, Mois } from '@core/types.ts';

/** Cases vides avant le 1er (semaine commençant le lundi) et jours du mois. */
export function grilleMois(mois: Mois): { avant: number; jours: Jour[] } {
  const premier = premierDuMois(mois);
  return { avant: jourSemaine(premier), jours: Array.from({ length: joursDuMois(mois) }, (_, i) => ajouterJours(premier, i)) };
}

export interface Segment { couleur: string; minutes: number }
export interface Charge { minutes: number; segments: Segment[]; faits: number; total: number }

/** Charge planifiée d'un jour, par couleur de rubrique (dans l'ordre d'apparition), et blocs faits. */
export function chargeDuJour(blocs: { debutMin: number; finMin: number; couleur: string; fait: boolean }[]): Charge {
  const par = new Map<string, number>();
  let minutes = 0, faits = 0;
  for (const b of blocs) {
    const d = b.finMin - b.debutMin;
    minutes += d;
    par.set(b.couleur, (par.get(b.couleur) ?? 0) + d);
    if (b.fait) faits++;
  }
  return { minutes, segments: [...par].map(([couleur, m]) => ({ couleur, minutes: m })), faits, total: blocs.length };
}

/** Hauteur de la barre de charge d'une case (12 h planifiées ≈ 34 px). */
export const hauteurCharge = (minutes: number) => Math.max(8, Math.round((minutes / 720) * 34));

/** Intensité de la couche « Accompli » (en % de la couleur « bon ») : plus foncé = plus accompli. */
export const teinteAccompli = (pct: number) => Math.round(16 + pct * 0.5);

/** Part du mois écoulée (trait « où je devrais être ») : 100 pour un mois passé, 0 pour un mois futur. */
export function partEcoulee(mois: Mois, aujourdhui: Jour): number {
  const m = aujourdhui.slice(0, 7);
  if (mois < m) return 100;
  if (mois > m) return 0;
  return Math.round((+aujourdhui.slice(8) / joursDuMois(mois)) * 100);
}

export interface StatsMois { moyenneMin: number; accompliPct: number | null; pic: Jour | null }

/** Charge moyenne par jour, accompli moyen des jours passés qui avaient des blocs, jour le plus chargé. */
export function statsMois(jours: { jour: Jour; charge: Charge }[], aujourdhui: Jour): StatsMois {
  if (!jours.length) return { moyenneMin: 0, accompliPct: null, pic: null };
  const total = jours.reduce((s, j) => s + j.charge.minutes, 0);
  const passes = jours.filter((j) => j.jour <= aujourdhui && j.charge.total > 0);
  const accompliPct = passes.length ? Math.round(passes.reduce((s, j) => s + (j.charge.faits / j.charge.total) * 100, 0) / passes.length) : null;
  const pic = jours.reduce((a, b) => (b.charge.minutes > a.charge.minutes ? b : a));
  return { moyenneMin: Math.round(total / jours.length), accompliPct, pic: pic.charge.minutes > 0 ? pic.jour : null };
}
