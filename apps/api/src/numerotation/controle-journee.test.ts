import { describe, expect, it } from "vitest";
import { formaterNumeros } from "./controle-journee.service";
import { APPAREIL_SERVEUR } from "./regles";
import {
  AUTRE_GARE,
  COMPAGNIE,
  GARE,
  monterNumerotation,
  uuid,
  type MontageNumerotation,
} from "./testing/montage";

const JOUR = "270105";

async function marie() {
  const m = monterNumerotation();
  await m.plages.attribuer({
    appareilId: "g2",
    genre: "guichet",
    rang: 2,
    gareId: GARE,
    compagnieId: COMPAGNIE,
    titulaire: { id: "p-marie", nom: "Marie Ngono" },
  });
  await m.plages.attribuer({
    appareilId: "g3",
    genre: "guichet",
    rang: 3,
    gareId: GARE,
    compagnieId: COMPAGNIE,
    titulaire: { id: "p-paul", nom: "Paul Essomba" },
  });
  return m;
}

const vendre = async (
  m: MontageNumerotation,
  appareilId: string,
  numeros: number[],
  genre: "billet" | "colis" = "billet",
) => {
  for (const numeroPlage of numeros) {
    await m.controleNumeros.enregistrer({
      appareilId,
      jour: JOUR,
      genre,
      numeroPlage,
      evenementId: uuid(),
      plage: null,
    });
  }
};

describe("formaterNumeros", () => {
  it("regroupe les numéros qui se suivent", () => {
    expect(formaterNumeros([4, 5, 6, 10, 12, 13])).toBe("0004–0006, 0010, 0012–0013");
    expect(formaterNumeros([1001])).toBe("1001");
    expect(formaterNumeros([])).toBe("");
  });
});

