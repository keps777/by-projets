import { Interrupteur } from "@afrimove/ui";
import { useId } from "react";
import { detailEnAttente } from "./regles";
import styles from "./modules.module.css";

interface Props {
  nom: string;
  detail: string;
  actif: boolean;
  /** Le socle (guichet et caisse) reste allumé : l'interrupteur est affiché mais ne bouge pas. */
  socle: boolean;
  onBascule: () => void;
}

/** Une ligne de la planche : nom, état en une phrase, interrupteur de 44 x 26 px. */
export function LigneModule({ nom, detail, actif, socle, onBascule }: Props) {
  const idNom = useId();
  const idDetail = useId();
  return (
    <li className={styles.ligne}>
      <span className={styles.textes}>
        <span id={idNom} className={styles.nom}>
          {nom}
        </span>
        <span
          id={idDetail}
          className={styles.detail}
          data-attente={detailEnAttente(detail) ? "" : undefined}
        >
          {detail}
        </span>
      </span>
      <Interrupteur
        className={socle ? `${styles.commutateur} ${styles.socle}` : styles.commutateur}
        checked={actif}
        aria-labelledby={idNom}
        aria-describedby={idDetail}
        aria-disabled={socle ? true : undefined}
        onClick={(evenement) => {
          // Le socle ne se masque jamais : le toucher ne fait rien.
          if (socle) evenement.preventDefault();
        }}
        onChange={() => onBascule()}
      />
    </li>
  );
}
