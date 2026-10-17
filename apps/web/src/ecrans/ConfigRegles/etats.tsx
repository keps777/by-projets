import { Bouton, EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./configregles.module.css";

export type EtatSansRegles = "chargement" | "vide" | "erreur";

/**
 * Chargement, règles introuvables ou erreur : l'en-tête et le retour aux réglages restent, le corps dit ce qui se
 * passe dans le style nuit, avec des blocs de la hauteur de ceux de la planche pour que la mise en page ne bouge pas.
 */
export function EtatRegles({
  etat,
  onReessayer,
}: {
  etat: EtatSansRegles;
  onReessayer?: () => void;
}) {
  const { t } = useTranslation("ConfigRegles");
  return (
    <div className={styles.racine} data-planche="ConfigRegles">
      <Entete
        className={styles.entete}
        titre={t("entete.titre")}
        sousTitre={t("entete.sousTitre")}
        retour={{ libelle: t("entete.retour"), href: urlPlanche("Config") }}
      />
      <EcranCorps className={styles.corps} data-etat={etat} aria-busy={etat === "chargement"}>
        {etat === "chargement" ? (
          <div role="status" aria-label={t("etats.chargement")} className={styles.squelettes}>
            <span className={`${styles.squelette} ${styles.squeletteAnnulation} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteCaisse} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteMomo} am-pulse`} />
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
