import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEPART, DEPART_2, GUICHET_1 } from "../billetterie/testing/app-billetterie-test";
import { MS_PAR_MINUTE } from "./temps";
import { creerAppSyncTest, type AppSyncTest } from "./testing/app-sync-test";
import { AppareilTest, installerAppareil, type EvenementBrut } from "./testing/outils";

/**
 * A6 : une vente faite hors ligne, rejouée par `POST /sync/evenements`, devient un vrai billet (la même création que
 * `POST /agence/billets`), une seule fois quelle que soit la voie par laquelle l'événement arrive.
 */

let t: AppSyncTest;
let g1: AppareilTest;
let g2: AppareilTest;

beforeEach(async () => {
  t = await creerAppSyncTest();
  g1 = await installerAppareil(t, "guichet-1", { rang: 1 });
  g2 = await installerAppareil(t, "guichet-2", { rang: 2 });
});
afterEach(() => t.fermer());

const maintenant = () => t.horloge.maintenant().getTime();

async function envoyer(a: AppareilTest, evenements: EvenementBrut[], depuis = 1) {
  const lot = await a.lot(evenements, { depuis, envoyeA: maintenant() });
  const rep = await t
    .http()
    .post("/sync/evenements")
    .set("Authorization", `Bearer ${a.jeton}`)
    .send(lot);
  expect(rep.status, JSON.stringify(rep.body)).toBe(200);
  return rep.body as {
    resultats: { evenementId: string; statut: string }[];
    conflits: { billetId: string }[];
  };
}

/** Le même événement, posé directement sur la voie en ligne. */
const enLigne = (a: AppareilTest, evenement: EvenementBrut) =>
  t.http().post("/agence/billets").set("Authorization", `Bearer ${a.jeton}`).send(evenement);

const alertes = (type: string) => t.alertes.lignes.filter((l) => l.type === type);
const billets = () => [...t.billets.lignes.values()];

describe("une vente rejouée devient un billet", () => {
  it("le billet porte le numéro, le siège, le guichet, l'auteur et l'heure de l'événement", async () => {
    const at = maintenant() - 30 * MS_PAR_MINUTE;
    const vente = g1.vente({
      at,
      numeroPlage: 201,
      siege: 9,
      billetId: "11111111-1111-4111-8111-111111111111",
    });
    const rep = await envoyer(g1, [vente]);
    expect(rep.resultats[0]!.statut).toBe("accepte");

    expect(billets()).toHaveLength(1);
    const b = billets()[0]!;
    expect(b).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      numero: expect.stringMatching(/^ALP-DLA-\d{6}-0201$/),
      sequence: 201,
      departId: DEPART,
      siege: 9,
      canal: "guichet",
      guichetId: GUICHET_1,
      auteurId: g1.auteurId,
      appareilId: g1.id,
      evenementId: vente.id,
      etat: "paye",
      prix: 4000,
      creeA: vente.at,
    });
    expect(b.qr.length).toBeGreaterThan(10);
    expect((await t.inventaire.plan(DEPART)).occupes[9]).toBe(b.id);
    expect(alertes("vente_non_enregistree")).toEqual([]);
    expect(alertes("vente_atypique")).toEqual([]);
    expect(alertes("siege_en_conflit")).toEqual([]);
  });

  it("une vente de cadence devient un billet à compléter au quai", async () => {
    const vente = g1.vente({
      at: maintenant() - MS_PAR_MINUTE,
      numeroPlage: 202,
      siege: 11,
      type: "billet.vendu_cadence",
    });
    await envoyer(g1, [vente]);
    expect(billets()).toHaveLength(1);
    expect(billets()[0]).toMatchObject({ siege: 11, aCompleterAuQuai: true, canal: "guichet" });
  });

  it("un numéro de téléphone ajouté ensuite est enregistré sur le billet", async () => {
    const vente = g1.vente({ at: maintenant() - 2 * MS_PAR_MINUTE, numeroPlage: 203, siege: 12 });
    const billetId = (vente.donnees as { billetId: string }).billetId;
    const tel = g1.autre(
      "billet.telephone_ajoute",
      maintenant() - MS_PAR_MINUTE,
      { billetId, telephone: "+237655120000" },
      { type: "billet", id: billetId },
    );
    const rep = await envoyer(g1, [vente, tel]);
    expect(rep.resultats.map((r) => r.statut)).toEqual(["accepte", "accepte"]);
    expect(billets()[0]!.passagerTelephoneIndex).not.toBeNull();
    expect(alertes("vente_non_enregistree")).toEqual([]);
  });

  it("un numéro de téléphone pour un billet inconnu est journalisé et signalé", async () => {
    const tel = g1.autre(
      "billet.telephone_ajoute",
      maintenant(),
      { billetId: "22222222-2222-4222-8222-222222222222", telephone: "+237655120000" },
      { type: "billet", id: "22222222-2222-4222-8222-222222222222" },
    );
    const rep = await envoyer(g1, [tel]);
    expect(rep.resultats[0]!.statut).toBe("accepte");
    expect(alertes("vente_non_enregistree")).toHaveLength(1);
  });
});

