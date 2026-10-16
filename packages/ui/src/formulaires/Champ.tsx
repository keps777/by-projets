import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./champ.module.css";
import { classes } from "./utils";

export type VarianteChamp = "formulaire" | "config";

export interface ChampProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Libellé visible, relié au champ (clavier physique et lecteur d'écran). */
  label: ReactNode;
  /** « formulaire » : Vente, Connexion. « config » : fond nuit et étiquette en capitales (ConfigPersonne). */
  variante?: VarianteChamp;
  /** Chiffres et codes en Geist Mono (téléphone, montant, pièce). */
  mono?: boolean;
  aide?: ReactNode;
  erreur?: ReactNode;
}

/** Champ libellé + valeur, sans bordure Material : le libellé est au-dessus, le cadre est plein. */
export function Champ({
  label,
  variante = "formulaire",
  mono = false,
  aide,
  erreur,
  id,
  className,
  ...reste
}: ChampProps) {
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
      <input
        {...reste}
        id={identifiant}
        className={classes(
          styles.controle,
          mono && styles.mono,
          Boolean(erreur) && styles.invalide,
        )}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrit}
      />
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
