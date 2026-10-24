// Formats d'affichage du siège.
import { fcfa } from '../../core/money.ts';
import type { Gare } from '../../domain/types.ts';
import { app } from '../../data/store.svelte.ts';

/** « 3,41 M F », « 812 000 F ». */
export function mf(n: number): string {
  return Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M F` : `${fcfa(n)} F`;
}
/** « 9,6 M » sans l'unité, pour les tableaux. */
export const mCourt = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : fcfa(n));
export const pct = (x: number) => `${Math.round(x * 100)} %`;
export const nomGare = (g: Gare | undefined) => (g ? (g.nom.startsWith(g.ville) ? g.nom : `${g.ville} ${g.nom}`) : '—');
export const gareParId = (id: string | undefined) => app.monde.gares.find((g) => g.id === id);
export const nomLigne = (l: { de: string; vers: string }) => `${l.de} → ${l.vers}`;
export const classeSens = (x: number, bon = 0.85, moyen = 0.7) => (x >= bon ? 'okc' : x >= moyen ? 'wac' : 'erc');
export const heureCourte = (ts: number) => new Date(ts).toTimeString().slice(0, 5);
export const initiales = (p: { prenom: string; nom: string }) => `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase();
import { nomJour } from '../../core/analyses.ts';
/** « mar. 3 » */
export const libJour = (j: string) => `${nomJour(j)} ${Number(j.slice(8))}`;
/** « +11 % », « −6 % ». */
export const libPct = (pct: number | null) => (pct === null ? '—' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`);
export const classeSensComp = (sens: string) => (sens === 'hausse' ? 'okc' : sens === 'baisse' ? 'erc' : 'mut');
