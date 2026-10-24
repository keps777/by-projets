// Accueil voyageur : les départs d'un jour sont rangés en 8 tranches de 3 h (panorama 3D), triés et filtrés.
import type { Depart } from '../domain/types.ts';
export interface Tranche<T> { h1: string; h2: string; index: number; items: T[] }
export const TRANCHES = Array.from({ length: 8 }, (_, i) => ({ h1: String(i * 3).padStart(2, '0'), h2: String(i * 3 + 3).padStart(2, '0') }));
export const indexTranche = (heure: string) => Math.min(7, Math.floor(Number(heure.slice(0, 2)) / 3));
export function parTranche<T extends { heure: string }>(items: T[]): Tranche<T>[] {
  const t: Tranche<T>[] = TRANCHES.map((x, index) => ({ ...x, index, items: [] }));
  for (const it of items) t[indexTranche(it.heure)].items.push(it);
  return t;
}
export type Tri = 'heure' | 'prix' | 'places' | 'confort';
export interface Tri_<T> { prix: number; heure: string; places: number; vip: boolean; dureeMin: number }
export function trier<T extends Tri_<T>>(items: T[], tri: Tri): T[] {
  const f: Record<Tri, (a: T, b: T) => number> = {
    heure: (a, b) => a.heure.localeCompare(b.heure), prix: (a, b) => a.prix - b.prix, places: (a, b) => b.places - a.places,
    confort: (a, b) => Number(b.vip) - Number(a.vip) || a.dureeMin - b.dureeMin
  };
  return [...items].sort(f[tri]);
}
/** Badge d'un départ dans sa tranche : dernières places, moins cher, plus rapide. */
export function badge(it: Tri_<unknown> & { covoit?: boolean }, groupe: Tri_<unknown>[]): { texte: string; ton: '' | 'ok' | 'wa' | 'inf' | 'cv' } {
  if (!it.covoit && it.places <= 4) return { texte: `+ que ${it.places} pl.`, ton: 'wa' };
  if (it.covoit && it.places <= 1) return { texte: 'dernière pl.', ton: 'wa' };
  const min = Math.min(...groupe.map((x) => x.prix)), vite = Math.min(...groupe.map((x) => x.dureeMin));
  if (groupe.length > 1 && it.prix === min) return { texte: 'moins cher', ton: 'ok' };
  if (groupe.length > 1 && it.dureeMin === vite) return { texte: 'plus rapide', ton: 'inf' };
  return it.covoit ? { texte: `covoit · ${it.places} pl.`, ton: 'cv' } : { texte: `${it.places} places`, ton: '' };
}
export const duree = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
export const heureApres = (heure: string, minutes: number) => { const t = Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5)) + minutes; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export type { Depart };
