// Vue Semaine : calculs purs (jours, numéro ISO, bornes de la grille, objectif hebdomadaire, recherche de créneaux libres).
import { ajouterJours, ecartJours, joursDuMois, jourSemaine, lundiDe } from '@core/dates.ts';
import { estLibre } from '@core/disponibilite.ts';
import type { Creneau, Jour, Mois, PeriodeCible } from '@core/types.ts';
import { dateCourte } from './format.ts';

export const joursDeLaSemaine = (j: Jour): Jour[] => Array.from({ length: 7 }, (_, i) => ajouterJours(lundiDe(j), i));

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function numeroSemaine(j: Jour): number {
  const jeudi = ajouterJours(j, 3 - jourSemaine(j));
  return Math.floor(ecartJours(`${jeudi.slice(0, 4)}-01-01`, jeudi) / 7) + 1;
}

/** « 5 oct – 11 oct » (sans le point d'abréviation, comme la maquette). */
export const plageSemaine = (lundi: Jour) => `${dateCourte(lundi)} – ${dateCourte(ajouterJours(lundi, 6))}`.replace(/\./g, '');

/** Heures affichées par la grille : 05:00 – 23:00 au moins, élargies à l'heure ronde si un bloc déborde. */
export function bornesGrille(blocs: { debutMin: number; finMin: number }[]): { debut: number; fin: number } {
  let debut = 300, fin = 1380;
  for (const b of blocs) { debut = Math.min(debut, Math.floor(b.debutMin / 60) * 60); fin = Math.max(fin, Math.ceil(b.finMin / 60) * 60); }
  return { debut: Math.max(0, debut), fin: Math.min(1440, fin) };
}

/** Minutes → « 12h30 ». */
export const hmin = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;

/** Objectif d'une semaine de 7 jours (unité de base), selon la période de la cible. */
export function cibleHebdo(m: { cible: number | null; periode: PeriodeCible }, sp: { debut: Jour; fin: Jour | null }, mois: Mois): number | null {
  if (m.cible == null) return null;
  switch (m.periode) {
    case 'jour': return m.cible * 7;
    case 'semaine': return m.cible;
    case 'mois': return (m.cible * 7) / joursDuMois(mois);
    case 'total': return sp.fin ? (m.cible * 7) / (ecartJours(sp.debut, sp.fin) + 1) : null;
  }
}

/** Durée à proposer pour combler un manque (secondes) : par quarts d'heure, 2 h au plus, rien sous 15 min. */
export function dureeProposee(manqueS: number): number | null {
  if (manqueS < 15 * 60) return null;
  return Math.min(120, Math.ceil(manqueS / 60 / 15) * 15);
}

export interface Creneautrouve { jour: Jour; debut: number }

/** Plages essayées, dans l'ordre : le soir d'abord, puis toute la journée active. */
export const PLAGES: [number, number][] = [[18 * 60, 22 * 60], [7 * 60, 22 * 60]];

/**
 * Premier créneau libre de `duree` minutes, au quart d'heure, dans les jours donnés (dans l'ordre).
 * `apres` exclut ce qui est déjà passé (aujourd'hui). `eviter` : jours déjà servis, essayés en dernier.
 */
export function trouverCreneau(creneaux: Record<Jour, Creneau[]>, jours: Jour[], duree: number, apres?: { jour: Jour; min: number }, eviter: Set<Jour> = new Set()): Creneautrouve | null {
  const ordre = [...jours.filter((j) => !eviter.has(j)), ...jours.filter((j) => eviter.has(j))];
  for (const [p0, p1] of PLAGES) {
    for (const jour of ordre) {
      if (apres && jour < apres.jour) continue;
      const min = apres && jour === apres.jour ? Math.ceil((apres.min + 15) / 15) * 15 : 0;
      for (let t = Math.max(p0, min); t + duree <= p1; t += 15) if (estLibre(creneaux[jour] ?? [], t, t + duree)) return { jour, debut: t };
    }
  }
  return null;
}
