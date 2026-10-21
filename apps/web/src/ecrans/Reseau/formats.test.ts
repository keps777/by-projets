import type { voyageur as c } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { codeDeVille, formaterMontant, heureDouala, prochainDepart } from "./formats";

const ISO = (heure: string) => `2027-01-05T${heure}:00.000+01:00`;

function depart(id: string, heure: string): c.DepartVoyageur {
  return {
    id,
    numero: id,
    compagnie: { id: "cie", nom: "Alpha Voyages" },
    classe: "classique",
    heureDepart: ISO(heure),
    prix: 3800,
    placesLibres: 10,
    presqueComplet: false,
  };
}

function ligne(prochains: string[]): c.LigneReseau {
  return {
    id: "ligne-x",
    depart: "Douala",
    arrivee: "Yaoundé",
    mode: "bus",
    prochains: prochains.map((heure) => ({ heure: ISO(heure), libelle: "Alpha" })),
    resume: "",
    prix: 3800,
    prixEstUnMinimum: true,
  };
}

describe("heureDouala", () => {
  it("garde l'heure locale de l'instant, sans convertir", () => {
    expect(heureDouala("2027-01-05T07:40:00.000+01:00")).toBe("07:40");
    expect(heureDouala("pas une date")).toBe("");
  });
});

describe("formaterMontant", () => {
  it("groupe les milliers avec une espace", () => {
    expect(formaterMontant(3800)).toBe("3 800");
    expect(formaterMontant(7000)).toBe("7 000");
    expect(formaterMontant(950)).toBe("950");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });
});

describe("codeDeVille", () => {
  it("connaît les villes du réseau et déduit le code des autres", () => {
    expect(codeDeVille("Douala")).toBe("DLA");
    expect(codeDeVille("Yaoundé")).toBe("YDE");
    expect(codeDeVille("Ngaoundéré")).toBe("NGA");
    expect(codeDeVille("Édéa")).toBe("EDE");
  });
});

describe("prochainDepart", () => {
  const departs = [depart("a", "07:00"), depart("b", "08:00"), depart("c", "08:30")];

  it("prend le départ à l'heure annoncée par le réseau", () => {
    expect(prochainDepart(ligne(["08:30", "09:30"]), departs, ISO("07:40"))?.id).toBe("c");
    expect(prochainDepart(ligne(["08:00"]), departs, ISO("07:40"))?.id).toBe("b");
  });

  it("sans heure annoncée (correspondance), prend le premier départ qui n'est pas déjà parti, quel que soit l'ordre", () => {
    const melange = [departs[2]!, departs[0]!, departs[1]!];
    expect(prochainDepart(ligne([]), melange, ISO("07:40"))?.id).toBe("b");
    expect(prochainDepart(ligne([]), melange, ISO("08:10"))?.id).toBe("c");
  });

  it("ne propose jamais un autre horaire que celui annoncé", () => {
    expect(prochainDepart(ligne(["08:10"]), departs, ISO("07:40"))).toBeUndefined();
  });

  it("ne donne rien quand tous les départs sont partis ou qu'il n'y en a pas", () => {
    expect(prochainDepart(ligne([]), departs, ISO("21:00"))).toBeUndefined();
    expect(prochainDepart(ligne(["08:00"]), [], ISO("07:40"))).toBeUndefined();
  });
});
