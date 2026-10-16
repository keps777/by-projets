import type { ReactNode } from "react";

export interface PropsIcone {
  /** Côté en px (24 par défaut, comme le viewBox des planches). */
  taille?: number;
  /** Épaisseur du trait ; chaque icône a la sienne dans les planches. */
  trait?: number;
  className?: string;
}

/**
 * Icônes à trait relevées dans les planches (viewBox 24, `currentColor`, extrémités arrondies).
 * Toujours décoratives : le libellé accessible est porté par le bouton ou le lien qui les contient.
 */
function creer(nom: string, dessin: ReactNode, traitParDefaut = 2.4) {
  function Icone({ taille = 24, trait = traitParDefaut, className }: PropsIcone) {
    return (
      <svg
        width={taille}
        height={taille}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={trait}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        {dessin}
      </svg>
    );
  }
  Icone.displayName = nom;
  return Icone;
}

/** Flèche de retour de l'en-tête (Systeme, SiegePay). */
export const IconeRetour = creer("IconeRetour", <path d="M15 6l-6 6 6 6" />);
/** Chevron vers la droite des cartes et boutons (Guichet, Main). */
export const IconeChevronDroite = creer("IconeChevronDroite", <path d="M9 6l6 6-6 6" />, 2.6);
/** Chevron vers le bas (menu déroulé). */
export const IconeChevronBas = creer("IconeChevronBas", <path d="M6 9l6 6 6-6" />, 2.6);
/** Flèche vers la droite (boutons d'action). */
export const IconeFleche = creer("IconeFleche", <path d="M5 12h14M13 6l6 6-6 6" />, 2.6);
/** Coche (validation). */
export const IconeCoche = creer("IconeCoche", <path d="M20 6L9 17l-5-5" />, 2.8);
/** Éclair (mode cadence). */
export const IconeEclair = creer("IconeEclair", <path d="M13 2L3 14h8l-1 8 10-12h-8z" />, 2.6);
/** Repère de lieu. */
export const IconeLieu = creer(
  "IconeLieu",
  <>
    <circle cx="12" cy="10" r="3" />
    <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
  </>,
);
/** Inversion départ / arrivée. */
export const IconeInverser = creer(
  "IconeInverser",
  <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
);
/** Autocar (onglet Voyager, Quai). */
export const IconeBus = creer(
  "IconeBus",
  <>
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16" />
    <path d="M7 18v3M17 18v3" />
  </>,
  2,
);
/** Colis (onglet Colis). */
export const IconeColis = creer(
  "IconeColis",
  <>
    <path d="M21 8l-9-5-9 5 9 5 9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </>,
  2,
);
/** Voiture (onglet Covoit). */
export const IconeVoiture = creer(
  "IconeVoiture",
  <>
    <path d="M5 17h14l-1.5-5h-11z" />
    <path d="M7 12l1.5-4h7L17 12" />
    <circle cx="7.5" cy="17" r="2" />
    <circle cx="16.5" cy="17" r="2" />
  </>,
  2,
);
/** Personne (onglet Moi, passager). */
export const IconePersonne = creer(
  "IconePersonne",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
  2,
);
/** Maison (onglets Guichet et Gares). */
export const IconeMaison = creer(
  "IconeMaison",
  <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  2,
);
/** Billet (onglet Vendre). */
export const IconeBillet = creer(
  "IconeBillet",
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M15 6v12" strokeDasharray="2 2" />
  </>,
  2,
);
/** Caisse (onglet Caisse). */
export const IconeCaisse = creer(
  "IconeCaisse",
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
  </>,
  2,
);
/** Barres (onglets Aujourd'hui et Analyses). */
export const IconeBarres = creer("IconeBarres", <path d="M4 19V9M10 19V5M16 19v-8M22 19H2" />, 2);
/** Tendance (onglet Analyses du patron). */
export const IconeTendance = creer(
  "IconeTendance",
  <>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </>,
  2,
);
/** Roue crantée simplifiée (onglet Réglages). */
export const IconeReglages = creer(
  "IconeReglages",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
  </>,
  2,
);
