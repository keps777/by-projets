import type { ReactNode } from "react";

/** Icônes de la planche « Cadence » absentes du kit (viewBox 24, trait `currentColor`, comme les planches). */

interface Props {
  taille?: number;
  trait?: number;
}

function Svg({ taille = 24, trait = 2.2, children }: Props & { children: ReactNode }) {
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

/** Téléphone du bouton MOMO. */
export function IconeTelephone(props: Props) {
  return (
    <Svg {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </Svg>
  );
}

/** Horloge de la ligne « Synchro » (en attente du réseau). */
export function IconeHorloge(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2 2" />
    </Svg>
  );
}
