// Fenêtre de filtres de l'accueil : fonctions pures qui complètent `core/recherche.ts` et `etat.ts` (sans les modifier).
import { filtresVides, filtrer, nbFiltres, PRIX_MAX_FILTRE, sansPlafond, TRIS, type Filtres, type Genre, type Offre } from '../../core/recherche.ts';
import { fmtF } from '../../core/tarif.ts';
import type { Tri } from '../../core/tranches.ts';

export const TRI_PAR_DEFAUT: Tri = 'heure';
export const GENRES: { id: Genre; nom: string }[] = [{ id: 'tout', nom: 'Tout' }, { id: 'bus', nom: 'Bus' }, { id: 'covoit', nom: 'Covoit' }];
export { TRIS };

/** Ajoute la valeur à la liste, ou la retire si elle y est. */
export const basculer = <T,>(liste: readonly T[], v: T): T[] => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);

/** Réglages de la fenêtre : filtres + type + tri. */
export interface Reglages extends Filtres { tri: Tri }
/** Nombre de réglages qui s'écartent de la valeur par défaut (prix, heures, compagnies, confort, type, tri) : pilote le bouton « Effacer » et le badge de l'accueil. */
export const nbReglages = (r: Reglages): number => nbFiltres(r) + (r.genre === 'tout' ? 0 : 1) + (r.tri === TRI_PAR_DEFAUT ? 0 : 1);
/** Remet tous les réglages d'origine (type et tri compris). */
export function toutEffacer(r: Reglages): void { Object.assign(r, { ...filtresVides(), tri: TRI_PAR_DEFAUT }); }

/** Libellé du plafond de prix. */
export const libellePrix = (prixMax: number | null): string => (prixMax === null || sansPlafond(prixMax) ? 'Sans limite' : fmtF(prixMax));
/** Valeur du curseur : à fond = sans plafond (`null`). */
export const prixDuCurseur = (valeur: number): number | null => (sansPlafond(valeur) ? null : valeur);
export const valeurCurseur = (prixMax: number | null): number => prixMax ?? PRIX_MAX_FILTRE;

/** Vrai nombre de départs qui passent les réglages (en direct). */
export const compterDeparts = (base: Offre[], f: Filtres): number => filtrer(base, f).length;
/** Texte du bouton principal : « Voir 6 départs », « Voir 1 départ », ou l'invitation à élargir. */
export const libelleVoir = (n: number): string => (n === 0 ? 'Aucun départ · élargis les filtres' : `Voir ${n} départ${n > 1 ? 's' : ''}`);
