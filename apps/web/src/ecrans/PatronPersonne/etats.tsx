import { Bouton, EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./patronpersonne.module.css";

export type EtatSansFiche = "chargement" | "vide" | "erreur";

/**
 * Chargement, personne introuvable ou erreur : l'en-tête et le retour à l'équipe restent, le corps dit ce qui se
 * passe dans le style nuit. Le titre est celui de l'écran (`ecrans.PatronPersonne.titre`), faute du nom de la personne.
 */
export function EtatFiche({
  etat,
  onReessayer,
}: {
  etat: EtatSansFiche;
  onReessayer?: () => void;
}) {
  const { t } = useTranslation("PatronPersonne");
  return (
    <>
      <Entete
        titre={t("ecrans.PatronPersonne.titre", { ns: "translation" })}
        retour={{ libelle: t("retour"), href: urlPlanche("PatronEquipe") }}
      />
      <EcranCorps
        className={styles.corps}
        data-planche="PatronPersonne"
        data-etat={etat}
        aria-busy={etat === "chargement"}
      >
        {etat === "chargement" ? (
          <div role="status" aria-label={t("etats.chargement")} className={styles.squelettes}>
            <span className={`${styles.squelette} ${styles.squeletteFiche} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteTuiles} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteGraphique} am-pulse`} />
            <span className={`${styles.squelette} ${styles.squeletteJournal} am-pulse`} />
          </div>
        ) : (
          <div className={styles.etatMessage}>
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
    </>
  );
}
