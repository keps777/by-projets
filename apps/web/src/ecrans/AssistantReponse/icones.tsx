import type { ReactNode } from "react";

/**
 * Icônes de la planche AssistantReponse : la flèche de retour, l'étincelle de l'en-tête et le micro (20 px, trait
 * 2,4). Le kit n'a pas ces dessins à ce gabarit : variantes locales, tracés repris tels quels de
 * AssistantReponse.dc.html.
 */
function Dessin({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconeRetour() {
  return (
    <Dessin>
      <path d="M15 6l-6 6 6 6" />
    </Dessin>
  );
}

export function IconeEtincelle() {
  return (
    <Dessin>
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
    </Dessin>
  );
}

export function IconeMicro() {
  return (
    <Dessin>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Dessin>
  );
}
