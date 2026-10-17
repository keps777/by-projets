import {
  ServiceImpression,
  TransportFactice,
  TransportWebBluetooth,
  type StockageCle,
  type Transport,
} from "@afrimove/impression";
import { stockageLocal } from "./stockage-local";

export interface OptionsServiceApplication {
  /** Paramètres d'URL (`window.location.search`). `?imprimante=factice` branche l'imprimante simulée (démo, banc). */
  recherche?: string;
  stockage?: StockageCle;
  transport?: Transport;
}

/**
 * Le service d'impression de l'application : Web Bluetooth quand le navigateur le permet (Chrome Android),
 * sinon un transport qui annonce `disponible: false` (Safari iOS) ; l'imprimante simulée sur demande.
 */
export function creerServiceApplication(
  options: OptionsServiceApplication = {},
): ServiceImpression {
  const recherche =
    options.recherche ?? (typeof window === "undefined" ? "" : window.location.search);
  const stockage = options.stockage ?? stockageLocal;
  const factice = new URLSearchParams(recherche).get("imprimante") === "factice";
  const transport =
    options.transport ??
    (factice ? new TransportFactice({ latenceMs: 150 }) : new TransportWebBluetooth({ stockage }));
  return new ServiceImpression({ transport, stockage });
}

let parDefaut: ServiceImpression | null = null;

/** Service partagé par toute l'application quand aucun `FournisseurImpression` n'en impose un. */
export function serviceParDefaut(): ServiceImpression {
  if (!parDefaut) {
    parDefaut = creerServiceApplication();
    void parDefaut.demarrer();
  }
  return parDefaut;
}

/** Remet le service partagé à zéro (tests). */
export function reinitialiserServiceParDefaut(): void {
  parDefaut?.arreter();
  parDefaut = null;
}
