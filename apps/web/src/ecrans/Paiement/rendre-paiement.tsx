import {
  creerClientMock,
  creerHorlogeManuelle,
  horlogeGelee,
  implementer,
  type ClientMock,
  type ContexteMock,
  type FluxMock,
  type HorlogeManuelle,
  type ImplementationMock,
  type Operation,
  type SourceScenarios,
} from "@afrimove/api-client";
import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { horlogeFigee, type Horloge } from "@/coquille/horloge";

/** Outils des tests de l'écran Paiement (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
export const COMMANDE_ID = "cmd-0001";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduPaiement {
  /**
   * Implémentations qui passent devant celles du scénario « Paiement » (le client prend la première trouvée).
   * `originale(nom)` rend celle du scénario, pour la surveiller ou la compléter.
   */
  operations?: (originale: Originale) => ImplementationMock[];
  /** Flux qui passent devant ceux du scénario. */
  flux?: () => FluxMock[];
  conception?: boolean;
  /** Mode démonstration (vrai par défaut) : sans lui, aucun jeton de carte de démonstration n'est fourni. */
  demo?: boolean;
  /** Horloge de l'application (par défaut : celle du banc de fidélité). */
  horloge?: Horloge;
  /** Horloge du client mock : manuelle pour avancer le temps réel (confirmation MoMo) sans attendre. */
  horlogeClient?: HorlogeManuelle;
  latenceMs?: number;
  /** Commande de l'adresse (par défaut celle du banc de fidélité). */
  commandeId?: string;
}

/** Source du scénario « Paiement » des fixtures, avec des opérations ou des flux remplacés. */
function sourceModifiee(options: OptionsRenduPaiement): SourceScenarios {
  const base = sourceScenariosFixtures();
  if (!options.operations && !options.flux) return base;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const originale: Originale = (nomOperation) => {
        const trouvee = scenario.operations.find((o) => o.operation.nom === nomOperation);
        if (!trouvee) throw new Error(`Opération absente du scénario : ${nomOperation}`);
        return trouvee;
      };
      return {
        ...scenario,
        operations: [...(options.operations?.(originale) ?? []), ...scenario.operations],
        flux: [...(options.flux?.() ?? []), ...(scenario.flux ?? [])],
      };
    },
  };
}

/** Garde la réponse du scénario pour `operation` et note les paramètres de chaque appel. */
export function surveiller<P, R>(
  operation: Operation<P, R>,
  originale: Originale,
  journal: (params: P) => void,
): ImplementationMock {
  const reponse = originale(operation.nom).repondre as (
    params: P,
    ctx: ContexteMock,
  ) => R | Promise<R>;
  return implementer(operation, (params, ctx) => {
    journal(params);
    return reponse(params, ctx);
  });
}

/** Garde l'implémentation du scénario pour `operation` et modifie sa réponse. */
export function transformer<P, R>(
  operation: Operation<P, R>,
  originale: Originale,
  modifier: (reponse: R, params: P) => R,
): ImplementationMock {
  const reponse = originale(operation.nom).repondre as (
    params: P,
    ctx: ContexteMock,
  ) => R | Promise<R>;
  return implementer(operation, async (params, ctx) =>
    modifier(await reponse(params, ctx), params),
  );
}

export function horlogeManuelle(): HorlogeManuelle {
  return creerHorlogeManuelle(HORLOGE_PLANCHE);
}

/** Monte l'application complète sur /paiement/cmd-0001, avec le mock du scénario « Paiement ». */
export function rendrePaiement(options: OptionsRenduPaiement = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const {
    conception = false,
    demo = true,
    horloge = horlogeFigee(HORLOGE_PLANCHE),
    horlogeClient,
    latenceMs = 0,
    commandeId = COMMANDE_ID,
  } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "Paiement",
    latenceMs,
    horloge: horlogeClient ?? horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [`/paiement/${commandeId}`],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{ demo, conception, horloge: null, scenario: null, modulesMasques: [] }}
      session={null}
      horloge={horloge}
      langue="fr"
    />,
  );
  return { routeur, client };
}
