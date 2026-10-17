import { EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./paiement.module.css";

/** En-tête commun des états sans commande à payer : on peut toujours revenir en arrière. */
function EnteteSimple() {
  const { t } = useTranslation("Paiement");
  return (
    <Entete
      espace="ample"
      titre={t("titre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Covoit") }}
    />
  );
}

/** Chargement : la carte du montant et les quatre lignes de moyens, qui pulsent. */
export function EtatChargement() {
  const { t } = useTranslation("Paiement");
  return (
    <>
      <EnteteSimple />
      <EcranCorps
        className={styles.corps}
        data-planche="Paiement"
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <div className={`${styles.squelette} ${styles.squeletteMontant}`} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
        <div className={styles.squelette} />
      </EcranCorps>
    </>
  );
}

type CleEtat = "vide" | "indisponible" | "payee" | "expiree" | "annulee";

/** Commande introuvable, plus à payer, ou paiement en ligne coupé : un titre, une phrase, éventuellement un lien. */
export function EtatMessage({
  cle,
  lien,
}: {
  cle: CleEtat;
  /** Lien d'action sous le message (« Ouvrir mon billet »). */
  lien?: { href: string; libelle: string };
}) {
  const { t } = useTranslation("Paiement");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Paiement">
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{t(`etats.${cle}.titre`)}</h2>
          <p className={styles.etatDetail}>{t(`etats.${cle}.detail`)}</p>
          {lien && (
            <a className={styles.etatLien} href={lien.href}>
              {lien.libelle}
            </a>
          )}
        </div>
      </EcranCorps>
    </>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("Paiement");
  return (
    <>
      <EnteteSimple />
      <EcranCorps className={styles.corps} data-planche="Paiement">
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
