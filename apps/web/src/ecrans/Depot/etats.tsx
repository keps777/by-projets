import { ErreurHttp } from "@afrimove/api-client";
import { useTranslation } from "react-i18next";
import styles from "./depot.module.css";

interface Props {
  /** Code cherché ; vide tant que rien n'a été lu ni tapé. */
  code: string;
  chargement: boolean;
  erreur: unknown;
  onReessayer: () => void;
}

/**
 * La place de la fiche quand il n'y a pas de colis à montrer : rien de lu, recherche en cours, code inconnu (404) ou
 * panne. Même cadre et même hauteur que la fiche, dans le style nuit ; le reste de l'écran reste en place.
 */
export function EtatFiche({ code, chargement, erreur, onReessayer }: Props) {
  const { t } = useTranslation("Depot");

  if (chargement) {
    return (
      <div
        className={styles.ficheVide}
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <span className={`${styles.squelette} ${styles.squeletteTitre}`} />
        <span className={styles.squelette + " " + styles.squeletteLigne} />
        <span className={styles.squelette + " " + styles.squeletteLigne} />
      </div>
    );
  }

  if (erreur) {
    if (erreur instanceof ErreurHttp && erreur.statut === 404) {
      return (
        <div className={styles.ficheVide} data-ton="rouge" role="alert">
          <h2 className={styles.etatTitre}>{t("etats.inconnu.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.inconnu.detail")}</p>
        </div>
      );
    }
    return (
      <div className={styles.ficheVide} data-ton="rouge" role="alert">
        <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
        <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
        <button type="button" className={styles.reessayer} onClick={onReessayer}>
          {t("etats.erreur.reessayer")}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.ficheVide} data-code={code === "" ? "vide" : "attente"}>
      <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
      <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
    </div>
  );
}