describe("une seule fois, quelle que soit la voie", () => {
  it("le renvoi du lot ne crée pas un second billet", async () => {
    const vente = g1.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 210, siege: 3 });
    await envoyer(g1, [vente]);
    const second = await envoyer(g1, [vente]);
    expect(second.resultats[0]!.statut).toBe("deja_recu");
    expect(billets()).toHaveLength(1);
  });

  it("vendue d'abord par la synchronisation, puis envoyée à /agence/billets : même billet, rien de plus", async () => {
    const vente = g1.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 211, siege: 4 });
    await envoyer(g1, [vente]);
    const avant = billets()[0]!;
    const rep = await enLigne(g1, vente);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(rep.body.billet.billetId).toBe(avant.id);
    expect(rep.body.billet.numero).toBe(avant.numero);
    expect(billets()).toHaveLength(1);
  });

  it("vendue d'abord par /agence/billets, puis rejouée par la synchronisation : même billet, aucune alerte", async () => {
    const vente = g1.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 212, siege: 5 });
    const premiere = await enLigne(g1, vente);
    expect(premiere.status, JSON.stringify(premiere.body)).toBe(200);
    const rep = await envoyer(g1, [vente]);
    expect(rep.resultats[0]!.statut).toBe("accepte");
    expect(billets()).toHaveLength(1);
    expect(billets()[0]!.id).toBe(premiere.body.billet.billetId);
    expect((await t.inventaire.plan(DEPART)).occupes[5]).toBe(premiere.body.billet.billetId);
    expect(t.alertes.lignes.filter((l) => l.appareilId === g1.id)).toEqual([]);
  });
});

describe("conflits", () => {
  it("un siège déjà vendu en ligne reste à son billet ; la vente hors ligne est créée sans siège, à replacer", async () => {
    const enligne = g2.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 1501, siege: 14 });
    expect((await enLigne(g2, enligne)).status).toBe(200);
    const hors = g1.vente({ at: maintenant() - 20 * MS_PAR_MINUTE, numeroPlage: 220, siege: 14 });
    const rep = await envoyer(g1, [hors]);
    expect(rep.resultats[0]!.statut).toBe("accepte");

    const parId = (id: string) => billets().find((b) => b.evenementId === id)!;
    expect(parId(enligne.id).siege).toBe(14);
    expect(parId(hors.id).siege).toBeNull();
    expect(parId(hors.id).etat).toBe("paye");
    expect((await t.inventaire.plan(DEPART)).occupes[14]).toBe(parId(enligne.id).id);

    const conflits = alertes("siege_en_conflit");
    expect(conflits).toHaveLength(1);
    expect(conflits[0]).toMatchObject({ appareilId: g1.id, evenementId: hors.id });
    expect(
      t.journal.lignes.some(
        (l) =>
          l.evenement.type === "billet.a_replacer" && l.evenement.cible.id === parId(hors.id).id,
      ),
    ).toBe(true);
    // L'appareil l'apprend à la synchronisation suivante.
    const suivante = await envoyer(g1, [], 2);
    expect(suivante.conflits.map((c) => c.billetId)).toContain(parId(hors.id).id);
  });

  it("deux téléphones qui vendent le même siège : le premier geste garde le siège, l'autre billet existe sans siège", async () => {
    const premier = g1.vente({
      at: maintenant() - 40 * MS_PAR_MINUTE,
      numeroPlage: 230,
      siege: 15,
    });
    const tard = g2.vente({ at: maintenant() - 10 * MS_PAR_MINUTE, numeroPlage: 1530, siege: 15 });
    // Le plus tardif arrive le premier au serveur.
    await envoyer(g2, [tard]);
    expect(billets().find((b) => b.evenementId === tard.id)!.siege).toBe(15);
    await envoyer(g1, [premier]);

    const parEvt = (id: string) => billets().find((b) => b.evenementId === id)!;
    expect(parEvt(premier.id).siege).toBe(15);
    expect(parEvt(tard.id).siege).toBeNull();
    expect((await t.inventaire.plan(DEPART)).occupes[15]).toBe(parEvt(premier.id).id);
    expect(alertes("siege_en_conflit")).toHaveLength(1);
    expect(billets()).toHaveLength(2);
  });

  it("un numéro déjà porté par un autre billet : l'événement est journalisé, pas de second billet, alerte nominative", async () => {
    const a = g1.vente({ at: maintenant() - 5 * MS_PAR_MINUTE, numeroPlage: 240, siege: 16 });
    await envoyer(g1, [a]);
    const doublon = g1.vente({ at: maintenant() - 4 * MS_PAR_MINUTE, numeroPlage: 240, siege: 17 });
    const rep = await envoyer(g1, [doublon], 2);
    expect(rep.resultats[0]!.statut).toBe("accepte");
    expect(t.journal.lignes.some((l) => l.evenement.id === doublon.id)).toBe(true);
    expect(billets()).toHaveLength(1);
    expect(alertes("vente_non_enregistree")).toHaveLength(1);
    expect(alertes("vente_non_enregistree")[0]).toMatchObject({
      evenementId: doublon.id,
      appareilId: g1.id,
      details: { code: "NUMERO_EN_DOUBLE" },
    });
    // Le siège du billet qui n'existe pas n'est pas gardé : il peut être revendu.
  });

  it("un code de billet déjà pris dans le départ est remplacé, avec une alerte", async () => {
    const a = g1.vente({ at: maintenant() - 5 * MS_PAR_MINUTE, numeroPlage: 250, siege: 18 });
    const b = g2.vente({ at: maintenant() - 4 * MS_PAR_MINUTE, numeroPlage: 1550, siege: 19 });
    const code = (a.donnees as { codeBillet: string }).codeBillet;
    const memeCode = { ...b, donnees: { ...b.donnees, codeBillet: code } };
    await envoyer(g1, [a]);
    await envoyer(g2, [memeCode]);
    expect(billets()).toHaveLength(2);
    const deuxieme = billets().find((x) => x.evenementId === memeCode.id)!;
    expect(deuxieme.codeBillet).not.toBe(code);
    expect(deuxieme.codeBillet).toMatch(/^\d{4}$/);
    expect(alertes("vente_atypique")).toHaveLength(1);
    expect(alertes("vente_atypique")[0]).toMatchObject({
      details: { anomalies: ["code_billet_change"] },
    });
  });
});

