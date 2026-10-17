import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENTETE_SIGNATURE, signerWebhook } from "./fournisseur";
import { JETON_VERIFICATION_SIMULE, SECRET_SIMULE } from "./fournisseur-simule";
import { VARIABLES_BILLET } from "./testing/montage";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  creerAppWhatsAppTest,
  type AppWhatsAppTest,
} from "./testing/app-whatsapp-test";

let t: AppWhatsAppTest;
let patron: { id: string; jeton: string };
let patronAilleurs: { id: string; jeton: string };
let superviseur: { id: string; jeton: string };
let guichetier: { id: string; jeton: string };
let comptable: { id: string; jeton: string };
let voyageur: { id: string; jeton: string };
let afrimove: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppWhatsAppTest();
  patron = await t.compte("patron", { gareId: null });
  patronAilleurs = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
  superviseur = await t.compte("superviseur");
  guichetier = await t.compte("guichetier");
  comptable = await t.compte("comptable", { gareId: null });
  voyageur = await t.compte("voyageur", { compagnieId: null, gareId: null });
  afrimove = await t.compte("afrimove", { compagnieId: null, gareId: null });
});
afterAll(() => t.fermer());

const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
const vider = async () => {
  for (let i = 0; i < 20; i++) {
    if ((await t.file.traiterPrets()) === 0) return;
  }
};

describe("accès", () => {
  const routes = [
    ["get", "/whatsapp/compte"],
    ["get", "/whatsapp/etat"],
    ["get", "/whatsapp/rapports/2027-01-05"],
    ["post", "/whatsapp/rapports/envoyer"],
    ["get", "/whatsapp/messages/00000000-0000-4000-8000-000000000000"],
  ] as const;

  it("exige un jeton partout, sauf sur les deux routes du webhook", async () => {
    for (const [methode, chemin] of routes) {
      await t.http()[methode](chemin).expect(401);
    }
    await t.http().get("/whatsapp/webhooks").expect(403); // ouverte, mais refuse sans jeton de vérification
    await t.http().post("/whatsapp/webhooks").expect(401); // ouverte, mais refuse sans signature
  });

  it("refuse les rôles qui ne reçoivent pas le rapport", async () => {
    for (const r of [voyageur, guichetier, comptable]) {
      for (const [methode, chemin] of routes) {
        await t.http()[methode](chemin).set(avec(r.jeton)).expect(403);
      }
    }
  });

  it("réserve l'état détaillé et la relance du rapport à AfriMove", async () => {
    for (const r of [patron, superviseur]) {
      await t.http().get("/whatsapp/etat").set(avec(r.jeton)).expect(403);
      await t
        .http()
        .post("/whatsapp/rapports/envoyer")
        .set(avec(r.jeton))
        .send({ compagnieId: COMPAGNIE })
        .expect(403);
    }
  });
});

describe("GET /whatsapp/compte", () => {
  it("rend le nom et « compte vérifié · répond en 2 min » une fois la réponse mesurée", async () => {
    const sans = await t.http().get("/whatsapp/compte").set(avec(patron.jeton)).expect(200);
    expect(sans.body).toMatchObject({
      nom: "AfriMove · Alpha Voyages",
      detail: "compte vérifié",
      verifie: true,
      delaiReponseMedianMs: null,
      mode: "normal",
    });

    // le patron pose une question (webhook), l'assistant répond 2 minutes plus tard
    const q = t.fournisseur.fabriquerWebhook({
      messages: [
        {
          idFournisseur: "wamid.q-e2e",
          de: "237655010001",
          texte: "Pourquoi le 09:30 part si vide ?",
        },
      ],
    });
    await t
      .http()
      .post("/whatsapp/webhooks")
      .set(q.entetes as Record<string, string>)
      .send(q.corpsBrut!)
      .expect(200);
    t.horloge.avancer(2 * 60_000);
    await t.passerelle.repondre({
      destinataire: "+237655010001",
      texte: "Trois jours de suite à 55 %.",
    });
    await vider();

    const res = await t.http().get("/whatsapp/compte").set(avec(patron.jeton)).expect(200);
    expect(res.body).toMatchObject({
      nom: "AfriMove · Alpha Voyages",
      detail: "compte vérifié · répond en 2 min",
      delaiReponseMedianMs: 120_000,
      reponsesMesurees: 1,
    });
    expect(
      (await t.http().get("/whatsapp/compte").set(avec(superviseur.jeton)).expect(200)).body.nom,
    ).toBe("AfriMove · Alpha Voyages");
    expect(
      (await t.http().get("/whatsapp/compte").set(avec(patronAilleurs.jeton)).expect(200)).body.nom,
    ).toBe("AfriMove · Beta Express");
    expect(
      (await t.http().get("/whatsapp/compte").set(avec(afrimove.jeton)).expect(200)).body.nom,
    ).toBe("AfriMove");
  });
});

