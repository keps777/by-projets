import { describe, expect, it } from "vitest";
import type { EntreeNumero } from "../sync/ports";
import { NumerosEnLigneEpuises, AppareilSansPlage } from "./erreurs";
import { APPAREIL_SERVEUR, PLAGE_EN_LIGNE } from "./regles";
import {
  AUTRE_GARE,
  COMPAGNIE,
  GARE,
  monterNumerotation,
  uuid,
  type MontageNumerotation,
} from "./testing/montage";

const JOUR = "270105";
const ATTRIBUTION_GUICHET_2 = {
  appareilId: "g2",
  genre: "guichet",
  rang: 2,
  gareId: GARE,
  compagnieId: COMPAGNIE,
} as const;

async function avecDeuxGuichets() {
  const m = monterNumerotation();
  await m.plages.attribuer({ ...ATTRIBUTION_GUICHET_2 });
  await m.plages.attribuer({ ...ATTRIBUTION_GUICHET_2, appareilId: "g3", rang: 3 });
  return m;
}

const entree = (
  m: MontageNumerotation,
  appareilId: string,
  numeroPlage: number,
  extra: Partial<EntreeNumero> = {},
): EntreeNumero => ({
  appareilId,
  jour: JOUR,
  genre: "billet",
  numeroPlage,
  evenementId: uuid(),
  plage: null,
  ...extra,
});

describe("enregistrer : doublons et numéros hors plage", () => {
  it("un numéro dans la plage, reçu une fois, ne produit aucune anomalie", async () => {
    const m = await avecDeuxGuichets();
    expect(await m.controleNumeros.enregistrer(entree(m, "g2", 1001))).toEqual([]);
    expect(await m.controleNumeros.enregistrer(entree(m, "g2", 1002))).toEqual([]);
  });

  it("le même événement rejoué n'est pas un doublon (idempotence)", async () => {
    const m = await avecDeuxGuichets();
    const e = entree(m, "g2", 1001);
    expect(await m.controleNumeros.enregistrer(e)).toEqual([]);
    expect(await m.controleNumeros.enregistrer(e)).toEqual([]);
  });

  it("un autre événement avec le même numéro est un doublon, qui nomme l'événement d'origine", async () => {
    const m = await avecDeuxGuichets();
    const premier = entree(m, "g2", 1001);
    await m.controleNumeros.enregistrer(premier);
    const anomalies = await m.controleNumeros.enregistrer(entree(m, "g2", 1001));
    expect(anomalies).toEqual([
      { type: "numero_en_double", numeroPlage: 1001, evenementIdExistant: premier.evenementId },
    ]);
  });

  it("deux appareils d'une même gare qui sortent le même numéro : doublon (la gare est la portée)", async () => {
    const m = await avecDeuxGuichets();
    const chezG2 = entree(m, "g2", 1500);
    await m.controleNumeros.enregistrer(chezG2);
    // g3 envoie un numéro de la plage de g2 : doublon ET hors plage
    const anomalies = await m.controleNumeros.enregistrer(
      entree(m, "g3", 1500, { plage: { debut: 2001, fin: 2999 } }),
    );
    expect(anomalies.map((a) => a.type).sort()).toEqual(["numero_en_double", "numero_hors_plage"]);
    expect(anomalies.find((a) => a.type === "numero_en_double")?.evenementIdExistant).toBe(
      chezG2.evenementId,
    );
  });

  it("le même numéro dans une autre gare, un autre jour ou un autre genre n'est pas un doublon", async () => {
    const m = await avecDeuxGuichets();
    await m.plages.attribuer({ ...ATTRIBUTION_GUICHET_2, appareilId: "autre", gareId: AUTRE_GARE });
    await m.controleNumeros.enregistrer(entree(m, "g2", 1100));
    expect(await m.controleNumeros.enregistrer(entree(m, "autre", 1100))).toEqual([]);
    expect(await m.controleNumeros.enregistrer(entree(m, "g2", 1100, { jour: "270106" }))).toEqual(
      [],
    );
    expect(await m.controleNumeros.enregistrer(entree(m, "g2", 1100, { genre: "colis" }))).toEqual(
      [],
    );
  });

  it("un numéro hors de la plage attribuée est signalé, même sans plage transmise par la synchronisation", async () => {
    const m = await avecDeuxGuichets();
    expect(await m.controleNumeros.enregistrer(entree(m, "g2", 5))).toEqual([
      { type: "numero_hors_plage", numeroPlage: 5 },
    ]);
    // plage transmise (fiche de l'appareil) : c'est elle qui fait foi pour un appareil non attribué
    expect(
      await m.controleNumeros.enregistrer(
        entree(m, "inconnu", 1500, { plage: { debut: 1, fin: 999 } }),
      ),
    ).toEqual([{ type: "numero_hors_plage", numeroPlage: 1500 }]);
  });

  it("un numéro impossible à imprimer (0, 10000, décimal) est signalé sans entrer au registre", async () => {
    const m = await avecDeuxGuichets();
    for (const n of [0, 10_000, 3.5, -1]) {
      expect(await m.controleNumeros.enregistrer(entree(m, "g2", n))).toEqual([
        { type: "numero_hors_plage", numeroPlage: n },
      ]);
    }
    expect(await m.registre.duJour(JOUR)).toEqual([]);
  });

  it("deux requêtes simultanées avec le même numéro : une seule l'obtient", async () => {
    const m = await avecDeuxGuichets();
    const [a, b] = await Promise.all([
      m.controleNumeros.enregistrer(entree(m, "g2", 1042)),
      m.controleNumeros.enregistrer(entree(m, "g2", 1042)),
    ]);
    expect([a.length, b.length].sort()).toEqual([0, 1]);
    expect((await m.registre.duJour(JOUR)).filter((e) => e.numero === 1042)).toHaveLength(1);
  });
});

