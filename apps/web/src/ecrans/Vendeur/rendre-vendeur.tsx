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

/** Outils des tests de l'écran Vendeur (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduVendeur {
  /**
   * Implémentations qui passent devant celles du scénario « Vendeur » (le client prend la première trouvée).
   * `originale(nom)` rend celle du scénario, pour la surveiller ou la compléter.
   */
  operations?: (originale: Originale) => ImplementationMock[];
  /** Flux qui passent devant ceux du scénario. */
  flux?: () => FluxMock[];
  conception?: boolean;
  latenceMs?: number;
}

/** Source du scénario « Vendeur » des fixtures, avec des opérations ou des flux remplacés. */
function sourceModifiee(options: OptionsRenduVendeur): SourceScenarios {
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

/** Monte l'application complète sur /vendeur/accueil, avec le mock du scénario « Vendeur ». */
export function rendreVendeur(options: OptionsRenduVendeur = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { conception = false, latenceMs = 0 } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "Vendeur",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: ["/vendeur/accueil"],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{
        demo: true,
        conception,
        horloge: null,
        scenario: "Vendeur",
        modulesMasques: [],
      }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
