import { useTranslation } from "react-i18next";
import styles from "./connexion-agent.module.css";

/** Sous l'écran de connexion des voyageurs : le chemin vers la connexion des agents (mode http seulement). */
export function LienConnexionAgent({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("ConnexionAgent");
  return (
    <p className={styles.lien}>
      <button type="button" className={styles.boutonLien} onClick={onClick}>
        {t("actions.agent")}
      </button>
    </p>
  );
}
