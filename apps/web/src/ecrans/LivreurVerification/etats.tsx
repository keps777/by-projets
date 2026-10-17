import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { PiedVerification } from "./verification-vue";
import styles from "./livreur-verification.module.css";

/** En-tête des états sans suivi à montrer : le retour mène toujours à Moi. */
function EnteteSimple({ enAttente = false }: { enAttente?: boolean }) {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("LivreurVerification");
  return (
    <Entete
      titre={t("ecrans.LivreurVerification.titre")}
      retour={{ libelle: tp("retour"), href: urlPlanche("Moi") }}
      {...(enAttente
        ? { droite: <span className={`${styles.squelettePastille} am-pulse`} aria-hidden="true" /> }
        : {})}
    />
  );
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** Chargement : les blocs de la planche en gris qui pulsent, dans le style nuit, aux mêmes hauteurs. */
export function EtatChargement() {
  const { t } = useTranslation("LivreurVerification");
  return (
    <>
      <EnteteSimple enAttente />
      <EcranCorps
        className={styles.corps}
        data-planche="LivreurVerification"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <Squelette className={styles.squeletteFrise} />
        <Squelette className={styles.squeletteTuiles} />
        <Squelette className={styles.squeletteRecit} />
        <Squelette className={styles.squeletteParticularites} />
      </EcranCorps>
      <PiedVerification />
    </>
  );
}

/** Vide : ce compte n'a déposé aucune demande de livreur (404, 403) ; on propose d'en déposer une. */
export function EtatVide() {
  const { t } = useTranslation("LivreurVerification");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="LivreurVerification">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
          <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
          <a className={styles.reessayer} href={urlPlanche("LivreurDevenir")}>
            {t("etats.vide.devenir")}
          </a>
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("LivreurVerification");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="LivreurVerification">
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