describe("une vente déjà faite n'est jamais refusée pour un motif métier", () => {
  it("un départ inconnu : événement journalisé et alerte, aucun billet", async () => {
    const vente = g1.vente({
      at: maintenant() - MS_PAR_MINUTE,
      numeroPlage: 260,
      siege: 20,
      departId: "33333333-3333-4333-8333-333333333333",
    });
    const rep = await envoyer(g1, [vente]);
    expect(rep.resultats[0]!.statut).toBe("accepte");
    expect(t.journal.lignes.some((l) => l.evenement.id === vente.id)).toBe(true);
    expect(billets()).toHaveLength(0);
    expect(alertes("vente_non_enregistree")).toHaveLength(1);
    expect(alertes("vente_non_enregistree")[0]).toMatchObject({
      details: { code: "DEPART_INCONNU" },
    });
  });

  it("un prix qui n'est plus le tarif, un paiement incohérent : le billet est créé, une alerte atypique l'annonce", async () => {
    const vente = g1.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 261, siege: 21 });
    const donnees = vente.donnees as { prix: number; paiement: { recu: number } };
    const atypique = {
      ...vente,
      donnees: { ...donnees, prix: 3500, paiement: { ...donnees.paiement, recu: 3500 } },
    };
    await envoyer(g1, [atypique]);
    expect(billets()).toHaveLength(1);
    expect(billets()[0]).toMatchObject({ prix: 3500, siege: 21 });
    expect(alertes("vente_atypique")).toHaveLength(1);
    expect(alertes("vente_atypique")[0]!.details).toMatchObject({
      anomalies: expect.arrayContaining(["prix_hors_tarif"]),
    });
  });

  it("un numéro hors de la plage du guichet est accepté (le signalement reste celui des numéros)", async () => {
    const vente = g1.vente({ at: maintenant() - MS_PAR_MINUTE, numeroPlage: 3500, siege: 22 });
    await envoyer(g1, [vente]);
    expect(billets()).toHaveLength(1);
    expect(alertes("numero_hors_plage")).toHaveLength(1);
  });

  it("un autre départ à la même heure n'entre pas dans le conflit de siège", async () => {
    const a = g1.vente({ at: maintenant() - 3 * MS_PAR_MINUTE, numeroPlage: 270, siege: 23 });
    const b = g2.vente({
      at: maintenant() - 2 * MS_PAR_MINUTE,
      numeroPlage: 1570,
      siege: 23,
      departId: DEPART_2,
    });
    await envoyer(g1, [a]);
    await envoyer(g2, [b]);
    expect(billets().map((x) => x.siege)).toEqual([23, 23]);
    expect(alertes("siege_en_conflit")).toEqual([]);
  });
});
