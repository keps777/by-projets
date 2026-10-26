// Variation du prix équivalent d'un billet neuf par destination (indices de la face « Mes actifs ») : « Départs qui montent » et bandeau défilant.
import { ecart } from '../../core/argent.ts';
import { departDe, peutEchanger } from '../../core/regles.ts';
import type { Monde, Vol } from '../../domain/types.ts';
import { dureeHM } from './format.ts';

export const JOURS_VARIATION = 30;
/** Variation en % sur 30 jours : dernier point de la courbe contre celui d'il y a 30 jours. */
export function variation30j(courbe: number[]): number {
  if (courbe.length < 2) return 0;
  const avant = courbe[Math.max(0, courbe.length - 1 - JOURS_VARIATION)];
  return ecart(avant, courbe.at(-1)!).pct;
}
export interface Tendance { code: string; ville: string; pays: string; volId: string; prix: number; variationPct: number; /** « Direct · 7 h 05 » ou « Via LAX · 14 h 30 ». */ sous: string }
const sousTitre = (v: Vol): string => `${v.escales.length ? `Via ${v.escales.join(', ')}` : 'Direct'} · ${dureeHM(v.dureeMin)}`;
/** Une tendance par destination (vol de référence : le prochain départ encore ouvert), de la plus forte hausse à la plus forte baisse. */
export function tendances(monde: Monde, now: number): Tendance[] {
  const res: Tendance[] = [];
  for (const a of monde.aeroports) {
    if (a.code === 'YUL' || a.code === 'LAX') continue;
    const v = monde.vols.filter((x) => x.vers === a.code && peutEchanger(departDe(x.jour, x.heureDepart), now)).sort((p, q) => departDe(p.jour, p.heureDepart) - departDe(q.jour, q.heureDepart))[0];
    if (!v) continue;
    res.push({ code: a.code, ville: a.ville, pays: a.pays, volId: v.id, prix: v.prixNeuf, variationPct: variation30j(v.courbe), sous: sousTitre(v) });
  }
  return res.sort((a, b) => b.variationPct - a.variationPct || a.code.localeCompare(b.code));
}
