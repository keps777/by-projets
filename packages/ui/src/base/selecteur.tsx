import { useRef, type ReactNode } from "react";
import { cx } from "./cx";
import styles from "./selecteur.module.css";

export interface OptionSelecteur {
  /** Valeur renvoyée à `onChange`. */
  valeur: string;
  libelle: ReactNode;
  /** Icône devant le libellé (13 à 16 px). */
  icone?: ReactNode;
}

export interface PropsSelecteur {
  /** Les deux segments, dans l'ordre d'affichage. */
  options: readonly [OptionSelecteur, OptionSelecteur];
  /** Valeur du segment actif. */
  valeur: string;
  onChange: (valeur: string) => void;
  /** Nom du groupe lu par les lecteurs d'écran, par exemple « Type de trajet ». Obligatoire. */
  "aria-label": string;
  /**
   * `orange` = accueil voyageur ; `vert` = covoiturage ; `neutre` = segment Surface 2 sur fond
   * Profond (Passager / Je conduis).
   */
  ton?: "orange" | "vert" | "neutre";
  /** `m` = 36 px (Main), `l` = 40 px (Covoit). La zone tactile atteint 44 px dans les deux cas. */
  taille?: "m" | "l";
  /**
   * Affiche sous le sélecteur la mention « glisse pour changer » et ses deux repères ; une chaîne
   * remplace le texte. Un glissement horizontal sur le sélecteur change alors de segment.
   */
  mention?: boolean | string;
  className?: string;
}

const SEUIL_GLISSEMENT = 40;

/** Sélecteur à deux segments, que l'on touche ou que l'on glisse. */
export function Selecteur({
  options,
  valeur,
  onChange,
  "aria-label": ariaLabel,
  ton = "orange",
  taille = "m",
  mention = false,
  className,
}: PropsSelecteur) {
  const depart = useRef<number | null>(null);
  const indexActif = options[1].valeur === valeur ? 1 : 0;
  const texteMention =
    typeof mention === "string" ? mention : mention ? "glisse pour changer" : null;

  function fin(x: number) {
    if (depart.current === null) return;
    const dx = x - depart.current;
    depart.current = null;
    if (Math.abs(dx) < SEUIL_GLISSEMENT) return;
    // Glisser vers la gauche révèle le second segment, vers la droite le premier.
    const cible = dx < 0 ? options[1] : options[0];
    if (cible.valeur !== valeur) onChange(cible.valeur);
  }

  return (
    <div className={cx(styles.racine, className)}>
      <div
        role="group"
        aria-label={ariaLabel}
        className={cx(styles.groupe, styles[`ton-${ton}`], styles[`taille-${taille}`])}
        data-ton={ton}
        onPointerDown={(e) => {
          depart.current = e.clientX;
        }}
        onPointerUp={(e) => fin(e.clientX)}
        onPointerCancel={() => {
          depart.current = null;
        }}
      >
        {options.map((option) => {
          const actif = option.valeur === valeur;
          return (
            <button
              key={option.valeur}
              type="button"
              aria-pressed={actif}
              className={cx(styles.segment, actif && styles.actif)}
              onClick={() => {
                if (!actif) onChange(option.valeur);
              }}
            >
              {option.icone}
              {option.libelle}
            </button>
          );
        })}
      </div>
      {texteMention !== null && (
        <div className={styles.mention}>
          <span className={cx(styles.repere, indexActif === 0 && styles.repereActif)} />
          <span className={cx(styles.repere, indexActif === 1 && styles.repereActif)} />
          <span>{texteMention}</span>
        </div>
      )}
    </div>
  );
}
