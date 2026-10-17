import {
  creerClientMock,
  implementer,
  simulerFlux,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran Main (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type Operations = Scenario["operations"];

export const DEPART_BETA = ecrans.Main.entites.departs![0]!;
export const DEPART_ALPHA = ecrans.Main.entites.departs![1]!;
export const DEPART_OMEGA = ecrans.Main.entites.departs![2]!;
export const COLIS_MAMAN = ecrans.Main.donnees.notificationColis._colisId;

/** Client mock sans latence, branché sur les scénarios des planches (ceux du banc de fidélité). */
export function clientMain(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "Main", latenceMs: 0 });
}

/** Source dont le scénario est modifié par `modifier` (remplacer, ajouter ou retirer des opérations et des flux). */
export function sourceModifiee(
  modifier: (scenario: Scenario) => Scenario,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
}

/** Remplace la réponse de la recherche de départs ; `repondre` reçoit les paramètres et la réponse du scénario. */
export function avecRecherche(
  repondre: (
    reponse: c.ResultatRechercheDeparts,
    params: c.RechercheDeparts,
  ) => c.ResultatRechercheDeparts | Promise<c.ResultatRechercheDeparts>,
): SourceScenarios {
  return sourceModifiee((scenario) => {
    const origine = scenario.operations.find(
      (o) => o.operation.nom === voyageur.OP_RECHERCHER_DEPARTS.nom,
    )!;
    const operations: Operations = [
      implementer(voyageur.OP_RECHERCHER_DEPARTS, async (params, ctx) =>
        repondre(
          (await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as c.ResultatRechercheDeparts,
          params,
        ),
      ),
      ...scenario.operations,
    ];
    return { ...scenario, operations };
  });
}

/**
 * Source qui ajoute au scénario un canal temps réel de plan de sièges contrôlé par le test : `emettre` envoie un
 * message à toutes les lignes abonnées. Le plan initial de chaque départ compte `libres` places libres sur 30.
 */
export function avecPlansEnDirect(libresParDepart: Readonly<Record<string, number>>): {
  source: SourceScenarios;
  emettre: (message: c.MessagePlanSieges) => void;
  abonnes: () => string[];
} {
  const ecouteurs = new Map<string, (message: c.MessagePlanSieges) => void>();
  const planDe = (departId: string): c.PlanSiegesVue => {
    const libres = libresParDepart[departId] ?? 0;
    return {
      departId,
      capacite: 30,
      sieges: Array.from({ length: 30 }, (_, i) => ({
        numero: i + 1,
        etat: i < libres ? ("libre" as const) : ("pris" as const),
      })),
      libres,
      versionPlan: 1,
    };
  };
  const source = sourceModifiee((scenario) => ({
    ...scenario,
    // Le plan renvoyé est celui du départ demandé (le mock des autres planches renvoie toujours celui de SiegePay).
    operations: [
      implementer(voyageur.OP_PLAN_SIEGES, (p) => planDe(p.departId)),
      ...scenario.operations,
    ],
    flux: [
      simulerFlux(voyageur.CANAL_PLAN_SIEGES, (p, ctx) => {
        ecouteurs.set(p.departId, (message) => ctx.emettre(message));
        return () => {
          ecouteurs.delete(p.departId);
        };
      }),
      ...(scenario.flux ?? []),
    ],
  }));
  return {
    source,
    emettre: (message) => {
      const departId = message.type === "plan" ? message.plan.departId : message.departId;
      ecouteurs.get(departId)?.(message);
    },
    abonnes: () => [...ecouteurs.keys()],
  };
}

/** Enregistre les paramètres de chaque recherche de départs reçue par le mock. */
export function espionnerRecherches(base: SourceScenarios = sourceScenariosFixtures()): {
  source: SourceScenarios;
  recherches: c.RechercheDeparts[];
} {
  const recherches: c.RechercheDeparts[] = [];
  const source = sourceModifiee((scenario) => {
    const origine = scenario.operations.find(
      (o) => o.operation.nom === voyageur.OP_RECHERCHER_DEPARTS.nom,
    )!;
    return {
      ...scenario,
      operations: [
        implementer(voyageur.OP_RECHERCHER_DEPARTS, async (params, ctx) => {
          recherches.push(params);
          return (await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as c.ResultatRechercheDeparts;
        }),
        ...scenario.operations,
      ],
    };
  }, base);
  return { source, recherches };
}

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur l'accueil. */
export function rendreAppMain(
  options: { url?: string; client?: ClientApi; masques?: string[] } = {},
): { routeur: DataRouter } {
  return rendreApp({
    url: options.url ?? "/voyager",
    clientApi: options.client ?? clientMain(),
    scenario: "Main",
    ...(options.masques ? { masques: options.masques } : {}),
  });
}
