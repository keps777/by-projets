/**
 * Icône de l'écran Comptable : l'œil du bouton « Aperçu » (13 px, trait 2,4). Le kit n'a pas ce dessin à ce gabarit :
 * variante locale, tracé repris tel quel de Comptable.dc.html.
 */
export function IconeApercu() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
