// Face nuit de la soute partagée : calculs purs (marché d'un vol, comparaison au comptoir, net après commission, carte de la soute). Aucune lecture du monde ici.
// Règles provisoires (à valider avec la compagnie) : un bagage ne voyage que sur son vol ; aucune offre au-dessus du prix compagnie ; commission de revente en hypothèse.
import { arrondi, fmt, fmtSigne } from '../../core/argent.ts';
import { commission, net, taux, TAUX_COMMISSION, TAUX_COMMISSION_PASS } from '../../core/regles.ts';

/** Prix de vente ou d'achat minimum d'un bagage (hypothèse de démonstration), et pas du curseur. */
export const PRIX_MIN_BAGAGE = 50;
export const PAS_PRIX_BAGAGE = 5;
/** Bagages par demande (planche : « de 1 à 4 par demande »). */
export const NOMBRE_MIN_DEMANDE = 1;
export const NOMBRE_MAX_DEMANDE = 4;
/** Durée pendant laquelle une offre est réservée à celui qui a été prévenu (hypothèse). */
export const RESERVE_MINUTES = 15;
/** Emplacements de la carte de la soute (schéma illustratif : 12 à l'avant, 12 à l'arrière) et emplacements libres chez la compagnie (hypothèse de démonstration). */
export const EMPLACEMENTS = 24;
export const LIBRES_COMPAGNIE = 3;

/* ---------- prix ---------- */
/** Bornes du curseur de prix : de 50 $ au plafond (prix compagnie). */
export const bornesPrix = (plafond: number): { min: number; max: number; pas: number } => ({ min: Math.min(PRIX_MIN_BAGAGE, plafond), max: plafond, pas: PAS_PRIX_BAGAGE });
/** Ramène un prix dans les bornes, au pas du curseur (le plafond lui-même reste atteignable). */
export function caler(prix: number, plafond: number): number {
  const { min, max, pas } = bornesPrix(plafond), p = Number.isFinite(prix) ? prix : min;
  return Math.min(max, Math.max(min, Math.round(p / pas) * pas));
}
/** Un prix est valide s'il est positif et jamais au-dessus du prix compagnie. */
export const prixValide = (prix: number, plafond: number): boolean => Number.isFinite(prix) && prix >= bornesPrix(plafond).min && prix <= plafond;
/** Écart au plafond : montant sous le prix compagnie, ou « au plafond ». */
export function ecartPlafond(prix: number, plafond: number): { sous: number; auPlafond: boolean } { return { sous: arrondi(Math.max(0, plafond - prix)), auPlafond: prix >= plafond }; }
/** Écart signé entre un prix de la soute et le prix au comptoir : « −60 $ » quand la soute est moins chère, « +20 $ » sinon. */
export function ecartComptoir(prix: number, comptoir: number): { abs: number; libelle: string; sens: 'moins' | 'plus' | 'egal' } {
  const abs = arrondi(prix - comptoir); return { abs, libelle: abs === 0 ? fmt(0) : abs > 0 ? fmtSigne(abs) : fmt(abs), sens: abs < 0 ? 'moins' : abs > 0 ? 'plus' : 'egal' };
}
/** Prix proposé par défaut à la vente : le moins cher des autres (pour arriver en tête), sinon les deux tiers du plafond. Toujours calé. */
export function prixVenteSuggere(autres: number[], plafond: number): number { return caler(autres.length ? Math.min(...autres) : (plafond * 2) / 3, plafond); }
/** Prix maximum proposé par défaut à la demande : l'offre la moins chère, sinon la meilleure demande, sinon 60 % du plafond. */
export function prixMaxSuggere(offres: number[], demandes: number[], plafond: number): number {
  return caler(offres.length ? Math.min(...offres) : demandes.length ? Math.max(...demandes) : plafond * 0.6, plafond);
}

/* ---------- net après commission ---------- */
export interface NetVente { prix: number; commission: number; net: number; taux: number; pass: boolean; autreTaux: number; autreNet: number }
/** Ce que reçoit le vendeur (commission prélevée seulement si la vente a lieu). `autreNet` : ce qu'il recevrait avec l'autre taux (sans Pass pour un membre, avec Pass sinon). */
export function netVente(prix: number, pass: boolean): NetVente {
  return { prix, commission: commission(prix, pass), net: net(prix, pass), taux: taux(pass), pass, autreTaux: taux(!pass), autreNet: net(prix, !pass) };
}
export const TAUX_AFFICHES = { pass: TAUX_COMMISSION_PASS, sansPass: TAUX_COMMISSION };

