import type { voyageur as c } from "@afrimove/contrats";
import type { TFunction } from "i18next";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formaterMontant, formaterNote, heureDouala, jourDouala } from "./formats";
import { IconeDevise } from "./icones";
import styles from "./covoit-conducteur.module.css";

type T = TFunction<"CovoitConducteur">;

/** « Samuel · vérifié · 4,9 ★ » : qui conduit et ce qu'il a déjà prouvé. */
export function Pastille({ conducteur }: { conducteur: c.ConducteurCovoit }) {
  const { t } = useTranslation("CovoitConducteur");
  const parts = [
    conducteur.nom,
    t(conducteur.verifie ? "pastille.verifie" : "pastille.aVerifier"),
    ...(conducteur.note !== undefined ? [formaterNote(conducteur.note)] : []),
  ];
  return (
    <span className={styles.pastille} data-verifie={conducteur.verifie ? "oui" : "non"}>
      {parts.join(" · ")}
    </span>
  );
}

function Tuile({
  libelle,
  valeur,
  detail,
  ton,
}: {
  libelle: string;
  valeur: string;
  detail: string;
  ton?: "vert" | "ambre";
}) {
  return (
    <div className={styles.tuile}>
      <span className={styles.tuileLibelle}>{libelle}</span>
      <span className={styles.tuileValeur} data-ton={ton}>
        {valeur}
      </span>
      <span className={styles.tuileDetail}>{detail}</span>
    </div>
  );
}

/** Les trois chiffres : gains de la semaine, trajets faits, pièces. */
export function Chiffres({ resume }: { resume: c.MesTrajetsCovoit["resume"] }) {
  const { t } = useTranslation("CovoitConducteur");
  return (
    <div className={styles.tuiles}>
      <Tuile
        libelle={t("resume.semaine")}
        valeur={formaterMontant(resume.gainSemaine)}
        detail={t("resume.semaineDetail")}
        ton="vert"
      />
      <Tuile
        libelle={t("resume.trajets")}
        valeur={String(resume.trajets)}
        detail={t("resume.annulations", { count: resume.annulations })}
      />
      <Tuile
        libelle={t("resume.pieces")}
        valeur={t(resume.piecesOk ? "resume.piecesOk" : "resume.piecesAFaire")}
        detail={t("resume.piecesDetail")}
        ton={resume.piecesOk ? "vert" : "ambre"}
      />
    </div>
  );
}

/** Le détail d'un trajet publié : prix de la place et passagers. */
function Gestion({ trajet, id, t }: { trajet: c.TrajetPublie; id: string; t: T }) {
  return (
    <div id={id} className={styles.gestion}>
      {trajet.prixParPlace !== undefined && (
        <span>{t("publies.gestion.prix", { montant: formaterMontant(trajet.prixParPlace) })}</span>
      )}
      {trajet.reservations.length === 0 ? (
        <span>{t("publies.gestion.aucune")}</span>
      ) : (
        trajet.reservations.map((r, i) => (
          <span key={`${r.passager}-${i}`}>
            {t("publies.gestion.passager", {
              passager: r.passager,
              places: t("publies.places", { count: r.places }),
              montant: formaterMontant(r.montantPaye),
            })}
          </span>
        ))
      )}
    </div>
  );
}

function LignePubliee({ trajet, premier }: { trajet: c.TrajetPublie; premier: boolean }) {
  const { t } = useTranslation("CovoitConducteur");
  const [ouvert, setOuvert] = useState(false);
  const idGestion = useId();
  const reservees = trajet.placesReservees;
  const jour = jourDouala(trajet.departA);
  const libres = Math.max(0, trajet.places - reservees);

  let detail: ReactNode;
  if (reservees > 0) {
    detail = (
      <>
        <strong className={styles.reservee}>{t("publies.reservees", { count: reservees })}</strong>
        {trajet.reservations.map((r, i) => (
          <span key={`${r.passager}-${i}`}>
            {" "}
            · {r.passager} · {t("publies.payee", { montant: formaterMontant(r.montantPaye) })}
          </span>
        ))}
        {libres > 0 && <> · {t("publies.libres", { count: libres })}</>}
      </>
    );
  } else {
    detail = (
      <>
        {t("publies.reservees", { count: 0 })}
        {trajet.visiblePar !== undefined && (
          <> · {t("publies.visible", { count: trajet.visiblePar })}</>
        )}
      </>
    );
  }

  return (
    <>
      <div className={premier ? styles.ligne : `${styles.ligne} ${styles.ligneSuivante}`}>
        <span className={styles.quand}>
          <span className={styles.heure} data-ton={reservees > 0 ? "vert" : "ambre"}>
            {heureDouala(trajet.departA)}
          </span>
          <span className={styles.jour}>{jour ? t(`jours.${jour}`) : ""}</span>
        </span>
        <span className={styles.texte}>
          <span className={styles.trajet}>
            {t("publies.trajet", { depart: trajet.depart, arrivee: trajet.arrivee })} ·{" "}
            {t("publies.places", { count: trajet.places })}
          </span>
          <span className={styles.detail}>{detail}</span>
        </span>
        <button
          type="button"
          className={styles.gerer}
          aria-expanded={ouvert}
          aria-controls={idGestion}
          onClick={() => setOuvert((v) => !v)}
        >
          {t("publies.gerer")}
        </button>
      </div>
      {ouvert && <Gestion trajet={trajet} id={idGestion} t={t} />}
    </>
  );
}

