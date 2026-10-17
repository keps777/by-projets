import { genererCleAppareil } from "@afrimove/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppareilTest, type EvenementBrut } from "../sync/testing/outils";
import {
  COMPAGNIE,
  GARE,
  creerAppNumerotationTest,
  type AppNumerotationTest,
} from "./testing/app-numerotation-test";

/**
 * La synchronisation (AM-160) branchée sur la numérotation (AM-161) : les événements passent par
 * `POST /sync/evenements`, la plage et le registre viennent de `NumerotationModule`.
 */
let t: AppNumerotationTest;
let superviseur: { id: string; jeton: string };
const JOUR = "270105";

beforeAll(async () => {
  t = await creerAppNumerotationTest();
  superviseur = await t.compte("superviseur");
});
afterAll(() => t.fermer());

const maintenant = () => t.horloge.maintenant().getTime();
const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
let compteur = 0;

/** Un guichet : plage attribuée par l'administration, fiche déclarée, clé enrôlée. */
async function guichet(plage: { rang: number } | { debut: number; fin: number }, nom: string) {
  const id = `sync-g-${++compteur}`;
  const compte = await t.compte("guichetier", { nom });
  const attribution =
    "rang" in plage
      ? { genre: "guichet", rang: plage.rang }
      : { genre: "guichet", plage: { debut: plage.debut, fin: plage.fin } };
  const rep = await t
    .http()
    .put(`/numerotation/appareils/${id}/plage`)
    .set(avec(superviseur.jeton))
    .send({ ...attribution, titulaire: { id: compte.id, nom } });
  expect(rep.status).toBe(200);
  // la fiche de l'appareil dit « guichet 3 » : c'est l'attribution qui doit faire foi
  await t.declarer({ id, genre: "guichet", rang: 3 });
  const cle = await genererCleAppareil();
  const a = new AppareilTest(id, compte.id, compte.jeton, cle);
  const enrole = await t
    .http()
    .put(`/sync/appareils/${id}/cle`)
    .set(avec(compte.jeton))
    .send({ cle: cle.publique });
  expect(enrole.status).toBe(204);
  return { appareil: a, ordre: 1 };
}

type Guichet = Awaited<ReturnType<typeof guichet>>;

async function envoyer(g: Guichet, evenements: EvenementBrut[], depuis = g.ordre) {
  const lot = await g.appareil.lot(evenements, { depuis, envoyeA: maintenant() });
  const rep = await t.http().post("/sync/evenements").set(avec(g.appareil.jeton)).send(lot);
  if (depuis === g.ordre) g.ordre += evenements.length;
  return rep;
}

const vente = (g: Guichet, numeroPlage: number, siege: number) =>
  g.appareil.vente({ at: maintenant(), numeroPlage, siege, departId: `depart-${g.appareil.id}` });

const alertesSyncDe = (appareilId: string, type: string) =>
  t.alertesSync.lignes.filter((a) => a.appareilId === appareilId && a.type === type);

const controler = (jour = JOUR) =>
  t.http().post("/numerotation/controles").set(avec(superviseur.jeton)).send({ jour });

describe("la synchronisation utilise les plages d'AM-161", () => {
  it("la plage rendue à l'appareil est celle de l'attribution, pas celle de sa fiche", async () => {
    const g = await guichet({ debut: 1101, fin: 1200 }, "Awa Mbarga");
    const rep = await envoyer(g, []);
    expect(rep.status).toBe(200);
    expect(rep.body.appareil.plage).toEqual({ debut: 1101, fin: 1200 });
  });

  it("un numéro hors de la plage attribuée est accepté (le billet est imprimé) mais signalé", async () => {
    const g = await guichet({ debut: 1301, fin: 1400 }, "Luc Fotso");
    const dedans = vente(g, 1301, 11);
    const dehors = vente(g, 1401, 12); // dans le plan de numérotation du guichet 2... mais pas dans sa plage
    const rep = await envoyer(g, [dedans, dehors]);
    expect(rep.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "accepte",
      "accepte",
    ]);
    const hors = alertesSyncDe(g.appareil.id, "numero_hors_plage");
    expect(hors).toHaveLength(1);
    expect(hors[0]).toMatchObject({ evenementId: dehors.id, auteurId: g.appareil.auteurId });
    expect(hors[0]!.details).toMatchObject({ numeroPlage: 1401 });
  });
});

