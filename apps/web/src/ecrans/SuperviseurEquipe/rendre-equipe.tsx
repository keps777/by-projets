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

/** Outils des tests de l'écran SuperviseurEquipe (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

export type NomEcriture = "pin" | "affectation" | "desactivation" | "deblocage";

/** Un événement tel que le serveur le reçoit. */
export interface EvenementRecu {
  type: string;
  donnees: {
    personneId: string;
    guichetId?: string | null;
    role?: string | null;
    validePar: { superviseurId: string; methode: string; signature: string };
  };
}

export interface OptionsRenduEquipe {
  /** Réponse du serveur à la n-ième écriture (1, 2…) : une erreur la refuse, `undefined` l'accepte. */
  reponseEcriture?: (numero: number, ecriture: NomEcriture) => Error | undefined;
  /** Panne de la lecture de l'équipe, ou équipe vide. */
  lecture?: "erreur" | "vide";
  /** Nombre de lectures en panne avant que le serveur ne réponde (avec `lecture: "erreur"`). */
  echecsLecture?: number;
  latenceMs?: number;
  url?: string;
}

export const refusPin = () => new ErreurHttp(403, "PIN incorrect", "PIN_INCORRECT");
export const compteBloque = () => new ErreurHttp(423, "Compte bloqué", "PIN_BLOQUE");
export const inconnue = () => new ErreurHttp(404, "Personne inconnue", "PERSONNE_INCONNUE");
export const dejaFait = () => new ErreurHttp(409, "Compte non bloqué", "COMPTE_NON_BLOQUE");
export const panne = () => new ErreurHttp(500, "Panne simulée", "PANNE");

/** Source du scénario « SuperviseurEquipe » ; garde les écritures reçues et peut les refuser. */
function source(options: OptionsRenduEquipe, recus: EvenementRecu[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  const ecritures = agence.ECRITURES;
  const noms = new Map<unknown, NomEcriture>([
    [ecritures.equipePinRenouvele.operation, "pin"],
    [ecritures.equipeAffectationChangee.operation, "affectation"],
    [ecritures.equipeCompteDesactive.operation, "desactivation"],
    [ecritures.equipePersonneDebloquee.operation, "deblocage"],
  ]);
  let numero = 0;
  let lectures = 0;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation): ImplementationMock => {
          const ecriture = noms.get(implementation.operation);
          if (ecriture) {
            return {
              operation: implementation.operation,
              repondre: (evenement, ctx) => {
                recus.push(evenement as unknown as EvenementRecu);
                numero += 1;
                const erreur = options.reponseEcriture?.(numero, ecriture);
                if (erreur) throw erreur;
                return implementation.repondre(evenement, ctx);
              },
            };
          }
          if (options.lecture && implementation.operation === agence.OP_SUPERVISEUR_EQUIPE) {
            return {
              operation: implementation.operation,
              repondre: (evenement, ctx) => {
                lectures += 1;
                if (options.lecture === "erreur") {
                  if (options.echecsLecture === undefined || lectures <= options.echecsLecture) {
                    throw panne();
                  }
                  return implementation.repondre(evenement, ctx);
                }
                const equipe = implementation.repondre(evenement, ctx) as { enService: unknown[] };
                return { ...equipe, enService: [] };
              },
            };
          }
          return implementation;
        }),
      };
    },
  };
}

/** Monte l'application complète sur /equipe, avec le mock du scénario « SuperviseurEquipe ». */
export function rendreEquipe(options: OptionsRenduEquipe = {}): {
  routeur: DataRouter;
  client: ClientMock;
  recus: EvenementRecu[];
} {
  const { latenceMs = 0, url = "/equipe" } = options;
  const recus: EvenementRecu[] = [];
  const client = creerClientMock({
    source: source(options, recus),
    scenario: "SuperviseurEquipe",
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
  return { routeur, client, recus };
}
