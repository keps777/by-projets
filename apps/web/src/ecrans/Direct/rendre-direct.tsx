import {
  FournisseurApi,
  creerClientMock,
  horlogeGelee,
  implementer,
  simulerFlux,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { ConceptionProvider } from "@afrimove/ui";
import { render, type RenderResult } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { EcranDirect } from "./EcranDirect";

/** Outils des tests de l'écran Direct (pas un test : le nom ne suit pas `*.test.tsx`). */

/** L'instant du banc de fidélité : 07:38 à Douala, le jour du départ de 08:00. */
export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
export const BILLET_ID = "BEX-DLA-270105-0142";
/** Identifiant du billet que le mock renvoie dans ses réponses (celui du scénario de la planche). */
export const BILLET_MOCK = ecrans.Direct.donnees.billet._billetId;

type Operations = Scenario["operations"];
type Repondre = (params: unknown, ctx: unknown) => unknown;

/** Source des fixtures dont le scénario « Direct » est modifié par `modifier`. */
export function sourceModifiee(modifier: (scenario: Scenario) => Scenario): SourceScenarios {
  const base = sourceScenariosFixtures();
  return { ...base, charger: async (nom) => modifier(await base.charger(nom)) };
}

/** Réponse de `OP_SUIVI_BUS` transformée par `transformer` (le numéro d'appel, de 1 à n, est donné). */
export function avecSuivi(
  transformer: (suivi: c.SuiviBus, appel: number) => c.SuiviBus,
): SourceScenarios {
  return sourceModifiee((scenario) => {
    const origine = scenario.operations.find((o) => o.operation.nom === voyageur.OP_SUIVI_BUS.nom)!;
    let appels = 0;
    const operations: Operations = [
      implementer(voyageur.OP_SUIVI_BUS, async (params, ctx) => {
        appels += 1;
        return transformer(
          (await (origine.repondre as Repondre)(params, ctx)) as c.SuiviBus,
          appels,
        );
      }),
      ...scenario.operations,
    ];
    return { ...scenario, operations };
  });
}

/** Source dont l'opération `nom` lève `erreur(appel)` (ou répond normalement si elle renvoie `undefined`). */
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

/** Source qui note les paramètres de chaque appel de `nom`, sans changer la réponse. */
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

/**
 * Source dont le canal de position du bus est piloté par le test : `emettre` envoie un message à l'écran (le flux
 * du mock, qui avance tout seul, est retiré).
 */
export function avecPositionEnDirect(base?: SourceScenarios): {
  source: SourceScenarios;
  emettre: (message: c.MessagePositionBus) => void;
  abonnes: () => number;
} {
  let ecouteur: ((message: c.MessagePositionBus) => void) | undefined;
  let abonnes = 0;
  const modifie = (scenario: Scenario): Scenario => ({
    ...scenario,
    flux: [
      simulerFlux(voyageur.CANAL_POSITION_BUS, (_params, ctx) => {
        abonnes += 1;
        ecouteur = (message) => ctx.emettre(message);
        return () => {
          abonnes -= 1;
          ecouteur = undefined;
        };
      }),
    ],
  });
  const source: SourceScenarios = base
    ? { ...base, charger: async (nom) => modifie(await base.charger(nom)) }
    : sourceModifiee(modifie);
  return { source, emettre: (message) => ecouteur?.(message), abonnes: () => abonnes };
}

/** Message de position tel que l'enverrait le serveur, avec les valeurs de la planche sauf celles données. */
export function messagePosition(
  surcharge: Partial<c.MessagePositionBus> = {},
): c.MessagePositionBus {
  return {
    billetId: BILLET_MOCK,
    instant: "2027-01-05T09:40:00.000+01:00",
    latitude: 3.9,
    longitude: 10.4,
    vitesseKmh: 84,
    arriveeEstimee: "2027-01-05T11:35:00.000+01:00",
    retardMinutes: 5,
    prochainArret: "Pouma",
    ...surcharge,
  };
}

export function clientDirect(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({
    source,
    scenario: "Direct",
    latenceMs: 0,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
}

export interface OptionsRenduDirect {
  client?: ClientApi;
  url?: string;
}

/** Monte l'écran seul (client, langue) sur `/billet/:billetId/direct`. */
export function rendreDirect(options: OptionsRenduDirect = {}): RenderResult {
  const { client = clientDirect(), url = `/billet/${BILLET_ID}/direct` } = options;
  return render(
    <I18nextProvider i18n={creerI18n("fr")}>
      <FournisseurApi client={client}>
        <ConceptionProvider actif={false}>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/billet/:billetId/direct" element={<EcranDirect />} />
            </Routes>
          </MemoryRouter>
        </ConceptionProvider>
      </FournisseurApi>
    </I18nextProvider>,
  );
}
