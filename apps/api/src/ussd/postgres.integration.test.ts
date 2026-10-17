import { Test } from "@nestjs/testing";
import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { VARIABLE_STOCKAGE } from "../socle/db/stockage";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { AchatsUssdMemoire, JournalUssdMemoire, SessionsMemoire } from "./memoire";
import { AchatsUssdPrisma, JournalUssdPrisma, SessionsUssdPrisma } from "./postgres";
import { AchatsUssd, JournalUssd, SessionsUssd } from "./ports";
import {
  DEPART_ALPHA,
  DEPART_BETA,
  TEL_MTN,
  TEL_ORANGE,
  creerAppUssdTest,
  telephone,
  type AppUssdTest,
} from "./testing/app-ussd-test";
import {
  apres,
  contratStockageUssd,
  unAchat,
  uneEntree,
  uneSession,
} from "./testing/contrat-stockage";
import { TEXTES } from "./textes";
import { FOURNISSEURS_STOCKAGE_USSD } from "./ussd.module";
import { Inventaire } from "../billetterie/ports";

/**
 * Service USSD : les mêmes tests de contrat sur la mémoire (toujours) et sur PostgreSQL (quand
 * DATABASE_URL_TEST est définie), puis ce que seule la base garantit (transitions d'achat qui ne
 * réussissent qu'une fois sous requêtes simultanées de deux instances, journal non réécrit, listes
 * fermées, rien de personnel en clair), le choix du stockage par `API_STOCKAGE` et le parcours
 * « trois réponses » de bout en bout sur des sessions, un journal et des achats en base.
 */

