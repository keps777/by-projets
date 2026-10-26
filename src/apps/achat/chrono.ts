// Chronologie d'un droit de voyage : départ, échéance J-1, jours restants, volets J/H, compte à rebours. Fonctions pures (le temps est un paramètre).
import { delaiCourt, departDe, echeanceDe, joursAvant, peutEchanger, phase, type Phase } from '../../core/regles.ts';
import type { Droit } from '../../domain/types.ts';

const H = 3_600_000, J = 24 * H;
export interface Chrono { depart: number; echeance: number; /** Jours calendaires avant le départ (« J-63 »). */ joursDepart: number; /** Jours calendaires avant l'échéance (« pendant 62 jours »). */ joursEcheance: number; resteMs: number; phase: Phase; ouvert: boolean }
export function chronologie(vol: { jour: string; heureDepart: string }, maintenant: number): Chrono {
  const depart = departDe(vol.jour, vol.heureDepart), echeance = echeanceDe(depart);
  return { depart, echeance, joursDepart: joursAvant(depart, maintenant), joursEcheance: joursAvant(echeance, maintenant), resteMs: Math.max(0, echeance - maintenant), phase: phase(depart, maintenant), ouvert: peutEchanger(depart, maintenant) };
}
/** « J-63 » ; « Jour J » le jour du départ. */
export const libelleJ = (joursDepart: number): string => (joursDepart <= 0 ? 'Jour J' : `J-${joursDepart}`);
const deux = (n: number) => String(n).padStart(2, '0');
/** Volets du tableau des départs : jours (2 chiffres au moins) et heures (0 à 23) restants avant l'échéance. */
export function voletsEcheance(resteMs: number): { jours: string; heures: string } {
  const ms = Math.max(0, resteMs); return { jours: deux(Math.floor(ms / J)), heures: deux(Math.floor((ms % J) / H)) };
}
/** « Il reste 62 j 0 h » ; « L'échéance est passée » à zéro. */
export const phraseReste = (resteMs: number): string => (resteMs <= 0 ? 'L’échéance est passée' : `Il reste ${delaiCourt(resteMs)}`);
/** « 63 j 00:34:59 » : compte à rebours en direct jusqu'au décollage. */
export function compteARebours(departMs: number, maintenant: number): string {
  const s = Math.max(0, Math.floor((departMs - maintenant) / 1000)); return `${Math.floor(s / 86400)} j ${deux(Math.floor((s % 86400) / 3600))}:${deux(Math.floor((s % 3600) / 60))}:${deux(s % 60)}`;
}
export type StatutVoyage = 'a_nommer' | 'nomme' | 'parti' | 'autre';
/** Où en est le droit pour le voyageur : à nommer, nommé (prêt), parti, ou ni l'un ni l'autre (vendu, transféré, gelé, racheté). */
export function statutVoyage(d: Pick<Droit, 'statut'>): StatutVoyage {
  if (d.statut === 'detenu' || d.statut === 'en_vente') return 'a_nommer'; if (d.statut === 'nomme') return 'nomme'; if (d.statut === 'voyage') return 'parti'; return 'autre';
}
/** Le droit peut-il encore être nommé maintenant ? (détenu ou en vente, échéance non passée) */
export const peutNommer = (d: Pick<Droit, 'statut'>, c: Chrono): boolean => statutVoyage(d) === 'a_nommer' && c.ouvert;