describe("trous et compteur du jour", () => {
  it("trous : les numéros manquants entre le début de la plage et le plus grand reçu", async () => {
    const m = await avecDeuxGuichets();
    for (const n of [1001, 1002, 1005, 1008]) {
      await m.controleNumeros.enregistrer(entree(m, "g2", n));
    }
    expect(await m.controleNumeros.trous("g2", JOUR, "billet", { debut: 1001, fin: 1999 })).toEqual(
      [1003, 1004, 1006, 1007],
    );
  });

  it("trous : aucun tant que rien n'est reçu, ni quand la plage est suivie sans trou", async () => {
    const m = await avecDeuxGuichets();
    const plage = { debut: 1001, fin: 1999 };
    expect(await m.controleNumeros.trous("g2", JOUR, "billet", plage)).toEqual([]);
    for (const n of [1001, 1002, 1003]) await m.controleNumeros.enregistrer(entree(m, "g2", n));
    expect(await m.controleNumeros.trous("g2", JOUR, "billet", plage)).toEqual([]);
  });

  it("trous : le premier numéro de la plage manquant est un trou", async () => {
    const m = await avecDeuxGuichets();
    await m.controleNumeros.enregistrer(entree(m, "g2", 1003));
    expect(await m.controleNumeros.trous("g2", JOUR, "billet", { debut: 1001, fin: 1999 })).toEqual(
      [1001, 1002],
    );
  });

  it("trous : les billets et les colis ont chacun leur compteur, chaque jour repart de zéro", async () => {
    const m = await avecDeuxGuichets();
    const plage = { debut: 1001, fin: 1999 };
    await m.controleNumeros.enregistrer(entree(m, "g2", 1001));
    await m.controleNumeros.enregistrer(entree(m, "g2", 1003, { genre: "colis" }));
    await m.controleNumeros.enregistrer(entree(m, "g2", 1002, { jour: "270106" }));
    expect(await m.controleNumeros.trous("g2", JOUR, "billet", plage)).toEqual([]);
    expect(await m.controleNumeros.trous("g2", JOUR, "colis", plage)).toEqual([1001, 1002]);
    expect(await m.controleNumeros.trous("g2", "270106", "billet", plage)).toEqual([1001]);
  });

  it("un numéro hors plage ne cache pas un trou et n'en crée pas", async () => {
    const m = await avecDeuxGuichets();
    await m.controleNumeros.enregistrer(entree(m, "g2", 1001));
    await m.controleNumeros.enregistrer(entree(m, "g2", 1003));
    await m.controleNumeros.enregistrer(entree(m, "g2", 3));
    expect(await m.controleNumeros.trous("g2", JOUR, "billet", { debut: 1001, fin: 1999 })).toEqual(
      [1002],
    );
  });

  it("le compteur du jour : émis, dernier, prochain, restants, et le résumé « plage sans trou »", async () => {
    const m = await avecDeuxGuichets();
    for (const n of [1001, 1002, 1003]) await m.controleNumeros.enregistrer(entree(m, "g2", n));
    let resume = await m.numerotation.resume("g2", JOUR);
    expect(resume.billets).toMatchObject({
      emis: 3,
      premier: 1001,
      dernier: 1003,
      prochain: 1004,
      restants: 996,
      trous: [],
      horsPlage: [],
    });
    expect(resume.colis).toMatchObject({ emis: 0, prochain: 1001, restants: 999 });
    expect(resume.plageSansTrou).toBe(true);

    await m.controleNumeros.enregistrer(entree(m, "g2", 1006));
    await m.controleNumeros.enregistrer(entree(m, "g2", 77));
    resume = await m.numerotation.resume("g2", JOUR);
    expect(resume.billets.trous).toEqual([1004, 1005]);
    expect(resume.billets.horsPlage).toEqual([77]);
    expect(resume.billets.prochain).toBe(1007);
    expect(resume.plageSansTrou).toBe(false);
  });

  it("plage épuisée : plus de prochain numéro", async () => {
    const m = monterNumerotation();
    await m.plages.attribuer({
      appareilId: "petit",
      genre: "guichet",
      plage: { debut: 10, fin: 11 },
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    await m.controleNumeros.enregistrer(entree(m, "petit", 10));
    await m.controleNumeros.enregistrer(entree(m, "petit", 11));
    const { billets } = await m.numerotation.resume("petit", JOUR);
    expect(billets).toMatchObject({ prochain: null, restants: 0, emis: 2 });
  });

  it("résumé d'un appareil sans plage : AppareilSansPlage", async () => {
    const m = monterNumerotation();
    await expect(m.numerotation.resume("inconnu", JOUR)).rejects.toBeInstanceOf(AppareilSansPlage);
  });

  it("résumé de la gare : totaux du jour, et numéros pris par le serveur à part", async () => {
    const m = await avecDeuxGuichets();
    for (const n of [1001, 1002]) await m.controleNumeros.enregistrer(entree(m, "g2", n));
    await m.controleNumeros.enregistrer(entree(m, "g3", 2001));
    await m.controleNumeros.enregistrer(entree(m, "g3", 2002, { genre: "colis" }));
    const at = "2027-01-05T10:00:00+01:00";
    await m.numerotation.prendreEnLigne({
      gareId: GARE,
      compagnieId: COMPAGNIE,
      genre: "billet",
      at,
      reference: uuid(),
    });
    await m.numerotation.prendreEnLigne({
      gareId: AUTRE_GARE,
      compagnieId: COMPAGNIE,
      genre: "billet",
      at,
      reference: uuid(),
    });

    const gare = await m.numerotation.resumeGare({ gareId: GARE }, JOUR);
    expect(gare.appareils.map((a) => a.appareilId).sort()).toEqual(["g2", "g3"]);
    expect(gare.totaux).toEqual({ billets: 3, colis: 1 });
    expect(gare.enLigne).toEqual({ billets: 1, colis: 0 });
  });
});

describe("numéros en ligne (4001–9999), pris par le serveur", () => {
  const at = "2027-01-05T10:00:00+01:00";
  const demande = (reference: string, extra = {}) => ({
    gareId: GARE,
    compagnieId: COMPAGNIE,
    genre: "billet" as const,
    at,
    reference,
    ...extra,
  });

  it("numérote dans l'ordre à partir de 4001, sans trou", async () => {
    const m = monterNumerotation();
    const numeros: number[] = [];
    for (let i = 0; i < 25; i++) {
      numeros.push((await m.numerotation.prendreEnLigne(demande(uuid()))).numero);
    }
    expect(numeros).toEqual(Array.from({ length: 25 }, (_, i) => PLAGE_EN_LIGNE.debut + i));
  });

  it("la même référence rend le même numéro (réessai après une erreur réseau)", async () => {
    const m = monterNumerotation();
    const ref = uuid();
    const un = await m.numerotation.prendreEnLigne(demande(ref));
    const autre = await m.numerotation.prendreEnLigne(demande(uuid()));
    const encore = await m.numerotation.prendreEnLigne(demande(ref));
    expect(encore).toMatchObject({ numero: un.numero, nouveau: false });
    expect(autre.numero).toBe(un.numero + 1);
  });

  it("100 ventes simultanées : 100 numéros distincts et consécutifs", async () => {
    const m = monterNumerotation();
    const pris = await Promise.all(
      Array.from({ length: 100 }, () => m.numerotation.prendreEnLigne(demande(uuid()))),
    );
    const numeros = pris.map((p) => p.numero).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(100);
    expect(numeros).toEqual(Array.from({ length: 100 }, (_, i) => 4001 + i));
  });

  it("chaque gare, chaque jour et chaque genre a son compteur", async () => {
    const m = monterNumerotation();
    const base = await m.numerotation.prendreEnLigne(demande(uuid()));
    expect(base).toMatchObject({ numero: 4001, jour: JOUR });
    expect(
      (await m.numerotation.prendreEnLigne(demande(uuid(), { gareId: AUTRE_GARE }))).numero,
    ).toBe(4001);
    expect((await m.numerotation.prendreEnLigne(demande(uuid(), { genre: "colis" }))).numero).toBe(
      4001,
    );
    const lendemain = await m.numerotation.prendreEnLigne(
      demande(uuid(), { at: "2027-01-06T09:00:00+01:00" }),
    );
    expect(lendemain).toMatchObject({ numero: 4001, jour: "270106" });
  });

  it("le jour est celui de Douala : 23 h 30 le 5 et 00 h 30 le 6 ne sont pas le même compteur", async () => {
    const m = monterNumerotation();
    const soir = await m.numerotation.prendreEnLigne(
      demande(uuid(), { at: "2027-01-05T23:30:00+01:00" }),
    );
    const nuit = await m.numerotation.prendreEnLigne(
      demande(uuid(), { at: "2027-01-06T00:30:00+01:00" }),
    );
    expect([soir.jour, nuit.jour]).toEqual(["270105", "270106"]);
    expect([soir.numero, nuit.numero]).toEqual([4001, 4001]);
  });

  it("jamais un numéro d'appareil : le serveur n'entre pas dans 1–4000 et les appareils pas dans 4001+", async () => {
    const m = monterNumerotation();
    const { numero } = await m.numerotation.prendreEnLigne(demande(uuid()));
    expect(numero).toBeGreaterThan(4000);
    // un appareil qui sort un numéro du serveur est hors plage
    await m.plages.attribuer({ ...ATTRIBUTION_GUICHET_2 });
    const anomalies = await m.controleNumeros.enregistrer(entree(m, "g2", numero));
    expect(anomalies.map((a) => a.type)).toContain("numero_hors_plage");
    // et il entre en collision avec la vente en ligne
    expect(anomalies.map((a) => a.type)).toContain("numero_en_double");
  });

  it("plage épuisée : NumerosEnLigneEpuises, et les références déjà servies gardent leur numéro", async () => {
    const m = monterNumerotation();
    const premiere = uuid();
    await m.numerotation.prendreEnLigne(demande(premiere));
    for (let i = 1; i < 5999; i++) await m.numerotation.prendreEnLigne(demande(uuid()));
    await expect(m.numerotation.prendreEnLigne(demande(uuid()))).rejects.toBeInstanceOf(
      NumerosEnLigneEpuises,
    );
    expect(await m.numerotation.prendreEnLigne(demande(premiere))).toMatchObject({
      numero: 4001,
      nouveau: false,
    });
  });

  it("le registre garde le serveur sous un appareil à part", async () => {
    const m = monterNumerotation();
    await m.numerotation.prendreEnLigne(demande(uuid()));
    expect((await m.registre.duJour(JOUR))[0]!.appareilId).toBe(APPAREIL_SERVEUR);
  });
});
