import { createContext, useContext, type ReactNode } from "react";
import styles from "./badge-touche.module.css";

const ConceptionContexte = createContext(false);

/**
 * Active ou coupe le mode conception pour tout ce qu'il contient. Pendant la conception, chaque écran
 * affiche le compteur « TOUCHE n » ; en production il est retiré (règle 1 de la planche Système).
 */
export function ConceptionProvider({ actif, children }: { actif: boolean; children: ReactNode }) {
  return <ConceptionContexte.Provider value={actif}>{children}</ConceptionContexte.Provider>;
}

/** Vrai quand le flag conception est actif dans le contexte courant. */
export function useConception(): boolean {
  return useContext(ConceptionContexte);
}

export interface PropsBadgeTouche {
  /** Numéro de la touche (1, 2 ou 3). */
  n: number;
  /** Nombre de touches de la fonction : « TOUCHE 2 / 3 ». Absent, seul le numéro est affiché. */
  sur?: number;
  /** Force l'affichage ou le masquage ; sinon on suit le flag conception du contexte. */
  actif?: boolean;
  className?: string;
}

/** Badge « TOUCHE n », rendu uniquement si le flag conception est actif. */
export function BadgeTouche({ n, sur, actif, className }: PropsBadgeTouche) {
  const conception = useConception();
  if (!(actif ?? conception)) return null;
  return (
    <span className={[styles.badge, className].filter(Boolean).join(" ")}>
      {sur === undefined ? `TOUCHE ${n}` : `TOUCHE ${n} / ${sur}`}
    </span>
  );
}
