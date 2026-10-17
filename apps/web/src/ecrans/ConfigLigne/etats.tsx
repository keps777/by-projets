import { Bouton, EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./configligne.module.css";

export type EtatSansLigne = "chargement" | "vide" | "erreur";

/**
 * Chargement, ligne introuvable ou erreur : l'en-tête et le retour aux réglages restent, le corps dit ce qui se passe
 * dans le style nuit. Le titre est celui de l'écran (`ecrans.ConfigLigne.titre`), faute du nom de la ligne.
 */
export function EtatLigne({
  etat,
  onReessayer,
}: {
  etat: EtatSansLigne;
  onReessayer?: () => void;
}) {
  const { t } = useTranslation("ConfigLigne");
  return (
    <div className={styles.racine} data-planche="ConfigLigne">
      <Entete
        className={styles.entete}
        titre={t("ecrans.ConfigLigne.titre", { ns: "translation" })}
        retour={{ libelle: t("retour"), href: urlPlanche("Config") }}
      />
      <EcranCorps className={styles.corps} data-etat={etat} aria-busy={etat === "chargement"}>
        {etat === "chargement" ? (
          <div role="status" aria-label={t("etats.chargement")} className={styles.squelettes}>
            <span className={`${styles.squelette} ${styles.squeletteDeparts} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteCartes} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteOptions} am-pulse`} />
          </div>
        ) : (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
              <span className={styles.point} aria-hidden="true" />
              <p>{t(etat === "erreur" ? "etats.erreur" : "etats.vide")}</p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        )}
      </EcranCorps>
    </div>
  );
}
