import { EcranCorps } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { EnteteBillet } from "./EnteteBillet";
import styles from "./pass.module.css";

/** Chargement : le billet et ses cartes en gris, à la taille de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Pass");
  return (
    <>
      <EnteteBillet />
      <EcranCorps
        className={styles.corps}
        data-planche="Pass"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} am-pulse`} />
        <div className={`${styles.squeletteCartes} am-pulse`} />
      </EcranCorps>
    </>
  );
}

/** Vide : le billet n'existe pas (ou n'est pas à cette personne). */
export function EtatVide() {
  const { t } = useTranslation("Pass");
  return (
    <>
      <EnteteBillet />
      <EcranCorps className={styles.corps} data-planche="Pass">
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
  const { t } = useTranslation("Pass");
  return (
    <>
      <EnteteBillet />
      <EcranCorps className={styles.corps} data-planche="Pass">
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
