import type { colis } from "@afrimove/contrats";
import { Bouton, EcranCorps, EcranPied, Entete, Pastille, type TonPastille } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./convention.module.css";
import { jourAvecAnnee, jourEtHeure, milliers, netCompact } from "./formats";

type Convention = colis.Convention;

export type EtatEcran = "chargement" | "erreur" | "vide" | "pret";

export interface PropsConventionVue {
  etat: EtatEcran;
  convention?: Convention | undefined;
  onReessayer?: () => void;
}

const TONS_STATUT: Record<Convention["statut"], TonPastille> = {
  active: "vert",
  suspendue: "ambre",
  resiliee: "rouge",
};

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** Tronçons et parts : une part par compagnie (ambre pour la première, bleu pour la seconde), « — » sans part. */
function Parts({ parts }: { parts: Convention["parts"] }) {
  // Les trois en-têtes de la planche : « tronçon » puis le nom de chaque compagnie.
  const [entete = "", premiere = "", seconde = ""] = parts.entetes;
  const compagnies = [premiere, seconde];
  const tons = [styles.premiere, styles.seconde];
  return (
    <div className={styles.parts}>
      <div className={styles.partsTete}>
        <span>{parts.titre}</span>
        <span className={styles.aide}>{parts.aide}</span>
      </div>
      <div className={styles.grille} role="table" aria-label={parts.titre}>
        <div className={styles.ligneGrille} role="row">
          <span className={styles.enteteCol} role="columnheader">
            {entete}
          </span>
          {compagnies.map((nom) => (
            <span key={nom} className={`${styles.enteteCol} ${styles.droite}`} role="columnheader">
              {nom}
            </span>
          ))}
        </div>
        {parts.lignes.map((ligne) => (
          <div key={ligne.troncon} className={styles.ligneGrille} role="row">
            <span role="cell">{ligne.troncon}</span>
            {compagnies.map((nom, i) => {
              const part = ligne.parts[nom] ?? null;
              return (
                <span
                  key={nom}
                  className={`${styles.montant} ${part === null ? styles.sansPart : tons[i]}`}
                  role="cell"
                >
                  {part === null ? "—" : milliers(part)}
                </span>
              );
            })}
          </div>
        ))}
        <div className={styles.ligneGrille} role="row">
          <span className={`${styles.totalLibelle}`} role="rowheader">
            {parts.total.libelle}
          </span>
          {compagnies.map((nom, i) => (
            <span key={nom} className={`${styles.montant} ${styles.total} ${tons[i]}`} role="cell">
              {milliers(parts.total.parts[nom] ?? 0)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Les règles : « 1 · Responsabilité au scan. » en gras, puis le texte. */
function Regles({ regles }: { regles: Convention["regles"] }) {
  return (
    <section className={styles.regles} aria-label={regles.titre}>
      <span className={styles.etiquette}>{regles.titre}</span>
      <ul className={styles.listeRegles}>
        {regles.liste.map((regle) => (
          <li key={regle.rang}>
            <strong>
              {regle.rang} · {regle.titre}
            </strong>{" "}
            {regle.texte}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Signatures({ signatures }: { signatures: Convention["signatures"] }) {
  const { t } = useTranslation("InterAgencesConvention");
  return (
    <div className={styles.signatures}>
      {signatures.map((s) => (
        <div key={s.compagnie} className={styles.signature}>
          <span className={styles.signatureLibelle}>
            {t("signatures.signePour", { compagnie: s.compagnie })}
          </span>
          <span className={styles.signatureValeur}>
            {t("signatures.valeur", {
              signataire: s.moi ? t("signatures.moi") : s.signataire,
              quand: jourEtHeure(s.signeLe),
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Tuile({
  etiquette,
  valeur,
  detail,
  ton,
}: {
  etiquette: string;
  valeur: string;
  detail: string;
  ton?: string | undefined;
}) {
  return (
    <div className={styles.tuile}>
      <span className={styles.tuileEtiquette}>{etiquette}</span>
      <span className={ton ? `${styles.tuileValeur} ${ton}` : styles.tuileValeur}>{valeur}</span>
      <span className={styles.tuileDetail}>{detail}</span>
    </div>
  );
}

function Trimestre({ trimestre }: { trimestre: Convention["trimestre"] }) {
  const { t } = useTranslation("InterAgencesConvention");
  const regle = trimestre.litiges === 0 || trimestre.delaiLitigeJours !== null;
  return (
    <div className={styles.tuiles}>
      <Tuile
        etiquette={t("trimestre.etiquette")}
        valeur={milliers(trimestre.colisEchanges)}
        detail={t("trimestre.echanges", { count: trimestre.colisEchanges })}
      />
      <Tuile
        etiquette={t("trimestre.litiges")}
        valeur={milliers(trimestre.litiges)}
        detail={
          trimestre.litiges === 0
            ? t("trimestre.litigesAucun")
            : trimestre.delaiLitigeJours !== null
              ? t("trimestre.litigesRegle", { count: trimestre.delaiLitigeJours })
              : t("trimestre.litigesOuvert")
        }
        ton={regle ? styles.vert : styles.ambre}
      />
      <Tuile
        etiquette={t("trimestre.netRecu")}
        valeur={netCompact(trimestre.netRecu)}
        detail={t("trimestre.lundis", { count: trimestre.lundis })}
        ton={trimestre.netRecu >= 0 ? styles.vert : styles.rouge}
      />
    </div>
  );
}

function SqueletteCorps() {
  return (
    <>
      <div className={styles.parts} aria-hidden="true">
        <div className={styles.partsTete}>
          <Squelette className={styles.squeletteEtiquette} />
        </div>
        <div className={styles.squeletteBloc}>
          {[1, 2, 3, 4].map((i) => (
            <Squelette key={i} className={styles.squeletteLigne} />
          ))}
        </div>
      </div>
      <div className={styles.regles} aria-hidden="true">
        <Squelette className={styles.squeletteEtiquette} />
        {[1, 2, 3].map((i) => (
          <Squelette key={i} className={styles.squeletteTexte} />
        ))}
      </div>
      <div className={styles.signatures} aria-hidden="true">
        <Squelette className={styles.squeletteCarte} />
        <Squelette className={styles.squeletteCarte} />
      </div>
      <div className={styles.tuiles} aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <Squelette key={i} className={styles.squeletteTuile} />
        ))}
      </div>
    </>
  );
}

/**
 * Convention entre deux compagnies : pastille du statut, tronçons et parts, les règles, les deux signatures par PIN,
 * les chiffres du trimestre. Chaque compagnie voit le colis, jamais les ventes de l'autre : l'écran n'affiche que les
 * parts et le bilan de la convention.
 *
 * Aucune écriture ici : la convention est signée par les deux patrons avant d'arriver sur cet écran.
 */
export function ConventionVue({ etat, convention, onReessayer }: PropsConventionVue) {
  const { t } = useTranslation("InterAgencesConvention");
  const chargement = etat === "chargement";
  const donnees = etat === "pret" ? convention : undefined;

  return (
    <div className={styles.ecran}>
      <Entete
        titre={donnees ? donnees.titre : t("entete.titreAttente")}
        sousTitre={
          donnees ? (
            t("entete.sousTitre", {
              date: jourAvecAnnee(donnees.signeLe),
              renouvellement: donnees.renouvellement,
            })
          ) : chargement ? (
            <Squelette className={styles.squeletteSousTitre} />
          ) : undefined
        }
        retour={{ libelle: t("entete.retour"), href: urlPlanche("InterAgences") }}
        droite={
          donnees ? (
            <Pastille
              statut="active"
              libelle={t(`statuts.${donnees.statut}`)}
              ton={TONS_STATUT[donnees.statut]}
            />
          ) : undefined
        }
      />

      <EcranCorps
        className={styles.corps}
        data-planche="InterAgencesConvention"
        data-etat={etat}
        aria-busy={chargement}
        {...(chargement ? { "aria-label": t("etats.chargement") } : {})}
      >
        {(etat === "vide" || etat === "erreur") && (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
              <span className={styles.point} />
              <p>{t(etat === "erreur" ? "etats.erreur" : "etats.vide")}</p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        )}

        {chargement && <SqueletteCorps />}

        {donnees && (
          <>
            <Parts parts={donnees.parts} />
            <Regles regles={donnees.regles} />
            <Signatures signatures={donnees.signatures} />
            <Trimestre trimestre={donnees.trimestre} />
            <span className={styles.pied}>{donnees.pied}</span>
          </>
        )}
      </EcranCorps>

      <EcranPied className={styles.actions}>
        <Bouton
          variante="secondaire"
          libelle={t("boutons.historique")}
          href={urlPlanche("Comptable")}
          className={styles.historique}
        />
        <Bouton
          variante="secondaire"
          libelle={t("boutons.retour")}
          href={urlPlanche("InterAgences")}
          className={styles.retourBouton}
        />
      </EcranPied>
    </div>
  );
}
