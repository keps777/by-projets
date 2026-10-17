import {
  ErreurHttp,
  ErreurReseau,
  agence,
  creerClientMock,
  type ClientMock,
  type ImplementationMock,
} from "@afrimove/api-client";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran CadenceQuai (pas un test : le nom ne suit pas `*.test.tsx`). */

/** Identifiants et QR des billets de la planche : le 0232 est celui qui vient d'être scanné. */
export const BILLET_0232 = "billet-alp-dla-270105-0232";
export const BILLET_0225 = "billet-alp-dla-270105-0225";
export const QR_0225 = "AM1:ALP-DLA-270105-0225:3318";
export const QR_0231 = "AM1:ALP-DLA-270105-0231:2086";

export type Panne = "vide" | "erreur" | "scan" | "completion" | "deja";

export interface Ecriture {
  type: string;
  donnees: Record<string, unknown>;
}

export interface OptionsRenduCadenceQuai {
  panne?: Panne;
  /** Latence simulée du mock (0 par défaut). */
  latenceMs?: number;
  conception?: boolean;
}

const OPERATION_EN_PANNE = {
  vide: agence.OP_QUAI_CADENCE,
  erreur: agence.OP_QUAI_CADENCE,
  scan: agence.ECRITURES.quaiScanne.operation,
  completion: agence.ECRITURES.billetComplete.operation,
  deja: agence.ECRITURES.billetComplete.operation,
} as const;

const ERREUR_EN_PANNE = {
  vide: () => new ErreurHttp(404, "Aucun billet de cadence scanné", "INTROUVABLE"),
  erreur: () => new ErreurHttp(500, "Panne simulée", "PANNE"),
  scan: () => new ErreurReseau(),
  completion: () => new ErreurHttp(500, "Panne simulée", "PANNE"),
  deja: () => new ErreurHttp(409, "Ce billet porte déjà un nom", "DEJA_COMPLETE"),
} as const;

const ecrituresSuivies: readonly unknown[] = Object.values(agence.ECRITURES).map(
  (e) => e.operation,
);

/**
 * Monte l'application complète sur /completer, avec le mock du scénario « CadenceQuai », une panne injectée au
 * besoin, et note chaque écriture (événement) reçue par le serveur simulé.
 */
export function rendreCadenceQuai(options: OptionsRenduCadenceQuai = {}): {
  routeur: DataRouter;
  client: ClientMock;
  ecritures: Ecriture[];
} {
  const { panne, latenceMs = 0, conception = false } = options;
  const ecritures: Ecriture[] = [];
  const base = sourceScenariosFixtures();

  const client = creerClientMock({
    source: {
      ...base,
      async charger(nom) {
        const brut = await base.charger(nom);
        const operations = brut.operations.map((implementation): ImplementationMock => {
          if (panne && implementation.operation === OPERATION_EN_PANNE[panne]) {
            const fabrique = ERREUR_EN_PANNE[panne];
            return {
              operation: implementation.operation,
              repondre: () => {
                throw fabrique();
              },
            } as ImplementationMock;
          }
          if (ecrituresSuivies.includes(implementation.operation)) {
            return {
              operation: implementation.operation,
              repondre: (params: never, ctx: never) => {
                const evenement = params as unknown as Ecriture;
                ecritures.push({ type: evenement.type, donnees: evenement.donnees });
                return implementation.repondre(params, ctx);
              },
            } as ImplementationMock;
          }
          return implementation;
        });
        return { ...brut, operations };
      },
    },
    scenario: "CadenceQuai",
    latenceMs,
  });

  const { routeur } = rendreApp({
    clientApi: client,
    scenario: "CadenceQuai",
    conception,
    url: "/completer",
  });
  return { routeur, client, ecritures };
}
