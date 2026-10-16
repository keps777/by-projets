import styles from "./EcranUssd.module.css";
import { classes } from "./internes/classes";
import type { VarianteDonnees } from "./types";

export interface EcranUssdProps {
  /** Texte de l'écran, une ligne par saut de ligne (les espaces et sauts sont gardés). */
  texte: string;
  /** Libellé lu par les lecteurs d'écran. */
  ariaLabel?: string;
  /** Affiche le clavier 1 à 9, *, 0, # sous l'écran. */
  clavier?: boolean;
  /** `large` agrandit l'écran et le texte (démonstration en salle de contrôle). */
  variante?: VarianteDonnees;
  className?: string;
}

const TOUCHES = ["1", "2", "3", "4", "5", "6", "*", "0", "#"];

/**
 * Écran de téléphone à touches simulant USSD : afficheur vert-gris en Geist Mono et clavier.
 * Texte seul, sans accents, comme sur le réseau. Planche : USSD.
 */
export function EcranUssd({
  texte,
  ariaLabel = "Écran USSD simulé",
  clavier = true,
  variante = "mobile",
  className,
}: EcranUssdProps) {
  return (
    <div className={classes(styles.telephone, className)} data-variante={variante}>
      <div className={styles.afficheur} role="img" aria-label={`${ariaLabel} : ${texte}`}>
        <span aria-hidden="true" className={styles.texte}>
          {texte}
        </span>
      </div>
      {clavier ? (
        <div className={styles.clavier} aria-hidden="true">
          {TOUCHES.map((touche) => (
            <span key={touche} className={styles.touche}>
              {touche}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
