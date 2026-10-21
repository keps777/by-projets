import { describe, expect, it } from "vitest";
import { DLA_BAF, DLA_YDE, AUJOURDHUI } from "../analyses/testing/montage";
import {
  depuisChoix,
  heureCitee,
  interpreter,
  jourCite,
  lignesCitees,
  normaliser,
  prixCite,
} from "./interpretation";

const LIGNES = [DLA_BAF, DLA_YDE];
const lire = (q: string) => interpreter(q, LIGNES, AUJOURDHUI);

describe("les questions de la planche sont comprises", () => {
  it("« Pourquoi Bafoussam baisse ? » : pourquoi, sur la ligne qui va à Bafoussam", () => {
    expect(lire("Pourquoi Bafoussam baisse ?")).toMatchObject({
      intention: "pourquoi_ligne",
      ligneIds: [DLA_BAF.id],
    });
  });

  it("« Quel bus coûte le plus ? »", () => {
    expect(lire("Quel bus coûte le plus ?").intention).toBe("cout_bus");
    expect(lire("quel car revient le plus cher").intention).toBe("cout_bus");
  });

  it("« Prévision de samedi » : un jour de la semaine, 6 pour samedi", () => {
    expect(lire("Prévision de samedi")).toMatchObject({
      intention: "prevision_jour",
      jourSemaine: 6,
    });
    expect(lire("combien je vais faire vendredi ?")).toMatchObject({
      intention: "prevision_jour",
      jourSemaine: 5,
    });
  });

  it("« Et si je baisse à 3 500 moi aussi ? » : un prix, 3 500 F", () => {
    expect(lire("Et si je baisse à 3 500 moi aussi ?")).toMatchObject({
      intention: "et_si_prix",
      prix: 3_500,
      heure: null,
    });
  });

  it("« Où part mon argent ? » : les fuites", () => {
    expect(lire("Où part mon argent ? Je perds combien ?").intention).toBe("ou_part_argent");
    expect(lire("Y a-t-il des écarts de caisse ?").intention).toBe("ou_part_argent");
  });
});

describe("variantes de français", () => {
  it("ignore les accents, la casse et la ponctuation", () => {
    expect(normaliser("  Pourquoi DOUALA → Yaoundé, ça BAISSE ?! ")).toBe(
      "pourquoi douala yaounde ca baisse",
    );
    expect(lire("POURQUOI YAOUNDÉ BAISSE").ligneIds).toEqual([DLA_YDE.id]);
  });

  it("un prix s'écrit de plusieurs façons : 3500, 3 500, 3.500, 4 000 francs", () => {
    for (const q of [
      "et si je baisse à 3500",
      "et si je baisse à 3 500 f",
      "et si je passe à 3.500",
    ]) {
      expect(lire(q).prix).toBe(3_500);
    }
    expect(prixCite(normaliser("à 4 000 francs"))).toBe(4_000);
    expect(prixCite(normaliser("à 12"))).toBeNull();
  });

  it("une heure s'écrit 10h, 10h30, 10:00 et n'est pas confondue avec un prix", () => {
    expect(heureCitee(normaliser("le 10h"))).toBe("10:00");
    expect(heureCitee(normaliser("le 10h30"))).toBe("10:30");
    expect(heureCitee(normaliser("le 09:15"))).toBe("09:15");
    expect(heureCitee(normaliser("a 3 500 f"))).toBeNull();
    const q = lire("Et si je baisse le 10:00 à 3 500 ?");
    expect(q).toMatchObject({ intention: "et_si_prix", heure: "10:00", prix: 3_500 });
  });

  it("« demain » et « aujourd'hui » donnent le jour de la semaine (le 5 janvier 2027 est un mardi)", () => {
    expect(jourCite("demain", AUJOURDHUI)).toBe(3);
    expect(jourCite(normaliser("aujourd'hui"), AUJOURDHUI)).toBe(2);
    expect(jourCite("rien", AUJOURDHUI)).toBeNull();
  });

  it("deux lignes possibles : la question est ambiguë, pas devinée", () => {
    const r = lire("Pourquoi Douala baisse ?");
    expect(r.intention).toBe("ambigue");
    expect(r.ligneIds.sort()).toEqual([DLA_BAF.id, DLA_YDE.id].sort());
    // Le nom complet lève le doute.
    expect(lire("Pourquoi Douala → Bafoussam baisse ?")).toMatchObject({
      intention: "pourquoi_ligne",
      ligneIds: [DLA_BAF.id],
    });
  });

  it("une question hors sujet est inconnue, une question sans ligne n'est pas « pourquoi »", () => {
    expect(lire("Quelle est la capitale du Cameroun ?").intention).toBe("inconnue");
    expect(lire("Pourquoi ?").intention).toBe("inconnue");
    expect(lignesCitees("bonjour", LIGNES)).toEqual([]);
  });
});

describe("ce que le modèle propose est revérifié", () => {
  const choix = {
    intention: "pourquoi_ligne" as const,
    ligne: "Douala → Bafoussam",
    heure: null,
    jourSemaine: null,
    prix: null,
  };

  it("un choix complet devient une interprétation", () => {
    expect(depuisChoix(choix, LIGNES)).toEqual({
      intention: "pourquoi_ligne",
      ligneIds: [DLA_BAF.id],
      heure: null,
      jourSemaine: null,
      prix: null,
    });
  });

  it("une ligne qui n'existe pas, un jour hors 0-6, une heure ou un prix absurdes sont écartés", () => {
    expect(depuisChoix({ ...choix, ligne: "Douala → Paris" }, LIGNES)).toBeNull();
    expect(
      depuisChoix({ ...choix, intention: "prevision_jour", jourSemaine: 9 }, LIGNES),
    ).toBeNull();
    expect(
      depuisChoix({ ...choix, intention: "prevision_jour", jourSemaine: 6 }, LIGNES),
    ).toMatchObject({
      jourSemaine: 6,
    });
    expect(depuisChoix({ ...choix, intention: "et_si_prix", prix: 12 }, LIGNES)).toBeNull();
    expect(
      depuisChoix({ ...choix, intention: "et_si_prix", prix: 3_500, heure: "25:99" }, LIGNES),
    ).toMatchObject({
      heure: null,
      prix: 3_500,
    });
  });

  it("« inconnue » du modèle reste inconnue", () => {
    expect(depuisChoix({ ...choix, intention: "inconnue" }, LIGNES)).toBeNull();
  });

  it("des intentions qui ne demandent rien de plus passent telles quelles", () => {
    expect(depuisChoix({ ...choix, intention: "cout_bus", ligne: null }, LIGNES)?.intention).toBe(
      "cout_bus",
    );
    expect(
      depuisChoix({ ...choix, intention: "ou_part_argent", ligne: null }, LIGNES)?.intention,
    ).toBe("ou_part_argent");
  });
});
