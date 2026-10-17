import { voyageur } from "@afrimove/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ErreurHttp } from "../../../../packages/api-client/src/infra/erreurs";
import { creerClientHttp } from "../../../../packages/api-client/src/infra/http";
import {
  OP_DEMANDER_CODE,
  OP_VERIFIER_CODE,
} from "../../../../packages/api-client/src/voyageur/operations";
import { ComptesService } from "../socle/comptes/comptes.service";
import { creerAppAuthTest, type AppAuthTest } from "./testing/app-auth-test";
import { autreCode } from "./testing/montage";

const TEL = "+237691221008";

let t: AppAuthTest;
beforeAll(async () => {
  t = await creerAppAuthTest();
});
afterAll(async () => t.fermer());
afterEach(() => {
  // Les tests s'enchaînent sur la même application : on repart d'une boîte et d'un compteur propres.
  t.sms.boite.length = 0;
});

const demander = (corps: object) => t.http().post("/voyageur/connexion/code").send(corps);
const verifier = (corps: object) => t.http().post("/voyageur/connexion/verification").send(corps);

let suivant = 100;
/** Un numéro neuf par test : les limites sont par numéro. */
const numero = (): string => `+23765100${String(suivant++).padStart(4, "0")}`;

describe("POST /voyageur/connexion/code", () => {
  it("répond 200 avec la forme du contrat, sans jeton", async () => {
    const tel = numero();
    const r = await demander({ telephone: tel });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(voyageur.SchemaReponseDemandeCode.parse(r.body)).toEqual({
      telephone: tel,
      canal: "sms",
      longueurCode: 4,
      renvoiDansSecondes: 40,
      expireA: "2027-01-05T08:05:00.000+01:00",
    });
    expect(t.sms.dernier()?.telephone).toBe(tel);
  });

  it("le SMS se termine par « @<domaine> #<code> » (WebOTP)", async () => {
    await demander({ telephone: numero() });
    const { texte, code } = t.sms.dernier()!;
    expect(texte.split("\n").at(-1)).toBe(`@afrimove.app #${code}`);
  });

  it("n'expose jamais le code dans la réponse", async () => {
    const r = await demander({ telephone: numero() });
    expect(JSON.stringify(r.body)).not.toContain(t.sms.dernier()!.code);
    expect(Object.keys(r.body as object).sort()).toEqual([
      "canal",
      "expireA",
      "longueurCode",
      "renvoiDansSecondes",
      "telephone",
    ]);
  });

  it("400 REQUETE_INVALIDE pour un corps mal formé, 422 pour l'USSD et un numéro étranger", async () => {
    for (const corps of [{}, { telephone: "691221008" }, { telephone: TEL, canal: "pigeon" }]) {
      const r = await demander(corps);
      expect(r.status, JSON.stringify(corps)).toBe(400);
      expect(r.body).toMatchObject({ code: "REQUETE_INVALIDE" });
      expect(typeof (r.body as { message: string }).message).toBe("string");
    }
    const ussd = await demander({ telephone: numero(), canal: "ussd" });
    expect([ussd.status, ussd.body.code]).toEqual([422, "CANAL_INDISPONIBLE"]);
    const etranger = await demander({ telephone: "+33612345678" });
    expect([etranger.status, etranger.body.code]).toEqual([422, "NUMERO_NON_AUTORISE"]);
    expect(t.sms.boite).toHaveLength(0);
  });

  it("429 avec Retry-After quand on redemande avant 40 secondes", async () => {
    const tel = numero();
    await demander({ telephone: tel });
    t.horloge.avancer(10_000);
    const r = await demander({ telephone: tel });
    expect(r.status).toBe(429);
    expect(r.headers["retry-after"]).toBe("30");
    expect(r.body).toMatchObject({
      code: "ENVOI_TROP_RAPPROCHE",
      details: { renvoiDansSecondes: 30, reessayerDansSecondes: 30 },
    });
    expect(t.sms.boite).toHaveLength(1);
  });

  it("répond de la même façon pour un numéro qui a un compte d'agence, sans lui écrire", async () => {
    const guichetier = numero();
    await t.app.get(ComptesService).creer({
      nom: "Guichetier Test",
      telephone: guichetier,
      roles: ["guichetier"],
      pin: "482915",
    });
    const inconnu = numero();
    const [a, b] = [
      await demander({ telephone: guichetier }),
      await demander({ telephone: inconnu }),
    ];
    expect([a.status, b.status]).toEqual([200, 200]);
    expect({ ...a.body, telephone: "" }).toEqual({ ...b.body, telephone: "" });
    expect(t.sms.boite.map((m) => m.telephone)).toEqual([inconnu]);
    // Même en tapant des codes au hasard, le guichetier n'obtient pas de session voyageur.
    const essai = await verifier({ telephone: guichetier, code: "0000" });
    expect(essai.status).toBe(401);
  });

  it("repli sur le SMS quand WhatsApp n'est pas branché (la réponse le dit)", async () => {
    const r = await demander({ telephone: numero(), canal: "whatsapp" });
    expect(r.status).toBe(200);
    expect(r.body.canal).toBe("sms");
    expect(t.sms.boite).toHaveLength(1);
  });
});

