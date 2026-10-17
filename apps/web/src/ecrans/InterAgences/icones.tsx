/**
 * Flèche du rond ambre entre deux tronçons (16 px, trait 2,8), tracé repris tel quel de InterAgences.dc.html. Le kit
 * exporte la même flèche avec un trait de 2,6.
 */
export function FlecheTroncons() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
