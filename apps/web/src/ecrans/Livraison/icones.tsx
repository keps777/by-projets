import type { ReactNode } from "react";

/** Icônes de la planche « Livraison », au trait près (le kit UI n'a pas de dessin plus proche). */
function icone(taille: number, trait: number, dessin: ReactNode, couleur?: string) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur ?? "currentColor"}
      strokeWidth={trait}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {dessin}
    </svg>
  );
}

/** Appeler le livreur : combiné. */
export function IconeTelephone() {
  return icone(
    18,
    2.2,
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  );
}

/** Partager le suivi : bulle de message, en vert. */
export function IconeMessage() {
  return icone(
    16,
    2.2,
    <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" />,
    "var(--am-vert)",
  );
}

/** Devenir livreur : la moto. */
export function IconeMoto() {
  return icone(
    20,
    2.4,
    <>
      <circle cx="5.5" cy="17" r="2.5" />
      <circle cx="18.5" cy="17" r="2.5" />
      <path d="M5.5 17l3-7h5l2 4h3M13 10l-1-3h3" />
    </>,
  );
}
