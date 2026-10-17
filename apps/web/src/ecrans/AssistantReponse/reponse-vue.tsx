import { Bouton, EcranCorps, EcranPied } from "@afrimove/ui";
import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { destinationAction, ligneConcernee } from "./destinations";
import { gainSimule, numeroter } from "./formats";
import { IconeEtincelle, IconeMicro, IconeRetour } from "./icones";
import styles from "./reponse.module.css";
import type { Conversation, Echange, Graphique, LigneReseau } from "./types";

export type EtatReponse = "chargement" | "erreur" | "vide" | "pret";

export interface PropsReponseVue {
  etat: EtatReponse;
  /** La conversation, présente quand `etat` vaut `pret`. */
  conversation?: Conversation | undefined;
  /** Les lignes du réseau, pour ouvrir celle dont la réponse parle (sinon les actions ouvrent la liste). */
  lignes?: readonly LigneReseau[] | undefined;
  /** Le graphique de la réponse détaillée, quand on en a un. */
  graphique?: Graphique | undefined;
  /** La question qui vient d'être posée et dont la réponse arrive. */
  enAttente?: string | null | undefined;
  /** La dernière question posée n'est pas partie. */
  erreurEnvoi?: boolean | undefined;
  /** Pose la question ; vrai quand elle est partie (le champ est alors vidé), faux sinon (le texte reste). */
  onPoser?: ((question: string) => Promise<boolean>) | undefined;
  onReessayer?: (() => void) | undefined;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Entete({ conversation }: { conversation: Conversation | undefined }) {
  const { t } = useTranslation("AssistantReponse");
  const derniere = conversation?.echanges.at(-1);
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre « L'assistant ». */}
      <h1 className={styles.titreEcran}>
        {t("ecrans.AssistantReponse.titre", { ns: "translation" })}
      </h1>
      <a className={styles.retour} href={urlPlanche("Assistant")} aria-label={t("entete.retour")}>
        <IconeRetour />
      </a>
      <div className={styles.textes}>
        <span className={styles.titre}>{t("entete.titre")}</span>
        {conversation && derniere && (
          <span className={styles.sousTitre}>
            {t("entete.sousTitre", {
              count: conversation.baseJours,
              secondes: derniere.dureeSecondes,
            })}
          </span>
        )}
      </div>
      <span className={styles.etincelle}>
        <IconeEtincelle />
      </span>
    </header>
  );
}

function Actions({
  echange,
  lignes,
}: {
  echange: Echange;
  lignes: readonly LigneReseau[] | undefined;
}) {
  if (echange.actions.length === 0) return null;
  const ligneId = ligneConcernee(echange, lignes ?? []);
  return (
    <div className={styles.actions}>
      {echange.actions.map((action, i) => (
        <a
          key={action.id}
          className={i === 0 ? styles.actionPrincipale : styles.actionSecondaire}
          href={destinationAction(action.type, ligneId)}
        >
          {action.libelle}
        </a>
      ))}
    </div>
  );
}

function Simulation({ echange }: { echange: Echange }) {
  const { t } = useTranslation("AssistantReponse");
  const options = echange.simulation?.options ?? [];
  if (options.length === 0) return null;
  const texte = options
    .map((option) =>
      t("simulation.option", { gain: gainSimule(option.gainMensuel), libelle: option.libelle }),
    )
    .join(" · ");
  return <span className={styles.simulation}>{t("simulation.ligne", { options: texte })}</span>;
}

function GraphiqueJours({ graphique }: { graphique: Graphique }) {
  return (
    <div className={styles.barres} aria-hidden="true">
      {graphique.remplissageParJour.map((hauteur, jour) => (
        <span
          key={jour}
          className={styles.barre}
          style={{ height: `${hauteur}%` }}
          data-ecart={graphique.joursEnEcart.includes(jour + 1)}
        />
      ))}
    </div>
  );
}

/**
 * La réponse de l'assistant. Avec des points, c'est le diagnostic : le résumé en titre, le graphique, les points
 * numérotés, les actions, puis les sources. Sans point, c'est une réponse en quelques phrases, suivie de sa
 * simulation. Les sources sont toujours citées en bas de la réponse quand l'API en donne.
 */
function Reponse({
  echange,
  lignes,
  graphique,
  dernier,
}: {
  echange: Echange;
  lignes: readonly LigneReseau[] | undefined;
  graphique: Graphique | undefined;
  dernier: Ref<HTMLElement> | undefined;
}) {
  const detaillee = echange.points.length > 0;
  return (
    <article
      ref={dernier}
      className={detaillee ? styles.reponseDetaillee : styles.reponseCourte}
      data-reponse={detaillee ? "detaillee" : "courte"}
    >
      {detaillee ? (
        <>
          <h2 className={styles.resume}>{echange.resume}</h2>
          {graphique && <GraphiqueJours graphique={graphique} />}
          <ol className={styles.points}>
            {numeroter(echange.points).map((point) => (
              <li key={point.numero}>
                <strong className={styles.numero}>{point.numero}</strong> {point.texte}
              </li>
            ))}
          </ol>
          <Actions echange={echange} lignes={lignes} />
        </>
      ) : (
        <>
          <span>{echange.resume}</span>
          <Actions echange={echange} lignes={lignes} />
          <Simulation echange={echange} />
        </>
      )}
      {detaillee && <Simulation echange={echange} />}
      {echange.sources && <span className={styles.sources}>{echange.sources}</span>}
    </article>
  );
}

