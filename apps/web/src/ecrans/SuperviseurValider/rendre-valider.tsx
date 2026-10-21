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

/** Outils des tests de l'écran SuperviseurValider (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
export const SESSION_DEMO = "session-k-dla-270105-2-1";

export type Decision = "valider" | "refuser";

/** Un événement tel que le serveur le reçoit. */
export interface EvenementRecu {
  type: string;
  donnees: {
    sessionId: string;
    ecart?: number;
    commentaire?: string | null;
    motif?: string | null;
    validePar: { superviseurId: string; methode: string; signature: string };
  };
}

export interface OptionsRenduValider {
  /** Réponse du serveur à la n-ième décision (1, 2…) : une erreur la refuse, `undefined` l'accepte. */
  reponseDecision?: (numero: number, decision: Decision) => Error | undefined;
  /** Panne de la lecture de la clôture. */
  lecture?: "erreur";
  latenceMs?: number;
  conception?: boolean;
  url?: string;
}

export const refusPin = () => new ErreurHttp(403, "PIN incorrect", "PIN_INCORRECT");
export const panne = () => new ErreurHttp(500, "Panne simulée", "PANNE");

/** Source du scénario « SuperviseurValider » ; garde les décisions reçues et peut les refuser. */
function source(options: OptionsRenduValider, recus: EvenementRecu[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  const ecritures = agence.ECRITURES;
  const decisions = new Map<unknown, Decision>([
    [ecritures.caisseValidee.operation, "valider"],
    [ecritures.caisseRefusee.operation, "refuser"],
  ]);
  let numero = 0;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation): ImplementationMock => {
          const decision = decisions.get(implementation.operation);
          if (decision) {
            return {
              operation: implementation.operation,
              repondre: (evenement, ctx) => {
                recus.push(evenement as unknown as EvenementRecu);
                numero += 1;
                const erreur = options.reponseDecision?.(numero, decision);
                if (erreur) throw erreur;
                return implementation.repondre(evenement, ctx);
              },
            };
          }
          if (options.lecture && implementation.operation === agence.OP_SUPERVISEUR_CLOTURE) {
            return {
              operation: implementation.operation,
              repondre: () => {
                throw panne();
              },
            };
          }
          return implementation;
        }),
      };
    },
  };
}

/** Monte l'application complète sur /cloture/<session>, avec le mock du scénario « SuperviseurValider ». */
export function rendreValider(options: OptionsRenduValider = {}): {
  routeur: DataRouter;
  client: ClientMock;
  recus: EvenementRecu[];
} {
  const { latenceMs = 0, conception = false, url = `/cloture/${SESSION_DEMO}` } = options;
  const recus: EvenementRecu[] = [];
  const client = creerClientMock({
    source: source(options, recus),
    scenario: "SuperviseurValider",
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
      parametres={{ demo: true, conception, horloge: null, scenario: null, modulesMasques: [] }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client, recus };
}
