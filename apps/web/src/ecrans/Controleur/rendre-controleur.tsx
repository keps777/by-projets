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

/** Outils des tests de l'écran Controleur (pas un test : le nom ne suit pas `*.test.tsx`). */

export type Panne = "siege" | "regularisation" | "signalement" | "cloture" | "vide" | "erreur";

export interface EvenementEnvoye {
  type: string;
  donnees: Record<string, unknown>;
}

type Controle = contrats.ControleInopine;

export interface OptionsControleur {
  panne?: Panne;
  /** Modifie le contrôle du scénario « Controleur » avant qu'il ne soit lu. */
  controle?: (controle: Controle) => Controle;
  latenceMs?: number;
  url?: string;
}

const ECRITURES_SUIVIES = {
  siege: agence.ECRITURES.controleSiegeVerifie,
  regularisation: agence.ECRITURES.controleRegularise,
  signalement: agence.ECRITURES.controleConvoyeurSignale,
  cloture: agence.ECRITURES.controleCloture,
} as const;

/** Source du scénario « Controleur » : espionne les écritures et peut injecter une panne ou un autre contrôle. */
function source(options: OptionsControleur, envoyes: EvenementEnvoye[]): SourceScenarios {
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
        if ((implementation.operation as unknown) === agence.OP_CONTROLE_INOPINE) {
          return {
            operation: implementation.operation,
            repondre: async (params, ctx) => {
              if (options.panne === "vide") {
                throw new ErreurHttp(404, "Aucun contrôle en cours", "INTROUVABLE");
              }
              if (options.panne === "erreur") throw new ErreurHttp(500, "Panne simulée", "PANNE");
              const controle = (await implementation.repondre(params, ctx)) as Controle;
              return options.controle ? options.controle(structuredClone(controle)) : controle;
            },
          };
        }
        return implementation;
      });
      return { ...scenario, operations };
    },
  };
}

/** Monte l'application complète sur /inopine, avec le mock du scénario « Controleur ». */
export function rendreControleur(options: OptionsControleur = {}) {
  const envoyes: EvenementEnvoye[] = [];
  const client = creerClientMock({
    source: source(options, envoyes),
    scenario: "Controleur",
    latenceMs: options.latenceMs ?? 0,
  });
  const { routeur } = rendreApp({
    url: options.url ?? "/inopine",
    clientApi: client,
    scenario: "Controleur",
  });
  return { routeur, client, envoyes };
}
