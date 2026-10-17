import type { ReactNode } from "react";

/**
 * Icônes de la planche Guichet que le kit n'a pas à l'identique :
 * - le cadre de scan du « Dépôt prépayé » (le kit n'a aucune icône de scan) ;
 * - la caisse de « Ma caisse » avec ses deux points (`IconeCaisse` du kit n'a pas les points).
 * Les autres icônes (billet, colis, bus, éclair, chevron) viennent du kit.
 */
interface Props {
  taille?: number;
  trait?: number;
}

function Dessin({ taille = 22, trait = 2.2, children }: Props & { children: ReactNode }) {
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
      {children}
    </svg>
  );
}

export function IconeScan(props: Props) {
  return (
    <Dessin {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </Dessin>
  );
}

export function IconeCaisseAvecPoints(props: Props) {
  return (
    <Dessin {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 12h.01M18 12h.01" />
    </Dessin>
  );
}

/** Logo AfriMove de l'en-tête (34 px), dessin repris tel quel de Guichet.dc.html. */
export function LogoAgence() {
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
