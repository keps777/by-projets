import { plageGuichet } from "@afrimove/domain";
import { ecrans } from "@afrimove/fixtures";
import { waitFor } from "@testing-library/react";
import { expect } from "vitest";
import type { ReactNode } from "react";
import { creerClientMock, creerHorlogeManuelle, FournisseurApi } from "../infra/index";
import type { ClientMock, HorlogeManuelle, Scenario, SourceScenarios } from "../infra/index";
import { creerAppareilAgence, FournisseurAppareilAgence } from "./appareil";
import type { AppareilAgence } from "./appareil";
import { installerMockAgence } from "./mock/installer";
import type { ScenarioModifiable } from "./mock/installer";
import type { NomPlancheAgence } from "./mock/types";

/**
 * Outils des tests de l'agence : la source de scénarios que le futur composeur central fabriquera
 * (au-dessus de `@afrimove/fixtures` et de `installerMockAgence`), un client mock sans latence et
 * un appareil de guichet dont les UUID sont prévisibles.
 */

export function scenarioAgence(planche: NomPlancheAgence): ScenarioModifiable {
  const scenario: ScenarioModifiable = { nom: planche, operations: [], flux: [] };
  installerMockAgence(scenario, ecrans[planche]);
  return scenario;
}

export function sourceFixturesAgence(): SourceScenarios {
  return {
    noms: () => Object.keys(ecrans),
    instantInitial: (nom) => ecrans[nom as keyof typeof ecrans].maintenant,
    charger: (nom): Scenario => {
      const scenario: ScenarioModifiable = { nom, operations: [], flux: [] };
      installerMockAgence(scenario, ecrans[nom as keyof typeof ecrans]);
      return scenario;
    },
  };
}

/** UUID v4 prévisibles : 00000000-0000-4000-8000-000000000001, …002. */
export function uuidsSequentiels(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

export interface ContexteTest {
  client: ClientMock;
  horloge: HorlogeManuelle;
  appareil: AppareilAgence;
  wrapper: (props: { children?: ReactNode }) => ReactNode;
}

export function contexteTest(planche: NomPlancheAgence): ContexteTest {
  const ecran = ecrans[planche];
  const horloge = creerHorlogeManuelle(ecran.maintenant);
  const client = creerClientMock({
    source: sourceFixturesAgence(),
    scenario: planche,
    horloge,
    latenceMs: 0,
  });
  const appareil = creerAppareilAgence({
    appareilId: "appareil-gu2-dla",
    auteurId: "pers-joseph",
    agence: "ALP",
    gare: "DLA",
    plage: plageGuichet(2),
    horloge,
    genererUuid: uuidsSequentiels(),
  });
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <FournisseurApi client={client}>
      <FournisseurAppareilAgence appareil={appareil}>{children}</FournisseurAppareilAgence>
    </FournisseurApi>
  );
  return { client, horloge, appareil, wrapper };
}

/** Attend qu'une requête TanStack réussisse et renvoie ses données. */
export async function donnees<T>(resultat: {
  current: { isSuccess: boolean; isError: boolean; data: T | undefined; error: unknown };
}): Promise<T> {
  await waitFor(() => {
    if (resultat.current.isError) throw resultat.current.error;
    expect(resultat.current.isSuccess).toBe(true);
  });
  return resultat.current.data as T;
}
