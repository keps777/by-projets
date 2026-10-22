// Protection famille : capital versé en 48 h, sans questionnaire médical.
export interface Assure { id: string; nom: string; sous: string; age: number; prime: number }
export const AGE_MAX_ENTREE = 75;
export const CAPITAUX = [1_000_000, 2_000_000, 5_000_000] as const;
export const PRIME_BASE = 1500;
export const prime = (assures: { prime: number }[], capital: number) => Math.round(((PRIME_BASE + assures.reduce((s, a) => s + a.prime, 0)) * capital) / 2_000_000 / 50) * 50;
export const entreeAutorisee = (age: number) => age <= AGE_MAX_ENTREE;
export const numeroDossier = (seed: number) => `D-${String(48210 + (seed % 1000)).padStart(5, '0')}`;
