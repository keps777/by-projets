import { voyageur } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DiffusionTempsReel } from "../billetterie/ports";
import { signerNotification, type RequeteNotification } from "./agregateur";
import { canalStatutPaiement } from "./vues";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART,
  avec,
  creerAppPaiementsTest,
  type AppPaiementsTest,
} from "./testing/app-paiements-test";

let t: AppPaiementsTest;
let v1: { id: string; jeton: string };
let v2: { id: string; jeton: string };
let guichetier: { id: string; jeton: string };
let afrimove: { id: string; jeton: string };
let patron: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppPaiementsTest();
  v1 = await t.compte("voyageur", { nom: "Mireille Kamga" });
  v2 = await t.compte("voyageur", { nom: "Jean Atangana" });
  guichetier = await t.compte("guichetier");
  afrimove = await t.compte("afrimove");
  patron = await t.compte("patron");
});
afterAll(async () => t.fermer());

beforeEach(async () => {
  // chaque test repart d'un paiement en ligne disponible
  await t.services.mode.definir(
    { id: afrimove.id, role: "afrimove", compagnieId: null, gareId: null },
    false,
    null,
  );
  t.agregateur.retablir();
});

const get = (chemin: string, j = v1.jeton) => t.http().get(chemin).set(avec(j));
const post = (chemin: string, corps: object = {}, j = v1.jeton) =>
  t.http().post(chemin).set(avec(j)).send(corps);
const put = (chemin: string, corps: object, j = afrimove.jeton) =>
  t.http().put(chemin).set(avec(j)).send(corps);

const webhook = (n: Pick<RequeteNotification, "entetes" | "corpsBrut">, fournisseur = "simule") =>
  t
    .http()
    .post(`/paiements/webhooks/${fournisseur}`)
    .set(n.entetes as Record<string, string>)
    .send(n.corpsBrut ?? "");

/** Secret par défaut de l'agrégateur simulé. */
const SECRET_SIMULE = "secret-simule-pour-les-tests-uniquement";

let prochainSiege = 10;

/** Une vraie commande de la billetterie : un siège, 4 000 F + 250 F de frais de service. */
async function commander(j = v1.jeton) {
  const r = await post(
    "/voyageur/commandes",
    { departId: DEPART, sieges: [prochainSiege++], pour: "moi" },
    j,
  );
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return voyageur.SchemaCommande.parse(r.body);
}

async function payer(commandeId: string, corps: object = { moyen: "mtn_momo" }, j = v1.jeton) {
  const r = await post(`/voyageur/commandes/${commandeId}/paiements`, corps, j);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return voyageur.SchemaPaiement.parse(r.body);
}

/** L'opérateur confirme : l'agrégateur appelle le webhook. */
async function operateurConfirme(paiementId: string, evenementId?: string) {
  const r = await webhook(
    t.agregateur.notificationDeReussite(paiementId, evenementId ? { evenementId } : {}),
  );
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as { recus: number; appliques: number; ignores: number; inconnus: number };
}

const billetsDe = async (commandeId: string) => (await t.commandes.trouver(commandeId))!.billetIds;