/* ---------- carnet de la soute ---------- */
export interface OffreMarche { id: string; prix: number; vendeurId: string; code?: string; quand?: number }
export interface LigneCarnet<T extends OffreMarche = OffreMarche> { offre: T; cumul: number; profondeur: number; meilleure: boolean }
/** Les offres du moins cher au plus cher, à égalité par identifiant. */
export const trierOffres = <T extends { id: string; prix: number }>(offres: T[]): T[] => [...offres].sort((a, b) => a.prix - b.prix || a.id.localeCompare(b.id));
/** Carnet d'offres, affiché du plus cher (haut) au moins cher (bas, au contact des demandes) ; le cumul compte les bagages du moins cher au plus cher ; la barre = cumul / nombre d'offres. */
export function carnetOffres<T extends OffreMarche>(offres: T[]): LigneCarnet<T>[] {
  const tri = trierOffres(offres), n = tri.length;
  return tri.map((offre, i) => ({ offre, cumul: i + 1, profondeur: Math.round(((i + 1) / n) * 100), meilleure: i === 0 })).reverse();
}
export interface LigneDemande { prix: number; nombre: number; cumul: number; profondeur: number; meilleure: boolean }
/** Demandes groupées par prix, de la plus haute à la plus basse ; la barre est relative au nombre d'offres (ou de demandes si plus nombreuses). */
export function carnetDemandes(prixMax: number[], nbOffres: number): LigneDemande[] {
  const parPrix = new Map<number, number>(); for (const p of prixMax) parPrix.set(p, (parPrix.get(p) ?? 0) + 1);
  const base = Math.max(nbOffres, prixMax.length, 1); let cumul = 0;
  return [...parPrix.entries()].sort((a, b) => b[0] - a[0]).map(([prix, nombre], i) => { cumul += nombre; return { prix, nombre, cumul, profondeur: Math.round((cumul / base) * 100), meilleure: i === 0 }; });
}
export interface Appariement { possible: boolean; demande: number; offre: number; libelle: string }
/** La meilleure demande rencontre-t-elle la meilleure offre ? Toujours « à confirmer par la compagnie ». */
export function appariement(meilleureOffre: number | undefined, meilleureDemande: number | undefined): Appariement | undefined {
  if (meilleureOffre === undefined || meilleureDemande === undefined) return undefined;
  const possible = meilleureDemande >= meilleureOffre;
  return { possible, demande: meilleureDemande, offre: meilleureOffre, libelle: possible ? 'appariement à confirmer par la compagnie' : 'pas d’appariement pour l’instant' };
}
/** Rang d'un prix parmi les offres des autres : « 3e moins chère sur 8 · à égalité avec 2 autres ». */
export function rangOffre(prix: number, autres: number[]): { rang: number; sur: number; egalite: number; libelle: string } {
  const rang = autres.filter((v) => v < prix).length + 1, egalite = autres.filter((v) => v === prix).length, sur = autres.length + 1;
  const ord = rang === 1 ? '1re' : `${rang}e`;
  return { rang, sur, egalite, libelle: `${ord} moins chère sur ${sur}${egalite ? ` · à égalité avec ${egalite} ${egalite > 1 ? 'autres' : 'autre'}` : ''}` };
}
/** Position (0–100 %) d'un prix sur le rail de 50 $ au plafond. */
export function positionRail(prix: number, plafond: number): number {
  const { min, max } = bornesPrix(plafond); return max === min ? 0 : Math.max(0, Math.min(100, ((prix - min) / (max - min)) * 100));
}
/** Ce que la meilleure demande dit du prix du vendeur : correspond (appariement possible) ou « X au-dessus de la meilleure demande ». */
export function lectureDemande(prix: number, meilleureDemande: number | undefined): { genre: 'aucune' | 'correspond' | 'attend'; ecart: number } {
  if (meilleureDemande === undefined) return { genre: 'aucune', ecart: 0 };
  return prix <= meilleureDemande ? { genre: 'correspond', ecart: arrondi(meilleureDemande - prix) } : { genre: 'attend', ecart: arrondi(prix - meilleureDemande) };
}

