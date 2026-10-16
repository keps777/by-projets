import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import styles from "./FeuilleModale.module.css";
import { classes } from "./internes/classes";
import { IconeFermer } from "./internes/icones";
import type { VarianteDonnees } from "./types";

export interface FeuilleModaleProps {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  sousTitre?: string;
  /** Pastille à gauche du titre (le « XLSX » de ComptableApercu). */
  badge?: ReactNode;
  children: ReactNode;
  /** Rangée de boutons en bas. */
  actions?: ReactNode;
  /**
   * - `feuille` : montée du bas de l'écran, coins hauts arrondis à 24 px (mobile) ;
   * - `centree` : pop-up au centre (1280 px).
   * Par défaut : `feuille` en mobile, `centree` en large.
   */
  forme?: "feuille" | "centree";
  variante?: VarianteDonnees;
  /** `ecran` couvre la fenêtre (position fixe) ; `parent` couvre le parent positionné (démos, cadres). */
  ancrage?: "ecran" | "parent";
  /** Libellé du bouton de fermeture. */
  libelleFermer?: string;
  className?: string;
}

const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Feuille modale / pop-up par-dessus un écran assombri. Se ferme avec Échap, avec le bouton ou
 * en touchant le voile ; le focus reste dans la fenêtre et revient où il était à la fermeture.
 * Planche : ComptableApercu (aperçu d'un export).
 */
export function FeuilleModale({
  ouverte,
  onFermer,
  titre,
  sousTitre,
  badge,
  children,
  actions,
  forme,
  variante = "mobile",
  ancrage = "ecran",
  libelleFermer = "Fermer",
  className,
}: FeuilleModaleProps) {
  const idTitre = useId();
  const fenetre = useRef<HTMLDivElement>(null);
  const formeEffective = forme ?? (variante === "large" ? "centree" : "feuille");

  useEffect(() => {
    if (!ouverte) return;
    const precedent = document.activeElement as HTMLElement | null;
    fenetre.current?.focus();
    return () => {
      precedent?.focus?.();
    };
  }, [ouverte]);

  if (!ouverte) return null;

  function surTouche(evenement: KeyboardEvent<HTMLDivElement>) {
    if (evenement.key === "Escape") {
      evenement.stopPropagation();
      onFermer();
      return;
    }
    if (evenement.key !== "Tab" || !fenetre.current) return;
    const elements = Array.from(fenetre.current.querySelectorAll<HTMLElement>(FOCALISABLES));
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (!premier || !dernier) {
      evenement.preventDefault();
      return;
    }
    const actif = document.activeElement;
    if (evenement.shiftKey && (actif === premier || actif === fenetre.current)) {
      evenement.preventDefault();
      dernier.focus();
    } else if (!evenement.shiftKey && actif === dernier) {
      evenement.preventDefault();
      premier.focus();
    }
  }

  return (
    <div
      className={classes(styles.voile, className)}
      data-forme={formeEffective}
      data-ancrage={ancrage}
      data-variante={variante}
      data-testid="voile"
      onClick={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer();
      }}
    >
      <div
        ref={fenetre}
        className={styles.fenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        onKeyDown={surTouche}
      >
        {formeEffective === "feuille" ? (
          <div className={styles.poignee} aria-hidden="true">
            <span />
          </div>
        ) : null}
        <div className={styles.entete}>
          {badge ? (
            <span className={styles.badge} aria-hidden="true">
              {badge}
            </span>
          ) : null}
          <div className={styles.titres}>
            <span id={idTitre} className={styles.titre}>
              {titre}
            </span>
            {sousTitre ? <span className={styles.sousTitre}>{sousTitre}</span> : null}
          </div>
          <button
            type="button"
            className={styles.fermer}
            aria-label={libelleFermer}
            onClick={onFermer}
          >
            <IconeFermer width={16} height={16} />
          </button>
        </div>
        <div className={styles.corps}>{children}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  );
}