describe("payer en ligne : de la commande au billet", () => {
  it("MTN MoMo : demande de confirmation, webhook signé, billet émis une seule fois", async () => {
    const commande = await commander();
    expect(commande.total).toBe(4250);

    const moyens = await get("/voyageur/paiements/moyens");
    expect(moyens.status).toBe(200);
    expect(
      (moyens.body as unknown[]).map((m) => voyageur.SchemaMoyenPaiementVue.parse(m).code),
    ).toEqual(["mtn_momo", "orange_money", "carte", "proche"]);

    const p = await payer(commande.id);
    expect(p).toMatchObject({
      commandeId: commande.id,
      moyen: "mtn_momo",
      statut: "en_attente_confirmation",
      montant: 4250,
    });
    expect(p.consigne).toBeTruthy();

    // le message que reçoit l'écran d'attente suit le contrat
    const messages: unknown[] = [];
    const diffusion = t.app.get(DiffusionTempsReel) as DiffusionTempsReel & {
      souscrire(canal: string, f: (m: unknown) => void): () => void;
    };
    const arret = diffusion.souscrire(canalStatutPaiement(p.id), (m) => messages.push(m));

    const resume = await operateurConfirme(p.id);
    expect(resume).toEqual({ recus: 1, appliques: 1, ignores: 0, inconnus: 0 });
    arret();

    const apres = voyageur.SchemaPaiement.parse((await get(`/voyageur/paiements/${p.id}`)).body);
    expect(apres.statut).toBe("reussi");
    expect(await billetsDe(commande.id)).toHaveLength(1);
    const message = voyageur.SchemaMessageStatutPaiement.parse(messages.at(-1));
    expect(message).toMatchObject({
      paiementId: p.id,
      statut: "reussi",
      billetIds: await billetsDe(commande.id),
    });

    // le même webhook rejoué (l'agrégateur insiste) ne crée rien de plus
    const rejeu = await operateurConfirme(p.id);
    expect(rejeu).toMatchObject({ appliques: 0, ignores: 1 });
    expect(await billetsDe(commande.id)).toHaveLength(1);
    const cmd = await get(`/voyageur/billets/${(await billetsDe(commande.id))[0]!}`);
    expect(cmd.status).toBe(200);
    expect(voyageur.SchemaBilletVoyageur.parse(cmd.body).etat).toBe("paye");
  });

  it("le webhook arrive avant même la réponse à l'initiation : rien n'est perdu ni doublé", async () => {
    const commande = await commander();
    const p = await payer(commande.id, { moyen: "orange_money" });
    // trois notifications concurrentes de l'agrégateur, sous des identifiants différents
    const reponses = await Promise.all(
      ["a", "b", "c"].map((id) =>
        webhook(t.agregateur.notificationDeReussite(p.id, { evenementId: id })),
      ),
    );
    expect(reponses.every((r) => r.status === 200)).toBe(true);
    expect(await billetsDe(commande.id)).toHaveLength(1);
    expect(t.agregateur.appelsEncaissement).toBeGreaterThan(0);
  });

  it("carte : jeton du prestataire accepté avec adresse 3-D Secure, numéro de carte refusé", async () => {
    const commande = await commander();
    const avant = t.agregateur.appelsEncaissement;
    const refus = await post(`/voyageur/commandes/${commande.id}/paiements`, {
      moyen: "carte",
      jetonCarte: "4111 1111 1111 1111",
    });
    expect(refus.status).toBe(422);
    expect(refus.body.code).toBe("NUMERO_DE_CARTE_REFUSE");
    expect(JSON.stringify(refus.body)).not.toContain("4111");
    expect(t.agregateur.appelsEncaissement).toBe(avant);

    const p = await payer(commande.id, { moyen: "carte", jetonCarte: "tok_1NxQ7a2eZvKYlo2C" });
    expect(p.moyen).toBe("carte");
    expect(p.urlAuthentification).toMatch(/^https:\/\//);
    expect(
      JSON.stringify(t.auditRepo.lignes, (_c, v: unknown) => (typeof v === "bigint" ? "0" : v)),
    ).not.toContain("tok_1NxQ7a2eZvKYlo2C");
  });

  it("un paiement refusé par l'opérateur : échec annoncé, la commande reste payable", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    const tr = t.agregateur.terminer(p.id, "echoue", { code: "solde_insuffisant" });
    const r = await webhook(
      t.agregateur.fabriquerNotification([
        {
          id: "ech-1",
          transaction: tr.idFournisseur,
          reference: p.id,
          etat: "echoue",
          code: "solde_insuffisant",
        },
      ]),
    );
    expect(r.status).toBe(200);
    const statut = voyageur.SchemaPaiement.parse((await get(`/voyageur/paiements/${p.id}`)).body);
    expect(statut.statut).toBe("echoue");
    expect(statut.consigne).toBeTruthy();

    const nouveau = await payer(commande.id, { moyen: "orange_money" });
    expect(nouveau.id).not.toBe(p.id);
    await operateurConfirme(nouveau.id);
    expect(await billetsDe(commande.id)).toHaveLength(1);
  });

  it("webhook perdu : consulter le statut interroge l'agrégateur et finit le travail", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    t.agregateur.terminer(p.id, "reussi");
    t.horloge.avancer(25_000);

    const statut = voyageur.SchemaPaiement.parse((await get(`/voyageur/paiements/${p.id}`)).body);
    expect(statut.statut).toBe("reussi");
    expect(await billetsDe(commande.id)).toHaveLength(1);
  });

  it("le paiement d'un autre voyageur n'existe pas ; sans compte ou mauvais rôle, refusé", async () => {
    const commande = await commander();
    const p = await payer(commande.id);

    expect((await get(`/voyageur/paiements/${p.id}`, v2.jeton)).status).toBe(404);
    expect(
      (await post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "mtn_momo" }, v2.jeton))
        .status,
    ).toBe(404);
    expect((await t.http().get("/voyageur/paiements/moyens")).status).toBe(401);
    expect((await get("/voyageur/paiements/moyens", guichetier.jeton)).status).toBe(403);
    expect(
      (
        await t
          .http()
          .post(`/voyageur/commandes/${commande.id}/paiements`)
          .send({ moyen: "mtn_momo" })
      ).status,
    ).toBe(401);
  });

  it("corps invalide : refus net, rien n'est envoyé à l'agrégateur", async () => {
    const commande = await commander();
    const avant = t.agregateur.appelsEncaissement;
    for (const corps of [
      {},
      { moyen: "bitcoin" },
      { moyen: "mtn_momo", telephone: "pas un numéro" },
    ]) {
      const r = await post(`/voyageur/commandes/${commande.id}/paiements`, corps);
      expect([400, 422], JSON.stringify(r.body)).toContain(r.status);
    }
    expect(t.agregateur.appelsEncaissement).toBe(avant);
  });

  it("compagnie sans compte de reversement : pas de paiement en ligne", async () => {
    const commande = await commander();
    await t.comptesReversement.definir(COMPAGNIE, null);
    const r = await post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "mtn_momo" });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("COMPAGNIE_SANS_COMPTE");
    await t.comptesReversement.definir(COMPAGNIE, "compte-alpha");
  });
});

