import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENTETE_HORODATAGE, ENTETE_SIGNATURE, signerRecu } from "./fournisseur";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  creerAppSmsTest,
  type AppSmsTest,
} from "./testing/app-sms-test";

let t: AppSmsTest;
let guichetier: { id: string; jeton: string };
let autreGuichetier: { id: string; jeton: string };
let guichetierAilleurs: { id: string; jeton: string };
let superviseur: { id: string; jeton: string };
let patron: { id: string; jeton: string };
let patronAilleurs: { id: string; jeton: string };
let comptable: { id: string; jeton: string };
let afrimove: { id: string; jeton: string };
let voyageur: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppSmsTest();
  guichetier = await t.compte("guichetier");
  autreGuichetier = await t.compte("guichetier");
  guichetierAilleurs = await t.compte("guichetier", { compagnieId: AUTRE_COMPAGNIE });
  superviseur = await t.compte("superviseur");
  patron = await t.compte("patron", { gareId: null });
  patronAilleurs = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
  comptable = await t.compte("comptable", { gareId: null });
  afrimove = await t.compte("afrimove", { compagnieId: null, gareId: null });
  voyageur = await t.compte("voyageur", { compagnieId: null, gareId: null });
});
afterAll(() => t.fermer());

const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });

const CORPS = {
  billetId: "bil-1",
  telephone: "+237655012345",
  compagnie: "Alpha Voyages",
  origine: "Douala",
  destination: "Yaoundé",
  departA: "2027-01-05T08:30:00+01:00",
  siege: "14",
  code: "7341",
  lien: "https://afrimove.app/b/Xk3pQ9",
};

const envoyer = (jeton: string, corps: unknown) =>
  t
    .http()
    .post("/sms/billets")
    .set(avec(jeton))
    .send(corps as object);

let n = 0;
const nouveauBillet = (surcharge: Record<string, unknown> = {}) => ({
  ...CORPS,
  billetId: `bil-e2e-${++n}`,
  telephone: `+23767000${String(n).padStart(4, "0")}`,
  ...surcharge,
});

