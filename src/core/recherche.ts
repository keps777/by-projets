// Recherche du voyageur : offres (bus + covoiturages) d'un jour, filtres, créneaux horaires, calendrier des prix. Fonctions pures.
import type { Tri } from './tranches.ts';

export type Genre = 'tout' | 'bus' | 'covoit';
export type Creneau = 'Aube' | 'Matin' | 'Après-midi' | 'Nuit';
export const NOMS_CRENEAUX: Creneau[] = ['Aube', 'Matin', 'Après-midi', 'Nuit'];
export const OPTIONS_CONFORT = ['Climatisation', 'Prise USB', 'VIP 3 sièges', 'Wi-Fi à bord'] as const;
export const PRIX_MIN_FILTRE = 5000;
export const PRIX_MAX_FILTRE = 15000;
export const PAS_PRIX = 500;

/** Une offre affichée dans le panorama : un départ de bus ou un covoiturage, avec le prix déjà calculé (prix dynamique compris). */
export interface Offre {
  id: string; genre: 'bus' | 'cv'; heure: string; retardMin: number;
  /** Sigle de la pastille (BX, MK…). */ ab: string; /** Nom de la compagnie ou du conducteur. */ co: string; col: string;
  /** Classe du bus ou véhicule du covoiturage. */ cl: string; /** Gare ou lieu de départ. */ gare: string;
  prix: number; prixBase: number; dureeMin: number; places: number; cap: number; vip: boolean;
  compagnieId?: string; departId?: string; covoitId?: string; confort: string[]; complet: boolean;
}
export interface Filtres { genre: Genre; prixMax: number | null; creneaux: Creneau[]; compagnies: string[]; confort: string[] }
export const filtresVides = (): Filtres => ({ genre: 'tout', prixMax: null, creneaux: [], compagnies: [], confort: [] });

const minutesDe = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
/** Aube 04–08 h, Matin 08–12 h, Après-midi 12–21 h, Nuit 21–04 h. */
export function creneauDe(heure: string): Creneau {
  const m = minutesDe(heure);
  return m >= 240 && m < 480 ? 'Aube' : m >= 480 && m < 720 ? 'Matin' : m >= 720 && m < 1260 ? 'Après-midi' : 'Nuit';
}
/** Équipements d'un véhicule : le Classique est climatisé, le VIP a tout ; un covoiturage est climatisé. */
export function confortDe(classe: string): string[] {
  return classe === 'VIP' ? [...OPTIONS_CONFORT] : ['Climatisation'];
}
export function filtrer(offres: Offre[], f: Filtres): Offre[] {
  return offres.filter((o) =>
    (f.genre === 'tout' || (f.genre === 'bus' ? o.genre === 'bus' : o.genre === 'cv'))
    && (f.prixMax === null || o.prix <= f.prixMax)
    && (f.creneaux.length === 0 || f.creneaux.includes(creneauDe(o.heure)))
    && (f.compagnies.length === 0 || (o.genre === 'bus' && !!o.compagnieId && f.compagnies.includes(o.compagnieId)))
    && f.confort.every((c) => o.confort.includes(c)));
}
/** Nombre de réglages actifs (le type bus/covoit n'est pas compté : il a son propre sélecteur). */
export const nbFiltres = (f: Filtres) => (f.prixMax === null ? 0 : 1) + f.creneaux.length + f.compagnies.length + f.confort.length;
export const sansPlafond = (prix: number) => prix >= PRIX_MAX_FILTRE;

/** Ordre de tri et vue persistés avec la recherche. */
export type Vue = '3d' | 'liste';
export const TRIS: { id: Tri; nom: string }[] = [{ id: 'heure', nom: 'Heure' }, { id: 'prix', nom: 'Prix' }, { id: 'places', nom: 'Places' }, { id: 'confort', nom: 'Confort' }];

// ---------------------------------------------------------------- calendrier des prix
/** Grille d'un mois : décalage du 1er (lundi = 0) et nombre de jours. */
export function grilleMois(annee: number, mois0: number): { decalage: number; jours: number } {
  const premier = new Date(annee, mois0, 1, 12).getDay();
  return { decalage: (premier + 6) % 7, jours: new Date(annee, mois0 + 1, 0).getDate() };
}
/** Prix bas / fort d'un jour par rapport aux autres jours affichés : tiers inférieur et tiers supérieur de l'écart (rien en dessous de 1 000 F d'écart : ce serait du bruit). */
export const ECART_UTILE = 1000;
export function classePrix(prix: number, min: number, max: number): 'bas' | 'fort' | '' {
  if (max - min < ECART_UTILE) return '';
  const tiers = (max - min) / 3;
  return prix <= min + tiers ? 'bas' : prix >= max - tiers ? 'fort' : '';
}
/** « 7,5 k » → « 7,5k » : prix court d'une case du calendrier. */
export const prixCourt = (p: number) => `${(p / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k`;
/** Les `n` heures de départ les plus proches de l'heure souhaitée (sans doublon), rangées par heure. */
export function departsProches(souhait: string, heures: string[], n = 3): string[] {
  const s = minutesDe(souhait);
  return [...new Set(heures)].sort((a, b) => Math.abs(minutesDe(a) - s) - Math.abs(minutesDe(b) - s) || a.localeCompare(b)).slice(0, n).sort();
}
/** Heure « HH:MM » la plus proche parmi des offres (pour mettre en face le bon départ). */
export function plusProche<T extends { heure: string }>(items: T[], souhait: string): T | undefined {
  const s = minutesDe(souhait);
  return [...items].sort((a, b) => Math.abs(minutesDe(a.heure) - s) - Math.abs(minutesDe(b.heure) - s))[0];
}

/** Tranche de 3 h qui se trouve en face quand l'anneau est tourné de `rot` degrés (45° par tranche). */
export const trancheDevant = (rot: number, n = 8) => ((Math.round(-rot / 45) % n) + n) % n;
