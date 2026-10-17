import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./proche.module.css";

/** En-tête commun des états sans départ à afficher : on peut toujours revenir aux départs. */
function EnteteSimple() {
  const { t } = useTranslation("Proche");
  return (
    <Entete
      espace="ample"
      titre={t("titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
    />
  );
}

/** Chargement : les cartes de la planche (proches, destinataire, départs, paiement) qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Proche");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Proche"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteBande}`} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Aucun départ pour ce trajet ce jour-là : rien à payer, retour aux départs. */
export function EtatVide() {
  const { t } = useTranslation("Proche");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Proche">
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
  const { t } = useTranslation("Proche");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Proche">
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
