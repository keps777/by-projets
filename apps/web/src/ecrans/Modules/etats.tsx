import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./modules.module.css";

/** En-tête de la planche ; les états sans données gardent le titre et le retour. */
export function EnteteModules({ avecSousTitre = true }: { avecSousTitre?: boolean }) {
  const { t } = useTranslation("Modules");
  return (
    <Entete
      className={styles.entete}
      titre={t("titre")}
      {...(avecSousTitre ? { sousTitre: t("sousTitre") } : {})}
      retour={{ libelle: t("retour"), href: urlPlanche("Config") }}
    />
  );
}

/** Chargement : douze lignes de la taille de celles de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Modules");
  return (
    <>
      <EnteteModules />
      <EcranCorps
        className={styles.corps}
        data-planche="Modules"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <ul className={styles.liste} aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i} className={`${styles.ligne} ${styles.squelette}`}>
              <span className={styles.textes} />
            </li>
          ))}
        </ul>
      </EcranCorps>
    </>
  );
}

/** Vide : l'agence n'a aucun module à régler. */
export function EtatVide() {
  const { t } = useTranslation("Modules");
  return (
    <>
      <EnteteModules />
      <EcranCorps className={styles.corps} data-planche="Modules">
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
  const { t } = useTranslation("Modules");
  return (
    <>
      <EnteteModules />
      <EcranCorps className={styles.corps} data-planche="Modules">
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