describe("webhook : seul l'agrégateur peut l'appeler", () => {
  it("sans signature, avec une fausse signature ou un corps modifié : 401, rien n'est appliqué", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    const vraie = t.agregateur.notificationDeReussite(p.id);

    const sans = await t
      .http()
      .post("/paiements/webhooks/simule")
      .send(vraie.corpsBrut ?? "");
    expect(sans.status).toBe(401);

    const fausse = await webhook({
      ...vraie,
      entetes: { ...vraie.entetes, "x-paiement-signature": "0".repeat(64) },
    });
    expect(fausse.status).toBe(401);
    expect(fausse.body.code).toBe("SIGNATURE_INVALIDE");

    const modifie = await webhook({
      ...vraie,
      corpsBrut: (vraie.corpsBrut ?? "").replace("4250", "1"),
    });
    expect(modifie.status).toBe(401);

    expect(await billetsDe(commande.id)).toEqual([]);
    expect(
      voyageur.SchemaPaiement.parse(
        (await t.http().get(`/voyageur/paiements/${p.id}`).set(avec(v1.jeton))).body,
      ).statut,
    ).toBe("en_attente_confirmation");
  });

  it("appel signé mais trop ancien : 401 ; agrégateur inconnu : 404 ; corps illisible : 400", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    const tr = t.agregateur.terminer(p.id, "reussi");
    const evt = [
      {
        id: "e",
        transaction: tr.idFournisseur,
        reference: p.id,
        etat: "reussi" as const,
        montant: 4250,
      },
    ];

    const ancien = t.agregateur.fabriquerNotification(evt, {
      horodatage: new Date(t.horloge.maintenant().getTime() - 10 * 60_000),
    });
    expect((await webhook(ancien)).status).toBe(401);

    expect((await webhook(t.agregateur.fabriquerNotification(evt), "inconnu")).status).toBe(404);

    // bien signé, mais ce n'est pas une notification
    const corpsBrut = JSON.stringify({ rien: true });
    const horodatage = Math.floor(t.horloge.maintenant().getTime() / 1000);
    const illisible = await webhook({
      corpsBrut,
      entetes: {
        "content-type": "application/json",
        "x-paiement-horodatage": String(horodatage),
        "x-paiement-signature": signerNotification(SECRET_SIMULE, horodatage, corpsBrut),
      },
    });
    expect(illisible.status).toBe(400);
    expect(illisible.body.code).toBe("NOTIFICATION_ILLISIBLE");

    // pas même du JSON : refusé avant d'arriver au contrôleur
    const casse = await t
      .http()
      .post("/paiements/webhooks/simule")
      .set("content-type", "application/json")
      .send("pas du json");
    expect(casse.status).toBe(400);
    expect(await billetsDe(commande.id)).toEqual([]);
  });

  it("un paiement inconnu est accepté (200) pour ne pas relancer l'agrégateur sans fin, mais compté", async () => {
    const r = await webhook(
      t.agregateur.fabriquerNotification([
        {
          id: "inconnu-1",
          transaction: "simule-enc-9999",
          reference: "rien",
          etat: "reussi",
          montant: 4250,
        },
      ]),
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ inconnus: 1, appliques: 0 });
  });
});

