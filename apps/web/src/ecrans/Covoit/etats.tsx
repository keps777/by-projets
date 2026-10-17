import { useTranslation } from "react-i18next";
import styles from "./covoit.module.css";

/** Chargement : la carte détaillée et deux cartes compactes qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Covoit");
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("etats.chargement")}
      className={styles.attente}
    >
      <div className={`${styles.squelette} ${styles.squeletteGrand} am-pulse`} />
      <div className={`${styles.squelette} am-pulse`} />
      <div className={`${styles.squelette} am-pulse`} />
    </div>
  );
}

/** Aucun conducteur ne part sur ce trajet avec ces filtres. */
export function EtatVide() {
  const { t } = useTranslation("Covoit");
  return (
    <div className={styles.etat} role="status">
      <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
      <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
    </div>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("Covoit");
  return (
    <div className={styles.etat} role="alert">
      <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
      <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
      <button type="button" className={styles.reessayer} onClick={onReessayer}>
        {t("etats.erreur.reessayer")}
      </button>
    </div>
  );
}
