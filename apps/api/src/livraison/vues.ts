import type { ColisStocke } from "../colis/modele";
import { vueColisPartenaire } from "../relais/vues";
import type { MissionLivraison } from "./modele";
import { DELAI_ACCEPTATION_SECONDES } from "./regles";

/**
 * `SchemaMissionLivraison` : la mission telle que le livreur la voit. Le colis passe par
 * `vueColisPartenaire` (jamais de code de retrait) ; `remiseContreCode` est le seul signe du code.
 */
export function vueMission(mission: MissionLivraison, colis: ColisStocke) {
  return {
    id: mission.id,
    colis: vueColisPartenaire(colis),
    trajet: {
      depart: mission.trajet.depart,
      arrivee: mission.trajet.arrivee,
      destinataire: mission.trajet.destinataire,
    },
    distanceM: Math.max(1, mission.distanceM),
    dureeMinutes: Math.max(1, mission.dureeMinutes),
    gain: mission.gain,
    delaiAcceptationSecondes: DELAI_ACCEPTATION_SECONDES,
    expireA: mission.expireA ?? mission.proposeeA ?? mission.creeA,
    remiseContreCode: true as const,
  };
}