describe("le prix va à la compagnie, les frais à AfriMove, jamais l'inverse", () => {
  it("l'agrégateur reçoit deux lignes de reversement séparées", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    const envoye = t.agregateur.transactions.get(p.id)!.demande;
    expect(envoye.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: "compte-alpha", montantFcfa: 4000 },
      { beneficiaire: "afrimove", compteId: "afrimove", montantFcfa: 250 },
    ]);
    expect(envoye.montantFcfa).toBe(4250);
  });
});

describe("annulation d'un billet : remboursement sur le moyen d'origine", () => {
  it("le prix remboursé part de la compagnie ; les frais de service restent acquis", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    await operateurConfirme(p.id);
    const billetId = (await billetsDe(commande.id))[0]!;

    const r = await post(`/voyageur/billets/${billetId}/annulation`, {
      motif: "Changement de plan",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(voyageur.SchemaResultatAnnulation.parse(r.body)).toMatchObject({ remboursement: 4000 });

    const [rb] = await t.services.remboursements.dePaiement(p.id);
    expect(rb).toMatchObject({
      cause: "billet_annule",
      billetId,
      montant: 4000,
      statut: "demande",
      lignes: [{ beneficiaire: "compagnie", montant: 4000 }],
    });

    // le balayage envoie la demande à l'agrégateur, une seule fois
    await t.services.encaissements.balayer();
    await t.services.encaissements.balayer();
    expect(t.agregateur.remboursements.size).toBeGreaterThanOrEqual(1);
    const envoyes = [...t.agregateur.remboursements.values()].filter(
      (x) => x.demande.idFournisseurPaiement === t.agregateur.transactions.get(p.id)!.idFournisseur,
    );
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]!.demande).toMatchObject({
      montantFcfa: 4000,
      lignes: [{ beneficiaire: "compagnie", montantFcfa: 4000 }],
    });
    expect((await t.services.remboursements.dePaiement(p.id))[0]!.statut).toBe("reussi");
  });
});

