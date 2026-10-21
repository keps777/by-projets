import type { ReactNode } from "react";

/** Icônes de la planche « ColisCode », au trait près (le kit UI n'a pas de dessin plus proche). */
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

/** Partager le suivi : boîte ouverte et flèche vers le haut. */
export function IconePartager() {
  return icone(
    20,
    2.2,
    <>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3M8 7l4-4 4 4" />
    </>,
  );
}

/** Envoyer le code : bulle de message. */
export function IconeMessage() {
  return icone(14, 2.4, <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" />);
}

/** Livraison à domicile : la moto, en bleu. */
export function IconeMoto() {
  return icone(
    22,
    2.2,
    <>
      <path d="M5 17h14l-1.5-5h-11z" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>,
    "var(--am-bleu)",
  );
}

/** Point relais : la boutique, en vert. */
export function IconeRelais() {
  return icone(
    22,
    2.2,
    <>
      <path d="M3 9l1-5h16l1 5" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </>,
    "var(--am-vert)",
  );
}

/** Réclamation : le bouclier, en ambre. */
export function IconeBouclier() {
  return icone(18, 2.2, <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />, "var(--am-ambre)");
}