describe("POST /sms/billets", () => {
  it("exige un jeton et un rôle de vente ou de supervision", async () => {
    await t.http().post("/sms/billets").send(CORPS).expect(401);
    for (const r of [voyageur, afrimove, patron, comptable]) {
      await envoyer(r.jeton, nouveauBillet()).expect(403);
    }
  });

  it("met le billet en file (202), puis l'envoie : statut lisible, coût, audit sans numéro", async () => {
    const corps = nouveauBillet({ billetId: "bil-nominal", telephone: "655 01 23 46" });
    const res = await envoyer(guichetier.jeton, corps).expect(202);
    expect(res.body).toMatchObject({
      nouveau: true,
      message: {
        type: "billet",
        statut: "en_file",
        segments: 1,
        destinataireMasque: "+237 ••••• 346",
        compagnieId: COMPAGNIE,
        demandeurId: guichetier.id,
        reference: { type: "billet", id: "bil-nominal" },
      },
    });
    expect(res.body.message).not.toHaveProperty("destinataireChiffre");
    expect(res.body.message).not.toHaveProperty("destinataireIndex");
    expect(JSON.stringify(res.body)).not.toContain("655012346");

    await t.file.traiterPrets();
    const lu = await t
      .http()
      .get(`/sms/messages/${res.body.message.id}`)
      .set(avec(guichetier.jeton))
      .expect(200);
    expect(lu.body).toMatchObject({
      statut: "envoye",
      fournisseur: "simule",
      coutFcfa: 12,
      essais: [{ numero: 1, resultat: "accepte" }],
    });
    expect(t.fournisseur.envoyes.at(-1)).toMatchObject({
      destinataire: "+237655012346",
      expediteur: "AfriMove",
    });

    const audit = t.auditRepo.lignes.find((l) => l.action === "sms.billet_demande");
    expect(audit).toMatchObject({
      acteurId: guichetier.id,
      resultat: "succes",
      cibleId: "bil-nominal",
    });
    expect(JSON.stringify(audit?.details)).not.toContain("655012346");
    expect(JSON.stringify(audit?.details)).not.toContain("7341");
  });

  it("le superviseur peut aussi envoyer", async () => {
    await envoyer(superviseur.jeton, nouveauBillet()).expect(202);
  });

  it("un second envoi du même billet au même numéro ne renvoie rien ; « renvoi » envoie, 2 fois au plus", async () => {
    const corps = nouveauBillet();
    const a = await envoyer(guichetier.jeton, corps).expect(202);
    const b = await envoyer(guichetier.jeton, corps).expect(202);
    expect(b.body).toMatchObject({ nouveau: false, message: { id: a.body.message.id } });
    const r1 = await envoyer(guichetier.jeton, { ...corps, renvoi: true }).expect(202);
    const r2 = await envoyer(guichetier.jeton, { ...corps, renvoi: true }).expect(202);
    expect(new Set([a.body.message.id, r1.body.message.id, r2.body.message.id]).size).toBe(3);
    const r3 = await envoyer(guichetier.jeton, { ...corps, renvoi: true }).expect(429);
    expect(r3.body).toMatchObject({ code: "QUOTA_SMS", portee: "renvois" });
  });

  it.each([
    ["numéro invalide", { telephone: "12345" }, "TELEPHONE_INVALIDE"],
    ["code à 5 chiffres", { code: "73411" }, "VARIABLES_INVALIDES"],
    ["lien en http", { lien: "http://afrimove.app/b/1" }, "VARIABLES_INVALIDES"],
    ["heure sans fuseau", { departA: "2027-01-05T08:30:00" }, "VARIABLES_INVALIDES"],
    ["adresse dans le nom", { compagnie: "Alpha https://pirate.example" }, "VARIABLES_INVALIDES"],
    ["champ inconnu", { texte: "Bonjour" }, "REQUETE_INVALIDE"],
    ["billetId absent", { billetId: undefined }, "REQUETE_INVALIDE"],
    ["billetId avec espace", { billetId: "a b" }, "REQUETE_INVALIDE"],
    ["renvoi non booléen", { renvoi: "oui" }, "REQUETE_INVALIDE"],
  ])("400 : %s", async (_nom, surcharge, code) => {
    const res = await envoyer(guichetier.jeton, nouveauBillet(surcharge)).expect(400);
    expect(res.body.code).toBe(code);
  });

  it("400 : corps qui n'est pas un objet", async () => {
    await envoyer(guichetier.jeton, [1, 2]).expect(400);
  });

  it("la 400 liste les valeurs en défaut sans recopier le message", async () => {
    const res = await envoyer(guichetier.jeton, nouveauBillet({ code: "x", siege: "" })).expect(
      400,
    );
    expect(res.body.erreurs).toHaveLength(2);
  });
});

describe("GET /sms/messages/:id et /sms/billets/:billetId", () => {
  it("visible par son auteur, son superviseur, son patron et AfriMove ; introuvable pour tout autre", async () => {
    const res = await envoyer(guichetier.jeton, nouveauBillet({ billetId: "bil-droits" })).expect(
      202,
    );
    const url = `/sms/messages/${res.body.message.id}`;
    for (const r of [guichetier, superviseur, patron, afrimove]) {
      await t.http().get(url).set(avec(r.jeton)).expect(200);
    }
    for (const r of [autreGuichetier, guichetierAilleurs, patronAilleurs]) {
      await t.http().get(url).set(avec(r.jeton)).expect(404);
    }
    for (const r of [voyageur, comptable]) await t.http().get(url).set(avec(r.jeton)).expect(403);
    await t.http().get(url).expect(401);
  });

  it("404 pour un identifiant inconnu ou mal formé", async () => {
    await t
      .http()
      .get("/sms/messages/00000000-0000-4000-8000-000000000999")
      .set(avec(afrimove.jeton))
      .expect(404);
    await t.http().get("/sms/messages/pas-un-id").set(avec(afrimove.jeton)).expect(404);
  });

  it("liste les SMS d'un billet, filtrés par ce que le compte a le droit de voir", async () => {
    const corps = nouveauBillet({ billetId: "bil-liste" });
    await envoyer(guichetier.jeton, corps).expect(202);
    await envoyer(guichetier.jeton, { ...corps, renvoi: true }).expect(202);
    const vu = await t.http().get("/sms/billets/bil-liste").set(avec(guichetier.jeton)).expect(200);
    expect(vu.body.messages).toHaveLength(2);
    expect(vu.body.messages[0].creeA >= vu.body.messages[1].creeA).toBe(true);
    const autre = await t
      .http()
      .get("/sms/billets/bil-liste")
      .set(avec(autreGuichetier.jeton))
      .expect(200);
    expect(autre.body.messages).toHaveLength(0);
    const ailleurs = await t
      .http()
      .get("/sms/billets/bil-liste")
      .set(avec(patronAilleurs.jeton))
      .expect(200);
    expect(ailleurs.body.messages).toHaveLength(0);
    const chef = await t
      .http()
      .get("/sms/billets/bil-liste")
      .set(avec(superviseur.jeton))
      .expect(200);
    expect(chef.body.messages).toHaveLength(2);
  });
});

