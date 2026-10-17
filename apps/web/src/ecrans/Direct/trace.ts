/**
 * Tracé de la carte de « Mon bus en direct » (docs/maquettes-v3/Direct.dc.html). Les contrats ne portent pas la
 * géométrie de la ligne : la carte est un schéma, le même pour toutes les lignes, dessiné comme dans la maquette.
 * Ce module fournit le tracé, le point à une fraction du trajet et la place de chaque ville.
 */

export interface Point {
  x: number;
  y: number;
}

/** Route entière, de la première à la dernière ville (le gris épais de la maquette). */
export const TRACE_ROUTE = "M40 300 C 90 290, 120 250, 165 235 S 250 160, 300 120 S 340 70, 352 52";

type Courbe = readonly [Point, Point, Point, Point];

/** Les trois courbes de `TRACE_ROUTE` (le premier point de contrôle d'un `S` est le symétrique du précédent). */
const COURBES: readonly Courbe[] = [
  [
    { x: 40, y: 300 },
    { x: 90, y: 290 },
    { x: 120, y: 250 },
    { x: 165, y: 235 },
  ],
  [
    { x: 165, y: 235 },
    { x: 210, y: 220 },
    { x: 250, y: 160 },
    { x: 300, y: 120 },
  ],
  [
    { x: 300, y: 120 },
    { x: 350, y: 80 },
    { x: 340, y: 70 },
    { x: 352, y: 52 },
  ],
];

const PAS_PAR_COURBE = 48;

function bezier([p0, p1, p2, p3]: Courbe, t: number): Point {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Points du tracé échantillonnés, avec la longueur cumulée, et rang de chaque jonction entre courbes. */
const ECHANTILLONS: Array<{ point: Point; longueur: number }> = [];
const JONCTIONS: number[] = [];
(() => {
  let longueur = 0;
  COURBES.forEach((courbe, rang) => {
    for (let i = rang === 0 ? 0 : 1; i <= PAS_PAR_COURBE; i++) {
      const point = bezier(courbe, i / PAS_PAR_COURBE);
      const precedent = ECHANTILLONS[ECHANTILLONS.length - 1];
      if (precedent) {
        longueur += Math.hypot(point.x - precedent.point.x, point.y - precedent.point.y);
      }
      ECHANTILLONS.push({ point, longueur });
    }
    JONCTIONS.push(ECHANTILLONS.length - 1);
  });
})();

const LONGUEUR = ECHANTILLONS[ECHANTILLONS.length - 1]!.longueur;

/** Point du tracé à la fraction `u` (0 = première ville, 1 = dernière) de sa longueur. */
export function pointSurTrace(u: number): Point {
  const cible = Math.min(1, Math.max(0, u)) * LONGUEUR;
  for (let i = 1; i < ECHANTILLONS.length; i++) {
    const fin = ECHANTILLONS[i]!;
    if (fin.longueur >= cible) {
      const debut = ECHANTILLONS[i - 1]!;
      const ecart = fin.longueur - debut.longueur;
      const k = ecart === 0 ? 0 : (cible - debut.longueur) / ecart;
      return {
        x: debut.point.x + (fin.point.x - debut.point.x) * k,
        y: debut.point.y + (fin.point.y - debut.point.y) * k,
      };
    }
  }
  return ECHANTILLONS[ECHANTILLONS.length - 1]!.point;
}

/** Fraction de la longueur où la route passe par le premier nœud intermédiaire (Edéa dans la maquette). */
const FRACTION_NOEUD = ECHANTILLONS[JONCTIONS[0]!]!.longueur / LONGUEUR;

/**
 * Fraction du tracé où se place chaque ville : la première au départ, la dernière à l'arrivée ; avec trois villes
 * celle du milieu est sur le nœud de la route (la maquette), sinon elles sont régulièrement espacées.
 */
export function fractionsVilles(nombre: number): number[] {
  if (nombre <= 0) return [];
  if (nombre === 1) return [0];
  if (nombre === 3) return [0, FRACTION_NOEUD, 1];
  return Array.from({ length: nombre }, (_, i) => i / (nombre - 1));
}

/**
 * Où se trouve le bus sur le tracé, de 0 (au départ) à 1 (arrivé), d'après les arrêts du trajet : à la hauteur du
 * prochain arrêt, répartis régulièrement sur la route. Sans prochain arrêt, au dernier arrêt passé.
 */
export function progressionBus(statuts: ReadonlyArray<"passe" | "prochain" | "a_venir">): number {
  const n = statuts.length;
  if (n < 2) return 0;
  const prochain = statuts.indexOf("prochain");
  if (prochain >= 0) return prochain / (n - 1);
  const dernierPasse = statuts.lastIndexOf("passe");
  return dernierPasse < 0 ? 0 : dernierPasse / (n - 1);
}

/** Arrondi à 0,1 px pour les attributs du SVG. */
export function px(valeur: number): number {
  return Math.round(valeur * 10) / 10;
}
