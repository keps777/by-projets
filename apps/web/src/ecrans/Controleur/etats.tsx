import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./controleur.module.css";

/** En-tête des états sans contrôle : le titre de la planche et le retour vers la gare. */
function EnteteSimple() {
  const { t } = useTranslation("Controleur");
  return (
    <Entete titre={t("titre")} retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }} />
  );
}

/** Chargement : des cartes de la taille de celles de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Controleur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Controleur"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={styles.squeletteTuiles}>
          <div className={styles.squeletteTuile} />
          <div className={styles.squeletteTuile} />
          <div className={styles.squeletteTuile} />
        </div>
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Vide : aucun contrôle en cours (404). */
export function EtatVide() {
  const { t } = useTranslation("Controleur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Controleur">
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
  const { t } = useTranslation("Controleur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Controleur">
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
