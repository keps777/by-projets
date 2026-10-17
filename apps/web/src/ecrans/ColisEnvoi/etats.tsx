import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./colis-envoi.module.css";

/** En-tête commun des états sans formulaire : on peut toujours revenir à l'accueil. */
function EnteteSimple() {
  const { t } = useTranslation("ColisEnvoi");
  return (
    <Entete
      espace="ample"
      titre={t("titre")}
      sousTitre={t("sousTitre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
    />
  );
}

/** Chargement : le cadre photo, les champs et le choix du départ qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("ColisEnvoi");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="ColisEnvoi"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
        <div className={`${styles.squelette} ${styles.squeletteCarte}`} />
      </EcranCorps>
    </>
  );
}

/** Aucun départ ne peut porter de colis : rien à envoyer pour l'instant. */
export function EtatVide() {
  const { t } = useTranslation("ColisEnvoi");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="ColisEnvoi">
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
  const { t } = useTranslation("ColisEnvoi");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="ColisEnvoi">
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
