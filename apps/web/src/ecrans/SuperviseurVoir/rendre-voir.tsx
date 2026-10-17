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
import type { Demande } from "./VoirAnnulation";

/** Outils des tests de l'écran SuperviseurVoir (pas un test : le nom ne suit pas `*.test.tsx`). */

/** 14:02, l'heure de la planche : la demande de 13:51 date de 11 minutes. */
export const HORLOGE_PLANCHE = "2027-01-05T14:02:00+01:00";
export const DEMANDE_DEMO = "dem-annulation-billet-alp-dla-270105-0171";
export const BILLET_DEMO = "billet-alp-dla-270105-0171";

/** Un événement tel que le serveur le reçoit. */
export interface EvenementRecu {
  type: string;
  donnees: {
    demandeId: string;
    billetId: string;
    decision: "rembourser" | "reporter" | "avoir" | "refuser";
    montant: number;
    validePar: { superviseurId: string; methode: string; signature: string };
  };
}

export interface OptionsRenduVoir {
  /** Réponse du serveur à la n-ième décision (1, 2…) : une erreur la refuse, `undefined` l'accepte. */
  reponseDecision?: (numero: number) => Error | undefined;
  /** Panne de la lecture de la demande. */
  lecture?: "erreur";
  /** Modifie la demande que le serveur renvoie (autres cas que la planche). */
  demande?: (demande: Demande) => Demande;
  latenceMs?: number;
  conception?: boolean;
  url?: string;
  /** Instant de l'horloge de l'application (par défaut 14:02, l'heure de la planche). */
  horloge?: string;
}

export const refusPin = () => new ErreurHttp(403, "PIN incorrect", "PIN_INCORRECT");
export const panne = () => new ErreurHttp(500, "Panne simulée", "PANNE");

/** Source du scénario « SuperviseurVoir » ; garde les décisions reçues et peut les refuser. */
function source(options: OptionsRenduVoir, recus: EvenementRecu[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  let numero = 0;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation): ImplementationMock => {
          if (implementation.operation === agence.ECRITURES.annulationDecidee.operation) {
            return {
              operation: implementation.operation,
              repondre: (evenement, ctx) => {
                recus.push(evenement as unknown as EvenementRecu);
                numero += 1;
                const erreur = options.reponseDecision?.(numero);
                if (erreur) throw erreur;
                return implementation.repondre(evenement, ctx);
              },
            };
          }
          if (implementation.operation === agence.OP_SUPERVISEUR_ANNULATION) {
            if (options.lecture) {
              return {
                operation: implementation.operation,
                repondre: () => {
                  throw panne();
                },
              };
            }
            const modifier = options.demande;
            if (modifier) {
              return {
                operation: implementation.operation,
                repondre: (params, ctx) =>
                  modifier(structuredClone(implementation.repondre(params, ctx) as Demande)),
              };
            }
          }
          return implementation;
        }),
      };
    },
  };
}

/** Monte l'application complète sur /annulation/<demande>, avec le mock du scénario « SuperviseurVoir ». */
export function rendreVoir(options: OptionsRenduVoir = {}): {
  routeur: DataRouter;
  client: ClientMock;
  recus: EvenementRecu[];
} {
  const {
    latenceMs = 0,
    conception = false,
    url = `/annulation/${DEMANDE_DEMO}`,
    horloge = HORLOGE_PLANCHE,
  } = options;
  const recus: EvenementRecu[] = [];
  const client = creerClientMock({
    source: source(options, recus),
    scenario: "SuperviseurVoir",
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
  return { routeur, client, recus };
}