describe("GET /whatsapp/etat", () => {
  it("rend les gabarits à soumettre et l'état de la passerelle (AfriMove)", async () => {
    const res = await t.http().get("/whatsapp/etat").set(avec(afrimove.jeton)).expect(200);
    expect(res.body.passerelle).toMatchObject({
      mode: "normal",
      fournisseur: { nom: "simule", reel: false },
      secoursSms: { voulu: true, branche: true },
    });
    expect(res.body.gabarits).toHaveLength(5);
    expect(res.body.gabaritsNonApprouves).toEqual([]);
  });
});

describe("rapport du soir : relance et suivi", () => {
  it("AfriMove relance le rapport d'une compagnie (202), c'est audité, idempotent, et les messages partent", async () => {
    const avant = t.fournisseur.envoyes.length;
    const res = await t
      .http()
      .post("/whatsapp/rapports/envoyer")
      .set(avec(afrimove.jeton))
      .send({ compagnieId: COMPAGNIE, jour: "2027-01-05" })
      .expect(202);
    expect(res.body).toEqual({
      compagnieId: COMPAGNIE,
      jour: "2027-01-05",
      destinataires: 2,
      envoyes: 2,
      dejaEnvoyes: 0,
      echecs: [],
    });
    await vider();
    expect(t.fournisseur.envoyes.length - avant).toBe(2);

    const encore = await t
      .http()
      .post("/whatsapp/rapports/envoyer")
      .set(avec(afrimove.jeton))
      .send({ compagnieId: COMPAGNIE })
      .expect(202); // jour par défaut = aujourd'hui à Douala
    expect(encore.body).toMatchObject({ envoyes: 0, dejaEnvoyes: 2 });

    const audit = t.auditRepo.lignes.filter((l) => l.action === "whatsapp.rapport_relance");
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      acteurId: afrimove.id,
      acteurRole: "afrimove",
      resultat: "succes",
    });
  });

  it("valide la demande : corps, champs inconnus, jour impossible, compagnie ou rapport inconnus", async () => {
    const post = (corps: unknown) =>
      t
        .http()
        .post("/whatsapp/rapports/envoyer")
        .set(avec(afrimove.jeton))
        .send(corps as object);
    await post({}).expect(400);
    await post({ compagnieId: COMPAGNIE, extra: 1 }).expect(400);
    await post({ compagnieId: COMPAGNIE, jour: "2027-02-30" }).expect(400);
    await post({ compagnieId: COMPAGNIE, jour: "demain" }).expect(400);
    const inconnue = await post({ compagnieId: "inconnue" }).expect(404);
    expect(inconnue.body).toMatchObject({ code: "RAPPORT_INDISPONIBLE" });
    await post({ compagnieId: COMPAGNIE, jour: "2027-01-06" }).expect(404);
  });

  it("signale une compagnie sans destinataire (409)", async () => {
    t.annuaire.definir("vide", []);
    t.source.ajouter(
      { id: "vide", nom: "Sans équipe" },
      (await t.source.rapport(COMPAGNIE, "2027-01-05"))!,
    );
    const res = await t
      .http()
      .post("/whatsapp/rapports/envoyer")
      .set(avec(afrimove.jeton))
      .send({ compagnieId: "vide" })
      .expect(409);
    expect(res.body.code).toBe("AUCUN_DESTINATAIRE");
  });

  it("le patron et le superviseur suivent le rapport de leur compagnie ; numéros masqués", async () => {
    for (const r of [patron, superviseur]) {
      const res = await t
        .http()
        .get("/whatsapp/rapports/2027-01-05")
        .set(avec(r.jeton))
        .expect(200);
      expect(res.body).toMatchObject({ compagnieId: COMPAGNIE, jour: "2027-01-05" });
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages.map((l: { destinataire: string }) => l.destinataire).sort()).toEqual(
        ["+237 ••••• 001", "+237 ••••• 002"],
      );
      expect(res.body.messages[0]).toMatchObject({ statut: "envoye", secours: "aucun" });
    }
    const autre = await t
      .http()
      .get("/whatsapp/rapports/2027-01-05")
      .set(avec(patronAilleurs.jeton))
      .expect(200);
    expect(autre.body.messages).toEqual([]); // sa compagnie n'a rien reçu : on ne voit pas celle des autres
  });

  it("cloisonne : une autre compagnie est refusée, AfriMove doit nommer la compagnie", async () => {
    await t
      .http()
      .get(`/whatsapp/rapports/2027-01-05?compagnieId=${AUTRE_COMPAGNIE}`)
      .set(avec(patron.jeton))
      .expect(403);
    await t.http().get("/whatsapp/rapports/2027-01-05").set(avec(afrimove.jeton)).expect(400);
    const res = await t
      .http()
      .get(`/whatsapp/rapports/2027-01-05?compagnieId=${COMPAGNIE}`)
      .set(avec(afrimove.jeton))
      .expect(200);
    expect(res.body.messages).toHaveLength(2);
    await t.http().get("/whatsapp/rapports/pas-un-jour").set(avec(patron.jeton)).expect(400);
  });

  it("le planificateur envoie à 21 h le rapport de chaque compagnie : patron et superviseurs", async () => {
    const avant = t.fournisseur.envoyes.length;
    t.horloge.avancer(13 * 3_600_000 - 2 * 60_000); // 21:00 à Douala (on a déjà avancé de 2 minutes)
    const traitees = await t.planificateur.tick();
    await vider();
    expect(traitees).toContain(COMPAGNIE);
    expect(traitees).toContain(AUTRE_COMPAGNIE);
    const nouveaux = t.fournisseur.envoyes
      .slice(avant)
      .map((e) => e.destinataire)
      .sort();
    // Alpha avait déjà reçu le rapport (relance de ce fichier) : seul Beta reçoit un nouveau message
    expect(nouveaux).toEqual(["+237655020001"]);
  });
});

