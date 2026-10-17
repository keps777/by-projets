import {
  colis,
  creerClientMock,
  type ImplementationMock,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran RelaisVerification (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre). */

type Repondre = (params: unknown, ctx: unknown) => unknown;

export const SUIVI = colis.OP_SUIVI_DEMANDE_RELAIS;

/** Source dont le scénario « RelaisVerification » est modifié par `modifier` (au-dessus de `base`, celle des planches). */
function sourceModifiee(
  modifier: (scenario: Scenario) => Scenario,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return { ...base, charger: async (nom) => modifier(await base.charger(nom)) };
}

/** Source dont l'opération `nom` est enveloppée : `avant` voit chaque appel (paramètres, rang) et peut lever une erreur. */
export function enveloppant(
  nom: string,
  avant: (params: unknown, appel: number) => void,
): SourceScenarios {
  let appels = 0;
  return sourceModifiee((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) => {
              appels += 1;
              avant(params, appels);
              return (impl.repondre as Repondre)(params, ctx);
            },
          } as ImplementationMock)
        : impl,
    ),
  }));
}

/** Source dont le suivi est celui de la planche, retouché par `modifier` (une demande activée, refusée…). */
export function avecSuivi(
  modifier: (suivi: contrats.SuiviDemande) => contrats.SuiviDemande,
): SourceScenarios {
  return sourceModifiee((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === SUIVI.nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) =>
              modifier((impl.repondre as Repondre)(params, ctx) as contrats.SuiviDemande),
          } as ImplementationMock)
        : impl,
    ),
  }));
}

/** Source dont l'opération `nom` ne répond jamais (état de chargement). */
export function sansReponse(nom: string): SourceScenarios {
  return sourceModifiee((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? ({
            operation: impl.operation,
            repondre: () => new Promise(() => {}),
          } as ImplementationMock)
        : impl,
    ),
  }));
}

/** Monte l'application complète (coquille, layout voyageur) sur /moi/devenir-relais/suivi. */
export function rendreRelaisVerification(
  source: SourceScenarios = sourceScenariosFixtures(),
  recherche = "",
): { routeur: DataRouter } {
  const client = creerClientMock({ source, scenario: "RelaisVerification", latenceMs: 0 });
  return rendreApp({
    url: `/moi/devenir-relais/suivi${recherche}`,
    clientApi: client,
    scenario: "RelaisVerification",
  });
}
