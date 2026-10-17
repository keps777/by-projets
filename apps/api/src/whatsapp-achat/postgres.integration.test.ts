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
import { AchatsMemoire, ConversationsMemoire, JournalAchatMemoire } from "./memoire";
import { AchatsWhatsAppPrisma, ConversationsAchatPrisma, JournalAchatPrisma } from "./postgres";
import { AchatsWhatsApp, ConversationsAchat, JournalAchatWhatsApp } from "./ports";
import {
  DEPART_ALPHA,
  TEL_AICHA,
  creerAppAchatTest,
  telephone,
  type AppAchatTest,
} from "./testing/app-achat-test";
import {
  apres,
  contratStockageAchatWhatsApp,
  unAchat,
  uneConversation,
  uneEntree,
} from "./testing/contrat-stockage";
import { textes } from "./textes";
import { FOURNISSEURS_STOCKAGE_ACHAT_WHATSAPP } from "./whatsapp-achat.module";
import { Inventaire } from "../billetterie/ports";

/**
 * Achat par WhatsApp : les mêmes tests de contrat sur la mémoire (toujours) et sur PostgreSQL (quand
 * DATABASE_URL_TEST est définie), puis ce que seule la base garantit (transitions d'achat qui ne
 * réussissent qu'une fois sous requêtes simultanées de deux instances, journal non réécrit, listes
 * fermées, rien de personnel en clair), le choix du stockage par `API_STOCKAGE` et la conversation
 * « trois réponses » de bout en bout sur des conversations, un journal et des achats en base.
 */

