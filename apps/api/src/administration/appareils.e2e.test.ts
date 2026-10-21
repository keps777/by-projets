import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Le client du kiosque (apps/web) : même code que celui qui tourne dans le téléphone, sans dépendance.
import {
  DOUALA_AKWA,
  YAOUNDE_MVAN,
  creerAppAdminTest,
  type AppAdminTest,
} from "./testing/app-admin-test";

/**
 * Appareils et effacement à distance en HTTP : déclaration signée, rang de guichet unique par gare, enrôlement par
 * code à usage unique, lecture des ordres par l'appareil, accusé de réception une seule fois, secrets révoqués.
 */

/** Forme du rapport d'effacement de `apps/web/src/kiosque/canal.ts`. */
interface RapportEffacement {
  effaceA: string;
  complet: boolean;
  etapes: { nom: string; ok: boolean; detail?: string }[];
}

/**
 * Le client du kiosque (`apps/web`) est chargé à l'exécution : le compiler avec l'API (sans les types du navigateur)
 * échouerait, et il n'a besoin d'aucun type ici.
 */
async function chargerCanal(): Promise<{
  creerCanalHttp: (o: {
    urlBase: string;
    entetes: () => Record<string, string>;
    fetch: typeof fetch;
  }) => {
    prochaineCommande(id: string): Promise<{ id: string; type: string } | null>;
    acquitter(id: string, c: { id: string; type: string }, r: RapportEffacement): Promise<void>;
  };
}> {
  const chemin = "../../../web/src/kiosque/canal";
  return import(/* @vite-ignore */ chemin);
}

let t: AppAdminTest;
let patronJeton: string;
let superviseurAkwa: string;
let superviseurYaounde: string;

const JOLI_CODE = /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;

beforeAll(async () => {
  t = await creerAppAdminTest();
  patronJeton = (await t.compte("patron", { gareId: null })).jeton;
  superviseurAkwa = (await t.compte("superviseur", { gareId: DOUALA_AKWA })).jeton;
  superviseurYaounde = (await t.compte("superviseur", { gareId: YAOUNDE_MVAN })).jeton;
});

afterAll(async () => {
  await t.fermer();
});

const declarer = (corps: Record<string, unknown>, jeton = patronJeton) =>
  t
    .http()
    .post("/admin/appareils")
    .set(t.auth(jeton))
    .send({ genre: "guichet", rang: 1, gareId: DOUALA_AKWA, signature: t.signature(), ...corps });

const signe = () => ({ signature: t.signature() });

async function appareilEnrole(corps: Record<string, unknown> = {}, jeton = patronJeton) {
  const d = await declarer(corps, jeton);
  expect(d.status, JSON.stringify(d.body)).toBe(201);
  const e = await t.http().post("/appareils/enrolement").send({ code: d.body.codeEnrolement });
  expect(e.status, JSON.stringify(e.body)).toBe(200);
  return {
    id: d.body.appareil.id as string,
    secret: e.body.secret as string,
    code: d.body.codeEnrolement as string,
  };
}

const bearer = (secret: string) => ({ Authorization: `Bearer ${secret}` });