/** Mes trajets publiés : heure, trajet, réservations et bouton « Gérer ». */
export function TrajetsPublies({ publies }: { publies: readonly c.TrajetPublie[] }) {
  const { t } = useTranslation("CovoitConducteur");
  const titre = useId();
  return (
    <section className={styles.bloc} aria-labelledby={titre}>
      <div className={styles.enteteBloc}>
        <span id={titre}>{t("publies.titre")}</span>
        <span className={styles.compte}>{publies.length}</span>
      </div>
      {publies.length === 0 ? (
        <p className={styles.videBloc}>{t("publies.vide")}</p>
      ) : (
        publies.map((trajet, i) => (
          <LignePubliee key={trajet.id} trajet={trajet} premier={i === 0} />
        ))
      )}
    </section>
  );
}

/** Passagers qui cherchent une voiture sur mes trajets, avec « Proposer 08:30 ». */
export function Demandes({
  demandes,
  onProposer,
}: {
  demandes: readonly c.DemandePassager[];
  onProposer: (demande: c.DemandePassager) => void;
}) {
  const { t } = useTranslation("CovoitConducteur");
  const titre = useId();
  return (
    <section className={`${styles.bloc} ${styles.blocBleu}`} aria-labelledby={titre}>
      <div className={`${styles.enteteBloc} ${styles.enteteBleu}`}>
        <span id={titre}>{t("demandes.titre")}</span>
        <span className={styles.compte}>{t("demandes.sens")}</span>
      </div>
      {demandes.length === 0 ? (
        <p className={styles.videBloc}>{t("demandes.vide")}</p>
      ) : (
        demandes.map((d, i) => (
          <div
            key={d.id}
            className={i === 0 ? styles.demande : `${styles.demande} ${styles.ligneSuivante}`}
          >
            <span className={styles.demandeTexte}>
              <strong>{d.passager}</strong> · {d.depart} → {d.arrivee} · {d.quand} ·{" "}
              {t("demandes.places", { count: d.places })}
              {d.note !== undefined && (
                <span className={styles.note}> · {formaterNote(d.note)}</span>
              )}
            </span>
            <button type="button" className={styles.proposer} onClick={() => onProposer(d)}>
              {t("demandes.proposer", { heure: d.heurePropose })}
            </button>
          </div>
        ))
      )}
    </section>
  );
}

/** La mention de paiement : payé par MoMo à l'arrivée, partage de frais. */
export function MentionPaiement({ frais }: { frais: number }) {
  const { t } = useTranslation("CovoitConducteur");
  return (
    <p className={styles.paiement}>
      <span className={styles.devise}>
        <IconeDevise taille={18} trait={2.2} />
      </span>
      {t("paiement", { frais: formaterMontant(frais) })}
    </p>
  );
}

const PIECES = ["identite", "permis", "carteGrise", "voiture"] as const;

/** Le parcours de vérification, montré à un conducteur non vérifié qui veut publier. */
export function Verification({ refCarte }: { refCarte: (el: HTMLElement | null) => void }) {
  const { t } = useTranslation("CovoitConducteur");
  const titre = useId();
  return (
    <section ref={refCarte} tabIndex={-1} className={styles.verification} aria-labelledby={titre}>
      <h2 id={titre} className={styles.verificationTitre}>
        {t("verification.titre")}
      </h2>
      <p className={styles.verificationDetail}>{t("verification.detail")}</p>
      <ol className={styles.pieces}>
        {PIECES.map((piece, i) => (
          <li key={piece} className={styles.piece}>
            <span className={styles.numero} aria-hidden="true">
              {i + 1}
            </span>
            {t(`verification.${piece}`)}
          </li>
        ))}
      </ol>
    </section>
  );
}
