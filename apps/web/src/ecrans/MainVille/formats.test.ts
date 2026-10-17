import { describe, expect, it } from "vitest";
import {
  departImminent,
  heureDouala,
  inverser,
  libelleQui,
  lireDepart,
  quartier,
  texteDepart,
  typesDuFiltre,
} from "./formats";

describe("formats de l'accueil « même ville »", () => {
  it("traduit chaque filtre en types d'offre (Tout = aucun filtre)", () => {
    expect(typesDuFiltre("tout")).toBeUndefined();
    expect(typesDuFiltre("moto")).toEqual(["moto_taxi"]);
    expect(typesDuFiltre("covoit")).toEqual(["covoiturage"]);
    expect(typesDuFiltre("bus")).toEqual(["bus_ville"]);
  });

  it("lit l'heure de Douala dans l'ISO de l'API", () => {
    expect(heureDouala("2027-01-05T07:50:00.000+01:00")).toBe("07:50");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("affiche un délai jusqu'à 10 minutes, l'heure au-delà", () => {
    expect(departImminent({ departDansMinutes: 3 })).toBe(true);
    expect(departImminent({ departDansMinutes: 10 })).toBe(true);
    expect(departImminent({ departDansMinutes: 11 })).toBe(false);
    expect(departImminent({ departDansMinutes: 22 })).toBe(false);
  });

  it("garde le quartier d'un lieu", () => {
    expect(quartier("Akwa, marché central")).toBe("Akwa");
    expect(quartier("Bonabéri, carrefour Ancien Dalip")).toBe("Bonabéri");
    expect(quartier("Bonanjo")).toBe("Bonanjo");
  });

  it("ajoute « vérifiée » à un conducteur vérifié, sans le répéter ni l'ajouter à une ligne de bus", () => {
    const base = { qui: "Clarisse", verifie: true, type: "covoiturage" } as const;
    expect(libelleQui(base, "vérifiée")).toBe("Clarisse · vérifiée");
    expect(libelleQui({ ...base, qui: "Clarisse · vérifiée" }, "vérifiée")).toBe(
      "Clarisse · vérifiée",
    );
    expect(libelleQui({ ...base, verifie: false }, "vérifiée")).toBe("Clarisse");
    expect(
      libelleQui({ qui: "ligne 3 · Socatur", verifie: true, type: "bus_ville" }, "vérifiée"),
    ).toBe("ligne 3 · Socatur");
  });

  it("écrit et relit le champ Départ avec sa mention « · ma position »", () => {
    const trajet = {
      depart: "Akwa, marché central",
      arrivee: "Bonabéri",
      departSurMaPosition: true,
    };
    expect(texteDepart(trajet, "ma position")).toBe("Akwa, marché central · ma position");
    expect(texteDepart({ ...trajet, departSurMaPosition: false }, "ma position")).toBe(
      "Akwa, marché central",
    );
    expect(lireDepart("Akwa, marché central · ma position", "ma position")).toEqual({
      depart: "Akwa, marché central",
      departSurMaPosition: true,
    });
    expect(lireDepart("  Bonanjo ", "ma position")).toEqual({
      depart: "Bonanjo",
      departSurMaPosition: false,
    });
  });

  it("inverse le sens : l'arrivée devient le départ, qui n'est plus sur la position", () => {
    expect(inverser({ depart: "Akwa", arrivee: "Bonabéri", departSurMaPosition: true })).toEqual({
      depart: "Bonabéri",
      arrivee: "Akwa",
      departSurMaPosition: false,
    });
  });
});
