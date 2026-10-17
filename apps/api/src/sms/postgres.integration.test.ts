import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../socle/app.module";
import { METHODE_PAR_ROLE, type Role } from "../socle/auth/roles";
import { TokensService } from "../socle/auth/tokens.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import { CONFIG } from "../socle/config/config";
import { configurerApp } from "../socle/configurer-app";
import { PrismaService } from "../socle/db/prisma.service";
import { VARIABLE_STOCKAGE } from "../socle/db/stockage";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { CONFIG_SMS, chargerConfigSms } from "./config";
import { FileEnvoiSms } from "./file";
import type { FileEnvoiMemoire } from "./file-memoire";
import type { FournisseurSimule } from "./fournisseur-simule";
import { JournalSms } from "./journal";
import { JournalMemoire } from "./journal-memoire";
import { JournalSmsPrisma } from "./postgres";
import { RegistreFournisseurs } from "./registre";
import { SmsGatewayPasserelle } from "./sms.module";
import { contratJournalSms, messageSms } from "./testing/contrat-journal";

/**
 * Journal des SMS : les mêmes tests de contrat sur la mémoire (toujours) et sur PostgreSQL (quand
 * DATABASE_URL_TEST est définie), puis ce que seule la base garantit (clé d'idempotence unique,
 * statuts conditionnels, essais en ajout seul, aucun texte stocké) et l'API de bout en bout avec
 * `API_STOCKAGE=postgres`, redémarrage compris.
 */

