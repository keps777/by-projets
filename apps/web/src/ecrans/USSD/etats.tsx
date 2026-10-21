import { EcranCorps } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { EnteteUssd } from "./EnteteUssd";
import styles from "./ussd.module.css";

/** Chargement : les deux colonnes de la planche en gris, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("USSD");
  return (
    <>
      <EnteteUssd />
      <EcranCorps
        className={styles.corps}
        data-planche="USSD"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} am-pulse`} />
        <div className={`${styles.squelette} am-pulse`} />
      </EcranCorps>
    </>
  );
}

/** Vide : le serveur n'a rien à montrer. */
export function EtatVide() {
  const { t } = useTranslation("USSD");
  return (
    <>
      <EnteteUssd />
      <EcranCorps className={styles.corps} data-planche="USSD">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("USSD");
  return (
    <>
      <EnteteUssd />
      <EcranCorps className={styles.corps} data-planche="USSD">
        <div className={styles.etat} role="alert">
          <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
          <button type="button" className={styles.reessayer} onClick={onReessayer}>
            {t("etats.erreur.reessayer")}
          </button>
        </div>
      </EcranCorps>
    </>
  );
}
