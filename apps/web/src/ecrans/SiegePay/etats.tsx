import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./siegepay.module.css";

/** En-tête commun des états sans départ à afficher : on peut toujours revenir aux départs. */
function EnteteSimple() {
  const { t } = useTranslation("SiegePay");
  return (
    <Entete
      espace="ample"
      titre={t("titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
    />
  );
}

/** Chargement : les cartes de la planche (rappel, plan, voyageur) qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("SiegePay");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="SiegePay"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteBande}`} />
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Départ introuvable (404) ou complet : rien à choisir, retour aux départs. */
export function EtatVide({ complet = false }: { complet?: boolean }) {
  const { t } = useTranslation("SiegePay");
  const cle = complet ? "etats.complet" : "etats.vide";
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="SiegePay">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t(`${cle}.titre`)}</h2>
          <p className={styles.etatDetail}>{t(`${cle}.detail`)}</p>
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("SiegePay");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="SiegePay">
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
