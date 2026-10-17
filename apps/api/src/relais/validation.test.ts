import { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ErreurColis } from "../colis/erreurs";
import {
  lireBrouillonRelais,
  lireChoixRelais,
  lireFicheRelais,
  lireReception,
  lireRemiseRelais,
  lireActivationRelais,
  lireRefusDemande,
  lireVisite,
} from "./validation";

/**
 * L'API ne peut pas importer zod à l'exécution : elle relit à la main les corps de requête. Ces tests
 * comparent les lecteurs aux schémas des contrats sur des cas valides et invalides : une règle modifiée
 * d'un seul côté fait échouer la CI.
 */

const accepte = (lecteur: (brut: unknown) => unknown, brut: unknown): boolean => {
  try {
    lecteur(brut);
    return true;
  } catch (e) {
    if (e instanceof ErreurColis) return false;
    throw e;
  }
};

const FICHE = {
  nom: "Boutique Chez Paul",
  type: "Boutique · alimentation",
  ouvert: "7 h – 20 h · lun.–sam.",
  position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face au marché" },
  tailleMax: "Tous (≤ 30 kg)",
  momo: { telephone: "+237670000111", operateur: "mtn" },
  facadeRef: "photos/facade-paul.jpg",
};

const REMISE = {
  colisId: "00000000-0000-4000-8000-0000000000c1",
  code: "482913",
  pieceVerifiee: true,
  photoRef: "photos/remise.jpg",
};

const sans = (objet: Record<string, unknown>, cle: string) => {
  const { [cle]: _retire, ...reste } = objet;
  return reste;
};

describe("lecteurs des points relais ≡ schémas des contrats", () => {
  it("fiche du relais", () => {
    const cas: unknown[] = [
      FICHE,
      { ...FICHE, position: { ville: "Bafoussam", quartier: "Tamdja" } },
      sans(FICHE, "nom"),
      sans(FICHE, "facadeRef"),
      { ...FICHE, nom: "" },
      { ...FICHE, momo: { telephone: "677", operateur: "mtn" } },
      { ...FICHE, momo: { telephone: "+237670000111", operateur: "camtel" } },
      { ...FICHE, momo: { telephone: "+237670000111" } },
      { ...FICHE, position: "Bafoussam" },
      { ...FICHE, tailleMax: 30 },
      "n'importe quoi",
      null,
      [],
    ];
    for (const brut of cas) {
      expect(accepte(lireFicheRelais, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaFicheRelais.safeParse(brut).success,
      );
    }
  });

  it("brouillon : chaque champ présent doit être complet et valide", () => {
    const cas: unknown[] = [
      { fiche: {} },
      { fiche: { nom: "Boutique" } },
      { fiche: FICHE },
      { fiche: { momo: FICHE.momo } },
      { fiche: { nom: "" } },
      { fiche: { momo: { telephone: "pas-un-numero", operateur: "mtn" } } },
      { fiche: { position: { ville: "Bafoussam" } } },
      { fiche: "Boutique" },
      {},
      null,
    ];
    for (const brut of cas) {
      expect(accepte(lireBrouillonRelais, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaBrouillonRelais.safeParse(brut).success,
      );
    }
  });

  it("remise : le code à 6 chiffres, la pièce vue (true) et la photo", () => {
    const cas: unknown[] = [
      REMISE,
      { ...REMISE, pieceVerifiee: false },
      sans(REMISE, "pieceVerifiee"),
      { ...REMISE, pieceVerifiee: "true" },
      { ...REMISE, code: "12345" },
      { ...REMISE, code: "1234567" },
      { ...REMISE, code: "12345a" },
      { ...REMISE, code: 482913 },
      sans(REMISE, "code"),
      { ...REMISE, photoRef: "" },
      sans(REMISE, "photoRef"),
      sans(REMISE, "colisId"),
      { ...REMISE, colisId: "" },
      {},
    ];
    for (const brut of cas) {
      expect(accepte(lireRemiseRelais, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaRemiseColisRelais.safeParse(brut).success,
      );
    }
  });

  it("réception : le numéro lu sur l'étiquette", () => {
    for (const brut of [
      { numeroColis: "C-DLA-261102-0001" },
      { numeroColis: "" },
      {},
      { numeroColis: 12 },
    ]) {
      expect(accepte(lireReception, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaReceptionColisRelais.safeParse(brut).success,
      );
    }
  });

  it("choix du relais : l'identifiant du point relais", () => {
    for (const brut of [{ relaisId: "abc" }, { relaisId: "" }, {}, { relaisId: 3 }]) {
      expect(accepte(lireChoixRelais, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaChoixRelais.safeParse({ colisId: "c", ...(brut as object) }).success,
      );
    }
  });

  it("ne recopie jamais un champ inconnu", () => {
    const fiche = lireFicheRelais({ ...FICHE, role: "patron", __proto__: { admin: true } });
    expect(Object.keys(fiche).sort()).toEqual(
      ["facadeRef", "momo", "nom", "ouvert", "position", "tailleMax", "type"].sort(),
    );
    expect(lireRemiseRelais({ ...REMISE, gain: 1_000_000 })).toEqual({
      colisId: REMISE.colisId,
      code: REMISE.code,
      photoRef: REMISE.photoRef,
    });
  });
});

describe("lecteurs réservés aux agents AfriMove", () => {
  it("visite : agent et créneau en texte", () => {
    expect(lireVisite({ agent: "Éric", creneau: "jeudi 10 h" })).toEqual({
      agent: "Éric",
      creneau: "jeudi 10 h",
    });
    for (const brut of [
      {},
      { agent: "Éric" },
      { agent: "", creneau: "x" },
      { agent: "x", creneau: 3 },
    ]) {
      expect(accepte(lireVisite, brut), JSON.stringify(brut)).toBe(false);
    }
  });

  it("activation : position GPS dans les bornes du globe, capacité entière", () => {
    expect(lireActivationRelais({})).toEqual({
      position: null,
      capacite: undefined,
      particularite: null,
    });
    expect(
      lireActivationRelais({
        position: { lat: 5.47, lon: 10.41 },
        capacite: 20,
        particularite: "frigo",
      }),
    ).toEqual({ position: { lat: 5.47, lon: 10.41 }, capacite: 20, particularite: "frigo" });
    for (const brut of [
      { position: { lat: 91, lon: 10 } },
      { position: { lat: 5, lon: 181 } },
      { position: { lat: "5", lon: 10 } },
      { position: { lat: 5 } },
      { position: "Tamdja" },
      { capacite: 0 },
      { capacite: 1.5 },
      { capacite: 501 },
    ]) {
      expect(accepte(lireActivationRelais, brut), JSON.stringify(brut)).toBe(false);
    }
  });

  it("refus : un motif non vide", () => {
    expect(lireRefusDemande({ motif: "Boutique fermée" })).toEqual({ motif: "Boutique fermée" });
    for (const brut of [{}, { motif: "" }, { motif: 5 }]) {
      expect(accepte(lireRefusDemande, brut), JSON.stringify(brut)).toBe(false);
    }
  });
});
