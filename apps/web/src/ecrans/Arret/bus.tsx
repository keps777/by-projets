import type { voyageur as c } from "@afrimove/contrats";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import {
  extremitesLigne,
  formaterDelai,
  formaterMontant,
  heureDouala,
  nomAvecClasse,
  passageProche,
  placesRares,
} from "./formats";
import styles from "./arret.module.css";

/**
 * Un bus qui passe : heure et délai, compagnie et places, d'où il est parti et quand il arrive, prix de la montée.
 * Toucher la carte mène au siège et au paiement de ce départ (l'arrêt de montée suit dans l'adresse). Le plus proche
 * est cerclé d'ambre.
 */
export function CarteBus({
  bus,
  ligne,
  arretId,
  premier,
}: {
  bus: c.BusQuiPasse;
  ligne: c.OffresMonteeEnRoute["ligne"];
  arretId: string;
  premier: boolean;
}) {
  const { t } = useTranslation("Arret");
  const { depart, arrivee } = extremitesLigne(ligne.arrets, ligne.libelle);
  const origine =
    bus.partiA !== undefined
      ? t("bus.parti", { ville: depart, heure: heureDouala(bus.partiA) })
      : t(`bus.classe.${bus.classe}`);
  const detail = [
    origine,
    t("bus.arrive", { ville: arrivee, heure: heureDouala(bus.arriveeDestination) }),
  ].join(" · ");

  return (
    <a
      href={`${urlPlanche("SiegePay", { departId: bus.departId })}?arretId=${encodeURIComponent(arretId)}`}
      className={premier ? `${styles.bus} ${styles.busPremier}` : styles.bus}
      data-depart={bus.departId}
      data-premier={premier}
    >
      <span className={styles.passage}>
        <span
          className={passageProche(bus.passeDansMinutes) ? styles.heure : styles.heureLointaine}
          data-passage={passageProche(bus.passeDansMinutes) ? "proche" : "lointain"}
        >
          {heureDouala(bus.passeA)}
        </span>
        <span className={styles.delai}>
          {t("bus.dans", { delai: formaterDelai(bus.passeDansMinutes) })}
        </span>
      </span>
      <span className={styles.busTextes}>
        <span className={styles.compagnie}>
          {nomAvecClasse(bus.compagnie.nom, bus.classe)}{" "}
          <span
            className={placesRares(bus.placesLibres) ? styles.placesRares : styles.places}
            data-places={placesRares(bus.placesLibres) ? "rares" : "assez"}
          >
            {t("bus.places", { count: bus.placesLibres })}
          </span>
        </span>
        <span className={styles.detail}>{detail}</span>
      </span>
      <span className={styles.prix}>
        <span className={styles.montant}>{formaterMontant(bus.prix)}</span>
        {bus.prorata && <span className={styles.delai}>{t("bus.prorata")}</span>}
      </span>
    </a>
  );
}

/** Squelette d'une carte de bus, à la même hauteur que la carte réelle. */
export function SqueletteBus() {
  return (
    <div className={styles.bus} aria-hidden="true">
      <span className={`${styles.squelette} ${styles.squeletteHeure} am-pulse`} />
      <span className={styles.busTextes}>
        <span className={`${styles.squelette} ${styles.squeletteCompagnie} am-pulse`} />
        <span className={`${styles.squelette} ${styles.squeletteDetail} am-pulse`} />
      </span>
      <span className={`${styles.squelette} ${styles.squeletteMontant} am-pulse`} />
    </div>
  );
}
