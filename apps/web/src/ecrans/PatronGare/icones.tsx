/**
 * Icônes de la planche PatronGare : la flèche de retour (20 px, trait 2,4) et la flèche de la caisse en direct
 * (22 px, trait 2,6). Le kit n'a pas ces dessins à ce gabarit : variantes locales, tracés repris tels quels de
 * PatronGare.dc.html.
 */
export function IconeRetourGare() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconeFlecheCaisse() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
