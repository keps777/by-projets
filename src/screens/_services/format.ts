import { app } from '../../data/store.svelte.ts';
import { niveauDuScore, type Niveau } from '../../core/credit.ts';
/** Niveau courant du membre (déduit de l'AssureScore). */
export const niveauCourant = (): Niveau => niveauDuScore(app.score.valeur);
export const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Garde uniquement les chiffres, avec une longueur maximale. */
export const chiffres = (s: string, max = 9) => s.replace(/\D/g, '').slice(0, max);
export const ini2 = (nom: string) => { const m = nom.trim().split(/\s+/).pop() ?? ''; return m.slice(0, 2).toUpperCase() || '??'; };
export const pct1 = (x: number) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
