/**
 * Icônes de la planche RapportSoir : le logo de la compagnie (40 px), la flèche de retour (trait 2,4) et la flèche
 * d'envoi vers l'assistant (trait 2,6). Le kit n'a pas ces dessins à ce gabarit : variantes locales, tracés repris
 * tels quels de RapportSoir.dc.html.
 */
export function LogoAfriMove() {
  return (
    <svg width="40" height="40" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <rect width="72" height="72" rx="20" fill="#0B1019" />
      <rect x="12" y="12" width="48" height="23" rx="6" fill="#273247" />
      <rect x="12" y="37" width="48" height="23" rx="6" fill="#1B2435" />
      <path d="M36 18 L50 56 L42 56 L36 38 L30 56 L22 56 Z" fill="#FFB547" />
      <rect x="10" y="34" width="52" height="3" fill="#0B1019" />
    </svg>
  );
}

export function IconeRetourRapport() {
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

export function IconeEnvoi() {
  return (
    <svg
      width="20"
      height="20"
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
