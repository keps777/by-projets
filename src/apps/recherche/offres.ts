// Résultats d'une recherche : sélection des vols, filtres par source, onglets et compteurs, tris, regroupement par vol, baromètre du marché, dates proches.
// Fonctions pures : les offres viennent de `offresDuVol` (domain/marche.ts), passées en argument.
import type { Offre, TypeOffre } from '../../domain/marche.ts';
import type { Vol } from '../../domain/types.ts';
import { departDe, peutEchanger } from '../../core/regles.ts';
import { ecartJours } from './dates.ts';
import { PARTOUT, fenetre, type Recherche, type Source } from './params.ts';

export interface LigneOffre { offre: Offre; vol: Vol }
export type Onglet = 'tous' | TypeOffre;
export const ONGLETS: { id: Onglet; libelle: string }[] = [{ id: 'tous', libelle: 'Tous' }, { id: 'revente', libelle: 'Revente' }, { id: 'neuf', libelle: 'Neuf' }, { id: 'agence', libelle: 'Agences' }, { id: 'drop', libelle: 'Drops' }];
export type Tri = 'recommande' | 'prix' | 'ecart' | 'depart' | 'duree';
export const TRIS: { id: Tri; libelle: string; aide: string }[] = [
  { id: 'recommande', libelle: 'Recommandé', aide: 'Un vol après l’autre : les vols directs d’abord, puis les prix les plus bas.' },
  { id: 'prix', libelle: 'Prix croissant', aide: 'Du moins cher au plus cher.' },
  { id: 'ecart', libelle: 'Plus sous le prix neuf', aide: 'Les plus grosses économies par rapport au prix équivalent neuf.' },
  { id: 'depart', libelle: 'Heure de départ', aide: 'Du premier au dernier départ.' },
  { id: 'duree', libelle: 'Durée du trajet', aide: 'Du plus court au plus long.' }
];

export const departDuVol = (v: Vol): number => departDe(v.jour, v.heureDepart);
export const estDirect = (v: Vol): boolean => v.escales.length === 0;
/** Un billet reste revendable tant que l'échéance (24 h avant le départ) n'est pas passée. */
export const revendable = (v: Vol, maintenant: number): boolean => peutEchanger(departDuVol(v), maintenant);

/** Les vols d'une recherche : même départ, même destination (ou toutes), dans la fenêtre de dates, pas encore partis. Triés par départ. */
export function volsDuTrajet(vols: Vol[], r: Recherche, maintenant: number): Vol[] {
  const f = fenetre(r);
  return vols.filter((v) => v.de === r.de && (r.vers === PARTOUT || v.vers === r.vers) && (!f || (v.jour >= f[0] && v.jour <= f[1])) && departDuVol(v) > maintenant).sort((a, b) => departDuVol(a) - departDuVol(b) || a.id.localeCompare(b.id));
}
/** Retire les sources décochées et, si demandé, les billets qui ne sont plus revendables. */
export function filtrerSources(lignes: LigneOffre[], sources: Source[], seulementRevendables: boolean, maintenant: number): LigneOffre[] {
  return lignes.filter((l) => sources.includes(l.offre.type) && (!seulementRevendables || revendable(l.vol, maintenant)));
}
export const filtrerOnglet = (lignes: LigneOffre[], onglet: Onglet): LigneOffre[] => (onglet === 'tous' ? lignes : lignes.filter((l) => l.offre.type === onglet));
export function compter(lignes: LigneOffre[]): Record<Onglet, number> {
  const c: Record<Onglet, number> = { tous: lignes.length, revente: 0, neuf: 0, agence: 0, drop: 0 };
  for (const l of lignes) c[l.offre.type]++;
  return c;
}

const parPrix = (a: LigneOffre, b: LigneOffre) => Number(a.offre.masquee) - Number(b.offre.masquee) || a.offre.prix - b.offre.prix || a.offre.id.localeCompare(b.offre.id);
/** Regroupe les offres par vol, dans l'ordre où les vols apparaissent. */
export function grouperParVol(lignes: LigneOffre[]): { vol: Vol; lignes: LigneOffre[] }[] {
  const g = new Map<string, { vol: Vol; lignes: LigneOffre[] }>();
  for (const l of lignes) { const x = g.get(l.vol.id) ?? { vol: l.vol, lignes: [] }; x.lignes.push(l); g.set(l.vol.id, x); }
  return [...g.values()];
}
/** Prix le plus bas visible d'un groupe (les drops masqués ne comptent pas). */
const prixBas = (g: LigneOffre[]): number => Math.min(...g.filter((l) => !l.offre.masquee).map((l) => l.offre.prix), Infinity);
/** Trie sans modifier la liste d'origine. « Recommandé » : un vol par groupe d'offres (directs d'abord, puis prix le plus bas), les offres d'un vol par prix croissant. */
export function trier(lignes: LigneOffre[], tri: Tri): LigneOffre[] {
  const l = [...lignes];
  switch (tri) {
    case 'prix': return l.sort(parPrix);
    case 'ecart': return l.sort((a, b) => Number(a.offre.masquee) - Number(b.offre.masquee) || a.offre.ecartPct - b.offre.ecartPct || parPrix(a, b));
    case 'depart': return l.sort((a, b) => departDuVol(a.vol) - departDuVol(b.vol) || parPrix(a, b));
    case 'duree': return l.sort((a, b) => a.vol.dureeMin - b.vol.dureeMin || parPrix(a, b));
    default: {
      const groupes = grouperParVol(l).map((g) => ({ ...g, lignes: g.lignes.sort(parPrix) }));
      groupes.sort((a, b) => Number(!estDirect(a.vol)) - Number(!estDirect(b.vol)) || prixBas(a.lignes) - prixBas(b.lignes) || departDuVol(a.vol) - departDuVol(b.vol));
      return groupes.flatMap((g) => g.lignes);
    }
  }
}

