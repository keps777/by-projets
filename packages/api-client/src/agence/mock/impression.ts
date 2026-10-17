import type { agence as c } from "@afrimove/contrats";
import { ECRITURES, OP_IMPRESSION_ETAT } from "../operations";
import type { Poseur } from "./utilitaires";

/**
 * Impression, commune aux planches qui impriment (vente, cadence, colis, dépôt). L'imprimante est
 * celle que montre la planche (« imprimante OK »).
 */
export function installerImpression(
  poseur: Poseur,
  imprimante: c.ImprimanteAgence = { etat: "ok", nom: null },
): void {
  poseur.lecture(OP_IMPRESSION_ETAT, () => ({ imprimante }));
  poseur.ecriture(ECRITURES.impressionDemandee, () => ({
    statut: imprimante.etat === "ok" ? ("imprime" as const) : ("en_attente_imprimante" as const),
  }));
}