describe("déclaration d'un appareil", () => {
  it("exige la signature PIN et un compte patron ou superviseur", async () => {
    expect((await declarer({ signature: undefined })).body.code).toBe("PIN_REQUIS");
    expect((await declarer({ signature: t.signature("000000") })).body.code).toBe("PIN_INCORRECT");
    const guichetier = (await t.compte("guichetier")).jeton;
    expect((await declarer({}, guichetier)).status).toBe(403);
    expect((await t.http().get("/admin/appareils")).status).toBe(401);
  });

  it("déclare un guichet : fiche de synchronisation, plage de numéros, code d'enrôlement à usage unique", async () => {
    const r = await declarer({ libelle: "Guichet 1 Akwa" });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.codeEnrolement).toMatch(JOLI_CODE);
    expect(Date.parse(r.body.codeExpireA) - t.horloge.maintenant().getTime()).toBe(24 * 3_600_000);
    expect(r.body.appareil).toMatchObject({
      genre: "guichet",
      rang: 1,
      plage: { debut: 1, fin: 999 },
      gareId: DOUALA_AKWA,
      libelle: "Guichet 1 Akwa",
      enrole: false,
      retire: false,
      derniereCommande: null,
    });
    // La synchronisation connaît l'appareil : même identifiant, mêmes rang et gare.
    const fiche = await t.appareilsSync.trouver(r.body.appareil.id);
    expect(fiche).toMatchObject({ genre: "guichet", rang: 1, gareId: DOUALA_AKWA, retire: false });
    // Le code n'entre jamais au journal d'audit.
    expect(t.journalEnTexte()).toContain("appareil.declarer");
    expect(t.journalEnTexte()).not.toContain(r.body.codeEnrolement);
  });

  it("deux guichets d'une gare n'ont pas le même rang : ils auraient la même plage de numéros", async () => {
    const r = await declarer({ rang: 1 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("RANG_PRIS");
    expect((await declarer({ rang: 2 })).status).toBe(201);
    // Une autre gare repart de 1.
    expect((await declarer({ rang: 1, gareId: YAOUNDE_MVAN })).status).toBe(201);
  });

  it("refuse un rang sans plage, un rang absent, un champ en trop", async () => {
    expect((await declarer({ rang: 4 })).body.code).toBe("RANG_INVALIDE");
    expect((await declarer({ rang: undefined })).body.code).toBe("RANG_REQUIS");
    expect((await declarer({ rang: 3, nbConvoyeurs: 2 })).body.code).toBe("APPAREIL_INVALIDE");
    expect((await declarer({ rang: 3, couleur: "bleu" })).body.code).toBe("COMMANDE_INVALIDE");
    expect((await declarer({ gareId: "00000000-0000-4000-8000-0000000000ff" })).body.code).toBe(
      "GARE_INCONNUE",
    );
  });

  it("partage 3001–3999 entre les convoyeurs d'une gare : même nombre pour tous, un rang chacun", async () => {
    const un = await declarer({ genre: "convoyeur", rang: 1, nbConvoyeurs: 3 });
    expect(un.status, JSON.stringify(un.body)).toBe(201);
    expect(un.body.appareil.plage).toEqual({ debut: 3001, fin: 3333 });
    expect(
      (await declarer({ genre: "convoyeur", rang: 2, nbConvoyeurs: 3 })).body.appareil.plage,
    ).toEqual({
      debut: 3334,
      fin: 3666,
    });
    expect((await declarer({ genre: "convoyeur", rang: 3, nbConvoyeurs: 4 })).body.code).toBe(
      "NB_CONVOYEURS_DIFFERENT",
    );
    expect((await declarer({ genre: "convoyeur", rang: 1, nbConvoyeurs: 3 })).body.code).toBe(
      "RANG_PRIS",
    );
    expect((await declarer({ genre: "convoyeur", rang: 4, nbConvoyeurs: 3 })).body.code).toBe(
      "RANG_INVALIDE",
    );
    expect((await declarer({ genre: "convoyeur", rang: 1 })).body.code).toBe(
      "NB_CONVOYEURS_REQUIS",
    );
  });

  it("un appareil « autre » n'a ni rang ni plage et peut être déclaré plusieurs fois", async () => {
    const r = await declarer({ genre: "autre", rang: undefined });
    expect(r.status).toBe(201);
    expect(r.body.appareil.plage).toBeNull();
    expect((await declarer({ genre: "autre", rang: undefined })).status).toBe(201);
  });

  it("deux déclarations simultanées du même rang : une seule passe", async () => {
    const reponses = await Promise.all([
      declarer({ rang: 3, gareId: DOUALA_AKWA }),
      declarer({ rang: 3, gareId: DOUALA_AKWA }),
      declarer({ rang: 3, gareId: DOUALA_AKWA }),
    ]);
    expect(reponses.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it("un superviseur ne déclare et ne voit que les appareils de sa gare", async () => {
    expect((await declarer({ gareId: YAOUNDE_MVAN, rang: 2 }, superviseurAkwa)).status).toBe(403);
    const chez = await declarer(
      { genre: "autre", rang: undefined, libelle: "Imprimante" },
      superviseurAkwa,
    );
    expect(chez.status).toBe(201);
    const vus = await t.http().get("/admin/appareils").set(t.auth(superviseurYaounde));
    expect(vus.body.every((a: { gareId: string }) => a.gareId === YAOUNDE_MVAN)).toBe(true);
    expect(vus.body.length).toBeGreaterThan(0);
    const tous = await t.http().get("/admin/appareils").set(t.auth(patronJeton));
    expect(tous.body.length).toBeGreaterThan(vus.body.length);
    expect(
      (
        await t
          .http()
          .post(`/admin/appareils/${chez.body.appareil.id}/retrait`)
          .set(t.auth(superviseurYaounde))
          .send(signe())
      ).status,
    ).toBe(403);
  });
});

describe("enrôlement par code", () => {
  it("donne au client de quoi composer son identité : codes agence et gare, genre, rang et plage", async () => {
    const d = await declarer({ rang: 3, gareId: YAOUNDE_MVAN, libelle: "Guichet 3" });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    const e = await t.http().post("/appareils/enrolement").send({ code: d.body.codeEnrolement });
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({
      agence: "ALP",
      gare: "YDE",
      genre: "guichet",
      rang: 3,
      plage: { debut: 2001, fin: 2999 },
      libelle: "Guichet 3",
    });
    const autre = await declarer({ genre: "autre", rang: undefined });
    const e2 = await t
      .http()
      .post("/appareils/enrolement")
      .send({ code: autre.body.codeEnrolement });
    expect(e2.body).toMatchObject({ genre: "autre", rang: null, plage: null });
  });

  it("échange le code contre le secret de l'appareil, une seule fois", async () => {
    const d = await declarer({ genre: "autre", rang: undefined });
    const e = await t.http().post("/appareils/enrolement").send({ code: d.body.codeEnrolement });
    expect(e.status).toBe(200);
    expect(e.headers["cache-control"]).toBe("no-store");
    expect(e.body).toMatchObject({
      appareilId: d.body.appareil.id,
      compagnieId: expect.any(String),
      gareId: DOUALA_AKWA,
    });
    expect(e.body.secret).toMatch(/^apd_[A-Za-z0-9_-]{40,}$/);
    const second = await t
      .http()
      .post("/appareils/enrolement")
      .send({ code: d.body.codeEnrolement });
    expect(second.status).toBe(404);
    expect(second.body.code).toBe("CODE_INCONNU");
    const liste = await t.http().get("/admin/appareils").set(t.auth(patronJeton));
    const fiche = liste.body.find((a: { id: string }) => a.id === d.body.appareil.id);
    expect(fiche).toMatchObject({ enrole: true, codeExpireA: null });
    // Ni le secret ni le code ne sont dans le journal.
    expect(t.journalEnTexte()).toContain("appareil.enroler");
    expect(t.journalEnTexte()).not.toContain(e.body.secret);
  });

  it("accepte le code saisi à la main (minuscules, espaces) et refuse ce qui n'est pas un code", async () => {
    const d = await declarer({ genre: "autre", rang: undefined });
    const saisi = (d.body.codeEnrolement as string).toLowerCase().replace("-", "  ");
    expect((await t.http().post("/appareils/enrolement").send({ code: saisi })).status).toBe(200);
    for (const code of ["", "ABC", "AAAAA-AAAAA", "0O1IL-0O1IL"]) {
      const r = await t.http().post("/appareils/enrolement").send({ code });
      expect([404, 422], code).toContain(r.status);
    }
    expect((await t.http().post("/appareils/enrolement").send({})).status).toBe(422);
  });

  it("deux téléphones qui présentent le même code en même temps : un seul est enrôlé", async () => {
    const d = await declarer({ genre: "autre", rang: undefined });
    const reponses = await Promise.all(
      [1, 2, 3].map(() =>
        t.http().post("/appareils/enrolement").send({ code: d.body.codeEnrolement }),
      ),
    );
    expect(reponses.map((r) => r.status).sort()).toEqual([200, 404, 404]);
  });

  it("un code périmé répond 410 ; un nouveau code (téléphone de secours) remplace le secret de l'ancien", async () => {
    const ancien = await appareilEnrole({ genre: "autre", rang: undefined });
    const d = await declarer({ genre: "autre", rang: undefined });
    t.horloge.avancer(25 * 3_600_000);
    const expire = await t
      .http()
      .post("/appareils/enrolement")
      .send({ code: d.body.codeEnrolement });
    expect(expire.status).toBe(410);
    expect(expire.body.code).toBe("CODE_EXPIRE");
    // Le patron en demande un autre pour ce même appareil.
    const neuf = await t
      .http()
      .post(`/admin/appareils/${d.body.appareil.id}/code`)
      .set(t.auth(patronJeton))
      .send(signe());
    expect(neuf.status, JSON.stringify(neuf.body)).toBe(201);
    expect(neuf.body.codeEnrolement).toMatch(JOLI_CODE);
    expect(neuf.body.codeEnrolement).not.toBe(d.body.codeEnrolement);
    expect(
      (await t.http().post("/appareils/enrolement").send({ code: d.body.codeEnrolement })).status,
    ).toBe(404);
    expect(
      (await t.http().post("/appareils/enrolement").send({ code: neuf.body.codeEnrolement }))
        .status,
    ).toBe(200);
    // Un téléphone de secours sur l'appareil déjà enrôlé : l'ancien secret ne lit plus rien.
    const secours = await t
      .http()
      .post(`/admin/appareils/${ancien.id}/code`)
      .set(t.auth(patronJeton))
      .send(signe());
    const nouveau = await t
      .http()
      .post("/appareils/enrolement")
      .send({ code: secours.body.codeEnrolement });
    expect(nouveau.status).toBe(200);
    expect(
      (await t.http().get(`/appareils/${ancien.id}/commande`).set(bearer(ancien.secret))).status,
    ).toBe(401);
    expect(
      (await t.http().get(`/appareils/${ancien.id}/commande`).set(bearer(nouveau.body.secret)))
        .status,
    ).toBe(200);
  });
});

describe("retrait d'un appareil", () => {
  it("révoque le secret, refuse la synchronisation et interdit un nouveau code", async () => {
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    expect((await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret))).status).toBe(
      200,
    );
    const r = await t
      .http()
      .post(`/admin/appareils/${a.id}/retrait`)
      .set(t.auth(patronJeton))
      .send(signe());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ enrole: false, retire: true, codeExpireA: null });
    expect((await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret))).status).toBe(
      401,
    );
    expect((await t.appareilsSync.trouver(a.id))?.retire).toBe(true);
    const code = await t
      .http()
      .post(`/admin/appareils/${a.id}/code`)
      .set(t.auth(patronJeton))
      .send(signe());
    expect(code.status).toBe(409);
    expect(code.body.code).toBe("APPAREIL_RETIRE");
  });

  it("libère le rang du guichet retiré pour son remplaçant", async () => {
    const a = await appareilEnrole({ rang: 2, gareId: YAOUNDE_MVAN });
    expect((await declarer({ rang: 2, gareId: YAOUNDE_MVAN })).body.code).toBe("RANG_PRIS");
    await t.http().post(`/admin/appareils/${a.id}/retrait`).set(t.auth(patronJeton)).send(signe());
    expect((await declarer({ rang: 2, gareId: YAOUNDE_MVAN })).status).toBe(201);
  });

  it("répond 404 pour un appareil inconnu, et exige la signature", async () => {
    const r = await t
      .http()
      .post("/admin/appareils/inconnu/retrait")
      .set(t.auth(patronJeton))
      .send(signe());
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("APPAREIL_INCONNU");
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    const sans = await t
      .http()
      .post(`/admin/appareils/${a.id}/retrait`)
      .set(t.auth(patronJeton))
      .send({});
    expect(sans.status).toBe(401);
    expect((await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret))).status).toBe(
      200,
    );
  });
});

