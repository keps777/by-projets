import {
  creerClientMock,
  implementer,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { horlogeFigee } from "@/coquille/horloge";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran MainFiltres (dans le dossier de l'écran : `src/test/` n'est pas dans le périmètre du ticket). */

type Operations = Scenario["operations"];

/** Identifiants des compagnies du scénario de la planche. */
export const COMPAGNIE = {
  beta: "cie-bex",
  alpha: "cie-alp",
  omega: "cie-ome",
  general: "cie-gex",
  touristique: "cie-tex",
} as const;

/** Client mock sans latence, branché sur les scénarios des planches (ceux du banc de fidélité). */
export function clientFiltres(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({ source, scenario: "MainFiltres", latenceMs: 0 });
}

/** Source dont le scénario est modifié par `modifier` (remplacer, ajouter ou retirer des opérations). */
export function sourceModifiee(
  modifier: (scenario: Scenario) => Scenario,
  base: SourceScenarios = sourceScenariosFixtures(),
): SourceScenarios {
  return {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
}

/** Ajoute des implémentations devant celles du scénario : le client prend la première. */
export function avecOperations(...operations: Operations[number][]): SourceScenarios {
  return sourceModifiee((scenario) => ({
    ...scenario,
    operations: [...operations, ...scenario.operations],
  }));
}

/** Ce que le mock a reçu : les filtres enregistrés, les étoiles changées et les recherches de départs. */
export interface Appels {
  enregistrements: c.EnregistrerFiltres[];
  preferees: c.DefinirPreferee[];
  recherches: c.RechercheDeparts[];
}

type Repondre<P, R> = (params: P) => R | Promise<R>;

interface Reponses {
  /** Réponse de la recherche de départs ; reçoit celle du scénario. Par défaut, celle du scénario. */
  recherche?: (
    params: c.RechercheDeparts,
    base: c.ResultatRechercheDeparts,
  ) => c.ResultatRechercheDeparts | Promise<c.ResultatRechercheDeparts>;
  options?: Repondre<{ depart: string; arrivee: string }, c.OptionsFiltres>;
  /** Une réponse `undefined` laisse la main au scénario. */
  definirPreferee?: Repondre<c.DefinirPreferee, c.DefinirPreferee | undefined>;
}

/**
 * Source qui note chaque appel d'écriture et de recherche. `reponses` remplace la réponse d'une opération
 * (par exemple pour la faire échouer ou lui donner un nombre de départs).
 */
export function espionner(reponses: Reponses = {}): { source: SourceScenarios; appels: Appels } {
  const appels: Appels = { enregistrements: [], preferees: [], recherches: [] };
  const source = sourceModifiee((scenario) => {
    const origine = (nom: string) =>
      scenario.operations.find((o) => o.operation.nom === nom)!.repondre as (
        p: unknown,
        ctx: unknown,
      ) => unknown;
    const recherche = origine(voyageur.OP_RECHERCHER_DEPARTS.nom);
    const preferee = origine(voyageur.OP_DEFINIR_PREFEREE.nom);
    const operations: Operations = [
      implementer(voyageur.OP_ENREGISTRER_FILTRES, (p) => {
        appels.enregistrements.push(p);
        return { enregistre: true };
      }),
      implementer(voyageur.OP_DEFINIR_PREFEREE, async (p, ctx) => {
        appels.preferees.push(p);
        const remplacee = await reponses.definirPreferee?.(p);
        if (remplacee !== undefined) return remplacee;
        return preferee(p, ctx) as c.DefinirPreferee;
      }),
      implementer(voyageur.OP_RECHERCHER_DEPARTS, async (p, ctx) => {
        appels.recherches.push(p);
        const base = (await recherche(p, ctx)) as c.ResultatRechercheDeparts;
        return reponses.recherche ? reponses.recherche(p, base) : base;
      }),
      ...(reponses.options
        ? [implementer(voyageur.OP_OPTIONS_FILTRES, (p) => reponses.options!(p))]
        : []),
      ...scenario.operations,
    ];
    return { ...scenario, operations };
  });
  return { source, appels };
}

/** Réponse de recherche à `n` départs de bus (les départs du scénario de l'accueil, répétés au besoin). */
export function avecNDeparts(
  base: c.ResultatRechercheDeparts,
  n: number,
): c.ResultatRechercheDeparts {
  const modele = base.departs[0]!;
  return {
    ...base,
    departs: Array.from({ length: n }, (_, i) => ({ ...modele, id: `${modele.id}-${i}` })),
  };
}

/** Monte l'application complète (coquille, layout voyageur, barre d'onglets) sur le filtre des départs. */
export function rendreAppFiltres(options: { client?: ClientApi; masques?: string[] } = {}) {
  return rendreApp({
    url: "/voyager/filtres",
    clientApi: options.client ?? clientFiltres(),
    scenario: "MainFiltres",
    horloge: horlogeFigee("2027-01-05T07:38:00+01:00"),
    ...(options.masques ? { masques: options.masques } : {}),
  });
}
