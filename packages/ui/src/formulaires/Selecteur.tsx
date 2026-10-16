import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import styles from "./champ.module.css";
import type { VarianteChamp } from "./Champ";
import { classes } from "./utils";

export interface OptionSelecteur {
  valeur: string;
  libelle: string;
  desactive?: boolean;
}

export interface SelecteurProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  options: readonly OptionSelecteur[];
  variante?: VarianteChamp;
  mono?: boolean;
  aide?: ReactNode;
  erreur?: ReactNode;
}

/** Sélecteur déroulant natif (clavier et lecteur d'écran gratuits), habillé nuit. */
export function Selecteur({
  label,
  options,
  variante = "formulaire",
  mono = false,
  aide,
  erreur,
  id,
  className,
  ...reste
}: SelecteurProps) {
  const genere = useId();
  const identifiant = id ?? genere;
  const idAide = aide ? `${identifiant}-aide` : undefined;
  const idErreur = erreur ? `${identifiant}-erreur` : undefined;
  const decrit = [idAide, idErreur].filter(Boolean).join(" ") || undefined;
  return (
    <div className={classes(styles.champ, variante === "config" && styles.config, className)}>
      <label htmlFor={identifiant} className={styles.etiquette}>
        {label}
      </label>
      <select
        {...reste}
        id={identifiant}
        className={classes(
          styles.controle,
          styles.selecteur,
          mono && styles.mono,
          Boolean(erreur) && styles.invalide,
        )}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrit}
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur} disabled={o.desactive}>
            {o.libelle}
          </option>
        ))}
      </select>
      {aide ? (
        <span id={idAide} className={styles.aide}>
          {aide}
        </span>
      ) : null}
      {erreur ? (
        <span id={idErreur} className={styles.erreur} role="alert">
          {erreur}
        </span>
      ) : null}
    </div>
  );
}
