import { useConception } from "@afrimove/ui";
import type { MouseEvent, ReactNode } from "react";
import styles from "./guichet-colis.module.css";

interface Props {
  href: string;
  /** Numéro de touche : « touche 3 · » précède le détail seulement quand le flag conception est actif. */
  touche: number;
  libelle: ReactNode;
  detail: ReactNode;
  /** Montant à encaisser, déjà formaté. */
  montant: string;
  enCours?: boolean;
  onClick?: (evenement: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Variante locale du bouton principal du kit : la planche GuichetColis le dessine à 58 px, avec 16 px de marge, un
 * libellé de 16 px et le montant à droite, là où `Bouton` fait 56 px, 18 px et 15 px. À retirer si le kit s'aligne.
 */
export function BoutonEncaisser({
  href,
  touche,
  libelle,
  detail,
  montant,
  enCours = false,
  onClick,
}: Props) {
  const conception = useConception();
  return (
    <a href={href} className={styles.encaisser} aria-busy={enCours} onClick={onClick}>
      <span className={styles.encaisserTextes}>
        <span className={styles.encaisserLibelle}>{libelle}</span>
        <span className={styles.encaisserDetail}>
          {conception ? `touche ${touche} · ` : ""}
          {detail}
        </span>
      </span>
      <span className={styles.encaisserMontant}>{montant}</span>
    </a>
  );
}
