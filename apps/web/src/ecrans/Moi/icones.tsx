import type { ReactNode } from "react";

/**
 * Icônes de la planche Moi, relevées dans Moi.dc.html : le kit n'a ni cette roue de réglages ni la boutique ni la
 * moto. Décoratives (`aria-hidden`) : le libellé est porté par le bouton ou le lien.
 */
interface PropsIcone {
  taille: number;
  trait: number;
  /** Couleur du trait ; la couleur du texte (`currentColor`) par défaut. */
  couleur?: string;
}

function Trait({ taille, trait, couleur, children }: PropsIcone & { children: ReactNode }) {
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
      {children}
    </svg>
  );
}

/** Roue crantée du bouton Réglages. */
export function IconeRoue(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Trait>
  );
}

/** Boutique (carte « Deviens point de relais »). */
export function IconeBoutique(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M3 9l1.5-5h15L21 9M3 9h18v11H3zM9 20v-6h6v6" />
    </Trait>
  );
}

/** Moto (carte « Deviens livreur »). */
export function IconeMotoLivreur(props: PropsIcone) {
  return (
    <Trait {...props}>
      <circle cx="5.5" cy="17" r="2.5" />
      <circle cx="18.5" cy="17" r="2.5" />
      <path d="M5.5 17l3-7h5l2 4h3M13 10l-1-3h3" />
    </Trait>
  );
}

/** Chevron des cartes « Deviens… », de la couleur du bord de la carte. */
export function ChevronCarte(props: PropsIcone) {
  return (
    <Trait {...props}>
      <path d="M9 6l6 6-6 6" />
    </Trait>
  );
}
