import { BoutonIcone, EcranCorps, IconeRetour } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./livraison.module.css";

/** Titre de l'écran pour les lecteurs d'écran : la planche n'en montre pas. */
export function TitreEcran() {
  const { t } = useTranslation();
  return <h1 className={styles.titreEcran}>{t("ecrans.Livraison.titre")}</h1>;
}

/** Retour vers le colis : il reste là dans tous les états, y compris le chargement et l'erreur. */
export function Retour({ colisId }: { colisId: string }) {
  const { t } = useTranslation("Livraison");
  if (colisId === "") return null;
  return (
    <BoutonIcone
      className={styles.retour}
      href={urlPlanche("ColisCode", { colisId })}
      aria-label={t("retour")}
      icone={<IconeRetour taille={20} />}
    />
  );
}

/** Bloc de carte sans carte : le fond de la planche et le retour. */
function HautVide({ colisId, enAttente = false }: { colisId: string; enAttente?: boolean }) {
  return (
    <div className={enAttente ? `${styles.carte} am-pulse` : styles.carte}>
      <Retour colisId={colisId} />
    </div>
  );
}

function Cadre({
  colisId,
  enAttente,
  children,
}: {
  colisId: string;
  enAttente?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.racine}>
      <TitreEcran />
      <HautVide colisId={colisId} enAttente={enAttente} />
      {children}
    </div>
  );
}

/** Chargement : la carte en gris qui pulse, puis les blocs de la planche, dans le style nuit. */
export function EtatChargement({ colisId }: { colisId: string }) {
  const { t } = useTranslation("Livraison");
  return (
    <Cadre colisId={colisId} enAttente>
      <EcranCorps
        className={styles.corps}
        data-planche="Livraison"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteLivreur} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteRemise} am-pulse`} />
        <div className={`${styles.squelette} am-pulse`} />
      </EcranCorps>
    </Cadre>
  );
}

/** Vide : ce colis n'est pas en livraison moto (ou n'est pas à cette personne), il n'y a rien à suivre. */
export function EtatVide({ colisId }: { colisId: string }) {
  const { t } = useTranslation("Livraison");
  return (
    <Cadre colisId={colisId}>
      <EcranCorps className={styles.corps} data-planche="Livraison">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
        </div>
      </EcranCorps>
    </Cadre>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ colisId, onReessayer }: { colisId: string; onReessayer: () => void }) {
  const { t } = useTranslation("Livraison");
  return (
    <Cadre colisId={colisId}>
      <EcranCorps className={styles.corps} data-planche="Livraison">
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
