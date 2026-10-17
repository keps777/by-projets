/** Icônes de la planche Pass, dessinées comme dans la maquette (le kit n'a ni « partager » ni « moto »). */
import type { ReactNode } from "react";

function Trait({
  children,
  taille,
  trait,
}: {
  children: ReactNode;
  taille: number;
  trait: number;
}) {
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

/** Partager le billet : boîte ouverte et flèche vers le haut. */
export function IconePartager({ taille = 20 }: { taille?: number }) {
  return (
    <Trait taille={taille} trait={2.2}>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3M8 7l4-4 4 4" />
    </Trait>
  );
}

/** Moto vers la gare. */
export function IconeMoto({ taille = 22 }: { taille?: number }) {
  return (
    <Trait taille={taille} trait={2.2}>
      <path d="M5 17h14l-1.5-5h-11z" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </Trait>
  );
}
