// Préparer le voyage : cases à cocher (passeport, enregistrement, bagages), ajout simulé au portefeuille du téléphone, bagages du droit. L'état vit dans la tranche « achat ».
import { app, tranche } from '../../data/store.svelte.ts';
import type { BagageDroit, Droit } from '../../domain/types.ts';

export type CleCoche = 'passeport' | 'checkin' | 'bagages';
export interface TrancheAchat { coches: Record<string, Partial<Record<CleCoche, boolean>>>; wallet: Record<string, boolean> }
const defaut = (): TrancheAchat => ({ coches: {}, wallet: {} });
/** Lecture sans création de tranche (sûre dans un `$derived`). */
const lire = (): TrancheAchat => (app.tranches.achat as TrancheAchat | undefined) ?? defaut();
export const cochesDe = (droitId: string): Partial<Record<CleCoche, boolean>> => lire().coches[droitId] ?? {};
export const dansLeWallet = (droitId: string): boolean => !!lire().wallet[droitId];
/** Action : coche ou décoche une case de préparation. */
export function basculerCoche(droitId: string, cle: CleCoche): void {
  const t = tranche<TrancheAchat>('achat', defaut);
  if (!t.coches[droitId]) t.coches[droitId] = {}; // relire l'objet après l'affectation : c'est lui, rendu réactif, qu'il faut modifier
  const c = t.coches[droitId]; c[cle] = !c[cle];
}
/** Action : ajoute ou retire la carte d'embarquement du « portefeuille du téléphone » (simulation). */
export function basculerWallet(droitId: string): void { const t = tranche<TrancheAchat>('achat', defaut); t.wallet[droitId] = !t.wallet[droitId]; }

export const TOTAL_PREPARATION = 4;
/** Étapes faites sur 4 : voyageur nommé (automatique) + les trois cases. */
export const progression = (nomme: boolean, c: Partial<Record<CleCoche, boolean>>): number => [nomme, c.passeport, c.checkin, c.bagages].filter(Boolean).length;

export const KG_BAGAGE = 23;
export interface ResumeBagages { inclus: number; engages: number; libres: number; enVente: number; revendus: number }
/** Bagages en soute inclus avec le droit, et ce que le détenteur en a déjà mis en vente ou cédé sur ce vol. */
export function bagagesDuDroit(bagages: BagageDroit[], d: Pick<Droit, 'volId' | 'detenteurId' | 'bagagesInclus'>): ResumeBagages {
  const siens = bagages.filter((b) => b.volId === d.volId && b.detenteurId === d.detenteurId && b.statut !== 'inclus' && b.statut !== 'achete');
  const enVente = siens.filter((b) => b.statut === 'en_vente').length, revendus = siens.filter((b) => b.statut === 'vendu' || b.statut === 'transfere').length;
  const engages = Math.min(d.bagagesInclus, enVente + revendus);
  return { inclus: d.bagagesInclus, engages, libres: d.bagagesInclus - engages, enVente, revendus };
}
/** « Bagages : 2 inclus, 1 utilisé ». */
export const titreBagages = (r: ResumeBagages): string => `Bagages : ${r.inclus} inclus, ${r.engages} utilisé${r.engages > 1 ? 's' : ''}`;
/** « 2 × 23 kg en soute avec votre tarif (hypothèse démo). Le 2e reste libre. » */
export function detailBagages(r: ResumeBagages): string {
  const base = `${r.inclus} × ${KG_BAGAGE} kg en soute avec votre tarif (hypothèse démo).`;
  if (r.engages === 0) return `${base} Aucun n’est encore utilisé.`;
  if (r.libres === 0) return `${base} Aucun ne reste libre.`;
  return `${base} ${r.libres === 1 ? (r.inclus === 2 ? 'Le 2e reste libre.' : 'Un reste libre.') : `${r.libres} restent libres.`}`;
}
/** « (1 bagage revendu sur ce vol) » ; vide si rien n'a été mis en vente ni cédé. */
export function noteBagages(r: ResumeBagages): string {
  const p: string[] = []; if (r.revendus) p.push(`${r.revendus} bagage${r.revendus > 1 ? 's' : ''} revendu${r.revendus > 1 ? 's' : ''}`); if (r.enVente) p.push(`${r.enVente} bagage${r.enVente > 1 ? 's' : ''} en vente`);
  return p.length ? `(${p.join(', ')} sur ce vol)` : '';
}
