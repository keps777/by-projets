// La soute partagée d'un même vol : droits de bagage, étiquettes, offres des autres passagers, comparaison au comptoir. Lecture du monde simulé, aucune écriture.
// Règles (provisoires, à valider avec la compagnie) : un bagage ne voyage que sur son vol (même numéro, même date) ; prix plafonné au prix du bagage au comptoir.
import { app, maintenant } from '../../data/store.svelte.ts';
import { arrondi, fmtSigne } from '../../core/argent.ts';
import { departDuVol, droitsDe, volDe } from '../../domain/marche.ts';
import type { BagageDroit, DemandeBagage, Droit, StatutDroit, Vol } from '../../domain/types.ts';
import { decaler } from './format.ts';

/** Poids d'un bagage en soute (kg), selon la compagnie (hypothèse). */
export const KG_BAGAGE = 23;
/** Dimensions maximales (longueur + largeur + hauteur, cm), selon la compagnie (hypothèse). */
export const DIMENSION_MAX_CM = 158;
/** Bagages ajoutables par réservation (règle de démonstration). */
export const MIN_AJOUT = 1;
export const MAX_AJOUT = 3;
/** Un droit détenu, en vente ou nommé donne une franchise en soute. */
const ACTIFS: StatutDroit[] = ['detenu', 'en_vente', 'nomme'];

/** Plafond d'une offre de bagage : le prix du bagage au comptoir (règle provisoire). */
export const plafondBagage = (v: Vol): number => v.prixBagageCompagnie;
/** « 812 » pour « AE 812 ». */
export const numeroVol = (v: Vol): string => v.numero.split(' ').slice(1).join(' ');

/** Droits de voyage à venir du compte qui donnent une soute, du plus proche au plus lointain. */
export function droitsAVenir(compteId: string, now: number = maintenant()): Droit[] {
  return droitsDe(compteId).filter((d) => ACTIFS.includes(d.statut) && (volDe(d.volId) ? departDuVol(volDe(d.volId)!) > now : false))
    .sort((a, b) => departDuVol(volDe(a.volId)!) - departDuVol(volDe(b.volId)!));
}
/** Identifiant du prochain droit à venir du compte (pour les liens de la barre d'actions). */
export const prochainDroitId = (compteId: string, now: number = maintenant()): string | undefined => droitsAVenir(compteId, now)[0]?.id;
/** Le droit demandé par `?droit=` s'il est dans le portefeuille du compte, sinon le prochain droit. */
export function resoudreDroit(compteId: string, droitId?: string | null, now: number = maintenant()): Droit | undefined {
  const l = droitsAVenir(compteId, now); return (droitId ? l.find((d) => d.id === droitId) : undefined) ?? l[0];
}

/** Les droits de bagage que `compteId` détient sur ce vol (franchise non utilisée, en vente, vendue, achetée). */
export const bagagesSur = (compteId: string, volId: string): BagageDroit[] => app.monde.bagages.filter((b) => b.detenteurId === compteId && b.volId === volId);

/** Offres de la soute du vol (même numéro, même date : un vol = un `volId`), du prix le plus bas au plus haut. Hors offres du compte `sauf`, hors prix au-dessus du plafond. */
export function offresSoute(volId: string, sauf?: string): BagageDroit[] {
  const v = volDe(volId); if (!v) return [];
  return app.monde.bagages.filter((b) => b.volId === volId && b.statut === 'en_vente' && b.detenteurId !== sauf && b.prix > 0 && b.prix <= plafondBagage(v)).sort((a, b) => a.prix - b.prix || a.id.localeCompare(b.id));
}
/** Compteurs de la soute d'un vol : bagages proposés (tous vendeurs) et demandes ouvertes. */
export function compteursSoute(volId: string): { proposes: number; demandes: number } {
  return { proposes: app.monde.bagages.filter((b) => b.volId === volId && b.statut === 'en_vente').length, demandes: app.monde.demandesBagage.filter((x) => x.volId === volId && x.statut === 'ouverte').length };
}
export const demandesDe = (compteId: string, volId: string): DemandeBagage[] => app.monde.demandesBagage.filter((x) => x.compteId === compteId && x.volId === volId && x.statut === 'ouverte');
/** Les `n` offres les moins chères (choisies pour l'acheteur). */
export const choisir = (offres: BagageDroit[], n: number): BagageDroit[] => offres.slice(0, Math.max(0, n));
export const somme = (offres: BagageDroit[]): number => arrondi(offres.reduce((t, o) => t + o.prix, 0));

/** Bagages déjà ajoutés à la réservation par achat (en attente de la compagnie ou confirmés). */
export const dejaAjoutes = (compteId: string, volId: string): number => bagagesSur(compteId, volId).filter((b) => b.statut === 'achete' || b.statut === 'transfere').length;
/** Nombre de bagages encore ajoutables : plafond de la règle, moins ce qui est déjà ajouté, limité par les offres disponibles. */
export function ajoutPossible(compteId: string, volId: string): number { return Math.max(0, Math.min(MAX_AJOUT - dejaAjoutes(compteId, volId), offresSoute(volId, compteId).length)); }
/** Quantité ramenée dans [1, ajoutPossible] (0 si rien n'est ajoutable). */
export const quantiteValide = (q: number, possible: number): number => (possible <= 0 ? 0 : Math.min(possible, Math.max(MIN_AJOUT, Math.trunc(Number.isFinite(q) ? q : MIN_AJOUT))));