describe("unicité des numéros dans la gare", () => {
  it("deux guichets de la même gare qui sortent le même numéro : doublon nominatif, rien n'est perdu", async () => {
    const a = await guichet({ debut: 1501, fin: 1600 }, "Marie Ngono");
    const b = await guichet({ debut: 1601, fin: 1700 }, "Paul Essomba");
    const chezA = vente(a, 1505, 21);
    await envoyer(a, [chezA]);
    // b se trompe de plage et sort un numéro de a : la version en mémoire d'AM-160 ne le voyait pas
    const chezB = vente(b, 1505, 22);
    const rep = await envoyer(b, [chezB]);
    expect(rep.body.resultats[0].statut).toBe("accepte");
    const doubles = alertesSyncDe(b.appareil.id, "numero_en_double");
    expect(doubles).toHaveLength(1);
    expect(doubles[0]!.details).toMatchObject({ numeroPlage: 1505, evenementIdExistant: chezA.id });
    expect(doubles[0]).toMatchObject({
      auteurId: b.appareil.auteurId,
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    expect(alertesSyncDe(b.appareil.id, "numero_hors_plage")).toHaveLength(1);
    // a n'a aucune alerte : c'est b qui est fautif
    expect(alertesSyncDe(a.appareil.id, "numero_en_double")).toEqual([]);
  });

  it("rejouer un lot (réponse perdue) ne crée ni doublon ni alerte", async () => {
    const g = await guichet({ debut: 1701, fin: 1800 }, "Awa Mbarga");
    const evenements = [vente(g, 1701, 31), vente(g, 1702, 32)];
    const premier = await envoyer(g, evenements);
    expect(premier.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "accepte",
      "accepte",
    ]);
    const rejeu = await envoyer(g, evenements, 1);
    expect(rejeu.body.resultats.map((r: { statut: string }) => r.statut)).toEqual([
      "deja_recu",
      "deja_recu",
    ]);
    expect(alertesSyncDe(g.appareil.id, "numero_en_double")).toEqual([]);
    const resume = await t.numerotation.resume(g.appareil.id, JOUR);
    expect(resume.billets).toMatchObject({ emis: 2, trous: [] });
  });
});

describe("un trou dans une plage déclenche une alerte nominative", () => {
  it("vente hors ligne, un billet manque à la synchronisation : alerte au nom du vendeur, refermée au retour du billet", async () => {
    const g = await guichet({ debut: 1801, fin: 1900 }, "Marie Ngono");
    const v1 = vente(g, 1801, 41);
    const v2 = vente(g, 1802, 42);
    const v3 = vente(g, 1803, 43);
    const v4 = vente(g, 1804, 44);
    // l'appareil envoie 1801, 1802 et 1804 : le 1803 est resté sur le téléphone
    await envoyer(g, [v1, v2]);
    await envoyer(g, [v4]);

    const controle = await controler();
    expect(controle.status).toBe(200);
    const alerte = controle.body.find(
      (a: { appareilId: string }) => a.appareilId === g.appareil.id,
    );
    expect(alerte).toMatchObject({
      type: "trou_dans_la_plage",
      gravite: "alerte",
      auteurId: g.appareil.auteurId,
      gareId: GARE,
      details: {
        numerosManquants: [1803],
        titulaire: { nom: "Marie Ngono" },
        message: "Il manque le numéro 1803 (billets) dans la plage 1801–1900 de Marie Ngono",
      },
    });

    // le rapport du soir lit la même alerte
    const lues = await t
      .http()
      .get(`/numerotation/alertes?jour=${JOUR}`)
      .set(avec(superviseur.jeton));
    expect(lues.body.map((a: { id: string }) => a.id)).toContain(alerte.id);

    // le billet manquant arrive (rang suivant de la file) : l'alerte se referme au contrôle suivant
    const retard = await envoyer(g, [v3]);
    expect(retard.body.resultats[0].statut).toBe("accepte");
    const apres = await controler();
    expect(
      apres.body.find((a: { appareilId: string }) => a.appareilId === g.appareil.id),
    ).toBeUndefined();
  });

  it("une plage vendue sans trou jusqu'au dernier numéro ne déclenche rien", async () => {
    const g = await guichet({ debut: 1901, fin: 1905 }, "Luc Fotso");
    const evenements = [1901, 1902, 1903, 1904, 1905].map((n, i) => vente(g, n, 50 + i));
    await envoyer(g, evenements);
    const controle = await controler();
    expect(
      controle.body.find((a: { appareilId: string }) => a.appareilId === g.appareil.id),
    ).toBeUndefined();
    const resume = await t.numerotation.resume(g.appareil.id, JOUR);
    expect(resume.billets).toMatchObject({ emis: 5, prochain: null, restants: 0 });
    expect(resume.plageSansTrou).toBe(true);
  });
});

describe("branchement dans SyncModule", () => {
  it("ControleNumeros et AttributionPlages de la synchronisation sont ceux de la numérotation", () => {
    expect(t.controleNumeros.constructor.name).toBe("ControleNumerosServeur");
    expect(t.attribution.constructor.name).toBe("AttributionPlagesServeur");
  });
});
