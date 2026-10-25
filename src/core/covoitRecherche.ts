// Covoiturage : recherche, filtres rapides et tri des offres. Pur, testé.
import type { OffreCovoit } from '../domain/types.ts';
import { departOffreMs, placesRestantes } from './covoit.ts';
import type { InfoOffre } from './covoitTypes.ts';

export type Tri = 'heure' | 'prix' | 'note';
export type Filtre = 'tot' | 'pas_cher' | 'places' | 'verifies' | 'non_fumeur' | 'femmes';
export const LIBELLE_FILTRE: Record<Filtre, string> = { tot: 'Tôt', pas_cher: 'Pas cher', places: '2+ places', verifies: 'Vérifiés', non_fumeur: 'Non-fumeur', femmes: 'Entre femmes' };
export const LIBELLE_TRI: Record<Tri, string> = { heure: 'Plus tôt', prix: 'Moins cher', note: 'Mieux noté' };
export interface Recherche { de: string; vers: string; jour: string; filtres: Filtre[]; tri: Tri }
export const HEURE_TOT = '09:00';

const mediane = (v: number[]) => { const t = [...v].sort((a, b) => a - b); return t.length ? t[Math.floor((t.length - 1) / 2)] : 0; };
/** Offres ouvertes pas encore parties, sur le trajet (vide = partout) et le jour (vide = tous les jours), avant filtres rapides. */
export function candidates<T extends OffreCovoit>(offres: T[], r: Pick<Recherche, 'de' | 'vers' | 'jour'>, nowMs: number): T[] {
  return offres.filter((o) => o.statut === 'ouverte' && departOffreMs(o) >= nowMs && (!r.de || o.de === r.de) && (!r.vers || o.vers === r.vers) && (!r.jour || o.jour === r.jour));
}
/** Un filtre rapide s'applique-t-il à cette offre ? `seuilPrix` : prix médian des candidates (« pas cher » = moitié basse). */
export function passeFiltre(f: Filtre, o: OffreCovoit, info: InfoOffre, seuilPrix: number): boolean {
  switch (f) {
    case 'tot': return o.heure < HEURE_TOT;
    case 'pas_cher': return o.prix <= seuilPrix;
    case 'places': return placesRestantes(o) >= 2;
    case 'verifies': return info.verifie;
    case 'non_fumeur': return !info.fumeur;
    case 'femmes': return info.femmes;
  }
}
export function chercher<T extends OffreCovoit>(offres: T[], r: Recherche, info: (o: T) => InfoOffre, nowMs: number): T[] {
  const base = candidates(offres, r, nowMs), seuil = mediane(base.map((o) => o.prix));
  const gardees = base.filter((o) => r.filtres.every((f) => passeFiltre(f, o, info(o), seuil)));
  const parHeure = (a: T, b: T) => departOffreMs(a) - departOffreMs(b);
  const tri = r.tri === 'prix' ? (a: T, b: T) => a.prix - b.prix || parHeure(a, b) : r.tri === 'note' ? (a: T, b: T) => info(b).note - info(a).note || parHeure(a, b) : parHeure;
  return gardees.sort(tri);
}
/** Nombre d'offres par ville de départ ou d'arrivée (pour les sélecteurs), les plus proposées d'abord. */
export function villesDesOffres(offres: OffreCovoit[], cote: 'de' | 'vers', nowMs: number): { nom: string; n: number }[] {
  const m = new Map<string, number>();
  for (const o of offres) if (o.statut === 'ouverte' && departOffreMs(o) >= nowMs) m.set(o[cote], (m.get(o[cote]) ?? 0) + 1);
  return [...m].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'));
}
/** Nombre d'offres par jour pour un trajet donné. */
export function comptesParJour(offres: OffreCovoit[], r: Pick<Recherche, 'de' | 'vers'>, nowMs: number): Record<string, number> {
  const c: Record<string, number> = {};
  for (const o of candidates(offres, { ...r, jour: '' }, nowMs)) c[o.jour] = (c[o.jour] ?? 0) + 1;
  return c;
}
/** Premier jour (≥ `depuis`) où le trajet est proposé, sinon vide. */
export const premierJour = (offres: OffreCovoit[], r: Pick<Recherche, 'de' | 'vers'>, nowMs: number): string => Object.keys(comptesParJour(offres, r, nowMs)).sort()[0] ?? '';