describe("demander à un proche de payer", () => {
  it("lien, aperçu public, paiement sans compte, billet pour le voyageur", async () => {
    const commande = await commander();
    const lien = await post(`/voyageur/commandes/${commande.id}/lien-proche`, {
      telephone: "+237677012345",
    });
    expect(lien.status, JSON.stringify(lien.body)).toBe(201);
    const l = voyageur.SchemaLienProche.parse(lien.body);
    expect(l.envoyeA).toBe("+237677012345");
    const jeton = l.url.slice(l.url.lastIndexOf("/") + 1);

    // le proche n'a pas de compte : aucune authentification
    const apercu = await t.http().get(`/paiements/liens/${jeton}`);
    expect(apercu.status).toBe(200);
    expect(apercu.body).toMatchObject({ total: 4250, voyageur: "Mireille", payable: true });
    expect(JSON.stringify(apercu.body)).not.toContain(v1.id);

    const paye = await t
      .http()
      .post(`/paiements/liens/${jeton}/paiements`)
      .send({ moyen: "mtn_momo", telephone: "+237677012345" });
    expect(paye.status, JSON.stringify(paye.body)).toBe(201);
    const p = voyageur.SchemaPaiement.parse(paye.body);

    await operateurConfirme(p.id);
    const suivi = await t.http().get(`/paiements/liens/${jeton}/paiements/${p.id}`);
    expect(voyageur.SchemaPaiement.parse(suivi.body).statut).toBe("reussi");
    expect(await billetsDe(commande.id)).toHaveLength(1);
    const billet = await get(`/voyageur/billets/${(await billetsDe(commande.id))[0]!}`);
    expect(billet.status).toBe(200);

    // le lien ne sert plus
    const encore = await t
      .http()
      .post(`/paiements/liens/${jeton}/paiements`)
      .send({ moyen: "mtn_momo", telephone: "+237677012345" });
    expect(encore.status).toBe(409);
    expect(encore.body.code).toBe("COMMANDE_DEJA_PAYEE");
  });

  it("jeton deviné : 404 ; lien remplacé : 404 ; lien périmé : 410", async () => {
    const commande = await commander();
    const a = voyageur.SchemaLienProche.parse(
      (await post(`/voyageur/commandes/${commande.id}/lien-proche`)).body,
    );
    const b = voyageur.SchemaLienProche.parse(
      (await post(`/voyageur/commandes/${commande.id}/lien-proche`)).body,
    );
    const jetonA = a.url.slice(a.url.lastIndexOf("/") + 1);
    const jetonB = b.url.slice(b.url.lastIndexOf("/") + 1);

    expect((await t.http().get(`/paiements/liens/${"x".repeat(43)}`)).status).toBe(404);
    expect((await t.http().get(`/paiements/liens/${jetonA}`)).status).toBe(404);
    expect((await t.http().get(`/paiements/liens/${jetonB}`)).status).toBe(200);

    t.horloge.avancer(16 * 60_000);
    const perime = await t
      .http()
      .post(`/paiements/liens/${jetonB}/paiements`)
      .send({ moyen: "mtn_momo", telephone: "+237677012345" });
    expect(perime.status).toBe(410);
    expect(perime.body.code).toBe("LIEN_EXPIRE");
    t.horloge.avancer(-16 * 60_000);
  });
});

describe("push MoMo au guichet", () => {
  it("tout va à la compagnie ; le double envoi ne débite qu'une fois ; la référence sert à la vente", async () => {
    const corps = {
      moyen: "mtn_momo",
      telephone: "+237677012345",
      montant: 4000,
      cle: "vente-e2e-1",
    };
    const avant = t.agregateur.appelsEncaissement;
    const r = await post("/paiements/guichet", corps, guichetier.jeton);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({
      moyen: "mtn_momo",
      statut: "en_attente_confirmation",
      montant: 4000,
      referenceOperateur: null,
    });

    const encore = await post("/paiements/guichet", corps, guichetier.jeton);
    expect(encore.body.id).toBe(r.body.id);
    expect(encore.status).toBe(201);
    // le second envoi rejoue la même référence : l'agrégateur n'est contacté qu'une fois
    expect(t.agregateur.appelsEncaissement).toBe(avant + 1);
    const envoye = t.agregateur.transactions.get(r.body.id as string)!.demande;
    expect(envoye.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: "compte-alpha", montantFcfa: 4000 },
    ]);

    expect((await webhook(t.agregateur.notificationDeReussite(r.body.id as string))).status).toBe(
      200,
    );
    const statut = await get(`/paiements/guichet/${r.body.id as string}`, guichetier.jeton);
    expect(statut.body).toMatchObject({ statut: "reussi" });
    expect(statut.body.referenceOperateur).toMatch(/^MP/);

    // un voyageur n'a pas accès au guichet
    expect((await post("/paiements/guichet", corps, v1.jeton)).status).toBe(403);
    expect((await get(`/paiements/guichet/${r.body.id as string}`, v1.jeton)).status).toBe(403);
  });
});

