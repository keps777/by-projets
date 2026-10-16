import type { ReactNode } from "react";
import styles from "./CarteDonnees.module.css";
import { classes } from "./internes/classes";
import type { VarianteDonnees } from "./types";

export interface CarteDonneesProps {
  /** Étiquette mono capitales ambre en haut à gauche, ex. « Recette par jour ». */
  etiquette: string;
  /** Contenu à droite de l'étiquette (valeur, mention). */
  droite?: ReactNode;
  children: ReactNode;
  /** `large` : rayon 18, étiquette 11 px (salle de contrôle). */
  variante?: VarianteDonnees;
  className?: string;
}

/**
 * Carte qui porte un graphique ou un tableau : fond surface, bord trait, étiquette ambre.
 * Planches : Analyses (recette par jour), AnalysesBus (net par semaine), Controle (ventes par heure).
 */
export function CarteDonnees({
  etiquette,
  droite,
  children,
  variante = "mobile",
  className,
}: CarteDonneesProps) {
  return (
    <section
      className={classes(styles.carte, className)}
      aria-label={etiquette}
      data-variante={variante}
    >
      <div className={styles.entete}>
        <span className={styles.etiquette}>{etiquette}</span>
        {droite ? <span className={styles.droite}>{droite}</span> : null}
      </div>
      {children}
    </section>
  );
}
