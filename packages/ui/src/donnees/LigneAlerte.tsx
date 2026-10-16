import type { ReactNode } from "react";
import styles from "./LigneAlerte.module.css";
import { classes } from "./internes/classes";
import type { VarianteDonnees } from "./types";

export type EtatAlerte = "ambre" | "rouge" | "bleu" | "vert";

/** Texte lu à la place du point de couleur (la couleur seule ne doit pas porter le sens). */
const NIVEAUX: Record<EtatAlerte, string> = {
  ambre: "À surveiller",
  rouge: "Urgent",
  bleu: "Information",
  vert: "En règle",
};

export interface LigneAlerteProps {
  texte: ReactNode;
  /** Heure ou repère de date à droite, ex. « 14:00 », « hier ». */
  heure?: string;
  etat?: EtatAlerte;
  /** Remplace le texte masqué du niveau, lu avant le texte de l'alerte. */
  niveau?: string;
  /** Rend la ligne cliquable en lien. */
  href?: string;
  /** Rend la ligne cliquable en bouton (sans `href`). */
  onClick?: () => void;
  /** `large` : fond nuit, texte 13 px, heure en mono (colonne « À traiter » de Controle). */
  variante?: VarianteDonnees;
}

/**
 * Ligne d'alerte : point de couleur, texte, heure. À placer dans une `ListeGlissable`.
 * Planches : Patron (alertes), Controle (À traiter).
 */
export function LigneAlerte({
  texte,
  heure,
  etat = "ambre",
  niveau,
  href,
  onClick,
  variante = "mobile",
}: LigneAlerteProps) {
  const contenu = (
    <>
      <span className={styles.point} data-etat={etat} aria-hidden="true" />
      <span className={styles.texte}>
        <span className={styles.masque}>{niveau ?? NIVEAUX[etat]} : </span>
        {texte}
      </span>
      {heure ? <span className={styles.heure}>{heure}</span> : <span />}
    </>
  );
  return (
    <li className={styles.item} data-variante={variante}>
      {href ? (
        <a className={classes(styles.ligne)} href={href}>
          {contenu}
        </a>
      ) : onClick ? (
        <button type="button" className={styles.ligne} onClick={onClick}>
          {contenu}
        </button>
      ) : (
        <div className={styles.ligne}>{contenu}</div>
      )}
    </li>
  );
}
