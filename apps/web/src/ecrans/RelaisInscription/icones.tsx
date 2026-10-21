import type { ReactNode } from "react";

/**
 * Icônes de la planche RelaisInscription que le kit n'a pas à l'identique : le repère de position (le kit dessine un
 * repère plus large) et l'appareil photo. La flèche, la coche et le retour viennent du kit.
 */
interface Props {
  taille: number;
  trait: number;
  couleur?: string;
}

function Dessin({ taille, trait, couleur, children }: Props & { children: ReactNode }) {
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

/** Position détectée (14 px, trait 2,6). */
export function IconePosition() {
  return (
    <Dessin taille={14} trait={2.6}>
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <circle cx="12" cy="10" r="2" />
    </Dessin>
  );
}

/** Photo de la façade (20 px, trait 2,2, Ambre). */
export function IconeAppareilPhoto() {
  return (
    <Dessin taille={20} trait={2.2} couleur="var(--am-ambre)">
      <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Dessin>
  );
}

/** CNI vérifiée, photo prise (20 px, trait 2,4, Vert). */
export function IconeVerifiee() {
  return (
    <Dessin taille={20} trait={2.4} couleur="var(--am-vert)">
      <path d="M20 6L9 17l-5-5" />
    </Dessin>
  );
}
