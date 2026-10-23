// Import d'un justificatif (photo ou PDF) : contrôle, puis miniature JPEG de 200 px. Le fichier d'origine n'est pas conservé.
import { COTE_MINIATURE, MESSAGE_FICHIER, controlerFichier, dimensionsMiniature } from '../../core/miniature.ts';
import { maintenant } from '../../data/store.svelte.ts';
import type { Piece } from './etat.ts';

async function decoder(f: File): Promise<{ source: CanvasImageSource; l: number; h: number; liberer: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const b = await createImageBitmap(f);
    return { source: b, l: b.width, h: b.height, liberer: () => b.close() };
  }
  const url = URL.createObjectURL(f);
  const img = new Image();
  await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('image')); img.src = url; });
  return { source: img, l: img.naturalWidth, h: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) };
}
async function miniature(f: File): Promise<string> {
  if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(f.name)) return '';
  try {
    const { source, l, h, liberer } = await decoder(f);
    const d = dimensionsMiniature(l, h, COTE_MINIATURE);
    const toile = document.createElement('canvas'); toile.width = d.l; toile.height = d.h;
    toile.getContext('2d')?.drawImage(source, 0, 0, d.l, d.h);
    liberer();
    return toile.toDataURL('image/jpeg', 0.6);
  } catch { return ''; /* format que le navigateur ne sait pas lire (HEIC…) : la pièce est gardée sans aperçu */ }
}
/** Renvoie la pièce prête à ranger dans le dossier, ou le message d'erreur à afficher. */
export async function lirePiece(f: File): Promise<{ piece: Piece } | { erreur: string }> {
  const e = controlerFichier(f);
  if (e) return { erreur: MESSAGE_FICHIER[e] };
  return { piece: { nom: f.name || 'photo', taille: f.size, type: f.type || 'image/jpeg', miniature: await miniature(f), ajoute: maintenant() } };
}