describe("GET /whatsapp/messages/:id", () => {
  it("rend le statut et les essais d'un message de sa compagnie, 404 pour les autres", async () => {
    const { message } = await t.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: "+237655099001",
      compagnieId: COMPAGNIE,
    });
    await vider();
    for (const r of [patron, superviseur, afrimove]) {
      const res = await t
        .http()
        .get(`/whatsapp/messages/${message.id}`)
        .set(avec(r.jeton))
        .expect(200);
      expect(res.body).toMatchObject({
        id: message.id,
        type: "billet",
        statut: "envoye",
        destinataireMasque: "+237 ••••• 001",
        essais: [{ numero: 1, resultat: "accepte", code: null }],
      });
      expect(Object.keys(res.body)).not.toContain("destinataireChiffre");
      expect(Object.keys(res.body)).not.toContain("secoursChiffre");
    }
    await t
      .http()
      .get(`/whatsapp/messages/${message.id}`)
      .set(avec(patronAilleurs.jeton))
      .expect(404);
    await t.http().get("/whatsapp/messages/pas-un-identifiant").set(avec(patron.jeton)).expect(404);
  });
});

describe("repli par SMS branché par le module", () => {
  it("un refus de WhatsApp envoie le billet par SMS via le canal fourni à WhatsAppModule.avec", async () => {
    t.fournisseur.programmer({ type: "definitif", code: "pas_sur_whatsapp" });
    const avant = t.secoursSms.demandes.length;
    const { message } = await t.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: "+237655099002",
      compagnieId: COMPAGNIE,
    });
    await vider();
    expect(t.secoursSms.demandes).toHaveLength(avant + 1);
    expect(t.secoursSms.demandes.at(-1)).toMatchObject({
      type: "billet",
      destinataire: "+237655099002",
    });
    const res = await t
      .http()
      .get(`/whatsapp/messages/${message.id}`)
      .set(avec(patron.jeton))
      .expect(200);
    expect(res.body).toMatchObject({
      statut: "echec",
      secours: "sms",
      derniereErreur: "pas_sur_whatsapp",
    });
  });
});

