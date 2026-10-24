// Carte du réseau : positions des villes sur la carte en relief, position d'un bus sur son axe, état d'une ligne. Pur.
export interface Point { x: number; y: number }
/** Coordonnées dans le repère de la carte (360 × 240). */
export const VILLES: Record<string, Point> = {
  Yaoundé: { x: 225, y: 118 }, Douala: { x: 105, y: 165 }, Bafoussam: { x: 160, y: 55 }, Bamenda: { x: 78, y: 78 }, Kribi: { x: 295, y: 182 }
};
export const AXES_CARTE: [string, string][] = [['Yaoundé', 'Douala'], ['Yaoundé', 'Bafoussam'], ['Yaoundé', 'Bamenda'], ['Douala', 'Kribi']];
/** Point à la part `avancement` (0 à 1) de la droite entre deux villes ; null si une ville est inconnue.
 *  `voie` = 1 décale le bus de 7 unités à droite du sens de marche : les deux sens d'une même route ne se superposent plus. */
export function positionBus(de: string, vers: string, avancement: number, voie = 0): Point | null {
  const a = VILLES[de], b = VILLES[vers]; if (!a || !b) return null;
  const t = Math.max(0, Math.min(1, avancement)), dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * t - (dy / n) * 7 * voie, y: a.y + dy * t + (dx / n) * 7 * voie };
}
/** Écarte les points trop proches (distance mini `d`) par quelques passes de répulsion, de façon déterministe ; garde l'ordre. */
export function ecarter(points: Point[], d = 26): Point[] {
  const p = points.map((q) => ({ ...q }));
  for (let passe = 0; passe < 40; passe++) {
    let bouge = false;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      let dx = p[j].x - p[i].x, dy = p[j].y - p[i].y, dist = Math.hypot(dx, dy);
      if (dist >= d) continue;
      if (dist < 0.01) { dx = Math.cos(i + j * 2.4); dy = Math.sin(i + j * 2.4); dist = 1; }
      const k = (d - dist) / 2 / dist; p[i].x -= dx * k; p[i].y -= dy * k; p[j].x += dx * k; p[j].y += dy * k; bouge = true;
    }
    if (!bouge) break;
  }
  return p;
}
export type EtatLigne = 'fluide' | 'charge' | 'perturbe';
/** Perturbée dès qu'un départ du jour est retardé ou annulé ; chargée au-delà de 90 % de remplissage. */
export function etatLigne(i: { retardes: number; annules: number; remplissageMax: number }): EtatLigne {
  if (i.retardes > 0 || i.annules > 0) return 'perturbe';
  return i.remplissageMax > 0.9 ? 'charge' : 'fluide';
}
export const TON_LIGNE: Record<EtatLigne, 'ok' | 'wa' | 'inf'> = { fluide: 'ok', perturbe: 'wa', charge: 'inf' };
export const NOM_LIGNE: Record<EtatLigne, string> = { fluide: 'fluide', perturbe: 'perturbé', charge: 'chargé' };

// ---- route d'un bus sur « Mon bus en relief » (courbe dans le repère 360 × 240)
const COURBE: Point[][] = [
  [{ x: 34, y: 205 }, { x: 110, y: 175 }, { x: 130, y: 100 }, { x: 190, y: 92 }],
  [{ x: 190, y: 92 }, { x: 250, y: 84 }, { x: 300, y: 75 }, { x: 335, y: 34 }]
];
/** Tracé SVG de la route (deux courbes de Bézier raccordées). */
export const TRACE_ROUTE = 'M34 205 C 110 175, 130 100, 190 92 S 300 75, 335 34';
const bez = (p: Point[], t: number): Point => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y };
};
const ECHANTILLONS: { f: number; p: Point }[] = (() => {
  const pts: Point[] = []; for (const seg of COURBE) for (let i = 0; i <= 40; i++) pts.push(bez(seg, i / 40));
  let total = 0; const cum = pts.map((p, i) => (i ? (total += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)) : 0));
  return pts.map((p, i) => ({ f: cum[i] / total, p }));
})();
/** Point de la route à la part `fraction` (0 à 1) de sa longueur. */
export function pointSurRoute(fraction: number): Point {
  const f = Math.max(0, Math.min(1, fraction)), i = ECHANTILLONS.findIndex((e) => e.f >= f);
  if (i <= 0) return ECHANTILLONS[0].p; const a = ECHANTILLONS[i - 1], b = ECHANTILLONS[i], k = (f - a.f) / (b.f - a.f || 1);
  return { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k };
}
