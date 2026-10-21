import { Bouton, EcranCorps, EcranPied } from "@afrimove/ui";
import { useState, type FormEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./assistant.module.css";
import { destinationAction } from "./destinations";
import { barres, gainMensuel } from "./formats";
import { IconeEtincelle, IconeMicro, IconeRetourAssistant } from "./icones";
import type { Fuite, Gain, Insights } from "./types";

export type EtatAssistant = "chargement" | "erreur" | "vide" | "pret";

export interface PropsAssistantVue {
  etat: EtatAssistant;
  /** Les constats et simulations de l'assistant, présents quand `etat` vaut `pret` (ou `vide`, sans carte). */
  insights?: Insights | undefined;
  /** Une question vient d'être posée (saisie ou question suggérée) : l'écran de réponse s'ouvre ensuite. */
  onPoser?: (question: string) => void;
  /** La dernière question posée n'est pas partie. */
  erreurEnvoi?: boolean;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Entete() {
  const { t } = useTranslation("Assistant");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre « L'assistant ». */}
      <h1 className={styles.titreEcran}>{t("ecrans.Assistant.titre", { ns: "translation" })}</h1>
      <a className={styles.retour} href={urlPlanche("Patron")} aria-label={t("entete.retour")}>
        <IconeRetourAssistant />
      </a>
      <div className={styles.textes}>
        <span className={styles.titre}>{t("entete.titre")}</span>
        <span className={styles.sousTitre}>{t("entete.sousTitre")}</span>
      </div>
      <span className={styles.etincelle}>
        <IconeEtincelle />
      </span>
    </header>
  );
}

function CarteFuite({ fuite, rang }: { fuite: Fuite; rang: number }) {
  const { t } = useTranslation("Assistant");
  return (
    <section className={styles.carte} data-carte="fuite">
      <div className={styles.rangee}>
        <span className={styles.etiquette} data-ton="rouge">
          {t("fuite.etiquette", { rang })}
        </span>
        <span className={styles.mention}>{t("fuite.periode", { count: fuite.periodeJours })}</span>
      </div>
      <h2 className={styles.constat}>{fuite.constat}</h2>
      <div className={styles.barres} aria-hidden="true">
        {barres(fuite.periodeJours, fuite.joursConcernes).map((barre, jour) => (
          <span key={jour} className={styles.barre} data-concerne={barre.concerne} />
        ))}
      </div>
      <span className={styles.texte}>{fuite.explication}</span>
      {fuite.actions.length > 0 && (
        <div className={styles.actions}>
          {fuite.actions.map((action, i) => (
            <a
              key={action.id}
              className={i === 0 ? styles.actionPrincipale : styles.actionSecondaire}
              href={destinationAction(action.type, action.ligneId)}
            >
              {action.libelle}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function CarteGain({ gain, rang }: { gain: Gain; rang: number }) {
  const { t } = useTranslation("Assistant");
  const { scenarios, gainMensuel: parMois } = gain.simulation;
  return (
    <section className={styles.carte} data-carte="gain">
      <div className={styles.rangee}>
        <span className={styles.etiquette} data-ton="ambre">
          {t("gain.etiquette", { rang })}
        </span>
        <span className={styles.mention}>{t("gain.mention")}</span>
      </div>
      <h2 className={styles.constat}>{gain.constat}</h2>
      <div className={styles.chiffres}>
        {scenarios.map((scenario, i) => (
          <span
            key={scenario.libelle}
            className={styles.tuile}
            data-ton={i === 0 ? "neutre" : "vert"}
          >
            <span className={styles.tuileLibelle}>{scenario.libelle}</span>
            <span className={styles.tuileValeur}>
              {scenario.remplis}
              <span className={styles.tuileSur}>/{scenario.capacite}</span>
            </span>
          </span>
        ))}
        <span className={styles.tuile} data-ton="neutre">
          <span className={styles.tuileLibelle}>{t("gain.parMois")}</span>
          <span className={styles.tuileMois} data-signe={parMois < 0 ? "perte" : "gain"}>
            {gainMensuel(parMois)}
          </span>
        </span>
      </div>
      <span className={styles.texte}>{gain.base}</span>
      <a
        className={styles.actionGain}
        href={destinationAction(gain.action.type, gain.action.ligneId)}
      >
        {gain.action.libelle}
      </a>
    </section>
  );
}

function Chargement() {
  return (
    <>
      {[1, 2].map((i) => (
        <div key={i} className={styles.carte} aria-hidden="true">
          <Squelette className={styles.squeletteEtiquette} />
          <Squelette className={styles.squeletteConstat} />
          <Squelette className={styles.squeletteBloc} />
          <Squelette className={styles.squeletteTexte} />
          <Squelette className={styles.squeletteBouton} />
        </div>
      ))}
    </>
  );
}

/**
 * L'assistant du patron : « Argent qui fuit » (le constat, ses jours, l'explication et les actions qui ouvrent le
 * réglage concerné), « Argent à gagner » (la simulation avant / après et l'action), les questions suggérées, puis la
 * zone de saisie (texte, ou le micro).
 *
 * Aucune carte ne modifie quoi que ce soit : chaque action ouvre l'écran de réglage, où le patron décide.
 */
export function AssistantVue({
  etat,
  insights,
  onPoser,
  erreurEnvoi,
  onReessayer,
}: PropsAssistantVue) {
  const { t } = useTranslation("Assistant");
  const [saisie, setSaisie] = useState("");
  const donnees = etat === "pret" || etat === "vide" ? insights : undefined;
  const fuites = etat === "pret" ? (donnees?.fuites ?? []) : [];
  const gains = etat === "pret" ? (donnees?.gains ?? []) : [];

  function envoyer(evenement: FormEvent) {
    evenement.preventDefault();
    const question = saisie.trim();
    if (question === "") return;
    onPoser?.(question);
  }

  /** Une question suggérée est posée avant d'ouvrir la réponse ; un clic « ouvrir dans un onglet » suit le lien. */
  function suggerer(evenement: MouseEvent<HTMLAnchorElement>, question: string) {
    if (!onPoser) return;
    if (evenement.button !== 0 || evenement.metaKey || evenement.ctrlKey || evenement.shiftKey)
      return;
    evenement.preventDefault();
    onPoser(question);
  }

  return (
    <>
      <Entete />

      <EcranCorps
        className={styles.corps}
        data-planche="Assistant"
        data-etat={etat}
        aria-busy={etat === "chargement"}
        {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
      >
        {etat === "chargement" && <Chargement />}
        {(etat === "vide" || etat === "erreur") && (
          <div className={styles.carte}>
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
        {fuites.map((fuite, i) => (
          <CarteFuite key={fuite.id} fuite={fuite} rang={i + 1} />
        ))}
        {gains.map((gain, i) => (
          <CarteGain key={gain.id} gain={gain} rang={fuites.length + i + 1} />
        ))}
        {donnees && donnees.questionsSuggerees.length > 0 && (
          <div className={styles.questions}>
            {donnees.questionsSuggerees.map((question) => (
              <a
                key={question}
                className={styles.question}
                href={urlPlanche("AssistantReponse")}
                onClick={(evenement) => suggerer(evenement, question)}
              >
                {question}
              </a>
            ))}
          </div>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {erreurEnvoi && (
          <p role="alert" className={styles.erreurEnvoi}>
            {t("etats.envoi")}
          </p>
        )}
        <form className={styles.saisie} onSubmit={envoyer}>
          <input
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
          <a
            className={styles.parler}
            href={urlPlanche("AssistantReponse")}
            aria-label={t("saisie.parler")}
          >
            <IconeMicro />
          </a>
        </form>
      </EcranPied>
    </>
  );
}
