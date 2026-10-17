import {
  ErreurHttp,
  creerClientMock,
  horlogeGelee,
  patron,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { horlogeFigee } from "@/coquille/horloge";
import { modules } from "./client-modules";

/** Outils des tests de l'écran Modules (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

/** PIN que le mock refuse (il accepte tout autre PIN à 6 chiffres). */
export const PIN_VALIDE = "483920";
export const PIN_REFUSE = modules.PIN_REFUSE_PAR_LE_MOCK;

export type Panne = "vide" | "erreur" | "changement";

function remplacer(
  operations: readonly ImplementationMock[],
  cible: unknown,
  repondre: () => unknown,
): ImplementationMock[] {
  return operations.map((implementation) =>
    implementation.operation === cible
      ? ({ operation: implementation.operation, repondre } as ImplementationMock)
      : implementation,
  );
}

function panneHttp(): never {
  throw new ErreurHttp(500, "Panne simulée", "PANNE");
}

/**
 * Source du scénario « Modules » des fixtures, composée comme le fera le composeur central : le mock des modules
 * AVANT celui du patron (le client retient la première implémentation d'une opération). Avec au besoin une panne.
 */
export function sourceModules(panne?: Panne, ecritures?: unknown[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const operations = [...modules.installerMockModules().operations, ...scenario.operations].map(
        (implementation) =>
          ecritures && implementation.operation === (patron.OP_CHANGER_MODULE as unknown)
            ? ({
                operation: implementation.operation,
                repondre: (params: unknown, ctx: unknown) => {
                  ecritures.push(params);
                  return (implementation.repondre as (p: unknown, c: unknown) => unknown)(
                    params,
                    ctx,
                  );
                },
              } as ImplementationMock)
            : implementation,
      );
      const pannes: Record<Panne, ImplementationMock[]> = {
        vide: remplacer(operations, patron.OP_MODULES, () => ({
          modules: [],
          actifs: 0,
          total: 0,
        })),
        erreur: remplacer(operations, patron.OP_MODULES, panneHttp),
        changement: remplacer(operations, patron.OP_CHANGER_MODULE, panneHttp),
      };
      return { ...scenario, operations: panne ? pannes[panne] : operations };
    },
  };
}

export interface OptionsRenduModules {
  panne?: Panne;
  /** Reçoit les corps des commandes `patron.modules.changer` envoyées. */
  ecritures?: unknown[];
  /** Latence simulée du mock (0 par défaut). */
  latenceMs?: number;
  url?: string;
}

/** Monte l'application complète sur /reglages/modules, avec le mock du scénario « Modules ». */
export function rendreModules(options: OptionsRenduModules = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { panne, ecritures, latenceMs = 0, url = "/reglages/modules" } = options;
  const client = creerClientMock({
    source: sourceModules(panne, ecritures),
    scenario: "Modules",
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
      parametres={{
        demo: true,
        conception: false,
        horloge: null,
        scenario: null,
        modulesMasques: [],
      }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
