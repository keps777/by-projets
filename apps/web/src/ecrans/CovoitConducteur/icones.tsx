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

/** Volant (« Je conduis »), tel que dessiné dans la planche. */
export function IconeVolant(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    </Trait>
  );
}

/** Plus du bouton « Proposer mon trajet ». */
export function IconePlus(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M12 5v14M5 12h14" />
    </Trait>
  );
}

/** Pièce de la mention de paiement (partage de frais). */
export function IconeDevise(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Trait>
  );
}
