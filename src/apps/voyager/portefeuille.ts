// Agrégats du portefeuille pour la face « Mes actifs » et le prochain voyage de l'accueil. Fonctions pures sur le monde.
import { ecart, type Ecart } from '../../core/argent.ts';
import { departDe, echeanceDe } from '../../core/regles.ts';
import type { Droit, Monde, Vol } from '../../domain/types.ts';

/** Un droit « actif » est détenu ou nommé, pour un vol qui n'est pas encore parti. (Un droit en vente a sa propre annonce : il n'entre pas dans le total.) */
export function droitsActifs(monde: Monde, compteId: string, now: number): { droit: Droit; vol: Vol; departMs: number }[] {
  const res: { droit: Droit; vol: Vol; departMs: number }[] = [];
  for (const droit of monde.droits) {
    if (droit.detenteurId !== compteId || (droit.statut !== 'detenu' && droit.statut !== 'nomme')) continue;
    const vol = monde.vols.find((v) => v.id === droit.volId); if (!vol) continue;
    const departMs = departDe(vol.jour, vol.heureDepart); if (departMs <= now) continue;
    res.push({ droit, vol, departMs });
  }
  return res.sort((a, b) => a.departMs - b.departMs);
}
export interface Agregat { nb: number; /** Somme des prix équivalents d'un billet neuf aujourd'hui. */ equivalent: number; paye: number; ecart: Ecart }
export function agregatPortefeuille(monde: Monde, compteId: string, now: number): Agregat {
  const l = droitsActifs(monde, compteId, now), equivalent = l.reduce((s, x) => s + x.vol.prixNeuf, 0), paye = l.reduce((s, x) => s + x.droit.prixPaye, 0);
  return { nb: l.length, equivalent, paye, ecart: ecart(paye, equivalent) };
}
/** Le prochain voyage : le droit actif dont le vol part le premier. */
export const prochainDroit = (monde: Monde, compteId: string, now: number) => droitsActifs(monde, compteId, now)[0];
export interface Echeance { droitId: string; vol: Vol; echeanceMs: number }
/** La plus proche échéance de nommage parmi les droits détenus (pas encore nommés) et dont l'échéance n'est pas passée. */
export function prochaineEcheance(monde: Monde, compteId: string, now: number): Echeance | undefined {
  return droitsActifs(monde, compteId, now).filter((x) => x.droit.statut === 'detenu').map((x) => ({ droitId: x.droit.id, vol: x.vol, echeanceMs: echeanceDe(x.departMs) })).filter((e) => e.echeanceMs > now).sort((a, b) => a.echeanceMs - b.echeanceMs)[0];
}
/** Valeur (prix équivalent) du portefeuille sur `n` points répartis sur les 90 derniers jours des courbes ; le dernier est le prix d'aujourd'hui. */
export function serieValeur(monde: Monde, compteId: string, now: number, n = 9): number[] {
  const vols = droitsActifs(monde, compteId, now).map((x) => x.vol); if (!vols.length) return [];
  const taille = Math.min(...vols.map((v) => v.courbe.length));
  return Array.from({ length: n }, (_, i) => { const k = Math.round((i * (taille - 1)) / (n - 1)); return vols.reduce((s, v) => s + v.courbe[v.courbe.length - taille + k], 0); });
}
/** Points d'une ligne dans un cadre `largeur × hauteur` (marges `m`), valeur haute en haut : « 2,42 15,40 … ». Une série plate tracée à mi-hauteur. */
export function pointsLigne(serie: number[], largeur = 112, hauteur = 48, m = 6): { points: string; dernier: { x: number; y: number } } | null {
  if (serie.length < 2) return null;
  const min = Math.min(...serie), max = Math.max(...serie), etendue = max - min;
  const xy = serie.map((v, i) => ({ x: Math.round((2 + (i * (largeur - 2 - 2)) / (serie.length - 1)) * 10) / 10, y: Math.round((etendue ? hauteur - m - ((v - min) / etendue) * (hauteur - 2 * m) : hauteur / 2) * 10) / 10 }));
  return { points: xy.map((p) => `${p.x},${p.y}`).join(' '), dernier: xy.at(-1)! };
}
