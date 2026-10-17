import { SaisieCode } from "@afrimove/ui";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import styles from "./quai.module.css";

interface Props {
  /** Voyageur dont on saisit le code (ligne « Pas encore montés »), sinon saisie libre. */
  voyageur?: string | undefined;
  /** Vrai pendant l'envoi : la saisie est gelée pour ne pas envoyer deux fois. */
  enCours: boolean;
  /** Code refusé à l'envoi (réseau, panne) : la saisie reste ouverte pour recommencer. */
  echec: boolean;
  onCode: (code: string) => void;
  onFermer: () => void;
}

/**
 * Repli du scan : le voyageur dicte les 4 chiffres de son billet. Feuille montée du bas, limitée à la colonne de
 * 390 px (la feuille du kit couvre la fenêtre entière, y compris au-delà du cadre sur ordinateur).
 */
export function FeuilleCode({ voyageur, enCours, echec, onCode, onFermer }: Props) {
  const { t } = useTranslation("Quai");
  const idTitre = useId();
  const fenetre = useRef<HTMLDivElement>(null);
  const [saisie, setSaisie] = useState("");

  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    fenetre.current?.focus();
    return () => precedent?.focus?.();
  }, []);

  // Un envoi refusé vide la saisie : l'agent retape le code.
  useEffect(() => {
    if (echec) setSaisie("");
  }, [echec]);

  function surTouche(evenement: KeyboardEvent<HTMLDivElement>) {
    if (evenement.key === "Escape") {
      evenement.stopPropagation();
      onFermer();
    }
  }

  return (
    <div
      className={styles.voile}
      onClick={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer();
      }}
    >
      <div
        ref={fenetre}
        className={styles.feuille}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        onKeyDown={surTouche}
      >
        <div className={styles.feuilleEntete}>
          <div className={styles.feuilleTitres}>
            <h2 id={idTitre} className={styles.feuilleTitre}>
              {t("feuilleCode.titre")}
            </h2>
            <span className={styles.feuilleAide}>{voyageur ?? t("feuilleCode.aide")}</span>
          </div>
          <button
            type="button"
            className={styles.fermer}
            aria-label={t("feuilleCode.fermer")}
            onClick={onFermer}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SaisieCode
          longueur={4}
          value={saisie}
          label={t("feuilleCode.champ")}
          disabled={enCours}
          autoFocus
          webOtp={false}
          onChange={setSaisie}
          onComplete={onCode}
          {...(echec ? { erreur: t("feuilleCode.echec") } : {})}
        />
      </div>
    </div>
  );
}
