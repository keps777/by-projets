import { ErreurScenarioInconnu } from "../../infra/erreurs";
import type { FluxMock, ImplementationMock, Scenario } from "../../infra/scenarios";
import { mockConnexion, mockMoi } from "./compte";
import { mockCovoit, mockCovoitConducteur, mockCovoitVille, mockConducteur } from "./covoit";
import {
  mockMain,
  mockMainFiltres,
  mockMainVille,
  mockPaiement,
  mockPass,
  mockProche,
  mockSiegePay,
} from "./departs";
import type { EcranSource } from "./outils";
import { mockArret, mockCourse, mockDirect, mockGroupe, mockReseau, mockUssd } from "./services";

export type { EcranSource } from "./outils";

/** Les planches de l'app voyageur que le mock sait servir (une par scénario de `@afrimove/fixtures`). */
export const PLANCHES_VOYAGEUR = [
  "Connexion",
  "Main",
  "MainVille",
  "MainFiltres",
  "SiegePay",
  "Pass",
  "Direct",
  "Reseau",
  "Covoit",
  "Paiement",
  "Course",
  "CovoitVille",
  "CovoitConducteur",
  "Conducteur",
  "Arret",
  "Groupe",
  "USSD",
  "Moi",
  "Proche",
] as const;

export type PlancheVoyageur = (typeof PLANCHES_VOYAGEUR)[number];

export function estPlancheVoyageur(nom: string): nom is PlancheVoyageur {
  return (PLANCHES_VOYAGEUR as readonly string[]).includes(nom);
}

interface Elements {
  operations: ImplementationMock[];
  flux?: FluxMock[];
}

const FABRIQUES: Readonly<
  Record<PlancheVoyageur, (source: EcranSource) => ImplementationMock[] | Elements>
> = {
  Connexion: mockConnexion,
  Main: mockMain,
  MainVille: mockMainVille,
  MainFiltres: mockMainFiltres,
  SiegePay: mockSiegePay,
  Pass: mockPass,
  Direct: mockDirect,
  Reseau: mockReseau,
  Covoit: mockCovoit,
  Paiement: mockPaiement,
  Course: mockCourse,
  CovoitVille: mockCovoitVille,
  CovoitConducteur: mockCovoitConducteur,
  Conducteur: mockConducteur,
  Arret: mockArret,
  Groupe: mockGroupe,
  USSD: mockUssd,
  Moi: mockMoi,
  Proche: mockProche,
};

/**
 * Installe le mock voyageur pour une planche : renvoie le `Scenario` (opérations et flux temps réel)
 * qui répond avec les valeurs de `donneesScenario`, l'objet `Ecran` du scénario de
 * `@afrimove/fixtures` portant ce nom. Voir « Contrat de `installerMockVoyageur` » dans
 * `packages/contrats/src/voyageur/README.md`.
 *
 * - Aucun effet de bord : chaque appel renvoie un état neuf (compteurs, sièges bloqués, brouillons),
 *   à appeler dans `SourceScenarios.charger`.
 * - Les autres domaines (colis, agence, patron…) font de même ; le composeur central concatène les
 *   `operations` et les `flux` de chaque domaine pour la planche demandée.
 * - Lève `ErreurScenarioInconnu` si `scenario` n'est pas une planche voyageur (voir
 *   `estPlancheVoyageur`) et `Error` si `donneesScenario` n'est pas celui de `scenario`.
 */
export function installerMockVoyageur(scenario: string, donneesScenario: EcranSource): Scenario {
  if (!estPlancheVoyageur(scenario)) throw new ErreurScenarioInconnu(scenario, PLANCHES_VOYAGEUR);
  if (donneesScenario.planche !== scenario) {
    throw new Error(
      `installerMockVoyageur : le scénario « ${scenario} » ne correspond pas aux données de « ${donneesScenario.planche} »`,
    );
  }
  const construit = FABRIQUES[scenario](donneesScenario);
  const elements: Elements = Array.isArray(construit) ? { operations: construit } : construit;
  return { nom: scenario, operations: elements.operations, flux: elements.flux ?? [] };
}
