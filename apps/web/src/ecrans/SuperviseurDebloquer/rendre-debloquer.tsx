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
import type { Appareil } from "./FeuillePin";

/** Outils des tests de l'écran SuperviseurDebloquer (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
export const APPAREIL_DEMO = "appareil-gu3-dla";

/** Un événement `appareil.debloque` tel que le serveur le reçoit. */
export interface EvenementRecu {
  type: string;
  donnees: {
    appareilId: string;
    option: string;
    validePar: { superviseurId: string; methode: string; signature: string };
  };
}

export interface OptionsRenduDebloquer {
  /** Réponse du serveur au n-ième déblocage (1, 2…) : une erreur le refuse, `undefined` l'accepte. */
  reponseDeblocage?: (numero: number, option: string) => Error | undefined;
  /** Panne de la lecture de l'appareil. */
  lecture?: "erreur";
  /** Change la lecture de l'appareil (autre état, plage avec trou, aucune option…). */
  modifierVue?: (vue: Appareil) => Appareil;
  /** Met en panne la lecture de l'accueil du superviseur : l'écran ne sait alors pas qui est connecté. */
  sansSuperviseur?: boolean;
  latenceMs?: number;
  conception?: boolean;
  url?: string;
}

export const refusPin = () => new ErreurHttp(403, "PIN incorrect", "PIN_INCORRECT");
export const panne = () => new ErreurHttp(500, "Panne simulée", "PANNE");

/**
 * Source du scénario « SuperviseurDebloquer » : garde les déblocages reçus et peut les refuser. Le composeur de
 * l'application ajoute les réponses des autres planches : l'accueil du superviseur (`OP_SUPERVISEUR_GARE`) dit qui
 * saisit le PIN ; `sansSuperviseur` le fait tomber en panne.
 */
function source(options: OptionsRenduDebloquer, recus: EvenementRecu[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  let numero = 0;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const operations = scenario.operations.map((implementation): ImplementationMock => {
        if (implementation.operation === agence.ECRITURES.appareilDebloque.operation) {
          return {
            operation: implementation.operation,
            repondre: (evenement, ctx) => {
              const recu = evenement as unknown as EvenementRecu;
              recus.push(recu);
              numero += 1;
              const erreur = options.reponseDeblocage?.(numero, recu.donnees.option);
              if (erreur) throw erreur;
              return implementation.repondre(evenement, ctx);
            },
          };
        }
        if (implementation.operation === agence.OP_SUPERVISEUR_APPAREIL) {
          return {
            operation: implementation.operation,
            repondre: (params, ctx) => {
              if (options.lecture) throw panne();
              const vue = implementation.repondre(params, ctx) as Appareil;
              return options.modifierVue ? options.modifierVue(structuredClone(vue)) : vue;
            },
          };
        }
        if (options.sansSuperviseur && implementation.operation === agence.OP_SUPERVISEUR_GARE) {
          return {
            operation: implementation.operation,
            repondre: () => {
              throw panne();
            },
          };
        }
        return implementation;
      });
      return { ...scenario, operations };
    },
  };
}

/** Monte l'application complète sur /debloquer/<appareil>, avec le mock du scénario « SuperviseurDebloquer ». */
export function rendreDebloquer(options: OptionsRenduDebloquer = {}): {
  routeur: DataRouter;
  client: ClientMock;
  recus: EvenementRecu[];
} {
  const { latenceMs = 0, conception = false, url = `/debloquer/${APPAREIL_DEMO}` } = options;
  const recus: EvenementRecu[] = [];
  const client = creerClientMock({
    source: source(options, recus),
    scenario: "SuperviseurDebloquer",
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
