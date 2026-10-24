// Photo du bordereau de dépôt : réduite en miniature JPEG pour tenir dans le stockage local du téléphone.
export const TAILLE_MAX_PHOTO = 480;

/** Taille de la miniature (le grand côté ne dépasse pas `max`, jamais d'agrandissement). */
export function tailleReduite(largeur: number, hauteur: number, max = TAILLE_MAX_PHOTO): { l: number; h: number } {
  const k = Math.min(1, max / Math.max(largeur, hauteur, 1)); return { l: Math.max(1, Math.round(largeur * k)), h: Math.max(1, Math.round(hauteur * k)) };
}
/** Lit une image choisie ou prise par l'agent et la rend en data URL JPEG réduite. */
export async function reduirePhoto(fichier: File): Promise<string> {
  if (!fichier.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image');
  const bitmap = await createImageBitmap(fichier), { l, h } = tailleReduite(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas'); canvas.width = l; canvas.height = h;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image illisible');
  ctx.drawImage(bitmap, 0, 0, l, h); bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.6);
}
