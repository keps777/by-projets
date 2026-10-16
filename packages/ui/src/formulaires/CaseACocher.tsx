import { useEffect, useRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./selection.module.css";
import { classes } from "./utils";

export interface CaseACocherProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Texte cliquable, qui donne son nom accessible à la case. */
  label: ReactNode;
  /** État « partiel » (ex. « Toutes les compagnies » quand quelques-unes seulement sont cochées). */
  indeterminee?: boolean;
}

function useIndetermine(indeterminee: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminee;
  }, [indeterminee]);
  return ref;
}

/** Case à cocher 20 px, accent ambre, avec son libellé. */
export function CaseACocher({
  label,
  indeterminee = false,
  className,
  ...reste
}: CaseACocherProps) {
  const ref = useIndetermine(indeterminee);
  return (
    <label className={classes(styles.case, className)}>
      <input {...reste} ref={ref} type="checkbox" className={styles.coche} />
      <span>{label}</span>
    </label>
  );
}

export interface LigneCochableProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  libelle: ReactNode;
  /** Texte à droite (« 14 départs »). */
  detail?: ReactNode;
  /** Bouton placé à droite de la ligne, hors de la zone cochable (ex. étoile « préférée »). */
  action?: ReactNode;
  /** Trait au-dessus de la ligne, pour les lignes qui suivent la première. */
  separateur?: boolean;
  indeterminee?: boolean;
}

/** Ligne cochable de liste (filtres) : case, libellé, détail, action facultative. */
export function LigneCochable({
  libelle,
  detail,
  action,
  separateur = false,
  indeterminee = false,
  className,
  disabled,
  ...reste
}: LigneCochableProps) {
  const ref = useIndetermine(indeterminee);
  return (
    <div className={classes(styles.ligne, separateur && styles.ligneSeparee, className)}>
      <label className={classes(styles.ligneCochable, disabled && styles.ligneDesactivee)}>
        <input {...reste} ref={ref} disabled={disabled} type="checkbox" className={styles.coche} />
        <span className={styles.ligneLibelle}>{libelle}</span>
        {detail ? <span className={styles.ligneDetail}>{detail}</span> : <span />}
      </label>
      {action}
    </div>
  );
}
