import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./etiquette.module.css";

export interface PropsEtiquette extends HTMLAttributes<HTMLSpanElement> {
  /** `ambre` pour un titre de section (par défaut), `gris` pour le libellé d'une tuile de chiffre. */
  ton?: "ambre" | "gris";
  /** `s` = 10 px (Main, Patron), `m` = 11 px (Systeme). */
  taille?: "s" | "m";
}

/**
 * Étiquette mono majuscule : titre de section ambre (Geist Mono, interlettrage .14em).
 * La mise en majuscules est faite par le CSS, le texte reste lisible tel quel par les lecteurs d'écran.
 */
export function Etiquette({ ton = "ambre", taille = "s", className, ...reste }: PropsEtiquette) {
  return (
    <span
      className={cx(styles.etiquette, styles[ton], styles[`taille-${taille}`], className)}
      data-ton={ton}
      {...reste}
    />
  );
}