describe("mode dégradé : on encaisse à la gare", () => {
  it("coupé par AfriMove : le paiement en ligne est refusé, le guichetier encaisse, les billets sortent une seule fois", async () => {
    const commande = await commander();
    const sansToken = await put("/paiements/mode-degrade", { actif: true }, "faux");
    expect(sansToken.status).toBe(401);
    expect((await put("/paiements/mode-degrade", { actif: true }, patron.jeton)).status).toBe(403);
    const activation = await put("/paiements/mode-degrade", {
      actif: true,
      motif: "Agrégateur en maintenance",
    });
    expect(activation.status, JSON.stringify(activation.body)).toBe(200);

    const mode = await get("/paiements/mode");
    expect(mode.body).toMatchObject({ degrade: true, raison: "reglage" });
    expect(mode.body.consigne).toBeTruthy();
    expect((await get("/voyageur/paiements/moyens")).body).toEqual([]);
    const avant = t.agregateur.appelsEncaissement;
    const refus = await post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "mtn_momo" });
    expect(refus.status).toBe(503);
    expect(refus.body.code).toBe("MODE_DEGRADE");
    expect(t.agregateur.appelsEncaissement).toBe(avant);

    const aEncaisser = await get(`/paiements/commandes/${commande.id}`, guichetier.jeton);
    expect(aEncaisser.status).toBe(200);
    expect(aEncaisser.body).toMatchObject({ commandeId: commande.id, total: 4250 });

    const encaisse = await post(
      `/paiements/commandes/${commande.id}/encaissement`,
      { mode: "especes" },
      guichetier.jeton,
    );
    expect(encaisse.status, JSON.stringify(encaisse.body)).toBe(201);
    expect(encaisse.body).toMatchObject({
      commandeId: commande.id,
      moyen: "especes_agence",
      statut: "reussi",
    });
    expect(encaisse.body.billetIds).toHaveLength(1);

    // l'agence rejoue la saisie : le même paiement, pas de nouveau billet
    const rejeu = await post(
      `/paiements/commandes/${commande.id}/encaissement`,
      { mode: "especes" },
      guichetier.jeton,
    );
    expect(rejeu.status).toBe(201);
    expect(rejeu.body.paiementId).toBe(encaisse.body.paiementId);
    expect(await billetsDe(commande.id)).toHaveLength(1);
    // aucun appel à l'agrégateur, et la gare garde l'argent
    expect(t.agregateur.appelsEncaissement).toBe(avant);
  });

  it("MoMo marchand de l'agence : la référence est obligatoire ; réservé aux guichets de la compagnie", async () => {
    const commande = await commander();
    await put("/paiements/mode-degrade", { actif: true });

    const sansReference = await post(
      `/paiements/commandes/${commande.id}/encaissement`,
      { mode: "momo_marchand" },
      guichetier.jeton,
    );
    expect(sansReference.status).toBe(422);
    expect(sansReference.body.code).toBe("REFERENCE_REQUISE");

    const autre = await t.compte("guichetier", { compagnieId: AUTRE_COMPAGNIE });
    expect((await get(`/paiements/commandes/${commande.id}`, autre.jeton)).status).toBe(404);
    expect(
      (
        await post(
          `/paiements/commandes/${commande.id}/encaissement`,
          { mode: "especes" },
          v1.jeton,
        )
      ).status,
    ).toBe(403);

    const ok = await post(
      `/paiements/commandes/${commande.id}/encaissement`,
      { mode: "momo_marchand", reference: "MP240101.1234.A56789" },
      guichetier.jeton,
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });

  it("en mode normal l'encaissement à la gare est refusé", async () => {
    const commande = await commander();
    const r = await post(
      `/paiements/commandes/${commande.id}/encaissement`,
      { mode: "especes" },
      guichetier.jeton,
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("MODE_NORMAL");
  });

  it("l'agrégateur tombe : après quelques échecs le mode dégradé s'active seul", async () => {
    t.agregateur.mettreEnPanne();
    for (let i = 0; i < 3; i++) {
      const c = await commander();
      await post(`/voyageur/commandes/${c.id}/paiements`, { moyen: "mtn_momo" });
    }
    const mode = await get("/paiements/mode");
    expect(mode.body).toMatchObject({ degrade: true, raison: "agregateur_indisponible" });

    const etat = await get("/paiements/etat", afrimove.jeton);
    expect(etat.status).toBe(200);
    expect(etat.body.circuit).toMatchObject({ circuit: "ouvert" });
    expect((await get("/paiements/etat", patron.jeton)).status).toBe(403);

    // l'agrégateur revient : après 30 s le circuit laisse passer un essai qui le referme
    t.agregateur.retablir();
    t.horloge.avancer(31_000);
    await payer((await commander()).id);
    expect((await get("/paiements/mode")).body).toMatchObject({ degrade: false });
  });
});

