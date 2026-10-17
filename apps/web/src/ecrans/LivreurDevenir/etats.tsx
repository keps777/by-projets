import { Entete, EcranCorps, EcranPied } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./livreur-devenir.module.css";

/** Le « Retour » vers Moi et « Plus tard » restent là dans tous les états : on peut toujours repartir. */
function Cadre({ children, enAttente = false }: { children: ReactNode; enAttente?: boolean }) {
  const { t } = useTranslation("LivreurDevenir");
  return (
    <div className={styles.racine}>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Moi") }}
      />
      <EcranCorps
        className={styles.corps}
        data-planche="LivreurDevenir"
        {...(enAttente
          ? { role: "status", "aria-busy": true, "aria-label": t("etats.chargement") }
          : {})}
      >
        {children}
      </EcranCorps>
      <EcranPied className={styles.pied}>
        <a className={`${styles.plusTard} ${styles.plusTardSeul}`} href={urlPlanche("Moi")}>
          {t("actions.plusTard")}
        </a>
      </EcranPied>
    </div>
  );
}

/** Chargement : les blocs de la planche en gris qui pulse, dans le style nuit. */
export function EtatChargement() {
  return (
    <Cadre enAttente>
      <div className={`${styles.squelette} ${styles.squeletteChiffres} am-pulse`} />
      <div className={`${styles.squelette} ${styles.squeletteParticularites} am-pulse`} />
      <div className={`${styles.squelette} ${styles.squeletteRegles} am-pulse`} />
    </Cadre>
  );
}

/** Vide : le programme n'est pas ouvert (le serveur ne le propose pas). */
export function EtatVide() {
  const { t } = useTranslation("LivreurDevenir");
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
  const { t } = useTranslation("LivreurDevenir");
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
