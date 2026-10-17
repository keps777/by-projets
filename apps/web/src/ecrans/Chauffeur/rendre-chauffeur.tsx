import {
  ErreurHttp,
  agence,
  creerClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { agence as contrats } from "@afrimove/contrats";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran Chauffeur (pas un test : le nom ne suit pas `*.test.tsx`). */

export type Panne = "incident" | "retard" | "arrivee" | "depense" | "vide" | "erreur";

export interface EvenementEnvoye {
  type: string;
  donnees: Record<string, unknown>;
}

type FeuilleRoute = contrats.ChauffeurFeuille;

export interface OptionsChauffeur {
  panne?: Panne;
  /** Modifie la feuille de route du scénario « Chauffeur » avant qu'elle ne soit lue. */
  feuille?: (feuille: FeuilleRoute) => FeuilleRoute;
  latenceMs?: number;
  url?: string;
}

const ECRITURES_SUIVIES = {
  incident: agence.ECRITURES.chauffeurIncident,
  retard: agence.ECRITURES.chauffeurRetard,
  arrivee: agence.ECRITURES.chauffeurArriveeArret,
  depense: agence.ECRITURES.chauffeurDepense,
} as const;

/** Source du scénario « Chauffeur » : espionne les écritures et peut injecter une panne ou une autre feuille. */
function source(options: OptionsChauffeur, envoyes: EvenementEnvoye[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const operations = scenario.operations.map((implementation): ImplementationMock => {
        const ecriture = Object.values(ECRITURES_SUIVIES).find(
          (e) => (e.operation as unknown) === implementation.operation,
        );
        if (ecriture) {
          const tombe =
            options.panne &&
            ECRITURES_SUIVIES[options.panne as keyof typeof ECRITURES_SUIVIES] === ecriture;
          return {
            operation: implementation.operation,
            repondre: (params, ctx) => {
              const evenement = params as unknown as {
                type: string;
                donnees: Record<string, unknown>;
              };
              envoyes.push({ type: evenement.type, donnees: evenement.donnees });
              if (tombe) throw new ErreurHttp(500, "Panne simulée", "PANNE");
              return implementation.repondre(params, ctx);
            },
          };
        }
        if ((implementation.operation as unknown) === agence.OP_CHAUFFEUR_FEUILLE) {
          return {
            operation: implementation.operation,
            repondre: async (params, ctx) => {
              if (options.panne === "vide") {
                throw new ErreurHttp(404, "Aucune feuille de route", "INTROUVABLE");
              }
              if (options.panne === "erreur") throw new ErreurHttp(500, "Panne simulée", "PANNE");
              const feuille = (await implementation.repondre(params, ctx)) as FeuilleRoute;
              return options.feuille ? options.feuille(structuredClone(feuille)) : feuille;
            },
          };
        }
        return implementation;
      });
      return { ...scenario, operations };
    },
  };
}

/** Monte l'application complète sur /chauffeur, avec le mock du scénario « Chauffeur ». */
export function rendreChauffeur(options: OptionsChauffeur = {}) {
  const envoyes: EvenementEnvoye[] = [];
  const client = creerClientMock({
    source: source(options, envoyes),
    scenario: "Chauffeur",
    latenceMs: options.latenceMs ?? 0,
  });
  const { routeur } = rendreApp({
    url: options.url ?? "/chauffeur",
    clientApi: client,
    scenario: "Chauffeur",
  });
  return { routeur, client, envoyes };
}
