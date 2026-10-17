import type { Ecran } from "@afrimove/fixtures";
import { mockAnalyses } from "./mock/analyses";
import { mockAssistant } from "./mock/assistant";
import { mockAujourdhui } from "./mock/aujourdhui";
import { mockComptable } from "./mock/comptable";
import { creerSourceFixtures } from "./mock/contexte";
import type { ContributionMock } from "./mock/contexte";
import { mockControle } from "./mock/controle";
import { mockEquipe } from "./mock/equipe";
import { mockFinancement } from "./mock/financement";
import { mockInterAgences } from "./mock/interAgences";
import { mockModules } from "./mock/modules";
import { mockRapport } from "./mock/rapport";
import { mockReglages } from "./mock/reglages";

export type { ContributionMock } from "./mock/contexte";

/**
 * Les planches de `@afrimove/fixtures` que l'espace patron sait afficher (les 24 écrans patron et
 * la salle de contrôle). Un scénario qui porte un de ces noms reçoit exactement les valeurs de la
 * planche ; tout autre nom (« defaut », une planche d'un autre espace) reçoit le monde patron
 * complet, pour que la navigation entre les écrans patron fonctionne.
 */
export const PLANCHES_PATRON = [
  "Patron",
  "PatronEquipe",
  "PatronGare",
  "PatronPersonne",
  "RapportSoir",
  "Analyses",
  "AnalysesLigne",
  "AnalysesBus",
  "Assistant",
  "AssistantReponse",
  "Comptable",
  "ComptableRapprochement",
  "ComptableApercu",
  "ComptableCloture",
  "Config",
  "ConfigLigne",
  "ConfigPersonne",
  "ConfigRegles",
  "ConfigEquipeListe",
  "Modules",
  "Financement",
  "FinancementDemande",
  "InterAgences",
  "InterAgencesConvention",
  "Controle",
] as const;
export type PlancheMockPatron = (typeof PLANCHES_PATRON)[number];

export function estPlancheMockPatron(nom: string): nom is PlancheMockPatron {
  return (PLANCHES_PATRON as readonly string[]).includes(nom);
}

/**
 * Installe le mock patron pour un scénario.
 *
 * Contrat avec le composeur central (voir le README des contrats patron) :
 * - `scenario` : le nom du scénario demandé (`?scenario=` : un nom de planche, ou « defaut »).
 * - `donneesScenario` : le scénario de `@afrimove/fixtures` chargé pour ce nom (`ecrans[scenario]`),
 *   ou `undefined` (scénario « defaut »). Il prime sur les fixtures pour sa propre planche.
 * - Retour : les `ImplementationMock` et `FluxMock` à ajouter au `Scenario` du client mock
 *   (`{ nom, operations: [...patron.operations, ...autres], flux: [...patron.flux, ...autres] }`).
 *
 * Sans effet de bord : chaque appel renvoie un état neuf (modules, règles, dossiers, rapprochement
 * repartent des fixtures), donc à appeler dans `SourceScenarios.charger`, une fois par client.
 */
export function installerMockPatron(
  scenario: string,
  donneesScenario?: Ecran<unknown>,
): ContributionMock {
  const src = creerSourceFixtures(scenario, donneesScenario);
  const contributions = [
    mockAujourdhui(src),
    mockEquipe(src),
    mockRapport(src),
    mockAnalyses(src),
    mockAssistant(src),
    mockComptable(src),
    mockReglages(src),
    mockModules(src),
    mockFinancement(src),
    mockInterAgences(src),
    mockControle(src),
  ];
  return {
    operations: contributions.flatMap((x) => x.operations),
    flux: contributions.flatMap((x) => x.flux),
  };
}
