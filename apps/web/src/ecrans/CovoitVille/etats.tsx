import { Bouton } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./covoit-ville.module.css";

/** Chargement : trois lignes qui pulsent à la place des offres. */
export function EtatChargement() {
  const { t } = useTranslation("CovoitVille");
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("etats.chargement")}
      className={styles.attente}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${styles.squelette} am-pulse`} />
      ))}
    </div>
  );
}

/** Aucune voiture ni moto ne part maintenant dans la direction du voyageur. */
export function EtatVide() {
  const { t } = useTranslation("CovoitVille");
  return (
    <p className={styles.etat} role="status">
      {t("etats.vide")}
    </p>
  );
}

/** Erreur de chargement des offres, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("CovoitVille");
  return (
    <div className={styles.etat} role="alert">
      <p className={styles.etatTexte}>{t("etats.erreur")}</p>
      <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
    </div>
  );
}
