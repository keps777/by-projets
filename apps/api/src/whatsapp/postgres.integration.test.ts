import { randomUUID } from "node:crypto";
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
import { JournalWhatsApp } from "./journal";
import { JournalWhatsAppMemoire } from "./journal-memoire";
import { JournalWhatsAppPrisma } from "./postgres";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  creerAppWhatsAppTest,
  type AppWhatsAppTest,
} from "./testing/app-whatsapp-test";
import {
  apres,
  contratJournalWhatsApp,
  entrantWhatsApp,
  messageWhatsApp,
} from "./testing/contrat-journal";
import { VARIABLES_BILLET } from "./testing/montage";
import { FOURNISSEUR_JOURNAL_WHATSAPP } from "./whatsapp.module";

/**
 * Journal de la passerelle WhatsApp : les mêmes tests de contrat sur la mémoire (toujours) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (un message
 * par clé sous requêtes simultanées de deux instances, repli réservé une seule fois, réponse qui ne
 * marque jamais deux fois le même message reçu, essais en ajout seul, listes fermées, rien de
 * personnel en clair), le choix du stockage par `API_STOCKAGE` et le parcours de la passerelle de
 * bout en bout sur un journal en base.
 */

contratJournalWhatsApp("mémoire", async () => ({
  journal: new JournalWhatsAppMemoire(),
  fermer: async () => undefined,
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · WhatsApp", () => {
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

  contratJournalWhatsApp("PostgreSQL", async () => ({
    journal: new JournalWhatsAppPrisma(prisma),
    fermer: async () => undefined,
  }));

  describe("ce que seule la base garantit", () => {
    /** Deux instances de l'API : deux connexions, comme deux conteneurs derrière le même PostgreSQL. */
    async function deuxInstances<T>(
      test: (a: JournalWhatsAppPrisma, b: JournalWhatsAppPrisma) => Promise<T>,
    ): Promise<T> {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        return await test(new JournalWhatsAppPrisma(a), new JournalWhatsAppPrisma(b));
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    }

    it("deux instances qui créent le même message : une ligne, un seul créateur", () =>
      deuxInstances(async (a, b) => {
        const cle = `rapport:${randomUUID()}`;
        const candidats = Array.from({ length: 12 }, () => messageWhatsApp({ cle }));
        const res = await Promise.all(candidats.map((c, i) => (i % 2 === 0 ? a : b).creer(c)));
        expect(res.filter((r) => r.cree)).toHaveLength(1);
        expect(new Set(res.map((r) => r.message.id)).size).toBe(1);
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM whatsapp_message WHERE cle = $1`,
          [cle],
        );
        expect(rows[0].n).toBe(1);
      }));

    it("deux instances qui veulent le repli par SMS : une seule l'obtient", () =>
      deuxInstances(async (a, b) => {
        const m = messageWhatsApp({ secoursChiffre: "v1.secours" });
        await a.creer(m);
        const res = await Promise.all(
          Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? a : b).reserverSecours(m.id)),
        );
        expect(res.filter((r) => r !== null)).toHaveLength(1);
      }));

    it("deux instances qui changent le statut « seulementSi » : un seul changement passe", () =>
      deuxInstances(async (a, b) => {
        const m = messageWhatsApp();
        await a.creer(m);
        const res = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            (i % 2 === 0 ? a : b).modifier(m.id, { statut: "envoye", tentatives: i + 1 }, [
              "en_file",
              "en_reprise",
            ]),
          ),
        );
        expect(res.filter((r) => r !== null)).toHaveLength(1);
      }));

    it("deux instances qui reçoivent le même webhook : un seul message enregistré", () =>
      deuxInstances(async (a, b) => {
        const idFournisseur = `wamid.in-${randomUUID()}`;
        const res = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            (i % 2 === 0 ? a : b).enregistrerEntrant(entrantWhatsApp({ idFournisseur })),
          ),
        );
        expect(res.filter(Boolean)).toHaveLength(1);
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM whatsapp_entrant WHERE "idFournisseur" = $1`,
          [idFournisseur],
        );
        expect(rows[0].n).toBe(1);
      }));

    it("deux instances qui répondent en même temps : chaque message reçu n'est marqué qu'une fois", () =>
      deuxInstances(async (a, b) => {
        const expediteurIndex = `exp-${randomUUID()}`;
        const recus = [1, 2, 3, 4].map((i) =>
          entrantWhatsApp({ expediteurIndex, recuA: apres(i * 1_000) }),
        );
        for (const e of recus) await a.enregistrerEntrant(e);
        const res = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            (i % 2 === 0 ? a : b).marquerReponse(expediteurIndex, apres(20_000), 3_600_000),
          ),
        );
        const marques = res.filter((r) => r !== null).map((r) => r!.id);
        expect(marques).toHaveLength(4);
        expect(new Set(marques).size).toBe(4);
        expect(await a.marquerReponse(expediteurIndex, apres(30_000), 3_600_000)).toBeNull();
      }));

    it("un message écrit par une instance est lu et modifié par l'autre", () =>
      deuxInstances(async (a, b) => {
        const m = messageWhatsApp();
        await a.creer(m);
        expect(await b.trouver(m.id)).toEqual(m);
        await b.modifier(m.id, { statut: "remis", remisA: apres(1_000) });
        expect(await a.trouver(m.id)).toMatchObject({ statut: "remis", remisA: apres(1_000) });
        await a.ajouterEssai({
          messageId: m.id,
          numero: 1,
          fournisseur: "meta",
          at: apres(500),
          dureeMs: 90,
          resultat: "accepte",
          code: null,
        });
        expect(await b.essais(m.id)).toHaveLength(1);
      }));

    it("un identifiant du fournisseur n'appartient qu'à un message (les accusés le retrouvent sans ambiguïté)", async () => {
      const journal = new JournalWhatsAppPrisma(prisma);
      const wamid = `wamid.${randomUUID()}`;
      const a = messageWhatsApp();
      const b = messageWhatsApp();
      await journal.creer(a);
      await journal.creer(b);
      await journal.modifier(a.id, { idFournisseur: wamid });
      await expect(journal.modifier(b.id, { idFournisseur: wamid })).rejects.toThrow();
      expect((await journal.trouverParFournisseur(wamid))?.id).toBe(a.id);
      // Plusieurs messages sans identifiant (pas encore envoyés) sont permis.
      expect(await journal.trouver(b.id)).toMatchObject({ idFournisseur: null });
    });

    it("les essais sont en ajout seul : ni UPDATE, ni DELETE, ni TRUNCATE ; résultat et numéro contrôlés", async () => {
      const journal = new JournalWhatsAppPrisma(prisma);
      const m = messageWhatsApp();
      await journal.creer(m);
      await journal.ajouterEssai({
        messageId: m.id,
        numero: 1,
        fournisseur: "meta",
        at: new Date(),
        dureeMs: 120,
        resultat: "accepte",
        code: null,
      });
      expect(
        await erreurSql(`UPDATE whatsapp_essai SET "dureeMs" = 1 WHERE "messageId" = $1`, [m.id]),
      ).toContain("interdit");
      expect(
        await erreurSql(`DELETE FROM whatsapp_essai WHERE "messageId" = $1`, [m.id]),
      ).toContain("interdit");
      expect(await erreurSql(`TRUNCATE whatsapp_essai`)).toContain("interdit");
      const insertion = (resultat: string, numero: number, duree: number, id: string = m.id) =>
        erreurSql(
          `INSERT INTO whatsapp_essai ("messageId", numero, fournisseur, at, "dureeMs", resultat)
           VALUES ($1, $2, 'meta', now(), $3, $4)`,
          [id, numero, duree, resultat],
        );
      expect(await insertion("perdu", 1, 10)).toContain("whatsapp_essai_resultat_connu");
      expect(await insertion("accepte", 0, 10)).toContain("whatsapp_essai_numero");
      expect(await insertion("accepte", 1, -1)).toContain("whatsapp_essai_numero");
      // Un essai appartient à un message qui existe.
      expect(await insertion("accepte", 1, 10, randomUUID())).toContain(
        "whatsapp_essai_messageId_fkey",
      );
      expect(await insertion("accepte", 2, 10)).toBe("");
    });

    it("un message ne se supprime pas tant qu'il a des essais", async () => {
      const journal = new JournalWhatsAppPrisma(prisma);
      const m = messageWhatsApp();
      await journal.creer(m);
      await journal.ajouterEssai({
        messageId: m.id,
        numero: 1,
        fournisseur: "meta",
        at: new Date(),
        dureeMs: 10,
        resultat: "accepte",
        code: null,
      });
      expect(await erreurSql(`DELETE FROM whatsapp_message WHERE id = $1`, [m.id])).toContain(
        "whatsapp_essai_messageId_fkey",
      );
    });

    it("le type, le statut et le repli d'un message sont des listes fermées", async () => {
      const insere = (s: Record<string, unknown>) => {
        const m = { ...messageWhatsApp(), ...s } as ReturnType<typeof messageWhatsApp> &
          Record<string, unknown>;
        return erreurSql(
          `INSERT INTO whatsapp_message
             (id, type, cle, "destinataireChiffre", "destinataireIndex", "destinataireMasque",
              statut, tentatives, secours, "referenceType", "referenceId", "delaiEnvoiMs", "creeA")
           VALUES ($1, $2, $3, 'c', 'i', 'm', $4, $5, $6, $7, $8, $9, now())`,
          [
            m.id,
            m.type,
            m.cle,
            m.statut,
            m.tentatives,
            m.secours,
            m.referenceType ?? null,
            m.referenceId ?? null,
            m.delaiEnvoiMs,
          ],
        );
      };
      expect(await insere({ type: "newsletter" })).toContain("whatsapp_message_type_connu");
      expect(await insere({ statut: "perdu" })).toContain("whatsapp_message_statut_connu");
      expect(await insere({ secours: "telegram" })).toContain("whatsapp_message_secours_connu");
      expect(await insere({ tentatives: -1 })).toContain("whatsapp_message_compteurs");
      expect(await insere({ delaiEnvoiMs: -5 })).toContain("whatsapp_message_compteurs");
      // Une référence a son type et son identifiant, ou ni l'un ni l'autre.
      expect(await insere({ referenceType: "billet", referenceId: null })).toContain(
        "whatsapp_message_reference_complete",
      );
      expect(await insere({ referenceType: "billet", referenceId: "b-1" })).toBe("");
    });

    it("un message reçu porte son instant de réponse et son délai ensemble, ou aucun des deux", async () => {
      const insere = (repondueA: Date | null, delai: number | null) =>
        erreurSql(
          `INSERT INTO whatsapp_entrant (id, "idFournisseur", "expediteurIndex", "expediteurMasque",
                                          "typeMessage", "recuA", "repondueA", "delaiReponseMs")
           VALUES ($1, $2, 'e', 'm', 'text', now(), $3, $4)`,
          [randomUUID(), `wamid.in-${randomUUID()}`, repondueA, delai],
        );
      expect(await insere(new Date(), null)).toContain("whatsapp_entrant_reponse_complete");
      expect(await insere(null, 10)).toContain("whatsapp_entrant_reponse_complete");
      expect(await insere(new Date(), -10)).toContain("whatsapp_entrant_delai");
      expect(await insere(new Date(), 10)).toBe("");
      expect(await insere(null, null)).toBe("");
    });

    it("ni le contenu du message, ni le numéro, ni le texte reçu n'ont de colonne : rien de personnel en clair", async () => {
      const { rows } = await sql.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_name IN ('whatsapp_message', 'whatsapp_essai', 'whatsapp_entrant')`,
      );
      const colonnes = rows.map((r) => `${r.table_name}.${r.column_name}`);
      for (const interdite of [
        "contenu",
        "texte",
        "corps",
        "variables",
        "telephone",
        "numero_clair",
        "destinataire",
        "expediteur",
        "message",
        "body",
        "text",
      ]) {
        expect(colonnes.map((c) => c.split(".")[1])).not.toContain(interdite);
      }
      // Le seul champ de texte « sensible » du message est chiffré : le numéro et le repli par SMS.
      expect(colonnes).toContain("whatsapp_message.destinataireChiffre");
      expect(colonnes).toContain("whatsapp_message.secoursChiffre");
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
          FOURNISSEUR_JOURNAL_WHATSAPP,
        ],
      }).compile();
    };

    it("API_STOCKAGE=postgres : le journal est celui de PostgreSQL", async () => {
      const m = await monter("postgres");
      expect(m.get(JournalWhatsApp)).toBeInstanceOf(JournalWhatsAppPrisma);
      expect(m.get(JournalWhatsApp).durable).toBe(true);
    });

    it("API_STOCKAGE=memoire : le journal reste en mémoire", async () => {
      const m = await monter("memoire");
      expect(m.get(JournalWhatsApp)).toBeInstanceOf(JournalWhatsAppMemoire);
      expect(m.get(JournalWhatsApp).durable).toBe(false);
    });
  });

  describe("la passerelle de bout en bout, sur un journal en base", () => {
    let t: AppWhatsAppTest;
    let afrimove: { id: string; jeton: string };
    let patron: { id: string; jeton: string };
    const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
    const vider = async () => {
      for (let i = 0; i < 20; i++) {
        if ((await t.file.traiterPrets()) === 0) return;
      }
    };

    // Le contrat a rempli les messages reçus : la mesure « répond en N min » part d'une base vide.
    // Le fournisseur simulé numérote ses accusés (wamid.simule-1, -2…) depuis 1 à chaque montage de
    // l'API ; le vrai WhatsApp ne repasse jamais deux fois le même : ceux des montages précédents
    // sont libérés pour que chaque test reparte de zéro.
    beforeEach(async () => {
      await sql.query(`DELETE FROM whatsapp_entrant`);
      await sql.query(
        `UPDATE whatsapp_message SET "idFournisseur" = NULL WHERE "idFournisseur" LIKE 'wamid.simule-%'`,
      );
      t = await creerAppWhatsAppTest({}, { prisma: nouvelleConnexion() });
      afrimove = await t.compte("afrimove", { compagnieId: null, gareId: null });
      patron = await t.compte("patron", { gareId: null });
    });

    afterEach(async () => {
      await t?.fermer();
    });

    it("le journal de l'API est celui de PostgreSQL", () => {
      expect(t.journal).toBeInstanceOf(JournalWhatsAppPrisma);
    });

    it("la relance du rapport écrit un message par destinataire, une seule fois, sans contenu ni numéro en clair", async () => {
      // La clé du rapport est propre à chaque compagnie, jour et personne : un autre jour, la base de
      // test (jamais vidée de ses messages) ne le connaît pas.
      const jour = "2027-01-05";
      const res = await t
        .http()
        .post("/whatsapp/rapports/envoyer")
        .set(avec(afrimove.jeton))
        .send({ compagnieId: COMPAGNIE, jour })
        .expect(202);
      expect(res.body).toMatchObject({ destinataires: 2, envoyes: 2, dejaEnvoyes: 0 });
      await vider();
      const encore = await t
        .http()
        .post("/whatsapp/rapports/envoyer")
        .set(avec(afrimove.jeton))
        .send({ compagnieId: COMPAGNIE, jour })
        .expect(202);
      expect(encore.body).toMatchObject({ envoyes: 0, dejaEnvoyes: 2 });

      const { rows } = await sql.query(
        `SELECT * FROM whatsapp_message WHERE cle LIKE $1 ORDER BY cle`,
        [`rapport:${COMPAGNIE}:${jour}:%`],
      );
      expect(rows).toHaveLength(2);
      for (const ligne of rows) {
        expect(ligne).toMatchObject({
          type: "rapport_soir",
          statut: "envoye",
          compagnieId: COMPAGNIE,
        });
        const brut = JSON.stringify(ligne);
        // Ni numéro, ni chiffre du rapport : seul le chiffré, l'index aveugle et le masque.
        expect(brut).not.toMatch(/655010001|655010002/);
        expect(brut).not.toMatch(/\+237\s?6/);
        expect(ligne.destinataireMasque).toMatch(/•/);
      }
      const { rows: essais } = await sql.query(
        `SELECT resultat FROM whatsapp_essai WHERE "messageId" = ANY($1::uuid[])`,
        [rows.map((r) => r.id)],
      );
      expect(essais).toEqual([{ resultat: "accepte" }, { resultat: "accepte" }]);
    });

    it("le suivi d'un message : statut, essais, accusés signés, cloisonnement par compagnie", async () => {
      const { message } = await t.passerelle.envoyer({
        type: "billet",
        variables: VARIABLES_BILLET,
        destinataire: "+237655099101",
        compagnieId: COMPAGNIE,
      });
      await vider();
      const wamid = (await t.passerelle.obtenir(message.id)).idFournisseur!;
      expect(wamid).toBeTruthy();

      const appel = t.fournisseur.fabriquerWebhook({
        statuts: [{ idFournisseur: wamid, etat: "remis" }],
      });
      const res = await t
        .http()
        .post("/whatsapp/webhooks")
        .set(appel.entetes as Record<string, string>)
        .send(appel.corpsBrut!)
        .expect(200);
      expect(res.body.statuts).toEqual({ recus: 1, appliques: 1, ignores: 0, inconnus: 0 });

      const suivi = await t
        .http()
        .get(`/whatsapp/messages/${message.id}`)
        .set(avec(patron.jeton))
        .expect(200);
      expect(suivi.body).toMatchObject({
        statut: "remis",
        destinataireMasque: "+237 ••••• 101",
        essais: [{ numero: 1, resultat: "accepte", code: null }],
      });

      // Le même accusé rejoué ne change rien : le message est déjà remis.
      const rejoue = await t
        .http()
        .post("/whatsapp/webhooks")
        .set(appel.entetes as Record<string, string>)
        .send(appel.corpsBrut!)
        .expect(200);
      expect(rejoue.body.statuts.appliques).toBe(0);

      const ailleurs = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
      await t.http().get(`/whatsapp/messages/${message.id}`).set(avec(ailleurs.jeton)).expect(404);
    });

    it("un refus définitif de WhatsApp réserve le repli par SMS une seule fois, et efface son texte à l'envoi", async () => {
      t.fournisseur.programmer({ type: "definitif", code: "pas_sur_whatsapp" });
      const avant = t.secoursSms.demandes.length;
      const { message } = await t.passerelle.envoyer({
        type: "billet",
        variables: VARIABLES_BILLET,
        destinataire: "+237655099102",
        compagnieId: COMPAGNIE,
      });
      await vider();
      expect(t.secoursSms.demandes).toHaveLength(avant + 1);
      const { rows } = await sql.query(
        `SELECT statut, secours, "derniereErreur", "secoursChiffre" FROM whatsapp_message WHERE id = $1`,
        [message.id],
      );
      expect(rows[0]).toMatchObject({
        statut: "echec",
        secours: "sms",
        derniereErreur: "pas_sur_whatsapp",
      });
    });

    it("un message reçu est enregistré une fois (webhook rejoué), puis la réponse du compte mesure le délai", async () => {
      const q = t.fournisseur.fabriquerWebhook({
        messages: [
          {
            idFournisseur: "wamid.q-pg",
            de: "237655010001",
            texte: "Pourquoi le 09:30 part si vide ?",
          },
        ],
      });
      const poster = () =>
        t
          .http()
          .post("/whatsapp/webhooks")
          .set(q.entetes as Record<string, string>)
          .send(q.corpsBrut!)
          .expect(200);
      expect((await poster()).body.messages).toMatchObject({ enregistres: 1, doublons: 0 });
      expect((await poster()).body.messages).toMatchObject({ enregistres: 0, doublons: 1 });

      const { rows } = await sql.query(`SELECT * FROM whatsapp_entrant`);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0])).not.toMatch(/Pourquoi|655010001/);

      t.horloge.avancer(2 * 60_000);
      await t.passerelle.repondre({
        destinataire: "+237655010001",
        texte: "Trois jours de suite à 55 %.",
      });
      await vider();

      const compte = await t.http().get("/whatsapp/compte").set(avec(patron.jeton)).expect(200);
      expect(compte.body).toMatchObject({
        detail: "compte vérifié · répond en 2 min",
        delaiReponseMedianMs: 120_000,
        reponsesMesurees: 1,
      });
      const { rows: apresReponse } = await sql.query(
        `SELECT "delaiReponseMs" FROM whatsapp_entrant`,
      );
      expect(apresReponse).toEqual([{ delaiReponseMs: 120_000 }]);
    });
  });
});