describe("rapprochement, comptes de reversement, remboursement manuel", () => {
  it("références opérateur : patron et AfriMove voient les paiements, numéros masqués", async () => {
    const commande = await commander();
    const p = await payer(commande.id, { moyen: "mtn_momo", telephone: "+237677012345" });
    await operateurConfirme(p.id);

    const r = await get("/paiements/references", patron.jeton);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const ligne = (r.body.paiements as Array<Record<string, unknown>>).find((x) => x.id === p.id)!;
    expect(ligne).toMatchObject({
      moyen: "mtn_momo",
      statut: "reussi",
      montant: 4250,
      repartition: [
        { beneficiaire: "compagnie", montant: 4000 },
        { beneficiaire: "afrimove", montant: 250 },
      ],
      telephoneMasque: "+237 ••••• 345",
    });
    expect(ligne.referenceOperateur).toMatch(/^MP/);
    expect(JSON.stringify(r.body)).not.toContain("677012345");
    expect((await get("/paiements/references", afrimove.jeton)).status).toBe(200);
    expect((await get("/paiements/references", guichetier.jeton)).status).toBe(403);
    expect((await get("/paiements/references", v1.jeton)).status).toBe(403);
  });

  it("compte de reversement : réservé à AfriMove, compagnie inconnue refusée", async () => {
    expect(
      (await put(`/paiements/comptes-reversement/${AUTRE_COMPAGNIE}`, { compteId: "compte-elite" }))
        .body,
    ).toEqual({
      compagnieId: AUTRE_COMPAGNIE,
      configure: true,
    });
    expect(
      (await put(`/paiements/comptes-reversement/${AUTRE_COMPAGNIE}`, { compteId: null })).body
        .configure,
    ).toBe(false);
    expect(
      (
        await put(
          `/paiements/comptes-reversement/${AUTRE_COMPAGNIE}`,
          { compteId: "x" },
          patron.jeton,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await put("/paiements/comptes-reversement/00000000-0000-4000-8000-0000000000ff", {
          compteId: "x",
        })
      ).status,
    ).toBe(404);
  });

  it("remboursement manuel : idempotent, plafonné par bénéficiaire, réservé à AfriMove", async () => {
    const commande = await commander();
    const p = await payer(commande.id);
    await operateurConfirme(p.id);

    const corps = {
      montantCompagnie: 1000,
      montantAfrimove: 0,
      motif: "Geste commercial",
      cle: "geste-001",
    };
    const un = await post(`/paiements/${p.id}/remboursements`, corps, afrimove.jeton);
    expect(un.status, JSON.stringify(un.body)).toBe(201);
    expect(un.body).toMatchObject({ montant: 1000, cause: "demande_afrimove", statut: "reussi" });
    const deux = await post(`/paiements/${p.id}/remboursements`, corps, afrimove.jeton);
    expect(deux.body.id).toBe(un.body.id);

    expect(
      JSON.stringify(t.auditRepo.lignes, (_c, v: unknown) => (typeof v === "bigint" ? "0" : v)),
    ).toContain("Geste commercial");

    const trop = await post(
      `/paiements/${p.id}/remboursements`,
      { montantCompagnie: 3001, montantAfrimove: 0, motif: "Trop", cle: "geste-002" },
      afrimove.jeton,
    );
    expect(trop.status).toBe(409);
    expect(trop.body.code).toBe("REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT");

    expect((await post(`/paiements/${p.id}/remboursements`, corps, patron.jeton)).status).toBe(403);
    expect((await post(`/paiements/inconnu/remboursements`, corps, afrimove.jeton)).status).toBe(
      404,
    );
  });
});
