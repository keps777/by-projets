import type { voyageur as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  compagnieDeLaGare,
  departRetenu,
  formaterMontant,
  formaterNote,
  heureDouala,
  lieuCourt,
  modeInitial,
  prenom,
  prixDuMode,
  versIsoDouala,
  villeDeLaGare,
} from "./formats";

const iso = (heure: string) => `2027-01-05T${heure}:00.000+01:00`;

describe("Course · formats", () => {
  it("écrit les montants avec une espace entre les milliers et la note avec une virgule", () => {
    expect(formaterMontant(700)).toBe("700");
    expect(formaterMontant(1500)).toBe("1 500");
    expect(formaterNote(4.8)).toBe("4,8");
    expect(formaterNote(5)).toBe("5,0");
  });

  it("lit l'heure et le prénom", () => {
    expect(heureDouala(iso("07:10"))).toBe("07:10");
    expect(heureDouala("pas une date")).toBe("");
    expect(prenom("Jean K.")).toBe("Jean");
  });

  it("tire les libellés de la carte des noms de lieux", () => {
    expect(lieuCourt("Chez toi · Bonapriso")).toBe("chez toi");
    expect(compagnieDeLaGare("Gare Akwa · Bêta Express")).toBe("Bêta Express");
    expect(compagnieDeLaGare("Gare Akwa")).toBe("Gare Akwa");
    expect(villeDeLaGare("Gare Akwa · Bêta Express")).toBe("d'Akwa");
    expect(villeDeLaGare("Gare Douala · Bêta Express")).toBe("de Douala");
  });

  it("écrit un instant en heure de Douala avec le décalage du contrat", () => {
    expect(versIsoDouala(Date.parse(iso("07:08")))).toBe(iso("07:08"));
  });
});

describe("Course · heure de départ", () => {
  const proposition = {
    partirA: iso("07:10"),
    arriveeQuai: iso("07:22"),
    busA: iso("08:00"),
    trajetMinutes: 12,
    presenceQuaiMinutes: 20,
  };

  it("garde l'heure du serveur quand elle laisse le temps d'être au quai", () => {
    expect(departRetenu(proposition)).toEqual({
      partirA: iso("07:10"),
      arriveeQuai: iso("07:22"),
    });
  });

  it("garde l'heure du serveur pile au dernier départ possible", () => {
    // 08:00 - 20 min au quai - 12 min de trajet = 07:28
    expect(
      departRetenu({ ...proposition, partirA: iso("07:28"), arriveeQuai: iso("07:40") }),
    ).toEqual({
      partirA: iso("07:28"),
      arriveeQuai: iso("07:40"),
    });
  });

  it("avance le départ quand le bus part plus tôt que prévu", () => {
    // 07:40 - 20 - 12 = 07:08
    expect(departRetenu({ ...proposition, busA: iso("07:40") })).toEqual({
      partirA: iso("07:08"),
      arriveeQuai: iso("07:20"),
    });
  });

  it("avance le départ quand le trajet est plus long que prévu", () => {
    // 08:00 - 20 - 45 = 06:55
    expect(departRetenu({ ...proposition, trajetMinutes: 45, arriveeQuai: iso("07:55") })).toEqual({
      partirA: iso("06:55"),
      arriveeQuai: iso("07:40"),
    });
  });
});

describe("Course · mode et prix", () => {
  const modes: contrats.PropositionCourse["modes"] = [
    { mode: "moto", libelle: "Moto", prix: 700, choisi: false },
    { mode: "taxi", libelle: "Taxi", prix: 1500, choisi: true },
    { mode: "avec_valises", libelle: "Avec 2 valises", choisi: false },
  ];

  it("prend le mode coché par le serveur, sinon la moto", () => {
    expect(modeInitial(modes)).toBe("taxi");
    expect(modeInitial(modes.map((m) => ({ ...m, choisi: false })))).toBe("moto");
  });

  it("prend le prix propre du mode, sinon celui de la proposition", () => {
    const p = { modes, prix: 700 } as contrats.PropositionCourse;
    expect(prixDuMode(p, "taxi")).toBe(1500);
    expect(prixDuMode(p, "avec_valises")).toBe(700);
  });
});
