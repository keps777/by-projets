import { EcranCorps } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./relaisapp.module.css";

/** Titre de l'écran lu par les lecteurs d'écran ; la planche dessine son propre en-tête en simple texte. */
export function TitreEcran() {
  const { t } = useTranslation();
  return <h1 className={styles.titreEcran}>{t("ecrans.RelaisApp.titre")}</h1>;
}

/** Chargement : l'en-tête, les trois tuiles et les cartes de la planche, vides et qui pulsent (même hauteur). */
export function EtatChargement() {
  const { t } = useTranslation("RelaisApp");
  return (
    <>
      <TitreEcran />
      <div className={styles.entete} aria-hidden="true">
        <span className={styles.squeletteEntete} />
      </div>
      <EcranCorps
        className={styles.corps}
        data-planche="RelaisApp"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={styles.squeletteTuiles}>
          <div className={styles.squelette} />
          <div className={styles.squelette} />
          <div className={styles.squelette} />
        </div>
        <div className={styles.squeletteActions}>
          <div className={styles.squelette} />
          <div className={styles.squelette} />
        </div>
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Aucun point relais pour ce compte (404) : un texte et le lien d'inscription de la planche. */
export function EtatVide() {
  const { t } = useTranslation("RelaisApp");
  return (
    <>
      <TitreEcran />
      <EcranCorps className={styles.corps} data-planche="RelaisApp">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
          <a className={styles.lienEtat} href={urlPlanche("RelaisDevenir")}>
            {t("boutique.inscrire")}
          </a>
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("RelaisApp");
  return (
    <>
      <TitreEcran />
      <EcranCorps className={styles.corps} data-planche="RelaisApp">
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
