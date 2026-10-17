/**
 * Logo de l'en-tête (36 px). Le kit n'a pas ce dessin à ce gabarit : variante locale, tracés repris tels quels de
 * Controle.dc.html, couleurs en variables du système.
 */
export function LogoCompagnie() {
  return (
    <svg width="36" height="36" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <rect width="72" height="72" rx="20" fill="var(--am-nuit)" />
      <rect x="12" y="12" width="48" height="23" rx="6" fill="var(--am-trait)" />
      <rect x="12" y="37" width="48" height="23" rx="6" fill="var(--am-surface-2)" />
      <path d="M36 18 L50 56 L42 56 L36 38 L30 56 L22 56 Z" fill="var(--am-ambre)" />
      <rect x="10" y="34" width="52" height="3" fill="var(--am-nuit)" />
    </svg>
  );
}
