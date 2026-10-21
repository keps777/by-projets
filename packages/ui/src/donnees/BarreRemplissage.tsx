import styles from "./BarreRemplissage.module.css";
import { classes } from "./internes/classes";
import type { VarianteDonnees } from "./types";

export interface SeuilsRemplissage {
  /** À partir de ce pourcentage, la barre est verte. */
  vert: number;
  /** À partir de ce pourcentage (et en dessous du vert), la barre est ambre ; en dessous, rouge. */
  ambre: number;
}

/**
 * Seuils déduits de la planche Analyses : 91, 88, 84 et 83 % sont verts ; 78 et 74 % ambre ;
 * 61 % rouge. Les valeurs exactes 80 et 65 sont un choix (voir README du kit) ; chaque écran
 * peut passer les siens avec `seuils`.
 */
export const SEUILS_REMPLISSAGE: SeuilsRemplissage = { vert: 80, ambre: 65 };

export type CouleurRemplissage = "vert" | "ambre" | "rouge";

export function couleurRemplissage(
  pourcent: number,
  seuils: SeuilsRemplissage = SEUILS_REMPLISSAGE,
): CouleurRemplissage {
  if (pourcent >= seuils.vert) return "vert";
  if (pourcent >= seuils.ambre) return "ambre";
  return "rouge";
}

export interface BarreRemplissageProps {
  /** Remplissage en pourcentage (0 à 100 ; borné). */
  valeur: number;
  seuils?: SeuilsRemplissage;
  /** Nom de ce qui est mesuré, lu par les lecteurs d'écran, ex. « Douala → Yaoundé ». */
  libelle: string;
  /** `large` épaissit la barre (8 px au lieu de 6 px). */
  variante?: VarianteDonnees;
  className?: string;
}

/**
 * Barre de remplissage verte, ambre ou rouge selon le seuil. Le trait est un rectangle SVG
 * dans un rail aux bouts arrondis. Planche : Analyses (« Par ligne · remplissage »).
 */
export function BarreRemplissage({
  valeur,
  seuils = SEUILS_REMPLISSAGE,
  libelle,
  variante = "mobile",
  className,
}: BarreRemplissageProps) {
  const borne = Math.max(0, Math.min(100, Number.isFinite(valeur) ? valeur : 0));
  const couleur = couleurRemplissage(borne, seuils);
  return (
    <span
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(borne)}
      aria-valuetext={`${Math.round(borne)} %`}
      className={classes(styles.rail, className)}
      data-couleur={couleur}
      data-variante={variante}
    >
      <svg
        className={styles.trait}
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="0" y="0" width={borne} height="6" />
      </svg>
    </span>
  );
}
