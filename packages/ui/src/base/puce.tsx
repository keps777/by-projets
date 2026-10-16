import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./puce.module.css";

export interface PropsPuce extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Puce choisie : `aria-pressed` passe à vrai et le style de sélection s'applique. */
  selectionnee?: boolean;
  /**
   * `s` = 28 px (filtre Tout / Bus / Covoit), `m` = 32 px (« Auj. »), `l` = 44 px (« Pour moi »).
   * Les tailles s et m gardent l'aspect des planches mais leur zone tactile est étendue à 44 px.
   */
  taille?: "s" | "m" | "l";
  /** Texte en vert pour la puce Covoit (en direct, validé). */
  ton?: "neutre" | "vert";
}

/** Puce / filtre : bouton à bascule, rond, `aria-pressed` reflète la sélection. */
export function Puce({
  selectionnee = false,
  taille = "s",
  ton = "neutre",
  className,
  type = "button",
  ...reste
}: PropsPuce) {
  return (
    <button
      type={type}
      aria-pressed={selectionnee}
      className={cx(
        styles.puce,
        styles[`taille-${taille}`],
        selectionnee && styles.selectionnee,
        ton === "vert" && !selectionnee && styles.vert,
        className,
      )}
      {...reste}
    />
  );
}
