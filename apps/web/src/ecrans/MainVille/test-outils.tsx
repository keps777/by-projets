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

/** Outils des tests de l'écran MainVille (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type Operations = Scenario["operations"];

/** Client mock sans latence, branché sur les scénarios des planches (ceux du banc de fidélité). */
export function clientMainVille(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "MainVille", latenceMs: 0 });
}

/** Source dont le scénario est modifié par `modifier` (remplacer, ajouter ou retirer des opérations). */
export function sourceModifiee(
  modifier: (scenario: Scenario) => Scenario,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
}

type Repondre<R> = (reponse: R, params: c.RechercheVille) => R | Promise<R>;

/** Remplace la réponse de la recherche d'offres de la ville ; `repondre` reçoit la réponse du scénario. */
export function avecRecherche(
  repondre: Repondre<c.ResultatRechercheVille>,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return sourceModifiee((scenario) => {
    const origine = scenario.operations.find(
      (o) => o.operation.nom === voyageur.OP_RECHERCHER_VILLE.nom,
    )!;
    const operations: Operations = [
      implementer(voyageur.OP_RECHERCHER_VILLE, async (params, ctx) =>
        repondre(
          (await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as c.ResultatRechercheVille,
          params,
        ),
      ),
      ...scenario.operations,
    ];
    return { ...scenario, operations };
  }, base);
}

/** Enregistre les paramètres de chaque recherche d'offres reçue par le mock. */
export function espionnerRecherches(base: SourceScenarios = sourceScenariosFixtures()): {
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

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur l'accueil « même ville ». */
export function rendreAppMainVille(
  options: { url?: string; client?: ClientApi; masques?: string[] } = {},
): { routeur: DataRouter } {
  return rendreApp({
    url: options.url ?? "/voyager/ville",
    clientApi: options.client ?? clientMainVille(),
    scenario: "MainVille",
    ...(options.masques ? { masques: options.masques } : {}),
  });
}
