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

/** Outils des tests de l'écran USSD (pas un test : le nom ne suit pas `*.test.tsx`). */

type Operations = Scenario["operations"];

/** Source dont le scénario « USSD » est modifié par `modifier` (les opérations ajoutées passent devant). */
export function sourceModifiee(modifier: (operations: Operations) => Operations): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: modifier(scenario.operations) };
    },
  };
}

/** Source dont l'aperçu « sans internet » est celui que renvoie `repondre` (qui reçoit le numéro de l'appel). */
export function avecApercu(repondre: (appel: number) => c.ApercuSansInternet): {
  source: SourceScenarios;
  appels: () => number;
} {
  let appels = 0;
  const source = sourceModifiee((operations) => [
    implementer(voyageur.OP_SANS_INTERNET, () => {
      appels += 1;
      return repondre(appels);
    }),
    ...operations,
  ]);
  return { source, appels: () => appels };
}

export function clientUssd(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "USSD", latenceMs: 0 });
}

/** L'aperçu du scénario de démonstration, tel que le mock le sert (pour en modifier un champ). */
export async function apercuDeLaPlanche(): Promise<c.ApercuSansInternet> {
  const client = clientUssd();
  return client.executer(voyageur.OP_SANS_INTERNET, undefined);
}

/** Monte l'application complète (coquille, layout voyageur) sur /sans-internet. */
export function rendreUssd(
  options: { client?: ClientApi; langue?: "fr" | "en" | "pcm"; conception?: boolean } = {},
): { routeur: DataRouter } {
  return rendreApp({
    url: "/sans-internet",
    clientApi: options.client ?? clientUssd(),
    scenario: "USSD",
    ...(options.langue ? { langue: options.langue } : {}),
    ...(options.conception ? { conception: true } : {}),
  });
}