/** « Meilleure affaire » : l'offre visible la moins chère parmi les vols directs (à défaut, parmi tous), à condition d'être sous le prix équivalent neuf. */
export function meilleureAffaire(lignes: LigneOffre[]): { ligne: LigneOffre; critere: 'direct' | 'tous' } | undefined {
  const visibles = lignes.filter((l) => !l.offre.masquee && l.offre.ecartPct < 0), directs = visibles.filter((l) => estDirect(l.vol));
  const pool = directs.length ? directs : visibles; if (!pool.length) return undefined;
  return { ligne: [...pool].sort(parPrix)[0], critere: directs.length ? 'direct' : 'tous' };
}

export interface PointBarometre { id: string; prix: number; type: TypeOffre; meilleure: boolean; pos: number }
export interface Barometre {
  /** Nombre d'offres visibles sous le prix équivalent neuf de leur vol. */ sousNeuf: number; /** Prix le plus bas : parmi les offres sous le neuf, sinon parmi toutes les visibles. */ des: number | null;
  /** Prix équivalent neuf du vol de référence (celui de la meilleure affaire). */ neuf: number | null; points: PointBarometre[]; posNeuf: number | null; posMin: number; posMax: number;
  echelle: { min: number; max: number; graduations: { prix: number; pos: number }[] }; /** Drops réservés aux membres du Pass : prix masqués. */ masques: number;
}
/** Échelle de prix « ronde » : bornes à la centaine, quatre intervalles égaux (maquette : 1 300 $ à 2 100 $ par pas de 200 $). */
export function echelle(prix: number[]): { min: number; max: number; graduations: { prix: number; pos: number }[] } {
  const bas = prix.length ? Math.min(...prix) : 0, haut = prix.length ? Math.max(...prix) : 100;
  const min = Math.max(0, Math.floor((bas - 20) / 100) * 100), pas = Math.max(50, Math.ceil((haut + 20 - min) / 4 / 50) * 50), max = min + pas * 4;
  return { min, max, graduations: [0, 1, 2, 3, 4].map((i) => ({ prix: min + pas * i, pos: i * 25 })) };
}
/** Le baromètre du marché : calculé sur toutes les offres de la recherche (sources et revendabilité appliquées), quel que soit l'onglet. */
export function barometre(lignes: LigneOffre[], surbrillance: string | undefined): Barometre {
  const visibles = lignes.filter((l) => !l.offre.masquee), sous = visibles.filter((l) => l.offre.ecartPct < 0);
  const ref = lignes.find((l) => l.offre.id === surbrillance)?.vol ?? visibles.filter((l) => l.offre.type === 'neuf').sort(parPrix)[0]?.vol ?? visibles[0]?.vol;
  const neuf = ref ? ref.prixNeuf : null, prix = [...visibles.map((l) => l.offre.prix), ...(neuf !== null ? [neuf] : [])], ech = echelle(prix);
  const pos = (p: number) => Math.min(100, Math.max(0, ((p - ech.min) / (ech.max - ech.min)) * 100));
  const points = visibles.map((l) => ({ id: l.offre.id, prix: l.offre.prix, type: l.offre.type, meilleure: l.offre.id === surbrillance, pos: pos(l.offre.prix) })).sort((a, b) => a.prix - b.prix);
  return { sousNeuf: sous.length, des: (sous.length ? sous : visibles).reduce<number | null>((m, l) => (m === null || l.offre.prix < m ? l.offre.prix : m), null), neuf, points,
    posNeuf: neuf !== null ? pos(neuf) : null, posMin: points.length ? points[0].pos : 0, posMax: points.length ? points[points.length - 1].pos : 0, echelle: ech, masques: lignes.filter((l) => l.offre.masquee).length };
}

export interface DateProche { jour: string; vols: number; ecart: number }
/** Jours proches de la date cherchée où le même trajet a des vols (état vide). */
export function datesProches(vols: Vol[], r: Recherche, aujourdhui: string, max = 4): DateProche[] {
  if (!r.jour) return [];
  const m = new Map<string, number>();
  for (const v of vols) if (v.de === r.de && (r.vers === PARTOUT || v.vers === r.vers) && v.jour >= aujourdhui && v.jour !== r.jour) m.set(v.jour, (m.get(v.jour) ?? 0) + 1);
  return [...m.entries()].map(([jour, n]) => ({ jour, vols: n, ecart: ecartJours(r.jour!, jour) })).sort((a, b) => Math.abs(a.ecart) - Math.abs(b.ecart) || a.ecart - b.ecart).slice(0, max);
}
/** Le trajet a-t-il au moins un vol à une autre date ? Sinon l'état vide propose « Partout ». */
export const existeTrajet = (vols: Vol[], r: Recherche): boolean => vols.some((v) => v.de === r.de && (r.vers === PARTOUT || v.vers === r.vers));
/** Les mêmes dates, élargies à ±3 jours (suggestion de l'état vide). */
export const elargir = (r: Recherche): Recherche => ({ ...r, flex: !!r.jour });
export { fmtEcart } from './montants.ts';
