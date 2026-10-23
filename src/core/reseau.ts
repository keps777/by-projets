// Réseau de soins : tri par distance, projection sur un plan schématique, libellés. Fonctions pures.
import { distanceKm } from './sante.ts';

export type TypeLieu = 'clinique' | 'pharmacie' | 'laboratoire' | 'imagerie';
export interface Point { lat: number; lng: number }
export interface Lieu extends Point { id: string; nom: string; type: TypeLieu; quartier: string; sous: string; detail: string; telephone: string }
export interface LieuProche extends Lieu { km: number }

export const trierParDistance = (lieux: Lieu[], depuis: Point): LieuProche[] =>
  lieux.map((l) => ({ ...l, km: distanceKm(depuis, l) })).sort((a, b) => a.km - b.km);
/** « 1,2 km » ; sous 100 m : « 80 m ». */
export const libelleKm = (km: number) => (km < 0.1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`);

export interface PointPlan { id: string; x: number; y: number }
/** Position (en %) de chaque lieu sur un plan centré sur `centre` ; le lieu le plus éloigné touche le bord (à 46 %). */
export function projeter(lieux: Lieu[], centre: Point): PointPlan[] {
  const kmParDegLat = 111.2, kmParDegLng = 111.2 * Math.cos((centre.lat * Math.PI) / 180);
  const brut = lieux.map((l) => ({ id: l.id, dx: (l.lng - centre.lng) * kmParDegLng, dy: (l.lat - centre.lat) * kmParDegLat }));
  const echelle = Math.max(1, ...brut.map((p) => Math.hypot(p.dx, p.dy)));
  return brut.map((p) => ({ id: p.id, x: 50 + (p.dx / echelle) * 46, y: 50 - (p.dy / echelle) * 46 }));
}
