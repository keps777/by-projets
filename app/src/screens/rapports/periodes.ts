// Périodes des rapports (jour, semaine, mois) et leurs libellés en français. Fonctions pures.
import { ajouterJours, dernierDuMois, ecartJours, lundiDe, moisDe, premierDuMois } from '@core/dates.ts';
import type { Jour, Mois } from '@core/types.ts';

export type Vue = 'jour' | 'semaine' | 'mois';
export interface Periode { vue: Vue; debut: Jour; fin: Jour }

export const estVue = (v: string | null | undefined): v is Vue => v === 'jour' || v === 'semaine' || v === 'mois';

const utc = (j: Jour) => new Date(`${j}T00:00:00Z`);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', ...o });
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Période qui contient `jour`. */
export function periodeDe(vue: Vue, jour: Jour): Periode {
  if (vue === 'jour') return { vue, debut: jour, fin: jour };
  if (vue === 'semaine') { const l = lundiDe(jour); return { vue, debut: l, fin: ajouterJours(l, 6) }; }
  const m = moisDe(jour);
  return { vue, debut: premierDuMois(m), fin: dernierDuMois(m) };
}

/** Période précédente (n = −1) ou suivante (n = 1). */
export function decaler(p: Periode, n: number): Periode {
  if (p.vue === 'jour') return periodeDe('jour', ajouterJours(p.debut, n));
  if (p.vue === 'semaine') return periodeDe('semaine', ajouterJours(p.debut, 7 * n));
  return periodeDe('mois', n < 0 ? ajouterJours(p.debut, -1) : ajouterJours(p.fin, 1));
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function semaineIso(j: Jour): number {
  const jeudi = ajouterJours(lundiDe(j), 3);
  return Math.floor(ecartJours(`${jeudi.slice(0, 4)}-01-01`, jeudi) / 7) + 1;
}

/** « Dimanche 4 octobre 2026 » */
export const libelleJourLong = (j: Jour) => majuscule(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(utc(j)));
/** « 4 oct. » */
export const libelleJourCourt = (j: Jour) => fmt({ day: 'numeric', month: 'short' }).format(utc(j));
/** « Dim. » */
export const jourAbrege = (j: Jour) => majuscule(fmt({ weekday: 'short' }).format(utc(j)));
/** « Septembre 2026 » */
export const libelleMois = (m: Mois) => majuscule(fmt({ month: 'long', year: 'numeric' }).format(utc(premierDuMois(m))));
/** « septembre » */
export const nomMois = (m: Mois) => fmt({ month: 'long' }).format(utc(premierDuMois(m)));

/** « 28 sept. – 4 oct. » ou « 21 – 27 sept. » */
export function intervalle(debut: Jour, fin: Jour): string {
  if (moisDe(debut) === moisDe(fin)) return `${Number(debut.slice(8))} – ${libelleJourCourt(fin)}`;
  return `${libelleJourCourt(debut)} – ${libelleJourCourt(fin)}`;
}

/** « Semaine 40 · 28 sept. – 4 oct. » */
export const libelleSemaine = (lundi: Jour) => `Semaine ${semaineIso(lundi)} · ${intervalle(lundi, ajouterJours(lundi, 6))}`;

export function libellePeriode(p: Periode): string {
  if (p.vue === 'jour') return libelleJourLong(p.debut);
  if (p.vue === 'semaine') return libelleSemaine(p.debut);
  return libelleMois(moisDe(p.debut));
}

/** Jours de la période, du premier au dernier. */
export function joursDe(p: { debut: Jour; fin: Jour }): Jour[] {
  const res: Jour[] = [];
  for (let j = p.debut; j <= p.fin; j = ajouterJours(j, 1)) res.push(j);
  return res;
}

/** Paramètres d'URL d'une période : `?onglet=semaine&jour=2026-09-28`. */
export function lienPeriode(p: Periode, chemin = '/rapports'): string {
  return `${chemin}?onglet=${p.vue}&jour=${p.debut}`;
}
