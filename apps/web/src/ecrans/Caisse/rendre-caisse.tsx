import {
  ErreurHttp,
  agence,
  creerClientMock,
  horlogeGelee,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { horlogeFigee } from "@/coquille/horloge";

/** Outils des tests de l'écran Caisse (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";

/**
 * Panne injectée dans le mock. `deja_fermee` : le serveur répond 409 `SESSION_NON_OUVERTE` à la première
 * écriture (clôture arrivée par ailleurs, réponse perdue...), puis lit la session clôturée.
 */
export type Panne = "cloture" | "comptage" | "vide" | "erreur" | "deja_fermee";

/** Événement tel que l'appareil l'envoie (le type et les données suffisent aux tests). */
export interface EvenementEnvoye {
  type: string;
  donnees: Record<string, unknown>;
}

export interface OptionsSource {
  panne?: Panne;
  /** Appelé à chaque écriture de comptage ou de clôture reçue par le mock. */
  journal?: (evenement: EvenementEnvoye) => void;
  /** Force l'état de la session lue (ex. une caisse déjà clôturée). */
  etat?: "ouverte" | "cloturee" | "validee";
}

type Repondre = (params: unknown, ctx: unknown) => unknown;

/** Source du scénario « Caisse » des fixtures, avec au besoin une panne, un journal des écritures ou un état forcé. */
export function sourceAvecPanne(options: OptionsSource = {}): SourceScenarios {
  const { panne, journal, etat } = options;
  const base = sourceScenariosFixtures();
  if (!panne && !journal && !etat) return base;
  const ecritures = agence.ECRITURES;
  const comptage: unknown = ecritures.caisseComptee.operation;
  const cloture: unknown = ecritures.caisseCloturee.operation;
  const lecture: unknown = agence.OP_CAISSE_SESSION;
  const erreur =
    panne === "vide"
      ? new ErreurHttp(404, "Aucune session de caisse", "INTROUVABLE")
      : new ErreurHttp(500, "Panne simulée", "PANNE");
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      let fermee = false;
      return {
        ...scenario,
        operations: scenario.operations.map((implementation) => {
          const operation: unknown = implementation.operation;
          const originale = implementation.repondre as Repondre;
          const remplacer = (repondre: Repondre): ImplementationMock =>
            ({ operation: implementation.operation, repondre }) as ImplementationMock;

          const pannePropre =
            (panne === "cloture" && operation === cloture) ||
            (panne === "comptage" && operation === comptage) ||
            ((panne === "vide" || panne === "erreur") && operation === lecture);
          if (pannePropre) {
            return remplacer(() => {
              throw erreur;
            });
          }
          if (operation === comptage || operation === cloture) {
            return remplacer((params, ctx) => {
              if (panne === "deja_fermee") {
                fermee = true;
                throw new ErreurHttp(409, "Cette caisse est déjà clôturée", "SESSION_NON_OUVERTE");
              }
              journal?.(params as EvenementEnvoye);
              return originale(params, ctx);
            });
          }
          if (operation === lecture && (panne === "deja_fermee" || etat)) {
            return remplacer((params, ctx) => {
              const session = originale(params, ctx) as { etat: string };
              return fermee || etat ? { ...session, etat: etat ?? "cloturee" } : session;
            });
          }
          return implementation;
        }),
      };
    },
  };
}

export interface OptionsRenduCaisse extends OptionsSource {
  /** Instant de l'horloge de l'application (par défaut : celui du banc de fidélité). */
  horloge?: string;
  conception?: boolean;
  /** Latence simulée du mock (0 par défaut). */
  latenceMs?: number;
  url?: string;
}

/** Monte l'application complète sur /guichet/caisse, avec le mock du scénario « Caisse ». */
export function rendreCaisse(options: OptionsRenduCaisse = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const {
    horloge = HORLOGE_PLANCHE,
    conception = false,
    latenceMs = 0,
    url = "/guichet/caisse",
    ...source
  } = options;
  const client = creerClientMock({
    source: sourceAvecPanne(source),
    scenario: "Caisse",
    latenceMs,
    horloge: horlogeGelee(horloge),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [url],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{ demo: true, conception, horloge: null, scenario: null, modulesMasques: [] }}
      session={null}
      horloge={horlogeFigee(horloge)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
