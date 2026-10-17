import {
  ErreurHttp,
  ErreurReseau,
  agence,
  creerClientMock,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests de l'écran Quai (pas un test : le nom ne suit pas `*.test.tsx`). */

export type Panne = "vide" | "erreur" | "scan" | "code" | "liberation" | "liste";

const OPERATION_EN_PANNE = {
  vide: agence.OP_QUAI_EMBARQUEMENT,
  erreur: agence.OP_QUAI_EMBARQUEMENT,
  scan: agence.ECRITURES.quaiScanne.operation,
  code: agence.ECRITURES.quaiCodeSaisi.operation,
  liberation: agence.ECRITURES.quaiLibere.operation,
  liste: agence.ECRITURES.quaiListeEnvoyee.operation,
} as const;

/** Source du scénario « Quai » des fixtures, avec au besoin une panne injectée dans une opération. */
export function sourceAvecPanne(panne?: Panne): SourceScenarios {
  const base = sourceScenariosFixtures();
  if (!panne) return base;
  const cible = OPERATION_EN_PANNE[panne] as { nom: string };
  const erreur =
    panne === "vide"
      ? new ErreurHttp(404, "Aucun quai ouvert", "INTROUVABLE")
      : panne === "scan" || panne === "code"
        ? new ErreurReseau()
        : new ErreurHttp(500, "Panne simulée", "PANNE");
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation) =>
          implementation.operation.nom === cible.nom
            ? ({
                operation: implementation.operation,
                repondre: () => {
                  throw erreur;
                },
              } as ImplementationMock)
            : implementation,
        ),
      };
    },
  };
}

export interface OptionsRenduQuai {
  panne?: Panne;
  /** Latence simulée du mock (0 par défaut). */
  latenceMs?: number;
  conception?: boolean;
}

/** Monte l'application complète sur /embarquement, avec le mock du scénario « Quai ». */
export function rendreQuai(options: OptionsRenduQuai = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { panne, latenceMs = 0, conception = false } = options;
  const client = creerClientMock({
    source: sourceAvecPanne(panne),
    scenario: "Quai",
    latenceMs,
  });
  const { routeur } = rendreApp({
    clientApi: client,
    scenario: "Quai",
    conception,
    url: "/embarquement",
  });
  return { routeur, client };
}
