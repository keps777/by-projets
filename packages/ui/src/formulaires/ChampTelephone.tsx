import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./champ.module.css";
import { classes } from "./utils";

export interface ChampTelephoneProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  /** Indicatif affiché dans la pastille. Le drapeau du Cameroun accompagne +237. */
  indicatif?: string;
  /** Affiche la pastille verte de numéro reconnu. */
  valide?: boolean;
  erreur?: ReactNode;
}

function DrapeauCameroun() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      <rect width="6" height="12" fill="#1E7A3A" />
      <rect x="6" width="6" height="12" fill="#D21F2A" />
      <rect x="12" width="6" height="12" fill="#F2C40F" />
      <path d="M9 3.2l.8 1.9 2 .1-1.6 1.3.6 2L9 7.4l-1.8 1.1.6-2L6.2 5.2l2-.1z" fill="#F2C40F" />
    </svg>
  );
}

/** Champ numéro de téléphone de la planche Connexion : pastille +237, chiffres 20 px, coche verte. */
export function ChampTelephone({
  label,
  indicatif = "+237",
  valide = false,
  erreur,
  id,
  className,
  ...reste
}: ChampTelephoneProps) {
  const genere = useId();
  const identifiant = id ?? genere;
  const idErreur = erreur ? `${identifiant}-erreur` : undefined;
  return (
    <div className={classes(styles.telephone, className)}>
      <label htmlFor={identifiant} className={styles.etiquette}>
        {label}
      </label>
      <div className={classes(styles.cadre, Boolean(erreur) && styles.cadreInvalide)}>
        <span className={styles.indicatif}>
          {indicatif === "+237" ? <DrapeauCameroun /> : null}
          {indicatif}
        </span>
        <input
          autoComplete="tel-national"
          inputMode="tel"
          {...reste}
          id={identifiant}
          type="tel"
          className={styles.numero}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={idErreur}
        />
        {valide ? (
          <span
            className={styles.valide}
            data-testid="numero-valide"
            role="img"
            aria-label="Numéro valide"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
        ) : null}
      </div>
      {erreur ? (
        <span id={idErreur} className={styles.erreur} role="alert">
          {erreur}
        </span>
      ) : null}
    </div>
  );
}
