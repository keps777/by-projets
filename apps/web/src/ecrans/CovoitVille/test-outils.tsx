import {
  creerClientMock,
  implementer,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran CovoitVille (pas un test : le nom ne suit pas `*.test.tsx`). */

type Operations = Scenario["operations"];
type Repondre<P, R> = (reponse: R, params: P) => R | Promise<R>;

/** Client mock sans latence, branché sur les scénarios des planches (ceux du banc de fidélité). */
export function clientCovoitVille(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "CovoitVille", latenceMs: 0 });
}

/** Source dont le scénario est modifié par `modifier` (remplacer, ajouter ou retirer des opérations). */
export function sourceModifiee(
  modifier: (scenario: Scenario) => Scenario,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return { ...base, charger: async (nom) => modifier(await base.charger(nom)) };
}

type Operation<P, R> = Parameters<typeof implementer<P, R>>[0];

/** Remplace la réponse d'une opération ; `repondre` reçoit la réponse du scénario et les paramètres. */
export function avecReponse<P, R>(
  operation: Operation<P, R>,
  repondre: Repondre<P, R>,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return sourceModifiee((scenario) => {
    const origine = scenario.operations.find((o) => o.operation.nom === operation.nom);
    const operations: Operations = [
      implementer(operation, async (params, ctx) => {
        const reponse = origine
          ? ((await (origine.repondre as (p: unknown, c: unknown) => unknown)(params, ctx)) as R)
          : (undefined as R);
        return repondre(reponse, params);
      }),
      ...scenario.operations,
    ];
    return { ...scenario, operations };
  }, base);
}

/** Remplace la réponse de la recherche d'offres en ville. */
export const avecRecherche = (
  repondre: Repondre<c.RechercheVille, c.ResultatRechercheVille>,
  base?: SourceScenarios,
) => avecReponse(voyageur.OP_RECHERCHER_VILLE, repondre, base);

/** Enregistre les paramètres de chaque recherche d'offres reçue par le mock. */
export function espionnerRecherches(base?: SourceScenarios): {
  source: SourceScenarios;
  recherches: c.RechercheVille[];
} {
  const recherches: c.RechercheVille[] = [];
  const source = avecRecherche((reponse, params) => {
    recherches.push(params);
    return reponse;
  }, base);
  return { source, recherches };
}

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur /covoit/ville. */
export function rendreAppCovoitVille(
  options: { client?: ClientApi; demonstration?: boolean } = {},
): { routeur: DataRouter } {
  const { client = clientCovoitVille(), demonstration = true } = options;
  return rendreApp({
    url: "/covoit/ville",
    clientApi: client,
    ...(demonstration ? { scenario: "CovoitVille" } : {}),
  });
}
