import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { Jingle } from "./jingle";
import styles from "./splash.module.css";

/** `0:07` : minutes et secondes, comme le lecteur de la maquette. */
export function formaterDuree(secondes: number): string {
  const total = Math.max(0, Math.floor(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const COULEURS_BARRES = ["ambre", "ambre", "orange", "ambre", "ambre"] as const;

/**
 * Carte du jingle : cinq barres animées, titre, paroles, puis le lecteur (bouton lecture / arrêt, temps,
 * progression). Rien ne démarre sans toucher ; le son se coupe quand on quitte l'écran ou que l'application
 * passe en arrière-plan.
 */
export function CarteJingle({ jingle }: { jingle: Jingle }) {
  const { t } = useTranslation("Splash");
  const enLecture = useSyncExternalStore(jingle.abonner, jingle.enLecture);
  const [position, setPosition] = useState(0);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    if (!enLecture) {
      setPosition(0);
      return;
    }
    const minuterie = setInterval(() => setPosition(jingle.position()), 100);
    return () => clearInterval(minuterie);
  }, [enLecture, jingle]);

  useEffect(() => {
    const surMasquage = () => {
      if (document.visibilityState === "hidden") jingle.arreter();
    };
    document.addEventListener("visibilitychange", surMasquage);
    return () => {
      document.removeEventListener("visibilitychange", surMasquage);
      jingle.arreter();
    };
  }, [jingle]);

  async function basculer() {
    if (enLecture) {
      jingle.arreter();
      return;
    }
    setEchec(false);
    try {
      await jingle.jouer();
    } catch {
      setEchec(true);
    }
  }

  const avancement = Math.min(100, Math.max(0, (position / jingle.duree) * 100));

  return (
    <div className={styles.jingle} data-etat={enLecture ? "lecture" : "arret"}>
      <div className={styles.jingleTete}>
        <span className={styles.barres} aria-hidden="true">
          {COULEURS_BARRES.map((couleur, i) => (
            <span key={i} className={styles.barre} data-couleur={couleur} />
          ))}
        </span>
        <span className={styles.jingleTextes}>
          <span className={styles.jingleTitre}>{t("jingle.titre")}</span>
          <span className={styles.jingleParoles}>{t("jingle.paroles")}</span>
        </span>
      </div>
      <div className={styles.lecteur}>
        <button
          type="button"
          className={styles.lecture}
          aria-label={enLecture ? t("jingle.arreter") : t("jingle.ecouter")}
          aria-pressed={enLecture}
          onClick={() => void basculer()}
        >
          {enLecture ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className={styles.temps}>
          {formaterDuree(position)} / {formaterDuree(jingle.duree)}
        </span>
        <span className={styles.piste} aria-hidden="true">
          <span className={styles.pisteRemplie} style={{ width: `${avancement}%` }} />
        </span>
      </div>
      {echec && (
        <p role="alert" className={styles.echecSon}>
          {t("jingle.echec")}
        </p>
      )}
    </div>
  );
}
