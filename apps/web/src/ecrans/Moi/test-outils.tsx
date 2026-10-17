import {
  creerClientMock,
  implementer,
  voyageur,
  type ClientApi,
  type Operation,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran Moi (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type Operations = Scenario["operations"];
type Repondre = (params: unknown, ctx: unknown) => unknown;

/** Identifiant du billet du scénario de la planche (le voyage « à venir »). */
export const BILLET_DEMO = ecrans.Moi.donnees.historique.elements[0]!._billetId;

/** Client mock sans latence, branché sur les scénarios des planches (ceux du banc de fidélité). */
export function clientMoi(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "Moi", latenceMs: 0 });
}

/** Source dont le scénario « Moi » est modifié par `modifier`. */
export function sourceModifiee(modifier: (scenario: Scenario) => Scenario): SourceScenarios {
  const base = sourceScenariosFixtures();
  return { ...base, charger: async (nom) => modifier(await base.charger(nom)) };
}

/** Source dont les opérations données répondent à la place de celles du scénario de la planche. */
export function avecOperations(...remplacements: Operations): SourceScenarios {
  return sourceModifiee((scenario) => ({
    ...scenario,
    operations: [...remplacements, ...scenario.operations],
  }));
}

/** Source dont l'opération répond `reponse`. */
export function avecReponse<P, R>(
  operation: Operation<P, R>,
  reponse: (params: P) => R | Promise<R>,
): SourceScenarios {
  return avecOperations(implementer(operation, reponse));
}

/** Source dont l'opération `nom` lève `erreur(appel)` (et répond normalement si elle renvoie `undefined`). */
export function avecPanne(
  nom: string,
  erreur: (appel: number) => Error | undefined,
): { source: SourceScenarios; appels: () => number } {
  let appels = 0;
  const source = sourceModifiee((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) => {
              appels += 1;
              const panne = erreur(appels);
              if (panne) throw panne;
              return (impl.repondre as Repondre)(params, ctx);
            },
          } as Operations[number])
        : impl,
    ),
  }));
  return { source, appels: () => appels };
}

/** Source dont l'opération `nom` ne répond jamais (état de chargement). */
export function sansReponse(nom: string): SourceScenarios {
  return sourceModifiee((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? ({
            operation: impl.operation,
            repondre: () => new Promise(() => {}),
          } as Operations[number])
        : impl,
    ),
  }));
}

/** Source qui note les appels de `nom` et leurs paramètres. */
export function espionner(nom: string): { source: SourceScenarios; appels: unknown[] } {
  const appels: unknown[] = [];
  const source = sourceModifiee((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) => {
              appels.push(params);
              return (impl.repondre as Repondre)(params, ctx);
            },
          } as Operations[number])
        : impl,
    ),
  }));
  return { source, appels };
}

/** Un proche du contrat, avec les valeurs données par-dessus celles d'un proche ordinaire. */
export function proche(surcharge: Partial<c.Proche> = {}): c.Proche {
  return {
    id: "p-1",
    nom: "Paul",
    initiales: "PA",
    prevenuALArrivee: false,
    payeMesVoyages: false,
    ...surcharge,
  };
}

/** Une ligne d'historique du contrat. */
export function element(surcharge: Partial<c.ElementHistorique> = {}): c.ElementHistorique {
  return {
    type: "voyage",
    id: "billet-x",
    titre: "Douala → Bafoussam",
    detail: "Alpha · siège 3 · 5 000 F",
    montant: 5000,
    statut: "a_venir",
    recuDisponible: false,
    ...surcharge,
  };
}

export const PROCHES = voyageur.OP_PROCHES;
export const HISTORIQUE = voyageur.OP_HISTORIQUE;
export const FIDELITE = voyageur.OP_FIDELITE;
export const PARRAINAGE = voyageur.OP_PARRAINAGE;
export const PROFIL = voyageur.OP_PROFIL;

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur Moi. */
export function rendreAppMoi(
  options: { client?: ClientApi; masques?: string[]; langue?: "fr" | "en" | "pcm" } = {},
): { routeur: DataRouter } {
  return rendreApp({
    url: "/moi",
    clientApi: options.client ?? clientMoi(),
    scenario: "Moi",
    ...(options.masques ? { masques: options.masques } : {}),
    ...(options.langue ? { langue: options.langue } : {}),
  });
}
