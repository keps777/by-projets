// Justificatifs : contrôle des fichiers importés et taille des miniatures gardées dans l'état (le fichier lui-même n'est jamais conservé).
export const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;
export const COTE_MINIATURE = 200;
export const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

export type ErreurFichier = 'type' | 'taille' | 'vide' | null;
export function controlerFichier(f: { type: string; size: number; name?: string }): ErreurFichier {
  if (f.size <= 0) return 'vide';
  if (f.size > TAILLE_MAX_FICHIER) return 'taille';
  const type = f.type || (f.name && /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(f.name) ? 'ok' : '');
  return type === 'ok' || TYPES_ACCEPTES.includes(type) ? null : 'type';
}
export const MESSAGE_FICHIER: Record<Exclude<ErreurFichier, null>, string> = {
  type: 'Format non accepté : choisissez une photo (JPEG, PNG) ou un PDF.',
  taille: 'Fichier trop lourd : 10 Mo au maximum.',
  vide: 'Ce fichier est vide.'
};
/** Dimensions d'une miniature dont le grand côté vaut `cote` (jamais agrandie). */
export function dimensionsMiniature(largeur: number, hauteur: number, cote = COTE_MINIATURE): { l: number; h: number } {
  if (largeur <= 0 || hauteur <= 0) return { l: cote, h: cote };
  const k = Math.min(1, cote / Math.max(largeur, hauteur));
  return { l: Math.max(1, Math.round(largeur * k)), h: Math.max(1, Math.round(hauteur * k)) };
}
/** « 1,4 Mo », « 320 Ko » */
export function tailleLisible(octets: number): string {
  return octets >= 1024 * 1024 ? `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}
