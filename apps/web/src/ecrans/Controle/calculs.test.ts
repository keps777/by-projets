import { describe, expect, it } from "vitest";
import { destinationATraiter, ONGLETS, TON_A_TRAITER } from "./destinations";
import {
  DIRECT_VIDE,
  recevoir,
  salleAvecDirect,
  type ATraiter,
  type Gare,
  type SalleDeControle,
} from "./direct";
import {
  ecart,
  heureDouala,
  jourDeLaSemaine,
  jourLong,
  montantGroupe,
  quand,
  recetteCourte,
  taux,
  variation,
} from "./formats";
import { barres, reperesAxe, type HeureVentes } from "./ventes";

describe("formats de la planche", () => {
  it("recette courte : millions à deux décimales, milliers à une, sans zéro inutile", () => {
    expect(recetteCourte(2_610_000)).toBe("2,61 M");
    expect(recetteCourte(4_400_000)).toBe("4,4 M");
    expect(recetteCourte(612_000)).toBe("612 k");
    expect(recetteCourte(612_500)).toBe("612,5 k");
    expect(recetteCourte(950)).toBe("950");
    expect(recetteCourte(-310_000)).toBe("− 310 k");
  });

  it("variation et taux : vrai signe moins, espace avant le pourcentage", () => {
    expect(variation(8)).toBe("+ 8 %");
    expect(variation(-14)).toBe("− 14 %");
    expect(variation(0.7)).toBe("+ 0,7 %");
    expect(variation(0)).toBe("0 %");
    expect(taux(86)).toBe("86 %");
    expect(taux(99.8)).toBe("99,8 %");
  });

  it("écart de caisse : − 1 000, 0, + 500", () => {
    expect(ecart(-1000)).toBe("− 1 000");
    expect(ecart(0)).toBe("0");
    expect(ecart(500)).toBe("+ 500");
    expect(ecart(-1_250_000)).toBe("− 1 250 000");
  });

  it("montants par groupes de trois chiffres, avec une espace simple", () => {
    expect(montantGroupe(1_412_500)).toBe("1 412 500");
    expect(montantGroupe(902_000)).toBe("902 000");
    expect(montantGroupe(0)).toBe("0");
    expect(montantGroupe(1_412_500)).not.toMatch(/[  ]/);
  });

  it("jour et heure de Douala sans passer par le fuseau de l'appareil", () => {
    expect(heureDouala("2027-01-05T14:05:00.000+01:00")).toBe("14:05");
    expect(heureDouala("2027-01-05T23:59:59+01:00")).toBe("23:59");
    expect(jourLong("2027-01-05")).toBe("mardi 5 janvier 2027");
    expect(jourDeLaSemaine("2027-01-05")).toBe("mardi");
    expect(jourLong("pas un jour")).toBe("");
  });

  it("repère d'un élément à traiter : l'heure, hier ou la date courte", () => {
    const maintenant = "2027-01-05T14:05:00.000+01:00";
    expect(quand("2027-01-05T14:00:00.000+01:00", maintenant)).toEqual({
      genre: "heure",
      heure: "14:00",
    });
    expect(quand("2027-01-04T17:30:00.000+01:00", maintenant)).toEqual({ genre: "hier" });
    expect(quand("2027-01-02T09:00:00.000+01:00", maintenant)).toEqual({
      genre: "date",
      date: "2 janv.",
    });
  });
});