describe("GET /sms/couts (administration)", () => {
  beforeAll(async () => {
    // un billet pour l'autre compagnie, pour distinguer les périmètres
    await envoyer(guichetierAilleurs.jeton, nouveauBillet({ billetId: "bil-ailleurs" })).expect(
      202,
    );
    await t.file.traiterPrets();
  });

  it("AfriMove voit toutes les compagnies, par type, avec le prix et l'objectif de délai", async () => {
    const res = await t.http().get("/sms/couts").set(avec(afrimove.jeton)).expect(200);
    expect(res.body).toMatchObject({
      coutParSegmentFcfa: 12,
      objectifDelaiMedianMs: 5000,
      objectifAtteint: true,
    });
    expect(res.body.parType.map((l: { type: string }) => l.type)).toEqual([
      "billet",
      "code_retrait",
      "alerte_proche",
      "retard",
      "pin_provisoire",
      "systeme",
    ]);
    const billet = res.body.parType[0];
    expect(billet.libelle).toBe("Billet (QR, lien et code)");
    expect(billet.coutFcfa).toBe(billet.segments * 12);
    expect(billet.coutFcfa).toBeGreaterThan(0);

    const filtre = await t
      .http()
      .get(`/sms/couts?compagnieId=${AUTRE_COMPAGNIE}`)
      .set(avec(afrimove.jeton))
      .expect(200);
    expect(filtre.body.total.messages).toBe(1);
    expect(res.body.total.messages).toBeGreaterThan(filtre.body.total.messages);
  });

  it("le patron et le comptable ne voient que leur compagnie", async () => {
    const tout = await t.http().get("/sms/couts").set(avec(afrimove.jeton)).expect(200);
    const sien = await t.http().get("/sms/couts").set(avec(patron.jeton)).expect(200);
    const siensComptable = await t.http().get("/sms/couts").set(avec(comptable.jeton)).expect(200);
    const autre = await t.http().get("/sms/couts").set(avec(patronAilleurs.jeton)).expect(200);
    expect(autre.body.total.messages).toBe(1);
    expect(sien.body.total.messages + autre.body.total.messages).toBe(tout.body.total.messages);
    expect(siensComptable.body.total).toEqual(sien.body.total);
  });

  it("403 pour une autre compagnie, pour le terrain et pour les voyageurs", async () => {
    await t
      .http()
      .get(`/sms/couts?compagnieId=${AUTRE_COMPAGNIE}`)
      .set(avec(patron.jeton))
      .expect(403);
    for (const r of [guichetier, superviseur, voyageur]) {
      await t.http().get("/sms/couts").set(avec(r.jeton)).expect(403);
    }
    await t.http().get("/sms/couts").expect(401);
  });

  it("filtre par période (jour de Douala) et refuse une date illisible", async () => {
    const jour = await t
      .http()
      .get("/sms/couts?du=2027-01-05&au=2027-01-06")
      .set(avec(afrimove.jeton))
      .expect(200);
    expect(jour.body.total.messages).toBeGreaterThan(0);
    const hier = await t
      .http()
      .get("/sms/couts?du=2027-01-04&au=2027-01-05")
      .set(avec(afrimove.jeton))
      .expect(200);
    expect(hier.body.total.messages).toBe(0);
    await t.http().get("/sms/couts?du=demain").set(avec(afrimove.jeton)).expect(400);
  });
});