describe("contrôle de fin de journée : un trou déclenche une alerte nominative", () => {
  it("une plage sans trou ne produit aucune alerte", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1002, 1003]);
    await vendre(m, "g3", [2001]);
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toEqual([]);
  });

  it("un trou nomme la personne, l'appareil, les numéros manquants et la plage", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1002, 1005, 1006, 1009]);
    await vendre(m, "g3", [2001, 2002]);
    const alertes = await m.controle.controler(JOUR, { gareId: GARE });
    expect(alertes).toHaveLength(1);
    const a = alertes[0]!;
    expect(a).toMatchObject({
      type: "trou_dans_la_plage",
      gravite: "alerte",
      appareilId: "g2",
      auteurId: "p-marie",
      gareId: GARE,
      compagnieId: COMPAGNIE,
      resolueA: null,
      creeeA: "2027-01-05T21:00:00.000+01:00",
    });
    expect(a.details).toMatchObject({
      jour: JOUR,
      genre: "billet",
      titulaire: { id: "p-marie", nom: "Marie Ngono" },
      plage: { debut: 1001, fin: 1999 },
      numerosManquants: [1003, 1004, 1007, 1008],
      nbManquants: 4,
      dernierRecu: 1009,
    });
    expect(a.details["message"]).toBe(
      "Il manque les numéros 1003–1004, 1007–1008 (billets) dans la plage 1001–1999 de Marie Ngono",
    );
  });

  it("un seul numéro manquant : message au singulier ; les colis ont leur propre alerte", async () => {
    const m = await marie();
    await vendre(m, "g3", [2001, 2003]);
    await vendre(m, "g3", [2002, 2003], "colis"); // 2001 manque aux colis
    const alertes = await m.controle.controler(JOUR, { gareId: GARE });
    const messages = alertes.map((a) => a.details["message"]).sort();
    expect(messages).toEqual([
      "Il manque le numéro 2001 (colis) dans la plage 2001–2999 de Paul Essomba",
      "Il manque le numéro 2002 (billets) dans la plage 2001–2999 de Paul Essomba",
    ]);
  });

  it("un appareil sans titulaire est désigné par son identifiant", async () => {
    const m = monterNumerotation();
    await m.plages.attribuer({
      appareilId: "g1",
      genre: "guichet",
      rang: 1,
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    await vendre(m, "g1", [1, 3]);
    const [a] = await m.controle.controler(JOUR, { gareId: GARE });
    expect(a!.auteurId).toBeNull();
    expect(a!.details["message"]).toContain("de l'appareil g1");
  });

  it("relancer le contrôle ne multiplie pas les alertes et garde leur date de création", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1003]);
    const [premiere] = await m.controle.controler(JOUR, { gareId: GARE });
    m.horloge.avancer(60 * 60_000);
    await vendre(m, "g2", [1006]); // le trou grossit
    const alertes = await m.controle.controler(JOUR, { gareId: GARE });
    expect(alertes).toHaveLength(1);
    expect(alertes[0]!.id).toBe(premiere!.id);
    expect(alertes[0]!.creeeA).toBe(premiere!.creeeA);
    expect(alertes[0]!.details["numerosManquants"]).toEqual([1002, 1004, 1005]);
    expect(m.alertesStock.lignes.size).toBe(1);
  });

  it("un trou comblé par une synchronisation tardive referme l'alerte", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1003]);
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toHaveLength(1);
    m.horloge.avancer(3 * 60 * 60_000);
    await vendre(m, "g2", [1002]); // l'appareil se synchronise enfin
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toEqual([]);
    const [fermee] = [...m.alertesStock.lignes.values()];
    expect(fermee!.resolueA).toBe("2027-01-06T00:00:00.000+01:00");
  });

  it("un trou qui revient après une résolution rouvre l'alerte", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1003]);
    await m.controle.controler(JOUR, { gareId: GARE });
    await vendre(m, "g2", [1002]);
    await m.controle.controler(JOUR, { gareId: GARE });
    await vendre(m, "g2", [1006]);
    const alertes = await m.controle.controler(JOUR, { gareId: GARE });
    expect(alertes).toHaveLength(1);
    expect(alertes[0]!.details["numerosManquants"]).toEqual([1004, 1005]);
  });

  it("chaque jour a ses alertes ; un trou d'hier ne s'efface pas aujourd'hui", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1003]);
    await m.controleNumeros.enregistrer({
      appareilId: "g2",
      jour: "270106",
      genre: "billet",
      numeroPlage: 1001,
      evenementId: uuid(),
      plage: null,
    });
    expect(await m.controle.controler("270106", { gareId: GARE })).toEqual([]);
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toHaveLength(1);
    expect(await m.controle.lister("270106", { gareId: GARE })).toEqual([]);
  });

  it("le périmètre est respecté : une autre gare ne voit ni ne referme les alertes de celle-ci", async () => {
    const m = await marie();
    await m.plages.attribuer({
      appareilId: "y1",
      genre: "guichet",
      rang: 1,
      gareId: AUTRE_GARE,
      compagnieId: COMPAGNIE,
    });
    await vendre(m, "g2", [1001, 1004]);
    await vendre(m, "y1", [1, 2, 4]);
    expect((await m.controle.controler(JOUR, { gareId: GARE })).map((a) => a.appareilId)).toEqual([
      "g2",
    ]);
    expect(
      (await m.controle.controler(JOUR, { gareId: AUTRE_GARE })).map((a) => a.appareilId),
    ).toEqual(["y1"]);
    // la compagnie voit les deux
    const toutes = await m.controle.controler(JOUR, { compagnieId: COMPAGNIE });
    expect(toutes.map((a) => a.appareilId).sort()).toEqual(["g2", "y1"]);
  });

  it("une plage libérée (appareil remplacé) ferme l'alerte qui lui restait", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1004]);
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toHaveLength(1);
    await m.plages.liberer("g2");
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toEqual([]);
  });

  it("le téléphone de secours qui reprend la plage ne crée pas de faux trou", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1002, 1003]);
    await m.plages.liberer("g2");
    await m.plages.attribuer({
      appareilId: "secours",
      genre: "guichet",
      rang: 2,
      gareId: GARE,
      compagnieId: COMPAGNIE,
      titulaire: { id: "p-marie", nom: "Marie Ngono" },
    });
    await vendre(m, "secours", [1004, 1005]);
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toEqual([]);
    expect((await m.numerotation.resume("secours", JOUR)).billets).toMatchObject({
      emis: 5,
      dernier: 1005,
      prochain: 1006,
    });
  });

  it("le secours qui réutilise un numéro déjà émis est signalé comme doublon", async () => {
    const m = await marie();
    await vendre(m, "g2", [1001, 1002]);
    await m.plages.liberer("g2");
    await m.plages.attribuer({
      appareilId: "secours",
      genre: "guichet",
      rang: 2,
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    const anomalies = await m.controleNumeros.enregistrer({
      appareilId: "secours",
      jour: JOUR,
      genre: "billet",
      numeroPlage: 1002,
      evenementId: uuid(),
      plage: { debut: 1001, fin: 1999 },
    });
    expect(anomalies.map((a) => a.type)).toEqual(["numero_en_double"]);
  });

  it("les numéros du serveur sont contrôlés aussi : un trou en ligne produit une alerte sans titulaire", async () => {
    const m = monterNumerotation();
    const at = "2027-01-05T10:00:00+01:00";
    for (let i = 0; i < 3; i++) {
      await m.numerotation.prendreEnLigne({
        gareId: GARE,
        compagnieId: COMPAGNIE,
        genre: "billet",
        at,
        reference: uuid(),
      });
    }
    expect(await m.controle.controler(JOUR, { gareId: GARE })).toEqual([]);
    // un numéro perdu (transaction annulée côté appelant) : simulé en retirant le 4002 du registre
    const registre = m.registre as unknown as { lignes: Map<string, unknown> };
    for (const cle of [...registre.lignes.keys()])
      if (cle.endsWith("|4002")) registre.lignes.delete(cle);
    const [a] = await m.controle.controler(JOUR, { gareId: GARE });
    expect(a).toMatchObject({ appareilId: null, auteurId: null, gareId: GARE });
    expect(a!.details).toMatchObject({ source: "en_ligne", numerosManquants: [4002] });
    expect(a!.details["message"]).toBe(
      "Il manque le numéro 4002 (billets en ligne) dans la plage du serveur 4001–9999",
    );
    expect(APPAREIL_SERVEUR).toBe("serveur-en-ligne");
  });
});
