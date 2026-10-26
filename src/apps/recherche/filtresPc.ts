// Filtres et tris de la variante PC des résultats (colonne « Filtres », tableau des départs) : fonctions pures sur les lignes d'offres.
// Les drops masqués (réservés aux membres) restent toujours affichés : seuls la source, les escales et la revendabilité les écartent, jamais le prix.
import type { TypeOffre } from '../../domain/marche.ts';
import { estDirect, revendable, trier, type LigneOffre } from './offres.ts';

export interface FiltresPc { sources: Record<TypeOffre, boolean>; /** Vols directs seulement. */ direct: boolean; /** Billets revendables seulement. */ revendable: boolean; /** Prix maximum ; `null` = pas de limite. */ prixMax: number | null }
export const filtresDefaut = (): FiltresPc => ({ sources: { neuf: true, revente: true, agence: true, drop: true }, direct: false, revendable: false, prixMax: null });
/** Une offre est « revendable » si elle n'est pas d'une agence (non revendable) et si l'échéance J-1 n'est pas passée. */
export const revendablePc = (l: LigneOffre, maintenant: number): boolean => l.offre.type !== 'agence' && revendable(l.vol, maintenant);
export function appliquerFiltresPc(lignes: LigneOffre[], f: FiltresPc, maintenant: number): LigneOffre[] {
  return lignes.filter((l) => f.sources[l.offre.type] && (!f.direct || estDirect(l.vol)) && (!f.revendable || revendablePc(l, maintenant)) && (f.prixMax === null || l.offre.masquee || l.offre.prix <= f.prixMax));
}
/** Bornes du curseur de prix : centaines entières autour des prix visibles. */
export function bornesPrix(lignes: LigneOffre[]): { min: number; max: number } {
  const p = lignes.filter((l) => !l.offre.masquee).map((l) => l.offre.prix); if (!p.length) return { min: 0, max: 100 };
  return { min: Math.floor(Math.min(...p) / 100) * 100, max: Math.ceil(Math.max(...p) / 100) * 100 };
}
export type CleTriPc = 'prix' | 'depart';
export interface TriPc { cle: CleTriPc; sens: 'asc' | 'desc' }
/** Clic sur « Prix » ou « Heure de départ » : la même clé inverse le sens, une autre clé repart du croissant. */
export const basculerTriPc = (t: TriPc, cle: CleTriPc): TriPc => (t.cle === cle ? { cle, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { cle, sens: 'asc' });
/** Tri du tableau : prix (drops masqués toujours en dernier) ou heure de départ, dans le sens demandé. */
export function trierPc(lignes: LigneOffre[], t: TriPc): LigneOffre[] {
  const base = trier(lignes, t.cle === 'prix' ? 'prix' : 'depart');
  if (t.sens === 'asc') return base;
  if (t.cle === 'depart') return base.reverse();
  return [...base.filter((l) => !l.offre.masquee).reverse(), ...base.filter((l) => l.offre.masquee)];
}
