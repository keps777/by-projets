import { useConception } from "@afrimove/ui";
import type { ReactNode } from "react";
import styles from "./siegepay.module.css";

interface Props {
  libelle: ReactNode;
  detail: ReactNode;
  /** Numéro de touche : « touche 3 · » précède le détail seulement quand le flag conception est actif. */
  touche: number;
  prix: ReactNode;
  enCours?: boolean;
  onClick: () => void;
}

/**
 * Variante locale du bouton principal du kit : la planche SiegePay le dessine à 58 px avec un libellé de 16 px, là
 * où `Bouton` fait 56 px et 15 px. À retirer si le kit s'aligne sur la planche. Un bouton (et non un lien) : il
 * lance un paiement, la navigation vers le billet vient après la confirmation.
 */
export function BoutonPayer({ libelle, detail, touche, prix, enCours = false, onClick }: Props) {
  const conception = useConception();
  return (
    <button type="button" className={styles.payer} aria-busy={enCours} onClick={onClick}>
      <span className={styles.payerTextes}>
        <span className={styles.payerLibelle}>{libelle}</span>
        <span className={styles.payerDetail}>
          {conception ? `touche ${touche} · ` : ""}
          {detail}
        </span>
      </span>
      <span className={styles.payerPrix}>{prix}</span>
    </button>
  );
}
