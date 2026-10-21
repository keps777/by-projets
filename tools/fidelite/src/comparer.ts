import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type Comparaison = {
  largeur: number;
  hauteur: number;
  pixelsTotal: number;
  pixelsDifferents: number;
  /** Part des pixels différents, en %, arrondie à 0,01. */
  pourcentage: number;
  diff: Buffer;
};

/**
 * Compare deux PNG. Si leurs tailles diffèrent (ne devrait pas arriver : même viewport), la
 * plus petite est complétée en rose vif pour que l'écart soit compté et visible, jamais ignoré.
 * `tolerance` est le seuil de couleur de pixelmatch (0 strict … 1 laxiste), pas le seuil de réussite.
 */
export function comparer(a: Buffer, b: Buffer, tolerance = 0.1): Comparaison {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  const largeur = Math.max(A.width, B.width);
  const hauteur = Math.max(A.height, B.height);
  const pa = completer(A, largeur, hauteur);
  const pb = completer(B, largeur, hauteur);
  const sortie = new PNG({ width: largeur, height: hauteur });
  const pixelsDifferents = pixelmatch(pa.data, pb.data, sortie.data, largeur, hauteur, {
    threshold: tolerance,
    includeAA: false,
    alpha: 0.25,
    diffColor: [255, 0, 90],
  });
  const pixelsTotal = largeur * hauteur;
  return {
    largeur,
    hauteur,
    pixelsTotal,
    pixelsDifferents,
    pourcentage: Math.round((pixelsDifferents / pixelsTotal) * 10000) / 100,
    diff: PNG.sync.write(sortie),
  };
}

function completer(p: PNG, largeur: number, hauteur: number): PNG {
  if (p.width === largeur && p.height === hauteur) return p;
  const out = new PNG({ width: largeur, height: hauteur });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 0;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  PNG.bitblt(p, out, 0, 0, p.width, p.height, 0, 0);
  return out;
}
