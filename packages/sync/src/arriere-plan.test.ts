import { plageGuichet } from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import {
  BALISE_SYNCHRO,
  brancherSynchroServiceWorker,
  demanderSynchroArrierePlan,
  synchroArrierePlanDisponible,
  traiterEvenementSync,
} from "./arriere-plan";
import type { EvenementSyncSW } from "./arriere-plan";
import { MoteurSync } from "./moteur";
import { reseauManuel } from "./reseau";
import {
  DEBUT_TEST,
  HorlogeManuelle,
  ServeurFactice,
  VENTE,
  donneesVente,
  indexedDbFactice,
} from "./testing";

describe("Background Sync", () => {
  it("demande la synchronisation en arrière-plan quand le navigateur sait le faire", async () => {
    const balises: string[] = [];
    const enregistrement = { sync: { register: async (b: string) => void balises.push(b) } };
    expect(synchroArrierePlanDisponible(enregistrement)).toBe(true);
    expect(await demanderSynchroArrierePlan(enregistrement)).toBe(true);
    expect(balises).toEqual([BALISE_SYNCHRO]);
  });

  it("repli silencieux sans Background Sync (Safari, Firefox) ou si l'enregistrement échoue", async () => {
    expect(synchroArrierePlanDisponible({})).toBe(false);
    expect(await demanderSynchroArrierePlan({})).toBe(false);
    expect(await demanderSynchroArrierePlan(undefined)).toBe(false);
    const casse = {
      sync: {
        register: async () => {
          throw new Error("refusé");
        },
      },
    };
    expect(await demanderSynchroArrierePlan(casse)).toBe(false);
  });

  describe("service worker", () => {
    async function preparer() {
      const horloge = new HorlogeManuelle(DEBUT_TEST);
      const reseau = reseauManuel(false);
      const serveur = new ServeurFactice({ horloge });
      const dexie = indexedDbFactice();
      const options = {
        appareilId: "appareil-g2",
        auteurId: "pers-joseph",
        agence: "ALP",
        gare: "DLA",
        plage: plageGuichet(2),
        transport: serveur,
        horloge,
        reseau,
        dexie,
        synchroAutomatique: false,
      };
      // L'application (page) enregistre des ventes hors ligne puis se ferme.
      const page = await MoteurSync.ouvrir(options);
      await page.definirPartsHorsLigne({ d1: [1, 2, 3] });
      await page.enregistrer(VENTE, donneesVente("b1", "d1", 1));
      await page.enregistrer(VENTE, donneesVente("b2", "d1", 2));
      await page.arreter();
      return { options, reseau, serveur };
    }

    it("le service worker vide la file de l'application fermée quand le réseau revient", async () => {
      const { options, reseau, serveur } = await preparer();
      let ecoute: ((e: EvenementSyncSW) => void) | undefined;
      brancherSynchroServiceWorker(
        { addEventListener: (_type, rappel) => void (ecoute = rappel) },
        () => MoteurSync.ouvrir(options),
      );
      reseau.definir(true);
      let attente: Promise<unknown> = Promise.resolve();
      ecoute!({ tag: BALISE_SYNCHRO, waitUntil: (p) => void (attente = p) });
      await attente;
      expect(serveur.journal.map((e) => e.numeroPlage)).toEqual([1001, 1002]);
    });

    it("ignore une autre balise", async () => {
      const { options } = await preparer();
      expect(
        await traiterEvenementSync({ tag: "autre", waitUntil: () => undefined }, () =>
          MoteurSync.ouvrir(options),
        ),
      ).toBeNull();
    });

    it("échoue quand il reste des événements, pour que le navigateur réessaie", async () => {
      const { options, reseau, serveur } = await preparer();
      reseau.definir(true);
      serveur.horsService = true;
      await expect(
        traiterEvenementSync({ tag: BALISE_SYNCHRO, waitUntil: () => undefined }, () =>
          MoteurSync.ouvrir(options),
        ),
      ).rejects.toThrow(/incomplète/);
    });
  });
});
