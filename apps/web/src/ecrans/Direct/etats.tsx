import { EcranCorps } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { HautDeCarte, TitreEcran } from "./haut";
import styles from "./direct.module.css";

/** Chargement : la carte en gris qui pulse, puis les blocs de la planche (carte orange, arrêts, actions). */
export function EtatChargement({ billetId }: { billetId: string }) {
  const { t } = useTranslation("Direct");
  return (
    <div className={styles.racine}>
      <TitreEcran />
      <HautDeCarte billetId={billetId} enAttente />
      <EcranCorps
        className={styles.corps}
        data-planche="Direct"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squeletteCarte} am-pulse`} />
        <div className={`${styles.squeletteFrise} am-pulse`} />
        <div className={`${styles.squeletteActions} am-pulse`} />
      </EcranCorps>
    </div>
  );
}

/** Vide : ce billet n'existe pas (ou n'est pas à cette personne), donc aucun bus à suivre. */
export function EtatVide({ billetId }: { billetId: string }) {
  const { t } = useTranslation("Direct");
  return (
    <div className={styles.racine}>
      <TitreEcran />
      <HautDeCarte billetId={billetId} />
      <EcranCorps className={styles.corps} data-planche="Direct">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
        </div>
      </EcranCorps>
    </div>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({
  billetId,
  onReessayer,
}: {
  billetId: string;
  onReessayer: () => void;
}) {
  const { t } = useTranslation("Direct");
  return (
    <div className={styles.racine}>
      <TitreEcran />
      <HautDeCarte billetId={billetId} />
      <EcranCorps className={styles.corps} data-planche="Direct">
        <div className={styles.etat} role="alert">
          <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
          <button type="button" className={styles.reessayer} onClick={onReessayer}>
            {t("etats.erreur.reessayer")}
          </button>
        </div>
      </EcranCorps>
    </div>
  );
}
