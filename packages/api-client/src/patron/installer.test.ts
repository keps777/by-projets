import { ecrans } from "@afrimove/fixtures";
import { describe, expect, it } from "vitest";
import { creerClientMock } from "../infra/mock";
import { ErreurNonImplementee } from "../infra/erreurs";
import { CANAL_DIRECT_CONTROLE, CANAL_DIRECT_JOUR } from "./operations";
import * as op from "./operations";
import { PLANCHES_PATRON, estPlancheMockPatron, installerMockPatron } from "./installer";
import { clientPatron } from "./mock/testing";

const operationsDeclarees = (Object.values(op) as unknown[]).filter(
  (x): x is { nom: string; methode: string } =>
    typeof x === "object" && x !== null && "nom" in x && "methode" in x,
);
const canauxDeclares = [CANAL_DIRECT_JOUR, CANAL_DIRECT_CONTROLE];

describe("installerMockPatron(scenario, donneesScenario)", () => {
  it("implémente toutes les opérations et tous les canaux déclarés, sans doublon", () => {
    const { operations, flux } = installerMockPatron("defaut");
    const noms = operations.map((o) => o.operation.nom);
    expect(new Set(noms).size).toBe(noms.length);
    expect([...noms].sort()).toEqual(operationsDeclarees.map((o) => o.nom).sort());
    expect(flux.map((f) => f.canal.nom).sort()).toEqual(canauxDeclares.map((c) => c.nom).sort());
  });

  it("renvoie un état neuf à chaque appel (un par client)", async () => {
    const a = installerMockPatron("Modules", ecrans.Modules);
    const b = installerMockPatron("Modules", ecrans.Modules);
    expect(a.operations[0]).not.toBe(b.operations[0]);
  });

  it("accepte les 25 planches patron, avec ou sans leurs données de scénario", () => {
    for (const nom of PLANCHES_PATRON) {
      expect(estPlancheMockPatron(nom)).toBe(true);
      expect(installerMockPatron(nom, ecrans[nom]).operations.length).toBeGreaterThan(30);
      expect(installerMockPatron(nom).operations.length).toBeGreaterThan(30);
    }
    expect(estPlancheMockPatron("Guichet")).toBe(false);
    expect(estPlancheMockPatron("defaut")).toBe(false);
  });

  it("les données du scénario priment sur les fixtures pour leur propre planche", async () => {
    const modifie = {
      ...ecrans.Patron,
      donnees: {
        ...ecrans.Patron.donnees,
        jour: { ...ecrans.Patron.donnees.jour, recette: "3,2 M" },
      },
    };
    const contribution = installerMockPatron("Patron", modifie);
    const client = creerClientMock({
      latenceMs: 0,
      source: {
        noms: () => ["Patron"],
        charger: (nom) => ({ nom, operations: contribution.operations, flux: contribution.flux }),
      },
      scenario: "Patron",
    });
    expect((await client.executer(op.OP_TABLEAU_DU_JOUR, undefined)).jour.recette).toBe(3_200_000);
    // Les autres planches viennent toujours des fixtures.
    expect((await client.executer(op.OP_MODULES, undefined)).actifs).toBe(10);
  });

  it("composé avec d'autres opérations, une opération non installée reste « non implémentée »", async () => {
    const { operations, flux } = installerMockPatron("defaut");
    const client = creerClientMock({
      latenceMs: 0,
      source: {
        noms: () => ["defaut"],
        charger: (nom) => ({
          nom,
          operations: operations.filter((o) => o.operation.nom !== op.OP_MODULES.nom),
          flux,
        }),
      },
    });
    await expect(client.executer(op.OP_MODULES, undefined)).rejects.toBeInstanceOf(
      ErreurNonImplementee,
    );
    await expect(client.executer(op.OP_REGLES, undefined)).resolves.toBeDefined();
  });

  it("l'état d'un client n'affecte pas celui d'un autre", async () => {
    const premier = clientPatron("Modules");
    const second = clientPatron("Modules");
    const signature = {
      pin: "483920",
      methode: "pin",
      signeA: "2027-01-05T14:07:00.000+01:00",
    } as const;
    await premier.executer(op.OP_CHANGER_MODULE, {
      code: "relais",
      actif: false,
      portee: { type: "agence" },
      signature,
    });
    expect((await premier.executer(op.OP_MODULES, undefined)).actifs).toBe(9);
    expect((await second.executer(op.OP_MODULES, undefined)).actifs).toBe(10);
  });
});
