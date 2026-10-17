import { agence } from "@afrimove/contrats";
import * as domaine from "@afrimove/domain";
import * as client from "@afrimove/sync";
import { describe, expect, it } from "vitest";
import { ROLES } from "../socle/auth/roles";
import { CODES_REJET } from "./protocole";
import * as regles from "./regles";
import { canonique, cleValide, verifierSignature } from "./signature";
import { TYPES_SIEGE_OCCUPE } from "./regles";
import { aammjjDouala, versIsoDouala } from "./temps";

/**
 * L'API ne peut pas importer le domaine, les contrats ni le moteur client à l'exécution (paquets
 * non compilés, API en CommonJS) : elle en recopie les règles. Ces tests les comparent aux sources,
 * pour qu'une règle modifiée d'un seul côté fasse échouer la CI.
 */
describe("parité avec @afrimove/domain", () => {
  it("limites hors ligne : 12 h de blocage, 4 h de déblocage", () => {
    expect(regles.LIMITE_HORS_LIGNE_HEURES).toBe(domaine.LIMITE_HORS_LIGNE_HEURES);
    expect(regles.DEBLOCAGE_TEMPORAIRE_HEURES).toBe(domaine.DEBLOCAGE_TEMPORAIRE_HEURES);
  });

  it("plages des guichets", () => {
    expect(regles.NB_GUICHETS_AVEC_PLAGE).toBe(domaine.NB_GUICHETS_AVEC_PLAGE);
    for (let rang = 1; rang <= domaine.NB_GUICHETS_AVEC_PLAGE; rang++) {
      expect(regles.plageGuichet(rang)).toEqual(domaine.plageGuichet(rang));
    }
    expect(() => regles.plageGuichet(4)).toThrow(RangeError);
    expect(() => regles.plageGuichet(0)).toThrow(RangeError);
  });

  it("plages des convoyeurs, pour 1 à 12 convoyeurs", () => {
    for (let n = 1; n <= 12; n++) {
      for (let rang = 1; rang <= n; rang++) {
        expect(regles.plageConvoyeur(rang, n), `${rang}/${n}`).toEqual(
          domaine.plageConvoyeur(rang, n),
        );
      }
    }
    expect(() => regles.plageConvoyeur(3, 2)).toThrow(RangeError);
    expect(() => regles.plageConvoyeur(1, 0)).toThrow(RangeError);
  });

  it("heures de Douala (versIsoDouala, aammjjDouala), y compris autour de minuit", () => {
    const instants = [
      "2027-01-05T05:30:00+01:00",
      "2027-01-05T23:59:59.999+01:00",
      "2027-01-06T00:00:00.000+01:00",
      "2026-12-31T23:30:00Z",
      "2028-02-29T12:00:00Z",
    ];
    for (const i of instants) {
      expect(versIsoDouala(i)).toBe(domaine.versIsoDouala(i));
      expect(aammjjDouala(i)).toBe(domaine.aammjjDouala(i));
    }
  });

  it("les rôles du terrain existent, et les rôles de vente du domaine sont bien ceux qui écrivent des ventes", () => {
    for (const r of regles.ROLES_TERRAIN) expect(ROLES).toContain(r);
    for (const r of ["voyageur", "patron", "comptable", "afrimove", "relais", "livreur"] as const) {
      expect(regles.ROLES_TERRAIN).not.toContain(r);
    }
    for (const type of ["billet.vendu", "billet.vendu_cadence", "route.billet_vendu"]) {
      for (const r of regles.ROLES_PAR_TYPE[type]!)
        expect(domaine.peutVendre(r), `${type}/${r}`).toBe(true);
    }
    for (const r of ROLES) {
      if (domaine.peutVendre(r)) {
        expect(
          Object.entries(regles.ROLES_PAR_TYPE)
            .filter(([t]) => ["billet.vendu", "route.billet_vendu"].includes(t))
            .some(([, roles]) => roles.includes(r)),
          `un ${r} doit pouvoir écrire une vente`,
        ).toBe(true);
      }
    }
  });
});

