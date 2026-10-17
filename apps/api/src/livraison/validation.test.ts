import { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ErreurColis } from "../colis/erreurs";
import {
  lireActivationLivreur,
  lireAdresse,
  lireDemandeLivreur,
  lireDisponibilite,
  lireIdMission,
  lireInvitation,
  lirePartage,
  lireRefusLivreur,
  lireRemiseLivreur,
  lireRetraitGains,
  lireVerificationLivreur,
} from "./validation";

/**
 * L'API ne peut pas importer zod à l'exécution : elle relit à la main les corps de requête. Ces tests
 * comparent les lecteurs aux schémas des contrats sur des cas valides et invalides.
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

const sans = (objet: Record<string, unknown>, cle: string) => {
  const { [cle]: _retire, ...reste } = objet;
  return reste;
};

const DEMANDE = {
  deplacement: "moto",
  zone: "Bafoussam · Tamdja, Djeleng, centre",
  heures: "Soirs 17 h – 21 h",
  chargeMax: "10 kg · colis courants",
  momo: { telephone: "+237670000333", operateur: "mtn" },
  pieces: { permisRef: "photos/permis.jpg", assuranceRef: "photos/assurance.jpg" },
  reglesAcceptees: true,
};

const REMISE = {
  missionId: "00000000-0000-4000-8000-0000000000b1",
  code: "482913",
  pieceVerifiee: true,
  photoRef: "photos/remise.jpg",
};

describe("lecteurs de la livraison ≡ schémas des contrats", () => {
  it("demande de livreur", () => {
    const cas: unknown[] = [
      DEMANDE,
      { ...DEMANDE, deplacement: "velo", pieces: {} },
      { ...DEMANDE, deplacement: "tricycle" },
      { ...DEMANDE, deplacement: "fusée" },
      { ...DEMANDE, deplacement: undefined },
      { ...DEMANDE, reglesAcceptees: false },
      { ...DEMANDE, reglesAcceptees: "true" },
      sans(DEMANDE, "reglesAcceptees"),
      { ...DEMANDE, zone: "" },
      { ...DEMANDE, heures: "" },
      { ...DEMANDE, chargeMax: "" },
      sans(DEMANDE, "pieces"),
      { ...DEMANDE, pieces: { permisRef: "" } },
      { ...DEMANDE, pieces: { permisRef: 3 } },
      { ...DEMANDE, momo: { telephone: "670000333", operateur: "mtn" } },
      { ...DEMANDE, momo: { telephone: "+237670000333", operateur: "camtel" } },
      { ...DEMANDE, momo: { telephone: "+237670000333" } },
      "n'importe quoi",
      null,
      [],
    ];
    for (const brut of cas) {
      expect(accepte(lireDemandeLivreur, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaDemandeLivreur.safeParse(brut).success,
      );
    }
  });

  it("remise : le code à 6 chiffres, la pièce vue (true) et la photo", () => {
    const cas: unknown[] = [
      REMISE,
      { ...REMISE, pieceVerifiee: false },
      sans(REMISE, "pieceVerifiee"),
      { ...REMISE, pieceVerifiee: 1 },
      { ...REMISE, code: "12345" },
      { ...REMISE, code: "1234567" },
      { ...REMISE, code: "12345a" },
      { ...REMISE, code: 482913 },
      sans(REMISE, "code"),
      { ...REMISE, photoRef: "" },
      sans(REMISE, "photoRef"),
      {},
    ];
    for (const brut of cas) {
      // Le contrat porte aussi `missionId`, que l'API lit dans le chemin : on le fournit au schéma.
      const complet = { missionId: REMISE.missionId, ...(brut as object) };
      expect(accepte(lireRemiseLivreur, brut), JSON.stringify(brut)).toBe(
        contrats.SchemaRemiseColisLivreur.safeParse(complet).success,
      );
    }
  });

  it("disponibilité, retrait, invitation, partage, adresse", () => {
    const cas: [
      (brut: unknown) => unknown,
      { safeParse: (x: unknown) => { success: boolean } },
      unknown[],
    ][] = [
      [
        lireDisponibilite,
        contrats.SchemaDisponibiliteLivreur,
        [{ disponible: true }, { disponible: false }, { disponible: "oui" }, {}, { disponible: 1 }],
      ],
      [
        lireRetraitGains,
        contrats.SchemaDemandeRetraitGains,
        [
          {},
          { montant: 5000 },
          { montant: 0 },
          { montant: -1 },
          { montant: 5000.5 },
          { montant: "5000" },
        ],
      ],
      [
        lireInvitation,
        contrats.SchemaInvitationLivreur,
        [{ telephone: "+237677000111" }, { telephone: "677000111" }, { telephone: "" }, {}],
      ],
      [
        lirePartage,
        {
          safeParse: (x) =>
            contrats.SchemaPartageSuivi.safeParse({ colisId: "c", ...(x as object) }),
        },
        [{ destinataire: "+237677000111" }, { destinataire: "x" }, {}],
      ],
      [
        lireAdresse,
        {
          safeParse: (x) =>
            contrats.SchemaChangementAdresse.safeParse({ colisId: "c", ...(x as object) }),
        },
        [{ adresse: "Tamdja" }, { adresse: "" }, {}, { adresse: 4 }],
      ],
    ];
    for (const [lecteur, schema, valeurs] of cas) {
      for (const brut of valeurs) {
        const lisible = lecteur === lireRetraitGains && brut === undefined ? {} : brut;
        expect(accepte(lecteur, lisible), `${lecteur.name} ${JSON.stringify(brut)}`).toBe(
          schema.safeParse(brut).success,
        );
      }
    }
  });

  it("ne recopie jamais un champ inconnu", () => {
    expect(lireRemiseLivreur({ ...REMISE, gain: 1_000_000, role: "patron" })).toEqual({
      code: REMISE.code,
      photoRef: REMISE.photoRef,
    });
    expect(Object.keys(lireDemandeLivreur({ ...DEMANDE, actif: true, note: 5 })).sort()).toEqual(
      ["chargeMax", "deplacement", "heures", "momo", "pieces", "zone"].sort(),
    );
  });

  it("un identifiant de mission mal formé est une mission introuvable (404)", () => {
    expect(lireIdMission(REMISE.missionId)).toBe(REMISE.missionId);
    for (const brut of ["", "abc", "1; DROP TABLE", "../../etc"]) {
      expect(() => lireIdMission(brut), brut).toThrow(ErreurColis);
    }
  });
});

describe("lecteurs réservés aux agents AfriMove", () => {
  it("vérification : chaque rubrique est facultative, les dates sont de vraies dates", () => {
    expect(lireVerificationLivreur({})).toEqual({
      identite: false,
      pieces: null,
      formation: false,
    });
    expect(lireVerificationLivreur({ identite: true, formation: true })).toMatchObject({
      identite: true,
      formation: true,
    });
    expect(
      lireVerificationLivreur({
        pieces: { permisValideJusqua: "2030-01-31", assuranceExpireLe: "2027-12-31" },
      }).pieces,
    ).toEqual({ permisValideJusqua: "2030-01-31", assuranceExpireLe: "2027-12-31" });
    for (const brut of [
      { identite: false },
      { identite: "oui" },
      { formation: 1 },
      { pieces: { permisValideJusqua: "2030-01-31" } },
      { pieces: { permisValideJusqua: "31/01/2030", assuranceExpireLe: "2027-12-31" } },
      { pieces: { permisValideJusqua: "2028-02-30", assuranceExpireLe: "2027-12-31" } },
      { pieces: { permisValideJusqua: "2030-13-01", assuranceExpireLe: "2027-12-31" } },
      { pieces: "ok" },
    ]) {
      expect(accepte(lireVerificationLivreur, brut), JSON.stringify(brut)).toBe(false);
    }
    // Le 29 février d'une année bissextile existe, pas celui d'une autre.
    expect(
      accepte(lireVerificationLivreur, {
        pieces: { permisValideJusqua: "2028-02-29", assuranceExpireLe: "2027-12-31" },
      }),
    ).toBe(true);
    expect(
      accepte(lireVerificationLivreur, {
        pieces: { permisValideJusqua: "2027-02-29", assuranceExpireLe: "2027-12-31" },
      }),
    ).toBe(false);
  });

  it("activation et refus", () => {
    expect(lireActivationLivreur(undefined)).toEqual({ moto: null });
    expect(lireActivationLivreur({ moto: "OU 517 MT" })).toEqual({ moto: "OU 517 MT" });
    expect(accepte(lireActivationLivreur, { moto: "x".repeat(21) })).toBe(false);
    expect(accepte(lireActivationLivreur, { moto: 5 })).toBe(false);
    expect(lireRefusLivreur({ motif: "Permis illisible" })).toEqual({ motif: "Permis illisible" });
    for (const brut of [{}, { motif: "" }, { motif: 3 }]) {
      expect(accepte(lireRefusLivreur, brut), JSON.stringify(brut)).toBe(false);
    }
  });
});
