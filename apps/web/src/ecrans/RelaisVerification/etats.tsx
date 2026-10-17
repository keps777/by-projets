import { Bouton, EcranCorps, EcranPied, Entete, IconeFleche } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./relais-verification.module.css";

/** Le « Retour » vers Moi et « Retour à mon espace » restent là dans tous les états : on peut toujours repartir. */
function Cadre({ children, enAttente = false }: { children: ReactNode; enAttente?: boolean }) {
  const { t } = useTranslation("RelaisVerification");
  return (
    <div className={styles.racine}>
      <Entete titre={t("titre")} retour={{ libelle: t("retour"), href: urlPlanche("Moi") }} />
      <EcranCorps
        className={styles.corps}
        data-planche="RelaisVerification"
        {...(enAttente
          ? { role: "status", "aria-busy": true, "aria-label": t("etats.chargement") }
          : {})}
      >
        {children}
      </EcranCorps>
      <EcranPied className={styles.pied}>
        <Bouton
          variante="assistant"
          className={`${styles.retourEspace} ${styles.retourEspaceSeul}`}
          href={urlPlanche("Moi")}
          libelle={t("actions.retourEspace")}
          icone={<IconeFleche taille={22} trait={2.6} />}
        />
      </EcranPied>
    </div>
  );
}

/** Chargement : les blocs de la planche en gris qui pulse, dans le style nuit. */
export function EtatChargement() {
  return (
    <Cadre enAttente>
      <div className={`${styles.squelette} ${styles.squeletteSuivi} am-pulse`} />
      <div className={`${styles.squelette} ${styles.squeletteCartes} am-pulse`} />
      <div className={`${styles.squelette} ${styles.squeletteRecit} am-pulse`} />
    </Cadre>
  );
}

/** Vide : aucune fiche envoyée, donc rien à suivre (le serveur répond « introuvable »). */
export function EtatVide() {
  const { t } = useTranslation("RelaisVerification");
  return (
    <Cadre>
      <div className={styles.etat}>
        <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
        <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
      </div>
    </Cadre>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("RelaisVerification");
  return (
    <Cadre>
      <div className={styles.etat} role="alert">
        <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
        <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
        <button type="button" className={styles.reessayer} onClick={onReessayer}>
          {t("etats.erreur.reessayer")}
        </button>
      </div>
    </Cadre>
  );
}
