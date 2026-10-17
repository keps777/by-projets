import {
  creerClientMock,
  implementer,
  colis,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { colis as c } from "@afrimove/contrats";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran LivreurVerification (pas un test : le nom ne suit pas `*.test.tsx`). */

type Operations = Scenario["operations"];
type Repondre = (params: unknown, ctx: unknown) => unknown;

export const OP_SUIVI = colis.OP_SUIVI_DEMANDE_LIVREUR;

/** Client mock sans latence, branché sur le scénario de la planche (celui du banc de fidélité). */
export function clientVerification(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "LivreurVerification", latenceMs: 0 });
}

/** Source dont les opérations données répondent à la place de celles du scénario de la planche. */
export function avecOperations(...remplacements: Operations): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: [...remplacements, ...scenario.operations] };
    },
  };
}

/** Réponse du scénario pour le suivi, modifiée par `modifier`. */
export function suiviModifie(modifier: (suivi: c.SuiviDemande) => c.SuiviDemande): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      const originale = scenario.operations.find((o) => o.operation.nom === OP_SUIVI.nom);
      if (!originale) throw new Error("Opération absente du scénario");
      const reponse = originale.repondre as Repondre;
      return {
        ...scenario,
        operations: [
          implementer(OP_SUIVI, async (p, ctx) =>
            modifier((await reponse(p, ctx)) as c.SuiviDemande),
          ),
          ...scenario.operations,
        ],
      };
    },
  };
}

/** Source dont le suivi lève `erreur(appel)` (et répond normalement si elle renvoie `undefined`). */
export function suiviEnPanne(erreur: (appel: number) => Error | undefined): {
  source: SourceScenarios;
  appels: () => number;
} {
  let appels = 0;
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((impl) =>
          impl.operation.nom === OP_SUIVI.nom
            ? ({
                operation: impl.operation,
                repondre: (params: unknown, ctx: unknown) => {
                  appels += 1;
                  const panne = erreur(appels);
                  if (panne) throw panne;
                  return (impl.repondre as Repondre)(params, ctx);
                },
              } as Operations[number])
            : impl,
        ),
      };
    },
  };
  return { source, appels: () => appels };
}

/** Source dont le suivi ne répond jamais (état de chargement). */
export function suiviSansReponse(): SourceScenarios {
  return avecOperations(implementer(OP_SUIVI, () => new Promise<c.SuiviDemande>(() => {})));
}

/** Monte l'application complète (coquille, layout voyageur) sur la route de la planche. */
export function rendreVerification(client: ClientApi = clientVerification()): {
  routeur: DataRouter;
} {
  return rendreApp({
    url: "/moi/devenir-livreur/suivi",
    clientApi: client,
    scenario: "LivreurVerification",
  });
}
