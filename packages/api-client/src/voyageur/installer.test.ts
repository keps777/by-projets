import { describe, expect, it } from "vitest";
import { ecrans } from "@afrimove/fixtures";
import type { NomPlanche } from "@afrimove/fixtures";
import { ErreurScenarioInconnu } from "../infra/erreurs";
import { creerClientMock } from "../infra/mock";
import { sourceVoyageur } from "./outilsTest";
import * as operations from "./operations";
import * as operationsServices from "./operationsServices";
import { appliquerMessagePlan } from "./planSieges";
import { estPlancheVoyageur, installerMockVoyageur, PLANCHES_VOYAGEUR } from "./index";
import type { voyageur as c } from "@afrimove/contrats";

const ecran = (nom: string) => ecrans[nom as NomPlanche];

describe("installerMockVoyageur", () => {
  it("refuse une planche qui n'est pas de l'app voyageur", () => {
    expect(estPlancheVoyageur("Guichet")).toBe(false);
    expect(() => installerMockVoyageur("Guichet", ecran("Guichet"))).toThrow(ErreurScenarioInconnu);
  });

  it("refuse des données qui ne sont pas celles du scénario demandé", () => {
    expect(() => installerMockVoyageur("Main", ecran("Pass"))).toThrow(/ne correspond pas/);
  });

  it("construit un scénario pour chacune des planches voyageur", () => {
    for (const nom of PLANCHES_VOYAGEUR) {
      const scenario = installerMockVoyageur(nom, ecran(nom));
      expect(scenario.nom).toBe(nom);
      expect(scenario.operations.length, nom).toBeGreaterThan(0);
      const noms = scenario.operations.map((o) => o.operation.nom);
      expect(new Set(noms).size, `${nom} : opérations en double`).toBe(noms.length);
      expect(
        noms.every((n) => n.startsWith("voyageur.")),
        nom,
      ).toBe(true);
    }
  });

  it("chaque opération et chaque canal de l'API voyageur est servi par au moins une planche", () => {
    const declarees = new Set<string>();
    const declareesCanaux = new Set<string>();
    for (const exporte of [...Object.values(operations), ...Object.values(operationsServices)]) {
      if (typeof exporte !== "object" || exporte === null) continue;
      const nom = (exporte as { nom: string }).nom;
      if ("methode" in exporte) declarees.add(nom);
      else if ("message" in exporte) declareesCanaux.add(nom);
    }
    const servies = new Set<string>();
    const serviesCanaux = new Set<string>();
    for (const nom of PLANCHES_VOYAGEUR) {
      const s = installerMockVoyageur(nom, ecran(nom));
      for (const o of s.operations) servies.add(o.operation.nom);
      for (const f of s.flux ?? []) serviesCanaux.add(f.canal.nom);
    }
    expect([...declarees].filter((n) => !servies.has(n))).toEqual([]);
    expect([...declareesCanaux].filter((n) => !serviesCanaux.has(n))).toEqual([]);
    expect(declarees.size).toBeGreaterThan(40);
  });

  it("garde un état neuf à chaque installation", async () => {
    const source = sourceVoyageur();
    const a = creerClientMock({ source, scenario: "Pass", latenceMs: 0 });
    const b = creerClientMock({ source, scenario: "Pass", latenceMs: 0 });
    const id = "billet-bex-dla-270105-0142";
    await a.executer(operations.OP_ANNULER_BILLET, { billetId: id });
    expect((await a.executer(operations.OP_BILLET, { billetId: id })).etat).toBe("annule");
    expect((await b.executer(operations.OP_BILLET, { billetId: id })).etat).toBe("paye");
  });

  it("répond non implémenté aux opérations d'une autre planche", async () => {
    const client = creerClientMock({ source: sourceVoyageur(), scenario: "Reseau", latenceMs: 0 });
    await expect(client.executer(operations.OP_BILLET, { billetId: "x" })).rejects.toMatchObject({
      genre: "non_implemente",
    });
  });
});

describe("appliquerMessagePlan", () => {
  const plan: c.PlanSiegesVue = {
    departId: "d1",
    capacite: 3,
    sieges: [
      { numero: 1, etat: "libre" },
      { numero: 2, etat: "pris" },
      { numero: 3, etat: "libre" },
    ],
    libres: 2,
    versionPlan: 4,
  };

  it("remplace la vue par un instantané plus récent, ignore un plus ancien", () => {
    const recent = { ...plan, versionPlan: 5 };
    expect(appliquerMessagePlan(plan, { type: "plan", plan: recent })).toBe(recent);
    expect(appliquerMessagePlan(plan, { type: "plan", plan: { ...plan, versionPlan: 3 } })).toBe(
      plan,
    );
    expect(appliquerMessagePlan(undefined, { type: "plan", plan })).toBe(plan);
  });

  it("applique un changement de siège et recompte les places libres", () => {
    const apres = appliquerMessagePlan(plan, {
      type: "siege",
      departId: "d1",
      siege: 1,
      etat: "pris",
      versionPlan: 5,
    });
    expect(apres?.sieges[0]?.etat).toBe("pris");
    expect(apres?.libres).toBe(1);
    expect(apres?.versionPlan).toBe(5);
  });

  it("suit le siège que je bloque, puis le libère", () => {
    const bloque = appliquerMessagePlan(plan, {
      type: "siege",
      departId: "d1",
      siege: 3,
      etat: "a_moi",
      jusqua: "2027-01-05T07:53:00.000+01:00",
      versionPlan: 5,
    });
    expect(bloque?.mon).toEqual({
      departId: "d1",
      siege: 3,
      jusqua: "2027-01-05T07:53:00.000+01:00",
    });
    const libere =
      bloque &&
      appliquerMessagePlan(bloque, {
        type: "siege",
        departId: "d1",
        siege: 3,
        etat: "libre",
        versionPlan: 6,
      });
    expect(libere?.mon).toBeUndefined();
  });

  it("ignore un message ancien, d'un autre départ ou reçu sans plan", () => {
    const ancien = {
      type: "siege",
      departId: "d1",
      siege: 1,
      etat: "pris",
      versionPlan: 4,
    } as const;
    expect(appliquerMessagePlan(plan, ancien)).toBe(plan);
    expect(appliquerMessagePlan(plan, { ...ancien, departId: "d2", versionPlan: 9 })).toBe(plan);
    expect(appliquerMessagePlan(undefined, { ...ancien, versionPlan: 9 })).toBeUndefined();
  });
});