describe("POST /voyageur/connexion/verification", () => {
  it("ouvre la session : forme du contrat, compte créé, jeton accepté par l'API", async () => {
    const tel = numero();
    await demander({ telephone: tel });
    const code = t.sms.dernierCode();

    const r = await verifier({ telephone: tel, code });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const session = voyageur.SchemaSessionVoyageur.parse(r.body);
    expect(session.nouveauCompte).toBe(true);
    expect(session.profil.telephone).toBe(tel);
    // Première connexion = maintenant, écrit à l'heure de Douala (UTC+1).
    expect(session.profil.inscritDepuis).toBe(
      new Date(t.horloge.maintenant().getTime() + 3_600_000).toISOString().replace("Z", "+01:00"),
    );

    const moi = await t.http().get("/me").set("Authorization", `Bearer ${session.jeton}`);
    expect(moi.status, JSON.stringify(moi.body)).toBe(200);
    expect(moi.body).toMatchObject({
      id: session.profil.id,
      role: "voyageur",
      compagnieId: null,
      accesPatron: false,
    });
    // Le compte est une personne du socle, sans rôle d'agence.
    const personne = await t.personnes.trouverParId(session.profil.id);
    expect(personne?.roles).toEqual(["voyageur"]);
  });

  it("le même numéro retrouve son compte à la connexion suivante", async () => {
    const tel = numero();
    await demander({ telephone: tel });
    const premiere = voyageur.SchemaSessionVoyageur.parse(
      (await verifier({ telephone: tel, code: t.sms.dernierCode() })).body,
    );
    t.horloge.avancer(60_000);
    await demander({ telephone: tel });
    const seconde = voyageur.SchemaSessionVoyageur.parse(
      (await verifier({ telephone: tel, code: t.sms.dernierCode() })).body,
    );
    expect(seconde.nouveauCompte).toBe(false);
    expect(seconde.profil.id).toBe(premiere.profil.id);
    expect(seconde.profil.inscritDepuis).toBe(premiere.profil.inscritDepuis);
  });

  it("ignore tout ce que le corps ajoute (pas de rôle choisi par le client)", async () => {
    const tel = numero();
    await demander({ telephone: tel, role: "patron", roles: ["afrimove"] });
    const r = await verifier({
      telephone: tel,
      code: t.sms.dernierCode(),
      role: "patron",
      roles: ["afrimove"],
    });
    expect(r.status).toBe(200);
    const moi = await t.http().get("/me").set("Authorization", `Bearer ${r.body.jeton}`);
    expect(moi.body.role).toBe("voyageur");
    expect((await t.personnes.trouverParId(r.body.profil.id))?.roles).toEqual(["voyageur"]);
  });

  it("401 CODE_INVALIDE avec le nombre d'essais restants, puis 429 + Retry-After à la 5e erreur", async () => {
    const tel = numero();
    await demander({ telephone: tel });
    const mauvais = autreCode(t.sms.dernierCode());
    for (const restants of [4, 3, 2, 1]) {
      const r = await verifier({ telephone: tel, code: mauvais });
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({
        code: "CODE_INVALIDE",
        details: { essaisRestants: restants },
      });
    }
    const bloque = await verifier({ telephone: tel, code: mauvais });
    expect(bloque.status).toBe(429);
    expect(bloque.headers["retry-after"]).toBe("900");
    expect(bloque.body).toMatchObject({ code: "TROP_ESSAIS" });
    // Le bon code n'ouvre rien tant que dure l'attente, et la session n'est pas créée.
    const bon = await verifier({ telephone: tel, code: t.sms.dernierCode() });
    expect(bon.status).toBe(429);
    expect(await t.app.get(ComptesService).trouverParTelephone(tel)).toBeNull();
  });

  it("401 CODE_EXPIRE quand le code a plus de 5 minutes", async () => {
    const tel = numero();
    await demander({ telephone: tel });
    const code = t.sms.dernierCode();
    t.horloge.avancer(5 * 60_000);
    const r = await verifier({ telephone: tel, code });
    expect([r.status, r.body.code]).toEqual([401, "CODE_EXPIRE"]);
  });

  it("400 pour un code qui n'a pas 4 chiffres", async () => {
    for (const code of ["482", "48211", "abcd", 4821]) {
      const r = await verifier({ telephone: TEL, code });
      expect(r.status, String(code)).toBe(400);
    }
  });

  it("l'audit garde la trace des connexions sans code ni numéro", async () => {
    const tel = numero();
    await demander({ telephone: tel });
    const code = t.sms.dernierCode();
    await verifier({ telephone: tel, code: autreCode(code) });
    await verifier({ telephone: tel, code });
    const lignes = t.auditRepo.lignes.filter((l) => l.action.startsWith("connexion.voyageur"));
    expect(lignes.map((l) => l.action).slice(-3)).toEqual([
      "connexion.voyageur.code_demande",
      "connexion.voyageur.code",
      "connexion.voyageur",
    ]);
    const brut = JSON.stringify(lignes.map((l) => ({ ...l, seq: String(l.seq) })));
    expect(brut).not.toContain(tel);
    expect(brut).not.toContain(tel.slice(4));
    expect(brut).not.toMatch(new RegExp(`(?:#|\\best |["':])${code}(?![-\\w])`));
  });
});

