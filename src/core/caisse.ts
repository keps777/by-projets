// Caisse du guichet : comptage par coupure, écart avec l'attendu, niveau de tolérance.
export const COUPURES = [10000, 5000, 2000, 1000, 500] as const;
export const totalCompte = (q: Record<string, number>) => Object.entries(q).reduce((s, [v, n]) => s + Number(v) * n, 0);
export const ecart = (compte: number, attendu: number) => compte - attendu;
export type Ecart = { montant: number; niveau: 'juste' | 'tolere' | 'a_valider'; texte: string };
export const TOLERANCE = 1000;
export function evaluerEcart(compte: number, attendu: number): Ecart {
  const montant = ecart(compte, attendu);
  if (montant === 0) return { montant, niveau: 'juste', texte: 'caisse juste' };
  if (Math.abs(montant) <= TOLERANCE) return { montant, niveau: 'tolere', texte: 'toléré · à justifier' };
  return { montant, niveau: 'a_valider', texte: 'le superviseur devra valider' };
}
/** Attendu en caisse : fond de caisse + espèces encaissées − remboursements en espèces. */
export const attendu = (fond: number, especes: number, rembourses = 0) => fond + especes - rembourses;
/** Commission d'un convoyeur ou d'un vendeur ambulant : pourcentage du prix de vente. */
export const commission = (ventes: number, tauxPct: number) => Math.round((ventes * tauxPct) / 100);
