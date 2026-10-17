import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./superviseur-equipe.module.css";

/** En-tête commun des états sans équipe : on peut toujours revenir à l'accueil du superviseur. */
function EnteteSimple() {
  const { t } = useTranslation("SuperviseurEquipe");
  return (
    <Entete titre={t("titre")} retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }} />
  );
}

/** Chargement : des blocs de la taille de ceux de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("SuperviseurEquipe");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="SuperviseurEquipe"
        data-etat="chargement"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteListe} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteFiche} am-pulse`} />
      </EcranCorps>
    </>
  );
}

/** Vide : personne n'est en service dans la gare aujourd'hui. */
export function EtatVide() {
  const { t } = useTranslation("SuperviseurEquipe");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="SuperviseurEquipe" data-etat="vide">
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
  const { t } = useTranslation("SuperviseurEquipe");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="SuperviseurEquipe" data-etat="erreur">
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
