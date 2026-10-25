// Carrousel cylindrique du panorama : géométrie pure (angle d'une tranche → position, rotation, profondeur, échelle, opacité, flou). Aucun accès au DOM.
// Convention : `rot` est l'angle de l'anneau en degrés (45° par tranche, comme `trancheDevant`) ; la tranche `i` est à l'angle relatif `i·45 + rot`
// de la face (0 = en face, > 0 = à droite, tournée vers l'arrière, ±180 = tout au fond).

export const PAS_TRANCHE = 45;

/** Forme de l'anneau. L'anneau est plus profond que large (`rz` > `rx`) pour que les voisines passent derrière la tranche de face au lieu de la traverser. */
export interface Geometrie {
  /** Demi-largeur de l'anneau (px) : écart horizontal d'une tranche à 90°. */ rx: number;
  /** Profondeur de l'anneau (px) : recul d'une tranche à 90°. */ rz: number;
  /** Les cartes se tournent de `torsion` × leur angle (> 1 : plus de biais que sur un cylindre strict). */ torsion: number;
  /** Avancée de la tranche de face hors du cylindre (px). */ avance: number;
  /** Les tranches du fond remontent de `levee` px (on voit l'arrière de l'anneau dépasser). */ levee: number;
}
export const GEOMETRIE: Geometrie = { rx: 268, rz: 380, torsion: 1.3, avance: 30, levee: 34 };

export interface Pose {
  /** Angle relatif à la face, dans ]−180, 180]. */ angle: number;
  x: number; y: number; z: number;
  /** Rotation Y de la carte (degrés). */ rotation: number;
  /** Carte vue de dos : on la retourne de 180° pour que le texte reste à l'endroit (verre vu par l'arrière). */ envers: boolean;
  echelle: number; opacite: number; luminosite: number; flou: number;
  /** 0 en face, 1 tout au fond. */ profondeur: number;
  /** La carte reçoit les clics : face et voisines immédiates seulement. */ interactive: boolean;
}

/** Ramène un angle dans ]−180, 180]. */
export function normaliser(a: number): number {
  const m = ((a % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}
/** Angle d'une tranche par rapport à la face quand l'anneau est tourné de `rot`. */
export const angleRelatif = (index: number, rot: number, pas = PAS_TRANCHE): number => normaliser(index * pas + rot);

/** Interpolation linéaire dans une table [[x, y], …] (x croissants), bornée aux extrémités. */
export function courbe(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) { const [x0, y0] = points[i - 1]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return points[points.length - 1][1];
}
// Valeurs selon |angle| : 0° face, 45° voisine, 90° de profil, 135° et 180° au fond.
const OPACITE = [[0, 1], [45, 0.97], [90, 0.8], [135, 0.55], [180, 0.4]] as const;
const LUMINOSITE = [[0, 1], [45, 0.8], [90, 0.6], [135, 0.45], [180, 0.36]] as const;
const FLOU = [[0, 0], [20, 0], [45, 1], [90, 2.4], [135, 3.4], [180, 4]] as const;
const ECHELLE = [[0, 1], [45, 0.92], [90, 0.82], [135, 0.74], [180, 0.7]] as const;

/** Rotation Y de la carte : `torsion` × l'angle jusqu'à 90°, puis rejoint 180° au fond (la courbe reste continue). */
export function rotationCarte(angle: number, torsion: number): number {
  const a = Math.abs(angle), s = Math.sign(angle);
  const r = a <= 90 ? a * torsion : 90 * torsion + ((a - 90) * (180 - 90 * torsion)) / 90;
  return s * r;
}

/** Pose d'une tranche à l'angle relatif `angle` (degrés). */
export function poseTranche(angle: number, g: Geometrie = GEOMETRIE): Pose {
  const a = normaliser(angle), abs = Math.abs(a), rad = (a * Math.PI) / 180;
  const rotation = rotationCarte(a, g.torsion);
  const profondeur = (1 - Math.cos(rad)) / 2;
  const avance = g.avance * Math.max(0, 1 - abs / 40);
  return {
    angle: a,
    x: g.rx * Math.sin(rad),
    y: 0 - g.levee * profondeur,
    z: g.rz * (Math.cos(rad) - 1) + avance,
    rotation, envers: Math.abs(rotation) > 90,
    echelle: courbe(ECHELLE, abs), opacite: courbe(OPACITE, abs), luminosite: courbe(LUMINOSITE, abs), flou: courbe(FLOU, abs),
    profondeur, interactive: abs < 55
  };
}

const arrondi = (n: number, d = 2) => Number(n.toFixed(d));
/** Transformation CSS de la carte (à poser sur un élément de l'anneau en `transform-style: preserve-3d`). */
export function transformCarte(p: Pose): string {
  return `translate3d(${arrondi(p.x)}px, ${arrondi(p.y)}px, ${arrondi(p.z)}px) rotateY(${arrondi(p.rotation)}deg)${p.envers ? ' rotateY(180deg)' : ''} scale(${arrondi(p.echelle, 3)})`;
}
/** Filtre CSS de la carte : plus sombre et plus floue en s'éloignant (rien du tout pour la carte de face). */
export function filtreCarte(p: Pose): string {
  return p.luminosite >= 0.999 && p.flou <= 0.01 ? 'none' : `brightness(${arrondi(p.luminosite)})${p.flou > 0.01 ? ` blur(${arrondi(p.flou, 1)}px)` : ''}`;
}

// ---------------------------------------------------------------- aimantation et inertie
/** Tranche la plus proche (angle multiple de 45°). */
export const aimanter = (rot: number, pas = PAS_TRANCHE): number => Math.round(rot / pas) * pas;
/** Où l'anneau s'arrête après un lâcher : `vitesse` en °/ms au moment du lâcher, projetée sur `tau` ms puis plafonnée à ±`max` degrés, puis aimantée.
 *  Un geste quasi immédiat (< `dureeMin` ms) est une manipulation directe, sans élan. */
export function cibleInertie(rot: number, vitesse: number, dureeGeste: number, o: { tau?: number; max?: number; dureeMin?: number } = {}): number {
  const { tau = 170, max = 100, dureeMin = 70 } = o;
  if (dureeGeste < dureeMin || !Number.isFinite(vitesse)) return aimanter(rot);
  return aimanter(rot + Math.max(-max, Math.min(max, vitesse * tau)));
}
/** Glissement progressif 0 → 1 avec léger dépassement final (effet d'aimant) ; vaut 1 en 1. */
export function adoucir(k: number, depassement = 1.1): number {
  const t = Math.max(0, Math.min(1, k)) - 1, c3 = depassement + 1;
  return 1 + c3 * t * t * t + depassement * t * t;
}
/** Durée (ms) du recalage selon la distance à parcourir (degrés). */
export const dureeRecalage = (distance: number): number => Math.round(Math.min(900, 360 + Math.abs(distance) * 3.4));
