import { useTranslation } from "react-i18next";
import styles from "./chargement.module.css";

/** Affiché le temps de charger le layout et la page d'une route : fond Nuit, rien de plus. */
export function Chargement() {
  const { t } = useTranslation();
  return <div className={styles.chargement} role="status" aria-label={t("coquille.chargement")} />;
}
