import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./colis-code.module.css";

/** En-tête des états sans colis à montrer : on peut toujours revenir à l'accueil. */
function EnteteSimple() {
  const { t } = useTranslation("ColisCode");
  return (
    <Entete
      espace="ample"
      titre={t("ecrans.ColisCode.titre", { ns: "translation" })}
      retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
    />
  );
}

/** Chargement : le bloc du code et la frise qui pulsent, dans le style nuit. */
export function EtatChargement() {
  const { t } = useTranslation("ColisCode");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="ColisCode"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteCode}`} />
        <div className={`${styles.squelette} ${styles.squeletteFrise}`} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Le colis n'existe pas, ou n'est pas à cette personne : rien à montrer, surtout pas un code. */
export function EtatVide() {
  const { t } = useTranslation("ColisCode");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="ColisCode">
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
  const { t } = useTranslation("ColisCode");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="ColisCode">
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
