import { ErreurHttp, colis as api } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied } from "@afrimove/ui";
import { useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useModeDemo, useScenario } from "@/coquille/parametres";
import { Actions, Boutique, EnGarde, Remise, Resume } from "./composants";
import type { RemiseVue } from "./composants";
import { DEMO_RELAIS_APP, SCENARIO_RELAIS_APP } from "./demo";
import { EtatChargement, EtatErreur, EtatVide, TitreEcran } from "./etats";
import { LONGUEUR_CODE, formaterMontant } from "./formats";
import { Reception } from "./reception";
import styles from "./relaisapp.module.css";

/** Le serveur dit qu'il n'y a pas de point relais pour ce compte. */
function sansRelais(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « RelaisApp » (touche 1, accueil du point relais) : l'état de la boutique, remettre un colis contre le code du
 * client et sa pièce, recevoir un colis, les colis en garde. Lit l'espace par `useEspaceRelais`; écrit par
 * `useRemettreColisRelais` et `useRecevoirColisRelais` (qui rechargent l'espace).
 */
export function EcranRelaisApp() {
  const requete = api.useEspaceRelais();

  if (requete.data === undefined) {
    if (sansRelais(requete.error)) return <EtatVide />;
    if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
    return <EtatChargement />;
  }
  return <Accueil espace={requete.data} />;
}

/** Ce que le relais a saisi pour un colis : le code qu'il tape et la pièce qu'il a contrôlée. */
interface Saisie {
  colisId: string | null;
  code: string;
  piece: boolean;
}

type Message = { ton: "ok" | "erreur"; cle: string; valeurs?: Record<string, string | number> };

/** Cause d'un refus de remise : code faux (essais restants), colis bloqué, colis plus en garde, ou panne. */
function messageEchec(erreur: unknown): Message {
  if (erreur instanceof ErreurHttp) {
    if (erreur.code === "code_invalide") {
      const details = erreur.details as { essaisRestants?: unknown } | undefined;
      const restants = typeof details?.essaisRestants === "number" ? details.essaisRestants : 0;
      return { ton: "erreur", cle: "messages.codeInvalide", valeurs: { count: restants } };
    }
    if (erreur.code === "code_bloque") return { ton: "erreur", cle: "messages.codeBloque" };
    if (erreur.code === "etat_incompatible") {
      return { ton: "erreur", cle: "messages.etatIncompatible" };
    }
  }
  return { ton: "erreur", cle: "messages.echec" };
}

function Accueil({ espace }: { espace: contrats.EspaceRelais }) {
  const { t } = useTranslation("RelaisApp");
  const demo = useModeDemo() && useScenario() === SCENARIO_RELAIS_APP;
  const remettre = api.useRemettreColisRelais();
  const idReception = useId();
  const champCode = useRef<HTMLInputElement>(null);
  const champPhoto = useRef<HTMLInputElement>(null);
  const enCours = useRef(false);

  // Le colis touché dans la liste prend la place de la remise proposée par le serveur.
  const [choisiId, setChoisiId] = useState<string | null>(null);
  const [receptionOuverte, setReceptionOuverte] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(() => ({
    colisId: espace.remiseEnCours?.colis.id ?? null,
    code: demo ? DEMO_RELAIS_APP.saisie : "",
    piece: demo ? DEMO_RELAIS_APP.pieceVerifiee : false,
  }));

  const choisi = espace.enGarde.find((g) => g.colis.id === choisiId)?.colis;
  const remise: RemiseVue | null = choisi
    ? { colis: choisi, consigne: t("remise.consigne") }
    : espace.remiseEnCours;
  const colisId = remise?.colis.id ?? null;
  // La saisie appartient à un colis : un autre colis repart d'un code vide et d'une pièce à contrôler.
  const courante: Saisie =
    saisie.colisId === colisId ? saisie : { colisId, code: "", piece: false };

  function toucherColis(id: string) {
    setChoisiId(id);
    setMessage(null);
    champCode.current?.scrollIntoView?.({ block: "nearest" });
  }

  function surRemettre() {
    setMessage(null);
    champCode.current?.focus();
  }

  async function envoyer(photoRef: string) {
    if (remise === null || enCours.current) return;
    enCours.current = true;
    setMessage(null);
    try {
      const fait = await remettre.mutateAsync({
        colisId: remise.colis.id,
        code: courante.code,
        pieceVerifiee: true,
        photoRef,
      });
      setChoisiId(null);
      setSaisie({ colisId: null, code: "", piece: false });
      setMessage({
        ton: "ok",
        cle: "messages.reussie",
        valeurs: { numero: fait.colis.numero, montant: formaterMontant(fait.gain) },
      });
    } catch (erreur) {
      const echec = messageEchec(erreur);
      setMessage(echec);
      if (echec.cle === "messages.codeInvalide") {
        setSaisie({ ...courante, code: "" });
        champCode.current?.focus();
      }
    } finally {
      enCours.current = false;
    }
  }

  /** « Colis remis · photo » : le code et la pièce d'abord, puis l'appareil photo pour le colis remis. */
  function surColisRemis() {
    if (remise === null) {
      setMessage({ ton: "erreur", cle: "messages.aucuneRemise" });
      return;
    }
    if (courante.code.length < LONGUEUR_CODE) {
      setMessage({ ton: "erreur", cle: "messages.codeIncomplet" });
      champCode.current?.focus();
      return;
    }
    if (!courante.piece) {
      setMessage({ ton: "erreur", cle: "messages.pieceNonVerifiee" });
      return;
    }
    setMessage(null);
    champPhoto.current?.click();
  }

  function photoPrise(evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    evenement.target.value = "";
    // Seule la référence du colis remis part au serveur : jamais une photo de la pièce.
    if (fichier && remise) void envoyer(`photo-remise-${remise.colis.id}`);
  }

  const gain = formaterMontant(espace.gainParRemise);

  return (
    <>
      <TitreEcran />
      <Boutique boutique={espace.boutique} />

      <EcranCorps className={styles.corps} data-planche="RelaisApp">
        <Resume resume={espace.resume} />
        <Actions
          receptionOuverte={receptionOuverte}
          idReception={idReception}
          onRemettre={surRemettre}
          onRecevoir={() => setReceptionOuverte((ouverte) => !ouverte)}
        />
        {receptionOuverte && <Reception id={idReception} />}
        <Remise
          ref={champCode}
          remise={remise}
          code={courante.code}
          pieceVerifiee={courante.piece}
          onCode={(code) => setSaisie({ ...courante, code })}
          onPiece={(piece) => setSaisie({ ...courante, piece })}
        />
        <EnGarde
          total={espace.resume.enGarde}
          jours={espace.gardeJours}
          lignes={espace.enGarde}
          onChoisir={toucherColis}
          vide={t("garde.vide")}
        />
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {message !== null && (
          <p
            role={message.ton === "erreur" ? "alert" : "status"}
            className={message.ton === "erreur" ? styles.messageErreur : styles.messageOk}
          >
            {t(message.cle, message.valeurs)}
          </p>
        )}
        <button
          type="button"
          className={styles.remis}
          aria-busy={remettre.isPending}
          onClick={surColisRemis}
        >
          {t("pied.remis", { montant: gain })}
        </button>
        <input
          ref={champPhoto}
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.fichier}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="photo-colis"
          onChange={photoPrise}
        />
      </EcranPied>
    </>
  );
}