describe("effacement à distance", () => {
  const effacer = (id: string, corps: Record<string, unknown> = {}, jeton = patronJeton) =>
    t
      .http()
      .post(`/admin/appareils/${id}/effacement`)
      .set(t.auth(jeton))
      .send({ signature: t.signature(), ...corps });

  const rapport = (surcharge: Partial<RapportEffacement> = {}): RapportEffacement => ({
    effaceA: t.iso(),
    complet: true,
    etapes: [
      { nom: "localStorage", ok: true },
      { nom: "indexedDB", ok: true },
    ],
    ...surcharge,
  });

  it("l'appareil ne lit rien sans son secret, et rien tant qu'aucun ordre n'attend", async () => {
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    expect((await t.http().get(`/appareils/${a.id}/commande`)).status).toBe(401);
    expect((await t.http().get(`/appareils/${a.id}/commande`).set(bearer("apd_faux"))).status).toBe(
      401,
    );
    // Le secret d'un autre appareil n'ouvre pas celui-ci.
    const b = await appareilEnrole({ genre: "autre", rang: undefined });
    expect((await t.http().get(`/appareils/${a.id}/commande`).set(bearer(b.secret))).status).toBe(
      401,
    );
    // Un jeton de compte (patron) n'est pas un secret d'appareil.
    expect(
      (await t.http().get(`/appareils/${a.id}/commande`).set(t.auth(patronJeton))).status,
    ).toBe(401);
    const vide = await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret));
    expect(vide.status).toBe(200);
    expect(vide.body).toEqual({ commande: null });
    expect(vide.headers["cache-control"]).toBe("no-store");
  });

  it("n'efface que sur ordre signé d'un patron ou d'un superviseur de la gare, et pas un appareil non enrôlé", async () => {
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    expect((await effacer(a.id, { signature: undefined })).body.code).toBe("PIN_REQUIS");
    expect((await effacer(a.id, { signature: t.signature("111111") })).body.code).toBe(
      "PIN_INCORRECT",
    );
    const guichetier = (await t.compte("guichetier")).jeton;
    expect((await effacer(a.id, {}, guichetier)).status).toBe(403);
    expect((await effacer(a.id, {}, superviseurYaounde)).status).toBe(403);
    expect((await effacer("inconnu")).status).toBe(404);
    const pasEnrole = await declarer({ genre: "autre", rang: undefined });
    const r = await effacer(pasEnrole.body.appareil.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("APPAREIL_NON_ENROLE");
    expect(
      (await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret))).body.commande,
    ).toBeNull();
  });

  it("émet l'ordre, l'appareil le lit avec son secret d'acquittement, l'accuse une seule fois, puis perd ses droits", async () => {
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    const emis = await effacer(a.id, { motif: "Téléphone volé" }, superviseurAkwa);
    expect(emis.status, JSON.stringify(emis.body)).toBe(201);
    expect(emis.body).toMatchObject({ appareilId: a.id, commandeId: expect.any(String) });
    // Un seul ordre en attente à la fois.
    const double = await effacer(a.id);
    expect(double.status).toBe(409);
    expect(double.body.code).toBe("EFFACEMENT_EN_COURS");

    const lu = await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret));
    expect(lu.status).toBe(200);
    expect(lu.body.commande).toMatchObject({
      id: emis.body.commandeId,
      type: "effacer",
      emiseA: emis.body.emiseA,
    });
    const secretAccuse = lu.body.commande.secretAcquittement as string;
    expect(secretAccuse.length).toBeGreaterThan(30);
    // Le secret d'acquittement est stable (relu, il est le même) et propre à l'ordre.
    const relu = await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret));
    expect(relu.body.commande.secretAcquittement).toBe(secretAccuse);

    const accuse = (
      secret: string,
      corps: unknown = rapport(),
      id = emis.body.commandeId as string,
    ) =>
      t
        .http()
        .post(`/appareils/${a.id}/commandes/${id}/acquittement`)
        .set(bearer(secret))
        .send(corps as object);
    // Ni le secret de l'appareil, ni un secret inventé, ni aucun secret n'acquittent.
    expect((await accuse(a.secret)).status).toBe(401);
    expect((await accuse("zzz")).status).toBe(401);
    expect(
      (
        await t
          .http()
          .post(`/appareils/${a.id}/commandes/${emis.body.commandeId}/acquittement`)
          .send(rapport())
      ).status,
    ).toBe(401);
    // Un ordre inconnu, ou celui d'un autre appareil.
    expect(
      (await accuse(secretAccuse, rapport(), "00000000-0000-4000-8000-00000000dead")).status,
    ).toBe(404);
    const autre = await appareilEnrole({ genre: "autre", rang: undefined });
    expect(
      (
        await t
          .http()
          .post(`/appareils/${autre.id}/commandes/${emis.body.commandeId}/acquittement`)
          .set(bearer(secretAccuse))
          .send(rapport())
      ).status,
    ).toBe(404);
    // Un rapport qui n'en est pas un.
    expect((await accuse(secretAccuse, { complet: true })).status).toBe(422);

    const ok = await accuse(secretAccuse);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toEqual({ enregistre: true });
    const second = await accuse(secretAccuse);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("DEJA_ACQUITTEE");

    // L'appareil est retiré : son secret ne lit plus rien, la synchronisation le refuse, l'administrateur le voit.
    expect((await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret))).status).toBe(
      401,
    );
    expect((await t.appareilsSync.trouver(a.id))?.retire).toBe(true);
    const fiche = (await t.http().get("/admin/appareils").set(t.auth(patronJeton))).body.find(
      (x: { id: string }) => x.id === a.id,
    );
    expect(fiche).toMatchObject({ enrole: false, retire: true });
    expect(fiche.derniereCommande).toMatchObject({ id: emis.body.commandeId, type: "effacer" });
    expect(fiche.derniereCommande.acquitteeA).not.toBeNull();

    const journal = t.journalEnTexte();
    expect(journal).toContain("appareil.effacer");
    expect(journal).toContain("appareil.acquitter");
    expect(journal).toContain("Téléphone volé");
    expect(journal).not.toContain(secretAccuse);
    expect(journal).not.toContain(a.secret);
  });

  it("un effacement incomplet est acquitté et tracé en échec ; l'appareil est retiré quand même", async () => {
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    const emis = await effacer(a.id);
    const lu = await t.http().get(`/appareils/${a.id}/commande`).set(bearer(a.secret));
    const r = await t
      .http()
      .post(`/appareils/${a.id}/commandes/${emis.body.commandeId}/acquittement`)
      .set(bearer(lu.body.commande.secretAcquittement))
      .send(
        rapport({
          complet: false,
          etapes: [{ nom: "indexedDB", ok: false, detail: "base ouverte" }],
        }),
      );
    expect(r.status).toBe(200);
    expect((await t.appareilsSync.trouver(a.id))?.retire).toBe(true);
    const ligne = t.auditRepo.lignes.filter((l) => l.action === "appareil.acquitter").at(-1);
    expect(ligne?.resultat).toBe("echec");
  });

  it("le client HTTP du kiosque (apps/web) parle à cette API : lecture de l'ordre puis accusé", async () => {
    const a = await appareilEnrole({ genre: "autre", rang: undefined });
    // Le canal de l'application, avec un `fetch` qui passe par l'API de test.
    const adapter: typeof fetch = async (entree, init) => {
      const url = new URL(
        typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url,
      );
      const methode = (init?.method ?? "GET").toLowerCase() as "get" | "post";
      let requete = t.http()[methode](url.pathname);
      for (const [cle, valeur] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        requete = requete.set(cle, valeur);
      }
      const reponse = await (init?.body ? requete.send(JSON.parse(String(init.body))) : requete);
      return new Response(reponse.status === 204 ? null : JSON.stringify(reponse.body), {
        status: reponse.status,
        headers: { "content-type": "application/json" },
      });
    };
    const { creerCanalHttp } = await chargerCanal();
    const canal = creerCanalHttp({
      urlBase: "http://api.test",
      entetes: () => bearer(a.secret),
      fetch: adapter,
    });
    expect(await canal.prochaineCommande(a.id)).toBeNull();
    const emis = await effacer(a.id);
    const commande = await canal.prochaineCommande(a.id);
    expect(commande).toMatchObject({ id: emis.body.commandeId, type: "effacer" });
    await canal.acquitter(a.id, commande!, rapport());
    // Un second accusé est accepté par le client (409 toléré) : il ne lève pas.
    await canal.acquitter(a.id, commande!, rapport());
    await expect(canal.prochaineCommande(a.id)).rejects.toThrow(/401/);
  });
});
