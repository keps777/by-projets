// Indices NexG : prix équivalents par zone et par route au départ d'un aéroport, calculés depuis `Vol.courbe` (un point par jour, le dernier est aujourd'hui).
// Fonctions pures. Base 100 = premier point des courbes (il y a 89 jours) : on ne connaît pas les prix avant la fenêtre de 90 jours.
import { ecart } from './argent.ts';
import { departDe, peutEchanger } from './regles.ts';
import type { Monde, Vol, Zone } from '../domain/types.ts';

export type Periode = 7 | 30 | 90;
export const PERIODES: Periode[] = [7, 30, 90];
/** Variations par période : « 7 j », « 30 j », « 90 j » (en %). */
export type Variations = Record<Periode, number>;
/** Ordre d'affichage des zones, et sigle à trois lettres du tableau à palettes. */
export const ZONES: { zone: Zone; nom: string; sigle: string }[] = [
  { zone: 'Caraïbes', nom: 'NexG Caraïbes', sigle: 'CAR' }, { zone: 'Europe', nom: 'NexG Europe', sigle: 'EUR' }, { zone: 'Amériques', nom: 'NexG Amériques', sigle: 'AME' },
  { zone: 'Asie', nom: 'NexG Asie', sigle: 'ASI' }, { zone: 'Océanie', nom: 'NexG Océanie', sigle: 'OCE' }, { zone: 'Afrique', nom: 'NexG Afrique', sigle: 'AFR' }
];

/** Variation en % entre le point d'il y a `jours` jours (au plus le premier de la série) et le dernier. */
export function variation(serie: number[], jours: number): number {
  if (serie.length < 2) return 0;
  return ecart(serie[Math.max(0, serie.length - 1 - jours)], serie[serie.length - 1]).pct;
}
export const variations = (serie: number[]): Variations => ({ 7: variation(serie, 7), 30: variation(serie, 30), 90: variation(serie, 90) });

/** Indice d'un panier de courbes : moyenne des rapports prix / prix initial, base 100 au premier point, séries alignées sur leur fin (une décimale). */
export function serieIndice(courbes: number[][]): number[] {
  const utiles = courbes.filter((c) => c.length >= 2); if (!utiles.length) return [];
  const n = Math.min(...utiles.map((c) => c.length));
  return Array.from({ length: n }, (_, i) => { const r = utiles.map((c) => c[c.length - n + i] / c[c.length - n]); return Math.round((r.reduce((s, x) => s + x, 0) / r.length) * 1000) / 10; });
}

export interface RouteIndice { code: string; ville: string; zone: Zone; /** Vol de référence : le prochain départ encore ouvert (sinon le plus récent). */ volId: string; prix: number; variation: Variations; /** Variation sur 24 h (dernier point contre l'avant-dernier). */ variation24h: number; nbVols: number }
export interface IndiceZone { zone: Zone; nom: string; sigle: string; valeur: number; variation: Variations; /** Écart à la base 100 (« depuis l'origine de l'indice »). */ depuisBase: number; routes: RouteIndice[]; serie: number[] }
const departVol = (v: Vol): number => departDe(v.jour, v.heureDepart);

/** Une route par destination servie au départ de `depart`, avec son prix équivalent de référence et ses variations. Triée par code. */
export function routesDepuis(monde: Monde, now: number, depart = 'YUL'): RouteIndice[] {
  const res: RouteIndice[] = [];
  for (const a of monde.aeroports) {
    const vols = monde.vols.filter((v) => v.de === depart && v.vers === a.code && v.courbe.length >= 2); if (!vols.length) continue;
    const tries = [...vols].sort((p, q) => departVol(p) - departVol(q));
    const ref = tries.find((v) => peutEchanger(departVol(v), now)) ?? tries[tries.length - 1];
    const serie = serieIndice(vols.map((v) => v.courbe));
    res.push({ code: a.code, ville: a.ville, zone: a.zone, volId: ref.id, prix: ref.prixNeuf, variation: variations(serie), variation24h: variation(serie, 1), nbVols: vols.length });
  }
  return res.sort((a, b) => a.code.localeCompare(b.code));
}
/** Les indices par zone (zones sans route omises), dans l'ordre de `ZONES`. */
export function indicesParZone(monde: Monde, now: number, depart = 'YUL'): IndiceZone[] {
  const routes = routesDepuis(monde, now, depart);
  return ZONES.flatMap(({ zone, nom, sigle }) => {
    const rz = routes.filter((r) => r.zone === zone); if (!rz.length) return [];
    const codes = new Set(rz.map((r) => r.code));
    const serie = serieIndice(monde.vols.filter((v) => v.de === depart && codes.has(v.vers)).map((v) => v.courbe));
    const valeur = serie.at(-1) ?? 100;
    return [{ zone, nom, sigle, valeur, variation: variations(serie), depuisBase: Math.round((valeur - 100) * 10) / 10, routes: rz, serie }];
  });
}
/** Route en plus forte hausse et en plus forte baisse sur la période (absentes si aucune ne monte, ou ne baisse). */
export function extremes(routes: RouteIndice[], p: Periode): { hausse?: RouteIndice; baisse?: RouteIndice } {
  const tri = [...routes].sort((a, b) => b.variation[p] - a.variation[p] || a.code.localeCompare(b.code));
  const h = tri[0], b = tri[tri.length - 1];
  return { hausse: h && h.variation[p] > 0 ? h : undefined, baisse: b && b.variation[p] < 0 ? b : undefined };
}
/** Niveau de la carte de chaleur, de −3 (baisse ≥ 15 %) à +3 (hausse ≥ 15 %) ; 0 = quasi stable (< 3 %). */
export function niveauChaleur(pct: number): number {
  const a = Math.abs(pct), n = a < 3 ? 0 : a < 8 ? 1 : a < 15 ? 2 : 3;
  return pct < 0 ? -n : n;
}
/** Points d'une courbe dans un cadre `largeur × hauteur` (marge `m`), valeur haute en haut : « 5,40 … ». Une série plate est tracée à mi-hauteur. */
export function pointsSerie(serie: number[], largeur = 140, hauteur = 56, m = 5): { points: string; fin: { x: number; y: number }; debutY: number } | null {
  if (serie.length < 2) return null;
  const min = Math.min(...serie), max = Math.max(...serie), et = max - min, r = (x: number) => Math.round(x * 10) / 10;
  const xy = serie.map((v, i) => ({ x: r(m + ((largeur - 2 * m) * i) / (serie.length - 1)), y: r(et ? m + ((max - v) / et) * (hauteur - 2 * m) : hauteur / 2) }));
  return { points: xy.map((p) => `${p.x},${p.y}`).join(' '), fin: xy[xy.length - 1], debutY: xy[0].y };
}
