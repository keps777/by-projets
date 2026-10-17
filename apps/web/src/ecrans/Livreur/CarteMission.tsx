import type { colis as contrats } from "@afrimove/contrats";
import { useEffect, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useHorloge, useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import {
  dureeInitialeMs,
  formaterDecompte,
  formaterKilometres,
  formaterMontant,
  formaterPoids,
  restantMs,
} from "./formats";
import styles from "./livreur.module.css";

export interface PropsCarteMission {
  mission: contrats.MissionLivraison;
  onPasser: () => void;
  onAccepter: (evenement: MouseEvent<HTMLAnchorElement>) => void;
  /** Le délai est écoulé sans réponse : la mission passe au livreur suivant. */
  onFin: () => void;
}

/**
 * Compte à rebours de la proposition. Il part de la durée restante donnée par le serveur (`expireA`) et décompte avec
 * l'horloge de l'application (injectable : figée dans les tests et au banc de fidélité).
 */
function Decompte({
  expireA,
  delaiSecondes,
  onFin,
}: {
  expireA: string;
  delaiSecondes: number;
  onFin: () => void;
}) {
  const horloge = useHorloge();
  const maintenant = useMaintenant(1000);
  const [debut] = useState(() => horloge.maintenant().getTime());
  const [initial] = useState(() => dureeInitialeMs(expireA, delaiSecondes, debut));
  const reste = restantMs(initial, maintenant.getTime() - debut);
  const termine = reste <= 0;

  useEffect(() => {
    if (termine) onFin();
    // `onFin` change à chaque rendu : seul le passage à zéro compte.
  }, [termine]);

  return (
    <span className={styles.decompte} role="timer">
      {formaterDecompte(reste / 1000)}
    </span>
  );
}

/** Carte « Nouvelle mission » : trajet, poids, distance, durée, gain, puis Passer / Accepter. */
export function CarteMission({ mission, onPasser, onAccepter, onFin }: PropsCarteMission) {
  const { t } = useTranslation("Livreur");
  const { trajet, colis } = mission;
  return (
    <section
      className={styles.mission}
      aria-label={t("mission.titre", { secondes: mission.delaiAcceptationSecondes })}
    >
      <div className={styles.missionEntete}>
        <span className={styles.etiquetteBleue}>
          {t("mission.titre", { secondes: mission.delaiAcceptationSecondes })}
        </span>
        <Decompte
          key={mission.id}
          expireA={mission.expireA}
          delaiSecondes={mission.delaiAcceptationSecondes}
          onFin={onFin}
        />
      </div>
      <div className={styles.missionCorps}>
        <span className={styles.trajet}>
          <span className={styles.trajetTitre}>
            {t("mission.trajet", {
              depart: trajet.depart,
              arrivee: trajet.arrivee,
              destinataire: trajet.destinataire,
            })}
          </span>
          <span className={styles.trajetDetail}>
            {t("mission.detail", {
              poids: formaterPoids(colis.poidsKg),
              distance: formaterKilometres(mission.distanceM),
              duree: mission.dureeMinutes,
            })}
          </span>
        </span>
        <span className={styles.gain}>
          <span className={styles.gainMontant}>{formaterMontant(mission.gain)}</span>
          <span className={styles.gainLibelle}>{t("mission.gain")}</span>
        </span>
      </div>
      <div className={styles.actionsMission}>
        <button type="button" className={styles.passer} onClick={onPasser}>
          {t("mission.passer")}
        </button>
        <Link
          className={styles.accepter}
          to={urlPlanche("Livraison", { colisId: colis.id })}
          onClick={onAccepter}
        >
          {t("mission.accepter")}
        </Link>
      </div>
    </section>
  );
}
