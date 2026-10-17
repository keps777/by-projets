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

/** Outils des tests de l'écran Reseau (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type Operations = Scenario["operations"];

/** Client mock sans latence, branché sur le scénario de la planche Reseau (celui du banc de fidélité). */
export function clientReseau(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "Reseau", latenceMs: 0 });
}

/** Source dont le scénario Reseau est modifié par `modifier` (les opérations ajoutées passent devant). */
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

type Repondre = (params: unknown, ctx: unknown) => unknown;

/** Remplace la réponse de l'aperçu du réseau ; `repondre` reçoit les paramètres et la réponse du scénario. */
export function avecApercu(
  repondre: (
    reponse: c.ApercuReseau,
    params: c.DemandeReseau,
  ) => c.ApercuReseau | Promise<c.ApercuReseau>,
  base?: SourceScenarios,
): SourceScenarios {
  return sourceModifiee((operations) => {
    const origine = operations.find((o) => o.operation.nom === voyageur.OP_RESEAU.nom)!;
    return [
      implementer(voyageur.OP_RESEAU, async (params, ctx) =>
        repondre((await (origine.repondre as Repondre)(params, ctx)) as c.ApercuReseau, params),
      ),
      ...operations,
    ];
  }, base);
}

/** Ajoute au scénario la recherche de départs (absente de la planche Reseau) : `departs` dépend du trajet. */
export function avecRecherche(
  departs: (params: c.RechercheDeparts) => c.DepartVoyageur[],
  base?: SourceScenarios,
): { source: SourceScenarios; recherches: c.RechercheDeparts[] } {
  const recherches: c.RechercheDeparts[] = [];
  const source = sourceModifiee(
    (operations) => [
      implementer(voyageur.OP_RECHERCHER_DEPARTS, (params): c.ResultatRechercheDeparts => {
        recherches.push(params);
        const liste = departs(params);
        return {
          maintenant: "2027-01-05T07:40:00.000+01:00",
          depart: { code: params.depart, nom: params.depart },
          arrivee: { code: params.arrivee, nom: params.arrivee },
          jour: "2027-01-05",
          filtres: { classe: "toutes", compagnies: 0, preferees: 0 },
          departs: liste,
          covoits: [],
          totaux: { bus: liste.length, covoiturages: 0 },
        };
      }),
      ...operations,
    ],
    base,
  );
  return { source, recherches };
}

/** Un départ de bus de la recherche, à l'heure du jour de la planche (5 janvier 2027). */
export function departBus(
  id: string,
  heure: string,
  compagnie = "Alpha Voyages",
): c.DepartVoyageur {
  return {
    id,
    numero: id.toUpperCase(),
    compagnie: { id: `cie-${compagnie.toLowerCase().replace(/\W+/g, "-")}`, nom: compagnie },
    classe: "classique",
    heureDepart: `2027-01-05T${heure}:00.000+01:00`,
    prix: 3800,
    placesLibres: 12,
    presqueComplet: false,
  };
}

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur le réseau en direct. */
export function rendreAppReseau(
  options: { url?: string; client?: ClientApi; masques?: string[] } = {},
): { routeur: DataRouter } {
  return rendreApp({
    url: options.url ?? "/reseau",
    clientApi: options.client ?? clientReseau(),
    scenario: "Reseau",
    ...(options.masques ? { masques: options.masques } : {}),
  });
}
