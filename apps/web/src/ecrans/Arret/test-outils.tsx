import {
  creerClientMock,
  implementer,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran Arret (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type Operations = Scenario["operations"];
type Repondre = (params: unknown, ctx: unknown) => unknown;

/** Client mock sans latence, branché sur le scénario de la planche Arret (celui du banc de fidélité). */
export function clientArret(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "Arret", latenceMs: 0 });
}

/** Source dont le scénario Arret est modifié par `modifier` (les opérations ajoutées passent devant). */
export function sourceModifiee(
  modifier: (operations: Operations) => Operations,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: modifier(scenario.operations) };
    },
  };
}

/**
 * Remplace la réponse des offres de montée ; `repondre` reçoit la réponse du scénario, les paramètres de la demande
 * et le numéro de l'appel (de 1 à n). Les paramètres de chaque appel sont notés dans `appels`.
 */
export function avecOffres(
  repondre: (
    reponse: c.OffresMonteeEnRoute,
    params: c.DemandeMonteeEnRoute,
    appel: number,
  ) => c.OffresMonteeEnRoute | Promise<c.OffresMonteeEnRoute> = (reponse) => reponse,
): { source: SourceScenarios; appels: c.DemandeMonteeEnRoute[] } {
  const appels: c.DemandeMonteeEnRoute[] = [];
  const source = sourceModifiee((operations) => {
    const origine = operations.find((o) => o.operation.nom === voyageur.OP_OFFRES_MONTEE.nom)!;
    return [
      implementer(voyageur.OP_OFFRES_MONTEE, async (params, ctx) => {
        appels.push(params);
        return repondre(
          (await (origine.repondre as Repondre)(params, ctx)) as c.OffresMonteeEnRoute,
          params,
          appels.length,
        );
      }),
      ...operations,
    ];
  });
  return { source, appels };
}

/** Un bus qui passe, aux valeurs du premier bus de la planche sauf celles données. */
export function busQuiPasse(surcharge: Partial<c.BusQuiPasse> = {}): c.BusQuiPasse {
  return {
    departId: "dep-route-test-1005",
    compagnie: { id: "cie-test", nom: "Bêta Express" },
    classe: "vip",
    passeA: "2027-01-05T10:05:00.000+01:00",
    passeDansMinutes: 14,
    placesLibres: 3,
    partiA: "2027-01-05T08:04:00.000+01:00",
    arriveeDestination: "2027-01-05T11:35:00.000+01:00",
    prix: 4500,
    prorata: true,
    ...surcharge,
  };
}

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur « Monter en route ». */
export function rendreAppArret(
  options: {
    url?: string;
    client?: ClientApi;
    /** Scénario de démonstration de l'adresse ; `null` : aucun (la position du téléphone est alors demandée). */
    scenario?: string | null;
  } = {},
): { routeur: DataRouter } {
  const scenario = options.scenario === undefined ? "Arret" : options.scenario;
  return rendreApp({
    url: options.url ?? "/monter-en-route",
    clientApi: options.client ?? clientArret(),
    ...(scenario !== null ? { scenario } : {}),
  });
}
