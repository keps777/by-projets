import type { ReactNode } from "react";

/**
 * Icônes des quatre raccourcis de Superviseur.dc.html (18 px, trait 2,2, couleur propre à chaque raccourci). Le kit
 * n'a pas ces dessins à ce gabarit : variantes locales, tracés repris tels quels de la planche.
 */
function Dessin({ couleur, children }: { couleur: string; children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconeControle() {
  return (
    <Dessin couleur="var(--am-rouge)">
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
    </Dessin>
  );
}

export function IconeEquipe() {
  return (
    <Dessin couleur="var(--am-ambre)">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Dessin>
  );
}

export function IconeDebloquer() {
  return (
    <Dessin couleur="var(--am-rouge)">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </Dessin>
  );
}

export function IconeRapport() {
  return (
    <Dessin couleur="var(--am-vert)">
      <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" />
    </Dessin>
  );
}
