import type { patron as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { FeuillePin } from "./FeuillePin";
import { milliers, montantCourt, partDuPlafond, pourcent } from "./formats";
import styles from "./financement.module.css";

export type EtatFinancement = "chargement" | "vide" | "erreur" | "pret";

interface Props {
  etat: EtatFinancement;
  offre: contrats.OffreFinancement | undefined;
  onReessayer: () => void;
  /** Crée le dossier d'avance signé par le PIN, puis ouvre le dossier. Une exception : erreur technique ou PIN refusé. */
  onDemander: (montant: number, pin: string) => Promise<void>;
  /** Active ou coupe le paiement du billet en 2 fois, signé par le PIN. Une exception : PIN refusé ou erreur technique. */
  onReglerDeuxFois: (actif: boolean, pin: string) => Promise<void>;
}

/** En-tête commun : le retour ramène toujours au patron, même quand l'offre ne se charge pas. */
function EnteteFinancement({ sousTitre }: { sousTitre?: ReactNode }) {
  const { t } = useTranslation("Financement");
  return (
    <Entete
      titre={t("titre")}
      {...(sousTitre !== undefined ? { sousTitre } : {})}
      retour={{ libelle: t("retour"), href: urlPlanche("Patron") }}
    />
  );
}

export function VueFinancement({ etat, offre, onReessayer, onDemander, onReglerDeuxFois }: Props) {
  if (etat === "pret" && offre) {
    return <Offre offre={offre} onDemander={onDemander} onReglerDeuxFois={onReglerDeuxFois} />;
  }
  return <EtatSansOffre etat={etat} onReessayer={onReessayer} />;
}

/** Chargement, vide et erreur : l'en-tête reste, le corps garde la place des cartes (style nuit). */
function EtatSansOffre({ etat, onReessayer }: { etat: EtatFinancement; onReessayer: () => void }) {
  const { t } = useTranslation("Financement");
  return (
    <>
      <EnteteFinancement />
      {etat === "chargement" ? (
        <EcranCorps
          className={styles.corps}
          data-planche="Financement"
          role="status"
          aria-busy="true"
          aria-label={t("etats.chargement")}
        >
          <div className={`${styles.squelette} ${styles.squeletteAvance}`} />
          <div className={styles.deuxCartes} aria-hidden="true">
            <div className={`${styles.squelette} ${styles.squeletteCarte}`} />
            <div className={`${styles.squelette} ${styles.squeletteCarte}`} />
          </div>
          <div className={`${styles.squelette} ${styles.squeletteVoyageurs}`} />
        </EcranCorps>
      ) : (
        <EcranCorps className={styles.corps} data-planche="Financement">
          {etat === "erreur" ? (
            <div className={styles.etat} role="alert">
              <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
              <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
              <button type="button" className={styles.reessayer} onClick={onReessayer}>
                {t("etats.erreur.reessayer")}
              </button>
            </div>
          ) : (
            <div className={styles.etat}>
              <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
              <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
            </div>
          )}
        </EcranCorps>
      )}
    </>
  );
}

/** Ce que la feuille du PIN est en train de signer. */
type Signature = { objet: "avance" } | { objet: "deuxFois"; actif: boolean };

function Offre({
  offre,
  onDemander,
  onReglerDeuxFois,
}: {
  offre: contrats.OffreFinancement;
  onDemander: Props["onDemander"];
  onReglerDeuxFois: Props["onReglerDeuxFois"];
}) {
  const { t } = useTranslation("Financement");
  const [signature, setSignature] = useState<Signature | null>(null);
  // Garde le dernier objet signé pour que le texte de la feuille ne change pas pendant sa fermeture.
  const [derniere, setDerniere] = useState<Signature>({ objet: "avance" });
  const ouvrir = (s: Signature) => {
    setDerniere(s);
    setSignature(s);
  };
  const texteVoyageurs = useId();
  const { avance, creditMateriel, paie, billetEnDeuxFois } = offre;
  const { conditions } = avance;
  const montant = montantCourt(avance.montantPropose);

  return (
    <>
      <EnteteFinancement
        sousTitre={
          <Trans
            t={t}
            i18nKey="sousTitre"
            values={{ partenaire: offre.partenaire ?? t("partenaireAttendu") }}
            components={{ partenaire: <span className={styles.ambre} /> }}
          />
        }
      />

      <EcranCorps className={styles.corps} data-planche="Financement">
        <section className={styles.avance} aria-label={t("avance.titre")}>
          <div className={styles.avanceEntete}>
            <span className={styles.etiquette}>{t("avance.titre")}</span>
            <span className={styles.statut} data-statut={avance.statut}>
              {t(`avance.statut.${avance.statut}`)}
            </span>
          </div>
          <div className={styles.plafond}>
            <span className={styles.plafondMontant}>
              {t("avance.plafond", { montant: montantCourt(avance.plafond) })}
            </span>
            <span className={styles.equivalence}>
              {t("avance.equivalence", { count: avance.equivalentJoursDeVentes })}
            </span>
          </div>
          <div className={styles.curseur}>
            <span className={styles.curseurLibelle}>{t("avance.montant")}</span>
            <span
              className={styles.piste}
              aria-hidden="true"
              style={
                {
                  "--part": `${partDuPlafond(avance.montantPropose, avance.plafond)}%`,
                } as CSSProperties
              }
            >
              <span className={styles.remplissage} />
              <span className={styles.poignee} />
            </span>
            <span className={styles.curseurValeur}>{montant}</span>
          </div>
          <dl className={styles.conditions}>
            <div className={styles.condition}>
              <dt>{t("avance.rembourse")}</dt>
              <dd>
                {t("avance.rembourseValeur", {
                  pct: pourcent(conditions.remboursementPctVentesMomo),
                })}
              </dd>
            </div>
            <div className={styles.condition}>
              <dt>{t("avance.duree")}</dt>
              <dd>{t("avance.dureeValeur", { count: conditions.dureeEstimeeSemaines })}</dd>
            </div>
            <div className={styles.condition}>
              <dt>{t("avance.cout")}</dt>
              <dd className={styles.ambre}>
                {conditions.coutTotalPct === null
                  ? t("avance.coutAttendu")
                  : t("avance.coutValeur", { pct: pourcent(conditions.coutTotalPct) })}{" "}
                {t("avance.coutFixe")}
              </dd>
            </div>
          </dl>
          <p className={styles.garantie}>
            {t("avance.garantie", { heures: avance.versementSousHeures })}
          </p>
        </section>

        <div className={styles.deuxCartes}>
          <section className={styles.carte} aria-label={t("credit.titre")}>
            <span className={`${styles.etiquetteCarte} ${styles.bleu}`}>{t("credit.titre")}</span>
            <span className={styles.carteTitre}>{creditMateriel.description}</span>
            <span className={styles.carteDetail}>
              {t("credit.detail", {
                montant: montantCourt(creditMateriel.montantTotal),
                mensualites: creditMateriel.mensualites,
                mensualite: milliers(creditMateriel.montantMensualite),
              })}
            </span>
          </section>
          <section className={styles.carte} aria-label={t("paie.titre")}>
            <span className={`${styles.etiquetteCarte} ${styles.vert}`}>{t("paie.titre")}</span>
            <span className={styles.carteTitre}>
              {t("paie.detail", { count: paie.nbSalaires, jour: paie.jourDeVersement })}
            </span>
            <span className={styles.carteDetail}>{t("paie.precision")}</span>
          </section>
        </div>

        <section className={styles.voyageurs} aria-label={t("voyageurs.titre")}>
          <div className={styles.voyageursEntete}>
            <span>{t("voyageurs.titre")}</span>
            <span className={styles.voyageursAide}>{t("voyageurs.aide")}</span>
          </div>
          <div className={styles.voyageursCorps}>
            <span id={texteVoyageurs} className={styles.voyageursTexte}>
              <Trans
                t={t}
                i18nKey="voyageurs.exemple"
                values={{
                  prix: milliers(billetEnDeuxFois.exemple.prixBillet),
                  reservation: milliers(billetEnDeuxFois.exemple.reservation),
                  veille: milliers(billetEnDeuxFois.exemple.veille),
                }}
                components={{ sup: <sup /> }}
              />
            </span>
            {/* Changer le réglage est une écriture du patron : le PIN la signe (feuille ci-dessous). */}
            <button
              type="button"
              className={styles.interrupteur}
              role="switch"
              aria-checked={billetEnDeuxFois.actif}
              aria-labelledby={texteVoyageurs}
              data-actif={billetEnDeuxFois.actif}
              onClick={() => ouvrir({ objet: "deuxFois", actif: !billetEnDeuxFois.actif })}
            >
              <span className={styles.pastille} />
            </button>
          </div>
        </section>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {avance.statut === "eligible" && (
          <button
            type="button"
            className={styles.demander}
            onClick={() => ouvrir({ objet: "avance" })}
          >
            {t("action.demander", { montant })}
          </button>
        )}
        {avance.statut === "en_cours" && avance.dossierId !== undefined && (
          <Link
            className={styles.demander}
            to={urlPlanche("FinancementDemande", { dossierId: avance.dossierId })}
          >
            {t("action.suivre")}
          </Link>
        )}
        {!offre.conventionSignee && <span className={styles.masque}>{t("action.masque")}</span>}
      </EcranPied>

      <FeuillePin
        ouverte={signature !== null}
        sousTitre={
          derniere.objet === "avance"
            ? t("pin.sousTitre", { montant })
            : t(derniere.actif ? "pin.deuxFoisActiver" : "pin.deuxFoisCouper")
        }
        note={t(derniere.objet === "avance" ? "pin.note" : "pin.noteDeuxFois")}
        messageEchec={t(derniere.objet === "avance" ? "pin.echec" : "pin.echecDeuxFois")}
        onFermer={() => setSignature(null)}
        onPin={async (pin) => {
          if (signature?.objet === "deuxFois") {
            await onReglerDeuxFois(signature.actif, pin);
          } else {
            await onDemander(avance.montantPropose, pin);
          }
          setSignature(null);
        }}
      />
    </>
  );
}
