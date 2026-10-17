/** Icônes de la planche Chauffeur, recopiées de docs/maquettes-v3/Chauffeur.dc.html (24 px, trait 2,2). */

import type { ReactNode } from "react";

interface Props {
  taille?: number;
  /** Couleur du trait ; `currentColor` par défaut. */
  couleur?: string;
}

function Icone({
  taille = 24,
  couleur = "currentColor",
  children,
}: Props & { children: ReactNode }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Triangle d'alerte de « Incident · panne ». */
export function IconeAlerte(props: Props) {
  return (
    <Icone {...props}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Icone>
  );
}

/** Horloge de « Retard · 20 min ». */
export function IconeHorloge(props: Props) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icone>
  );
}
