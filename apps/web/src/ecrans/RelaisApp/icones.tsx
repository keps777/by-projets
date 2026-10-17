/** Icônes de la planche « RelaisApp », au trait de la maquette (le kit n'a pas de dessin plus proche). */

const COMMUN = {
  viewBox: "0 0 24 24",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/** Cadre de scan avec un trait au milieu : « Remettre » (la couleur du texte). */
export function IconeScan() {
  return (
    <svg width={30} height={30} stroke="currentColor" strokeWidth={2.2} {...COMMUN}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

/** Colis (boîte vue en perspective), en bleu : « Recevoir ». */
export function IconeColis() {
  return (
    <svg width={30} height={30} stroke="var(--am-bleu)" strokeWidth={2.2} {...COMMUN}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

/** Coche de la pièce vérifiée (13 px, trait de 3). */
export function IconeCocheVerifiee() {
  return (
    <svg width={13} height={13} stroke="currentColor" strokeWidth={3} {...COMMUN}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
