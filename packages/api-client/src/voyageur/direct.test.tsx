// @vitest-environment jsdom
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurValidation } from "../infra/erreurs";
import { creerClientMock } from "../infra/mock";
import { implementer } from "../infra/scenarios";
import {
  OP_CHAUFFEUR_BUS,
  OP_COLIS_DU_BILLET,
  OP_NE_PLUS_PREVENIR_PROCHE,
  OP_SIGNALER_TRAJET,
  SchemaMotifSignalement,
  SchemaSignalementEnvoye,
  useChauffeurBus,
  useColisDuBillet,
  useNePlusPrevenirProche,
  useSignalerTrajet,
} from "./direct";
import { usePrevenirProche, useSuiviBus } from "./hooks";
import { clientPour, donnees, rendreHooks, sourceVoyageur } from "./outilsTest";

afterEach(cleanup);

describe("compléments de la planche Direct (mock)", () => {
  it("ne plus prévenir remet le proche à « inactif » dans le suivi du bus", async () => {
    const billetId = "billet-direct";
    const { result } = await rendreHooks("Direct", () => ({
      suivi: useSuiviBus({ billetId }),
      prevenir: usePrevenirProche(),
      arreter: useNePlusPrevenirProche(),
    }));
    expect(donnees(result.current.suivi).prevenir?.actif).toBe(false);

    await act(async () => {
      await result.current.prevenir.mutateAsync({ billetId, procheId: "maman" });
    });
    await waitFor(() => expect(donnees(result.current.suivi).prevenir?.actif).toBe(true));

    let reponse: unknown;
    await act(async () => {
      reponse = await result.current.arreter.mutateAsync({ billetId, procheId: "maman" });
    });
    expect(reponse).toMatchObject({ procheId: "maman", actif: false, minutesAvantArrivee: 15 });
    await waitFor(() => expect(donnees(result.current.suivi).prevenir?.actif).toBe(false));
  });

  it("signale un trajet à la gare de départ, avec un identifiant par signalement", async () => {
    const { result } = await rendreHooks("Direct", () => ({ signaler: useSignalerTrajet() }));
    let premier: unknown;
    let second: unknown;
    await act(async () => {
      premier = await result.current.signaler.mutateAsync({ billetId: "b", motif: "retard" });
      second = await result.current.signaler.mutateAsync({ billetId: "b", motif: "incident" });
    });
    expect(premier).toMatchObject({
      id: "signalement-1",
      billetId: "b",
      motif: "retard",
      transmisA: "Douala Akwa",
    });
    expect(second).toMatchObject({ id: "signalement-2", motif: "incident" });
  });

  it("donne le chauffeur du bus et le colis du voyageur", async () => {
    const { result } = await rendreHooks("Direct", () => ({
      chauffeur: useChauffeurBus({ billetId: "b" }),
      colis: useColisDuBillet({ billetId: "b" }),
    }));
    expect(donnees(result.current.chauffeur)).toEqual({
      nom: "Mbarga",
      telephone: "+237677000024",
    });
    expect(donnees(result.current.colis)).toEqual({
      billetId: "b",
      colisId: "colis-c-dla-270105-0017",
    });
  });
});

describe("compléments de la planche Direct (contrat)", () => {
  it("décrit les routes de l'API : chemins, méthodes et corps", () => {
    expect(OP_NE_PLUS_PREVENIR_PROCHE.methode).toBe("DELETE");
    expect(OP_NE_PLUS_PREVENIR_PROCHE.chemin({ billetId: "b 1", procheId: "p/2" })).toBe(
      "/voyageur/billets/b%201/prevenir/p%2F2",
    );
    expect(OP_SIGNALER_TRAJET.methode).toBe("POST");
    expect(OP_SIGNALER_TRAJET.idempotente).toBe(false);
    expect(OP_SIGNALER_TRAJET.chemin({ billetId: "b", motif: "conduite" })).toBe(
      "/voyageur/billets/b/direct/signalements",
    );
    expect(OP_SIGNALER_TRAJET.corps?.({ billetId: "b", motif: "conduite" })).toEqual({
      motif: "conduite",
    });
    expect(OP_CHAUFFEUR_BUS.chemin({ billetId: "b" })).toBe("/voyageur/billets/b/direct/chauffeur");
    expect(OP_COLIS_DU_BILLET.chemin({ billetId: "b" })).toBe("/voyageur/billets/b/direct/colis");
  });

  it("ne connaît que trois motifs et refuse un numéro qui n'est pas international", () => {
    expect(SchemaMotifSignalement.options).toEqual(["retard", "conduite", "incident"]);
    expect(SchemaMotifSignalement.safeParse("autre").success).toBe(false);
    expect(
      SchemaSignalementEnvoye.safeParse({
        id: "s",
        billetId: "b",
        motif: "retard",
        transmisA: "Douala Akwa",
        creeA: "2027-01-05T07:38:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("valide la réponse du serveur comme une réponse HTTP", async () => {
    const source = sourceVoyageur();
    const client = creerClientMock({
      latenceMs: 0,
      scenario: "Direct",
      source: {
        ...source,
        charger: async (nom) => {
          const scenario = await source.charger(nom);
          return {
            ...scenario,
            operations: [
              implementer(OP_CHAUFFEUR_BUS, () => ({ nom: "Mbarga", telephone: "0677000024" })),
              ...scenario.operations,
            ],
          };
        },
      },
    });
    await expect(client.executer(OP_CHAUFFEUR_BUS, { billetId: "b" })).rejects.toBeInstanceOf(
      ErreurValidation,
    );
    await expect(
      clientPour("Direct").executer(OP_CHAUFFEUR_BUS, { billetId: "b" }),
    ).resolves.toMatchObject({ nom: "Mbarga" });
  });
});
