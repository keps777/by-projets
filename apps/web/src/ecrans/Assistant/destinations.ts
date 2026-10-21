import { urlPlanche } from "@/coquille/planches";
import type { ActionAssistant } from "./types";

/**
 * Écran qui s'ouvre quand le patron touche une action de l'assistant. Aucune action ne modifie quoi que ce soit ici :
 * elle ouvre l'écran de réglage concerné, où le patron décide (et signe par son PIN).
 *
 * - « Contrôle inopiné mardi » -> Controleur ;
 * - « Numéro obligatoire en cadence » et « Décaler le 10:00 à 09:15 dès lundi » -> Config (les propositions de
 *   l'assistant y sont déjà en ambre, à valider) ; l'ajout d'un départ est aussi un réglage de ligne ;
 * - « Voir la ligne en détail » -> AnalysesLigne, et « Ajouter un départ » -> ConfigLigne, quand l'action porte sa ligne
 *   (`ligneId`) ; sinon la liste des lignes (Analyses) ou les réglages (Config).
 */
export function destinationAction(type: ActionAssistant["type"], ligneId?: string): string {
  switch (type) {
    case "controle_inopine":
      return urlPlanche("Controleur");
    case "regle_cadence_numero":
    case "decaler_depart":
      return urlPlanche("Config");
    case "ajouter_depart":
      return ligneId ? urlPlanche("ConfigLigne", { ligneId }) : urlPlanche("Config");
    case "voir_ligne":
      return ligneId ? urlPlanche("AnalysesLigne", { ligneId }) : urlPlanche("Analyses");
  }
}
