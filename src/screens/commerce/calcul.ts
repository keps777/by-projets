// Calculs purs du commerce (testés dans commerce.test.ts).
import { remboursementJournalier } from '../../core/commerce.ts';
import { avanceDisponible } from '../../core/commerce.ts';
import { lundiDe } from '../../core/services.ts';
import type { Avance, Semaine } from './etat.ts';

export const MAX_CHIFFRES = 8;
export const MONTANT_MIN = 100;
export const MIN_AVANCE = 100_000;
export const DUREE_QR_S = 300;

/** Touche du clavier de caisse : chiffre, « 000 » ou « ⌫ ». */
export function appuyer(saisie: string, touche: string): string {
  if (touche === '⌫') return saisie.slice(0, -1);
  if (!/^\d+$/.test(touche) || saisie.length + touche.length > MAX_CHIFFRES) return saisie;
  return (saisie + touche).replace(/^0+(?=\d)/, '');
}
export const montantDe = (saisie: string) => parseInt(saisie || '0', 10) || 0;
export const verifierMontant = (n: number): string | null => (n <= 0 ? 'Entrez un montant.' : n < MONTANT_MIN ? `Montant minimum : ${MONTANT_MIN} FCFA.` : null);

export const totalSemaine = (s: Semaine) => s.total.reduce((a, b) => a + b, 0);
export const totalAssureMe = (s: Semaine) => s.assureMe.reduce((a, b) => a + b, 0);
export const partAssureMe = (s: Semaine) => (totalSemaine(s) > 0 ? totalAssureMe(s) / totalSemaine(s) : 0);

/** Si on a changé de semaine, la précédente est mémorisée et les compteurs repartent de zéro. */
export function rouler(s: Semaine, now: number): Semaine {
  const lundi = lundiDe(now);
  if (lundi <= s.lundi) return s;
  return { lundi, total: Array(7).fill(0), assureMe: Array(7).fill(0), precedente: totalSemaine(s) };
}

export const aRembourser = (a: Pick<Avance, 'montant' | 'frais'>) => a.montant + a.frais;
export const restant = (a: Pick<Avance, 'montant' | 'frais' | 'rembourse'>) => Math.max(0, aRembourser(a) - a.rembourse);
export const encours = (avances: Avance[]) => avances.filter((a) => a.statut === 'en_cours').reduce((s, a) => s + restant(a), 0);

/** Avance encore accordable : formule du noyau, moins ce qui reste dû sur les avances en cours. */
export const disponible = (s: Semaine, plafondNiveau: number, avances: Avance[]) =>
  Math.max(0, avanceDisponible(totalSemaine(s), partAssureMe(s), plafondNiveau) - encours(avances));

/** Montants proposés : 300 k, 500 k et le maximum disponible (chacun ≤ disponible, ≥ minimum). */
export function montantsProposes(dispo: number): number[] {
  if (dispo < MIN_AVANCE) return [];
  return [...new Set([300_000, 500_000, dispo].filter((m) => m <= dispo && m >= MIN_AVANCE))].sort((a, b) => a - b);
}
export const journalierPour = (s: Semaine, taux: number) => remboursementJournalier(totalAssureMe(s) / 7, taux);

/** Retenue prélevée sur un encaissement, avance par avance (la plus ancienne d'abord). */
export function retenues(montant: number, avances: Avance[]): { id: string; montant: number }[] {
  return avances.filter((a) => a.statut === 'en_cours').sort((a, b) => a.ts - b.ts)
    .map((a) => ({ id: a.id, montant: Math.min(restant(a), Math.round((montant * a.taux) / 100)) })).filter((r) => r.montant > 0);
}

export interface SemaineSuivi { n: number; debut: number; rembourse: number; objectif: number }
/** Suivi hebdomadaire d'une avance : remboursé par semaine depuis la commande, face à l'objectif (journalier × 7). */
export function suiviHebdo(a: Avance, now: number): SemaineSuivi[] {
  const sem = 7 * 86_400_000;
  const nb = Math.max(1, Math.min(Math.floor((now - a.ts) / sem) + 1, 12));
  return Array.from({ length: nb }, (_, i) => ({
    n: i + 1, debut: a.ts + i * sem, objectif: a.journalier * 7,
    rembourse: a.remboursements.filter((r) => r.ts >= a.ts + i * sem && r.ts < a.ts + (i + 1) * sem).reduce((s, r) => s + r.montant, 0)
  }));
}
