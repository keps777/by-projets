// Lectures du monde pour les écrans du patron : contexte de calcul (jour, heure, compagnie) et petits libellés.
import { jourDe } from '../../core/dates.ts';
import { nomGare } from '../../core/indicateurs.ts';
import { fcfa } from '../../core/money.ts';
import { app, maintenant } from '../../data/store.svelte.ts';
import { personneCourante } from '../../domain/actions.ts';
import type { Contexte } from '../../core/assistant.ts';

export const compagnieId = () => personneCourante()?.compagnieId ?? 'BX';
/** Contexte de calcul : le monde réactif, le jour et l'heure de l'horloge de l'application. */
export function contexte(now = maintenant()): Contexte {
  const ia = app.tranches.interAgences as { conventions: Contexte['conventions']; liens: Contexte['liens'] } | undefined;
  return { d: app.monde, jour: jourDe(new Date(now)), now, compagnieId: compagnieId(), conventions: ia?.conventions, liens: ia?.liens };
}
export const gareNom = (id: string) => { const g = app.monde.gares.find((x) => x.id === id); return g ? nomGare(g) : id; };
export const gareCourt = (id: string) => app.monde.gares.find((x) => x.id === id)?.nom ?? id;
export const compagnieNom = (id: string) => app.monde.compagnies.find((c) => c.id === id)?.nom ?? id;
/** « 1 284 500 F » */
export const francs = (n: number) => `${fcfa(n).replace(/ /g, '\u00a0')}\u00a0F`;
export const millions = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M F` : francs(n));
export const signe = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${francs(Math.abs(n))}`;
export const pourcent = (x: number) => `${Math.round(x * 100)}\u00a0%`;
export const tonVariation = (v: number | null): 'okc' | 'erc' | 'mut' => (v === null ? 'mut' : v < 0 ? 'erc' : 'okc');
