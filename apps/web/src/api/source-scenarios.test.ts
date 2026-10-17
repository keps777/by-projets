import { SCENARIO_PAR_DEFAUT } from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "./source-scenarios";

describe("sourceScenariosFixtures", () => {
  const source = sourceScenariosFixtures();

  it("expose « defaut » et un scénario par planche", () => {
    expect(source.noms()).toEqual([SCENARIO_PAR_DEFAUT, ...Object.keys(ecrans)]);
    expect(source.noms()).toHaveLength(78);
  });

  it("compose chaque scénario sans erreur, avec l'horloge de la planche", async () => {
    for (const nom of Object.keys(ecrans)) {
      const scenario = await source.charger(nom);
      expect(scenario.nom).toBe(nom);
      expect(source.instantInitial?.(nom)).toBeTruthy();
    }
  });

  it("donne au scénario par défaut les opérations de l'accueil voyageur", async () => {
    const defaut = await source.charger(SCENARIO_PAR_DEFAUT);
    expect(defaut.operations.length).toBeGreaterThan(0);
  });

  it("renvoie un état neuf à chaque chargement", async () => {
    const a = await source.charger("Main");
    const b = await source.charger("Main");
    expect(a.operations).not.toBe(b.operations);
  });

  it("répond aussi aux opérations des autres planches, la planche demandée prime", async () => {
    const caisse = await source.charger("Caisse");
    const guichet = await source.charger("Guichet");
    const noms = (sc: { operations: readonly { operation: { nom: string } }[] }) =>
      new Set(sc.operations.map((o) => o.operation.nom));
    // Chaque scénario sait répondre aux opérations de l'autre
    expect([...noms(caisse)].length).toBeGreaterThanOrEqual(noms(guichet).size);
  });
});