describe("parité avec @afrimove/contrats", () => {
  it("les 34 types d'événements, dans le même ordre", () => {
    expect(regles.TYPES_EVENEMENT).toEqual(agence.EVENEMENTS_AGENCE.map((e) => e.type));
    expect(regles.TYPES_EVENEMENT).toHaveLength(34);
  });

  it("les types numérotés sont ceux qui portent un numéro de plage", () => {
    expect([...regles.TYPES_NUMEROTES].sort()).toEqual(
      agence.EVENEMENTS_AGENCE.filter((e) => e.numerote)
        .map((e) => e.type)
        .sort(),
    );
  });

  it("les types qui occupent un siège portent billetId, departId et siege dans leurs données", () => {
    for (const type of TYPES_SIEGE_OCCUPE) {
      const definition = agence.EVENEMENTS_AGENCE.find((e) => e.type === type)!;
      const forme = (definition.donnees as unknown as { shape: Record<string, unknown> }).shape;
      expect(Object.keys(forme), type).toEqual(
        expect.arrayContaining(["billetId", "departId", "siege"]),
      );
    }
    const libere = agence.EVENEMENTS_AGENCE.find((e) => e.type === "quai.libere")!;
    const forme = (libere.donnees as unknown as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(forme)).toEqual(expect.arrayContaining(["billetId", "departId", "siege"]));
  });

  it("le colis a son propre compteur, tous les autres numéros sont des billets", () => {
    expect(regles.genreDeNumero("colis.enregistre")).toBe("colis");
    for (const t of regles.TYPES_NUMEROTES.filter((x) => x !== "colis.enregistre")) {
      expect(regles.genreDeNumero(t)).toBe("billet");
    }
  });

  it("les décisions d'annulation et les options de déblocage sont celles des contrats", () => {
    const decisions = agence.EVENEMENTS_AGENCE.find((e) => e.type === "annulation.decidee")!;
    const options = agence.EVENEMENTS_AGENCE.find((e) => e.type === "appareil.debloque")!;
    // Si un contrat change ces énumérations, ces exemples cessent de valider : l'API doit suivre.
    for (const decision of ["rembourser", "reporter", "avoir", "refuser"]) {
      const forme = (
        decisions.donnees as unknown as {
          shape: { decision: { safeParse(v: unknown): { success: boolean } } };
        }
      ).shape;
      expect(forme.decision.safeParse(decision).success, decision).toBe(true);
    }
    for (const option of ["synchroniser", "debloquer_4h", "telephone_secours"]) {
      const forme = (
        options.donnees as unknown as {
          shape: { option: { safeParse(v: unknown): { success: boolean } } };
        }
      ).shape;
      expect(forme.option.safeParse(option).success, option).toBe(true);
    }
  });
});

describe("parité avec @afrimove/sync (moteur de l'appareil)", () => {
  const evenement = {
    type: "billet.vendu",
    id: "00000000-0000-4000-8000-000000000001",
    at: "2027-01-05T05:30:00.000+01:00",
    donnees: { z: 1, a: { y: [3, { b: 1, a: undefined }], x: null }, e: "é" },
  };

  it("même JSON canonique des deux côtés", () => {
    for (const valeur of [evenement, [1, { b: 2, a: 1 }], "texte", null, 7, { a: undefined }]) {
      expect(canonique(valeur)).toBe(client.canonique(valeur));
    }
  });

  it("le serveur vérifie la signature produite par l'appareil, et seulement celle-là", async () => {
    const cle = await client.genererCleAppareil();
    const signature = await client.signer(cle.privee, evenement);
    const publique = await cleValide(cle.publique);
    expect(publique).not.toBeNull();
    expect(await verifierSignature(publique!, evenement, signature)).toBe(true);
    // un octet modifié, une clé étrangère, une signature tronquée ou illisible : refusés
    expect(await verifierSignature(publique!, { ...evenement, id: "autre" }, signature)).toBe(
      false,
    );
    const autre = await client.genererCleAppareil();
    expect(await verifierSignature((await cleValide(autre.publique))!, evenement, signature)).toBe(
      false,
    );
    expect(await verifierSignature(publique!, evenement, signature.slice(2))).toBe(false);
    expect(await verifierSignature(publique!, evenement, "zz")).toBe(false);
    expect(await verifierSignature(publique!, evenement, "")).toBe(false);
  });

  it("l'ordre des clés ne change pas la signature", async () => {
    const cle = await client.genererCleAppareil();
    const publique = (await cleValide(cle.publique))!;
    const signature = await client.signer(cle.privee, evenement);
    const melange = {
      donnees: evenement.donnees,
      at: evenement.at,
      id: evenement.id,
      type: evenement.type,
    };
    expect(await verifierSignature(publique, melange, signature)).toBe(true);
  });

  it("cleValide n'accepte que l'ECDSA P-256 et jette la partie privée", async () => {
    const cle = await client.genererCleAppareil();
    expect(await cleValide({ ...cle.publique, d: "secret" })).toEqual({
      kty: "EC",
      crv: "P-256",
      x: cle.publique.x,
      y: cle.publique.y,
    });
    expect(await cleValide(null)).toBeNull();
    expect(await cleValide("x")).toBeNull();
    expect(await cleValide({ kty: "RSA", n: "x", e: "AQAB" })).toBeNull();
    expect(await cleValide({ kty: "EC", crv: "P-384", x: "a", y: "b" })).toBeNull();
    expect(await cleValide({ kty: "EC", crv: "P-256", x: "pas-un-point", y: "non" })).toBeNull();
  });

  it("les codes de refus sont les mêmes des deux côtés", () => {
    expect([...CODES_REJET]).toEqual([...client.CODES_REJET]);
  });
});
