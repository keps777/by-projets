import { BadgeTouche, EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./vente.module.css";

/** En-tête commun des états sans contexte de vente : on peut toujours revenir au guichet. */
function EnteteSimple() {
  const { t } = useTranslation("Vente");
  return (
    <Entete
      titre={t("titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
      droite={<BadgeTouche n={2} />}
    />
  );
}

/** Chargement : la place des départs, du plan et des champs, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Vente");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Vente"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={styles.squelette} />
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

/** Vide : aucun départ ouvert à la vente. */
export function EtatVide() {
  const { t } = useTranslation("Vente");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Vente">
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
  const { t } = useTranslation("Vente");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Vente">
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
