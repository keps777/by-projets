import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./cadence-quai.module.css";

/** En-tête commun des états sans billet : on peut toujours revenir au billet de la cadence. */
function EnteteSimple() {
  const { t } = useTranslation("CadenceQuai");
  // Sans données, le titre est celui de la planche dans la liste des écrans (textes communs).
  const { t: commun } = useTranslation();
  return (
    <Entete
      className={styles.entete}
      titre={commun("ecrans.CadenceQuai.titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("CadenceBillet") }}
    />
  );
}

/** Chargement : des cartes de la taille de celles de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("CadenceQuai");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="CadenceQuai"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Vide : aucun billet de cadence scanné sur ce quai (404). */
export function EtatVide() {
  const { t } = useTranslation("CadenceQuai");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="CadenceQuai">
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
  const { t } = useTranslation("CadenceQuai");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="CadenceQuai">
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
