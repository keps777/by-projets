import type { ReactNode } from "react";

/** Icônes de la planche Convoyeur (dessins repris tels quels de Convoyeur.dc.html, 18 px, trait 2,2). */
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

export function IconeScanner() {
  return (
    <Dessin couleur="var(--am-bleu)">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </Dessin>
  );
}

export function IconeColisADecharger() {
  return (
    <Dessin couleur="var(--am-ambre)">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
    </Dessin>
  );
}

export function IconeIncident() {
  return (
    <Dessin couleur="var(--am-rouge)">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Dessin>
  );
}
