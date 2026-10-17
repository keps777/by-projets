import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ecrans } from "@afrimove/fixtures";
import { creerHorlogeManuelle } from "../infra/horloge";
import type { HorlogeManuelle } from "../infra/horloge";
import { creerClientMock } from "../infra/mock";
import type { ClientMock } from "../infra/mock";
import { FournisseurApi } from "../infra/react";
import type { Scenario, SourceScenarios } from "../infra/scenarios";
import { PLANCHES_COLIS, installerMockColis } from "./index";
import type { PlancheColis, ScenarioEnConstruction } from "./index";

/**
 * Aides de test : la source de scénarios que le composeur central écrira, réduite aux planches
 * colis et partenaires, au-dessus de `@afrimove/fixtures`.
 */
export function sourceColis(): SourceScenarios {
  return {
    noms: () => PLANCHES_COLIS,
    instantInitial: (nom) => ecrans[nom as PlancheColis].maintenant,
    charger: (nom): Scenario => {
      const scenario: ScenarioEnConstruction = { nom, operations: [], flux: [] };
      installerMockColis(scenario, ecrans[nom as PlancheColis]);
      return scenario;
    },
  };
}

export interface Banc {
  client: ClientMock;
  horloge: HorlogeManuelle;
}

/** Un client mock sur le scénario de la planche, horloge manuelle à l'heure de la planche. */
export function bancDe(planche: PlancheColis): Banc {
  const horloge = creerHorlogeManuelle(ecrans[planche].maintenant);
  const client = creerClientMock({
    source: sourceColis(),
    scenario: planche,
    latenceMs: 0,
    horloge,
  });
  return { client, horloge };
}

/** Rend un ou plusieurs hooks dans un `FournisseurApi` branché sur le client du banc. */
export function rendreHooks<T>(banc: Banc, hooks: () => T) {
  const enveloppe = ({ children }: { children?: ReactNode }) => (
    <FournisseurApi client={banc.client}>{children}</FournisseurApi>
  );
  return renderHook(hooks, { wrapper: enveloppe });
}

/** Attend qu'une valeur lue dans un hook soit définie (données chargées, message reçu) et la renvoie. */
export async function attendre<T>(lire: () => T | undefined): Promise<T> {
  let valeur: T | undefined;
  await waitFor(() => {
    valeur = lire();
    if (valeur === undefined) throw new Error("pas encore là");
  });
  return valeur as T;
}

/**
 * Exécute une écriture qui doit échouer, dans `act`, et renvoie l'erreur. (Un `act` qui rejette
 * laisse React dans un état où les rendus suivants ne se font plus : on attrape dans `act`.)
 */
export async function echec(ecriture: () => Promise<unknown>): Promise<unknown> {
  let erreur: unknown;
  await act(async () => {
    try {
      await ecriture();
    } catch (e) {
      erreur = e;
    }
  });
  if (erreur === undefined) throw new Error("Une erreur était attendue");
  return erreur;
}
