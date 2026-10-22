// Éducation : frais publiés par l'école, plan de paiement étalé sur salaire.
import { mensualite } from './credit.ts';
import { ajouterMois, type Jour } from './dates.ts';
export const NIVEAUX_SCOLAIRES = ['CP', 'CM2', '6e', '3e', '1re', 'Tle'] as const;
export const FRAIS_PAR_NIVEAU: Record<string, number> = { CP: 120_000, CM2: 150_000, '6e': 190_000, '3e': 250_000, '1re': 200_000, Tle: 260_000 };
export const totalRentree = (enfants: { montant: number; inclus: boolean }[]) => enfants.filter((e) => e.inclus).reduce((s, e) => s + e.montant, 0);
export const aFinancer = (total: number, coffre: number) => Math.max(0, total - Math.min(coffre, total));
export const mensualiteEcole = (aFin: number, mois: number, taux: number) => Math.round(mensualite(aFin, taux, mois));
/** Les 12 mois de septembre à août : état de chaque mois du plan (1er mois = paiement des écoles). */
export function calendrierPlan(rentree: Jour, duree: number): { jour: Jour; lettre: string; etat: 'ecoles' | 'mensualite' | 'libre' }[] {
  const L = ['S', 'O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A'];
  return L.map((lettre, i) => ({ jour: ajouterMois(rentree, i), lettre, etat: i === 0 ? 'ecoles' : i < duree ? 'mensualite' : 'libre' }));
}
export const finDuPlan = (rentree: Jour, duree: number): Jour => ajouterMois(rentree, duree - 1);
export const mentionNote = (n: number) => (n < 10 ? 'Soutien conseillé' : n < 12 ? 'Peut mieux faire' : n < 14 ? 'Assez bien' : n < 16 ? 'Bon travail' : 'Très bien');
export const moyenne = (notes: number[]) => (notes.length ? notes.reduce((s, n) => s + n, 0) / notes.length : 0);
