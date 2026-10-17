import { describe, expect, it } from "vitest";
import { ActionAssistantSchema, GraphiqueReponseSchema, ReponseAssistantSchema } from "./assistant";

describe("assistant : ajouts compatibles", () => {
  const reponse = {
    question: "Pourquoi Bafoussam baisse ?",
    repondueA: "2027-01-05T07:38:00.000+01:00",
    dureeSecondes: 4,
    resume: "Bafoussam fait − 14 %.",
    points: ["1. Les mercredis."],
    actions: [{ id: "voir-ligne", libelle: "Voir la ligne", type: "voir_ligne" }],
    sources: null,
    simulation: null,
  };

  it("une réponse sans graphique ni ligneId reste valide (ajouts facultatifs)", () => {
    expect(ReponseAssistantSchema.safeParse(reponse).success).toBe(true);
  });

  it("l'action porte sa ligne et la réponse son graphique", () => {
    const complete = {
      ...reponse,
      actions: [{ ...reponse.actions[0]!, ligneId: "ligne-dla-baf" }],
      graphique: { valeurs: [80, 42, 100], joursEnEcart: [2] },
    };
    const lue = ReponseAssistantSchema.parse(complete);
    expect(lue.actions[0]!.ligneId).toBe("ligne-dla-baf");
    expect(lue.graphique).toEqual({ valeurs: [80, 42, 100], joursEnEcart: [2] });
  });

  it("le graphique refuse un remplissage hors de 0-100, un rang nul et un champ inconnu", () => {
    expect(GraphiqueReponseSchema.safeParse({ valeurs: [101], joursEnEcart: [] }).success).toBe(
      false,
    );
    expect(GraphiqueReponseSchema.safeParse({ valeurs: [-1], joursEnEcart: [] }).success).toBe(
      false,
    );
    expect(GraphiqueReponseSchema.safeParse({ valeurs: [50], joursEnEcart: [0] }).success).toBe(
      false,
    );
    expect(
      GraphiqueReponseSchema.safeParse({ valeurs: [50], joursEnEcart: [], extra: 1 }).success,
    ).toBe(false);
  });

  it("ligneId ne peut pas être vide", () => {
    expect(
      ActionAssistantSchema.safeParse({ id: "a", libelle: "x", type: "voir_ligne", ligneId: "" })
        .success,
    ).toBe(false);
  });
});