describe("ventes par heure", () => {
  const montants = [70, 100, 88, 62, 48, 40, 44, 52, 58, 30, 26, 18];
  const heures: HeureVentes[] = montants.map((montant, i) => ({
    heure: 5 + i,
    montant: montant * 1000,
    prevu: i >= 9,
  }));

  it("la hauteur suit le montant, la plus haute barre fait 100 %", () => {
    const b = barres(heures);
    expect(b.map((x) => x.hauteur)).toEqual(montants);
  });

  it("ambre : trois heures consécutives les plus fortes et l'heure qui vient de se terminer", () => {
    const tons = barres(heures).map((x) => x.ton);
    expect(tons).toEqual([
      "pic",
      "pic",
      "pic",
      "normal",
      "normal",
      "normal",
      "normal",
      "normal",
      "pic",
      "prevu",
      "prevu",
      "prevu",
    ]);
  });

  it("le pic suit les données : un pic de milieu de journée est repéré là où il est", () => {
    const autres = [10, 20, 30, 90, 100, 80, 20, 10].map(
      (montant, i): HeureVentes => ({ heure: 5 + i, montant, prevu: false }),
    );
    const tons = barres(autres).map((x) => x.ton);
    expect(tons.slice(0, 3)).toEqual(["normal", "normal", "normal"]);
    expect(tons.slice(3, 6)).toEqual(["pic", "pic", "pic"]);
    expect(tons[7]).toBe("pic"); // la dernière heure réalisée est l'heure en cours
  });

  it("les heures prévues ne comptent pas dans le pic", () => {
    const prevus = [10, 10, 10, 100, 100, 100].map(
      (montant, i): HeureVentes => ({ heure: 5 + i, montant, prevu: i >= 3 }),
    );
    expect(barres(prevus).map((x) => x.ton)).toEqual([
      "pic",
      "pic",
      "pic",
      "prevu",
      "prevu",
      "prevu",
    ]);
  });

  it("sans vente : des barres vides, pas de division par zéro", () => {
    const zero = barres([{ heure: 5, montant: 0, prevu: false }]);
    expect(zero[0]?.hauteur).toBe(0);
    expect(barres([])).toEqual([]);
  });

  it("repères sous les barres : 05 h, 09 h, 13 h puis la fin de journée prévue", () => {
    expect(reperesAxe(heures)).toEqual([
      { heure: 5, prevu: false },
      { heure: 9, prevu: false },
      { heure: 13, prevu: false },
      { heure: 17, prevu: true },
    ]);
    expect(reperesAxe([])).toEqual([]);
  });
});

describe("destinations de la planche", () => {
  it("chaque type d'élément à traiter ouvre son écran", () => {
    expect(destinationATraiter("cloture_en_attente")).toBe("/gare");
    expect(destinationATraiter("bus_arrete")).toBe("/chauffeur");
    expect(destinationATraiter("correspondance")).toBe("/inter-agences");
    expect(destinationATraiter("proposition_assistant")).toBe("/assistant");
  });

  it("couleurs des points : ambre, rouge, bleu, vert", () => {
    expect(TON_A_TRAITER).toEqual({
      cloture_en_attente: "ambre",
      bus_arrete: "rouge",
      correspondance: "bleu",
      proposition_assistant: "vert",
    });
  });

  it("cinq vues dans l'ordre de la planche", () => {
    expect(ONGLETS.map((o) => o.planche)).toEqual([
      "Controle",
      "Analyses",
      "Comptable",
      "Config",
      "Modules",
    ]);
  });
});

