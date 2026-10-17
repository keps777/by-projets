import type { ServiceImpression } from "@afrimove/impression";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { serviceParDefaut } from "./service";

const ContexteImpression = createContext<ServiceImpression | null>(null);

interface Props {
  /** Service imposé (tests, démo). Sinon, le service partagé de l'application. */
  service?: ServiceImpression;
  children?: ReactNode;
}

/**
 * Impose un service d'impression à tout ce qu'il contient. Facultatif : sans lui, les hooks utilisent le service
 * partagé (Web Bluetooth, ou l'imprimante simulée avec `?imprimante=factice`).
 */
export function FournisseurImpression({ service, children }: Props) {
  useEffect(() => {
    if (!service) return;
    void service.demarrer();
    return () => service.arreter();
  }, [service]);
  return (
    <ContexteImpression.Provider value={service ?? null}>{children}</ContexteImpression.Provider>
  );
}

/** Le service d'impression courant. */
export function useServiceImpression(): ServiceImpression {
  return useContext(ContexteImpression) ?? serviceParDefaut();
}
