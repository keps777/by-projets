import { describe, expect, it } from "vitest";
import {
  actionAjouterDepart,
  actionControleInopine,
  actionDecaler,
  actionNumeroEnCadence,
  actionVoirLigne,
} from "../analyses/regles";
import { effetDe } from "./effets";

/** Mardi 5 janvier 2027, 08:00 à Douala. */
const MARDI_MATIN = new Date("2027-01-05T07:00:00.000Z");

describe("quand une proposition prend effet", () => {
  it("décaler un départ : « dès lundi », le prochain lundi à 00:00", () => {
    const decaler = actionDecaler("d1", "l1", "10:00", "09:15");
    expect(effetDe(decaler, MARDI_MATIN)).toBe("2027-01-11T00:00:00.000+01:00");
  });

  it("un lundi, « dès lundi » veut dire le lundi suivant, jamais un instant déjà passé", () => {
    const lundiSoir = new Date("2027-01-04T20:00:00.000Z");
    expect(effetDe(actionDecaler("d1", "l1", "10:00", "09:15"), lundiSoir)).toBe(
      "2027-01-11T00:00:00.000+01:00",
    );
  });

  it("ajouter un départ : la prochaine fois que ce jour arrive à cette heure", () => {
    // Mardi 08:00 : le mardi 06:00 de la semaine est passé → mardi prochain.
    expect(effetDe(actionAjouterDepart("l1", 2, "06:00", "classique"), MARDI_MATIN)).toBe(
      "2027-01-12T06:00:00.000+01:00",
    );
    // Mardi 17:00 n'est pas encore passé → aujourd'hui.
    expect(effetDe(actionAjouterDepart("l1", 2, "17:00", "classique"), MARDI_MATIN)).toBe(
      "2027-01-05T17:00:00.000+01:00",
    );
    // Un samedi : dans quatre jours.
    expect(effetDe(actionAjouterDepart("l1", 6, "17:00", "vip"), MARDI_MATIN)).toBe(
      "2027-01-09T17:00:00.000+01:00",
    );
  });

  it("contrôle inopiné et numéro obligatoire en cadence : tout de suite", () => {
    expect(effetDe(actionControleInopine("a1", "g1", 2), MARDI_MATIN)).toBe(
      "2027-01-05T08:00:00.000+01:00",
    );
    expect(effetDe(actionNumeroEnCadence("g1"), MARDI_MATIN)).toBe("2027-01-05T08:00:00.000+01:00");
    expect(effetDe(actionVoirLigne("l1"), MARDI_MATIN)).toBe("2027-01-05T08:00:00.000+01:00");
  });
});
