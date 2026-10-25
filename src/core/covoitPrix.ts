// Covoiturage : distances, aide au prix (fourchette conseillée), durée, commission affichée. Pur, testé.
import { VILLES } from './carte.ts';
import { COMMISSION, gainConducteur, PRIX_MAX, PRIX_MIN } from './covoit.ts';

/** Distances routières approximatives (km) entre les grandes villes du réseau. */
const DISTANCES: Record<string, number> = {
  'Douala|Yaoundé': 245, 'Bafoussam|Yaoundé': 295, 'Bafoussam|Douala': 235, 'Douala|Kribi': 150, 'Kribi|Yaoundé': 270,
  'Bamenda|Yaoundé': 365, 'Bamenda|Douala': 330, 'Bafoussam|Bamenda': 100, 'Bamenda|Kribi': 480, 'Bafoussam|Kribi': 380
};
const cle = (a: string, b: string) => [a, b].sort().join('|');
/** Distance en km entre deux villes : table connue, sinon estimée sur la carte du réseau, sinon 150 km. */
export function distanceKm(de: string, vers: string): number {
  const connue = DISTANCES[cle(de, vers)]; if (connue) return connue;
  const a = VILLES[de], b = VILLES[vers]; if (!a || !b) return 150;
  return Math.max(20, Math.round((Math.hypot(a.x - b.x, a.y - b.y) * 1.9) / 5) * 5);
}

export const TARIF_KM = { bas: 15, conseille: 18, haut: 21 } as const;
const arrondi = (n: number, pas: number) => Math.round(n / pas) * pas;
export interface ConseilPrix { bas: number; conseille: number; haut: number; pas: number; min: number; max: number }
/** Fourchette de prix par place conseillée selon la distance (≈ 15 à 21 F le km, arrondie à 500 F). */
export function conseilPrix(km: number): ConseilPrix {
  const borne = (v: number) => Math.max(PRIX_MIN, Math.min(PRIX_MAX, arrondi(v, 500)));
  const bas = borne(km * TARIF_KM.bas), conseille = Math.max(bas, borne(km * TARIF_KM.conseille)), haut = Math.max(conseille, borne(km * TARIF_KM.haut));
  return { bas, conseille, haut, pas: 500, min: PRIX_MIN, max: PRIX_MAX };
}
/** Covoiturage dans la ville : de 150 + 60 F/km à 250 + 110 F/km, arrondi à 50 F. */
export function conseilPrixVille(km: number): ConseilPrix {
  const borne = (v: number) => Math.max(200, arrondi(v, 50));
  const bas = borne(150 + 60 * km), haut = Math.max(bas, borne(250 + 110 * km)), conseille = Math.min(haut, Math.max(bas, borne((bas + haut) / 2)));
  return { bas, conseille, haut, pas: 50, min: 200, max: 3000 };
}
export type VerdictPrix = 'bas' | 'juste' | 'haut';
/** Où se situe le prix choisi par rapport à la fourchette ? */
export const verdictPrix = (prix: number, c: Pick<ConseilPrix, 'bas' | 'haut'>): VerdictPrix => (prix < c.bas ? 'bas' : prix > c.haut ? 'haut' : 'juste');
export const MESSAGE_VERDICT: Record<VerdictPrix, string> = {
  bas: 'Prix très attractif : ton trajet partira vite, mais tu gagnes moins.',
  juste: 'Bon prix : dans la fourchette conseillée pour cette distance.',
  haut: 'Prix élevé : moins de voyageurs risquent de réserver.'
};
/** Position (0 à 100 %) du prix sur une jauge allant de 0,6 × bas à 1,4 × haut, pour dessiner la fourchette. */
export function positionsJauge(prix: number, c: Pick<ConseilPrix, 'bas' | 'haut'>) {
  const min = c.bas * 0.6, max = c.haut * 1.4, p = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  return { debut: p(c.bas), fin: p(c.haut), curseur: p(prix) };
}

export interface Repartition { brut: number; commission: number; net: number; parPlace: number; pourcent: number }
/** Ce que paient les voyageurs, ce que prend AfriMove (10 %), ce que touche le conducteur. */
export function repartition(prix: number, places: number): Repartition {
  const brut = prix * places, net = gainConducteur(places, prix);
  return { brut, commission: brut - net, net, parPlace: gainConducteur(1, prix), pourcent: Math.round(COMMISSION * 100) };
}

/** Durée estimée en minutes : ~70 km/h entre villes, ~20 km/h en ville. */
export const dureeMin = (km: number, enVille = false) => Math.max(5, Math.round((km / (enVille ? 20 : 70)) * 60 / 5) * 5);
/** « 3 h 30 », « 45 min », « 4 h ». */
export function texteDuree(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
/** Heure d'arrivée estimée (« 10:00 »), `lendemain` si on passe minuit. */
export function heureArrivee(heure: string, minutes: number): { heure: string; lendemain: boolean } {
  const [h, m] = heure.split(':').map(Number), total = h * 60 + m + minutes, t = ((total % 1440) + 1440) % 1440;
  return { heure: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, lendemain: total >= 1440 };
}

// ------------------------------------------------------------------ dans la ville
export const QUARTIERS: Record<string, string[]> = {
  Yaoundé: ['Bastos', 'Mvan', 'Essos', 'Omnisports', 'Biyem-Assi', 'Mokolo', 'Nlongkak', 'Melen', 'Ekounou', 'Mvog-Mbi'],
  Douala: ['Akwa', 'Bonanjo', 'Bonapriso', 'Deido', 'Bonabéri', 'Makepe', 'Kotto', 'Ndokotti', 'Logpom', 'Bepanda']
};
export const villeDuQuartier = (q: string): string | undefined => Object.keys(QUARTIERS).find((v) => QUARTIERS[v].includes(q));
const hachage = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Distance estimée (3 à 12 km) entre deux quartiers : stable pour un même couple, sans dépendre de l'ordre. */
export const distanceVilleKm = (a: string, b: string) => 3 + (hachage(cle(a, b)) % 10);
