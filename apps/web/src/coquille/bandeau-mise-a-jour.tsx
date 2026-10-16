import { useTranslation } from "react-i18next";
import { useMiseAJour } from "./mise-a-jour";
import styles from "./bandeau-mise-a-jour.module.css";

/** Bandeau « nouvelle version prête » : s'affiche quand le service worker attend, un appui l'active. */
export function BandeauMiseAJour() {
  const { t } = useTranslation();
  const { prete, activer } = useMiseAJour();
  if (!prete) return null;
  return (
    <div className={styles.bandeau} role="status">
      <span className={styles.message}>{t("coquille.miseAJour.message")}</span>
      <button type="button" className={styles.action} onClick={() => activer?.()}>
        {t("coquille.miseAJour.action")}
      </button>
    </div>
  );
}
