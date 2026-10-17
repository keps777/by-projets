import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { EcranCorps, EcranPied, IconePersonne, Selecteur, useConception } from "@afrimove/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EtatChargement, EtatErreur } from "./etats";
import { VILLE_PAR_DEFAUT } from "./formats";
import { IconePlus, IconeVolant } from "./icones";
import {
  Chiffres,
  Demandes,
  MentionPaiement,
  Pastille,
  TrajetsPublies,
  Verification,
} from "./sections";
import styles from "./covoit-conducteur.module.css";

type Message = { genre: "envoyee"; passager: string } | { genre: "echec" };

/**
 * Planche « CovoitConducteur » (touche 1) : le mode « Je conduis » du covoiturage. Lit `useMesTrajetsCovoit` (chiffres,
 * trajets publiés, demandes des passagers) ; « Proposer 08:30 » écrit `useProposerADemande`. « Proposer mon trajet »
 * ouvre la publication, sauf pour un conducteur non vérifié, qui voit d'abord ses pièces à faire valider.
 */
export function EcranCovoitConducteur() {
  const { t } = useTranslation("CovoitConducteur");
  const navigate = useNavigate();
  const conception = useConception();
  const requete = voyageur.useMesTrajetsCovoit();
  const proposer = voyageur.useProposerADemande();
  const donnees = requete.data;

  const [message, setMessage] = useState<Message | null>(null);
  const [verificationVue, setVerificationVue] = useState(false);
  const enCours = useRef(false);
  const carteVerification = useRef<HTMLElement | null>(null);

  async function proposerA(demande: c.DemandePassager) {
    if (enCours.current) return;
    enCours.current = true;
    setMessage(null);
    try {
      await proposer.mutateAsync({ demandeId: demande.id, trajetId: demande.trajetPropose });
      setMessage({ genre: "envoyee", passager: demande.passager });
    } catch (erreur) {
      setMessage({ genre: "echec" });
      // La demande n'existe plus (retirée par le passager) : la liste se met à jour.
      if (erreur instanceof ErreurHttp && erreur.statut === 404) void requete.refetch();
    } finally {
      enCours.current = false;
    }
  }

  function publier() {
    if (donnees && !donnees.conducteur.verifie) {
      setVerificationVue(true);
      // La carte n'existe pas encore au premier toucher : on la cherche après le rendu.
      requestAnimationFrame(() => {
        carteVerification.current?.scrollIntoView?.({ block: "start" });
        carteVerification.current?.focus();
      });
      return;
    }
    void navigate(urlPlanche("Conducteur"));
  }

  let corps;
  if (donnees === undefined) {
    corps = requete.isError ? (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    ) : (
      <EtatChargement />
    );
  } else {
    corps = (
      <>
        {verificationVue && !donnees.conducteur.verifie && (
          <Verification refCarte={(el) => (carteVerification.current = el)} />
        )}
        <Chiffres resume={donnees.resume} />
        <TrajetsPublies publies={donnees.publies} />
        <Demandes demandes={donnees.demandes} onProposer={(d) => void proposerA(d)} />
        {message && (
          <p
            role={message.genre === "echec" ? "alert" : "status"}
            className={message.genre === "echec" ? styles.alerte : styles.confirmation}
          >
            {message.genre === "echec"
              ? t("messages.echec")
              : t("messages.envoyee", { passager: message.passager })}
          </p>
        )}
        <MentionPaiement frais={donnees.fraisParPlace} />
      </>
    );
  }

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titreEcran}>
          {t("ecrans.CovoitConducteur.titre", { ns: "translation" })}
        </h1>
        <div className={styles.titreLigne}>
          <span className={styles.titre}>{t("titre")}</span>
          {donnees && <Pastille conducteur={donnees.conducteur} />}
        </div>
        <Selecteur
          ton="vert"
          taille="l"
          className={styles.mode}
          aria-label={t("mode.aria")}
          valeur="entre"
          mention={t("mode.glisse")}
          onChange={(valeur) => {
            if (valeur === "ville") void navigate(urlPlanche("CovoitVille"));
          }}
          options={[
            { valeur: "entre", libelle: t("mode.entreVilles") },
            { valeur: "ville", libelle: t("mode.enVille", { ville: VILLE_PAR_DEFAUT }) },
          ]}
        />
        <Selecteur
          ton="neutre"
          taille="l"
          className={styles.role}
          aria-label={t("role.aria")}
          valeur="conducteur"
          onChange={(valeur) => {
            if (valeur === "passager") void navigate(urlPlanche("Covoit"));
          }}
          options={[
            {
              valeur: "passager",
              libelle: t("role.passager"),
              icone: <IconePersonne taille={16} trait={2.2} />,
            },
            {
              valeur: "conducteur",
              libelle: t("role.conducteur"),
              icone: <IconeVolant taille={16} trait={2.2} />,
            },
          ]}
        />
      </header>

      <EcranCorps
        className={styles.corps}
        data-planche="CovoitConducteur"
        aria-busy={requete.isPending}
      >
        {corps}
      </EcranCorps>

      {donnees && (
        <EcranPied className={styles.pied}>
          <button type="button" className={styles.action} onClick={publier}>
            <span className={styles.actionTextes}>
              <span className={styles.actionLibelle}>{t("action.libelle")}</span>
              <span className={styles.actionDetail}>
                {conception ? t("action.touche") : ""}
                {t("action.detail")}
              </span>
            </span>
            <IconePlus taille={26} trait={2.6} />
          </button>
        </EcranPied>
      )}
    </>
  );
}
