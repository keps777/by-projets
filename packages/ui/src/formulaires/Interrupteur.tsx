import { useId } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./selection.module.css";
import { classes, useControlled } from "./utils";

export interface InterrupteurProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "type"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (actif: boolean) => void;
}

/**
 * Interrupteur (rôle switch). Sans libellé visible à côté, passer `aria-label`
 * ou `aria-labelledby` : un interrupteur sans nom n'est pas utilisable au lecteur d'écran.
 */
export function Interrupteur({
  checked,
  defaultChecked = false,
  onChange,
  className,
  onClick,
  ...reste
}: InterrupteurProps) {
  const [actif, setActif] = useControlled(checked, defaultChecked);
  return (
    <button
      {...reste}
      type="button"
      role="switch"
      aria-checked={actif}
      className={classes(styles.interrupteur, className)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        setActif(!actif);
        onChange?.(!actif);
      }}
    >
      <span className={styles.pastille} aria-hidden="true" />
    </button>
  );
}

export interface LigneInterrupteurProps extends InterrupteurProps {
  libelle: ReactNode;
  separateur?: boolean;
}

/** Ligne de réglage : libellé à gauche, interrupteur à droite ; toucher le libellé bascule aussi. */
export function LigneInterrupteur({
  libelle,
  separateur = false,
  id,
  ...reste
}: LigneInterrupteurProps) {
  const genere = useId();
  const identifiant = id ?? genere;
  return (
    <label
      htmlFor={identifiant}
      className={classes(styles.ligneInterrupteur, separateur && styles.ligneInterrupteurSeparee)}
    >
      <span>{libelle}</span>
      <Interrupteur {...reste} id={identifiant} />
    </label>
  );
}
