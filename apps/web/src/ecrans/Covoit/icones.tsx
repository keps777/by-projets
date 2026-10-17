import type { ReactNode } from "react";

interface PropsIcone {
  taille: number;
  trait: number;
}

function Trait({ taille, trait, children }: PropsIcone & { children: ReactNode }) {
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

/** Volant (« Je conduis »), tel que dessiné dans la planche Covoit. */
export function IconeVolant(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    </Trait>
  );
}

/** Bouclier coché de la mention de confiance. */
export function IconeBouclier(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
      <path d="M9 12l2 2 4-4" />
    </Trait>
  );
}
