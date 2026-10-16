import type { ReactNode } from "react";
import { Cible } from "./cible";
import { cx } from "./cx";
import styles from "./barre-onglets.module.css";

export interface OngletBarre {
  /** Identifiant, comparé à `actif`. */
  cle: string;
  libelle: string;
  /** Icône de 22 px (voir `icones.tsx`). */
  icone: ReactNode;
  /** Destination (lien) ; sans `href`, l'onglet est un bouton qui appelle `onSelect`. */
  href?: string;
}

type QuatreOuCinq = readonly [OngletBarre, OngletBarre, OngletBarre, OngletBarre, OngletBarre?];

export interface PropsBarreOnglets {
  /** Quatre ou cinq entrées, jamais plus (voyageur et patron : 4 ; guichet : 5). */
  onglets: QuatreOuCinq;
  /** Clé de l'onglet courant : orange, en gras, `aria-current="page"`. */
  actif: string;
  onSelect?: (cle: string) => void;
  /** Nom de la navigation lu par les lecteurs d'écran (« Navigation », « Navigation guichet »). */
  "aria-label": string;
  className?: string;
}

/** Barre d'onglets du bas, sur fond Profond. */
export function BarreOnglets({
  onglets,
  actif,
  onSelect,
  "aria-label": ariaLabel,
  className,
}: PropsBarreOnglets) {
  return (
    <nav aria-label={ariaLabel} className={cx(styles.barre, className)}>
      {onglets.map((onglet) => {
        if (!onglet) return null;
        const courant = onglet.cle === actif;
        const commun = {
          className: cx(styles.onglet, courant && styles.courant),
          "aria-current": courant ? ("page" as const) : undefined,
        };
        const contenu = (
          <>
            {onglet.icone}
            {onglet.libelle}
          </>
        );
        return onglet.href !== undefined ? (
          <Cible key={onglet.cle} href={onglet.href} {...commun}>
            {contenu}
          </Cible>
        ) : (
          <Cible key={onglet.cle} onClick={() => onSelect?.(onglet.cle)} {...commun}>
            {contenu}
          </Cible>
        );
      })}
    </nav>
  );
}
