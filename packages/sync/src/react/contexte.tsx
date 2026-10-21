import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { MoteurSync } from "../moteur";

const ContexteMoteur = createContext<MoteurSync | null>(null);

export interface PropsFournisseurSync {
  moteur: MoteurSync;
  children?: ReactNode;
}

/**
 * À placer une fois, haut dans l'arbre de chaque app agence (guichet, quai, bus, supervision), sous
 * le fournisseur de l'API : le moteur de l'appareil, ouvert avec `MoteurSync.ouvrir`.
 */
export function FournisseurSync({ moteur, children }: PropsFournisseurSync) {
  return <ContexteMoteur.Provider value={moteur}>{children}</ContexteMoteur.Provider>;
}

export function useMoteurSync(): MoteurSync {
  const moteur = useContext(ContexteMoteur);
  if (!moteur) throw new Error("useMoteurSync : monter un <FournisseurSync moteur={…}>");
  return moteur;
}

/** Comme `useMoteurSync`, mais `null` hors fournisseur (composant partagé avec une app sans moteur). */
export function useMoteurSyncOptionnel(): MoteurSync | null {
  return useContext(ContexteMoteur);
}
