import type { ReactNode } from "react";
import { Cible, type PropsCible } from "./cible";
import { cx } from "./cx";
import { IconeChevronDroite } from "./icones";
import styles from "./carte-action.module.css";

type SansEnfants<T> = T extends unknown ? Omit<T, "children" | "title"> : never;

export type VarianteCarteAction = "carte" | "compacte" | "principale";
export type TonIcone = "ambre" | "vert" | "bleu" | "rouge" | "orange" | "craie";

export type PropsCarteAction = SansEnfants<PropsCible> & {
  /**
   * `carte` = carte Surface verticale de 96 px (grille de 2, Guichet) ; `compacte` = 74 px (grille de
   * 3, Main) ; `principale` = grande carte orange horizontale (« Vendre un billet »).
   */
  variante?: VarianteCarteAction;
  /** Titre de l'action. */
  titre: ReactNode;
  /** Précision sous le titre (11 px, Craie 2 ; 12/600 sur la carte principale). */
  description?: ReactNode;
  /** Icône du rond ; elle prend la couleur de `ton`. */
  icone?: ReactNode;
  /** Couleur de l'icône sur la carte Surface (les planches en utilisent six). */
  ton?: TonIcone;
};

/**
 * Carte d'action : les actions secondaires sont des cartes, jamais des menus. Lien si `href`,
 * bouton sinon.
 */
export function CarteAction({
  variante = "carte",
  titre,
  description,
  icone,
  ton = "ambre",
  className,
  ...reste
}: PropsCarteAction) {
  return (
    <Cible
      className={cx(styles.carte, styles[variante], className)}
      data-variante={variante}
      {...(reste as PropsCible)}
    >
      {icone !== undefined && (
        <span className={cx(styles.icone, variante !== "principale" && styles[`ton-${ton}`])}>
          {icone}
        </span>
      )}
      <span className={styles.textes}>
        <span className={styles.titre}>{titre}</span>
        {description !== undefined && <span className={styles.description}>{description}</span>}
      </span>
      {variante === "principale" && <IconeChevronDroite taille={26} className={styles.chevron} />}
    </Cible>
  );
}
