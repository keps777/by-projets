import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./guichet-colis.module.css";

/** En-tête commun des états sans formulaire : on peut toujours revenir au guichet. */
function EnteteSimple() {
  const { t } = useTranslation("GuichetColis");
  return (
    <Entete titre={t("titre")} retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }} />
  );
}

/** Chargement : blocs de la taille de ceux de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("GuichetColis");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="GuichetColis"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={styles.squelette} />
        <div className={styles.squelette} />
        <div className={`${styles.squelette} ${styles.squeletteFin}`} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Vide : plus aucun départ où charger le colis ; l'« autre ville » reste possible quand elle est proposée. */
export function EtatVide({ autreVille }: { autreVille: boolean }) {
  const { t } = useTranslation("GuichetColis");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="GuichetColis">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
          {autreVille && (
            <a className={styles.reessayer} href={urlPlanche("InterAgences")}>
              {t("departs.autreVille.titre")} · {t("departs.autreVille.detail")}
            </a>
          )}
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("GuichetColis");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="GuichetColis">
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
