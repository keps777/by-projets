import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./chauffeur.module.css";

/** En-tête des états sans feuille : le titre de la planche (clé commune) et le retour vers le quai. */
function EnteteSimple() {
  const { t } = useTranslation("Chauffeur");
  return (
    <Entete
      titre={t("ecrans.Chauffeur.titre", { ns: "translation" })}
      retour={{ libelle: t("retour"), href: urlPlanche("Quai") }}
    />
  );
}

/** Chargement : trois cartes de la hauteur de celles de la planche, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Chauffeur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Chauffeur"
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

/** Vide : aucune feuille de route pour ce bus (404). */
export function EtatVide() {
  const { t } = useTranslation("Chauffeur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Chauffeur">
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
  const { t } = useTranslation("Chauffeur");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Chauffeur">
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
