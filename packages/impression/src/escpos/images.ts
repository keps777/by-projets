import { create } from "qrcode";
import { bitmapDepuis, type Bitmap } from "./bitmap";

export interface OptionsQr {
  /** Côté visé du symbole, en points (3 cm à 203 dpi : 240). La zone de silence vient en plus. */
  cotePoints: number;
  /** Zone de silence, en modules. */
  silence?: number;
}

/**
 * QR code en image monochrome. Chaque module est un carré entier de points (jamais de flou), le plus grand
 * qui tienne dans `cotePoints` : 29 modules (version 3) donnent 8 points par module, 232 points, soit 29 mm.
 */
export function bitmapQr(contenu: string, options: OptionsQr): Bitmap {
  const { cotePoints, silence = 2 } = options;
  const qr = create(contenu, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const module = Math.max(2, Math.floor(cotePoints / n));
  const cote = (n + 2 * silence) * module;
  return bitmapDepuis(cote, cote, (x, y) => {
    const colonne = Math.floor(x / module) - silence;
    const ligne = Math.floor(y / module) - silence;
    if (colonne < 0 || ligne < 0 || colonne >= n || ligne >= n) return false;
    return qr.modules.get(ligne, colonne) === 1;
  });
}

/** Dimension (en modules) du QR code de ce contenu. */
export function modulesQr(contenu: string): number {
  return create(contenu, { errorCorrectionLevel: "M" }).modules.size;
}

/** Point dans un rectangle aux coins arrondis. */
function dansRectangleArrondi(
  x: number,
  y: number,
  rx: number,
  ry: number,
  l: number,
  h: number,
  rayon: number,
): boolean {
  if (x < rx || y < ry || x > rx + l || y > ry + h) return false;
  const cx = x < rx + rayon ? rx + rayon : x > rx + l - rayon ? rx + l - rayon : x;
  const cy = y < ry + rayon ? ry + rayon : y > ry + h - rayon ? ry + h - rayon : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= rayon ** 2;
}

/** Contour du « A » du logo (viewBox 72 × 72 de la maquette). */
const LETTRE_A: ReadonlyArray<readonly [number, number]> = [
  [36, 18],
  [50, 56],
  [42, 56],
  [36, 38],
  [30, 56],
  [22, 56],
];

function dansPolygone(x: number, y: number, sommets: ReadonlyArray<readonly [number, number]>) {
  let dedans = false;
  for (let i = 0, j = sommets.length - 1; i < sommets.length; j = i, i += 1) {
    const a = sommets[i];
    const b = sommets[j];
    if (!a || !b) continue;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/**
 * Logo AfriMove en noir et blanc, redessiné d'après le SVG de la maquette (CadenceBillet) : carré arrondi
 * noir, tuile haute blanche, tuile basse en grisé (la teinte #BBBBBB devient une trame de points), « A » noir.
 */
export function bitmapLogo(cote = 48): Bitmap {
  const echelle = 72 / cote;
  return bitmapDepuis(cote, cote, (px, py) => {
    const x = (px + 0.5) * echelle;
    const y = (py + 0.5) * echelle;
    if (!dansRectangleArrondi(x, y, 0, 0, 72, 72, 20)) return false;
    if (dansPolygone(x, y, LETTRE_A)) return true;
    if (dansRectangleArrondi(x, y, 12, 12, 48, 23, 6)) return false;
    if (dansRectangleArrondi(x, y, 12, 37, 48, 23, 6)) return px % 2 === 0 && py % 2 === 0;
    return true;
  });
}
