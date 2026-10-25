// Photos du profil conducteur : réduites en miniature (data URL JPEG) avant d'être gardées, pour ne pas gonfler le stockage.
export function tailleMiniature(l: number, h: number, max = 220): { l: number; h: number } {
  const k = Math.min(1, max / Math.max(l, h, 1)); return { l: Math.max(1, Math.round(l * k)), h: Math.max(1, Math.round(h * k)) };
}
export async function miniature(fichier: File, max = 220): Promise<string> {
  if (!fichier.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image');
  const bitmap = await createImageBitmap(fichier), { l, h } = tailleMiniature(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas'); canvas.width = l; canvas.height = h;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image illisible');
  ctx.drawImage(bitmap, 0, 0, l, h); bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.55);
}
