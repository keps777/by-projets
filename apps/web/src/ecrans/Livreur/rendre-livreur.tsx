import {
  creerClientMock,
  horlogeGelee,
  type ClientMock,
  type FluxMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { horlogeFigee, type Horloge } from "@/coquille/horloge";

/** Outils des tests de l'écran Livreur (pas un test : le nom ne suit pas `*.test.tsx`). */

/** Instant du scénario « Livreur » : la mission expire 24 s plus tard, d'où le « 0:24 » de la planche. */
export const HORLOGE_PLANCHE = "2027-01-05T13:06:00+01:00";
/** Identifiant du colis de la mission (celui de Maman : l'écran Livraison s'ouvre dessus). */
export const COLIS_ID = "colis-c-dla-270105-0017";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduLivreur {
  /** Implémentations qui passent devant celles du scénario (le client prend la première trouvée). */
  operations?: (originale: Originale) => ImplementationMock[];
  /** Flux qui passent devant ceux du scénario. */
  flux?: () => FluxMock[];
  /** Horloge de l'application (par défaut figée à l'instant du scénario). */
  horloge?: Horloge;
  conception?: boolean;
  latenceMs?: number;
}

function sourceModifiee(options: OptionsRenduLivreur): SourceScenarios {
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

/** Monte l'application complète sur /livreur/accueil, avec le mock du scénario « Livreur ». */
export function rendreLivreur(options: OptionsRenduLivreur = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { conception = false, latenceMs = 0, horloge = horlogeFigee(HORLOGE_PLANCHE) } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "Livreur",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: ["/livreur/accueil"],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{
        demo: true,
        conception,
        horloge: null,
        scenario: "Livreur",
        modulesMasques: [],
      }}
      session={null}
      horloge={horloge}
      langue="fr"
    />,
  );
  return { routeur, client };
}
