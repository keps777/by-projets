import { ErreurHttp, agence } from "@afrimove/api-client";
import {
  BadgeTouche,
  CompteurCoupures,
  COUPURES_PAR_DEFAUT,
  EcranCorps,
  EcranPied,
  Entete,
  totalComptage,
  type ComptageCoupures,
} from "@afrimove/ui";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import { BoutonCloture } from "./BoutonCloture";
import {
  depuisSession,
  evaluerEcart,
  formaterMontant,
  heureDouala,
  minuitPasse,
  versDonneesComptage,
} from "./calculs";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import styles from "./caisse.module.css";

export type SessionCaisse = NonNullable<ReturnType<typeof agence.useCaisseSession>["data"]>;

/** Planche « Caisse » (touche 2) : fermer ma caisse. Lit la session par `useCaisseSession`, écrit par les hooks de caisse. */
export function EcranCaisse() {
  const requete = agence.useCaisseSession();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <FermerCaisse session={requete.data} recharger={() => void requete.refetch()} />;
}

/** Le serveur refuse d'écrire sur une caisse qui n'est plus ouverte (clôturée, validée, fermée à minuit). */
function dejaFermee(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && erreur.code === "SESSION_NON_OUVERTE";
}

/** Rythme auquel on relit la session après minuit, le temps que le serveur la ferme (il passe chaque minute). */
const RELECTURE_APRES_MINUIT_MS = 15_000;

