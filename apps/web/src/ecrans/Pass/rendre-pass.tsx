import {
  FournisseurApi,
  creerClientMock,
  horlogeGelee,
  implementer,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { ConceptionProvider } from "@afrimove/ui";
import { render, type RenderResult } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { HorlogeProvider, horlogeFigee } from "@/coquille/horloge";
import { creerI18n } from "@/i18n";
import {
  FournisseurCacheBillet,
  creerCacheBillet,
  type CacheBillet,
  type PortStockage,
} from "./cache-billet";
import { EcranPass } from "./EcranPass";

/** Outils des tests de l'écran Pass (pas un test : le nom ne suit pas `*.test.tsx`). */

/** L'instant du banc de fidélité : 07:38 à Douala, le jour du départ de 08:00. */
export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
export const BILLET_ID = "BEX-DLA-270105-0142";

type Operations = Scenario["operations"];

/** Source des fixtures dont le scénario « Pass » est modifié par `modifier` (les opérations ajoutées passent devant). */
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

type Repondre = (params: unknown, ctx: unknown) => unknown;

/** Réponse de l'opération `OP_BILLET` du scénario, transformée par `transformer`. */
export function avecBillet(
  transformer: (billet: c.BilletVoyageur) => c.BilletVoyageur,
): SourceScenarios {
  return sourceModifiee((operations) =>
    operations.map((impl) =>
      impl.operation.nom === voyageur.OP_BILLET.nom
        ? implementer(voyageur.OP_BILLET, async (params, ctx) =>
            transformer((await (impl.repondre as Repondre)(params, ctx)) as c.BilletVoyageur),
          )
        : impl,
    ),
  );
}

/** Source dont les opérations nommées lèvent `erreur` (une fonction : une erreur par appel). */
export function avecPanne(
  operations: ReadonlyArray<{ nom: string }>,
  erreur: (appel: number) => Error | undefined,
): { source: SourceScenarios; appels: () => number } {
  let appels = 0;
  const noms = new Set(operations.map((o) => o.nom));
  const source = sourceModifiee((existantes) =>
    existantes.map((impl) =>
      noms.has(impl.operation.nom)
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
  );
  return { source, appels: () => appels };
}

export function clientPass(source: SourceScenarios = sourceScenariosFixtures()): ClientApi {
  return creerClientMock({
    source,
    scenario: "Pass",
    latenceMs: 0,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
}

/** Stockage en mémoire : on peut y lire ce que le cache a écrit. */
export function stockageMemoire(): PortStockage & { contenu: Map<string, string> } {
  const contenu = new Map<string, string>();
  return {
    contenu,
    lire: (cle) => contenu.get(cle) ?? null,
    ecrire: (cle, valeur) => void contenu.set(cle, valeur),
    retirer: (cle) => void contenu.delete(cle),
    cles: () => [...contenu.keys()],
  };
}

/** Clé AES-GCM d'essai : la vraie cryptographie (Web Crypto), seule la clé vient de la mémoire. */
export function cleDEssai(): () => Promise<CryptoKey> {
  const cle = crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  return () => cle;
}

export function cacheDEssai(stockage: PortStockage = stockageMemoire()): CacheBillet {
  return creerCacheBillet({ cle: cleDEssai(), stockage });
}

export interface OptionsRenduPass {
  client?: ClientApi;
  cache?: CacheBillet;
  url?: string;
  horloge?: string;
}

/** Monte l'écran seul (client, langue, horloge, cache) sur `/billet/:billetId`. */
export function rendrePass(options: OptionsRenduPass = {}): RenderResult {
  const { client = clientPass(), cache = cacheDEssai(), url = `/billet/${BILLET_ID}` } = options;
  const horloge = horlogeFigee(options.horloge ?? HORLOGE_PLANCHE);
  return render(
    <I18nextProvider i18n={creerI18n("fr")}>
      <HorlogeProvider horloge={horloge}>
        <FournisseurApi client={client}>
          <ConceptionProvider actif={false}>
            <FournisseurCacheBillet value={cache}>
              <MemoryRouter initialEntries={[url]}>
                <Routes>
                  <Route path="/billet/:billetId" element={<EcranPass />} />
                </Routes>
              </MemoryRouter>
            </FournisseurCacheBillet>
          </ConceptionProvider>
        </FournisseurApi>
      </HorlogeProvider>
    </I18nextProvider>,
  );
}
