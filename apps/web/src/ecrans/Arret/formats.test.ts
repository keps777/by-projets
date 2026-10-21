import { describe, expect, it } from "vitest";
import {
  extremitesLigne,
  formaterDelai,
  formaterMontant,
  heureDouala,
  nomAvecClasse,
  passageProche,
  placesRares,
} from "./formats";

describe("Arret · formats", () => {
  it("lit l'heure de Douala dans la date de l'API, sans passer par le fuseau de la machine", () => {
    expect(heureDouala("2027-01-05T10:05:00.000+01:00")).toBe("10:05");
    expect(heureDouala("2027-01-05T23:59:00+01:00")).toBe("23:59");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("groupe les milliers avec une espace, comme la planche", () => {
    expect(formaterMontant(4500)).toBe("4 500");
    expect(formaterMontant(2400)).toBe("2 400");
    expect(formaterMontant(350)).toBe("350");
    expect(formaterMontant(1200000)).toBe("1 200 000");
  });

  it("écrit le délai avant le passage : minutes sous l'heure, puis heures et minutes", () => {
    expect(formaterDelai(0)).toBe("0 min");
    expect(formaterDelai(14)).toBe("14 min");
    expect(formaterDelai(49)).toBe("49 min");
    expect(formaterDelai(59)).toBe("59 min");
    expect(formaterDelai(60)).toBe("1 h");
    expect(formaterDelai(79)).toBe("1 h 19");
    expect(formaterDelai(125)).toBe("2 h 05");
    expect(formaterDelai(-3)).toBe("0 min");
  });

  it("l'heure est ambre tant que le bus passe dans moins d'une heure, grise ensuite", () => {
    expect(passageProche(14)).toBe(true);
    expect(passageProche(49)).toBe(true);
    expect(passageProche(59)).toBe(true);
    expect(passageProche(60)).toBe(false);
    expect(passageProche(79)).toBe(false);
  });

  it("les places passent en rouge à partir de 2 : « 3 places » reste vert, « 1 place » est rouge", () => {
    expect(placesRares(7)).toBe(false);
    expect(placesRares(3)).toBe(false);
    expect(placesRares(2)).toBe(true);
    expect(placesRares(1)).toBe(true);
  });

  it("donne les extrémités de la ligne : ses arrêts d'abord, son libellé à défaut", () => {
    expect(extremitesLigne(["Douala", "Edéa", "Pouma", "Boumnyebel", "Yaoundé"], "x → y")).toEqual({
      depart: "Douala",
      arrivee: "Yaoundé",
    });
    expect(extremitesLigne([], "Douala → Yaoundé")).toEqual({
      depart: "Douala",
      arrivee: "Yaoundé",
    });
  });

  it("ajoute VIP au nom de la compagnie de classe VIP, une seule fois", () => {
    expect(nomAvecClasse("Bêta Express", "vip")).toBe("Bêta Express VIP");
    expect(nomAvecClasse("Bêta Express VIP", "vip")).toBe("Bêta Express VIP");
    expect(nomAvecClasse("Alpha Voyages", "classique")).toBe("Alpha Voyages");
  });
});
