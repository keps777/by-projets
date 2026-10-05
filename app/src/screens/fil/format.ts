// Formats d'affichage propres aux écrans du Fil (dates en français, durées, valeurs de métriques).
// Les dates « AAAA-MM-JJ » sont lues en UTC pour ne jamais dépendre du fuseau de l'appareil.
import { ajouterJours, versUtc } from '@core/dates.ts';
import { libelleChoix } from '@core/metriques.ts';
import { dureeLisible, formatDistance, formatHeure, formatMontantCourt, formatPoids, nombre } from '@core/units.ts';
import type { Jour, OptionChoix, TypeMetrique } from '@core/types.ts';

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fmt = (j: Jour, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', ...o }).format(new Date(versUtc(j)));

/** « lundi 5 octobre » */
export const dateLongue = (j: Jour) => fmt(j, { weekday: 'long', day: 'numeric', month: 'long' });
/** « 5 oct. » */
export const dateCourte = (j: Jour) => fmt(j, { day: 'numeric', month: 'short' });
/** « 4 octobre » */
export const dateJourMois = (j: Jour) => fmt(j, { day: 'numeric', month: 'long' });
/** « lundi » */
export const nomDuJour = (j: Jour) => fmt(j, { weekday: 'long' });
/** « octobre » */
export const nomDuMois = (j: Jour) => fmt(j, { month: 'long' });

/** Puce d'un jour proche : « Aujourd’hui », « Demain », « Mer. 7 ». */
export function puceJour(j: Jour, aujourdhui: Jour): string {
  if (j === aujourdhui) return 'Aujourd’hui';
  if (j === ajouterJours(aujourdhui, 1)) return 'Demain';
  return cap(fmt(j, { weekday: 'short', day: 'numeric' }));
}

/** Minutes → « 45 min », « 1 h 30 ». */
export const dureeMin = (min: number) => dureeLisible(min * 60);

/** Minutes depuis minuit → « 05:30 ». */
export const hm = formatHeure;

/** Chronomètre : « 04:12 », ou « 1:04:12 » au-delà d'une heure. */
export function chrono(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/** Nom court d'une rubrique : « Ma relation avec Dieu » → « Relation avec Dieu », « Mon travail et mes études » → « Travail et études ». */
export function nomCourtRubrique(nom: string): string {
  const sans = nom.replace(/^(ma|mon|mes)\s+/i, '').replace(/\s+(mes|mon|ma)\s+/gi, ' ');
  return cap(sans);
}

/** Valeur d'une métrique (unité de base) → texte lisible. */
export function formatValeur(type: TypeMetrique, v: number, unite = '', options?: OptionChoix[] | null): string {
  const u = unite ? ` ${unite}` : '';
  switch (type) {
    case 'temps': return dureeLisible(v);
    case 'fois': case 'nombre': return nombre(v) + u;
    case 'montant': return formatMontantCourt(v);
    case 'oui_non': return v >= 1 ? 'oui' : 'non';
    case 'choix': return libelleChoix(options ?? undefined, v);
    case 'distance': return formatDistance(v);
    case 'poids': return formatPoids(v);
    case 'note': return `${nombre(v)}/10`;
    case 'pourcentage': return `${nombre(v)} %`;
    case 'heure': return formatHeure(v);
    case 'reference': return '';
  }
}

/** Libellé par défaut d'une clé de métrique quand aucun sous-projet ne la nomme : « nombre:pages » → « Pages ». */
export function libelleCle(cle: string): string {
  if (cle === 'temps') return 'Temps passé';
  const [type, suite] = cle.split(':');
  if (suite) return cap(suite);
  return cap(type.replace('_', ' / '));
}
