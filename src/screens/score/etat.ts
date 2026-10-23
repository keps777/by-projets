// Tranche 'score' : journal des événements qui ont fait bouger le score. La valeur, l'historique et les conseils faits vivent dans app.score.
import { tranche } from '../../data/store.svelte.ts';

export interface EvenementScore { id: string; ts: number; motif: string; delta: number }
export interface EtatScore { evenements: EvenementScore[] }
export const MAX_EVENEMENTS = 30;
export const etatScore = () => tranche<EtatScore>('score', () => ({ evenements: [] }));
