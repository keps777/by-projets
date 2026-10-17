import { BoutonIcone, EcranCorps, IconeRetour } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./course.module.css";

/** Titre de l'écran pour les lecteurs d'écran : la planche n'en montre pas. */
export function TitreEcran() {
  const { t } = useTranslation();
  return <h1 className={styles.titreEcran}>{t("ecrans.Course.titre")}</h1>;
}

/** Retour au billet : il reste là dans tous les états, y compris le chargement et l'erreur. */
export function Retour({ billetId }: { billetId: string }) {
  const { t } = useTranslation("Course");
  if (billetId === "") return null;
  return (
    <BoutonIcone
      className={styles.retour}
      href={urlPlanche("Pass", { billetId })}
      aria-label={t("retour")}
      icone={<IconeRetour taille={20} />}
    />
  );
}

/** Bloc de carte sans carte : le fond de la planche et le retour. */
function HautVide({ billetId, enAttente = false }: { billetId: string; enAttente?: boolean }) {
  return (
    <div className={enAttente ? `${styles.carte} am-pulse` : styles.carte}>
      <Retour billetId={billetId} />
    </div>
  );
}

function Cadre({
  billetId,
  enAttente,
  children,
}: {
  billetId: string;
  enAttente?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.racine}>
      <TitreEcran />
      <HautVide billetId={billetId} enAttente={enAttente} />
      {children}
    </div>
  );
}

/** Chargement : la carte en gris qui pulse, puis les blocs de la planche, dans le style nuit. */
export function EtatChargement({ billetId }: { billetId: string }) {
  const { t } = useTranslation("Course");
  return (
    <Cadre billetId={billetId} enAttente>
      <EcranCorps
        className={styles.corps}
        data-planche="Course"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteModes} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteChauffeur} am-pulse`} />
        <div className={`${styles.squelette} ${styles.squeletteRecap} am-pulse`} />
      </EcranCorps>
    </Cadre>
  );
}

/** Vide : pas de billet à qui proposer une course (ou billet inconnu, pas à cette personne). */
export function EtatVide({ billetId }: { billetId: string }) {
  const { t } = useTranslation("Course");
  return (
    <Cadre billetId={billetId}>
      <EcranCorps className={styles.corps} data-planche="Course">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
        </div>
      </EcranCorps>
    </Cadre>
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
  const { t } = useTranslation("Course");
  return (
    <Cadre billetId={billetId}>
      <EcranCorps className={styles.corps} data-planche="Course">
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
