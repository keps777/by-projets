import { useTranslation } from "react-i18next";
import styles from "./covoit-conducteur.module.css";

/** Chargement : trois tuiles et deux blocs qui pulsent, à la place des chiffres et des listes. */
export function EtatChargement() {
  const { t } = useTranslation("CovoitConducteur");
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("etats.chargement")}
      className={styles.attente}
    >
      <div className={styles.tuilesAttente}>
        <div className={`${styles.squeletteTuile} am-pulse`} />
        <div className={`${styles.squeletteTuile} am-pulse`} />
        <div className={`${styles.squeletteTuile} am-pulse`} />
      </div>
      <div className={`${styles.squeletteBloc} am-pulse`} />
      <div className={`${styles.squeletteBloc} am-pulse`} />
    </div>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("CovoitConducteur");
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