contratStockageAchatWhatsApp("mémoire", async () => {
  const journal = new JournalAchatMemoire();
  return {
    conversations: new ConversationsMemoire(),
    journal,
    achats: new AchatsMemoire(),
    relireJournal: async (conversationRef) =>
      journal.entrees
        .filter((e) => e.conversationRef === conversationRef)
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · achat par WhatsApp", () => {
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

  contratStockageAchatWhatsApp("PostgreSQL", async () => {
    const journal = new JournalAchatPrisma(prisma);
    return {
      conversations: new ConversationsAchatPrisma(prisma),
      journal,
      achats: new AchatsWhatsAppPrisma(prisma),
      relireJournal: (conversationRef) => journal.deLaConversation(conversationRef),
      fermer: async () => undefined,
    };
  });

  describe("ce que seule la base garantit", () => {
    /** Deux instances de l'API : deux connexions, comme deux conteneurs derrière le même PostgreSQL. */
    async function deuxInstances<T>(
      test: (a: PrismaService, b: PrismaService) => Promise<T>,
    ): Promise<T> {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        return await test(a, b);
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    }

    it("deux instances qui terminent le même achat : une seule transition réussit", () =>
      deuxInstances(async (a, b) => {
        const instances = [new AchatsWhatsAppPrisma(a), new AchatsWhatsAppPrisma(b)];
        const achat = unAchat({ etat: "paiement_demande" });
        await instances[0]!.ajouter(achat);
        const resultats = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            instances[i % 2]!.transitionner(achat.commandeId, ["paiement_demande"], "terminee"),
          ),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
      }));

    it("deux instances qui ajoutent le même achat : une ligne, l'état d'origine", () =>
      deuxInstances(async (a, b) => {
        const achat = unAchat();
        await Promise.all([
          new AchatsWhatsAppPrisma(a).ajouter(achat),
          new AchatsWhatsAppPrisma(b).ajouter(achat),
        ]);
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM whatsapp_achat WHERE "commandeId" = $1`,
          [achat.commandeId],
        );
        expect(rows[0].n).toBe(1);
      }));

    it("une conversation écrite par une instance est lue par l'autre", () =>
      deuxInstances(async (a, b) => {
        const c = uneConversation();
        await new ConversationsAchatPrisma(a).ecrire(c);
        expect(await new ConversationsAchatPrisma(b).lire(c.cle, apres(1000))).toEqual(c);
        await new ConversationsAchatPrisma(b).supprimer(c.cle);
        expect(await new ConversationsAchatPrisma(a).lire(c.cle, apres(1000))).toBeNull();
      }));

    it("le journal ne se réécrit pas, mais se purge par ancienneté", async () => {
      const e = uneEntree();
      await new JournalAchatPrisma(prisma).enregistrer(e);
      expect(
        await erreurSql(`UPDATE whatsapp_achat_journal SET code = 'X' WHERE id = $1`, [e.id]),
      ).toContain("interdit");
      expect(await erreurSql(`DELETE FROM whatsapp_achat_journal WHERE id = $1`, [e.id])).toBe("");
    });

    it("l'événement, l'étape, la langue et la source du journal sont des listes fermées", async () => {
      const insere = (s: Record<string, unknown>) => {
        const e = { ...uneEntree(), ...s };
        return erreurSql(
          `INSERT INTO whatsapp_achat_journal
             (id, at, "numeroMasque", "conversationRef", evenement, etape, langue, source, code, "dureeMs")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            e.id,
            e.at,
            e.numeroMasque,
            e.conversationRef,
            e.evenement,
            e.etape,
            e.langue,
            e.source,
            e.code,
            e.dureeMs,
          ],
        );
      };
      expect(await insere({ evenement: "ecran_envoye" })).toContain(
        "whatsapp_achat_journal_evenement_connu",
      );
      expect(await insere({ etape: "paiement_fini" })).toContain(
        "whatsapp_achat_journal_etape_connue",
      );
      expect(await insere({ langue: "de" })).toContain("whatsapp_achat_journal_langue_connue");
      expect(await insere({ source: "image" })).toContain("whatsapp_achat_journal_source_connue");
      expect(await insere({ dureeMs: -1 })).toContain("whatsapp_achat_journal_duree");
      expect(await insere({})).toBe("");
    });

    it("l'état et la langue d'un achat sont des listes fermées ; la charge d'une conversation n'est jamais vide", async () => {
      const insere = (s: Record<string, unknown>) => {
        const a = { ...unAchat(), ...s };
        return erreurSql(
          `INSERT INTO whatsapp_achat ("commandeId", "voyageurId", etat, langue, "destinataireChiffre", "creeA")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.commandeId, a.voyageurId, a.etat, a.langue, a.destinataireChiffre, a.creeA],
        );
      };
      expect(await insere({ etat: "paye" })).toContain("whatsapp_achat_etat_connu");
      expect(await insere({ langue: "es" })).toContain("whatsapp_achat_langue_connue");
      expect(await insere({ etat: "echouee", langue: "pcm" })).toBe("");
      expect(
        await erreurSql(
          `INSERT INTO whatsapp_achat_conversation (cle, "expireA", charge) VALUES ('x', now(), '')`,
        ),
      ).toContain("whatsapp_achat_conversation_charge_presente");
    });

    it("ni texte de message, ni transcription, ni numéro en clair n'ont de colonne", async () => {
      const { rows } = await sql.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name IN ('whatsapp_achat_conversation', 'whatsapp_achat_journal', 'whatsapp_achat')`,
      );
      const colonnes = rows.map((r) => r.column_name as string);
      for (const interdite of [
        "texte",
        "message",
        "transcription",
        "contenu",
        "telephone",
        "numero",
        "msisdn",
        "destinataire",
        "text",
        "body",
      ]) {
        expect(colonnes).not.toContain(interdite);
      }
      // Les seules colonnes qui touchent au numéro sont chiffrées ou masquées.
      expect(colonnes).toContain("destinataireChiffre");
      expect(colonnes).toContain("numeroMasque");
    });

    it("un identifiant d'achat mal formé ne lit ni n'écrit rien", async () => {
      const achats = new AchatsWhatsAppPrisma(prisma);
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
          ...FOURNISSEURS_STOCKAGE_ACHAT_WHATSAPP,
        ],
      }).compile();
    };

    it("API_STOCKAGE=postgres : conversations, journal et achats sont ceux de PostgreSQL", async () => {
      const m = await monter("postgres");
      expect(m.get(ConversationsAchat)).toBeInstanceOf(ConversationsAchatPrisma);
      expect(m.get(JournalAchatWhatsApp)).toBeInstanceOf(JournalAchatPrisma);
      expect(m.get(AchatsWhatsApp)).toBeInstanceOf(AchatsWhatsAppPrisma);
      expect(m.get(ConversationsAchat).durable).toBe(true);
    });

    it("API_STOCKAGE=memoire : les trois restent en mémoire", async () => {
      const m = await monter("memoire");
      expect(m.get(ConversationsAchat)).toBeInstanceOf(ConversationsMemoire);
      expect(m.get(JournalAchatWhatsApp)).toBeInstanceOf(JournalAchatMemoire);
      expect(m.get(AchatsWhatsApp)).toBeInstanceOf(AchatsMemoire);
    });
  });

  describe("la conversation de bout en bout, conversations, journal et achats en base", () => {
    let t: AppAchatTest;
    const siegePris = async (departId: string, siege: number): Promise<boolean> => {
      const plan = await t.app.get(Inventaire).plan(departId);
      return plan.occupes[siege] !== undefined || plan.bloques[siege] !== undefined;
    };
    const etatsEnBase = async (): Promise<string[]> =>
      (await sql.query(`SELECT etat FROM whatsapp_achat ORDER BY "creeA", "commandeId"`)).rows.map(
        (r) => r.etat as string,
      );

    // Le contrat a rempli les tables : la conversation part d'une base d'achat vide.
    beforeEach(async () => {
      await sql.query(
        `TRUNCATE whatsapp_achat_conversation, whatsapp_achat_journal, whatsapp_achat`,
      );
      t = await creerAppAchatTest({ prisma: nouvelleConnexion() });
    });

    afterEach(async () => {
      await t?.fermer();
    });

    it("trois réponses : la conversation vit en base puis disparaît, l'achat suit le paiement, le billet arrive", async () => {
      const aicha = telephone(t, TEL_AICHA);
      await t.creerCompte("Aïcha Ngo", TEL_AICHA);

      await aicha.dire("Billet Douala Yaoundé demain matin");
      expect((await sql.query(`SELECT * FROM whatsapp_achat_conversation`)).rows).toHaveLength(1);
      await aicha.dire("2");
      expect(await etatsEnBase()).toEqual(["reservee"]);
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);

      expect(await aicha.dire("Oui")).toBe(textes("fr").paiementDemande);
      expect(await etatsEnBase()).toEqual(["paiement_demande"]);

      const { commande } = await t.derniereCommande();
      await t.confirmerPaiement(commande.id);
      expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 1, billetsEnEchec: 0 });
      await t.vider();
      expect(await etatsEnBase()).toEqual(["terminee"]);
      expect(aicha.recus()).toHaveLength(4);
      // Un second passage du suivi n'envoie rien : l'achat n'est plus à suivre.
      expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 0 });
      await t.vider();
      expect(aicha.recus()).toHaveLength(4);

      const evenements = (
        await sql.query(`SELECT evenement FROM whatsapp_achat_journal ORDER BY at, id`)
      ).rows.map((r) => r.evenement);
      expect(evenements).toEqual(
        expect.arrayContaining([
          "departs_proposes",
          "achat_reserve",
          "paiement_demande",
          "billet_envoye",
        ]),
      );
    });

    it("rien d'identifiant en clair dans les conversations, les achats et le journal", async () => {
      const aicha = telephone(t, TEL_AICHA);
      await aicha.dire("Billet Douala Yaoundé demain matin");
      await aicha.dire("2");
      await aicha.dire("Oui");
      const { commande } = await t.derniereCommande();
      await t.confirmerPaiement(commande.id);
      await t.suivi.balayer();
      await t.vider();

      for (const table of [
        "whatsapp_achat_conversation",
        "whatsapp_achat_journal",
        "whatsapp_achat",
      ]) {
        const brut = JSON.stringify((await sql.query(`SELECT * FROM ${table}`)).rows);
        expect(brut, table).not.toContain("691221008");
        expect(brut, table).not.toContain("Douala");
        expect(brut, table).not.toContain("5582");
      }
      const journal = (await sql.query(`SELECT * FROM whatsapp_achat_journal`)).rows;
      expect(journal.some((e) => e.numeroMasque === "+237 ••••• 008")).toBe(true);
      expect(
        journal.every(
          (e) => e.conversationRef === null || /^[0-9a-f]{12}$/.test(e.conversationRef),
        ),
      ).toBe(true);
    });

    it("« Non » libère la place : l'achat est abandonné et la conversation disparaît de la base", async () => {
      const aicha = telephone(t, TEL_AICHA);
      await aicha.dire("Billet Douala Yaoundé demain matin");
      await aicha.dire("2");
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
      expect(await aicha.dire("Non merci")).toBe(textes("fr").annule);
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
      expect(await etatsEnBase()).toEqual(["abandonnee"]);
      expect((await sql.query(`SELECT * FROM whatsapp_achat_conversation`)).rows).toHaveLength(0);
    });

    it("une place abandonnée est rendue à l'échéance : la conversation échue est purgée, l'achat abandonné", async () => {
      const aicha = telephone(t, TEL_AICHA);
      await aicha.dire("Billet Douala Yaoundé demain matin");
      await aicha.dire("2");
      expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 0 });
      t.horloge.avancer(15 * 60_000 + 61_000);
      expect(await t.suivi.balayer()).toMatchObject({ conversationsPurgees: 1 });
      await t.commandesService.expirerEchues();
      expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
      expect(await etatsEnBase()).toEqual(["abandonnee"]);
      expect((await sql.query(`SELECT * FROM whatsapp_achat_conversation`)).rows).toHaveLength(0);
    });

    it("le refus de l'agrégateur sur le téléphone : l'achat passe à « échoué » une seule fois, le voyageur en est prévenu une fois", async () => {
      const aicha = telephone(t, TEL_AICHA);
      await aicha.dire("Billet Douala Yaoundé demain matin");
      await aicha.dire("2");
      await aicha.dire("Oui");
      const { commande } = await t.derniereCommande();
      await t.refuserPaiement(commande.id);
      await t.suivi.balayer();
      await t.suivi.balayer();
      await t.vider();
      expect(await etatsEnBase()).toEqual(["echouee"]);
      expect(aicha.recus().filter((m) => m === textes("fr").paiementEchoue)).toHaveLength(1);
      expect(await aicha.dire("Oui")).toBe(textes("fr").sansDemande);
    });
  });
});