contratJournalSms("contrat · journal en mémoire", async () => ({
  journal: new JournalMemoire(),
  fermer: async () => undefined,
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · SMS", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratJournalSms("contrat · journal PostgreSQL", async () => ({
    journal: new JournalSmsPrisma(prisma),
    fermer: async () => undefined,
  }));

  describe("ce que la base garantit seule", () => {
    const inserer = (id: string, surcharge: Record<string, unknown> = {}) => {
      const v = {
        id,
        type: "billet",
        cle: `cle:${id}`,
        statut: "en_file",
        encodage: "gsm7",
        segments: 1,
        coutFcfa: 0,
        referenceType: null,
        referenceId: null,
        fournisseur: null,
        idFournisseur: null,
        ...surcharge,
      };
      return sql.query(
        `INSERT INTO sms_message (id, type, cle, "referenceType", "referenceId", "destinataireChiffre",
           "destinataireIndex", "destinataireMasque", expediteur, statut, encodage, caracteres, segments,
           "coutFcfa", "coutEstimeFcfa", fournisseur, "idFournisseur", "creeA")
         VALUES ($1, $2, $3, $4, $5, 'c', 'i', 'm', 'AfriMove', $6, $7, 100, $8, $9, 12, $10, $11, now())`,
        [
          v.id,
          v.type,
          v.cle,
          v.referenceType,
          v.referenceId,
          v.statut,
          v.encodage,
          v.segments,
          v.coutFcfa,
          v.fournisseur,
          v.idFournisseur,
        ],
      );
    };

    it("la clé d'idempotence est unique : une écriture SQL directe de la même clé est refusée", async () => {
      const cle = `retrait:${randomUUID()}`;
      await inserer(randomUUID(), { cle });
      await expect(inserer(randomUUID(), { cle })).rejects.toThrow(/sms_message_cle_key/);
    });

    it("refuse un type, un statut ou un encodage inconnus, un nombre de morceaux hors de 1 à 3, un coût négatif", async () => {
      await expect(inserer(randomUUID(), { type: "pub" })).rejects.toThrow(
        /sms_message_type_connu/,
      );
      await expect(inserer(randomUUID(), { statut: "perdu" })).rejects.toThrow(
        /sms_message_statut_connu/,
      );
      await expect(inserer(randomUUID(), { encodage: "latin1" })).rejects.toThrow(
        /sms_message_encodage_connu/,
      );
      await expect(inserer(randomUUID(), { segments: 0 })).rejects.toThrow(/sms_message_segments/);
      await expect(inserer(randomUUID(), { segments: 4 })).rejects.toThrow(/sms_message_segments/);
      await expect(inserer(randomUUID(), { coutFcfa: -12 })).rejects.toThrow(
        /sms_message_montants/,
      );
    });

    it("une référence est complète ou absente", async () => {
      await expect(inserer(randomUUID(), { referenceType: "billet" })).rejects.toThrow(
        /sms_message_reference_complete/,
      );
      expect(await erreurSql(`SELECT 1`)).toBe("");
      await inserer(randomUUID(), { referenceType: "billet", referenceId: "b-1" });
    });

    it("un identifiant de fournisseur n'appartient qu'à un message ; un autre fournisseur peut le reprendre", async () => {
      const ext = `ext-${randomUUID()}`;
      await inserer(randomUUID(), { fournisseur: "principal", idFournisseur: ext });
      await expect(
        inserer(randomUUID(), { fournisseur: "principal", idFournisseur: ext }),
      ).rejects.toThrow(/sms_message_fournisseur_identifiant/);
      await inserer(randomUUID(), { fournisseur: "secours", idFournisseur: ext });
      // Sans identifiant (message pas encore parti), la contrainte ne joue pas.
      await inserer(randomUUID(), { fournisseur: "principal" });
      await inserer(randomUUID(), { fournisseur: "principal" });
    });

    it("le journal ne peut pas porter le texte d'un SMS : aucune colonne n'est prévue pour lui", async () => {
      const { rows } = await sql.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name IN ('sms_message', 'sms_essai')`,
      );
      const colonnes = rows.map((r: { column_name: string }) => r.column_name.toLowerCase());
      for (const interdite of [
        "texte",
        "message",
        "corps",
        "contenu",
        "body",
        "text",
        "destinataire",
      ]) {
        expect(colonnes).not.toContain(interdite);
      }
    });

    it("les essais sont en ajout seul : ni UPDATE, ni DELETE, ni TRUNCATE ; résultat et numéro contrôlés", async () => {
      const journal = new JournalSmsPrisma(prisma);
      const m = messageSms();
      await journal.creer(m);
      await journal.ajouterEssai({
        messageId: m.id,
        numero: 1,
        fournisseur: "principal",
        at: new Date(),
        dureeMs: 120,
        resultat: "accepte",
        code: null,
      });
      expect(
        await erreurSql(`UPDATE sms_essai SET "dureeMs" = 1 WHERE "messageId" = $1`, [m.id]),
      ).toMatch(/ajout seul/);
      expect(await erreurSql(`DELETE FROM sms_essai WHERE "messageId" = $1`, [m.id])).toMatch(
        /ajout seul/,
      );
      expect(await erreurSql(`TRUNCATE sms_essai`)).toMatch(/ajout seul/);
      const insertion = (resultat: string, numero: number, duree: number) =>
        erreurSql(
          `INSERT INTO sms_essai ("messageId", numero, fournisseur, at, "dureeMs", resultat)
           VALUES ($1, $2, 'principal', now(), $3, $4)`,
          [m.id, numero, duree, resultat],
        );
      expect(await insertion("perdu", 1, 10)).toMatch(/sms_essai_resultat_connu/);
      expect(await insertion("accepte", 0, 10)).toMatch(/sms_essai_numero/);
      expect(await insertion("accepte", 1, -1)).toMatch(/sms_essai_numero/);
    });

    it("un essai ne peut pas viser un message qui n'existe pas", async () => {
      const journal = new JournalSmsPrisma(prisma);
      await expect(
        journal.ajouterEssai({
          messageId: randomUUID(),
          numero: 1,
          fournisseur: "principal",
          at: new Date(),
          dureeMs: 1,
          resultat: "accepte",
          code: null,
        }),
      ).rejects.toThrow();
    });

    it("un accusé « livré » et un réessai qui se croisent : le statut final est « livré », jamais l'inverse", async () => {
      const journal = new JournalSmsPrisma(prisma);
      for (let i = 0; i < 5; i++) {
        const m = messageSms({ statut: "envoye", fournisseur: "principal", coutFcfa: 12 });
        await journal.creer(m);
        const [accuse, reessai] = await Promise.all([
          journal.modifier(m.id, { statut: "livre", livreA: new Date() }, [
            "en_file",
            "en_reprise",
            "envoye",
          ]),
          journal.modifier(m.id, { statut: "en_reprise", tentatives: 2 }, [
            "en_file",
            "en_reprise",
          ]),
        ]);
        expect(accuse).not.toBeNull();
        expect(reessai).toBeNull();
        expect((await journal.trouver(m.id))?.statut).toBe("livre");
      }
    });

    it("les valeurs sont celles du vocabulaire de la passerelle", async () => {
      const { TYPES_SMS, STATUTS_SMS } = await import("./types");
      for (const type of TYPES_SMS) await inserer(randomUUID(), { type });
      for (const statut of STATUTS_SMS) await inserer(randomUUID(), { statut });
    });
  });

  describe("l'API de bout en bout, stockage PostgreSQL", () => {
    let stockageAvant: string | undefined;
    let app: NestExpressApplication | null = null;
    let gare: { gareId: string; compagnieId: string };
    let compteur = 0;
    let guichetier: { id: string; jeton: string };
    let afrimove: { id: string; jeton: string };

    async function demarrer(): Promise<NestExpressApplication> {
      const config = configTest({ DATABASE_URL: base.url });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(config)
        // Pas de minuterie : le test fait avancer la file à la main.
        .overrideProvider(CONFIG_SMS)
        .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
        .compile();
      // rawBody : la signature des accusés se calcule sur le corps exact (comme main.ts)
      const a = module.createNestApplication<NestExpressApplication>({ rawBody: true });
      configurerApp(a, config);
      await a.init();
      return a;
    }

    async function compte(role: Role, avecGare: boolean) {
      compteur += 1;
      const personne = await app!.get(ComptesService).creer({
        nom: `Test ${role}`,
        telephone: `+2376556${String(compteur).padStart(5, "0")}`,
        roles: [role],
        compagnieId: role === "afrimove" ? null : gare.compagnieId,
        gareId: avecGare ? gare.gareId : null,
        pin: "482915",
        ...(METHODE_PAR_ROLE[role] === "motdepasse_sms"
          ? { motDePasse: "Un-mot-de-passe-solide" }
          : {}),
      });
      const { accessToken } = await app!.get(TokensService).emettre({
        sub: personne.id,
        role,
        cid: personne.compagnieId,
        gid: personne.gareId,
      });
      return { id: personne.id, jeton: accessToken };
    }

    const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
    const http = () => request(app!.getHttpServer());
    const file = () => app!.get(FileEnvoiSms) as FileEnvoiMemoire;
    const fournisseur = () => app!.get(RegistreFournisseurs).principal as FournisseurSimule;

    let n = 0;
    const billet = (surcharge: Record<string, unknown> = {}) => ({
      billetId: `bil-pg-${++n}-${randomUUID().slice(0, 8)}`,
      telephone: `+23767100${String(n).padStart(4, "0")}`,
      compagnie: "Alpha Voyages",
      origine: "Douala",
      destination: "Yaoundé",
      departA: "2027-01-05T08:30:00+01:00",
      siege: "14",
      code: "7341",
      lien: "https://afrimove.app/b/Xk3pQ9",
      ...surcharge,
    });

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      const compagnie = await prisma.compagnie.create({ data: { code: "SMS", nom: "Agence SMS" } });
      const g = await prisma.gare.create({
        data: { compagnieId: compagnie.id, code: "DLA", nom: "Akwa", ville: "Douala" },
      });
      gare = { gareId: g.id, compagnieId: compagnie.id };
      app = await demarrer();
      guichetier = await compte("guichetier", true);
      afrimove = await compte("afrimove", false);
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise le journal PostgreSQL", () => {
      expect(app!.get(JournalSms)).toBeInstanceOf(JournalSmsPrisma);
    });

    it("un billet est mis en file, envoyé, facturé : tout est en base, sans texte ni numéro en clair", async () => {
      const corps = billet({ telephone: "655 01 23 46" });
      const res = await http().post("/sms/billets").set(avec(guichetier.jeton)).send(corps);
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        nouveau: true,
        message: { statut: "en_file", destinataireMasque: "+237 ••••• 346", segments: 1 },
      });
      const id = res.body.message.id as string;

      let ligne = (await sql.query(`SELECT * FROM sms_message WHERE id = $1`, [id])).rows[0];
      expect(ligne).toMatchObject({
        statut: "en_file",
        type: "billet",
        referenceType: "billet",
        referenceId: corps.billetId,
        compagnieId: gare.compagnieId,
        demandeurId: guichetier.id,
      });

      await file().traiterPrets();
      ligne = (await sql.query(`SELECT * FROM sms_message WHERE id = $1`, [id])).rows[0];
      expect(ligne).toMatchObject({
        statut: "envoye",
        fournisseur: "simule",
        coutFcfa: 12,
        tentatives: 1,
      });
      expect(ligne.idFournisseur).toMatch(/^simule-/);
      expect(ligne.delaiEnvoiMs).toBeGreaterThanOrEqual(0);

      // Ni le numéro, ni le code, ni le lien, ni le texte nulle part dans la ligne.
      const brut = JSON.stringify(ligne);
      for (const secret of ["655012346", "7341", "Xk3pQ9", "Alpha Voyages", "Yaoundé"]) {
        expect(brut).not.toContain(secret);
      }
      const essais = (await sql.query(`SELECT * FROM sms_essai WHERE "messageId" = $1`, [id])).rows;
      expect(essais).toHaveLength(1);
      expect(essais[0]).toMatchObject({ numero: 1, fournisseur: "simule", resultat: "accepte" });
      // Le fournisseur, lui, a reçu le vrai numéro et le vrai texte.
      expect(fournisseur().envoyes.at(-1)).toMatchObject({ destinataire: "+237655012346" });

      const lu = await http().get(`/sms/messages/${id}`).set(avec(guichetier.jeton));
      expect(lu.status).toBe(200);
      expect(lu.body).toMatchObject({
        statut: "envoye",
        coutFcfa: 12,
        essais: [{ resultat: "accepte" }],
      });
    });

    it("six demandes simultanées du même billet : un seul message en base, un seul créateur", async () => {
      const corps = billet();
      const reponses = await Promise.all(
        Array.from({ length: 6 }, () =>
          http().post("/sms/billets").set(avec(guichetier.jeton)).send(corps),
        ),
      );
      expect(reponses.map((r) => r.status)).toEqual([202, 202, 202, 202, 202, 202]);
      expect(reponses.filter((r) => r.body.nouveau === true)).toHaveLength(1);
      expect(new Set(reponses.map((r) => r.body.message.id)).size).toBe(1);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM sms_message WHERE "referenceId" = $1`,
        [corps.billetId],
      );
      expect(rows[0].n).toBe(1);
      // La file n'a reçu qu'un travail : un seul envoi part.
      const avant = fournisseur().envoyes.length;
      await file().traiterPrets();
      expect(fournisseur().envoyes.length - avant).toBe(1);
      // « renvoi » envoie un autre SMS, 2 au plus.
      const r1 = await http()
        .post("/sms/billets")
        .set(avec(guichetier.jeton))
        .send({ ...corps, renvoi: true });
      const r2 = await http()
        .post("/sms/billets")
        .set(avec(guichetier.jeton))
        .send({ ...corps, renvoi: true });
      const r3 = await http()
        .post("/sms/billets")
        .set(avec(guichetier.jeton))
        .send({ ...corps, renvoi: true });
      expect([r1.status, r2.status, r3.status]).toEqual([202, 202, 429]);
    });

    it("l'accusé de livraison signé (corps brut) met le statut à jour ; rejoué, il est sans effet ; une fausse signature est refusée", async () => {
      const res = await http().post("/sms/billets").set(avec(guichetier.jeton)).send(billet());
      await file().traiterPrets();
      const id = res.body.message.id as string;
      const { idFournisseur } = (await prisma.smsMessage.findUniqueOrThrow({ where: { id } }))!;
      expect(idFournisseur).not.toBeNull();

      const faux = fournisseur().fabriquerRecu(
        [{ idFournisseur: idFournisseur!, etat: "non_livre" }],
        {
          secret: "pirate",
        },
      );
      await http()
        .post("/sms/webhooks/simule")
        .set("Content-Type", "application/json")
        .set(faux.entetes as Record<string, string>)
        .send(faux.corpsBrut!)
        .expect(401);
      expect((await prisma.smsMessage.findUniqueOrThrow({ where: { id } })).statut).toBe("envoye");

      const recu = fournisseur().fabriquerRecu([{ idFournisseur: idFournisseur!, etat: "livre" }]);
      const appel = () =>
        http()
          .post("/sms/webhooks/simule")
          .set("Content-Type", "application/json")
          .set(recu.entetes as Record<string, string>)
          .send(recu.corpsBrut!);
      const premier = await appel();
      expect(premier.status).toBe(200);
      expect(premier.body).toEqual({ recus: 1, appliques: 1, ignores: 0, inconnus: 0 });
      const bis = await appel();
      expect(bis.body).toMatchObject({ appliques: 0, ignores: 1 });
      const ligne = await prisma.smsMessage.findUniqueOrThrow({ where: { id } });
      expect(ligne.statut).toBe("livre");
      expect(ligne.livreA).not.toBeNull();
      // Un « non livré » tardif ne fait pas reculer un message livré.
      const tardif = fournisseur().fabriquerRecu([
        { idFournisseur: idFournisseur!, etat: "non_livre" },
      ]);
      await http()
        .post("/sms/webhooks/simule")
        .set("Content-Type", "application/json")
        .set(tardif.entetes as Record<string, string>)
        .send(tardif.corpsBrut!)
        .expect(200);
      expect((await prisma.smsMessage.findUniqueOrThrow({ where: { id } })).statut).toBe("livre");
    });

    it("un code de connexion (SmsGatewayPasserelle, branchée sur SmsGateway) passe par la file et le journal, sans texte stocké", async () => {
      const telephone = "+237655099001";
      await app!.get(SmsGatewayPasserelle).envoyer(telephone, "Votre code AfriMove est 123456.");
      const avant = fournisseur().envoyes.length;
      await file().traiterPrets();
      expect(
        fournisseur()
          .envoyes.slice(avant)
          .map((e) => e.texte),
      ).toContain("Votre code AfriMove est 123456.");
      const { rows } = await sql.query(
        `SELECT * FROM sms_message WHERE type = 'systeme' AND "creeA" <= now() AND "destinataireMasque" <> 'm' ORDER BY "creeA" DESC LIMIT 1`,
      );
      expect(rows[0].statut).toBe("envoye");
      expect(JSON.stringify(rows[0])).not.toContain("123456");
      expect(JSON.stringify(rows[0])).not.toContain("655099001");
    });

    it("un échec temporaire est repris : l'essai raté est gardé, le message part au deuxième essai", async () => {
      fournisseur().mettreEnPanne();
      const res = await http().post("/sms/billets").set(avec(guichetier.jeton)).send(billet());
      const id = res.body.message.id as string;
      await file().traiterPrets();
      expect((await prisma.smsMessage.findUniqueOrThrow({ where: { id } })).statut).toBe(
        "en_reprise",
      );
      fournisseur().retablir();
      // Le réessai est différé (attente exponentielle) : on laisse le temps réel passer pour la file.
      const prochaine = file().prochaineEcheance();
      expect(prochaine).not.toBeNull();
      await new Promise((r) => setTimeout(r, Math.max(0, prochaine!.getTime() - Date.now()) + 20));
      await file().traiterPrets();
      const ligne = await prisma.smsMessage.findUniqueOrThrow({ where: { id } });
      expect(ligne.statut).toBe("envoye");
      expect(ligne.tentatives).toBe(2);
      const essais = await prisma.smsEssai.findMany({
        where: { messageId: id },
        orderBy: { id: "asc" },
      });
      expect(essais.map((e) => e.resultat)).toEqual(["temporaire", "accepte"]);
    }, 30_000);

    it("tout survit à un redémarrage de l'API : le message, ses essais et les coûts", async () => {
      const res = await http().post("/sms/billets").set(avec(guichetier.jeton)).send(billet());
      const id = res.body.message.id as string;
      await file().traiterPrets();

      await app!.close();
      app = await demarrer();

      const lu = await http().get(`/sms/messages/${id}`).set(avec(guichetier.jeton));
      expect(lu.status).toBe(200);
      expect(lu.body).toMatchObject({
        id,
        statut: "envoye",
        coutFcfa: 12,
        essais: [{ numero: 1 }],
      });
      // Un nouveau processus ne reprend pas un identifiant de fournisseur déjà porté par un ancien message.
      const suite = await http().post("/sms/billets").set(avec(guichetier.jeton)).send(billet());
      expect(suite.status).toBe(202);
      await file().traiterPrets();
      expect(
        (await prisma.smsMessage.findUniqueOrThrow({ where: { id: suite.body.message.id } }))
          .statut,
      ).toBe("envoye");

      const couts = await http().get("/sms/couts").set(avec(afrimove.jeton));
      expect(couts.status).toBe(200);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n, sum("coutFcfa")::int AS cout FROM sms_message WHERE statut IN ('envoye','livre','non_livre')`,
      );
      expect(couts.body.total.coutFcfa).toBe(rows[0].cout);
      expect(couts.body.total.messages).toBeGreaterThanOrEqual(rows[0].n);
    });

    it("un identifiant de message mal formé est un 404, jamais une erreur serveur", async () => {
      await http().get("/sms/messages/pas-un-uuid").set(avec(afrimove.jeton)).expect(404);
      await http().get(`/sms/messages/${randomUUID()}`).set(avec(afrimove.jeton)).expect(404);
    });
  });
});
