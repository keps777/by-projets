import { IconeChevronDroite, useConception } from "@afrimove/ui";
import type { MouseEvent, ReactNode } from "react";
import styles from "./caisse.module.css";

interface Props {
  href: string;
  /** Numéro de touche : « touche 3 · » précède le détail seulement quand le flag conception est actif. */
  touche: number;
  libelle: ReactNode;
  detail: ReactNode;
  enCours?: boolean;
  onClick?: (evenement: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Variante locale du bouton principal du kit : la planche Caisse le dessine à 58 px, avec 16 px de marge et un
 * libellé de 16 px, là où `Bouton` fait 56 px, 18 px et 15 px. À retirer si le kit s'aligne sur la planche.
 */
export function BoutonCloture({ href, touche, libelle, detail, enCours = false, onClick }: Props) {
  const conception = useConception();
  return (
    <a href={href} className={styles.cloture} aria-busy={enCours} onClick={onClick}>
      <span className={styles.clotureTextes}>
        <span className={styles.clotureLibelle}>{libelle}</span>
        <span className={styles.clotureDetail}>
          {conception ? `touche ${touche} · ` : ""}
          {detail}
        </span>
      </span>
      <IconeChevronDroite taille={24} />
    </a>
  );
}