describe("limitation de débit par adresse", () => {
  it("coupe au-delà de 10 requêtes par minute et par adresse", async () => {
    const limitee = await creerAppAuthTest({ config: { RATE_LIMIT_ENABLED: "true" } });
    try {
      const statuts: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await limitee
          .http()
          .post("/voyageur/connexion/code")
          .send({ telephone: numero() });
        statuts.push(r.status);
      }
      expect(statuts.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuts.slice(10)).toEqual([429, 429]);
    } finally {
      await limitee.fermer();
    }
  });
});

describe("avec le client d'API HTTP, comme la planche Connexion", () => {
  it("demande un code, le vérifie et reçoit la session validée par les schémas du contrat", async () => {
    const client = creerClientHttp({ urlBase: await t.urlBase(), relance: { max: 0 } });
    const tel = numero();
    const demande = await client.executer(OP_DEMANDER_CODE, { telephone: tel, canal: "sms" });
    expect(demande).toMatchObject({ telephone: tel, canal: "sms", longueurCode: 4 });
    expect(demande.renvoiDansSecondes).toBe(40);

    const session = await client.executer(OP_VERIFIER_CODE, {
      telephone: tel,
      code: t.sms.dernierCode(),
    });
    expect(session.nouveauCompte).toBe(true);
    expect(session.profil.telephone).toBe(tel);

    // Le jeton rend l'utilisateur reconnu par les routes réservées aux voyageurs.
    const connecte = creerClientHttp({
      urlBase: await t.urlBase(),
      obtenirJeton: () => session.jeton,
    });
    expect(connecte.mode).toBe("http");
    const moi = await fetch(`${await t.urlBase()}/me`, {
      headers: { Authorization: `Bearer ${session.jeton}` },
    });
    expect(((await moi.json()) as { role: string }).role).toBe("voyageur");
  });

  it("transmet à l'écran un mauvais code (401), puis l'attente imposée (429 + Retry-After)", async () => {
    const client = creerClientHttp({ urlBase: await t.urlBase(), relance: { max: 0 } });
    const tel = numero();
    await client.executer(OP_DEMANDER_CODE, { telephone: tel });
    const mauvais = autreCode(t.sms.dernierCode());

    const faux = await client
      .executer(OP_VERIFIER_CODE, { telephone: tel, code: mauvais })
      .catch((e: unknown) => e);
    expect(faux).toBeInstanceOf(ErreurHttp);
    expect(faux).toMatchObject({
      statut: 401,
      code: "CODE_INVALIDE",
      details: { essaisRestants: 4 },
    });

    for (let i = 0; i < 3; i++) {
      await client.executer(OP_VERIFIER_CODE, { telephone: tel, code: mauvais }).catch(() => null);
    }
    const bloque = await client
      .executer(OP_VERIFIER_CODE, { telephone: tel, code: mauvais })
      .catch((e: unknown) => e);
    expect(bloque).toMatchObject({ statut: 429, code: "TROP_ESSAIS", reessayerApresMs: 900_000 });
  });

  it("transmet l'attente avant un renvoi (429 + Retry-After)", async () => {
    const client = creerClientHttp({ urlBase: await t.urlBase(), relance: { max: 0 } });
    const tel = numero();
    await client.executer(OP_DEMANDER_CODE, { telephone: tel });
    const trop = await client
      .executer(OP_DEMANDER_CODE, { telephone: tel })
      .catch((e: unknown) => e);
    expect(trop).toMatchObject({ statut: 429, code: "ENVOI_TROP_RAPPROCHE" });
    expect((trop as ErreurHttp).reessayerApresMs).toBeGreaterThan(0);
    expect((trop as ErreurHttp).reessayerApresMs).toBeLessThanOrEqual(40_000);
  });
});

describe("la connexion d'un autre numéro n'est pas gênée par un blocage", () => {
  it("bloquer un numéro laisse les autres se connecter", async () => {
    const victime = numero();
    await demander({ telephone: victime });
    for (let i = 0; i < 5; i++)
      await verifier({ telephone: victime, code: autreCode(t.sms.dernierCode()) });
    expect((await demander({ telephone: victime })).status).toBe(429);

    const autre = numero();
    await demander({ telephone: autre });
    const r = await verifier({ telephone: autre, code: t.sms.dernierCode() });
    expect(r.status).toBe(200);
  });
});
