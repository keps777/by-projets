/**
 * Accès au localStorage qui ne casse jamais : fenêtre privée, stockage bloqué ou environnement sans navigateur
 * renvoient simplement « rien ».
 */
export function lire(cle: string): string | null {
  try {
    return globalThis.localStorage?.getItem(cle) ?? null;
  } catch {
    return null;
  }
}

export function ecrire(cle: string, valeur: string): void {
  try {
    globalThis.localStorage?.setItem(cle, valeur);
  } catch {
    // Stockage indisponible : la préférence ne survivra pas au rechargement, rien de plus.
  }
}

export function retirer(cle: string): void {
  try {
    globalThis.localStorage?.removeItem(cle);
  } catch {
    // Voir `ecrire`.
  }
}

/** Clés de stockage de l'application. `afrimove.conception` est aussi posée par le banc de fidélité. */
export const CLES = {
  conception: "afrimove.conception",
  session: "afrimove.session",
  langue: "afrimove.langue",
} as const;
