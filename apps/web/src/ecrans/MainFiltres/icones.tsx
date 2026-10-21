import type { ReactNode } from "react";

/** Logo AfriMove de l'en-tête (36 px), tel que dessiné dans la planche MainFiltres. */
export function LogoAfriMove() {
  return (
    <svg width="36" height="36" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <rect width="72" height="72" rx="20" fill="var(--am-nuit)" />
      <rect x="12" y="12" width="48" height="23" rx="6" fill="var(--am-trait)" />
      <rect x="12" y="37" width="48" height="23" rx="6" fill="var(--am-surface-2)" />
      <path d="M36 18 L50 56 L42 56 L36 38 L30 56 L22 56 Z" fill="var(--am-ambre)" />
      <rect x="10" y="34" width="52" height="3" fill="var(--am-nuit)" />
    </svg>
  );
}

interface PropsIcone {
  taille: number;
  trait: number;
  /** Couleur du trait quand elle n'est pas celle du texte. */
  couleur?: string;
}

function Trait({
  taille,
  trait,
  couleur = "currentColor",
  children,
}: PropsIcone & { children: ReactNode }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
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

/** Repère de lieu (« Dans la même ville »). */
export function IconeRepere(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
    </Trait>
  );
}

/** Curseurs de « Filtrer les départs ». */
export function IconeFiltre(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M3 5h18M6 12h12M10 19h4" />
    </Trait>
  );
}

/** Chevron vers le haut : le panneau est déroulé. */
export function IconeChevronHaut(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M18 15l-6-6-6 6" />
    </Trait>
  );
}
