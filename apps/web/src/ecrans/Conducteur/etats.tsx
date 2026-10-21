import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./conducteur.module.css";

/** En-tête des états sans formulaire : on peut toujours revenir au covoiturage. */
function EnteteSimple() {
  const { t } = useTranslation("Conducteur");
  return (
    <Entete titre={t("titre")} retour={{ libelle: t("retour"), href: urlPlanche("Covoit") }} />
  );
}

/** Chargement : la carte du trajet, les options et la carte de réputation qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Conducteur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Conducteur"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteGrand} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteMoyen} am-pulse`} />
        <div className={`${styles.squelette} am-pulse`} />
      </EcranCorps>
    </>
  );
}

/** Vide : aucune voiture n'est déclarée, il n'y a pas de trajet à proposer. */
export function EtatVide() {
  const { t } = useTranslation("Conducteur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Conducteur">
        <div className={styles.etat} role="status">
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("Conducteur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Conducteur">
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
