import type { ReactNode } from "react";
import styles from "./selection.module.css";
import { classes, useControlled } from "./utils";

export interface StepperProps {
  /** Nom du groupe pour le lecteur d'écran (« Nombre de voyageurs »). */
  label: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  pas?: number;
  onChange?: (valeur: number) => void;
  /** Noms des boutons (« Moins de voyageurs », « Plus de voyageurs »). */
  labelMoins?: string;
  labelPlus?: string;
  /** Texte sous le nombre (« voyageurs · 6 places côte à côte »). */
  legende?: ReactNode;
  className?: string;
}

/** Stepper − / + autour d'un grand nombre, borné par `min` et `max`. */
export function Stepper({
  label,
  value,
  defaultValue = 0,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  pas = 1,
  onChange,
  labelMoins = "Moins",
  labelPlus = "Plus",
  legende,
  className,
}: StepperProps) {
  const [valeur, setValeur] = useControlled(value, defaultValue);
  const aller = (cible: number) => {
    const borne = Math.min(max, Math.max(min, cible));
    if (borne === valeur) return;
    setValeur(borne);
    onChange?.(borne);
  };
  return (
    <div role="group" aria-label={label} className={classes(styles.stepper, className)}>
      <button
        type="button"
        className={styles.rond}
        aria-label={labelMoins}
        disabled={valeur <= min}
        onClick={() => aller(valeur - pas)}
      >
        −
      </button>
      <span className={styles.centre}>
        <output className={styles.nombre} aria-live="polite">
          {valeur}
        </output>
        {legende ? <span className={styles.legende}>{legende}</span> : null}
      </span>
      <button
        type="button"
        className={styles.rond}
        aria-label={labelPlus}
        disabled={valeur >= max}
        onClick={() => aller(valeur + pas)}
      >
        +
      </button>
    </div>
  );
}
