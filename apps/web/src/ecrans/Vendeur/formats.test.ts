import type { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  dateCourte,
  departPourClient,
  detailDepart,
  formaterMontant,
  heureDouala,
  jourDeDouala,
  jourRelatif,
  listeFrancaise,
  nomCompagnie,
  separerTrajet,
} from "./formats";

const depart = (heure: string, surcharge: Partial<contrats.DepartVendeur> = {}) =>
  ({
    departId: `dep-${heure}`,
    compagnie: "Alpha",
    classe: "classique",
    heureDepart: `2027-01-06T${heure}:00.000+01:00`,
    placesLibres: 5,
    prix: 4000,
    commission: 100,
    ...surcharge,
  }) satisfies contrats.DepartVendeur;

describe("formaterMontant", () => {
  it("sépare les milliers par une espace ordinaire", () => {
    expect(formaterMontant(150)).toBe("150");
    expect(formaterMontant(4000)).toBe("4 000");
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });
});

describe("heureDouala et dateCourte", () => {
  it("lit l'heure et le jour tels que le contrat les écrit (heure de Douala)", () => {
    expect(heureDouala("2027-01-06T08:30:00.000+01:00")).toBe("08:30");
    expect(heureDouala("n'importe quoi")).toBe("");
    expect(dateCourte("2026-12-28T00:00:00.000+01:00")).toBe("28 déc.");
    expect(dateCourte("2027-01-01")).toBe("1 janv.");
    expect(dateCourte("2027-07-14")).toBe("14 juil.");
    expect(dateCourte("2027-13-01")).toBe("");
    expect(dateCourte("hier")).toBe("");
  });
});

describe("jourRelatif", () => {
  // 5 janvier 2027, 23 h 30 à Douala = 22 h 30 UTC : le jour de Douala est bien le 5.
  const soir = new Date("2027-01-05T23:30:00+01:00");

  it("compte le jour à Douala, pas en UTC", () => {
    expect(jourDeDouala(soir)).toBe("2027-01-05");
    expect(jourDeDouala(new Date("2027-01-05T00:10:00+01:00"))).toBe("2027-01-05");
  });

  it("dit aujourd'hui, demain, ou la date", () => {
    expect(jourRelatif("2027-01-05", soir)).toEqual({ type: "aujourdhui" });
    expect(jourRelatif("2027-01-06", soir)).toEqual({ type: "demain" });
    expect(jourRelatif("2027-01-08", soir)).toEqual({ type: "date", date: "8 janv." });
    expect(jourRelatif("2027-01-04", soir)).toEqual({ type: "date", date: "4 janv." });
    // Changement de mois et d'année.
    expect(jourRelatif("2027-01-01", new Date("2026-12-31T10:00:00+01:00"))).toEqual({
      type: "demain",
    });
  });
});

describe("listeFrancaise", () => {
  it("joint avec « et » et des virgules", () => {
    expect(listeFrancaise([])).toBe("");
    expect(listeFrancaise(["Alpha"])).toBe("Alpha");
    expect(listeFrancaise(["Alpha", "Bêta"])).toBe("Alpha et Bêta");
    expect(listeFrancaise(["Alpha", "Bêta", "Gamma"])).toBe("Alpha, Bêta et Gamma");
  });
});

describe("separerTrajet", () => {
  it("coupe sur la flèche", () => {
    expect(separerTrajet("Douala → Yaoundé")).toEqual({
      origine: "Douala",
      destination: "Yaoundé",
    });
    expect(separerTrajet("Douala")).toEqual({ origine: "Douala", destination: null });
  });
});

describe("nomCompagnie", () => {
  it("ajoute VIP une seule fois, et seulement pour la classe VIP", () => {
    expect(nomCompagnie({ compagnie: "Bêta Express", classe: "vip" })).toBe("Bêta Express VIP");
    expect(nomCompagnie({ compagnie: "Bêta Express VIP", classe: "vip" })).toBe("Bêta Express VIP");
    expect(nomCompagnie({ compagnie: "Alpha Voyages", classe: "classique" })).toBe("Alpha Voyages");
  });
});

describe("detailDepart", () => {
  it("met la phrase du paiement sur le premier départ à la commission par défaut", () => {
    expect(detailDepart({ commission: 100 }, 0, 100)).toEqual({ type: "paiement" });
  });

  it("écrit la commission dès qu'elle diffère de celle par défaut, ou que ce n'est pas le premier départ", () => {
    expect(detailDepart({ commission: 150 }, 0, 100)).toEqual({ type: "commission", montant: 150 });
    expect(detailDepart({ commission: 100 }, 1, 100)).toEqual({ type: "commission", montant: 100 });
  });
});

describe("departPourClient", () => {
  const departs = [depart("08:30"), depart("08:00"), depart("14:05")];

  it("prend le départ dont l'heure est dans la proposition", () => {
    expect(departPourClient(departs, "vendredi 08:00")?.departId).toBe("dep-08:00");
    expect(departPourClient(departs, "samedi 14:05")?.departId).toBe("dep-14:05");
  });

  it("complète une heure sur un chiffre", () => {
    expect(departPourClient([depart("08:30"), depart("07:15")], "lundi 7:15")?.departId).toBe(
      "dep-07:15",
    );
  });

  it("retombe sur le premier départ sans proposition, sans heure ou avec une heure inconnue", () => {
    expect(departPourClient(departs, null)?.departId).toBe("dep-08:30");
    expect(departPourClient(departs, "vendredi")?.departId).toBe("dep-08:30");
    expect(departPourClient(departs, "vendredi 23:15")?.departId).toBe("dep-08:30");
  });

  it("ne rend rien quand il n'y a aucun départ", () => {
    expect(departPourClient([], "vendredi 08:30")).toBeUndefined();
  });
});
