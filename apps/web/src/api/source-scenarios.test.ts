import {
  ErreurHttp,
  SCENARIO_PAR_DEFAUT,
  colis,
  creerClientMock,
  implementer,
} from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";
import { describe, expect, it } from "vitest";
import { replierSur404, sourceScenariosFixtures } from "./source-scenarios";

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

  it("le colis de la notification de l'accueil se lit depuis l'accueil (scénario Main), pas seulement depuis son suivi", async () => {
    const colisId = ecrans.Main.donnees.notificationColis._colisId;
    for (const scenario of ["Main", SCENARIO_PAR_DEFAUT, "ColisEnvoi", "Direct"]) {
      const client = creerClientMock({ source, scenario, latenceMs: 0 });
      const vue = await client.executer(colis.OP_COLIS, { colisId });
      expect(vue.id).toBe(colisId);
      expect(vue.retrait.code).toBeTruthy();
    }
  });

  it("un colis inconnu reste « introuvable » (404) dans tous les scénarios", async () => {
    const client = creerClientMock({ source, scenario: "Main", latenceMs: 0 });
    await expect(
      client.executer(colis.OP_COLIS, { colisId: "colis-inconnu" }),
    ).rejects.toMatchObject({
      statut: 404,
    });
  });
});

describe("replierSur404", () => {
  const sonde = colis.OP_COLIS;
  const reponse = (id: string) => ({ id }) as never;
  const ctx = {} as never;

  it("passe à l'implémentation suivante sur une 404, rend la première réponse trouvée", async () => {
    const [impl] = replierSur404([
      implementer(sonde, () => {
        throw new ErreurHttp(404, "non", "colis_introuvable");
      }),
      implementer(sonde, () => reponse("b")),
      implementer(sonde, () => reponse("c")),
    ]);
    await expect(
      (impl!.repondre as (p: never, c: never) => unknown)({} as never, ctx),
    ).resolves.toEqual({
      id: "b",
    });
  });

  it("ne masque pas une autre erreur : elle est rendue sans essayer la suivante", async () => {
    let essais = 0;
    const [impl] = replierSur404([
      implementer(sonde, () => {
        throw new ErreurHttp(409, "conflit", "conflit");
      }),
      implementer(sonde, () => {
        essais += 1;
        return reponse("b");
      }),
    ]);
    await expect(
      (impl!.repondre as (p: never, c: never) => unknown)({} as never, ctx),
    ).rejects.toMatchObject({
      statut: 409,
    });
    expect(essais).toBe(0);
  });

  it("garde une seule implémentation par opération, à la place de la première", () => {
    const autre = implementer(colis.OP_RECLAMER_COLIS, () => ({}) as never);
    const resultat = replierSur404([
      implementer(sonde, () => reponse("a")),
      autre,
      implementer(sonde, () => reponse("b")),
    ]);
    expect(resultat.map((o) => o.operation.nom)).toEqual([sonde.nom, colis.OP_RECLAMER_COLIS.nom]);
    expect(resultat[1]).toBe(autre);
  });
});
