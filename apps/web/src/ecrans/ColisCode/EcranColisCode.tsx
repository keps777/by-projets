import { ErreurHttp, colis as api } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { BoutonIcone, EcranCorps, FriseColis, GrosCode, IconeRetour } from "@afrimove/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  appliquerMessage,
  detailsFrise,
  estRemis,
  etapeCourante,
  formaterMontant,
  formaterPoids,
  heureDouala,
  jourDouala,
} from "./formats";
import { IconeBouclier, IconeMessage, IconeMoto, IconePartager, IconeRelais } from "./icones";
import styles from "./colis-code.module.css";

/** Le serveur dit que ce colis n'existe pas ou n'est pas à cette personne. */
function refuse(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « ColisCode » (touche 2, suite) : le code de retrait en très grand, la photo du dépôt, la frise du suivi,
 * puis les choix « faire livrer » et « déposer en relais » et la réclamation. Le colis vient de `useColis` ; chaque
 * scan (guichet, convoyeur, relais, livreur) arrive par le suivi en direct et avance la frise.
 */
export function EcranColisCode() {
  const { colisId = "" } = useParams();
  const requete = api.useColis(colisId, { enabled: colisId !== "" });

  if (colisId === "" || refuse(requete.error)) return <EtatVide />;
  if (requete.data === undefined) {
    if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
    return <EtatChargement />;
  }
  return <Suivi colis={requete.data} onActualiser={() => void requete.refetch()} />;
}

/** Message affiché au-dessus du code : confirmation (vert) ou échec (rouge). */
interface Message {
  ton: "info" | "erreur";
  texte: string;
}

function Suivi({
  colis,
  onActualiser,
}: {
  colis: contrats.ColisProprietaire;
  onActualiser: () => void;
}) {
  const { t } = useTranslation("ColisCode");
  const envoyerCode = api.useEnvoyerCodeColis();
  const reclamer = api.useReclamerColis();
  const [message, setMessage] = useState<Message | null>(null);

  // Suivi en direct : un scan avance la frise tout de suite, puis le colis est relu pour le détail de l'étape.
  const direct = api.useSuiviColisEnDirect(colis.id);
  const suivi = useMemo(
    () => appliquerMessage(colis.suivi, direct.dernier),
    [colis.suivi, direct.dernier],
  );
  useEffect(() => {
    if (appliquerMessage(colis.suivi, direct.dernier) !== colis.suivi) onActualiser();
    // Seul un nouveau message déclenche la relecture.
  }, [direct.dernier]);

  const remis = estRemis(suivi);
  const nom = colis.destinataire.surnom ?? colis.destinataire.nom;
  const poids = formaterPoids(colis.poidsKg);
  const resume = colis.assure
    ? t("resume.assure", {
        numero: colis.numero,
        poids,
        valeur: formaterMontant(colis.valeurAssuree),
      })
    : t("resume.nonAssure", { numero: colis.numero, poids });

  function envoyer() {
    if (envoyerCode.isPending) return;
    setMessage(null);
    envoyerCode.mutate(
      { colisId: colis.id },
      {
        onSuccess: (accuse) =>
          setMessage({
            ton: "info",
            texte: t("messages.codeEnvoye", {
              canal: t(`canaux.${accuse.canal}`),
              numero: accuse.envoyeA,
            }),
          }),
        onError: () => setMessage({ ton: "erreur", texte: t("messages.envoiEchec") }),
      },
    );
  }

  function reclamation() {
    if (reclamer.isPending) return;
    setMessage(null);
    // Une touche : le motif n'est pas demandé, le service client le précise en répondant.
    reclamer.mutate(
      { colisId: colis.id, motif: "autre" },
      {
        onSuccess: (ouverte) =>
          setMessage({
            ton: "info",
            texte: t("messages.reclamationOuverte", {
              reference: ouverte.reference,
              jour: jourDouala(ouverte.reponseAvant),
            }),
          }),
        onError: () => setMessage({ ton: "erreur", texte: t("messages.reclamationEchec") }),
      },
    );
  }

  /** Partage le lien du suivi, jamais le code : il ne quitte pas cet écran. */
  async function partager() {
    setMessage(null);
    const donnees = {
      title: t("titre", { nom }),
      text: t("partager.texte", { numero: colis.numero }),
      url: new URL(urlPlanche("ColisCode", { colisId: colis.id }), window.location.origin).href,
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(donnees);
        return;
      }
      await navigator.clipboard.writeText(donnees.url);
      setMessage({ ton: "info", texte: t("partager.copie") });
    } catch (erreur) {
      // Fermer la feuille de partage n'est pas une erreur.
      if (erreur instanceof DOMException && erreur.name === "AbortError") return;
      setMessage({ ton: "erreur", texte: t("partager.echec") });
    }
  }

  const options = remis ? [] : colis.options;

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titreEcran}>{t("ecrans.ColisCode.titre", { ns: "translation" })}</h1>
        <BoutonIcone
          href={urlPlanche("Main")}
          aria-label={t("retour")}
          icone={<IconeRetour taille={20} />}
        />
        <div className={styles.enteteTextes}>
          <span className={styles.titre}>{t("titre", { nom })}</span>
          <span className={styles.resume}>{resume}</span>
        </div>
        <BoutonIcone
          aria-label={t("partager.libelle")}
          icone={<IconePartager />}
          onClick={() => void partager()}
        />
      </header>

      <EcranCorps className={styles.corps} data-planche="ColisCode">
        {message && (
          <p role={message.ton === "erreur" ? "alert" : "status"} className={styles.message}>
            {message.texte}
          </p>
        )}

        <div className={styles.retrait}>
          <span className={styles.retraitTextes}>
            <span className={styles.retraitLibelle}>{colis.retrait.libelle}</span>
            <GrosCode code={colis.retrait.code} taille={40} libelle={t("code.libelle")} />
            <span className={styles.consigne}>{colis.retrait.consigne}</span>
          </span>
          <span className={styles.retraitActions}>
            {colis.retrait.photoDepot && (
              <span className={styles.photo}>
                {colis.retrait.photoDepot.libelle}
                <br />
                {heureDouala(colis.retrait.photoDepot.a)}
              </span>
            )}
            <button
              type="button"
              className={styles.envoyer}
              aria-busy={envoyerCode.isPending}
              onClick={envoyer}
            >
              <IconeMessage />
              {t("code.envoyer")}
            </button>
          </span>
        </div>

        <FriseColis
          className={styles.frise}
          etapeCourante={etapeCourante(suivi)}
          details={detailsFrise(suivi)}
          libelle={t("frise.libelle")}
        />

        {options.length > 0 && (
          <div className={styles.options}>
            {options.map((option) => (
              <a
                key={option.mode}
                className={styles.option}
                data-mode={option.mode}
                href={urlPlanche(option.mode === "moto" ? "Livraison" : "Relais", {
                  colisId: colis.id,
                })}
              >
                {option.mode === "moto" ? <IconeMoto /> : <IconeRelais />}
                <span className={styles.optionTextes}>
                  <span className={styles.optionTitre}>{option.titre}</span>
                  <span className={styles.optionDetail}>{option.detail}</span>
                </span>
              </a>
            ))}
          </div>
        )}

        <button
          type="button"
          className={styles.reclamation}
          aria-busy={reclamer.isPending}
          onClick={reclamation}
        >
          <IconeBouclier />
          {colis.reclamation.texte}
        </button>
      </EcranCorps>
    </>
  );
}
