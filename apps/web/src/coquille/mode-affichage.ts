import { useSyncExternalStore } from "react";

/**
 * Logique de bascule entre l'écran plein (téléphone) et le cadre d'iPhone (ordinateur, tablette).
 *
 * - `plein` : l'application remplit toute la fenêtre, sans bande ni cadre (téléphone, portrait ou paysage,
 *   et toute fenêtre trop courte pour un cadre) ;
 * - `cadre` : au-delà de 600 px de large ET d'au moins 760 px de haut, l'écran de 390 x 844 est montré dans un
 *   boîtier d'iPhone, mis à l'échelle pour tenir dans la fenêtre sans jamais faire défiler la page autour.
 */
export type ModeAffichage = "plein" | "cadre";

/** Largeur (exclusive) au-delà de laquelle un cadre est possible : le téléphone tient dans 600 px. */
export const LARGEUR_MIN_CADRE = 600;
/** Hauteur (inclusive) minimale de la fenêtre pour afficher un cadre. */
export const HAUTEUR_MIN_CADRE = 760;

/** Écran intérieur du cadre : les dimensions des planches. */
export const LARGEUR_ECRAN = 390;
export const HAUTEUR_ECRAN = 844;
/** Épaisseur du boîtier autour de l'écran. */
export const EPAISSEUR_CADRE = 14;
/** Dimensions du boîtier complet, avant mise à l'échelle. */
export const LARGEUR_BOITIER = LARGEUR_ECRAN + 2 * EPAISSEUR_CADRE;
export const HAUTEUR_BOITIER = HAUTEUR_ECRAN + 2 * EPAISSEUR_CADRE;
/** Respiration minimale entre le cadre et le bord de la fenêtre. */
export const MARGE_FENETRE = 16;
/** Hauteur de la ligne du sélecteur de rôle (mode démo), au-dessus du cadre. */
export const HAUTEUR_LIGNE_DEMO = 52;

export function modeAffichage(largeur: number, hauteur: number): ModeAffichage {
  return largeur > LARGEUR_MIN_CADRE && hauteur >= HAUTEUR_MIN_CADRE ? "cadre" : "plein";
}

/**
 * Échelle du cadre pour qu'il tienne en entier dans la fenêtre (marge comprise) : 1 quand la fenêtre est assez
 * grande, jamais d'agrandissement. `reserve` retire de la hauteur la ligne du sélecteur de rôle.
 */
export function echelleCadre(largeur: number, hauteur: number, reserve = 0): number {
  const parLargeur = (largeur - 2 * MARGE_FENETRE) / LARGEUR_BOITIER;
  const parHauteur = (hauteur - reserve - 2 * MARGE_FENETRE) / HAUTEUR_BOITIER;
  const echelle = Math.min(1, parLargeur, parHauteur);
  // Arrondi au millième : évite de relancer un rendu pour un écart de sous-pixel.
  return Math.max(0.1, Math.round(echelle * 1000) / 1000);
}

function abonner(rappel: () => void): () => void {
  window.addEventListener("resize", rappel);
  window.addEventListener("orientationchange", rappel);
  return () => {
    window.removeEventListener("resize", rappel);
    window.removeEventListener("orientationchange", rappel);
  };
}

/** Taille de la fenêtre, suivie en direct (rotation, redimensionnement). */
export function useFenetre(): { largeur: number; hauteur: number } {
  const largeur = useSyncExternalStore(
    abonner,
    () => window.innerWidth,
    () => LARGEUR_ECRAN,
  );
  const hauteur = useSyncExternalStore(
    abonner,
    () => window.innerHeight,
    () => HAUTEUR_ECRAN,
  );
  return { largeur, hauteur };
}