describe("webhook", () => {
  it("GET : répond au challenge avec le bon jeton de vérification (texte brut)", async () => {
    const res = await t
      .http()
      .get("/whatsapp/webhooks")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": JETON_VERIFICATION_SIMULE,
        "hub.challenge": "1158201444",
      })
      .expect(200);
    expect(res.text).toBe("1158201444");
    expect(res.headers["content-type"]).toMatch(/^text\/plain/);
  });

  it("GET : refuse un mauvais jeton, un mode inattendu et un challenge qui ressemble à du code", async () => {
    const q = (surcharge: Record<string, string>) =>
      t
        .http()
        .get("/whatsapp/webhooks")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": JETON_VERIFICATION_SIMULE,
          "hub.challenge": "42",
          ...surcharge,
        });
    await q({ "hub.verify_token": "mauvais" }).expect(403);
    await q({ "hub.mode": "unsubscribe" }).expect(403);
    await q({ "hub.challenge": "<script>alert(1)</script>" }).expect(403);
  });

  it("POST : applique un accusé signé sur le corps brut exact et rend le résumé", async () => {
    const { message } = await t.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: "+237655099003",
      compagnieId: COMPAGNIE,
    });
    await vider();
    const wamid = (await t.passerelle.obtenir(message.id)).idFournisseur!;
    const appel = t.fournisseur.fabriquerWebhook({
      statuts: [{ idFournisseur: wamid, etat: "remis" }],
    });
    const res = await t
      .http()
      .post("/whatsapp/webhooks")
      .set(appel.entetes as Record<string, string>)
      .send(appel.corpsBrut!)
      .expect(200);
    expect(res.body).toEqual({
      statuts: { recus: 1, appliques: 1, ignores: 0, inconnus: 0 },
      messages: { recus: 0, enregistres: 0, doublons: 0, ignores: 0 },
    });
    expect((await t.passerelle.obtenir(message.id)).statut).toBe("remis");
    const suivi = await t
      .http()
      .get(`/whatsapp/messages/${message.id}`)
      .set(avec(patron.jeton))
      .expect(200);
    expect(suivi.body.statut).toBe("remis");
  });

  it("POST : une espace de plus dans le corps invalide la signature (401), rien n'est appliqué", async () => {
    const appel = t.fournisseur.fabriquerWebhook({
      statuts: [{ idFournisseur: "wamid.simule-1", etat: "lu" }],
    });
    await t
      .http()
      .post("/whatsapp/webhooks")
      .set(appel.entetes as Record<string, string>)
      .send(`${appel.corpsBrut} `)
      .expect(401);
  });

  it("POST : signature d'un autre secret, absente ou mal formée : 401", async () => {
    const corps = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const post = (entetes: Record<string, string>) =>
      t
        .http()
        .post("/whatsapp/webhooks")
        .set("content-type", "application/json")
        .set(entetes)
        .send(corps);
    await post({ [ENTETE_SIGNATURE]: signerWebhook("un-autre-secret-0123456789", corps) }).expect(
      401,
    );
    await post({}).expect(401);
    await post({ [ENTETE_SIGNATURE]: "sha256=abc" }).expect(401);
    await post({ [ENTETE_SIGNATURE]: signerWebhook(SECRET_SIMULE, corps) }).expect(200);
  });

  it("POST : un corps signé mais qui n'est pas un appel de WhatsApp est refusé en 400", async () => {
    const corps = JSON.stringify({ hello: "world" });
    await t
      .http()
      .post("/whatsapp/webhooks")
      .set("content-type", "application/json")
      .set(ENTETE_SIGNATURE, signerWebhook(SECRET_SIMULE, corps))
      .send(corps)
      .expect(400);
  });

  it("POST : un message reçu est enregistré et remis à l'assistant (route publique, sans jeton)", async () => {
    const avant = t.gestionnaire.recus.length;
    const appel = t.fournisseur.fabriquerWebhook({
      messages: [{ idFournisseur: "wamid.in-e2e-2", de: "237655010002", texte: "Et pour Mvan ?" }],
    });
    const res = await t
      .http()
      .post("/whatsapp/webhooks")
      .set(appel.entetes as Record<string, string>)
      .send(appel.corpsBrut!)
      .expect(200);
    expect(res.body.messages).toMatchObject({ enregistres: 1 });
    expect(t.gestionnaire.recus).toHaveLength(avant + 1);
    expect(t.gestionnaire.recus.at(-1)).toMatchObject({
      de: "+237655010002",
      texte: "Et pour Mvan ?",
    });
  });
});
