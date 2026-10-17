import { ecrans } from "@afrimove/fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect } from "vitest";
import type { ErreurApi } from "../../infra/erreurs";
import type { Horloge } from "../../infra/horloge";
import { creerClientMock } from "../../infra/mock";
import type { ClientMock } from "../../infra/mock";
import { FournisseurApi } from "../../infra/react";
import type { SourceScenarios } from "../../infra/scenarios";
import { PLANCHES_PATRON, estPlancheMockPatron, installerMockPatron } from "../installer";

/**
 * Outils de test partagés : une source de scénarios comme le composeur central la fabriquera
 * (`installerMockPatron` au-dessus de `ecrans`), un client mock et un « écran » minimal.
 */

export function sourcePatron(): SourceScenarios {
  return {
    noms: () => ["defaut", ...PLANCHES_PATRON],
    instantInitial: (nom) => (estPlancheMockPatron(nom) ? ecrans[nom].maintenant : undefined),
    charger: (nom) => {
      const contribution = installerMockPatron(
        nom,
        estPlancheMockPatron(nom) ? ecrans[nom] : undefined,
      );
      return { nom, operations: contribution.operations, flux: contribution.flux };
    },
  };
}

export function clientPatron(scenario: string, horloge?: Horloge): ClientMock {
  return creerClientMock({
    source: sourcePatron(),
    scenario,
    latenceMs: 0,
    ...(horloge ? { horloge } : {}),
  });
}

export function enveloppe(client: ClientMock) {
  return function Enveloppe({ children }: { children?: ReactNode }) {
    return <FournisseurApi client={client}>{children}</FournisseurApi>;
  };
}

/** Rend un hook de lecture dans le scénario d'une planche et attend sa donnée. */
export async function lire<T>(
  scenario: string,
  hook: () => UseQueryResult<T, ErreurApi>,
): Promise<T> {
  const client = clientPatron(scenario);
  const { result } = renderHook(hook, { wrapper: enveloppe(client) });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  if (result.current.error) throw result.current.error;
  return result.current.data as T;
}

/** Rend un hook de lecture et renvoie l'erreur qu'il produit. */
export async function lireErreur<T>(
  scenario: string,
  hook: () => UseQueryResult<T, ErreurApi>,
): Promise<ErreurApi> {
  const client = clientPatron(scenario);
  const { result } = renderHook(hook, { wrapper: enveloppe(client) });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  if (!result.current.error) throw new Error("Une erreur était attendue");
  return result.current.error;
}

export type Ecriture<P, R> = UseMutationResult<R, ErreurApi, P>;
