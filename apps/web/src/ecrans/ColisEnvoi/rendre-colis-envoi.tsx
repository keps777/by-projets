import {
  creerClientMock,
  horlogeGelee,
  implementer,
  type ClientMock,
  type ContexteMock,
  type ImplementationMock,
  type Operation,
  type SourceScenarios,
} from "@afrimove/api-client";
import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { horlogeFigee } from "@/coquille/horloge";

/** Outils des tests de l'écran ColisEnvoi (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduColisEnvoi {
  /**
   * Implémentations qui passent devant celles du scénario « ColisEnvoi » (le client prend la première trouvée).
   * `originale(nom)` rend celle du scénario, pour la surveiller ou la compléter.
   */
  operations?: (originale: Originale) => ImplementationMock[];
  conception?: boolean;
  /** Démonstration de la planche (formulaire rempli, photo prise) ; sinon le formulaire d'un voyageur. */
  demonstration?: boolean;
  latenceMs?: number;
}

/** Source du scénario « ColisEnvoi » des fixtures, avec des opérations remplacées. */
function sourceModifiee(options: OptionsRenduColisEnvoi): SourceScenarios {
  const base = sourceScenariosFixtures();
  if (!options.operations) return base;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const originale: Originale = (nomOperation) => {
        const trouvee = scenario.operations.find((o) => o.operation.nom === nomOperation);
        if (!trouvee) throw new Error(`Opération absente du scénario : ${nomOperation}`);
        return trouvee;
      };
      return {
        ...scenario,
        operations: [...(options.operations?.(originale) ?? []), ...scenario.operations],
      };
    },
  };
}

/** Garde la réponse du scénario pour `operation` et note les paramètres de chaque appel. */
export function surveiller<P, R>(
  operation: Operation<P, R>,
  originale: Originale,
  journal: (params: P) => void,
): ImplementationMock {
  const reponse = originale(operation.nom).repondre as (
    params: P,
    ctx: ContexteMock,
  ) => R | Promise<R>;
  return implementer(operation, (params, ctx) => {
    journal(params);
    return reponse(params, ctx);
  });
}

/** Garde l'implémentation du scénario pour `operation` et modifie sa réponse. */
export function transformer<P, R>(
  operation: Operation<P, R>,
  originale: Originale,
  modifier: (reponse: R) => R,
): ImplementationMock {
  const reponse = originale(operation.nom).repondre as (
    params: P,
    ctx: ContexteMock,
  ) => R | Promise<R>;
  return implementer(operation, async (params, ctx) => modifier(await reponse(params, ctx)));
}

/** Monte l'application complète sur /colis, avec le mock du scénario « ColisEnvoi ». */
export function rendreColisEnvoi(options: OptionsRenduColisEnvoi = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { conception = false, demonstration = true, latenceMs = 0 } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "ColisEnvoi",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: ["/colis"],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{
        demo: true,
        conception,
        horloge: null,
        scenario: demonstration ? "ColisEnvoi" : null,
        modulesMasques: [],
      }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
