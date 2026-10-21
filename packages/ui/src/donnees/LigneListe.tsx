import type { ReactNode } from "react";
import styles from "./LigneListe.module.css";

export interface LigneListeProps {
  /** Les cellules, dans l'ordre des colonnes. */
  children: ReactNode;
  /** Valeur de `grid-template-columns`, ex. « 1fr 64px auto » (par ligne) ou « 1fr auto auto » (par bus). */
  colonnes?: string;
  href?: string;
  onClick?: () => void;
  /** Libellé de la ligne cliquable, si son texte ne suffit pas. */
  ariaLabel?: string;
  /** `serree` : 42 px de haut, texte 12 px (trajets d'un bus dans AnalysesBus). */
  densite?: "normale" | "serree";
}

/**
 * Ligne de liste à colonnes libres (56 px de haut minimum, filet entre deux lignes).
 * À placer dans une `ListeGlissable`. Planche : Analyses (par ligne, par bus).
 */
export function LigneListe({
  children,
  colonnes = "1fr auto",
  href,
  onClick,
  ariaLabel,
  densite = "normale",
}: LigneListeProps) {
  const style = { gridTemplateColumns: colonnes };
  return (
    <li className={styles.item} data-densite={densite}>
      {href ? (
        <a className={styles.ligne} style={style} href={href} aria-label={ariaLabel}>
          {children}
        </a>
      ) : onClick ? (
        <button
          type="button"
          className={styles.ligne}
          style={style}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {children}
        </button>
      ) : (
        <div className={styles.ligne} style={style} aria-label={ariaLabel}>
          {children}
        </div>
      )}
    </li>
  );
}
