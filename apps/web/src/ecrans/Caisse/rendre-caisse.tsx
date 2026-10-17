import {
  ErreurHttp,
  agence,
  creerClientMock,
  horlogeGelee,
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

/** Outils des tests de l'écran Caisse (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

export type Panne = "cloture" | "comptage" | "vide" | "erreur";

/** Source du scénario « Caisse » des fixtures, avec au besoin une panne injectée dans une opération. */
export function sourceAvecPanne(panne?: Panne): SourceScenarios {
  const base = sourceScenariosFixtures();
  if (!panne) return base;
  const ecritures = agence.ECRITURES;
  const cible = {
    cloture: ecritures.caisseCloturee.operation,
    comptage: ecritures.caisseComptee.operation,
    vide: agence.OP_CAISSE_SESSION,
    erreur: agence.OP_CAISSE_SESSION,
  }[panne];
  const erreur =
    panne === "vide"
      ? new ErreurHttp(404, "Aucune session de caisse", "INTROUVABLE")
      : new ErreurHttp(500, "Panne simulée", "PANNE");
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation) =>
          implementation.operation === (cible as unknown)
            ? ({
                operation: implementation.operation,
                repondre: () => {
                  throw erreur;
                },
              } as ImplementationMock)
            : implementation,
        ),
      };
    },
  };
}

export interface OptionsRenduCaisse {
  panne?: Panne;
  /** Instant de l'horloge de l'application (par défaut : celui du banc de fidélité). */
  horloge?: string;
  conception?: boolean;
  /** Latence simulée du mock (0 par défaut). */
  latenceMs?: number;
  url?: string;
}

/** Monte l'application complète sur /guichet/caisse, avec le mock du scénario « Caisse ». */
export function rendreCaisse(options: OptionsRenduCaisse = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const {
    panne,
    horloge = HORLOGE_PLANCHE,
    conception = false,
    latenceMs = 0,
    url = "/guichet/caisse",
  } = options;
  const client = creerClientMock({
    source: sourceAvecPanne(panne),
    scenario: "Caisse",
    latenceMs,
    horloge: horlogeGelee(horloge),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [url],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{ demo: true, conception, horloge: null, scenario: null, modulesMasques: [] }}
      session={null}
      horloge={horlogeFigee(horloge)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
