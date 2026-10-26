// Cours d'un vol : séries du graphique par période, variation, écart avec le neuf, seuil d'un ordre à cours limité. Fonctions pures.
import { ecart, fmt, fmtPct } from '../../core/argent.ts';
import { jourCourt } from './format.ts';

const J = 86_400_000;
export type Periode = '1S' | '1M' | '3M' | 'Tout';
export const PERIODES: Periode[] = ['1S', '1M', '3M', 'Tout'];
/** Nombre de points quotidiens gardés (le dernier est aujourd'hui) ; `Tout` garde toute la courbe disponible. */
export const POINTS: Record<Periode, number> = { '1S': 8, '1M': 31, '3M': 90, Tout: Infinity };
export const fenetre = <T,>(serie: T[], p: Periode): T[] => serie.slice(-Math.min(serie.length, POINTS[p]));

/** Meilleure offre de revente au fil des jours : le prix équivalent neuf de chaque jour, avec la décote d'aujourd'hui (meilleure offre ÷ neuf) et une légère oscillation qui s'éteint sur le dernier point. Reconstitution déterministe : le monde simulé ne garde que la courbe du neuf. */
export function serieOffre(courbe: number[], meilleure: number | undefined): number[] | undefined {
  if (meilleure === undefined || !courbe.length) return undefined;
  const n = courbe.length, fin = courbe[n - 1]!, rapport = fin ? meilleure / fin : 1;
  return courbe.map((c, i) => (i === n - 1 ? meilleure : Math.round(c * rapport * (1 + 0.025 * Math.sin(i * 1.7 + n) * (1 - i / (n - 1))))));
}
export interface Variation { pct: number; sens: 'hausse' | 'baisse' | 'stable'; texte: string }
/** Variation entre le premier et le dernier point (pourcentage signé, « −4,2 % »). */
export function variation(serie: number[]): Variation {
  if (serie.length < 2) return { pct: 0, sens: 'stable', texte: fmtPct(0) };
  const e = ecart(serie[0]!, serie.at(-1)!); return { pct: e.pct, sens: e.sens, texte: fmtPct(e.pct) };
}
/** « sur 7 jours », « sur 1 mois », « sur 3 mois », « depuis le 14 juil. ». */
export function libellePeriode(p: Periode, n: number, maintenant: number): string {
  if (p === '1S') return `sur ${Math.max(1, n - 1)} jours`; if (p === '1M') return 'sur 1 mois'; if (p === '3M') return 'sur 3 mois';
  return `depuis le ${jourCourt(maintenant - (n - 1) * J)}`;
}
/** Trois repères de dates pour l'axe horizontal : premier jour, milieu, aujourd'hui. */
export const reperesDates = (n: number, maintenant: number): [string, string, string] => [jourCourt(maintenant - (n - 1) * J), jourCourt(maintenant - Math.floor((n - 1) / 2) * J), jourCourt(maintenant)];
/** Transactions par point de la série (les plus anciennes que la fenêtre sont ignorées). */
export function volumes(quands: number[], n: number, maintenant: number): number[] {
  const v = new Array<number>(n).fill(0), jourAujourdhui = Math.floor(maintenant / J);
  for (const q of quands) { const i = n - 1 - (jourAujourdhui - Math.floor(q / J)); if (i >= 0 && i < n) v[i]!++; }
  return v;
}

