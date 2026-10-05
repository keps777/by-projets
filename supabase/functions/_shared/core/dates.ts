// Calculs de dates sans dépendre du fuseau de la machine : tout passe par des dates « AAAA-MM-JJ » et l'UTC.
import type { Jour, Mois } from './types.ts';

const MS_JOUR = 86_400_000;

export function versUtc(j: Jour): number {
  const [a, m, d] = j.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

export function depuisUtc(ms: number): Jour {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function ajouterJours(j: Jour, n: number): Jour { return depuisUtc(versUtc(j) + n * MS_JOUR); }

/** Nombre de jours entre a et b (b − a). */
export function ecartJours(a: Jour, b: Jour): number { return Math.round((versUtc(b) - versUtc(a)) / MS_JOUR); }

/** 0 = lundi … 6 = dimanche. */
export function jourSemaine(j: Jour): number { return (new Date(versUtc(j)).getUTCDay() + 6) % 7; }

export function moisDe(j: Jour): Mois { return j.slice(0, 7); }

export function joursDuMois(m: Mois): number {
  const [a, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(a, mm, 0)).getUTCDate();
}

export function premierDuMois(m: Mois): Jour { return `${m}-01`; }
export function dernierDuMois(m: Mois): Jour { return `${m}-${String(joursDuMois(m)).padStart(2, '0')}`; }

export function maxJour(a: Jour, b: Jour): Jour { return a >= b ? a : b; }
export function minJour(a: Jour, b: Jour): Jour { return a <= b ? a : b; }

export function moisSuivant(m: Mois): Mois { return moisDe(ajouterJours(dernierDuMois(m), 1)); }

/** Début de la semaine (lundi) contenant le jour. */
export function lundiDe(j: Jour): Jour { return ajouterJours(j, -jourSemaine(j)); }

function decalageMinutes(utcMs: number, fuseau: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const commeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((commeUtc - utcMs) / 60000);
}

/**
 * Heure locale (minutes depuis minuit) d'un jour dans un fuseau → instant UTC en ms. L'heure d'été est respectée.
 * Heure qui n'existe pas (passage à l'heure d'été, ex. 02:30 le 14 mars 2027 à Toronto) : on avance (03:30).
 * Heure qui existe deux fois (retour à l'heure normale, ex. 01:30 le 1er novembre 2026) : la première.
 */
export function localVersUtc(j: Jour, minutes: number, fuseau: string): number {
  const naif = versUtc(j) + minutes * 60000;
  const a = naif - decalageMinutes(naif, fuseau) * 60000;
  const b = naif - decalageMinutes(a, fuseau) * 60000;
  const exact = (t: number) => t + decalageMinutes(t, fuseau) * 60000 === naif;
  if (exact(b)) return Math.min(b, exact(a) ? a : b);
  if (exact(a)) return a;
  return Math.max(a, b);
}

/** Instant UTC → jour et minutes locales dans un fuseau. */
export function utcVersLocal(ms: number, fuseau: string): { jour: Jour; minutes: number } {
  const loc = ms + decalageMinutes(ms, fuseau) * 60000;
  const d = new Date(loc);
  return { jour: depuisUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as const;
export const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
