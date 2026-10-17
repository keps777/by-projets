/** Icônes de la planche « Connexion », reprises telles quelles de docs/maquettes-v3/Connexion.dc.html. */

/** Drapeau du Cameroun : vert, rouge, jaune et l'étoile. Les couleurs sont celles de la planche (drapeau national). */
export function DrapeauCameroun() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" focusable="false">
      <rect width="6" height="12" fill="#1E7A3A" />
      <rect x="6" width="6" height="12" fill="#D21F2A" />
      <rect x="12" width="6" height="12" fill="#F2C40F" />
      <path d="M9 3.2l.8 1.9 2 .1-1.6 1.3.6 2L9 7.4l-1.8 1.1.6-2L6.2 5.2l2-.1z" fill="#F2C40F" />
    </svg>
  );
}

export function IconeWhatsApp() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--am-vert)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" />
      <path d="M9 10a4 4 0 0 0 5 5" />
    </svg>
  );
}

export function IconeTelephoneSimple() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--am-ambre)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}
