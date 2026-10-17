import {
  FournisseurApi,
  agence,
  creerClientMock,
  implementer,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ConceptionProvider } from "@afrimove/ui";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { creerI18n } from "@/i18n";
import type { GuichetAccueil } from "./accueil-vue";

/** Outils des tests de l'écran Guichet (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type OperationsScenario = Scenario["operations"];

/** Client mock sans latence branché sur les scénarios des planches (les mêmes que le banc de fidélité). */
export function clientGuichet(
  options: {
    source?: SourceScenarios;
    scenario?: string;
  } = {},
): ClientApi {
  return creerClientMock({
    source: options.source ?? sourceScenariosFixtures(),
    scenario: options.scenario ?? "Guichet",
    latenceMs: 0,
  });
}

/** Source dont le scénario « Guichet » est modifié par `modifier` (remplacer ou ajouter des opérations). */
export function sourceModifiee(
  modifier: (operations: OperationsScenario) => OperationsScenario,
): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: modifier(scenario.operations) };
    },
  };
}

/** Remplace la réponse de l'accueil du guichet (la réponse du scénario est passée à `repondre`). */
export function avecAccueil(
  repondre: (accueil: GuichetAccueil) => GuichetAccueil,
): SourceScenarios {
  return sourceModifiee((operations) =>
    operations.map((impl) =>
      impl.operation.nom === agence.OP_GUICHET_ACCUEIL.nom
        ? implementer(agence.OP_GUICHET_ACCUEIL, async (params, ctx) =>
            repondre(
              (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
                params,
                ctx,
              )) as GuichetAccueil,
            ),
          )
        : impl,
    ),
  );
}

/** Monte l'application complète (coquille, layout guichet, barre d'onglets) sur un routeur en mémoire. */
export function rendreAppGuichet(
  options: { url?: string; client?: ClientApi; langue?: "fr" | "en" | "pcm" } = {},
): { routeur: DataRouter } {
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [options.url ?? "/guichet/accueil"],
  });
  render(
    <App
      routeur={routeur}
      clientApi={options.client ?? clientGuichet()}
      parametres={{
        demo: true,
        conception: false,
        horloge: null,
        scenario: null,
        modulesMasques: [],
      }}
      session={null}
      {...(options.langue ? { langue: options.langue } : {})}
    />,
  );
  return { routeur };
}

/** Monte seulement un contenu dans le client d'API et la langue (sans coquille ni routeur). */
export function rendreIsole(client: ClientApi, enfants: ReactNode): void {
  render(
    <I18nextProvider i18n={creerI18n("fr")}>
      <FournisseurApi client={client}>
        <ConceptionProvider actif={false}>{enfants}</ConceptionProvider>
      </FournisseurApi>
    </I18nextProvider>,
  );
}
