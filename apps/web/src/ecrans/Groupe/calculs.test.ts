import type { voyageur as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { describe, expect, it } from "vitest";
import {
  estMoi,
  formaterMontant,
  heureDouala,
  jourCourt,
  lienWhatsApp,
  minutesRestantes,
  nomCourt,
  plageSieges,
  siegesAPayer,
  teinteDe,
} from "./calculs";

describe("Groupe · formats", () => {
  it("groupe les milliers avec une espace, comme la planche", () => {
    expect(formaterMontant(3500)).toBe("3 500");
    expect(formaterMontant(21000)).toBe("21 000");
    expect(formaterMontant(450000)).toBe("450 000");
    expect(formaterMontant(300)).toBe("300");
  });

  it("reprend l'heure de Douala telle qu'elle est écrite dans le contrat", () => {
    expect(heureDouala("2027-01-10T07:30:00.000+01:00")).toBe("07:30");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("écrit le jour du calendrier de Douala, pas celui du navigateur", () => {
    expect(jourCourt("2027-01-10T07:30:00.000+01:00")).toBe("dim. 10 janv.");
    expect(jourCourt("2027-01-09T23:30:00.000+01:00")).toBe("sam. 9 janv.");
    expect(jourCourt("2027-12-01T00:10:00.000+01:00")).toBe("mer. 1 déc.");
    expect(jourCourt("2027-03-15T10:00:00.000+01:00")).toBe("lun. 15 mars");
    expect(jourCourt("pas une date")).toBe("");
  });

  it("raccourcit le nom de la compagnie comme la planche (« Alpha »)", () => {
    expect(nomCourt("Alpha Voyages")).toBe("Alpha");
    expect(nomCourt("Beta Express")).toBe("Beta Express");
  });

  it("reprend le texte de la planche : le départ de la démonstration part à 07:30 avec Alpha", () => {
    const { depart } = ecrans.Groupe.donnees;
    expect(depart.compagnie).toBe(`07:30 ${nomCourt("Alpha Voyages")}`);
  });
});

describe("Groupe · sièges et blocage", () => {
  it("donne le premier et le dernier siège réservés", () => {
    expect(plageSieges([11, 12, 13, 15, 16, 17])).toEqual({ premier: 11, dernier: 17 });
    expect(plageSieges([17, 3, 9])).toEqual({ premier: 3, dernier: 17 });
    expect(plageSieges([])).toBeNull();
  });

  it("compte les minutes restantes par excès et ne descend jamais sous zéro", () => {
    const maintenant = new Date("2027-01-05T07:38:00+01:00");
    expect(minutesRestantes("2027-01-05T07:53:00.000+01:00", maintenant)).toBe(15);
    expect(minutesRestantes("2027-01-05T07:47:30.000+01:00", maintenant)).toBe(10);
    expect(minutesRestantes("2027-01-05T07:38:10.000+01:00", maintenant)).toBe(1);
    expect(minutesRestantes("2027-01-05T07:38:00.000+01:00", maintenant)).toBe(0);
    expect(minutesRestantes("2027-01-05T07:30:00.000+01:00", maintenant)).toBe(0);
    expect(minutesRestantes("pas une date", maintenant)).toBe(0);
  });

  it("paie un siège pour ma part et tous les sièges pour le groupe, sans modifier la liste", () => {
    const sieges = [11, 12, 13];
    expect(siegesAPayer(sieges, false)).toEqual([11]);
    const tous = siegesAPayer(sieges, true);
    expect(tous).toEqual([11, 12, 13]);
    tous.push(99);
    expect(sieges).toEqual([11, 12, 13]);
    expect(siegesAPayer([], false)).toEqual([]);
  });
});

describe("Groupe · participants", () => {
  const avecCompte: contrats.ParticipantGroupe = {
    id: "pers-aicha",
    nom: "Aïcha",
    initiales: "AN",
    places: 1,
    statut: "paye",
  };
  const invite: contrats.ParticipantGroupe = {
    nom: "Paul K.",
    initiales: "PK",
    places: 1,
    statut: "paye",
  };

  it("reconnaît mon compte avec mon identifiant quand le profil est connu", () => {
    expect(estMoi(avecCompte, "pers-aicha")).toBe(true);
    expect(estMoi(avecCompte, "pers-autre")).toBe(false);
    expect(estMoi(invite, "pers-aicha")).toBe(false);
  });

  it("sans profil, ne reconnaît que le participant qui a un compte", () => {
    expect(estMoi(avecCompte, undefined)).toBe(true);
    expect(estMoi(invite, undefined)).toBe(false);
  });

  it("donne aux pastilles l'ambre, le bleu puis le rouge, en boucle", () => {
    expect([0, 1, 2, 3, 4].map(teinteDe)).toEqual(["ambre", "bleu", "rouge", "ambre", "bleu"]);
  });
});

describe("Groupe · partage", () => {
  it("encode le texte dans un lien WhatsApp", () => {
    const lien = lienWhatsApp("Paie ta part : https://afrimove.example/groupe/g-1 & vite");
    const url = new URL(lien);
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(
      "Paie ta part : https://afrimove.example/groupe/g-1 & vite",
    );
  });
});
