/** Icônes de la planche Direct, dessinées comme dans la maquette (le kit n'a ni cloche, ni téléphone, ni alerte). */
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

/** Cloche de la carte « Prévenir ». */
export function IconeCloche() {
  return (
    <Trait taille={22} trait={2.2}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Trait>
  );
}

/** Combiné téléphonique : « Chauffeur ». */
export function IconeTelephone({ taille = 16 }: { taille?: number }) {
  return (
    <Trait taille={taille} trait={2.2}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </Trait>
  );
}

/** Triangle d'alerte : « Signaler ». */
export function IconeAlerte({ taille = 16 }: { taille?: number }) {
  return (
    <Trait taille={taille} trait={2.2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Trait>
  );
}

/** Colis (cube ouvert) : « Mon colis ». */
export function IconeColisOuvert() {
  return (
    <Trait taille={16} trait={2.2}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
    </Trait>
  );
}
