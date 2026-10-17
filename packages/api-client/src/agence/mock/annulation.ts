import { ErreurHttp } from "../../infra/index";
import { ECRITURES } from "../operations";
import type { Poseur } from "./utilitaires";

/**
 * « Annuler · PIN superviseur » : un guichetier ne peut pas annuler seul, il demande. La demande
 * attend le PIN d'un superviseur (planche « SuperviseurVoir »).
 */
export function poserDemandeAnnulation(
  poseur: Poseur,
  billetExiste: (billetId: string) => boolean,
) {
  poseur.ecriture(ECRITURES.annulationDemandee, (evenement) => {
    if (!billetExiste(evenement.donnees.billetId)) {
      throw new ErreurHttp(404, "Billet inconnu", "BILLET_INCONNU");
    }
    return { demandeId: evenement.donnees.demandeId, statut: "en_attente_du_pin" as const };
  });
}
