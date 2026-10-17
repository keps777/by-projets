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

/** Outils des tests de l'écran LivreurDevenir (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre). */

type Repondre = (params: unknown, ctx: unknown) => unknown;

export const PROGRAMME = colis.OP_PROGRAMME_LIVREUR;
export const DEPOSER = colis.OP_DEPOSER_DEMANDE_LIVREUR;

/** Source dont le scénario « LivreurDevenir » est modifié par `modifier` (au-dessus de `base`, celle des planches). */
function sourceModifiee(
  modifier: (scenario: Scenario) => Scenario,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return { ...base, charger: async (nom) => modifier(await base.charger(nom)) };
}

/** Source dont les implémentations données passent devant celles du scénario de la planche. */
export function avecOperations(
  base: SourceScenarios,
  ...remplacements: ImplementationMock[]
): SourceScenarios {
  return sourceModifiee(
    (scenario) => ({ ...scenario, operations: [...remplacements, ...scenario.operations] }),
    base,
  );
}

/** Source dont l'opération `nom` est enveloppée : `avant` voit chaque appel et peut lever une erreur. */
export function enveloppant(
  nom: string,
  avant: (params: unknown, appel: number) => void,
  base?: SourceScenarios,
): SourceScenarios {
  let appels = 0;
  return sourceModifiee(
    (scenario) => ({
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
    }),
    base,
  );
}

/** Source qui note les paramètres de chaque dépôt de demande, puis répond comme le scénario. */
export function espionnerDepot(base?: SourceScenarios): {
  source: SourceScenarios;
  demandes: contrats.DemandeLivreur[];
} {
  const demandes: contrats.DemandeLivreur[] = [];
  const source = enveloppant(
    DEPOSER.nom,
    (params) => {
      demandes.push(params as contrats.DemandeLivreur);
    },
    base,
  );
  return { source, demandes };
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

/** Monte l'application complète (coquille, layout voyageur) sur /moi/devenir-livreur. */
export function rendreLivreurDevenir(source: SourceScenarios = sourceScenariosFixtures()): {
  routeur: DataRouter;
} {
  const client = creerClientMock({ source, scenario: "LivreurDevenir", latenceMs: 0 });
  return rendreApp({ url: "/moi/devenir-livreur", clientApi: client, scenario: "LivreurDevenir" });
}
