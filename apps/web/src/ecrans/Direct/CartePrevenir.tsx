import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { IconeCloche } from "./icones";
import styles from "./direct.module.css";

/**
 * Carte orange « Prévenir Maman quand j'arrive » : toucher le texte mène à « Moi » (les proches), toucher
 * l'interrupteur programme (ou annule) le SMS du proche 15 min avant l'arrivée, en une touche. L'interrupteur
 * suit la réponse du serveur ; entre la touche et la réponse il montre déjà l'état demandé.
 */
export function CartePrevenir({
  billetId,
  prevenir,
}: {
  billetId: string;
  prevenir: c.PrevenirProche | undefined;
}) {
  const { t } = useTranslation("Direct");
  const activer = voyageur.usePrevenirProche();
  const arreter = voyageur.useNePlusPrevenirProche();
  const [demande, setDemande] = useState<boolean | undefined>(undefined);
  const [annonce, setAnnonce] = useState("");

  // Le serveur a répondu (l'état réel change) : l'état demandé n'a plus de raison d'être.
  const actifServeur = prevenir?.actif;
  useEffect(() => setDemande(undefined), [actifServeur]);

  // Aucun proche à prévenir : la carte mène à « Moi » pour en ajouter un.
  if (prevenir === undefined) {
    return (
      <div className={styles.prevenir}>
        <a className={styles.prevenirLien} href={urlPlanche("Moi")}>
          <span className={styles.prevenirIcone}>
            <IconeCloche />
          </span>
          <span className={styles.prevenirTextes}>
            <span className={styles.prevenirTitre}>{t("prevenir.sansProche.titre")}</span>
            <span className={styles.prevenirDetail}>{t("prevenir.sansProche.detail")}</span>
          </span>
        </a>
      </div>
    );
  }

  const actif = demande ?? prevenir.actif;
  const enCours = activer.isPending || arreter.isPending;
  const enErreur = activer.isError || arreter.isError;

  function basculer() {
    if (enCours || prevenir === undefined) return;
    const cible = !actif;
    setDemande(cible);
    setAnnonce(
      t(cible ? "prevenir.annonce.active" : "prevenir.annonce.annule", {
        nom: prevenir.nom,
        minutes: prevenir.minutesAvantArrivee,
      }),
    );
    const parametres = { billetId, procheId: prevenir.procheId };
    const options = { onError: () => setDemande(undefined) };
    if (cible) activer.mutate(parametres, options);
    else arreter.mutate(parametres, options);
  }

  return (
    <>
      <div className={styles.prevenir}>
        <a className={styles.prevenirLien} href={urlPlanche("Moi")}>
          <span className={styles.prevenirIcone}>
            <IconeCloche />
          </span>
          <span className={styles.prevenirTextes}>
            <span className={styles.prevenirTitre}>
              {t("prevenir.titre", { nom: prevenir.nom })}
            </span>
            <span className={styles.prevenirDetail}>
              {t("prevenir.detail", {
                minutes: prevenir.minutesAvantArrivee,
                gare: prevenir.gareArrivee,
              })}
            </span>
          </span>
        </a>
        <button
          type="button"
          role="switch"
          aria-checked={actif}
          aria-label={t("prevenir.interrupteur", { nom: prevenir.nom })}
          className={styles.interrupteur}
          onClick={basculer}
        >
          <span className={styles.piste} data-actif={actif}>
            <span className={styles.bouton} />
          </span>
        </button>
      </div>
      <span role="status" className={styles.annonce}>
        {annonce}
      </span>
      {enErreur && (
        <p role="alert" className={styles.alerte}>
          {t("prevenir.erreur")}
        </p>
      )}
    </>
  );
}
