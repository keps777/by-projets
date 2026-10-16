import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./ecran.module.css";

export interface PropsEcran extends HTMLAttributes<HTMLDivElement> {
  /**
   * `fluide` (par défaut) : 390 px au plus, toute la hauteur de la fenêtre.
   * `planche` : exactement 390 x 844 comme dans les maquettes (démo, captures).
   */
  format?: "fluide" | "planche";
  /** Fond `profond` pour le mode cadence (Cadence.dc.html) ; `nuit` sinon. */
  fond?: "nuit" | "profond";
}

/** Écran de 390 px de large sur fond Nuit : colonne qui contient en-tête, corps et pied. */
export function Ecran({ format = "fluide", fond = "nuit", className, ...reste }: PropsEcran) {
  return (
    <div
      className={cx(styles.ecran, styles[format], fond === "profond" && styles.profond, className)}
      {...reste}
    />
  );
}

/** Zone centrale de l'écran (balise main) : prend la place restante, 16 px de gouttière. */
export function EcranCorps({ className, ...reste }: HTMLAttributes<HTMLElement>) {
  return <main className={cx(styles.corps, className)} {...reste} />;
}

/**
 * Pied d'écran : l'action principale toujours en bas, sous le pouce, sur fond Profond avec un
 * trait Surface 2 au-dessus.
 */
export function EcranPied({ className, ...reste }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.pied, className)} {...reste} />;
}
