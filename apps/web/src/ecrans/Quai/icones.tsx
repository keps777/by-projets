import type { ReactNode } from "react";

/** Icônes de la planche Quai (docs/maquettes-v3/Quai.dc.html), tracés repris tels quels. */

interface Props {
  taille: number;
  trait: number;
  children: ReactNode;
}

function Icone({ taille, trait, children }: Props) {
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

/** Combiné téléphonique du bouton « Appeler » (16 px, trait 2.2). */
export function IconeTelephone() {
  return (
    <Icone taille={16} trait={2.2}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </Icone>
  );
}

/** Coche du scan accepté (16 px, trait 3). */
export function IconeScanOk() {
  return (
    <Icone taille={16} trait={3}>
      <path d="M20 6L9 17l-5-5" />
    </Icone>
  );
}

/** Croix du scan refusé : même rond et même trait que la coche. */
export function IconeScanRefuse() {
  return (
    <Icone taille={16} trait={3}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icone>
  );
}
