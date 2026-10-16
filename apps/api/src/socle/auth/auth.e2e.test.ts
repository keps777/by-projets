import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerAppTest, type AppTest } from "../testing/app-test";
import { jetonPour } from "../testing/jetons";
import { ESSAIS_PIN_MAX } from "./auth.service";

const MOT_DE_PASSE = "Un-mot-de-passe-solide";
const PIN = "482915";
const MINUTE = 60_000;

describe("authentification par rôle (HTTP)", () => {
  let t: AppTest;
  let telephone = 0;
  /** Numéro neuf à chaque appel : les tests ne se gênent pas. */
  const nouveauNumero = () => `+2376551${String(++telephone).padStart(5, "0")}`;

  beforeAll(async () => {
    t = await creerAppTest();
  });
  afterAll(() => t.fermer());

  const post = (chemin: string, corps: object) => t.http().post(chemin).send(corps);
  const connexionPin = (tel: string, pin: string, role = "guichetier") =>
    post("/auth/guichet/connexion", { telephone: tel, pin, role });

  describe("voyageur : numéro + code SMS", () => {
    it("demande, vérifie, crée le compte à la première connexion et émet un jeton voyageur", async () => {
      const tel = nouveauNumero();
      const demande = await post("/auth/voyageur/code", { telephone: tel });
      expect(demande.status).toBe(202);
      expect(demande.body).toMatchObject({ expireDans: 300 });
      expect(t.sms.dernier()).toMatchObject({ telephone: tel });

      const verif = await post("/auth/voyageur/verification", {
        defiId: demande.body.defiId,
        code: t.dernierCode(),
      });
      expect(verif.status).toBe(200);
      expect(verif.body).toMatchObject({ tokenType: "Bearer", expiresIn: 3600, role: "voyageur" });

      const moi = await t
        .http()
        .get("/me")
        .set("Authorization", `Bearer ${verif.body.accessToken}`);
      expect(moi.status).toBe(200);
      expect(moi.body).toMatchObject({ role: "voyageur", peutVendre: true, accesPatron: false });

      const compte = await t.comptes.trouverParTelephone(tel);
      expect(compte?.roles).toEqual(["voyageur"]);
      expect(compte?.telephoneChiffre).not.toContain(tel.slice(4));
    });

    it("le code ne sert qu'une fois", async () => {
      const demande = await post("/auth/voyageur/code", { telephone: nouveauNumero() });
      const code = t.dernierCode();
      const corps = { defiId: demande.body.defiId, code };
      expect((await post("/auth/voyageur/verification", corps)).status).toBe(200);
      expect((await post("/auth/voyageur/verification", corps)).status).toBe(401);
    });

    it("un mauvais code est refusé, et après 5 essais le bon code ne marche plus", async () => {
      const demande = await post("/auth/voyageur/code", { telephone: nouveauNumero() });
      const bon = t.dernierCode();
      const faux = bon === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        expect(
          (await post("/auth/voyageur/verification", { defiId: demande.body.defiId, code: faux }))
            .status,
        ).toBe(401);
      }
      expect(
        (await post("/auth/voyageur/verification", { defiId: demande.body.defiId, code: bon }))
          .status,
      ).toBe(401);
    });

    it("le code expire après 5 minutes", async () => {
      const demande = await post("/auth/voyageur/code", { telephone: nouveauNumero() });
      const code = t.dernierCode();
      t.horloge.avancer(5 * MINUTE + 1000);
      const rep = await post("/auth/voyageur/verification", { defiId: demande.body.defiId, code });
      expect(rep.status).toBe(401);
    });

    it("limite les demandes de code : 3 par quart d'heure et par numéro", async () => {
      const tel = nouveauNumero();
      for (let i = 0; i < 3; i++)
        expect((await post("/auth/voyageur/code", { telephone: tel })).status).toBe(202);
      expect((await post("/auth/voyageur/code", { telephone: tel })).status).toBe(429);
      t.horloge.avancer(16 * MINUTE);
      expect((await post("/auth/voyageur/code", { telephone: tel })).status).toBe(202);
    });

    it("répond pareil pour un numéro de personnel, sans lui envoyer de SMS (pas d'énumération)", async () => {
      const tel = nouveauNumero();
      await t.creerCompte({ nom: "Staff", telephone: tel, roles: ["guichetier"], pin: PIN });
      const avant = t.sms.messages().length;
      const rep = await post("/auth/voyageur/code", { telephone: tel });
      expect(rep.status).toBe(202);
      expect(Object.keys(rep.body).sort()).toEqual(["defiId", "expireDans"]);
      expect(t.sms.messages().length).toBe(avant);
    });

    it("refuse un numéro mal formé (400) et les champs inconnus", async () => {
      expect((await post("/auth/voyageur/code", { telephone: "abc" })).status).toBe(400);
      expect(
        (await post("/auth/voyageur/code", { telephone: "655000001", role: "patron" })).status,
      ).toBe(400);
      expect(
        (await post("/auth/voyageur/verification", { defiId: "pas-un-uuid", code: "123456" }))
          .status,
      ).toBe(400);
    });
  });

  describe("guichetier : numéro + PIN à 6 chiffres", () => {
    let tel: string;
    beforeEach(async () => {
      tel = nouveauNumero();
      await t.creerCompte({ nom: "Guichetier", telephone: tel, roles: ["guichetier"], pin: PIN });
    });

    it("connecte avec le bon PIN et émet un jeton guichetier", async () => {
      const rep = await connexionPin(tel, PIN);
      expect(rep.status).toBe(200);
      expect(rep.body).toMatchObject({ role: "guichetier", tokenType: "Bearer" });
      const moi = await t.http().get("/me").set("Authorization", `Bearer ${rep.body.accessToken}`);
      expect(moi.body).toMatchObject({ role: "guichetier", peutVendre: true, accesPatron: false });
    });

    it("le PIN est stocké haché (argon2id), jamais en clair", async () => {
      const p = await t.comptes.trouverParTelephone(tel);
      expect(p?.pinHache).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(p)).not.toContain(PIN);
    });

    it("mauvais PIN, numéro inconnu et rôle absent donnent la même réponse 401", async () => {
      const mauvais = await connexionPin(tel, "135790");
      const inconnu = await connexionPin(nouveauNumero(), PIN);
      const autreRole = await connexionPin(tel, PIN, "convoyeur");
      for (const r of [mauvais, inconnu, autreRole]) {
        expect(r.status).toBe(401);
        expect(r.body.message).toBe("Identifiants invalides");
      }
    });

    it("bloque 15 minutes après 3 échecs, même avec le bon PIN, puis rouvre", async () => {
      for (let i = 0; i < ESSAIS_PIN_MAX; i++)
        expect((await connexionPin(tel, "135790")).status).toBe(401);
      const bloque = await connexionPin(tel, PIN);
      expect(bloque.status).toBe(423);
      expect(bloque.body.reessayerApres).toBeDefined();

      t.horloge.avancer(14 * MINUTE);
      expect((await connexionPin(tel, PIN)).status).toBe(423);
      t.horloge.avancer(2 * MINUTE);
      expect((await connexionPin(tel, PIN)).status).toBe(200);
    });

    it("une connexion réussie remet le compteur d'échecs à zéro", async () => {
      await connexionPin(tel, "135790");
      await connexionPin(tel, "135790");
      expect((await connexionPin(tel, PIN)).status).toBe(200);
      await connexionPin(tel, "135790");
      await connexionPin(tel, "135790");
      expect((await connexionPin(tel, PIN)).status).toBe(200);
    });

    it("un compte désactivé ne se connecte plus", async () => {
      const p = await t.comptes.trouverParTelephone(tel);
      t.personnes.modifier(p!.id, { actif: false });
      expect((await connexionPin(tel, PIN)).status).toBe(401);
    });

    it("la route PIN refuse les rôles qui ne se connectent pas par PIN", async () => {
      expect((await connexionPin(tel, PIN, "patron")).status).toBe(400);
      expect((await connexionPin(tel, PIN, "afrimove")).status).toBe(400);
      expect((await connexionPin(tel, PIN, "voyageur")).status).toBe(400);
    });

    it("exige un PIN à 6 chiffres", async () => {
      expect((await connexionPin(tel, "12345")).status).toBe(400);
      expect((await connexionPin(tel, "abcdef")).status).toBe(400);
    });
  });

  describe("superviseur, patron, comptable, AfriMove : mot de passe + SMS", () => {
    const creer = async (role: "superviseur" | "patron" | "comptable" | "afrimove") => {
      const tel = nouveauNumero();
      await t.creerCompte({ nom: role, telephone: tel, roles: [role], motDePasse: MOT_DE_PASSE });
      return tel;
    };
    const etape1 = (tel: string, motDePasse: string, role: string) =>
      post("/auth/direction/connexion", { telephone: tel, motDePasse, role });

    it.each(["superviseur", "patron", "comptable", "afrimove"] as const)(
      "%s : mot de passe puis code SMS donnent un jeton de ce rôle",
      async (role) => {
        const tel = await creer(role);
        const e1 = await etape1(tel, MOT_DE_PASSE, role);
        expect(e1.status).toBe(202);
        expect(t.sms.dernier()?.telephone).toBe(tel);
        const e2 = await post("/auth/direction/verification", {
          defiId: e1.body.defiId,
          code: t.dernierCode(),
        });
        expect(e2.status).toBe(200);
        expect(e2.body.role).toBe(role);
      },
    );

    it("le mot de passe seul ne donne aucun jeton", async () => {
      const tel = await creer("patron");
      const e1 = await etape1(tel, MOT_DE_PASSE, "patron");
      expect(e1.body.accessToken).toBeUndefined();
    });

    it("mauvais mot de passe : 401 sans SMS ; 3 échecs : 423", async () => {
      const tel = await creer("patron");
      const avant = t.sms.messages().length;
      for (let i = 0; i < ESSAIS_PIN_MAX; i++) {
        expect((await etape1(tel, "Mauvais-mot-de-passe-1", "patron")).status).toBe(401);
      }
      expect(t.sms.messages().length).toBe(avant);
      expect((await etape1(tel, MOT_DE_PASSE, "patron")).status).toBe(423);
    });

    it("un mauvais code SMS est refusé ; le défi d'un autre rôle ne sert pas", async () => {
      const tel = await creer("comptable");
      const e1 = await etape1(tel, MOT_DE_PASSE, "comptable");
      const code = t.dernierCode();
      const faux = code === "000000" ? "111111" : "000000";
      expect(
        (await post("/auth/direction/verification", { defiId: e1.body.defiId, code: faux })).status,
      ).toBe(401);
      // Un code de connexion voyageur ne valide pas un défi direction et inversement.
      expect(
        (await post("/auth/voyageur/verification", { defiId: e1.body.defiId, code })).status,
      ).toBe(401);
      expect(
        (await post("/auth/direction/verification", { defiId: e1.body.defiId, code })).status,
      ).toBe(200);
    });

    it("un compte patron ne peut pas se connecter en AfriMove ni en guichetier", async () => {
      const tel = await creer("patron");
      expect((await etape1(tel, MOT_DE_PASSE, "afrimove")).status).toBe(401);
      expect((await etape1(tel, MOT_DE_PASSE, "guichetier")).status).toBe(400);
    });

    it("le compte désactivé entre les deux étapes est refusé", async () => {
      const tel = await creer("patron");
      const e1 = await etape1(tel, MOT_DE_PASSE, "patron");
      const p = await t.comptes.trouverParTelephone(tel);
      t.personnes.modifier(p!.id, { actif: false });
      const e2 = await post("/auth/direction/verification", {
        defiId: e1.body.defiId,
        code: t.dernierCode(),
      });
      expect(e2.status).toBe(401);
    });
  });

  describe("jetons", () => {
    it("refuse l'absence de jeton, un jeton mal formé, falsifié, sans signature ou expiré", async () => {
      const { jeton } = await jetonPour(t, "guichetier");
      const get = (auth?: string) => {
        const r = t.http().get("/me");
        return auth ? r.set("Authorization", auth) : r;
      };
      expect((await get()).status).toBe(401);
      expect((await get("Bearer n-importe-quoi")).status).toBe(401);
      expect((await get(`Basic ${jeton}`)).status).toBe(401);

      const [entete, charge, signature] = jeton.split(".");
      const chargeFalsifiee = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(charge!, "base64url").toString()),
          role: "patron",
        }),
      ).toString("base64url");
      expect((await get(`Bearer ${entete}.${chargeFalsifiee}.${signature}`)).status).toBe(401);

      const sansAlgo = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
        "base64url",
      );
      expect((await get(`Bearer ${sansAlgo}.${charge}.`)).status).toBe(401);

      // Signé avec une autre clé.
      const autre = createHmac("sha256", "une-autre-cle")
        .update(`${entete}.${charge}`)
        .digest("base64url");
      expect((await get(`Bearer ${entete}.${charge}.${autre}`)).status).toBe(401);

      t.horloge.avancer(0); // l'expiration du JWT suit l'horloge système : voir test dédié ci-dessous
    });

    it("un jeton expiré est refusé", async () => {
      const court = await creerAppTest({ config: { JWT_TTL_SECONDS: "60" } });
      try {
        const { jeton } = await jetonPour(court, "guichetier");
        expect((await court.http().get("/me").set("Authorization", `Bearer ${jeton}`)).status).toBe(
          200,
        );
        // On réécrit l'expiration dans le passé en resignant avec la même clé : simule l'écoulement.
        const [entete, charge] = jeton.split(".");
        const contenu = JSON.parse(Buffer.from(charge!, "base64url").toString());
        const expire = Buffer.from(
          JSON.stringify({ ...contenu, exp: Math.floor(Date.now() / 1000) - 10 }),
        ).toString("base64url");
        const signature = createHmac("sha256", court.config.jwt.secret)
          .update(`${entete}.${expire}`)
          .digest("base64url");
        const rep = await court
          .http()
          .get("/me")
          .set("Authorization", `Bearer ${entete}.${expire}.${signature}`);
        expect(rep.status).toBe(401);
      } finally {
        await court.fermer();
      }
    });

    it("désactiver le compte ou lui retirer le rôle invalide le jeton tout de suite", async () => {
      const a = await jetonPour(t, "guichetier");
      t.personnes.modifier(a.id, { actif: false });
      expect((await t.http().get("/me").set("Authorization", `Bearer ${a.jeton}`)).status).toBe(
        401,
      );

      const b = await jetonPour(t, "patron", { rolesDuCompte: ["patron", "comptable"] });
      expect((await t.http().get("/me").set("Authorization", `Bearer ${b.jeton}`)).status).toBe(
        200,
      );
      t.personnes.modifier(b.id, { roles: ["comptable"] });
      expect((await t.http().get("/me").set("Authorization", `Bearer ${b.jeton}`)).status).toBe(
        401,
      );
    });
  });

  describe("journal d'audit des connexions", () => {
    it("trace succès et échecs sans jamais écrire PIN, mot de passe, code ni numéro", async () => {
      const tel = nouveauNumero();
      await t.creerCompte({ nom: "Trace", telephone: tel, roles: ["guichetier"], pin: "907314" });
      await connexionPin(tel, "135790");
      await connexionPin(tel, "907314");
      const d = await post("/auth/voyageur/code", { telephone: nouveauNumero() });
      const code = t.dernierCode();
      await post("/auth/voyageur/verification", { defiId: d.body.defiId, code });

      const actions = t.auditRepo.lignes.map((l) => `${l.action}:${l.resultat}`);
      expect(actions).toContain("connexion.pin:echec");
      expect(actions).toContain("connexion.pin:succes");
      expect(actions).toContain("connexion.voyageur:succes");

      const tout = JSON.stringify(t.auditRepo.lignes, (_k, v) =>
        typeof v === "bigint" ? String(v) : v,
      );
      for (const secret of ["135790", "907314", code, tel.slice(4), MOT_DE_PASSE]) {
        expect(tout, `le journal contient « ${secret} »`).not.toContain(secret);
      }
      expect((await t.audit.verifierChaine()).valide).toBe(true);
    });
  });

  describe("limitation de débit", () => {
    it("répond 429 au-delà de 10 tentatives par minute sur les routes de connexion", async () => {
      const limite = await creerAppTest({ config: { RATE_LIMIT_ENABLED: "true" } });
      try {
        let dernier = 0;
        for (let i = 0; i < 12; i++) {
          dernier = (
            await limite
              .http()
              .post("/auth/guichet/connexion")
              .send({ telephone: "+237655099999", pin: "135790", role: "guichetier" })
          ).status;
        }
        expect(dernier).toBe(429);
        // La santé n'est jamais limitée.
        expect((await limite.http().get("/health")).status).toBe(200);
      } finally {
        await limite.fermer();
      }
    });
  });
});
