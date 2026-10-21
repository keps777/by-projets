import type { ReactNode } from "react";

/** Icônes de la planche CadenceQuai (docs/maquettes-v3/CadenceQuai.dc.html), tracés repris tels quels. */

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

/** Viseur du billet scanné : quatre coins et un trait (16 px, trait 2.4). */
export function IconeScan() {
  return (
    <Icone taille={16} trait={2.4}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </Icone>
  );
}

/** Triangle d'alerte de la note du rapport du soir (16 px, trait 2.2) ; l'ambre vient du conteneur. */
export function IconeAlerte() {
  return (
    <Icone taille={16} trait={2.2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Icone>
  );
}

/** Croix d'un scan refusé (16 px, trait 3). */
export function IconeRefus() {
  return (
    <Icone taille={16} trait={3}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icone>
  );
}

/** Coche d'un billet embarqué (16 px, trait 3). */
export function IconeCoche() {
  return (
    <Icone taille={16} trait={3}>
      <path d="M20 6L9 17l-5-5" />
    </Icone>
  );
}