export interface Trace { ligne: string; neuf: string; aire: string; grille: string; barres: string; derniere: string; dernierX: number; dernierY: number; graduations: { texte: string; y: number }[]; yNeuf: number }
export const GEO = { X0: 8, X1: 286, TOP: 14, BOT: 136, VBASE: 196, VH: 40 };
const f = (v: number): string => v.toFixed(1);
/** Pas de graduation (200, 100, 50…) donnant au plus 5 repères. */
export function pasGraduation(lo: number, hi: number): number { for (const p of [10, 20, 50, 100, 200, 500, 1000]) if ((hi - lo) / p <= 5) return p; return 1000; }
/** Géométrie SVG du graphique (viewBox 348 × 200) : meilleure offre (optionnelle), prix neuf = plafond en pointillés, transactions en barres. */
export function tracer(offre: number[] | undefined, neuf: number[], vols: number[]): Trace {
  const { X0, X1, TOP, BOT, VBASE, VH } = GEO, n = neuf.length, tous = [...neuf, ...(offre ?? [])];
  const pas0 = pasGraduation(Math.min(...tous), Math.max(...tous)), lo = Math.floor((Math.min(...tous) - 40) / pas0) * pas0, hi = Math.ceil((Math.max(...neuf) + 30) / pas0) * pas0, pas = pasGraduation(lo, hi);
  const x = (i: number) => X0 + ((X1 - X0) * i) / Math.max(1, n - 1), y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (BOT - TOP);
  const chemin = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${f(x(i))},${f(y(v))}`).join(' ');
  const ligne = offre ? chemin(offre) : '', aire = offre ? `${ligne} L${f(X1)},${BOT} L${f(X0)},${BOT} Z` : '';
  let grille = ''; for (let i = 0; i <= 8; i++) grille += `M${f(X0 + ((X1 - X0) * i) / 8)},${TOP} V${VBASE} `;
  const graduations: { texte: string; y: number }[] = [];
  for (let v = Math.ceil(lo / pas) * pas; v <= hi; v += pas) { graduations.push({ texte: fmt(v).replace(/\s?\$$/, '').replace(/ $/, ''), y: y(v) }); grille += `M${X0},${f(y(v))} H${X1} `; }
  grille += `M${X0},${VBASE - VH - 4} H${X1} M${X0},${VBASE} H${X1}`;
  const max = Math.max(1, ...vols), bw = Math.min(12, ((X1 - X0) / n) * 0.55);
  const barre = (v: number, i: number) => { if (!v) return ''; const h = Math.max(2, (v / max) * VH); return `M${f(x(i) - bw / 2)},${VBASE} v${f(-h)} h${f(bw)} v${f(h)} Z`; };
  const dernierY = y((offre ?? neuf).at(-1)!);
  return { ligne, neuf: chemin(neuf), aire, grille, barres: vols.slice(0, -1).map(barre).filter(Boolean).join(' '), derniere: barre(vols.at(-1) ?? 0, n - 1), dernierX: x(n - 1), dernierY, graduations, yNeuf: y(neuf.at(-1)!) };
}
/** Description textuelle du graphique pour les lecteurs d'écran. */
export function descriptionGraphique(offre: number[] | undefined, neuf: number[], periode: string, transactions: number): string {
  const v = offre ? `Meilleure offre ${periode} : de ${fmt(offre[0]!)} à ${fmt(offre.at(-1)!)} (${variation(offre).texte}). ` : 'Aucune offre de revente sur la période. ';
  return `${v}Prix neuf, égal au plafond de revente : de ${fmt(neuf[0]!)} à ${fmt(neuf.at(-1)!)}. ${transactions} transaction${transactions > 1 ? 's' : ''} sur la période.`;
}
/** Lignes du tableau alternatif : au plus `max` jours répartis sur la période, avec les deux prix. */
export function lignesTableau(offre: number[] | undefined, neuf: number[], maintenant: number, max = 8): { jour: string; offre?: number; neuf: number }[] {
  const n = neuf.length, pas = Math.max(1, Math.ceil((n - 1) / (max - 1))), idx: number[] = [];
  for (let i = n - 1; i >= 0; i -= pas) idx.unshift(i);
  return idx.map((i) => ({ jour: jourCourt(maintenant - (n - 1 - i) * J), offre: offre?.[i], neuf: neuf[i]! }));
}

/* ───────── Ordre à cours limité ───────── */
export const PAS = 10;
/** Bornes du seuil : de la moitié du prix neuf (par 50 $) au plafond (= prix neuf). */
export function bornesSeuil(prixNeuf: number): { min: number; max: number } { const max = Math.floor(prixNeuf / PAS) * PAS; return { min: Math.min(max, Math.floor((prixNeuf * 0.5) / 50) * 50), max }; }
export const calerSeuil = (v: number, b: { min: number; max: number }): number => Math.min(b.max, Math.max(b.min, Math.round(v / PAS) * PAS));
/** Seuil proposé au départ : 50 $ sous la meilleure offre, à défaut 70 % du prix neuf. */
export const seuilParDefaut = (meilleureOffre: number | undefined, prixNeuf: number): number => calerSeuil(meilleureOffre !== undefined ? meilleureOffre - 50 : prixNeuf * 0.7, bornesSeuil(prixNeuf));
export interface EcartSeuil { texte: string; sens: 'baisse' | 'hausse' | 'egal' | 'aucune' }
/** « −50 $ (−3,3 %) sous la meilleure offre » ; l'écart porte toujours son signe. */
export function ecartSeuil(seuil: number, offre: number | undefined): EcartSeuil {
  if (offre === undefined) return { texte: 'Aucune revente en ce moment : votre ordre attend la première annonce à ce seuil.', sens: 'aucune' };
  const d = seuil - offre; if (d === 0) return { texte: '= meilleure offre actuelle', sens: 'egal' };
  const pct = fmtPct((d / offre) * 100);
  return d < 0 ? { texte: `−${fmt(-d)} (${pct}) sous la meilleure offre`, sens: 'baisse' } : { texte: `+${fmt(d)} (${pct}) au-dessus de la meilleure offre`, sens: 'hausse' };
}
export type ZoneSeuil = 'immediat' | 'meilleure_demande' | 'attente';
export interface ZoneInfo { zone: ZoneSeuil; texte: string }
export function zoneSeuil(seuil: number, offre: number | undefined, demande: number | undefined): ZoneInfo {
  if (offre !== undefined && seuil >= offre) return { zone: 'immediat', texte: `Votre seuil atteint la meilleure offre : l’achat serait exécuté tout de suite, au prix de l’offre (${fmt(offre)}).` };
  if (demande === undefined || seuil > demande) return { zone: 'meilleure_demande', texte: demande === undefined ? 'Votre seuil serait la première demande du carnet.' : `Votre seuil devient la meilleure demande du carnet, devant ${fmt(demande)}.` };
  return { zone: 'attente', texte: `D’autres demandes sont mieux placées (${fmt(demande)}). Votre ordre attend son tour.` };
}
export type ValiditeOrdre = 'jour' | 'semaine' | 'depart';
export interface Probabilite { pct: number; niveau: 'Immédiate' | 'Élevée' | 'Moyenne' | 'Faible' }
const K: Record<ValiditeOrdre, number> = { jour: 2.5, semaine: 5, depart: 10 };
/** Probabilité d'exécution (estimation simplifiée) : décroît avec l'écart sous la meilleure offre (ou, faute d'offre, sous 80 % du neuf), plus lentement quand l'ordre dure longtemps. */
export function probabilite(seuil: number, offre: number | undefined, prixNeuf: number, validite: ValiditeOrdre): Probabilite {
  const ref = offre ?? prixNeuf * 0.8; if (offre !== undefined && seuil >= offre) return { pct: 100, niveau: 'Immédiate' };
  const ecartPct = Math.max(0, ((ref - seuil) / ref) * 100), pct = Math.max(2, Math.round(94 * Math.exp(-ecartPct / K[validite])));
  return { pct, niveau: pct >= 60 ? 'Élevée' : pct >= 30 ? 'Moyenne' : 'Faible' };
}
/** Échelle « Où se place votre seuil » : bornes arrondies à 50 $ et position (0–100 %) d'un prix. */
export function echelle(seuil: number, offre: number | undefined, demande: number | undefined): { lo: number; hi: number; pos: (v: number) => number } {
  const lo = Math.floor(Math.min(seuil - 60, (demande ?? seuil) - 120) / 50) * 50, hi = Math.ceil(Math.max(seuil + 60, (offre ?? seuil) + 100) / 50) * 50;
  return { lo, hi, pos: (v) => ((v - lo) / (hi - lo)) * 100 };
}
