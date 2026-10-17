/**
 * Image monochrome : une ligne = `octetsParLigne` octets, bit de poids fort à gauche, 1 = point noir.
 * C'est exactement le format attendu par GS v 0.
 */
export interface Bitmap {
  largeur: number;
  hauteur: number;
  octetsParLigne: number;
  donnees: Uint8Array;
}

/** Bitmap vide (blanc) de la taille donnée. */
export function bitmapVide(largeur: number, hauteur: number): Bitmap {
  const octetsParLigne = Math.ceil(largeur / 8);
  return { largeur, hauteur, octetsParLigne, donnees: new Uint8Array(octetsParLigne * hauteur) };
}

/** Allume le point (x, y) ; hors de l'image, ne fait rien. */
export function poserPoint(image: Bitmap, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= image.largeur || y >= image.hauteur) return;
  const i = y * image.octetsParLigne + (x >> 3);
  image.donnees[i] = (image.donnees[i] ?? 0) | (0x80 >> (x & 7));
}

/** Lit le point (x, y) ; hors de l'image : blanc. */
export function lirePoint(image: Bitmap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= image.largeur || y >= image.hauteur) return false;
  return (((image.donnees[y * image.octetsParLigne + (x >> 3)] ?? 0) << (x & 7)) & 0x80) !== 0;
}

/** Bitmap dessiné par une fonction « ce point est-il noir ? ». */
export function bitmapDepuis(
  largeur: number,
  hauteur: number,
  estNoir: (x: number, y: number) => boolean,
): Bitmap {
  const image = bitmapVide(largeur, hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      if (estNoir(x, y)) poserPoint(image, x, y);
    }
  }
  return image;
}

/** Dessin en caractères (« # » = noir) : pratique pour relire un bitmap dans un test. */
export function bitmapEnTexte(image: Bitmap): string {
  const lignes: string[] = [];
  for (let y = 0; y < image.hauteur; y += 1) {
    let ligne = "";
    for (let x = 0; x < image.largeur; x += 1) ligne += lirePoint(image, x, y) ? "#" : ".";
    lignes.push(ligne);
  }
  return lignes.join("\n");
}
