import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./relaisinscription.module.css";

/** En-tête commun des états sans fiche : on peut toujours revenir à la présentation du programme. */
function EnteteSimple() {
  const { t } = useTranslation("RelaisInscription");
  return (
    <Entete
      className={styles.entete}
      titre={t("titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("RelaisDevenir") }}
    />
  );
}

/** Chargement : trois cartes de la taille de celles de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("RelaisInscription");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="RelaisInscription"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={styles.squelette} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Vide : le serveur n'a pas de fiche à proposer (404). */
export function EtatVide() {
  const { t } = useTranslation("RelaisInscription");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="RelaisInscription">
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
  const { t } = useTranslation("RelaisInscription");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="RelaisInscription">
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
