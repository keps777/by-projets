import { EcranCorps } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { Haut, adresseColis } from "./haut";
import styles from "./relais.module.css";

/** Chargement : la carte vide et les cartes des relais qui pulsent, dans le style nuit. */
export function EtatChargement({ colisId }: { colisId: string }) {
  const { t } = useTranslation("Relais");
  return (
    <>
      <Haut colisId={colisId} />
      <EcranCorps
        className={styles.corps}
        data-planche="Relais"
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

/** Aucun point relais près du destinataire, ou colis introuvable : un texte et le retour au colis. */
export function EtatVide({ colisId, cle }: { colisId: string; cle: "aucun" | "introuvable" }) {
  const { t } = useTranslation("Relais");
  return (
    <>
      <Haut colisId={colisId} />
      <EcranCorps className={styles.corps} data-planche="Relais">
        <div className={styles.etatPlanche}>
          <h2 className={styles.etatTitre}>{t(`etats.${cle}.titre`)}</h2>
          <p className={styles.etatDetail}>{t(`etats.${cle}.detail`)}</p>
          <a className={styles.retourColis} href={adresseColis(colisId)}>
            {t("etats.retourColis")}
          </a>
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ colisId, onReessayer }: { colisId: string; onReessayer: () => void }) {
  const { t } = useTranslation("Relais");
  return (
    <>
      <Haut colisId={colisId} />
      <EcranCorps className={styles.corps} data-planche="Relais">
        <div className={styles.etatPlanche} role="alert">
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
