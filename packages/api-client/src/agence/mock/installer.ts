import type { Ecran } from "@afrimove/fixtures";
import type { FluxMock, ImplementationMock } from "../../infra/index";
import { installerChauffeur, installerControleur, installerConvoyeur } from "./bus";
import { installerCaisse } from "./caisse";
import { installerDepot, installerGuichetColis } from "./colis";
import { installerGuichet } from "./guichet";
import { installerCadenceQuai, installerQuai } from "./quai";
import {
  installerSuperviseur,
  installerSuperviseurDebloquer,
  installerSuperviseurEquipe,
  installerSuperviseurValider,
  installerSuperviseurVoir,
} from "./supervision";
import { PLANCHES_AGENCE } from "./types";
import type { InstallateurPlanche, NomPlancheAgence } from "./types";
import { creerPoseur } from "./utilitaires";
import { installerCadence, installerCadenceBillet, installerVente } from "./vente";

/**
 * Le scénario que le futur composeur central est en train de construire : les tableaux sont
 * remplis par chaque domaine (`installerMockAgence`, puis les installateurs des autres domaines),
 * et le résultat est renvoyé par `SourceScenarios.charger`.
 */
export interface ScenarioModifiable {
  readonly nom: string;
  readonly operations: ImplementationMock[];
  readonly flux: FluxMock[];
}

const INSTALLATEURS: { readonly [K in NomPlancheAgence]: InstallateurPlanche<K> } = {
  Guichet: installerGuichet,
  Vente: installerVente,
  Cadence: installerCadence,
  CadenceBillet: installerCadenceBillet,
  CadenceQuai: installerCadenceQuai,
  GuichetColis: installerGuichetColis,
  Depot: installerDepot,
  Quai: installerQuai,
  Convoyeur: installerConvoyeur,
  Chauffeur: installerChauffeur,
  Controleur: installerControleur,
  Caisse: installerCaisse,
  Superviseur: installerSuperviseur,
  SuperviseurValider: installerSuperviseurValider,
  SuperviseurVoir: installerSuperviseurVoir,
  SuperviseurEquipe: installerSuperviseurEquipe,
  SuperviseurDebloquer: installerSuperviseurDebloquer,
};

/** La planche appartient-elle à l'agence ? (Les planches des autres domaines sont ignorées.) */
export function estPlancheAgence(planche: string): planche is NomPlancheAgence {
  return (PLANCHES_AGENCE as readonly string[]).includes(planche);
}

/**
 * Installe dans `scenario` les réponses mock de l'agence pour la planche de `donneesScenario`
 * (un élément de `ecrans` de `@afrimove/fixtures`).
 *
 * Contrat pour le composeur central :
 * - à appeler **à chaque** `SourceScenarios.charger(nom)`, sur un scénario neuf
 *   (`{ nom, operations: [], flux: [] }`) : l'état mutable des écritures vit dans les fermetures
 *   créées ici, et chaque client doit repartir de l'état de la planche ;
 * - sans effet sur une planche qui n'est pas de l'agence ; renvoie alors `false` (le composeur
 *   peut donc appeler tous les domaines à la suite, chacun ignore les planches des autres) ;
 * - une opération déjà déclarée dans `scenario.operations` sous le même nom est remplacée ;
 * - ne lit que `donneesScenario` : aucune horloge, aucun réseau, aucun état global ;
 * - renvoie `true` quand la planche est de l'agence et que ses réponses sont installées.
 */
export function installerMockAgence(
  scenario: ScenarioModifiable,
  donneesScenario: Ecran<unknown>,
): boolean {
  const planche = donneesScenario.planche;
  if (!estPlancheAgence(planche)) return false;
  const installateur = INSTALLATEURS[planche] as InstallateurPlanche<NomPlancheAgence>;
  installateur(donneesScenario as never, creerPoseur(scenario.operations, scenario.flux));
  return true;
}
