import { Bouton, EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./configpersonne.module.css";

export type EtatSansPersonne = "chargement" | "vide" | "erreur";

/**
 * Chargement, personne introuvable ou erreur : l'en-tête et le retour à l'équipe restent, le corps dit ce qui se
 * passe dans le style nuit. Le titre est celui de l'écran (`ecrans.ConfigPersonne.titre`), faute du nom de la personne.
 */
export function EtatPersonne({
  etat,
  onReessayer,
}: {
  etat: EtatSansPersonne;
  onReessayer?: () => void;
}) {
  const { t } = useTranslation("ConfigPersonne");
  return (
    <div className={styles.racine} data-planche="ConfigPersonne">
      <Entete
        className={styles.entete}
        titre={t("ecrans.ConfigPersonne.titre", { ns: "translation" })}
        retour={{ libelle: t("retour"), href: urlPlanche("ConfigEquipeListe") }}
      />
      <EcranCorps className={styles.corps} data-etat={etat} aria-busy={etat === "chargement"}>
        {etat === "chargement" ? (
          <div role="status" aria-label={t("etats.chargement")} className={styles.squelettes}>
            <span className={`${styles.squelette} ${styles.squeletteChamps} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteDroits} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteLiens} am-pulse`} />
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
