import {
  ErreurHttp,
  agence,
  creerClientMock,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { sourceScenariosFixtures } from "@/api/source-scenarios";

/** Outils des tests de l'écran Depot (pas un test : le nom ne suit pas `*.test.tsx`). */

type DonneesDepot = Parameters<ReturnType<typeof agence.useAccepterDepotColis>["mutate"]>[0];

export interface EnregistreurDepot {
  /** Les données de chaque événement « colis déposé » reçu par le mock. */
  depots: DonneesDepot[];
  /** Les documents que l'écran a demandé d'imprimer (journal de l'agence). */
  impressions: unknown[];
  client: ClientMock;
}

/**
 * Client mock du scénario « Depot » des fixtures, qui note les écritures reçues et peut faire échouer la lecture
 * du colis (`panne: "erreur"`) ou son enregistrement (`panne: "depot"`).
 */
export function clientDepot(panne?: "erreur" | "depot"): EnregistreurDepot {
  const enregistreur: EnregistreurDepot = {
    depots: [],
    impressions: [],
    client: undefined as unknown as ClientMock,
  };
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const operations = scenario.operations.map((implementation): ImplementationMock => {
        const nomOperation = implementation.operation.nom;
        const repondre = implementation.repondre as (p: unknown, c: unknown) => unknown;
        if (nomOperation === agence.OP_COLIS_DEPOT.nom && panne === "erreur") {
          return {
            operation: implementation.operation,
            repondre: () => {
              throw new ErreurHttp(500, "Panne simulée", "PANNE");
            },
          } as ImplementationMock;
        }
        if (nomOperation === agence.ECRITURES.colisDepose.operation.nom) {
          return {
            operation: implementation.operation,
            repondre: (params: { donnees: DonneesDepot }, contexte: unknown) => {
              if (panne === "depot") throw new ErreurHttp(500, "Panne simulée", "PANNE");
              enregistreur.depots.push(params.donnees);
              return repondre(params, contexte);
            },
          } as ImplementationMock;
        }
        if (nomOperation === agence.ECRITURES.impressionDemandee.operation.nom) {
          return {
            operation: implementation.operation,
            repondre: (params: { donnees: unknown }, contexte: unknown) => {
              enregistreur.impressions.push(params.donnees);
              return repondre(params, contexte);
            },
          } as ImplementationMock;
        }
        return implementation;
      });
      return { ...scenario, operations };
    },
  };
  enregistreur.client = creerClientMock({ source, scenario: "Depot", latenceMs: 0 });
  return enregistreur;
}
