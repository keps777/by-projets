import type { ReactNode } from "react";

/** Logo AfriMove de l'en-tête de l'accueil (36 px), tel que dessiné dans la planche Main. */
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
  className?: string;
}

function Trait({
  taille,
  trait,
  couleur = "currentColor",
  className,
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
      className={className}
    >
      {children}
    </svg>
  );
}

/** Repère de lieu (« Dans la même ville », position détectée). */
export function IconeRepere(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
    </Trait>
  );
}

/** Curseurs du résumé du filtre. */
export function IconeFiltre(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M3 5h18M6 12h12M10 19h4" />
    </Trait>
  );
}

/** Groupe de voyageurs (« Groupe · bus entier »). */
export function IconeGroupe(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M14 20a4.5 4.5 0 0 1 7 -3" />
    </Trait>
  );
}

/** Moto (« Moto vers la gare »). */
export function IconeMoto(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M5 17h14l-1.5-5h-11z" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </Trait>
  );
}

/** Téléphone (« Sans internet »). */
export function IconeTelephone(props: PropsIcone) {
  return (
    <Trait {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </Trait>
  );
}

/** Coche de la notification du colis. */
export function IconeCocheColis(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Trait>
  );
}
