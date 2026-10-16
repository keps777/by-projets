import type { ReactNode } from "react";
import styles from "./CartePapier.module.css";
import { classes } from "./classes";

interface CartePapierProps {
  titre: string;
  statut?: string;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}

/** Carte « papier » claire sous un bandeau sombre : cadre commun des aperçus d'impression. */
export function CartePapier({ titre, statut, children, ariaLabel, className }: CartePapierProps) {
  return (
    <section className={classes(styles.carte, className)} aria-label={ariaLabel}>
      <div className={styles.entete}>
        <span>{titre}</span>
        {statut ? <span className={styles.statut}>{statut}</span> : null}
      </div>
      {children}
    </section>
  );
}
