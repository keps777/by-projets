import { EcranCorps } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import styles from "./livreur.module.css";

/** Titre de l'écran pour les lecteurs d'écran : la planche n'en montre pas. */
export function TitreEcran() {
  const { t } = useTranslation();
  return <h1 className={styles.titreEcran}>{t("ecrans.Livreur.titre")}</h1>;
}

/** En-tête sans personne : un rond gris à la place du livreur, de la taille du vrai. */
function EnteteVide({ enAttente = false }: { enAttente?: boolean }) {
  return (
    <header className={styles.entete}>
      <span className={styles.identite}>
        <span
          className={enAttente ? `${styles.squeletteAvatar} am-pulse` : styles.squeletteAvatar}
        />
      </span>
    </header>
  );
}

function Cadre({ enAttente, children }: { enAttente?: boolean; children: ReactNode }) {
  return (
    <>
      <TitreEcran />
      <EnteteVide enAttente={enAttente ?? false} />
      {children}
    </>
  );
}

/** Chargement : les blocs de la planche en gris qui pulsent, dans le style nuit. */
export function EtatChargement() {
  const { t } = useTranslation("Livreur");
  return (
    <Cadre enAttente>
      <EcranCorps
        className={styles.corps}
        data-planche="Livreur"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteMission} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteRegles} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteBilan} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteMouvement} am-pulse`} />
      </EcranCorps>
    </Cadre>
  );
}

/** Vide : ce compte n'a pas d'espace livreur (404, 403) ; on propose de le devenir. */
export function EtatVide() {
  const { t } = useTranslation("Livreur");
  return (
    <Cadre>
      <EcranCorps className={styles.corps} data-planche="Livreur">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
          <Link className={styles.reessayer} to={urlPlanche("LivreurDevenir")}>
            {t("etats.vide.devenir")}
          </Link>
        </div>
      </EcranCorps>
    </Cadre>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("Livreur");
  return (
    <Cadre>
      <EcranCorps className={styles.corps} data-planche="Livreur">
        <div className={styles.etat} role="alert">
          <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
          <button type="button" className={styles.reessayer} onClick={onReessayer}>
            {t("etats.erreur.reessayer")}
          </button>
        </div>
      </EcranCorps>
    </Cadre>
  );
}
