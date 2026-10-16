import { describe, expect, it } from "vitest";
import { implementer } from "./scenarios";
import type { SourceScenarios } from "./scenarios";
import {
  ErreurAnnulee,
  ErreurHttp,
  ErreurNonImplementee,
  ErreurScenarioInconnu,
  ErreurValidation,
} from "./erreurs";
import { creerHorlogeManuelle } from "./horloge";
import { creerClientMock } from "./mock";
import { CANAL_POSITION, DEPARTS_DEMO, OP_DEPARTS, OP_RESERVER, sourceDemo } from "./exemples";

const DEBUT = "2026-10-16T05:30:00+01:00";

describe("adaptateur mock", () => {
  it("répond avec le scénario actif et valide la réponse", async () => {
    const client = creerClientMock({ source: sourceDemo(), latenceMs: 0 });
    expect(client.mode).toBe("mock");
    expect(client.scenario).toBe("defaut");
    await expect(client.executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual(DEPARTS_DEMO);
  });

  it("sélectionne le scénario demandé", async () => {
    const client = creerClientMock({ source: sourceDemo(), scenario: "vide", latenceMs: 0 });
    await expect(client.executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual([]);
  });

  it("refuse un scénario inconnu en listant les disponibles", () => {
    expect(() => creerClientMock({ source: sourceDemo(), scenario: "nimporte" })).toThrow(
      ErreurScenarioInconnu,
    );
  });

  it("garde un état propre à chaque client", async () => {
    const source = sourceDemo();
    const a = creerClientMock({ source, latenceMs: 0 });
    const b = creerClientMock({ source, latenceMs: 0 });
    await a.executer(OP_RESERVER, { departId: "d1", siege: 1 });
    const deuxieme = await a.executer(OP_RESERVER, { departId: "d1", siege: 2 });
    const premierDeB = await b.executer(OP_RESERVER, { departId: "d1", siege: 1 });
    expect(deuxieme.billetId).toBe("b2");
    expect(premierDeB.billetId).toBe("b1");
  });

  it("répond ErreurNonImplementee avec la source vide par défaut", async () => {
    const client = creerClientMock({ latenceMs: 0 });
    await expect(client.executer(OP_DEPARTS, { gare: "DLA" })).rejects.toBeInstanceOf(
      ErreurNonImplementee,
    );
  });

  it("rejette une réponse qui ne respecte pas le contrat", async () => {
    const source: SourceScenarios = {
      noms: () => ["defaut"],
      charger: (nom) => ({
        nom,
        operations: [implementer(OP_DEPARTS, () => [{ id: "x" }] as never)],
      }),
    };
    const client = creerClientMock({ source, latenceMs: 0 });
    await expect(client.executer(OP_DEPARTS, { gare: "DLA" })).rejects.toBeInstanceOf(
      ErreurValidation,
    );
  });

  it("laisse un scénario simuler une erreur serveur", async () => {
    const source: SourceScenarios = {
      noms: () => ["defaut"],
      charger: (nom) => ({
        nom,
        operations: [
          implementer(OP_RESERVER, () => {
            throw new ErreurHttp(409, "Siège déjà pris", "SIEGE_PRIS");
          }),
        ],
      }),
    };
    const client = creerClientMock({ source, latenceMs: 0 });
    await expect(client.executer(OP_RESERVER, { departId: "d1", siege: 3 })).rejects.toMatchObject({
      genre: "http",
      statut: 409,
      code: "SIEGE_PRIS",
    });
  });

  it("n'avance pas sans l'horloge : la latence simulée passe par l'horloge injectée", async () => {
    const horloge = creerHorlogeManuelle(DEBUT);
    const client = creerClientMock({
      source: sourceDemo(),
      horloge,
      latenceMs: { min: 100, max: 300 },
      alea: () => 0.5,
    });
    let resolu = false;
    const promesse = client.executer(OP_DEPARTS, { gare: "DLA" }).then((r) => {
      resolu = true;
      return r;
    });
    await horloge.avancer(199);
    expect(resolu).toBe(false);
    await horloge.avancer(1);
    await expect(promesse).resolves.toEqual(DEPARTS_DEMO);
  });

  it("annule une requête en cours de latence", async () => {
    const horloge = creerHorlogeManuelle(DEBUT);
    const client = creerClientMock({ source: sourceDemo(), horloge, latenceMs: 500 });
    const controleur = new AbortController();
    const promesse = client.executer(OP_DEPARTS, { gare: "DLA" }, { signal: controleur.signal });
    controleur.abort();
    await expect(promesse).rejects.toBeInstanceOf(ErreurAnnulee);
    expect(horloge.enAttente).toBe(0);
  });

  it("expose l'horloge du scénario, et l'horloge injectée prime", async () => {
    const duScenario = creerClientMock({ source: sourceDemo(), scenario: "depart-0530" });
    expect(duScenario.horloge.iso().startsWith("2026-10-16T05:30:0")).toBe(true);

    const injectee = creerHorlogeManuelle("2027-01-05T08:00:00+01:00");
    const client = creerClientMock({
      source: sourceDemo(),
      scenario: "depart-0530",
      horloge: injectee,
    });
    expect(client.horloge.iso()).toBe("2027-01-05T08:00:00.000+01:00");
    await injectee.avancer(90_000);
    expect(client.horloge.iso()).toBe("2027-01-05T08:01:30.000+01:00");
  });

  describe("temps réel simulé", () => {
    it("émet des messages au rythme de l'horloge et s'arrête au désabonnement", async () => {
      const horloge = creerHorlogeManuelle(DEBUT);
      const client = creerClientMock({ source: sourceDemo(), horloge, latenceMs: 0 });
      const recus: number[] = [];
      const etats: string[] = [];
      const stop = client.souscrire(CANAL_POSITION, { departId: "d1" }, (m) => recus.push(m.km), {
        surEtat: (e) => etats.push(e),
      });
      await horloge.avancer(0); // laisse le scénario se charger
      await horloge.avancer(3000);
      expect(recus).toEqual([10, 20, 30]);
      stop();
      await horloge.avancer(5000);
      expect(recus).toEqual([10, 20, 30]);
      expect(horloge.enAttente).toBe(0);
      expect(etats).toEqual(["connexion", "ouvert", "ferme"]);
    });

    it("signale un canal sans flux dans le scénario", async () => {
      const client = creerClientMock({ latenceMs: 0 });
      const erreurs: unknown[] = [];
      client.souscrire(CANAL_POSITION, { departId: "d1" }, () => {}, {
        surErreur: (e) => erreurs.push(e),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(erreurs[0]).toBeInstanceOf(ErreurNonImplementee);
    });
  });
});
