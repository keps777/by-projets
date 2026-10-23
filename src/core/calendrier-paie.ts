// Calendrier et répartition du salaire pour l'écran « Prélèvement sur salaire » (s'appuie sur core/prelevement.ts).
import { ajouterMois, enDate, type Jour } from './dates.ts';
import { totalPrelevement, soldeVerse, type LignePrelevement, type TypePrelevement } from './prelevement.ts';
import { PLAFOND_ENDETTEMENT } from './credit.ts';

/** Les `n` prochaines paies, la première étant `premiere` (garde le quantième de `jourPaie`). */
export const calendrierPaies = (premiere: Jour, jourPaie: number, n = 12): Jour[] => Array.from({ length: n }, (_, i) => ajouterMois(premiere, i, jourPaie));
const MOIS = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
/** « NOV » dans l'année en cours, « JUIN 27 » ensuite. */
export function etiquetteMois(j: Jour, anneeCourante: number): string {
  const d = enDate(j);
  return d.getFullYear() === anneeCourante ? MOIS[d.getMonth()] : `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
export const NOM_TYPE: Record<TypePrelevement, string> = { pass: 'Pass', credit: 'Crédit', coffre: 'Coffre' };
export interface Segment { type: TypePrelevement | 'verse'; libelle: string; montant: number; pct: number }
export interface Repartition { salaire: number; preleve: number; verse: number; part: number; depassePlafond: boolean; segments: Segment[] }
/** Salaire net → prélèvements (par type) → solde versé. `part` : prélevé / salaire. */
export function repartition(salaire: number, lignes: LignePrelevement[]): Repartition {
  const actives = lignes.filter((l) => !l.reporte);
  const preleve = totalPrelevement(lignes);
  const verse = soldeVerse(salaire, lignes);
  const pct = (m: number) => (salaire > 0 ? (m / salaire) * 100 : 0);
  const segments: Segment[] = (['pass', 'credit', 'coffre'] as const)
    .map((t) => { const m = actives.filter((l) => l.type === t).reduce((s, l) => s + l.montant, 0); return { type: t, libelle: NOM_TYPE[t], montant: m, pct: pct(m) } as Segment; })
    .filter((s) => s.montant > 0);
  segments.push({ type: 'verse', libelle: 'Versé sur votre solde', montant: verse, pct: pct(verse) });
  const part = salaire > 0 ? preleve / salaire : 0;
  // Le plafond de 33 % est celui des crédits (règle commune de decider() : mensualités de crédit et loyer), pas celui du Pass ni des coffres.
  const credits = actives.filter((l) => l.type === 'credit').reduce((s, l) => s + l.montant, 0);
  const depassePlafond = salaire > 0 && credits / salaire > PLAFOND_ENDETTEMENT + 1e-9;
  return { salaire, preleve, verse, part, depassePlafond, segments };
}
/** Part du salaire en pourcentage lisible : « 13 », « 0,5 » (une décimale sous 10 %). */
export const pourcent = (part: number): string => { const p = part * 100; return p.toLocaleString('fr-FR', { maximumFractionDigits: p < 10 ? 1 : 0 }); };
