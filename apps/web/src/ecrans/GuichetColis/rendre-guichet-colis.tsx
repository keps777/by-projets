import {
  ErreurHttp,
  agence,
  creerClientMock,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { ReactNode } from "react";
import { Outlet, type DataRouter } from "react-router";
import { sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { rendreApp } from "@/test/rendre";
import { FournisseurPiloteEtiquette, type PiloteEtiquette } from "./impression";

/** Outils des tests de l'écran GuichetColis (pas un test : le nom ne suit pas `*.test.tsx`). */

export type Panne = "enregistrement" | "impression" | "erreur";

export interface EvenementEnvoye {
  type: string;
  donnees: Record<string, unknown>;
  numeroPlage: number | null;
}

export interface OptionsRenduColis {
  /** `enregistrement` : colis.enregistre échoue ; `impression` : impression.demandee échoue ; `erreur` : formulaire en panne. */
  panne?: Panne;
  /** Formulaire sans aucun départ. */
  sansDepart?: boolean;
  /** Formulaire sans brouillon (champs vides, pas de photo). */
  sansBrouillon?: boolean;
  /** Imprimante du formulaire (état « ok » par défaut). */
  imprimante?: "ok" | "papier_vide" | "hors_service" | "absente";
  /** « Prochain numéro » de colis que le serveur annonce (un guichet qui a déjà enregistré des colis aujourd'hui). */
  sequenceServeur?: number;
  pilote?: PiloteEtiquette;
  conception?: boolean;
  latenceMs?: number;
  url?: string;
}

function sourceModifiee(options: OptionsRenduColis, envoyes: EvenementEnvoye[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  const { colisEnregistre, impressionDemandee } = agence.ECRITURES;
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation): ImplementationMock => {
          const operation = implementation.operation as unknown;
          if (operation === agence.OP_COLIS_FORMULAIRE) {
            if (options.panne === "erreur") {
              return {
                operation: implementation.operation,
                repondre: () => {
                  throw new ErreurHttp(500, "Panne simulée", "PANNE");
                },
              };
            }
            return {
              operation: implementation.operation,
              repondre: (params, ctx) => {
                const formulaire = implementation.repondre(params, ctx) as Awaited<
                  ReturnType<typeof agence.useColisFormulaire>["data"]
                > &
                  object;
                return {
                  ...formulaire,
                  departs: options.sansDepart ? [] : formulaire.departs,
                  brouillon: options.sansBrouillon ? null : formulaire.brouillon,
                  imprimante: { ...formulaire.imprimante, etat: options.imprimante ?? "ok" },
                  ...(options.sequenceServeur !== undefined
                    ? {
                        prochainNumero: {
                          sequence: options.sequenceServeur,
                          numero: `C-DLA-270105-${String(options.sequenceServeur).padStart(4, "0")}`,
                        },
                      }
                    : {}),
                };
              },
            };
          }
          const ecriture =
            operation === colisEnregistre.operation
              ? "enregistrement"
              : operation === impressionDemandee.operation
                ? "impression"
                : null;
          if (ecriture === null) return implementation;
          return {
            operation: implementation.operation,
            repondre: (params, ctx) => {
              const evenement = params as unknown as {
                type: string;
                donnees: Record<string, unknown>;
                numeroPlage: number | null;
              };
              envoyes.push({
                type: evenement.type,
                donnees: evenement.donnees,
                numeroPlage: evenement.numeroPlage,
              });
              if (options.panne === ecriture) throw new ErreurHttp(500, "Panne simulée", "PANNE");
              return implementation.repondre(params, ctx);
            },
          };
        }),
      };
    },
  };
}

/** Monte l'application complète sur /guichet/colis, avec le mock du scénario « GuichetColis ». */
export function rendreColis(options: OptionsRenduColis = {}): {
  routeur: DataRouter;
  client: ClientMock;
  envoyes: EvenementEnvoye[];
} {
  const envoyes: EvenementEnvoye[] = [];
  const client = creerClientMock({
    source: sourceModifiee(options, envoyes),
    scenario: "GuichetColis",
    latenceMs: options.latenceMs ?? 0,
  });
  const routes = construireRoutes(sourcesRoutes, []);
  const { routeur } = rendreApp({
    url: options.url ?? "/guichet/colis",
    scenario: "GuichetColis",
    conception: options.conception ?? false,
    clientApi: client,
    routes: options.pilote
      ? [{ element: <AvecPilote pilote={options.pilote} />, children: routes }]
      : routes,
  });
  return { routeur, client, envoyes };
}

function AvecPilote({ pilote }: { pilote: PiloteEtiquette }): ReactNode {
  return (
    <FournisseurPiloteEtiquette pilote={pilote}>
      <Outlet />
    </FournisseurPiloteEtiquette>
  );
}