describe("GET /sms/etat", () => {
  it("réservé à AfriMove", async () => {
    const res = await t.http().get("/sms/etat").set(avec(afrimove.jeton)).expect(200);
    expect(res.body).toMatchObject({
      mode: "normal",
      fournisseurs: [{ fournisseur: "simule", circuit: "ferme", role: "principal", reel: false }],
    });
    for (const r of [patron, superviseur, guichetier]) {
      await t.http().get("/sms/etat").set(avec(r.jeton)).expect(403);
    }
  });
});

describe("POST /sms/webhooks/:fournisseur", () => {
  async function messageEnvoye() {
    const res = await envoyer(guichetier.jeton, nouveauBillet()).expect(202);
    await t.file.traiterPrets();
    const m = await t.journal.trouver(res.body.message.id);
    return { id: m!.id, idFournisseur: m!.idFournisseur! };
  }
  const appel = (corps: string, entetes: Record<string, string>, fournisseur = "simule") =>
    t
      .http()
      .post(`/sms/webhooks/${fournisseur}`)
      .set("Content-Type", "application/json")
      .set(entetes)
      .send(corps);

  it("sans jeton, avec une signature valide : met à jour le statut de livraison", async () => {
    const { id, idFournisseur } = await messageEnvoye();
    const recu = t.fournisseur.fabriquerRecu([{ idFournisseur, etat: "livre" }], {
      horodatage: t.horloge.maintenant(),
    });
    const res = await appel(recu.corpsBrut!, recu.entetes as Record<string, string>).expect(200);
    expect(res.body).toEqual({ recus: 1, appliques: 1, ignores: 0, inconnus: 0 });
    expect(await t.journal.trouver(id)).toMatchObject({ statut: "livre" });
    // le même appel rejoué est sans effet
    const bis = await appel(recu.corpsBrut!, recu.entetes as Record<string, string>).expect(200);
    expect(bis.body).toMatchObject({ appliques: 0, ignores: 1 });
  });

  it("401 : signature fausse, absente ou corps modifié ; le statut ne bouge pas", async () => {
    const { id, idFournisseur } = await messageEnvoye();
    const bon = t.fournisseur.fabriquerRecu([{ idFournisseur, etat: "non_livre" }], {
      horodatage: t.horloge.maintenant(),
    });
    const faux = t.fournisseur.fabriquerRecu([{ idFournisseur, etat: "non_livre" }], {
      horodatage: t.horloge.maintenant(),
      secret: "pirate",
    });
    await appel(faux.corpsBrut!, faux.entetes as Record<string, string>).expect(401);
    await appel(bon.corpsBrut!, {}).expect(401);
    await appel(
      bon.corpsBrut!.replace("non_livre", "livre"),
      bon.entetes as Record<string, string>,
    ).expect(401);
    expect((await t.journal.trouver(id))?.statut).toBe("envoye");
  });

  it("401 : appel trop ancien", async () => {
    const { idFournisseur } = await messageEnvoye();
    const vieux = t.fournisseur.fabriquerRecu([{ idFournisseur, etat: "livre" }], {
      horodatage: new Date(t.horloge.maintenant().getTime() - 3_600_000),
    });
    await appel(vieux.corpsBrut!, vieux.entetes as Record<string, string>).expect(401);
  });

  it("404 : fournisseur inconnu ; 400 : corps signé mais illisible", async () => {
    const recu = t.fournisseur.fabriquerRecu([], { horodatage: t.horloge.maintenant() });
    await appel(recu.corpsBrut!, recu.entetes as Record<string, string>, "pirate").expect(404);

    const corps = JSON.stringify({ pas: "des messages" });
    const h = Math.floor(t.horloge.maintenant().getTime() / 1000);
    const res = await appel(corps, {
      [ENTETE_HORODATAGE]: String(h),
      [ENTETE_SIGNATURE]: signerRecu("secret-simule-pour-les-tests-uniquement", h, corps),
    }).expect(400);
    expect(res.body.code).toBe("RECU_ILLISIBLE");
  });
});
