// Flotte simulée de motos et de taxis connectés autour d'un lieu, et estimation de l'arrivée du plus proche. Pure et déterministe : même ville, même mode, même instant, même résultat.
import type { Mode } from './course.ts';
import type { PointLocal } from './lieux.ts';

export interface Conducteur { id: string; nom: string; mode: Mode; x: number; y: number; enLigne: boolean }
/** Conducteurs de la flotte (connectés ou non) dans une ville. */
export const TAILLE_FLOTTE: Record<Mode, number> = { moto: 36, taxi: 20 };
const RAYON_VILLE: Record<string, number> = { Yaoundé: 9, Douala: 10 };
const PRENOMS = ['Jean-Baptiste', 'Roger', 'Samuel', 'Brice', 'Hervé', 'Claude', 'Ibrahim', 'Patrick', 'Landry', 'Aristide', 'Moussa', 'Thierry', 'Eric', 'Gaston', 'Serge', 'Blaise'];
/** Vitesse moyenne en ville (km/h) : la moto se faufile, le taxi subit les embouteillages. */
export const VITESSE_KMH: Record<Mode, number> = { moto: 24, taxi: 16 };
/** Minutes ajoutées au temps d'approche : le conducteur finit sa course ou cherche l'adresse. */
export const MARGE_APPROCHE_MIN: Record<Mode, number> = { moto: 1, taxi: 2 };
/** Rayon (km) dans lequel un véhicule compte comme « à proximité ». */
export const RAYON_PROXIMITE_KM: Record<Mode, number> = { moto: 2.5, taxi: 3 };
/** Au-delà de ce temps d'approche (min), on considère qu'il n'y a personne de disponible. */
export const APPROCHE_MAX_MIN = 30;
const COEF_ROUTE = 1.3;

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function alea(graine: number): () => number { let a = graine; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** La flotte d'une ville à un instant : positions qui dérivent doucement (cycle de quelques minutes), environ trois conducteurs sur quatre connectés. */
export function flotte(ville: string, mode: Mode, instantMs: number): Conducteur[] {
  const t = Math.floor(instantMs / 30_000) * 30, rayon = RAYON_VILLE[ville] ?? 3, creneau = Math.floor(instantMs / 600_000);
  return Array.from({ length: TAILLE_FLOTTE[mode] }, (_, i) => {
    const id = `${ville}-${mode}-${i}`, r = alea(hash(id) + 977 * i), angle = r() * 2 * Math.PI, dist = Math.pow(r(), 0.8) * rayon, phase = r() * 2 * Math.PI, periode = 240 + r() * 360, amp = 0.5 + r() * 1.1;
    const x = Math.cos(angle) * dist + amp * Math.cos((2 * Math.PI * t) / periode + phase), y = Math.sin(angle) * dist + amp * Math.sin((2 * Math.PI * t * 1.3) / periode + phase);
    return { id, nom: PRENOMS[hash(`${id}|nom`) % PRENOMS.length], mode, x, y, enLigne: alea(hash(`${id}|${creneau}`))() < 0.75 };
  });
}

export interface EstimationArrivee {
  /** Véhicules connectés dans le rayon de proximité. */ proches: number; plusProche: Conducteur | null; distanceKm: number | null;
  /** Temps de route du plus proche jusqu'au lieu (min). */ approcheMin: number | null; /** Approche + marge : ce qu'on annonce (min). */ arriveeMin: number | null; disponible: boolean;
  libelleProche: string; libelleProches: string; libelleArrivee: string;
}
const NOM: Record<Mode, [string, string]> = { moto: ['moto', 'motos'], taxi: ['taxi', 'taxis'] };
export const distanceVol = (a: PointLocal, b: PointLocal) => Math.hypot(a.x - b.x, a.y - b.y);
/** Temps de route (min, au moins 1) pour parcourir `km` à vol d'oiseau. */
export const minutesApproche = (mode: Mode, km: number) => Math.max(1, Math.round(((km * COEF_ROUTE) / VITESSE_KMH[mode]) * 60));

/** Estime l'arrivée d'un véhicule au point `lieu` d'après les conducteurs connectés : temps d'approche du plus proche + marge. Ex. « Moto à 3 min » → « arrive dans ~4 min ». */
export function estimerArrivee(mode: Mode, lieu: PointLocal, conducteurs: Conducteur[]): EstimationArrivee {
  const libres = conducteurs.filter((c) => c.enLigne && c.mode === mode).map((c) => ({ c, d: distanceVol(c, lieu) })).sort((a, b) => a.d - b.d || a.c.id.localeCompare(b.c.id));
  const [un, plusieurs] = NOM[mode], proches = libres.filter((x) => x.d <= RAYON_PROXIMITE_KM[mode]).length, premier = libres[0];
  const maj = (s: string) => s[0].toUpperCase() + s.slice(1);
  const libelleProches = proches === 0 ? `Aucun${mode === 'moto' ? 'e' : ''} ${un} à proximité` : `${proches} ${proches > 1 ? plusieurs : un} à proximité`;
  if (!premier) return { proches: 0, plusProche: null, distanceKm: null, approcheMin: null, arriveeMin: null, disponible: false, libelleProche: `Aucun${mode === 'moto' ? 'e' : ''} ${un} connecté${mode === 'moto' ? 'e' : ''}`, libelleProches, libelleArrivee: 'Indisponible pour le moment' };
  const approcheMin = minutesApproche(mode, premier.d), arriveeMin = approcheMin + MARGE_APPROCHE_MIN[mode], disponible = approcheMin <= APPROCHE_MAX_MIN;
  return { proches, plusProche: premier.c, distanceKm: Math.round(premier.d * 10) / 10, approcheMin, arriveeMin, disponible, libelleProche: `${maj(un)} à ${approcheMin} min`, libelleProches, libelleArrivee: disponible ? `Arrive dans ~${arriveeMin} min` : 'Aucun véhicule assez proche' };
}
