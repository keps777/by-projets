// Historique du portefeuille pour la variante PC : prix équivalent et montant payé, depuis le premier achat. Fonctions pures sur le monde (courbe indicative : les vols n'ont que 90 jours de courbe).

import type { Droit, Monde } from '../../domain/types.ts';
import { jourCourt } from '../voyager/format.ts';
import { droitsActifs } from '../voyager/portefeuille.ts';

const JOUR = 86_400_000;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export interface HistoriquePf {
  debut: number; fin: number; titre: string; equiv: [number, number][]; paye: [number, number][]; max: number; graduations: number[]; mois: { pct: number; lib: string }[]; paliers: string;
}
const acquisition = (d: Droit, compteId: string): number => [...d.chaine].reverse().find((x) => x.vers === compteId && x.type !== 'nommage')?.quand ?? d.chaine[0]?.quand ?? 0;
/** Valeur d'un vol à l'instant t : la courbe sur ses 90 derniers jours, le premier point avant. */
const valeurA = (courbe: number[], now: number, t: number): number => courbe[Math.max(0, Math.min(courbe.length - 1, courbe.length - 1 - Math.round((now - t) / JOUR)))];
export function historiquePf(m: Monde, compteId: string, now: number): HistoriquePf | null {
  const l = droitsActifs(m, compteId, now).map((x) => ({ d: x.droit, v: x.vol, t: acquisition(x.droit, compteId) }));
  if (!l.length) return null;
  const debut = Math.min(...l.map((x) => x.t)), fin = now, n = 120;
  const equiv: [number, number][] = [], paye: [number, number][] = [];
  let max = 0;
  for (let i = 0; i <= n; i++) {
    const t = debut + ((fin - debut) * i) / n, tenus = l.filter((x) => x.t <= t + 1);
    const e = tenus.reduce((s, x) => s + valeurA(x.v.courbe, now, t), 0), p = tenus.reduce((s, x) => s + x.d.prixPaye, 0);
    equiv.push([i / n, e]); paye.push([i / n, p]); max = Math.max(max, e, p);
  }
  const pas = Math.max(1000, Math.ceil(max / 5 / 1000) * 1000), haut = pas * 5;
  const graduations = [5, 4, 3, 2, 1].map((k) => k * pas);
  const etendue = fin - debut || 1, mois: { pct: number; lib: string }[] = [{ pct: 0, lib: MOIS[new Date(debut).getMonth()] }];
  const d0 = new Date(debut), saut = etendue > 150 * JOUR ? 2 : 1;
  for (let k = saut; ; k += saut) {
    const t = new Date(d0.getFullYear(), d0.getMonth() + k, 1).getTime(), pct = (t - debut) / etendue;
    if (pct > 0.8) break; mois.push({ pct, lib: MOIS[new Date(t).getMonth()] });
  }
  const paliers = [...l].sort((a, b) => a.t - b.t).map((x) => `du ${jourCourt(x.t)} (${x.v.de} → ${x.v.vers}${x.d.origine === 'revente' ? ', revente' : x.d.origine === 'drop' ? ', Drop' : x.d.origine === 'agence' ? ', agence' : x.d.origine === 'import' ? ', import' : ''})`);
  const liste = paliers.length > 1 ? `${paliers.slice(0, -1).join(', ')} et ${paliers.at(-1)}` : paliers[0];
  return { debut, fin, titre: `Depuis le premier achat · ${jourCourt(debut)} → ${jourCourt(fin)} ${new Date(fin).getFullYear()}`, equiv, paye, max: haut, graduations, mois, paliers: `Paliers : achats ${liste}. Courbe indicative, données fictives.` };
}
/** Points SVG (viewBox 1000 × 150, ligne de base à 144, marge haute de 6) ; le montant payé est une marche. */
export function pointsSvg(serie: [number, number][], max: number, marche = false): string {
  const y = (v: number) => Math.round((144 - (v / max) * 138) * 10) / 10, pts: string[] = [];
  serie.forEach(([x, v], i) => { const px = Math.round(x * 1000 * 10) / 10; if (marche && i > 0) pts.push(`${px},${y(serie[i - 1][1])}`); pts.push(`${px},${y(v)}`); });
  return pts.join(' ');
}
