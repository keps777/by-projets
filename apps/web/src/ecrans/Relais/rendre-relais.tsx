import {
  creerClientMock,
  horlogeGelee,
  implementer,
  type ClientMock,
  type ContexteMock,
  type FluxMock,
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

/** Outils des tests de l'écran Relais (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
/** Identifiant du colis de Maman dans le monde de démonstration. */
export const COLIS_ID = "colis-c-dla-270105-0017";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduRelais {
  /**
   * Implémentations qui passent devant celles du scénario « Relais » (le client prend la première trouvée).
   * `originale(nom)` rend celle du scénario, pour la surveiller ou la compléter.
   */
  operations?: (originale: Originale) => ImplementationMock[];
  /** Flux qui passent devant ceux du scénario. */
  flux?: () => FluxMock[];
  conception?: boolean;
  latenceMs?: number;
  /** Identifiant du colis dans l'adresse (par défaut celui de Maman). */
  colisId?: string;
}

/** Source du scénario « Relais » des fixtures, avec des opérations ou des flux remplacés. */
function sourceModifiee(options: OptionsRenduRelais): SourceScenarios {
  const base = sourceScenariosFixtures();
  if (!options.operations && !options.flux) return base;
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
        flux: [...(options.flux?.() ?? []), ...(scenario.flux ?? [])],
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

/** Garde l'implémentation du scénario pour `operation` et modifie sa réponse (le numéro d'appel est donné). */
export function transformer<P, R>(
  operation: Operation<P, R>,
  originale: Originale,
  modifier: (reponse: R, appel: number) => R,
): ImplementationMock {
  const reponse = originale(operation.nom).repondre as (
    params: P,
    ctx: ContexteMock,
  ) => R | Promise<R>;
  let appel = 0;
  return implementer(operation, async (params, ctx) =>
    modifier(await reponse(params, ctx), ++appel),
  );
}

/** Monte l'application complète sur /colis/<colisId>/relais, avec le mock du scénario « Relais ». */
export function rendreRelais(options: OptionsRenduRelais = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { conception = false, latenceMs = 0, colisId = COLIS_ID } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "Relais",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [`/colis/${colisId}/relais`],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{
        demo: true,
        conception,
        horloge: null,
        scenario: "Relais",
        modulesMasques: [],
      }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
