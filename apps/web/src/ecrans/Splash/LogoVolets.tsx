import styles from "./splash.module.css";

/**
 * Logo piste E de la planche Splash : tuile Nuit, deux lames (basse fixe, haute à volet qui bascule), A ambre
 * sans barre. Le dessin est celui de la maquette (viewBox 72 × 72) ; l'animation des volets est en CSS et
 * s'arrête avec `prefers-reduced-motion`.
 */
export function LogoVolets({ libelle }: { libelle: string }) {
  return (
    <div className={styles.logo}>
      <svg
        width="168"
        height="168"
        viewBox="0 0 72 72"
        role="img"
        aria-label={libelle}
        className={styles.logoSvg}
      >
        <rect width="72" height="72" rx="20" fill="var(--am-surface)" />
        <rect x="12" y="37" width="48" height="23" rx="6" fill="var(--am-surface-2)" />
        <path d="M36 38 L42 56 L30 56 Z M22 56 L30 56 L30 56 Z" fill="var(--am-ambre)" />
        <path d="M30 56 L36 38 L42 56 L50 56 L36 18 L22 56 Z" fill="var(--am-ambre)" />
        <g className={styles.volet}>
          <rect x="12" y="12" width="48" height="23" rx="6" fill="var(--am-trait)" />
          <path d="M36 18 L42.5 35 L29.5 35 Z" fill="var(--am-ambre)" />
        </g>
        <rect x="10" y="34" width="52" height="3" fill="var(--am-nuit)" />
      </svg>
    </div>
  );
}