contratStockageUssd("mémoire", async () => {
  const journal = new JournalUssdMemoire();
  return {
    sessions: new SessionsMemoire(),
    journal,
    achats: new AchatsUssdMemoire(),
    relireJournal: async (sessionRef) =>
      journal.entrees
        .filter((e) => e.sessionRef === sessionRef)
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · USSD", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  const nouvelleConnexion = () => new PrismaService(configTest({ DATABASE_URL: base.url }));

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
    prisma = nouvelleConnexion();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratStockageUssd("PostgreSQL", async () => {
    const journal = new JournalUssdPrisma(prisma);
    return {
      sessions: new SessionsUssdPrisma(prisma),
      journal,
      achats: new AchatsUssdPrisma(prisma),
      relireJournal: (sessionRef) => journal.deLaSession(sessionRef),
      fermer: async () => undefined,
    };
  });

  describe("ce que seule la base garantit", () => {
    it("deux instances qui terminent le même achat : une seule transition réussit", async () => {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const instances = [new AchatsUssdPrisma(a), new AchatsUssdPrisma(b)];
        const achat = unAchat({ etat: "paiement_demande" });
        await instances[0]!.ajouter(achat);
        const resultats = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            instances[i % 2]!.transitionner(achat.commandeId, ["paiement_demande"], "terminee"),
          ),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    });

    it("deux instances qui ajoutent le même achat : une ligne, l'état d'origine", async () => {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const achat = unAchat();
        await Promise.all([
          new AchatsUssdPrisma(a).ajouter(achat),
          new AchatsUssdPrisma(b).ajouter(achat),
        ]);
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM ussd_achat WHERE "commandeId" = $1`,
          [achat.commandeId],
        );
        expect(rows[0].n).toBe(1);
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    });

    it("une session écrite par une instance est lue par l'autre", async () => {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const s = uneSession();
        await new SessionsUssdPrisma(a).ecrire(s);
        expect(await new SessionsUssdPrisma(b).lire(s.cle, apres(1000))).toEqual(s);
        await new SessionsUssdPrisma(b).supprimer(s.cle);
        expect(await new SessionsUssdPrisma(a).lire(s.cle, apres(1000))).toBeNull();
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    });

    it("le journal ne se réécrit pas, mais se purge par ancienneté", async () => {
      const e = uneEntree();
      await new JournalUssdPrisma(prisma).enregistrer(e);
      expect(await erreurSql(`UPDATE ussd_journal SET code = 'X' WHERE id = $1`, [e.id])).toContain(
        "interdit",
      );
      expect(await erreurSql(`DELETE FROM ussd_journal WHERE id = $1`, [e.id])).toBe("");
    });

    it("l'opérateur, l'événement et l'étape du journal sont des listes fermées", async () => {
      const insere = (s: Record<string, unknown>) => {
        const e = { ...uneEntree(), ...s };
        return erreurSql(
          `INSERT INTO ussd_journal (id, at, operateur, "msisdnMasque", "sessionRef", evenement, etape, code, "dureeMs")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            e.id,
            e.at,
            e.operateur,
            e.msisdnMasque,
            e.sessionRef,
            e.evenement,
            e.etape,
            e.code,
            e.dureeMs,
          ],
        );
      };
      expect(await insere({ operateur: "moov" })).toContain("ussd_journal_operateur_connu");
      expect(await insere({ evenement: "ecran_envoye" })).toContain("ussd_journal_evenement_connu");
      expect(await insere({ etape: "paiement" })).toContain("ussd_journal_etape_connue");
      expect(await insere({ dureeMs: -1 })).toContain("ussd_journal_duree");
      expect(await insere({})).toBe("");
    });

    it("l'opérateur et l'état d'un achat sont des listes fermées", async () => {
      const insere = (s: Record<string, unknown>) => {
        const a = { ...unAchat(), ...s };
        return erreurSql(
          `INSERT INTO ussd_achat ("commandeId", "voyageurId", operateur, etat, "destinataireChiffre", "creeA")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.commandeId, a.voyageurId, a.operateur, a.etat, a.destinataireChiffre, a.creeA],
        );
      };
      expect(await insere({ operateur: "camtel" })).toContain("ussd_achat_operateur_connu");
      expect(await insere({ etat: "paye" })).toContain("ussd_achat_etat_connu");
      expect(await insere({})).toBe("");
      expect(
        await erreurSql(
          `INSERT INTO ussd_session (cle, "expireA", charge) VALUES ('x', now(), '')`,
        ),
      ).toContain("ussd_session_charge_presente");
    });

    it("un identifiant d'achat mal formé ne lit ni n'écrit rien", async () => {
      const achats = new AchatsUssdPrisma(prisma);
      expect(await achats.trouver("pas-un-uuid")).toBeNull();
      expect(await achats.transitionner("pas-un-uuid", ["reservee"], "terminee")).toBeNull();
    });
  });

  describe("le choix du stockage par API_STOCKAGE", () => {
    let avant: string | undefined;
    afterEach(() => {
      if (avant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = avant;
    });

    const monter = async (choix: "postgres" | "memoire") => {
      avant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = choix;
      return Test.createTestingModule({
        providers: [
          { provide: CONFIG, useValue: configTest() },
          { provide: PrismaService, useValue: prisma },
          ...FOURNISSEURS_STOCKAGE_USSD,
        ],
      }).compile();
    };

    it("API_STOCKAGE=postgres : sessions, journal et achats sont ceux de PostgreSQL", async () => {
      const m = await monter("postgres");
      expect(m.get(SessionsUssd)).toBeInstanceOf(SessionsUssdPrisma);
      expect(m.get(JournalUssd)).toBeInstanceOf(JournalUssdPrisma);
      expect(m.get(AchatsUssd)).toBeInstanceOf(AchatsUssdPrisma);
      expect(m.get(SessionsUssd).durable).toBe(true);
    });

    it("API_STOCKAGE=memoire : les trois restent en mémoire", async () => {
      const m = await monter("memoire");
      expect(m.get(SessionsUssd)).toBeInstanceOf(SessionsMemoire);
      expect(m.get(JournalUssd)).toBeInstanceOf(JournalUssdMemoire);
      expect(m.get(AchatsUssd)).toBeInstanceOf(AchatsUssdMemoire);
    });
  });

  describe("l'API de bout en bout, sessions, journal et achats en base", () => {
    let t: AppUssdTest;
    const siegePris = async (departId: string, siege: number): Promise<boolean> => {
      const plan = await t.app.get(Inventaire).plan(departId);
      return plan.occupes[siege] !== undefined || plan.bloques[siege] !== undefined;
    };

    // Le contrat a rempli les tables : le parcours part d'une base d'USSD vide.
    beforeEach(async () => {
      await sql.query(`TRUNCATE ussd_session, ussd_achat, ussd_journal`);
    });

    afterEach(async () => {
      await t?.fermer();
    });

    it("trois réponses : la session vit en base puis disparaît, l'achat suit le paiement, le journal ne dit rien de personnel", async () => {
      t = await creerAppUssdTest({ prisma: nouvelleConnexion() });
      const tel = telephone(t, "mtn", TEL_MTN);

      await tel.composer();
      let sessions = (await sql.query(`SELECT * FROM ussd_session`)).rows;
      expect(sessions).toHaveLength(1);
      // La charge est chiffrée : ni le numéro ni l'étape ne s'y lisent.
      expect(sessions[0].charge).not.toContain(TEL_MTN);
      expect(sessions[0].charge).not.toContain("menu");
      expect(sessions[0].cle.startsWith("mtn:")).toBe(true);

      await tel.repondre("1");
      await tel.repondre("2");
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
      const reserve = (await sql.query(`SELECT * FROM ussd_achat`)).rows;
      expect(reserve).toHaveLength(1);
      expect(reserve[0]).toMatchObject({ operateur: "mtn", etat: "reservee" });
      expect(reserve[0].destinataireChiffre).not.toContain(TEL_MTN);

      const fin = await tel.repondre("1");
      expect(fin).toMatchObject({ fin: true, texte: TEXTES.paiementDemande });
      sessions = (await sql.query(`SELECT * FROM ussd_session`)).rows;
      expect(sessions).toHaveLength(0);
      expect(
        (await sql.query(`SELECT etat FROM ussd_achat`)).rows.map((r: { etat: string }) => r.etat),
      ).toEqual(["paiement_demande"]);

      // Pas de SMS tant que le paiement n'est pas confirmé ; puis un seul, et l'achat est terminé.
      expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 0 });
      const { commande } = await t.derniereCommande();
      await t.confirmerPaiement(commande.id);
      expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 1, smsEnEchec: 0 });
      expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 0 });
      expect(t.notifieur.envoyes).toHaveLength(1);
      expect(
        (await sql.query(`SELECT etat FROM ussd_achat`)).rows.map((r: { etat: string }) => r.etat),
      ).toEqual(["terminee"]);

      const journal = (await sql.query(`SELECT * FROM ussd_journal ORDER BY at, id`)).rows;
      const evenements = journal.map((j: { evenement: string }) => j.evenement);
      expect(evenements).toEqual(
        expect.arrayContaining([
          "ouverte",
          "reponse",
          "achat_reserve",
          "paiement_demande",
          "sms_billet",
        ]),
      );
      // Ni numéro en clair (seulement masqué), ni texte d'écran.
      const tout = JSON.stringify(journal);
      expect(tout).not.toContain(TEL_MTN);
      expect(tout).not.toContain(TEL_MTN.slice(1));
      expect(tout).not.toContain("Repondre");
      expect(
        journal.every(
          (j: { msisdnMasque: string | null }) =>
            j.msisdnMasque === null || j.msisdnMasque.includes("•"),
        ),
      ).toBe(true);
    });

    it("répondre autre chose que 1 libère la place et marque l'achat abandonné en base", async () => {
      t = await creerAppUssdTest({ prisma: nouvelleConnexion() });
      const tel = telephone(t, "orange", TEL_ORANGE);
      await tel.composer();
      await tel.repondre("1");
      await tel.repondre("1");
      expect(await siegePris(DEPART_BETA, 1)).toBe(true);
      expect(await tel.repondre("2")).toMatchObject({ fin: true, texte: TEXTES.annule });
      expect(await siegePris(DEPART_BETA, 1)).toBe(false);
      const { achat } = await t.derniereCommande();
      expect(achat.etat).toBe("abandonnee");
      const { rows } = await sql.query(`SELECT etat FROM ussd_achat WHERE "commandeId" = $1`, [
        achat.commandeId,
      ]);
      expect(rows[0].etat).toBe("abandonnee");
      expect(
        (await sql.query(`SELECT count(*)::int AS n FROM ussd_session WHERE cle LIKE 'orange:%'`))
          .rows[0].n,
      ).toBe(0);
    });

    it("une session échue est refusée, et la place retenue est libérée par le suivi sans attendre les 15 minutes", async () => {
      t = await creerAppUssdTest({ prisma: nouvelleConnexion() });
      const tel = telephone(t, "mtn", TEL_MTN);
      await tel.composer();
      t.horloge.avancer(t.config.sessionTtlMs + 1000);
      expect(await tel.repondre("1")).toMatchObject({
        fin: true,
        texte: TEXTES.sessionExpiree("*123#"),
      });

      const autre = telephone(t, "mtn", TEL_MTN);
      await autre.composer();
      await autre.repondre("1");
      await autre.repondre("2");
      const { commande } = await t.derniereCommande();
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
      // Dans le délai de la session, rien ne bouge ; une fois la session échue et la marge passée, la place est rendue.
      t.horloge.avancer(t.config.sessionTtlMs);
      expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 0 });
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
      t.horloge.avancer(t.config.abandonApresMs);
      expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 1 });
      expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
      expect((await t.derniereCommande()).achat.etat).toBe("abandonnee");
    });

    it("cinq voyageurs qui achètent en même temps : cinq achats en base, cinq sièges distincts", async () => {
      t = await creerAppUssdTest({ prisma: nouvelleConnexion() });
      const avant = (await sql.query(`SELECT count(*)::int AS n FROM ussd_achat`)).rows[0].n;
      const numeros = [
        "+237677000001",
        "+237677000002",
        "+237677000003",
        "+237677000004",
        "+237677000005",
      ];
      const resultats = await Promise.all(
        numeros.map(async (n) => {
          const tel = telephone(t, "mtn", n);
          await tel.composer();
          await tel.repondre("1");
          return tel.repondre("2");
        }),
      );
      const sieges = resultats.map((r) => /Place: (\d+)/.exec(r.texte)?.[1]);
      expect(new Set(sieges).size).toBe(5);
      const apresN = (await sql.query(`SELECT count(*)::int AS n FROM ussd_achat`)).rows[0].n;
      expect(apresN - avant).toBe(5);
    });
  });
});
