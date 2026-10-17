import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./caisse.module.css";

/** En-tête commun des états sans session : on peut toujours revenir au guichet. */
function EnteteSimple() {
  const { t } = useTranslation("Caisse");
  return (
    <Entete
      className={styles.entete}
      titre={t("titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
    />
  );
}

/** Chargement : trois cartes de la taille de celles de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Caisse");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Caisse"
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

/** Vide : aucune session de caisse (404). */
export function EtatVide() {
  const { t } = useTranslation("Caisse");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Caisse">
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
  const { t } = useTranslation("Caisse");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Caisse">
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