/* ---------- anonymat et ancienneté (données de démonstration) ---------- */
const hachage = (s: string): number => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
/** Le vendeur reste anonyme : « P-41 », stable pour un même compte. */
export const codeVendeur = (vendeurId: string): string => `P-${10 + (hachage(vendeurId) % 90)}`;
const AGES_MIN = [25, 60, 3 * 60, 4 * 60, 6 * 60, 20 * 60, 2 * 1440];
/** Ancienneté simulée d'une offre du monde de départ qui n'a pas d'horodatage (stable pour un même identifiant). */
export const ageDemo = (id: string): number => AGES_MIN[hachage(id) % AGES_MIN.length] * 60_000;
/** « il y a 25 min » · « il y a 3 h » · « hier, 21:10 » · « il y a 2 jours ». */
export function ilYA(age: number, quand: number, heureDe: (ms: number) => string): string {
  const min = Math.max(1, Math.round(age / 60_000));
  if (min < 60) return `il y a ${min} min`; if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  if (min < 2880) return `hier, ${heureDe(quand)}`; return `il y a ${Math.floor(min / 1440)} jours`;
}

/* ---------- carte de la soute ---------- */
export type GenreCase = 'U' | 'O' | 'B' | 'L';
const PREF: Record<'O' | 'B' | 'L', number[]> = { O: [2, 6, 9, 12, 17, 19, 22], B: [4, 14, 21], L: [7, 15, 20] };
/** Disposition des 24 emplacements : U = inclus utilisé, O = proposé, B = acheté en revente, L = libre chez la compagnie. Emplacements de la planche d'abord, puis premiers libres. */
export function disposition(proposes: number, achetes: number, libres: number = LIBRES_COMPAGNIE): GenreCase[] {
  const t: GenreCase[] = Array.from({ length: EMPLACEMENTS }, () => 'U');
  const o = Math.min(Math.max(0, proposes), EMPLACEMENTS), b = Math.min(Math.max(0, achetes), EMPLACEMENTS - o), l = Math.min(Math.max(0, libres), EMPLACEMENTS - o - b);
  const poser = (g: 'O' | 'B' | 'L', n: number) => { let k = 0; for (const i of [...PREF[g], ...t.keys()]) { if (k >= n) break; if (t[i] === 'U') { t[i] = g; k++; } } };
  poser('O', o); poser('B', b); poser('L', l); return t;
}
export const compterCases = (d: GenreCase[]): Record<GenreCase, number> => ({ U: d.filter((x) => x === 'U').length, O: d.filter((x) => x === 'O').length, B: d.filter((x) => x === 'B').length, L: d.filter((x) => x === 'L').length });
/** Code d'emplacement : AV-1 … AV-12 (avant), AR-1 … AR-12 (arrière). */
export const codeCase = (i: number): string => `${i < EMPLACEMENTS / 2 ? 'AV' : 'AR'}-${(i % (EMPLACEMENTS / 2)) + 1}`;
/** Position d'une case sur le schéma (px, 4 colonnes, soute avant puis arrière). */
export function positionCase(i: number): { gauche: number; haut: number } {
  const col = i % 4, ligne = Math.floor(i / 4); return { gauche: 81 + col * 48, haut: ligne < 3 ? 152 + ligne * 48 : 362 + (ligne - 3) * 48 };
}
/** Indices des cases d'un genre, dans l'ordre de la carte. */
export const casesDe = (d: GenreCase[], g: GenreCase): number[] => d.flatMap((x, i) => (x === g ? [i] : []));

/* ---------- transactions ---------- */
export interface VenteBagage { quand: number; prix: number }
export interface LigneTransaction { quand: number; prix: number; code: string; variation: number | null }
/** Dernières transactions (la plus récente en haut) : la variation compare au prix de la transaction précédente ; la première n'en a pas. */
export function transactions(ventes: VenteBagage[], codes: string[], max = 5): LigneTransaction[] {
  const chrono = [...ventes].sort((a, b) => a.quand - b.quand).map((v, i, l) => ({ quand: v.quand, prix: v.prix, code: codes[i] ?? '—', variation: i === 0 ? null : arrondi(v.prix - l[i - 1].prix) }));
  return chrono.reverse().slice(0, max);
}
/** « +7 $ » / « −12 $ » / « 0 $ » ; `null` : première transaction. */
export const libelleVariation = (v: number | null): string => (v === null ? '—' : v === 0 ? fmt(0) : v > 0 ? fmtSigne(v) : fmt(v));
