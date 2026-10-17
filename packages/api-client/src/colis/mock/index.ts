import { installerInterAgences, installerConvention } from "./inter-agences";
import {
  installerLivreurDevenir,
  installerLivreurVerification,
  installerRelaisDevenir,
  installerRelaisInscription,
  installerRelaisVerification,
} from "./inscriptions";
import { installerLivreur, installerRelaisApp } from "./partenaires";
import type { DonneesScenario, ScenarioEnConstruction } from "./outils";
import { installerVendeur } from "./vendeur";
import {
  installerColisCode,
  installerColisEnvoi,
  installerLivraison,
  installerRelais,
} from "./voyageur";

export type { DonneesScenario, ScenarioEnConstruction } from "./outils";
export { ESSAIS_CODE_MAX } from "./partenaires";

/** Planches dont ce module sait installer les opérations (voir `installerMockColis`). */
export const PLANCHES_COLIS = [
  "ColisEnvoi",
  "ColisCode",
  "Relais",
  "Livraison",
  "RelaisApp",
  "Livreur",
  "RelaisDevenir",
  "RelaisInscription",
  "RelaisVerification",
  "LivreurDevenir",
  "LivreurVerification",
  "InterAgences",
  "InterAgencesConvention",
  "Vendeur",
] as const;
export type PlancheColis = (typeof PLANCHES_COLIS)[number];

export function estPlancheColis(planche: string): planche is PlancheColis {
  return (PLANCHES_COLIS as readonly string[]).includes(planche);
}

const INSTALLATEURS: Record<
  PlancheColis,
  (sc: ScenarioEnConstruction, d: DonneesScenario) => void
> = {
  ColisEnvoi: installerColisEnvoi,
  ColisCode: installerColisCode,
  Relais: installerRelais,
  Livraison: installerLivraison,
  RelaisApp: installerRelaisApp,
  Livreur: installerLivreur,
  RelaisDevenir: installerRelaisDevenir,
  RelaisInscription: installerRelaisInscription,
  RelaisVerification: installerRelaisVerification,
  LivreurDevenir: installerLivreurDevenir,
  LivreurVerification: installerLivreurVerification,
  InterAgences: installerInterAgences,
  InterAgencesConvention: installerConvention,
  Vendeur: installerVendeur,
};

/**
 * Branche sur `scenario` les opérations et flux mock des colis et des partenaires pour la planche
 * décrite par `donneesScenario` (`ecrans[nomPlanche]` de `@afrimove/fixtures`).
 *
 * Contrat pour le composeur central :
 *
 * - `scenario` est un `ScenarioEnConstruction` vide (`{ nom, operations: [], flux: [] }`) que le
 *   composeur remplit en appelant chaque `installerMock<Domaine>` puis renvoie comme `Scenario` ;
 * - `donneesScenario` est le scénario de planche des fixtures, tel quel ; la planche détermine ce
 *   qui est installé ;
 * - une planche qui n'est pas dans `PLANCHES_COLIS` est ignorée : l'appel est sans effet, et
 *   renvoie `false` (sinon `true`) ;
 * - appeler cette fonction **à chaque** `SourceScenarios.charger` : l'état muable du mock (colis
 *   créés, essais de code, missions) est dans la fermeture installée, donc propre à un client ;
 * - la source de scénarios doit aussi renvoyer `ecrans[nom].maintenant` dans `instantInitial`,
 *   pour que l'horloge du client mock coïncide avec l'heure de la planche.
 */
export function installerMockColis(
  scenario: ScenarioEnConstruction,
  donneesScenario: DonneesScenario,
): boolean {
  const planche = donneesScenario.planche;
  if (!estPlancheColis(planche)) return false;
  INSTALLATEURS[planche](scenario, donneesScenario);
  return true;
}
