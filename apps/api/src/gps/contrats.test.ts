import { agence, voyageur } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ETATS_DEPART } from "../billetterie/regles";
import { ROLES } from "../socle/auth/roles";
import { ETATS_DEPART_GPS } from "./modeles";
import { lireDemandeMontee, lireLotPositions, lirePosition, lirePrevenirProche } from "./schemas";
import { DonneesInvalides, isoDouala, latitude, longitude, lire, type Lecteur } from "./validation";

/**
 * L'API lit les corps avec de petits lecteurs (elle ne peut pas importer zod ni les contrats à
 * l'exécution). Ce test les confronte aux schémas zod de `@afrimove/contrats` : sur une série de
 * valeurs limites, le lecteur doit accepter et refuser exactement ce que le schéma accepte et
 * refuse. Seule différence voulue : le lecteur borne `minutesAvantArrivee` à 120 (le contrat
 * accepte tout entier positif) ; les valeurs de test restent sous cette borne.
 */

interface Schema {
  safeParse(valeur: unknown): { success: boolean };
}

const accepte = <T>(lecteur: Lecteur<T>, valeur: unknown): boolean => {
  try {
    lire(lecteur, valeur);
    return true;
  } catch (e) {
    if (e instanceof DonneesInvalides) return false;
    throw e;
  }
};

const VALEURS: unknown[] = [
  null,
  undefined,
  true,
  0,
  1,
  -1,
  1.5,
  15,
  90,
  -90,
  90.0001,
  -90.0001,
  180,
  -180,
  180.5,
  -181,
  NaN,
  Infinity,
  "",
  "x",
  "4.05",
  "2026-11-02T09:00:00+01:00",
  "2026-11-02T09:00:00.123+01:00",
  "2026-11-02T09:00:00Z",
  "2026-11-02T09:00:00+02:00",
  "2026-11-02 09:00:00+01:00",
  [],
  {},
];

function memeVerdict<T>(lecteur: Lecteur<T>, schema: Schema, valeurs = VALEURS) {
  for (const v of valeurs) {
    expect(accepte(lecteur, v), `valeur ${String(JSON.stringify(v))}`).toBe(
      schema.safeParse(v).success,
    );
  }
}

describe("lecteurs et contrats", () => {
  it("latitude, longitude et heure ISO : mêmes verdicts que le contrat de position GPS", () => {
    memeVerdict(latitude, agence.SchemaPositionGps.shape.latitude);
    memeVerdict(longitude, agence.SchemaPositionGps.shape.longitude);
    memeVerdict(isoDouala, voyageur.SchemaIsoDouala);
  });

  it("prévenir un proche : même corps que le contrat, sans le billet (dans l'adresse)", () => {
    const schema = voyageur.SchemaActiverPrevenirProche.omit({ billetId: true });
    const corps: unknown[] = [
      { procheId: "p1" },
      { procheId: "p1", minutesAvantArrivee: 15 },
      { procheId: "p1", minutesAvantArrivee: 1 },
      { procheId: "p1", minutesAvantArrivee: 0 },
      { procheId: "p1", minutesAvantArrivee: -5 },
      { procheId: "p1", minutesAvantArrivee: 1.5 },
      { procheId: "p1", minutesAvantArrivee: "15" },
      { procheId: "p1", minutesAvantArrivee: null },
      { procheId: "" },
      { procheId: 3 },
      {},
      null,
      [],
      "p1",
      { procheId: "p1", autre: "ignoré" },
    ];
    memeVerdict(lirePrevenirProche, schema, corps);
  });

  it("une position envoyée : les champs communs avec le contrat de position GPS", () => {
    const schema = agence.SchemaPositionGps.extend({ instant: voyageur.SchemaIsoDouala });
    const base = {
      instant: "2026-11-02T09:00:00+01:00",
      latitude: 4.05,
      longitude: 9.7,
      precisionM: 12,
    };
    const variantes: unknown[] = [
      base,
      { ...base, latitude: 91 },
      { ...base, latitude: -91 },
      { ...base, longitude: 181 },
      { ...base, longitude: "9.7" },
      { ...base, instant: "2026-11-02T09:00:00Z" },
      { ...base, instant: undefined },
      { ...base, precisionM: -1 },
      { ...base, precisionM: 0 },
      { ...base, precisionM: "12" },
      { ...base, precisionM: undefined }, // facultative ici, obligatoire pour un geste ponctuel
    ];
    for (const v of variantes.filter(
      (x) => (x as { precisionM?: number }).precisionM !== undefined,
    )) {
      expect(accepte(lirePosition, v), JSON.stringify(v)).toBe(schema.safeParse(v).success);
    }
    expect(accepte(lirePosition, { ...base, precisionM: undefined })).toBe(true);
    expect(accepte(lirePosition, { ...base, vitesseKmh: 80.5 })).toBe(true);
    expect(accepte(lirePosition, { ...base, vitesseKmh: -1 })).toBe(false);
    expect(accepte(lirePosition, { ...base, vitesseKmh: 251 })).toBe(false);
  });

  it("un lot compte de 1 à 100 positions", () => {
    const p = { instant: "2026-11-02T09:00:00+01:00", latitude: 4, longitude: 9 };
    expect(accepte(lireLotPositions, { positions: [p] })).toBe(true);
    expect(accepte(lireLotPositions, { positions: Array(100).fill(p) })).toBe(true);
    expect(accepte(lireLotPositions, { positions: Array(101).fill(p) })).toBe(false);
    expect(accepte(lireLotPositions, { positions: [] })).toBe(false);
    expect(accepte(lireLotPositions, { positions: [{ ...p, latitude: 100 }] })).toBe(false);
  });

  it("monter en route : un arrêt, ou une position complète", () => {
    expect(lireDemandeMontee({ arretId: "a1" })).toEqual({ arretId: "a1" });
    expect(lireDemandeMontee({ lat: "3.8333", lng: "10.5333" })).toEqual({
      latitude: 3.8333,
      longitude: 10.5333,
    });
    expect(lireDemandeMontee({ arretId: "a1", lat: "3", lng: "10" })).toEqual({ arretId: "a1" });
    for (const mauvais of [
      {},
      { lat: "3" },
      { lng: "10" },
      { lat: "abc", lng: "10" },
      { lat: "91", lng: "10" },
      { lat: "3", lng: "-181" },
      { arretId: "" },
      { arretId: ["a", "b"] },
      { lat: ["3", "4"], lng: "10" },
    ]) {
      expect(
        () => lireDemandeMontee(mauvais as Record<string, unknown>),
        JSON.stringify(mauvais),
      ).toThrow(DonneesInvalides);
    }
  });
});

describe("parité avec le reste de l'API", () => {
  it("les états de départ sont ceux de la billetterie", () => {
    expect([...ETATS_DEPART_GPS]).toEqual([...ETATS_DEPART]);
  });

  it("les rôles qui envoient une position existent", () => {
    for (const r of ["chauffeur", "convoyeur", "livreur", "voyageur", "patron", "superviseur"]) {
      expect(ROLES as readonly string[]).toContain(r);
    }
  });
});
