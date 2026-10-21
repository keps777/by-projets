import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect } from "vitest";
import { ecrans } from "@afrimove/fixtures";
import type { NomPlanche } from "@afrimove/fixtures";
import { creerClientMock } from "../infra/mock";
import type { ClientMock, OptionsMock } from "../infra/mock";
import { FournisseurApi } from "../infra/react";
import type { SourceScenarios } from "../infra/scenarios";
import { installerMockVoyageur, PLANCHES_VOYAGEUR } from "./index";

/**
 * Aides de test : la source de scénarios que fabriquerait le composeur central, limitée à l'app
 * voyageur, et un rendu de hooks sur le mock de la planche demandée.
 */
export function sourceVoyageur(): SourceScenarios {
  return {
    noms: () => [...PLANCHES_VOYAGEUR],
    instantInitial: (nom) => ecrans[nom as NomPlanche].maintenant,
    charger: (nom) => installerMockVoyageur(nom, ecrans[nom as NomPlanche]),
  };
}

export function clientPour(planche: string, options: Partial<OptionsMock> = {}): ClientMock {
  return creerClientMock({ source: sourceVoyageur(), scenario: planche, latenceMs: 0, ...options });
}

interface Resultat {
  isSuccess?: boolean;
  isError?: boolean;
}

/** Vrai quand toutes les requêtes de l'objet ont abouti (les mutations et le temps réel sont ignorés). */
export function pret(valeurs: Record<string, unknown>): boolean {
  return Object.values(valeurs).every((v) => {
    const r = v as Resultat | null;
    return (
      !r || typeof r !== "object" || "mutate" in r || !("isSuccess" in r) || r.isSuccess === true
    );
  });
}

/** Rend `hook` sur le mock de `planche` et attend que toutes ses requêtes aient abouti. */
export async function rendreHooks<T extends Record<string, unknown>>(
  planche: string,
  hook: () => T,
  client: ClientMock = clientPour(planche),
) {
  const rendu = renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <FournisseurApi client={client}>{children}</FournisseurApi>
    ),
  });
  await waitFor(() => expect(pret(rendu.result.current)).toBe(true));
  return { ...rendu, client };
}

/** `data` d'une requête déjà aboutie (échoue le test sinon). */
export function donnees<R>(requete: { data: R | undefined }): R {
  if (requete.data === undefined) throw new Error("La requête n'a pas encore de données");
  return requete.data;
}
