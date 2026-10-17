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

/** Outils des tests de l'écran Course (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
/** Billet du monde de démonstration, celui que le billet ouvre vers la course. */
export const BILLET_ID = "BEX-DLA-270105-0142";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduCourse {
  /**
   * Implémentations qui passent devant celles du scénario « Course » (le client prend la première trouvée).
   * `originale(nom)` rend celle du scénario, pour la surveiller ou la compléter.
   */
  operations?: (originale: Originale) => ImplementationMock[];
  /** Adresse de l'écran (par défaut `/course?billetId=<billet de démonstration>`). */
  url?: string;
  /** Mode démonstration de l'application (vrai par défaut). */
  demo?: boolean;
  conception?: boolean;
  latenceMs?: number;
}

function sourceModifiee(options: OptionsRenduCourse): SourceScenarios {
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
  modifier: (reponse: R, params: P) => R,
): ImplementationMock {
  const reponse = originale(operation.nom).repondre as (
    params: P,
    ctx: ContexteMock,
  ) => R | Promise<R>;
  return implementer(operation, async (params, ctx) =>
    modifier(await reponse(params, ctx), params),
  );
}

/** Monte l'application complète sur /course, avec le mock du scénario « Course ». */
export function rendreCourse(options: OptionsRenduCourse = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const {
    conception = false,
    demo = true,
    latenceMs = 0,
    url = `/course?billetId=${BILLET_ID}`,
  } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "Course",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [url],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{ demo, conception, horloge: null, scenario: "Course", modulesMasques: [] }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
