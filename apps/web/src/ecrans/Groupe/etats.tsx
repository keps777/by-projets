import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./groupe.module.css";

/** En-tête commun des états sans groupe : on peut toujours revenir à l'accueil. */
function EnteteSimple() {
  const { t } = useTranslation("Groupe");
  return (
    <Entete
      espace="ample"
      titre={t("titre")}
      sousTitre={t("sousTitre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
    />
  );
}

/** Chargement : les trois modes, le départ et « Qui paie quoi » qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Groupe");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Groupe"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteModes}`} />
        <div className={`${styles.squelette} ${styles.squeletteDepart}`} />
        <div className={`${styles.squelette} ${styles.squeletteCagnotte}`} />
      </EcranCorps>
    </>
  );
}

/** Aucun départ choisi (ou groupe introuvable) : on repart de l'accueil. */
export function EtatVide() {
  const { t } = useTranslation("Groupe");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Groupe">
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
  const { t } = useTranslation("Groupe");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Groupe">
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
