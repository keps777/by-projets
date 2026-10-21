/** Géométrie sur le globe : distances et position d'un point le long d'une ligne d'arrêts. */

export interface Point {
  latitude: number;
  longitude: number;
}

const RAYON_TERRE_KM = 6371.0088;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (haversine), en kilomètres. */
export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const distanceM = (a: Point, b: Point): number => distanceKm(a, b) * 1000;

export interface ProjectionSegment {
  /** Position du point projeté sur le segment, de 0 (début) à 1 (fin). */
  fraction: number;
  /** Distance entre le point et le segment, en kilomètres. */
  ecartKm: number;
}

/**
 * Projette `p` sur le segment [a, b]. Le calcul se fait dans un plan local centré sur `a`
 * (projection équirectangulaire) : l'erreur reste négligeable sur les quelques centaines de
 * kilomètres d'une ligne de bus.
 */
export function projeterSurSegment(p: Point, a: Point, b: Point): ProjectionSegment {
  const cos = Math.cos(rad(a.latitude));
  const x = (q: Point): number => rad(q.longitude - a.longitude) * cos * RAYON_TERRE_KM;
  const y = (q: Point): number => rad(q.latitude - a.latitude) * RAYON_TERRE_KM;
  const bx = x(b);
  const by = y(b);
  const px = x(p);
  const py = y(p);
  const longueur2 = bx * bx + by * by;
  const fraction = longueur2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / longueur2));
  const ex = px - fraction * bx;
  const ey = py - fraction * by;
  return { fraction, ecartKm: Math.hypot(ex, ey) };
}

export interface ArretGeo extends Point {
  kmDepuisOrigine: number;
}

export interface PositionSurLigne {
  /** Kilomètres depuis l'origine, par la route. */
  progressionKm: number;
  /** Distance au point le plus proche de la ligne. */
  ecartKm: number;
  /** Numéro du segment (entre l'arrêt `segment` et le suivant). */
  segment: number;
}

/**
 * Où se trouve `p` sur la ligne : le segment le plus proche, puis les kilomètres de route
 * (la fraction du segment est appliquée à la distance par la route entre les deux arrêts, plus
 * juste que la distance à vol d'oiseau). Une ligne a au moins deux arrêts.
 */
export function positionSurLigne(p: Point, arrets: readonly ArretGeo[]): PositionSurLigne {
  let meilleur: PositionSurLigne | null = null;
  for (let i = 0; i < arrets.length - 1; i++) {
    const a = arrets[i] as ArretGeo;
    const b = arrets[i + 1] as ArretGeo;
    const proj = projeterSurSegment(p, a, b);
    if (meilleur === null || proj.ecartKm < meilleur.ecartKm) {
      meilleur = {
        progressionKm: a.kmDepuisOrigine + proj.fraction * (b.kmDepuisOrigine - a.kmDepuisOrigine),
        ecartKm: proj.ecartKm,
        segment: i,
      };
    }
  }
  if (meilleur === null) throw new RangeError("Une ligne a au moins deux arrêts");
  return meilleur;
}
