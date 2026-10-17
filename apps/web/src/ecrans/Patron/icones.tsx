import type { ReactNode } from "react";

/**
 * Icônes de l'accueil du patron : le logo de l'en-tête (34 px) et les neuf tuiles (19 px, trait 2,2, une couleur par
 * tuile). Le kit n'a pas ces dessins à ce gabarit : variantes locales, tracés repris tels quels de Patron.dc.html.
 */
export function LogoCompagnie() {
  return (
    <svg width="34" height="34" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <rect width="72" height="72" rx="20" fill="#0B1019" />
      <rect x="12" y="12" width="48" height="23" rx="6" fill="#273247" />
      <rect x="12" y="37" width="48" height="23" rx="6" fill="#1B2435" />
      <path d="M36 18 L50 56 L42 56 L36 38 L30 56 L22 56 Z" fill="#FFB547" />
      <rect x="10" y="34" width="52" height="3" fill="#0B1019" />
    </svg>
  );
}

function Dessin({ couleur, children }: { couleur: string; children: ReactNode }) {
  return (
    <svg
      width="19"
      height="19"
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

export function IconeAnalyses() {
  return (
    <Dessin couleur="var(--am-ambre)">
      <path d="M4 19V9M10 19V5M16 19v-8M22 19H2" />
    </Dessin>
  );
}

export function IconeGares() {
  return (
    <Dessin couleur="var(--am-bleu)">
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </Dessin>
  );
}

export function IconeRapports() {
  return (
    <Dessin couleur="var(--am-vert)">
      <path d="M4 4h16v12H7l-3 3z" />
      <path d="M8 9h8M8 12h5" />
    </Dessin>
  );
}

export function IconeComptable() {
  return (
    <Dessin couleur="var(--am-craie-2)">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Dessin>
  );
}

export function IconeFinancement() {
  return (
    <Dessin couleur="var(--am-orange)">
      <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Dessin>
  );
}

export function IconeInterAgences() {
  return (
    <Dessin couleur="var(--am-bleu)">
      <path d="M3 7h11l3 3h4v7H3z" />
      <path d="M7 17a2 2 0 1 0 0 .1M17 17a2 2 0 1 0 0 .1" />
      <path d="M14 7V4h-4" />
    </Dessin>
  );
}

export function IconeReglages() {
  return (
    <Dessin couleur="var(--am-craie-2)">
      <circle cx="12" cy="12" r="3" />
      <path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
    </Dessin>
  );
}

export function IconeModules() {
  return (
    <Dessin couleur="var(--am-ambre)">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </Dessin>
  );
}

export function IconeControle() {
  return (
    <Dessin couleur="var(--am-vert)">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Dessin>
  );
}
