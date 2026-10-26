// Carnet d'ordres d'un vol : offres de vente (annonces en cours) et demandes d'achat (ordres à cours limité et intentions d'achat), cumulés par prix ;
// dernières transactions tirées des chaînes de détention. Lectures du monde simulé, aucune écriture.
import { app, maintenant } from '../data/store.svelte.ts';
import { peutEchanger } from '../core/regles.ts';
import { volsCompatibles } from '../apps/intentions/compat.ts';
import { detailDe } from '../apps/intentions/modele.ts';
import { departDuVol, volDe } from './marche.ts';
import { expirationOrdre } from './revente.ts';

/** Un niveau de prix du carnet : combien de billets à ce prix, et combien au total depuis le meilleur prix. */
export interface Niveau { prix: number; qte: number; cumul: number }
/** Regroupe des quantités par prix et cumule depuis le meilleur : `vente` (le moins cher d'abord) ou `achat` (le plus cher d'abord). Renvoie du meilleur au moins bon. Pur. */
export function cumuler(lignes: { prix: number; qte: number }[], sens: 'vente' | 'achat'): Niveau[] {
  const parPrix = new Map<number, number>();
  for (const l of lignes) parPrix.set(l.prix, (parPrix.get(l.prix) ?? 0) + l.qte);
  const prix = [...parPrix.keys()].sort((a, b) => (sens === 'vente' ? a - b : b - a));
  let cumul = 0; return prix.map((p) => ({ prix: p, qte: parPrix.get(p)!, cumul: (cumul += parPrix.get(p)!) }));
}
/** Écart entre la meilleure offre et la meilleure demande : montant et pourcentage de la meilleure offre (0 si l'un des deux manque). Pur. */
export function ecartCarnet(meilleureOffre?: number, meilleureDemande?: number): { abs: number; pct: number } | undefined {
  if (meilleureOffre === undefined || meilleureDemande === undefined) return undefined;
  const abs = meilleureOffre - meilleureDemande; return { abs, pct: meilleureOffre ? Math.round((abs / meilleureOffre) * 1000) / 10 : 0 };
}
export interface Carnet { offres: Niveau[]; demandes: Niveau[]; meilleureOffre?: number; meilleureDemande?: number; ecart?: { abs: number; pct: number } }
/** Carnet d'un vol. Les demandes viennent des ordres actifs sur ce vol et des intentions d'achat publiées dont le trajet et la fenêtre l'incluent (un voyageur compte pour autant de billets). */
export function carnetDuVol(volId: string, quand: number = maintenant()): Carnet {
  const v = volDe(volId); if (!v) return { offres: [], demandes: [] };
  const ventes = app.monde.droits.filter((d) => d.volId === volId && d.statut === 'en_vente' && d.annonce).map((d) => ({ prix: d.annonce!.prix, qte: 1 }));
  const achats: { prix: number; qte: number }[] = [];
  for (const o of app.monde.ordres) if (o.volId === volId && o.statut === 'actif' && expirationOrdre(o.validite, o.creeLe, v) > quand) achats.push({ prix: o.limite, qte: 1 });
  for (const i of app.monde.intentions) {
    if (i.statut !== 'publiee') continue; const d = detailDe(i);
    if (d.expire <= quand || (i.volId !== volId && !(i.de === v.de && i.vers === v.vers && volsCompatibles({ de: d.de, vers: d.vers, du: d.du, au: d.au, flexible: d.flexible }).some((x) => x.id === volId)))) continue;
    achats.push({ prix: i.budget, qte: d.voyageurs });
  }
  const offres = cumuler(ventes, 'vente'), demandes = cumuler(achats, 'achat');
  return { offres, demandes, meilleureOffre: offres[0]?.prix, meilleureDemande: demandes[0]?.prix, ecart: ecartCarnet(offres[0]?.prix, demandes[0]?.prix) };
}
/** Annonces concurrentes sur un vol (prix), hors le droit `sauf`. */
export const annoncesDuVol = (volId: string, sauf?: string): number[] => app.monde.droits.filter((d) => d.volId === volId && d.statut === 'en_vente' && d.annonce && d.id !== sauf).map((d) => d.annonce!.prix).sort((a, b) => a - b);

export interface Transaction { quand: number; prix: number; qte: number; /** Écart avec la transaction précédente (absent pour la première). */ variation?: number }
/** Reventes conclues sur ce vol, d'après les chaînes de détention, de la plus récente à la plus ancienne. */
export function transactionsDuVol(volId: string, max = 20): Transaction[] {
  const l = app.monde.droits.filter((d) => d.volId === volId).flatMap((d) => d.chaine.filter((m) => m.type === 'revente').map((m) => ({ quand: m.quand, prix: m.prix, qte: 1 }))).sort((a, b) => a.quand - b.quand);
  return l.map((t, i): Transaction => ({ ...t, ...(i ? { variation: t.prix - l[i - 1]!.prix } : {}) })).reverse().slice(0, max);
}
/** Le vol est-il encore ouvert aux échanges ? */
export const volOuvert = (volId: string): boolean => { const v = volDe(volId); return !!v && peutEchanger(departDuVol(v), maintenant()); };