/** Écart signé entre le prix au comptoir et un prix de la soute : « −60 $ » quand la soute est moins chère, « +20 $ » sinon. */
export function ecartComptoir(prix: number, comptoir: number): { abs: number; libelle: string; moinsCher: boolean } {
  const abs = arrondi(prix - comptoir); return { abs, libelle: fmtSigne(abs), moinsCher: abs < 0 };
}
/** Part (0–100) de `valeur` dans `reference`, pour les jauges comparatives. */
export const partDe = (valeur: number, reference: number): number => (reference > 0 ? Math.max(0, Math.min(100, Math.round((valeur / reference) * 100))) : 0);

/* ---------- étiquettes et franchise ---------- */
export type GenreEtiquette = 'utilise' | 'inutilise' | 'en_vente' | 'vendu' | 'ajoute' | 'attente';
export interface Etiquette { rang: number; sur: number; kg: number; genre: GenreEtiquette; prix?: number; bagageId?: string }
export interface ResumeFranchise { inclus: number; utilises: number; libres: number; enVente: number; vendus: number; ajoutes: number; attente: number; total: number }
const GENRE_PROPRE: Partial<Record<BagageDroit['statut'], GenreEtiquette>> = { inclus: 'inutilise', en_vente: 'en_vente', vendu: 'vendu' };

/** Une étiquette par bagage de la réservation : d'abord les bagages inclus (utilisés, puis ceux dont le droit est libre, en vente ou vendu), puis les bagages ajoutés par achat. */
export function etiquettes(droit: Droit): Etiquette[] {
  const lignes = bagagesSur(droit.detenteurId, droit.volId);
  const propres = lignes.filter((b) => GENRE_PROPRE[b.statut]).slice(0, droit.bagagesInclus);
  const acquis = lignes.filter((b) => b.statut === 'achete' || b.statut === 'transfere');
  const brut: Omit<Etiquette, 'rang' | 'sur'>[] = [
    ...Array.from({ length: Math.max(0, droit.bagagesInclus - propres.length) }, () => ({ kg: KG_BAGAGE, genre: 'utilise' as const })),
    ...propres.map((b) => ({ kg: b.kg, genre: GENRE_PROPRE[b.statut]!, prix: b.statut === 'en_vente' ? b.prix : undefined, bagageId: b.id })),
    ...acquis.map((b) => ({ kg: b.kg, genre: (b.statut === 'achete' ? 'attente' : 'ajoute') as GenreEtiquette, prix: b.prix, bagageId: b.id }))
  ];
  return brut.map((e, i) => ({ ...e, rang: i + 1, sur: brut.length }));
}
export function resumeFranchise(e: Etiquette[]): ResumeFranchise {
  const n = (...g: GenreEtiquette[]) => e.filter((x) => g.includes(x.genre)).length;
  return { inclus: n('utilise', 'inutilise', 'en_vente', 'vendu'), utilises: n('utilise'), libres: n('inutilise', 'en_vente'), enVente: n('en_vente'), vendus: n('vendu'), ajoutes: n('ajoute'), attente: n('attente'), total: e.length };
}
/** Titre de l'écran « Mes bagages », deux lignes : « 2 bagages inclus, » / « 1 sans valise. » */
export function titreFranchise(r: ResumeFranchise): [string, string] {
  const inclus = `${r.inclus} bagage${r.inclus > 1 ? 's' : ''} inclus,`;
  if (r.libres > 0) return [inclus, `${r.libres} sans valise.`];
  if (r.vendus > 0) return [inclus, `${r.vendus} vendu${r.vendus > 1 ? 's' : ''}.`];
  return [inclus, r.inclus > 1 ? 'tous utilisés.' : 'utilisé.'];
}

/* ---------- vol identique ---------- */
export interface VolCandidat { numero: string; jour: string; heure: string; origine: 'portefeuille' | 'exemple' }
export interface Comparaison { numero: { soute: string; autre: string; identique: boolean }; date: { soute: string; autre: string; identique: boolean }; memeVol: boolean }
/** Même vol = même numéro ET même date. */
export function comparerVols(soute: { numero: string; jour: string }, autre: { numero: string; jour: string }): Comparaison {
  const n = { soute: soute.numero, autre: autre.numero, identique: soute.numero === autre.numero }, d = { soute: soute.jour, autre: autre.jour, identique: soute.jour === autre.jour };
  return { numero: n, date: d, memeVol: n.identique && d.identique };
}
/** Les « autres vols » qu'on peut essayer : les autres droits du compte, puis deux exemples (autre numéro le même jour ; même numéro un autre jour). */
export function volsAEssayer(droit: Droit): VolCandidat[] {
  const v = volDe(droit.volId)!, no = Number(numeroVol(v)), liste: VolCandidat[] = [];
  for (const d of droitsAVenir(droit.detenteurId)) { const w = volDe(d.volId); if (w && (w.numero !== v.numero || w.jour !== v.jour)) liste.push({ numero: numeroVol(w), jour: w.jour, heure: w.heureDepart, origine: 'portefeuille' }); }
  liste.push({ numero: String(no + 2), jour: v.jour, heure: '21:40', origine: 'exemple' }, { numero: numeroVol(v), jour: decaler(v.jour, 1), heure: v.heureDepart, origine: 'exemple' });
  return liste;
}
