import { describe, expect, expectTypeOf, it } from "vitest";
import { COMPAGNIE } from "../analyses/testing/montage";
import type { AssistantRapport } from "../rapport/ports";
import { AssistantRapportMoteur } from "./assistant-rapport";
import { monterAssistant, peuplerBafoussam } from "./testing/montage";

function moteur() {
  const m = monterAssistant();
  peuplerBafoussam(m);
  return { m, rapport: new AssistantRapportMoteur(m.service) };
}

describe("AssistantRapportMoteur", () => {
  it("est compatible avec le port AssistantRapport du module rapport (useExisting)", () => {
    expectTypeOf<AssistantRapportMoteur>().toExtend<AssistantRapport>();
    expectTypeOf<Parameters<AssistantRapportMoteur["suggerer"]>[0]>().toEqualTypeOf<
      Parameters<AssistantRapport["suggerer"]>[0]
    >();
    expectTypeOf<Awaited<ReturnType<AssistantRapportMoteur["suggerer"]>>>().toEqualTypeOf<
      Awaited<ReturnType<AssistantRapport["suggerer"]>>
    >();
  });

  it("sans départ faible ce soir, il ne suggère rien", async () => {
    const { rapport } = moteur();
    expect(
      await rapport.suggerer({ compagnieId: COMPAGNIE, jour: "2027-01-04", departFaible: null }),
    ).toBeNull();
  });

  it("explique le départ faible avec les chiffres de la compagnie et le concurrent public", async () => {
    const { rapport } = moteur();
    const r = await rapport.suggerer({
      compagnieId: COMPAGNIE,
      jour: "2027-01-04",
      departFaible: { heure: "10:00", remplissagePct: 42 },
    });
    expect(r).not.toBeNull();
    expect(r!.question).toBe("Pourquoi le 10:00 part si vide ?");
    expect(r!.reponse).toMatch(
      /^Le 10:00 de Douala → Bafoussam remplit à \d+ % en moyenne sur 30 jours/,
    );
    expect(r!.reponse).toContain("part à 09:30 à 3 500 F");
    expect(r!.reponse).toContain("500 F de moins que toi");
    expect(r!.reponse).toMatch(/Le 4 janv\., il est parti à 42 %\.$/);
  });

  it("n'invente rien pour une heure sans départ, ni pour une compagnie sans données", async () => {
    const { rapport } = moteur();
    expect(
      await rapport.suggerer({
        compagnieId: COMPAGNIE,
        jour: "2027-01-04",
        departFaible: { heure: "03:33", remplissagePct: 10 },
      }),
    ).toBeNull();
    expect(
      await rapport.suggerer({
        compagnieId: "autre-compagnie",
        jour: "2027-01-04",
        departFaible: { heure: "10:00", remplissagePct: 10 },
      }),
    ).toBeNull();
  });
});
