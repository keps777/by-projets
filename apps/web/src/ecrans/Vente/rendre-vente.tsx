import {
  ErreurHttp,
  agence,
  creerClientMock,
  horlogeGelee,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { horlogeFigee } from "@/coquille/horloge";
import { rendreApp } from "@/test/rendre";
import { EcranVente } from "./EcranVente";
import type { ImpressionBillet } from "./impression";

/** Outils des tests de l'écran Vente (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

export type Panne = "vide" | "erreur" | "siege_pris" | "vente";

interface OptionsRenduVente {
  panne?: Panne;
  conception?: boolean;
  latenceMs?: number;
  impression?: ImpressionBillet;
}

/** Source du scénario « Vente » : enregistre les ventes reçues et injecte au besoin une panne. */
function sourceVente(
  recus: unknown[],
  panne: Panne | undefined,
): { source: SourceScenarios; siegePrisUneFois: { fait: boolean } } {
  const base = sourceScenariosFixtures();
  const siegePrisUneFois = { fait: false };
  const source: SourceScenarios = {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation): ImplementationMock => {
          const operation = implementation.operation as unknown;
          if (operation === agence.OP_VENTE_CONTEXTE && (panne === "vide" || panne === "erreur")) {
            const erreur =
              panne === "vide"
                ? new ErreurHttp(404, "Aucun départ", "INTROUVABLE")
                : new ErreurHttp(500, "Panne simulée", "PANNE");
            return {
              operation: implementation.operation,
              repondre: () => {
                throw erreur;
              },
            };
          }
          if (operation === agence.ECRITURES.billetVendu.operation) {
            return {
              operation: implementation.operation,
              repondre: (params, ctx) => {
                recus.push(params);
                if (panne === "vente") throw new ErreurHttp(500, "Panne simulée", "PANNE");
                if (panne === "siege_pris" && !siegePrisUneFois.fait) {
                  siegePrisUneFois.fait = true;
                  throw new ErreurHttp(409, "Siège déjà pris", "SIEGE_PRIS");
                }
                return implementation.repondre(params, ctx);
              },
            };
          }
          return implementation;
        }),
      };
    },
  };
  return { source, siegePrisUneFois };
}

/** Monte l'application complète sur /guichet/vendre, avec le mock du scénario « Vente ». */
export function rendreVente(options: OptionsRenduVente = {}): {
  routeur: ReturnType<typeof rendreApp>["routeur"];
  client: ClientMock;
  recus: unknown[];
} {
  const { panne, conception = false, latenceMs = 0, impression } = options;
  const recus: unknown[] = [];
  const { source } = sourceVente(recus, panne);
  const client = creerClientMock({
    source,
    scenario: "Vente",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const { routeur } = rendreApp({
    url: "/guichet/vendre",
    clientApi: client,
    scenario: "Vente",
    conception,
    horloge: horlogeFigee(HORLOGE_PLANCHE),
    // Une impression de remplacement n'est possible que par le composant : on monte alors l'écran seul.
    ...(impression
      ? {
          routes: [
            { path: "/guichet/vendre", element: <EcranVente impression={impression} /> },
            { path: "/guichet/accueil", element: <p>Guichet</p> },
            { path: "/gare", element: <p>Gare</p> },
          ],
        }
      : {}),
  });
  return { routeur, client, recus };
}
