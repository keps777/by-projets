import type { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { chiffresNationaux } from "./feuilles";
import {
  ITINERAIRE,
  appliquerPosition,
  avancee,
  formaterMontant,
  formaterNote,
  formaterPoids,
  grouperCode,
  heureDouala,
  nomDestinataire,
  parcouru,
  pointLivreur,
  prenom,
  referenceCourte,
  tracer,
} from "./formats";

const livraison = {
  colisId: "colis-1",
  carte: {
    depart: { libelle: "Gare", retireLe: "x" },
    livreurMinutes: 6,
    arrivee: "Chez Maman · Tamdja",
  },
  arrivee: { libelle: "Arrive chez Maman", estimee: "2027-01-05T13:24:00.000+01:00" },
} as unknown as contrats.LivraisonColis;

describe("formats de la planche Livraison", () => {
  it("écrit les montants, notes et poids comme la planche", () => {
    expect(formaterMontant(1000)).toBe("1 000");
    expect(formaterMontant(700)).toBe("700");
    expect(formaterMontant(1234567)).toBe("1 234 567");
    expect(formaterNote(4.9)).toBe("4,9");
    expect(formaterNote(5)).toBe("5,0");
    expect(formaterPoids(2)).toBe("2");
    expect(formaterPoids(2.5)).toBe("2,5");
  });

  it("lit l'heure de Douala, groupe le code et raccourcit le numéro du colis", () => {
    expect(heureDouala("2027-01-05T13:24:00.000+01:00")).toBe("13:24");
    expect(heureDouala("n'importe quoi")).toBe("");
    expect(grouperCode("482913")).toBe("482 913");
    expect(grouperCode("12")).toBe("12");
    expect(referenceCourte("C-DLA-270105-0017")).toBe("C-…-0017");
    expect(referenceCourte("C-0017")).toBe("C-0017");
    expect(prenom("Éric T.")).toBe("Éric");
  });

  it("retrouve le nom du destinataire : colis d'abord, puis le texte de la carte", () => {
    expect(nomDestinataire(livraison, "Mama")).toBe("Mama");
    expect(nomDestinataire(livraison, null)).toBe("Maman");
    expect(nomDestinataire(livraison)).toBe("Maman");
    const adresseSeule = {
      ...livraison,
      arrivee: { ...livraison.arrivee, libelle: "Quartier Tamdja" },
    } as contrats.LivraisonColis;
    expect(nomDestinataire(adresseSeule)).toBe("Maman");
    const rien = {
      carte: { ...livraison.carte, arrivee: "Quartier Tamdja" },
      arrivee: { ...livraison.arrivee, libelle: "Quartier Tamdja" },
    } as contrats.LivraisonColis;
    expect(nomDestinataire(rien)).toBeNull();
  });

  it("prend la position du message du direct, pas celle d'un autre colis", () => {
    expect(appliquerPosition(livraison, undefined)).toEqual({
      minutes: 6,
      arriveeEstimee: "2027-01-05T13:24:00.000+01:00",
    });
    expect(
      appliquerPosition(livraison, {
        colisId: "colis-1",
        minutesRestantes: 3,
        arriveeEstimee: "a",
      }),
    ).toEqual({ minutes: 3, arriveeEstimee: "a" });
    expect(
      appliquerPosition(livraison, { colisId: "autre", minutesRestantes: 3, arriveeEstimee: "a" })
        .minutes,
    ).toBe(6);
  });

  it("garde le dernier numéro à 9 chiffres d'un numéro camerounais", () => {
    expect(chiffresNationaux("+237699401822")).toBe("699401822");
    expect(chiffresNationaux("+15145550142")).toBe("");
    expect(chiffresNationaux(undefined)).toBe("");
  });
});

describe("tracé de la carte", () => {
  it("place le livreur sur le troisième sommet de la planche à l'ouverture", () => {
    expect(pointLivreur(avancee(6, 6))).toEqual({ x: 220, y: 160 });
    expect(tracer(parcouru(avancee(6, 6)))).toBe("M330 60 L330 150 L220 160");
  });

  it("le fait avancer jusqu'à la maison quand il ne reste plus de minute", () => {
    const fin = ITINERAIRE[ITINERAIRE.length - 1]!;
    expect(pointLivreur(avancee(0, 6))).toEqual(fin);
    expect(avancee(3, 6)).toBeGreaterThan(avancee(6, 6));
    expect(avancee(1, 6)).toBeGreaterThan(avancee(3, 6));
    // Plus de minutes qu'à l'ouverture : il ne recule pas derrière le retrait.
    expect(avancee(60, 6)).toBe(avancee(6, 6));
    expect(avancee(5, 0)).toBeGreaterThanOrEqual(0);
  });

  it("reste sur l'itinéraire entre deux sommets", () => {
    const p = pointLivreur(avancee(3, 6));
    // Entre (140, 170) et (140, 245) : sur le tronçon vertical, avant la maison.
    expect(p.x).toBe(140);
    expect(p.y).toBeGreaterThan(170);
    expect(p.y).toBeLessThan(245);
  });
});
