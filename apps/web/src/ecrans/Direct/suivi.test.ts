import type { voyageur as c } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { appliquerPosition, heureDouala, idArret, numeroLisible, villeAvantBus } from "./suivi";
import { fractionsVilles, pointSurTrace, progressionBus } from "./trace";

const etape = (arret: string, statut: c.EtapeTrajet["statut"], heure = "08:00"): c.EtapeTrajet => ({
  arret,
  statut,
  heure: `2027-01-05T${heure}:00.000+01:00`,
});

const suivi: c.SuiviBus = {
  billetId: "b1",
  enDirect: true,
  compagnie: { id: "bex", nom: "Bêta Express" },
  siege: 7,
  bus: { immatriculation: "LT 412 AB" },
  villes: ["Douala", "Edéa", "Yaoundé"],
  vitesseKmh: 84,
  arrivee: {
    prevue: "2027-01-05T11:30:00.000+01:00",
    estimee: "2027-01-05T11:35:00.000+01:00",
    retardMinutes: 5,
  },
  etapes: [
    etape("Douala Akwa", "passe", "08:04"),
    etape("Edéa", "passe", "09:12"),
    etape("Pouma", "prochain", "10:05"),
    etape("Boumnyebel", "a_venir", "10:40"),
  ],
};

const message = (surcharge: Partial<c.MessagePositionBus> = {}): c.MessagePositionBus => ({
  billetId: "b1",
  instant: "2027-01-05T09:40:00.000+01:00",
  latitude: 3.9,
  longitude: 10.4,
  vitesseKmh: 72,
  arriveeEstimee: "2027-01-05T11:50:00.000+01:00",
  retardMinutes: 20,
  prochainArret: "Boumnyebel",
  ...surcharge,
});

describe("Direct · heures et numéros", () => {
  it("lit l'heure de Douala dans l'ISO de l'API", () => {
    expect(heureDouala("2027-01-05T11:35:00.000+01:00")).toBe("11:35");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("écrit un numéro camerounais par groupes, et laisse un autre numéro tel quel", () => {
    expect(numeroLisible("+237677000024")).toBe("+237 6 77 00 00 24");
    expect(numeroLisible("+33612345678")).toBe("+33612345678");
  });
});

describe("Direct · identifiant d'arrêt", () => {
  it("passe le nom de l'arrêt en identifiant sans accent ni espace", () => {
    expect(idArret("Boumnyebel")).toBe("boumnyebel");
    expect(idArret("Édéa gare")).toBe("edea-gare");
    expect(idArret(" Pouma · carrefour ")).toBe("pouma-carrefour");
  });
});

describe("Direct · message de position", () => {
  it("met à jour la vitesse, l'heure estimée, le retard et le prochain arrêt", () => {
    const apres = appliquerPosition(suivi, message());
    expect(apres.vitesseKmh).toBe(72);
    expect(apres.arrivee).toEqual({
      prevue: "2027-01-05T11:30:00.000+01:00",
      estimee: "2027-01-05T11:50:00.000+01:00",
      retardMinutes: 20,
    });
    expect(apres.etapes.map((e) => e.statut)).toEqual(["passe", "passe", "passe", "prochain"]);
  });

  it("ramène en arrière les arrêts quand le prochain arrêt est plus tôt", () => {
    const apres = appliquerPosition(suivi, message({ prochainArret: "Edéa" }));
    expect(apres.etapes.map((e) => e.statut)).toEqual(["passe", "prochain", "a_venir", "a_venir"]);
  });

  it("garde les arrêts quand le message n'en nomme pas ou nomme un arrêt inconnu", () => {
    const sans = { ...message() };
    delete sans.prochainArret;
    expect(appliquerPosition(suivi, sans).etapes).toEqual(suivi.etapes);
    expect(appliquerPosition(suivi, message({ prochainArret: "Ailleurs" })).etapes).toEqual(
      suivi.etapes,
    );
  });

  it("ne change rien sans message", () => {
    expect(appliquerPosition(suivi, undefined)).toBe(suivi);
  });
});

describe("Direct · carte", () => {
  it("nomme la ville après laquelle se trouve le bus", () => {
    expect(villeAvantBus(suivi)).toBe("Edéa");
    expect(
      villeAvantBus({ villes: suivi.villes, etapes: [etape("Douala Akwa", "prochain")] }),
    ).toBe("Douala");
    expect(villeAvantBus({ villes: [], etapes: [] })).toBe("");
  });

  it("place le bus à la hauteur du prochain arrêt, répartis régulièrement sur la route", () => {
    expect(progressionBus(["passe", "passe", "prochain", "a_venir"])).toBeCloseTo(2 / 3);
    expect(progressionBus(["prochain", "a_venir", "a_venir"])).toBe(0);
    expect(progressionBus(["a_venir", "a_venir"])).toBe(0);
    expect(progressionBus(["passe", "passe", "passe"])).toBe(1);
    expect(progressionBus(["passe"])).toBe(0);
  });

  it("garde le bus de la planche près du point dessiné dans la maquette (262, 150)", () => {
    const { x, y } = pointSurTrace(2 / 3);
    expect(Math.hypot(x - 262, y - 150)).toBeLessThan(5);
  });

  it("pose les villes aux extrémités de la route, celle du milieu sur le nœud de la maquette", () => {
    expect(pointSurTrace(0)).toEqual({ x: 40, y: 300 });
    const fin = pointSurTrace(1);
    expect(fin.x).toBeCloseTo(352);
    expect(fin.y).toBeCloseTo(52);
    const [debut, milieu, arrivee] = fractionsVilles(3);
    expect([debut, arrivee]).toEqual([0, 1]);
    const noeud = pointSurTrace(milieu!);
    expect(noeud.x).toBeCloseTo(165, 1);
    expect(noeud.y).toBeCloseTo(235, 1);
    expect(fractionsVilles(2)).toEqual([0, 1]);
    expect(fractionsVilles(5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(fractionsVilles(0)).toEqual([]);
  });
});
