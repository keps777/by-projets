import { EcranCorps, EcranPied } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { EnteteDevenir } from "./entete";
import styles from "./relais-devenir.module.css";

/**
 * Chargement : des blocs de la hauteur de ceux de la planche qui pulsent, et le pied à sa place, pour que la mise en
 * page ne bouge pas quand le programme arrive.
 */
export function EtatChargement() {
  const { t } = useTranslation("RelaisDevenir");
  return (
    <>
      <EnteteDevenir />
      <EcranCorps
        className={styles.corps}
        data-planche="RelaisDevenir"
        data-etat="chargement"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squelettePromesse} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteChiffres} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squelettePrerequis} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteEtapes} am-pulse`} />
      </EcranCorps>
      <EcranPied className={styles.pied} aria-hidden="true">
        <div className={`${styles.squelette} ${styles.squeletteBouton} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteBouton} am-pulse`} />
      </EcranPied>
    </>
  );
}

/** Vide : le programme n'existe pas (404). Le retour de l'en-tête ramène à Moi. */
export function EtatVide() {
  const { t } = useTranslation("RelaisDevenir");
  return (
    <>
      <EnteteDevenir />
      <EcranCorps className={styles.corps} data-planche="RelaisDevenir" data-etat="vide">
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
  const { t } = useTranslation("RelaisDevenir");
  return (
    <>
      <EnteteDevenir />
      <EcranCorps className={styles.corps} data-planche="RelaisDevenir" data-etat="erreur">
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
