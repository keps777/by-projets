/*
 * Dessins de la planche ComptableCloture.dc.html. Le kit a une coche (IconeCoche, trait 2,8) ; la planche en dessine
 * deux autres, de taille et de trait différents : variantes locales, tracé repris tel quel.
 */

interface PropsCoche {
  taille: number;
  trait: number;
}

function Coche({ taille, trait }: PropsCoche) {
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
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Coche de la pastille verte de l'en-tête (20 px, trait 3). */
export function CocheEntete() {
  return <Coche taille={20} trait={3} />;
}

/** Coche d'un fichier envoyé (11 px, trait 3,5). */
export function CocheFichier() {
  return <Coche taille={11} trait={3.5} />;
}

/**
 * Cadenas du bouton « Clôturer · mon PIN » (22 px, trait 2,6). Le kit n'a pas ce dessin : même tracé que celui de
 * ComptableRapprochement.dc.html.
 */
export function IconeCadenas() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