describe("salle et temps réel", () => {
  const gare = (id: string, billets: number): Gare => ({
    gareId: id,
    nom: id,
    billets,
    colis: 1,
    cashAttendu: 1000,
    ecart: 0,
    prochainDepart: null,
    superviseur: { nom: "X", enLigne: true, horsLigneDepuisMinutes: null },
  });
  const element = (id: string, quandIso: string): ATraiter => ({
    id,
    type: "bus_arrete",
    texte: id,
    quand: quandIso,
  });
  const chiffres = {
    recette: 1,
    variationPct: 0,
    billets: 1,
    billetsEnLigne: 0,
    billetsEnRoute: 0,
    colis: 0,
    colisEnCorrespondance: 0,
    litiges: 0,
    remplissagePct: 0,
    departs: 0,
    departsFusionnes: 0,
    ecartsDeCaisse: { total: 0, caissesEnEcart: 0, caisses: 0 },
  };
  const salle = {
    instant: "2027-01-05T14:05:00.000+01:00",
    chiffres: { ...chiffres, billets: 612 },
    gares: [gare("a", 10), gare("b", 20)],
    aTraiter: [element("t1", "2027-01-05T14:00:00.000+01:00")],
  } as unknown as SalleDeControle;

  it("sans message, la salle est inchangée", () => {
    expect(salleAvecDirect(salle, DIRECT_VIDE)).toBe(salle);
  });

  it("les chiffres plus récents remplacent la lecture et font avancer l'heure", () => {
    const direct = recevoir(DIRECT_VIDE, {
      type: "chiffres",
      instant: "2027-01-05T14:06:00.000+01:00",
      chiffres: { ...chiffres, billets: 613 },
    });
    const resultat = salleAvecDirect(salle, direct);
    expect(resultat.chiffres.billets).toBe(613);
    expect(resultat.instant).toBe("2027-01-05T14:06:00.000+01:00");
  });

  it("des chiffres plus anciens que la lecture sont ignorés", () => {
    const direct = recevoir(DIRECT_VIDE, {
      type: "chiffres",
      instant: "2027-01-05T14:04:00.000+01:00",
      chiffres: { ...chiffres, billets: 1 },
    });
    expect(salleAvecDirect(salle, direct)).toBe(salle);
  });

  it("une gare du direct remplace la sienne, une gare inconnue s'ajoute, les autres restent", () => {
    let direct = recevoir(DIRECT_VIDE, {
      type: "gare",
      instant: "2027-01-05T14:06:00.000+01:00",
      gare: gare("b", 25),
    });
    direct = recevoir(direct, {
      type: "gare",
      instant: "2027-01-05T14:06:30.000+01:00",
      gare: gare("c", 5),
    });
    const resultat = salleAvecDirect(salle, direct);
    expect(resultat.gares.map((g) => [g.gareId, g.billets])).toEqual([
      ["a", 10],
      ["b", 25],
      ["c", 5],
    ]);
  });

  it("la dernière version d'une gare l'emporte", () => {
    let direct = recevoir(DIRECT_VIDE, {
      type: "gare",
      instant: "2027-01-05T14:06:00.000+01:00",
      gare: gare("a", 11),
    });
    direct = recevoir(direct, {
      type: "gare",
      instant: "2027-01-05T14:07:00.000+01:00",
      gare: gare("a", 12),
    });
    expect(salleAvecDirect(salle, direct).gares[0]?.billets).toBe(12);
  });

  it("un élément à traiter s'ajoute en tête une seule fois, même si la lecture le contient déjà", () => {
    const nouveau = element("t2", "2027-01-05T14:06:00.000+01:00");
    let direct = recevoir(DIRECT_VIDE, { type: "a_traiter", element: nouveau });
    direct = recevoir(direct, { type: "a_traiter", element: nouveau });
    expect(direct.aTraiter).toHaveLength(1);
    expect(salleAvecDirect(salle, direct).aTraiter.map((x) => x.id)).toEqual(["t2", "t1"]);

    const lue = { ...salle, aTraiter: [nouveau, ...salle.aTraiter] } as SalleDeControle;
    expect(salleAvecDirect(lue, direct)).toBe(lue);
  });

  it("plusieurs nouveaux éléments : le plus récent d'abord", () => {
    let direct = recevoir(DIRECT_VIDE, {
      type: "a_traiter",
      element: element("t2", "2027-01-05T14:06:00.000+01:00"),
    });
    direct = recevoir(direct, {
      type: "a_traiter",
      element: element("t3", "2027-01-05T14:09:00.000+01:00"),
    });
    expect(salleAvecDirect(salle, direct).aTraiter.map((x) => x.id)).toEqual(["t3", "t2", "t1"]);
  });
});
