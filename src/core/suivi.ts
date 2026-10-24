// Suivi d'un bus : phase du trajet, textes de délai, vitesse simulée. Pur, sans monde.
import { estimer, type Estimation } from './retard.ts';

export type Phase = 'avant' | 'embarquement' | 'route' | 'arrive';
export const EMBARQUEMENT_MIN = 30;
/** L'embarquement s'ouvre 20 min avant le départ. */
export const OUVERTURE_MIN = 20;
/** `minAvant` : minutes avant le départ réel (négatif une fois parti). */
export function phaseTrajet(minAvant: number, e: Pick<Estimation, 'enRoute' | 'termine'>): Phase {
  if (e.termine) return 'arrive';
  if (e.enRoute || minAvant <= 0) return 'route';
  return minAvant <= EMBARQUEMENT_MIN ? 'embarquement' : 'avant';
}
/** « 12 min », « 2 h 05 », « 1 j 3 h ». */
export function delai(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 1440)} j ${Math.floor((m % 1440) / 60)} h`;
}
/** Vitesse simulée en km/h : moyenne de la ligne, avec de petites variations ; 0 si le bus n'est pas en route. */
export function vitesseKmh(phase: Phase, avancement: number, km: number, dureeMin: number): number {
  if (phase !== 'route' || dureeMin <= 0) return 0;
  return Math.round((km / (dureeMin / 60)) * (1 + 0.18 * Math.sin(avancement * 17)));
}
/** Minutes depuis minuit du jour du départ, pour `estimer`. */
export const minutesDepuisMinuit = (nowMs: number, jour: string) => Math.floor((nowMs - new Date(`${jour}T00:00:00`).getTime()) / 60_000);
/** Texte d'état du bus pour l'îlot dynamique. */
export function texteIlot(phase: Phase, minAvant: number, resteMin: number, prochain?: { nom: string; dansMin: number } | null): string {
  if (phase === 'avant' || phase === 'embarquement') return minAvant > 180 ? `départ dans ${delai(minAvant)}` : minAvant > OUVERTURE_MIN ? `embarquement dans ${delai(minAvant - OUVERTURE_MIN)}` : 'embarquement en cours';
  if (phase === 'arrive') return 'arrivé · bon séjour !';
  if (resteMin <= 10) return `arrivée dans ${delai(resteMin)}`;
  return prochain ? `en route · ${prochain.nom} dans ${delai(prochain.dansMin)}` : `en route · arrivée dans ${delai(resteMin)}`;
}
export { estimer };
export type { Estimation };
