import type { patron } from "@afrimove/contrats";
import {
  EcranCorps,
  EcranPied,
  Entete,
  IconeCoche,
  IconeFleche,
  Pastille,
  type PropsPastille,
} from "@afrimove/ui";
import { Fragment, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { groupes, heuresDeReponse, montantCourt, morceauxRang, taux } from "./formats";
import styles from "./financement-demande.module.css";

export type EtatDemande = "chargement" | "erreur" | "vide" | "pret";

export type MessageRetrait = "impossible" | "echec";

export interface PropsDemandeVue {
  etat: EtatDemande;
  /** Le dossier, présent quand `etat` vaut `pret`. */
  dossier?: patron.DossierFinancement | undefined;
  /** Message affiché quand le retrait n'a pas abouti. */
  messageRetrait?: MessageRetrait | null | undefined;
  onReessayer?: () => void;
  /** Ouvre le clavier PIN : retirer la demande (signé par le PIN). */
  onRetirer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** La pastille de l'en-tête : « EN COURS » tant que le partenaire n'a pas tranché, puis l'issue du dossier. */
function PastilleStatut({ statut }: { statut: patron.StatutDossier }) {
  const { t } = useTranslation("FinancementDemande");
  const reglages: Record<
    patron.StatutDossier,
    Pick<PropsPastille, "statut" | "ton"> & { cle: string }
  > = {
    envoye: { statut: "enCours", cle: "statut.enCours" },
    en_analyse: { statut: "enCours", cle: "statut.enCours" },
    verse: { statut: "active", cle: "statut.verse" },
    refuse: { statut: "aSurveiller", cle: "statut.refuse" },
    retire: { statut: "active", ton: "neutre", cle: "statut.retire" },
  };
  const { cle, ...pastille } = reglages[statut];
  return <Pastille {...pastille} libelle={t(cle)} data-statut-dossier={statut} />;
}

function EnteteDemande({
  etat,
  dossier,
}: {
  etat: EtatDemande;
  dossier: patron.DossierFinancement | undefined;
}) {
  const { t } = useTranslation("FinancementDemande");
  return (
    <Entete
      className={styles.entete}
      titre={t("entete.titre")}
      retour={{ libelle: t("entete.retour"), href: urlPlanche("Financement") }}
      sousTitre={
        dossier ? (
          <>
            {t("entete.avance", { montant: montantCourt(dossier.montant) })}
            {" · "}
            {dossier.partenaire ? (
              dossier.partenaire
            ) : (
              <span className={styles.partenaire}>{t("entete.partenaireAbsent")}</span>
            )}
            {" · "}
            {t("entete.numero", { id: dossier.id })}
          </>
        ) : etat === "chargement" ? (
          <Squelette className={styles.squeletteSousTitre} />
        ) : undefined
      }
      droite={
        dossier ? (
          <PastilleStatut statut={dossier.statut} />
        ) : etat === "chargement" ? (
          <Squelette className={styles.squelettePastille} />
        ) : undefined
      }
    />
  );
}

/* ---------------------------------------------------------------- montant et conditions */

function Demande({ dossier }: { dossier: patron.DossierFinancement }) {
  const { t } = useTranslation("FinancementDemande");
  const { conditions } = dossier;
  return (
    <section
      className={styles.carte}
      aria-label={t("entete.avance", { montant: montantCourt(dossier.montant) })}
    >
      <div className={styles.montantLigne}>
        <span className={styles.montant}>{groupes(dossier.montant)}</span>
        <span className={styles.devise}>
          {t("demande.devise", { heures: heuresDeReponse(dossier.envoyeA, dossier.reponseAvant) })}
        </span>
      </div>
      <dl className={styles.conditions}>
        <div className={styles.condition}>
          <dt className={styles.conditionLibelle}>{t("demande.rembourse")}</dt>
          <dd className={styles.conditionValeur}>
            {t("demande.remboursePart", { pct: taux(conditions.remboursementPctVentesMomo) })}
          </dd>
        </div>
        <div className={styles.condition}>
          <dt className={styles.conditionLibelle}>{t("demande.duree")}</dt>
          <dd className={styles.conditionValeur}>
            {t("demande.dureeValeur", { count: conditions.dureeEstimeeSemaines })}
          </dd>
        </div>
        <div className={styles.condition}>
          <dt className={styles.conditionLibelle}>{t("demande.cout")}</dt>
          {/* Le coût total est fixé par le partenaire : un crochet ambre tant qu'il n'a pas répondu. */}
          <dd
            className={styles.conditionValeur}
            data-ton={conditions.coutTotalPct === null ? "ambre" : "neutre"}
          >
            {conditions.coutTotalPct === null
              ? t("demande.coutAbsent")
              : t("demande.coutPartenaire", { pct: taux(conditions.coutTotalPct) })}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------- pièces jointes */

function Pieces({ dossier }: { dossier: patron.DossierFinancement }) {
  const { t } = useTranslation("FinancementDemande");
  return (
    <section className={styles.pieces} aria-label={t("pieces.titre")}>
      <div className={styles.piecesEntete}>
        <span>{t("pieces.titre")}</span>
        <span className={styles.piecesAide}>{t("pieces.aide")}</span>
      </div>
      <ul className={styles.liste}>
        {dossier.pieces.map((p) => (
          <li key={p.nom} className={styles.piece}>
            <span className={styles.coche}>
              <IconeCoche taille={11} trait={3.5} />
            </span>
            <span className={styles.pieceTextes}>
              <span className={styles.pieceNom}>{p.nom}</span>
              <span className={styles.pieceDetail}>{p.detail}</span>
            </span>
            <span className={styles.pieceFormat}>{p.format}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- frise de suivi */

function Rang({ texte }: { texte: string }) {
  return (
    <>
      {morceauxRang(texte).map((m, i) => (
        <Fragment key={i}>{"exposant" in m ? <sup>{m.exposant}</sup> : m.texte}</Fragment>
      ))}
    </>
  );
}

function Suivi({ dossier }: { dossier: patron.DossierFinancement }) {
  const { t } = useTranslation("FinancementDemande");
  return (
    <section className={styles.suivi} aria-labelledby="suivi-titre">
      <h2 id="suivi-titre" className={styles.suiviTitre}>
        {t("suivi.titre")}
      </h2>
      <ol className={styles.etapes}>
        {dossier.suivi.map((e) => (
          <li
            key={e.code}
            className={styles.etape}
            data-etat={e.etat}
            {...(e.etat === "en_cours" ? { "aria-current": "step" as const } : {})}
          >
            <span
              className={`${styles.rond} ${e.etat === "en_cours" ? "am-pulse" : ""}`}
              data-etat={e.etat}
              aria-hidden="true"
            />
            {/* Le versement n'a pas encore d'heure : sa phrase commence déjà par « Versement ». */}
            <span>
              {e.code === "versement" ? (
                <Rang texte={e.detail} />
              ) : (
                <>
                  <strong>{e.libelle}</strong>
                  {" · "}
                  <Rang texte={e.detail} />
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- pied */

function Pied({
  dossier,
  onRetirer,
}: {
  dossier: patron.DossierFinancement | undefined;
  onRetirer: (() => void) | undefined;
}) {
  const { t } = useTranslation("FinancementDemande");
  // Le retrait est une écriture signée : le lien garde sa destination (Financement) mais ouvre d'abord le clavier PIN.
  const retirer = (evenement: MouseEvent<HTMLAnchorElement>) => {
    evenement.preventDefault();
    onRetirer?.();
  };
  const retirable = dossier?.retirable === true;
  return (
    <EcranPied className={`${styles.pied} ${retirable ? "" : styles.piedSeul}`}>
      {retirable && (
        <a className={styles.retirer} href={urlPlanche("Financement")} onClick={retirer}>
          {t("actions.retirer")}
        </a>
      )}
      <a className={styles.retour} href={urlPlanche("Patron")}>
        <span className={styles.retourTextes}>
          <span className={styles.retourTitre}>{t("actions.retour")}</span>
          <span className={styles.retourDetail}>{t("actions.retourDetail")}</span>
        </span>
        <IconeFleche taille={22} trait={2.6} />
      </a>
    </EcranPied>
  );
}

/**
 * Dossier de financement envoyé au partenaire, suivi : le montant et les conditions, les pièces jointes
 * automatiques, la frise de suivi (envoyé, analyse, versement), la mention « AfriMove ne prête pas » et, tant que
 * le dossier n'est pas versé, « Retirer la demande ».
 */
export function DemandeVue({
  etat,
  dossier,
  messageRetrait,
  onReessayer,
  onRetirer,
}: PropsDemandeVue) {
  const { t } = useTranslation("FinancementDemande");
  const donnees = etat === "pret" ? dossier : undefined;
  return (
    <>
      <EnteteDemande etat={etat} dossier={donnees} />

      <EcranCorps
        className={styles.corps}
        data-planche="FinancementDemande"
        data-etat={etat}
        aria-busy={etat === "chargement"}
        {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
      >
        {etat === "chargement" && (
          <>
            <Squelette className={styles.squeletteCarte} />
            <Squelette className={styles.squeletteLigne} />
            <Squelette className={styles.squeletteSuivi} />
          </>
        )}

        {etat === "vide" && (
          <div className={styles.etat}>
            <h2 className={styles.etatTitre}>{t("etats.vide.titre")}</h2>
            <p className={styles.etatDetail}>{t("etats.vide.detail")}</p>
          </div>
        )}

        {etat === "erreur" && (
          <div className={styles.etat} role="alert">
            <h2 className={styles.etatTitre}>{t("etats.erreur.titre")}</h2>
            <p className={styles.etatDetail}>{t("etats.erreur.detail")}</p>
            {onReessayer && (
              <button type="button" className={styles.reessayer} onClick={onReessayer}>
                {t("etats.erreur.reessayer")}
              </button>
            )}
          </div>
        )}

        {donnees && (
          <>
            <Demande dossier={donnees} />
            <Pieces dossier={donnees} />
            <Suivi dossier={donnees} />
            <p className={styles.mention}>
              {t("mention.base")}
              {donnees.retirable ? ` ${t("mention.retrait")}` : ""}
            </p>
            {messageRetrait && (
              <p role="alert" className={styles.alerte}>
                {t(`retrait.${messageRetrait}`)}
              </p>
            )}
          </>
        )}
      </EcranCorps>

      {(etat === "chargement" || donnees) && <Pied dossier={donnees} onRetirer={onRetirer} />}
    </>
  );
}
