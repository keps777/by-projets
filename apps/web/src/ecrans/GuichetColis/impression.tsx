import { createContext, useContext, type ReactNode } from "react";

/**
 * Ce qui sort sur l'étiquette de 58 × 40 mm. Il n'y a volontairement aucun champ « code de retrait » : le code part par
 * SMS au destinataire seul, il ne figure jamais sur l'étiquette.
 */
export interface EtiquetteAImprimer {
  /** C-ALP-DLA-270105-0042 */
  numero: string;
  largeurMm: number;
  hauteurMm: number;
  trajet: { origine: string; destination: string };
  /** « Ngo Thérèse · ···· 18 22 » */
  destinataire: string;
  poidsKg: number;
  /** « 08:15 » */
  heureDepart: string;
  /** « Alpha Voyages » */
  compagnie: string | null;
}

/**
 * Interface locale de l'impression de l'étiquette. Elle sera branchée sur `@afrimove/impression` (AM-075) en fournissant
 * un `PiloteEtiquette` par `FournisseurPiloteEtiquette` ; l'écran n'importe pas ce paquet.
 */
export interface PiloteEtiquette {
  /** Envoie l'étiquette à l'imprimante ; rejette si elle n'est pas sortie. */
  imprimer(etiquette: EtiquetteAImprimer): Promise<void>;
}

/** Tant qu'aucun pilote n'est branché : rien ne sort, mais l'événement « impression demandée » est tout de même journalisé. */
export const piloteParDefaut: PiloteEtiquette = {
  imprimer: () => Promise.resolve(),
};

const ContextePilote = createContext<PiloteEtiquette>(piloteParDefaut);

export function FournisseurPiloteEtiquette({
  pilote,
  children,
}: {
  pilote: PiloteEtiquette;
  children: ReactNode;
}) {
  return <ContextePilote.Provider value={pilote}>{children}</ContextePilote.Provider>;
}

export function usePiloteEtiquette(): PiloteEtiquette {
  return useContext(ContextePilote);
}