function FermerCaisse({ session, recharger }: { session: SessionCaisse; recharger: () => void }) {
  const { t } = useTranslation("Caisse");
  const navigate = useNavigate();
  const maintenant = useMaintenant();
  const compter = agence.useCompterCaisse();
  const cloturer = agence.useCloturerCaisse();

  const [comptage, setComptage] = useState<ComptageCoupures>(() =>
    depuisSession(session.comptage.coupures, session.comptage.pieces),
  );
  const [echec, setEchec] = useState(false);
  const enCours = useRef(false);

  // Une session non clôturée se ferme seule à minuit (Douala) : c'est le serveur qui la ferme (l'appareil n'a pas
  // le droit d'envoyer `auto: true`). L'écran alerte, fige le comptage et relit la session jusqu'à sa fermeture.
  const minuitAtteint = session.etat === "ouverte" && minuitPasse(session.ouverteA, maintenant);
  const [fermeeParMinuit, setFermeeParMinuit] = useState(minuitAtteint);
  if (minuitAtteint && !fermeeParMinuit) setFermeeParMinuit(true);
  useEffect(() => {
    if (!fermeeParMinuit || session.etat !== "ouverte") return;
    recharger();
    const minuterie = setInterval(recharger, RELECTURE_APRES_MINUIT_MS);
    return () => clearInterval(minuterie);
    // `recharger` change à chaque rendu : seule la présence de l'alerte et l'état de la session comptent.
  }, [fermeeParMinuit, session.etat]);

  const ouverte = session.etat === "ouverte";
  const modifiable = ouverte && !fermeeParMinuit;
  // Une caisse déjà clôturée se relit : on montre ce que le serveur a enregistré, pas la saisie locale.
  const comptageAffiche = ouverte
    ? comptage
    : depuisSession(session.comptage.coupures, session.comptage.pieces);
  const compte = totalComptage(comptageAffiche);
  const ecart = evaluerEcart(session.cashAttendu, compte, session.ecart.tolerance);
  const { decompte } = session;

  /**
   * Enregistre le comptage puis clôture : la session passe « clôturée », le superviseur la valide avec son PIN.
   * Si le serveur répond qu'elle n'est plus ouverte (clôture déjà arrivée, réponse perdue, minuit), on relit la
   * session au lieu d'afficher une panne : l'état du serveur fait foi.
   */
  async function envoyerCloture(): Promise<boolean> {
    if (enCours.current) return false;
    enCours.current = true;
    try {
      await compter.mutateAsync({
        sessionId: session.sessionId,
        ...versDonneesComptage(comptage, COUPURES_PAR_DEFAUT),
      });
      await cloturer.mutateAsync({
        sessionId: session.sessionId,
        cashCompte: compte,
        cashAttendu: session.cashAttendu,
        ecart: ecart.montant,
        auto: false,
      });
      return true;
    } catch (erreur) {
      if (dejaFermee(erreur)) {
        recharger();
        return true;
      }
      return false;
    } finally {
      enCours.current = false;
    }
  }

  async function surCloture(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (modifiable) {
      setEchec(false);
      if (!(await envoyerCloture())) {
        setEchec(true);
        return;
      }
    }
    void navigate(urlPlanche("Superviseur"));
  }

  return (
    <>
      <Entete
        className={styles.entete}
        titre={t("titre")}
        sousTitre={t("sousTitre", {
          numero: session.numero,
          agent: session.agent.nom,
          heure: heureDouala(session.ouverteA),
          fond: formaterMontant(session.fondDeCaisse),
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
        droite={<BadgeTouche n={2} />}
      />

      <EcranCorps className={styles.corps} data-planche="Caisse">
        {fermeeParMinuit && (
          <p role="alert" className={styles.alerte}>
            {t("minuit")}
          </p>
        )}

        <section className={styles.carte} aria-label={t("appCompte.titre")}>
          <div className={styles.etiquette}>
            <span>{t("appCompte.titre")}</span>
            <span className={styles.etiquetteDroite}>
              {t("appCompte.periode", {
                debut: heureDouala(session.periode.debut),
                fin: heureDouala(session.periode.fin),
              })}
            </span>
          </div>
          <dl className={styles.lignes}>
            <dt>{t("appCompte.billetsCash", { nombre: decompte.billetsCash.nombre })}</dt>
            <dd className={styles.montant}>{formaterMontant(decompte.billetsCash.montant)}</dd>
            <dt>{t("appCompte.colisCash", { nombre: decompte.colisCash.nombre })}</dt>
            <dd className={styles.montant}>{formaterMontant(decompte.colisCash.montant)}</dd>
            <dt>{t("appCompte.fond")}</dt>
            <dd className={styles.montant}>{formaterMontant(session.fondDeCaisse)}</dd>
            <dt>{t("appCompte.annulations", { nombre: decompte.annulationsValidees.nombre })}</dt>
            <dd className={`${styles.montant} ${styles.montantRetire}`}>
              {formaterMontant(-decompte.annulationsValidees.montant)}
            </dd>
            <dt>{t("appCompte.momo", { nombre: decompte.momo.ventes })}</dt>
            <dd className={`${styles.montant} ${styles.montantAPart}`}>
              {formaterMontant(decompte.momo.montant)}
            </dd>
          </dl>
          <div className={styles.attendu}>
            <span className={styles.attenduLibelle}>{t("appCompte.cashAttendu")}</span>
            <span className={styles.attenduMontant}>{formaterMontant(session.cashAttendu)}</span>
          </div>
        </section>

        <section className={`${styles.carte} ${styles.carteComptage}`}>
          <div className={styles.etiquette}>
            <span>{t("jeCompte.titre")}</span>
            <span className={styles.etiquetteDroite}>{t("jeCompte.aide")}</span>
          </div>
          <CompteurCoupures
            value={comptageAffiche}
            onChange={(suivant) => {
              // Une session déjà clôturée (ou fermée à minuit) se relit, elle ne se recompte plus.
              if (modifiable) setComptage(suivant);
            }}
          />
        </section>

        <section
          className={styles.ecart}
          data-statut={ecart.statut}
          aria-label={t("ecart.libelle")}
        >
          <span className={styles.ecartTexte}>
            <span className={styles.ecartLibelle}>{t("ecart.libelle")}</span>
            <span className={styles.ecartMontant}>{formaterMontant(ecart.montant, true)}</span>
          </span>
          <span className={styles.ecartDetail}>
            {t("ecart.tolerance", { montant: formaterMontant(session.ecart.tolerance) })}
            <br />
            {t("ecart.historique", {
              hier: formaterMontant(session.ecart.hier),
              semaine: formaterMontant(session.ecart.semaine),
            })}
          </span>
        </section>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {echec && (
          <p role="alert" className={styles.alerte}>
            {t("cloture.echec")}
          </p>
        )}
        <BoutonCloture
          href={urlPlanche("Superviseur")}
          touche={3}
          libelle={t("cloture.libelle")}
          detail={t("cloture.detail")}
          enCours={compter.isPending || cloturer.isPending}
          onClick={(e) => void surCloture(e)}
        />
      </EcranPied>
    </>
  );
}
