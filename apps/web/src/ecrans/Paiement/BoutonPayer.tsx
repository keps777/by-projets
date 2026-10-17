import { IconeFleche } from "@afrimove/ui";
import type { ReactNode } from "react";
import styles from "./paiement.module.css";

interface Props {
  libelle: ReactNode;
  detail: ReactNode;
  enCours?: boolean;
  onClick: () => void;
}

/**
 * Variante locale du bouton principal du kit : la planche Paiement le dessine à 58 px avec un libellé de 16 px et
 * une flèche à droite, là où `Bouton` fait 56 px et 15 px. À retirer si le kit s'aligne sur la planche. Un bouton
 * (et non un lien) : il lance un paiement, l'ouverture du billet vient après la confirmation.
 */
export function BoutonPayer({ libelle, detail, enCours = false, onClick }: Props) {
  return (
    <button type="button" className={styles.payer} aria-busy={enCours} onClick={onClick}>
      <span className={styles.payerTextes}>
        <span className={styles.payerLibelle}>{libelle}</span>
        <span className={styles.payerDetail}>{detail}</span>
      </span>
      <IconeFleche taille={24} />
    </button>
  );
}