function QuestionPosee({ question }: { question: string }) {
  return <div className={styles.question}>{question}</div>;
}

function ReponseEnAttente({ dernier }: { dernier: Ref<HTMLElement> | undefined }) {
  const { t } = useTranslation("AssistantReponse");
  return (
    <article
      ref={dernier}
      className={`${styles.reponseCourte} ${styles.pleineLargeur}`}
      aria-busy="true"
      aria-label={t("etats.reponse")}
    >
      <Squelette className={styles.squeletteLigne} />
      <Squelette className={styles.squeletteLigne} />
      <Squelette className={styles.squeletteCourt} />
    </article>
  );
}

function Chargement() {
  return (
    <>
      <div className={styles.question} aria-hidden="true">
        <Squelette className={styles.squeletteQuestion} />
      </div>
      <div className={`${styles.reponseDetaillee} ${styles.pleineLargeur}`} aria-hidden="true">
        <Squelette className={styles.squeletteResume} />
        <Squelette className={styles.squeletteBarres} />
        <Squelette className={styles.squeletteLigne} />
        <Squelette className={styles.squeletteLigne} />
        <Squelette className={styles.squeletteBouton} />
      </div>
    </>
  );
}

/**
 * L'assistant répond : la conversation question par question (la question du patron à droite, la réponse à gauche),
 * puis la zone pour poser une autre question (texte, ou le micro).
 *
 * Aucune action ne modifie quoi que ce soit : chacune ouvre l'écran concerné, où le patron décide.
 */
export function ReponseVue({
  etat,
  conversation,
  lignes,
  graphique,
  enAttente,
  erreurEnvoi,
  onPoser,
  onReessayer,
}: PropsReponseVue) {
  const { t } = useTranslation("AssistantReponse");
  const [saisie, setSaisie] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const dernier = useRef<HTMLElement>(null);
  const echanges = etat === "pret" ? (conversation?.echanges ?? []) : [];
  const attend = enAttente != null;

  // Une nouvelle réponse (ou la question qui l'attend) arrive en bas : on la montre. Pas au premier affichage.
  const nombre = echanges.length + (attend ? 1 : 0);
  const precedent = useRef(nombre);
  useEffect(() => {
    if (nombre > precedent.current) dernier.current?.scrollIntoView?.({ block: "end" });
    precedent.current = nombre;
  }, [nombre]);

  async function envoyer(evenement: FormEvent) {
    evenement.preventDefault();
    const question = saisie.trim();
    if (question === "" || attend || !onPoser) return;
    if (await onPoser(question)) setSaisie("");
  }

  return (
    <>
      <Entete conversation={etat === "pret" ? conversation : undefined} />

      <EcranCorps
        className={styles.corps}
        data-planche="AssistantReponse"
        data-etat={etat}
        aria-busy={etat === "chargement"}
        {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
      >
        {etat === "chargement" && <Chargement />}
        {(etat === "vide" || etat === "erreur") && (
          <div className={`${styles.reponseCourte} ${styles.pleineLargeur}`}>
            <div className={styles.message}>
              <p
                role={etat === "erreur" ? "alert" : "status"}
                className={etat === "erreur" ? styles.messageErreur : undefined}
              >
                {t(etat === "erreur" ? "etats.erreur" : "etats.vide")}
              </p>
              {etat === "erreur" && onReessayer && (
                <Bouton
                  variante="secondaire"
                  libelle={t("etats.reessayer")}
                  onClick={onReessayer}
                />
              )}
            </div>
          </div>
        )}
        {echanges.map((echange, i) => (
          <QuestionReponse
            key={`${i}-${echange.question}`}
            echange={echange}
            lignes={lignes}
            graphique={graphique}
            dernier={!attend && i === echanges.length - 1 ? dernier : undefined}
          />
        ))}
        {attend && (
          <>
            <QuestionPosee question={enAttente} />
            <ReponseEnAttente dernier={dernier} />
          </>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {erreurEnvoi && (
          <p role="alert" className={styles.erreurEnvoi}>
            {t("etats.envoi")}
          </p>
        )}
        <form className={styles.saisie} onSubmit={(e) => void envoyer(e)}>
          <input
            ref={champ}
            className={styles.pose}
            type="text"
            value={saisie}
            maxLength={500}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={t("saisie.placeholder")}
            aria-label={t("saisie.placeholder")}
            onChange={(evenement) => setSaisie(evenement.target.value)}
          />
          {/* « Parler » reste sur l'écran : le curseur passe dans le champ, d'où la dictée du clavier. */}
          <button
            type="button"
            className={styles.parler}
            aria-label={t("saisie.parler")}
            onClick={() => champ.current?.focus()}
          >
            <IconeMicro />
          </button>
        </form>
      </EcranPied>
    </>
  );
}

function QuestionReponse({
  echange,
  lignes,
  graphique,
  dernier,
}: {
  echange: Echange;
  lignes: readonly LigneReseau[] | undefined;
  graphique: Graphique | undefined;
  dernier: Ref<HTMLElement> | undefined;
}) {
  return (
    <>
      <QuestionPosee question={echange.question} />
      <Reponse echange={echange} lignes={lignes} graphique={graphique} dernier={dernier} />
    </>
  );
}
