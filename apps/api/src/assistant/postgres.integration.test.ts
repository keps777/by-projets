import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerSessionPg } from "../analyses/testing/session-pg";
import { creerAppAgencePg, type AppAgencePg } from "../caisse/testing/app-agence-pg";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { ConversationsMemoire, PropositionsMemoire } from "./memoire";
import { ConversationsPrisma, PropositionsPrisma } from "./postgres";
import {
  apres,
  contratPortsAssistant,
  unEchange,
  uneAction,
  type BancAssistant,
  type ContexteAssistant,
} from "./testing/contrat-ports";

/**
 * Adaptateurs PostgreSQL de l'assistant : les mêmes tests de contrat sur la mémoire (toujours) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit, et l'API de bout
 * en bout avec `API_STOCKAGE=postgres`.
 */

contratPortsAssistant("contrat · adaptateurs en mémoire", async () => ({
  conversations: new ConversationsMemoire(),
  propositions: new PropositionsMemoire(),
  nouveauContexte: async (): Promise<ContexteAssistant> => ({
    compagnieId: randomUUID(),
    utilisateurs: [randomUUID(), randomUUID()],
  }),
  fermer: async () => undefined,
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · assistant", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let fx: FixturesPg;
  let banc: BancAssistant;

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
    fx = new FixturesPg(prisma);
    banc = {
      conversations: new ConversationsPrisma(prisma),
      propositions: new PropositionsPrisma(prisma),
      nouveauContexte: async () => {
        const compagnie = await fx.compagnie();
        const a = await fx.personne({ roles: ["patron"], compagnieId: compagnie.id });
        const b = await fx.personne({ roles: ["patron"], compagnieId: compagnie.id });
        return { compagnieId: compagnie.id, utilisateurs: [a.id, b.id] };
      },
      fermer: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Les tests de contrat s'exécutent ici, sur la base préparée plus haut.
  contratPortsAssistant("contrat · adaptateurs PostgreSQL", async () => banc);

  describe("ce que la base garantit seule", () => {
    it("la mémoire du patron ne se réécrit pas : ni UPDATE, ni DELETE, ni TRUNCATE", async () => {
      const ctx = await banc.nouveauContexte();
      const e = unEchange(ctx, 1);
      await banc.conversations.ajouter(e);
      expect(
        await erreurSql(`UPDATE assistant_echange SET redaction = 'modele' WHERE id = $1`, [e.id]),
      ).not.toBe("");
      expect(await erreurSql(`DELETE FROM assistant_echange WHERE id = $1`, [e.id])).not.toBe("");
      expect(await erreurSql(`TRUNCATE assistant_echange`)).not.toBe("");
      expect(
        (await banc.conversations.derniers(ctx.compagnieId, ctx.utilisateurs[0], 5)).map(
          (x) => x.id,
        ),
      ).toEqual([e.id]);
    });

    it("un échange sans compagnie ou sans patron réel est refusé (clés étrangères)", async () => {
      const ctx = await banc.nouveauContexte();
      await expect(
        banc.conversations.ajouter(unEchange(ctx, 1, { compagnieId: randomUUID() })),
      ).rejects.toThrow();
      await expect(
        banc.conversations.ajouter(unEchange(ctx, 2, { utilisateurId: randomUUID() })),
      ).rejects.toThrow();
    });

    it("une intention ou une rédaction inconnue est refusée, même écrite à la main", async () => {
      const ctx = await banc.nouveauContexte();
      const ecrire = (intention: string, redaction: string) =>
        erreurSql(
          `INSERT INTO assistant_echange (id, "compagnieId", "utilisateurId", intention, redaction, reponse, contexte, "creeLe")
           VALUES ($1, $2, $3, $4, $5, '{}', '{}', now())`,
          [randomUUID(), ctx.compagnieId, ctx.utilisateurs[0], intention, redaction],
        );
      expect(await ecrire("devinette", "regles")).toMatch(/assistant_echange_intention_connue/);
      expect(await ecrire("cout_bus", "magie")).toMatch(/assistant_echange_redaction_connue/);
      expect(await ecrire("cout_bus", "regles")).toBe("");
    });

    it("un identifiant qui n'est pas un UUID est refusé proprement, sans toucher la base", async () => {
      const ctx = await banc.nouveauContexte();
      await expect(
        banc.conversations.ajouter(unEchange(ctx, 1, { id: "echange-1" })),
      ).rejects.toThrow(/identifiant invalide/);
      expect(await banc.conversations.derniers("pas-un-uuid", ctx.utilisateurs[0], 5)).toEqual([]);
      expect(await banc.propositions.trouver("pas-un-uuid", "x")).toBeNull();
      await expect(
        banc.propositions.reserver(ctx.compagnieId, "x", "pas-un-uuid", apres(1)),
      ).rejects.toThrow(/identifiant invalide/);
    });

    it("« par » et « quand » vont ensemble ; le journal et l'effet ne viennent qu'après l'application", async () => {
      const ctx = await banc.nouveauContexte();
      const action = uneAction();
      await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
      expect(
        await erreurSql(
          `UPDATE assistant_proposition SET "appliqueePar" = $2 WHERE "compagnieId" = $1`,
          [ctx.compagnieId, ctx.utilisateurs[0]],
        ),
      ).toMatch(/assistant_proposition_application/);
      expect(
        await erreurSql(
          `UPDATE assistant_proposition SET "journalId" = $2 WHERE "compagnieId" = $1`,
          [ctx.compagnieId, randomUUID()],
        ),
      ).toMatch(/assistant_proposition_application/);
      expect(
        await erreurSql(
          `UPDATE assistant_proposition SET "expireLe" = "proposeeLe" WHERE "compagnieId" = $1`,
          [ctx.compagnieId],
        ),
      ).toMatch(/assistant_proposition_validite/);
    });

    it("la réservation se joue dans la base : deux connexions distinctes, une seule gagne", async () => {
      const ctx = await banc.nouveauContexte();
      const action = uneAction();
      await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
      // Deux adaptateurs sur deux services Prisma : deux pools de connexions.
      const autre = new PrismaService(configTest({ DATABASE_URL: base.url }));
      try {
        const a = banc.propositions;
        const b = new PropositionsPrisma(autre);
        const reponses = await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            (i % 2 === 0 ? a : b).reserver(
              ctx.compagnieId,
              action.id,
              ctx.utilisateurs[i % 2]!,
              apres(3),
            ),
          ),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
      } finally {
        await autre.$disconnect();
      }
    });

    it("l'ordre de la conversation est l'ordre d'arrivée, même sous écritures concurrentes d'un même patron", async () => {
      const ctx = await banc.nouveauContexte();
      const echanges = Array.from({ length: 12 }, (_, i) => unEchange(ctx, i + 1));
      for (const e of echanges) await banc.conversations.ajouter(e);
      const lus = await banc.conversations.derniers(ctx.compagnieId, ctx.utilisateurs[0], 12);
      expect(lus.map((e) => e.id)).toEqual(echanges.map((e) => e.id));
    });
  });

  describe("API de bout en bout, stockage PostgreSQL", () => {
    let t: AppAgencePg;

    beforeAll(async () => {
      t = await creerAppAgencePg({ url: base.url });
    }, 120_000);
    afterAll(async () => {
      await t?.fermer();
    });

    it("une question posée est gardée en base, et la conversation la relit depuis la base", async () => {
      const d = await t.decor();
      const patron = await t.compte("patron", { compagnieId: d.compagnie.id, gareId: null });
      const auth = { Authorization: `Bearer ${patron.jeton}` };
      const q = await t
        .http()
        .post("/patron/assistant/questions")
        .set(auth)
        .send({ question: "Pourquoi la ligne Douala - Yaoundé perd de l'argent ?" });
      expect(q.status, JSON.stringify(q.body)).toBe(200);
      const { rows } = await sql.query(
        `SELECT intention, redaction, "utilisateurId" FROM assistant_echange WHERE "compagnieId" = $1`,
        [d.compagnie.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].utilisateurId).toBe(patron.id);

      const c = await t.http().get("/patron/assistant/conversation").set(auth);
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect(c.body.echanges).toHaveLength(1);
      expect(c.body.echanges[0].question).toBe(
        "Pourquoi la ligne Douala - Yaoundé perd de l'argent ?",
      );
    });

    it("insights, puis proposition signée avec le PIN : la base garde la proposition, qui ne s'applique qu'une fois", async () => {
      const d = await t.decor();
      const patron = await t.compte("patron", { compagnieId: d.compagnie.id, gareId: null });
      const agent = await t.compte(
        "guichetier",
        { compagnieId: d.compagnie.id, gareId: d.gare.id },
        { nom: "Joseph Mbarga", guichetId: d.guichets[0]!.id },
      );
      const superviseur = await t.fx.personne({
        roles: ["superviseur"],
        compagnieId: d.compagnie.id,
        gareId: d.gare.id,
      });
      // Trois caisses validées en écart négatif, les 26, 28 et 30 octobre (« aujourd'hui » : 2 novembre).
      for (const jour of ["2026-10-26", "2026-10-28", "2026-10-30"]) {
        await creerSessionPg(t.prisma, {
          compagnieId: d.compagnie.id,
          gareId: d.gare.id,
          guichetId: d.guichets[0]!.id,
          agentId: agent.id,
          superviseurId: superviseur.id,
          etat: "validee",
          ouverteA: `${jour}T07:00:00.000Z`,
          ecart: -5_000,
        });
      }
      const auth = { Authorization: `Bearer ${patron.jeton}` };
      const insights = await t.http().get("/patron/assistant/insights").set(auth);
      expect(insights.status, JSON.stringify(insights.body)).toBe(200);
      const action = (insights.body.fuites as { actions: { id: string; type: string }[] }[])
        .flatMap((f) => f.actions)
        .find((a) => a.type === "controle_inopine");
      expect(action, JSON.stringify(insights.body.fuites)).toBeDefined();

      const avant = await sql.query(
        `SELECT "appliqueePar", "journalId", action FROM assistant_proposition WHERE "compagnieId" = $1 AND "actionId" = $2`,
        [d.compagnie.id, action!.id],
      );
      expect(avant.rows).toHaveLength(1);
      expect(avant.rows[0].appliqueePar).toBeNull();
      expect(avant.rows[0].action.type).toBe("controle_inopine");

      const signature = { pin: patron.pin, methode: "pin", signeA: t.iso() };
      const refus = await t
        .http()
        .post("/patron/assistant/propositions")
        .set(auth)
        .send({ actionId: action!.id, signature: { ...signature, pin: "000000" } });
      expect(refus.status).toBe(403);
      expect(
        (
          await sql.query(
            `SELECT "appliqueePar" FROM assistant_proposition WHERE "compagnieId" = $1 AND "actionId" = $2`,
            [d.compagnie.id, action!.id],
          )
        ).rows[0].appliqueePar,
      ).toBeNull();

      // Cinq clics en même temps avec le bon PIN : un seul passe.
      const reponses = await Promise.all(
        Array.from({ length: 5 }, () =>
          t.http().post("/patron/assistant/propositions").set(auth).send({
            actionId: action!.id,
            signature,
          }),
        ),
      );
      const statuts = reponses.map((r) => r.status).sort();
      expect(statuts, JSON.stringify(reponses.map((r) => r.body))).toEqual([
        200, 409, 409, 409, 409,
      ]);
      const ok = reponses.find((r) => r.status === 200)!;

      const { rows } = await sql.query(
        `SELECT "appliqueePar", "appliqueeA", "journalId", "effetA" FROM assistant_proposition WHERE "compagnieId" = $1 AND "actionId" = $2`,
        [d.compagnie.id, action!.id],
      );
      expect(rows[0].appliqueePar).toBe(patron.id);
      expect(rows[0].appliqueeA).toBeInstanceOf(Date);
      expect(rows[0].journalId).toBe(ok.body.journalId);
      expect(rows[0].effetA).toBeInstanceOf(Date);
      // La ligne du journal d'audit existe, sans le PIN.
      const audit = await sql.query(`SELECT action, details FROM journal_audit WHERE id = $1`, [
        ok.body.journalId,
      ]);
      expect(audit.rows[0].action).toBe("assistant.proposition.appliquer");
      expect(JSON.stringify(audit.rows[0].details)).not.toContain(patron.pin);
    });

    it("une action jamais proposée par l'API ne s'applique pas, et rien n'est écrit", async () => {
      const d = await t.decor();
      const patron = await t.compte("patron", { compagnieId: d.compagnie.id, gareId: null });
      const r = await t
        .http()
        .post("/patron/assistant/propositions")
        .set({ Authorization: `Bearer ${patron.jeton}` })
        .send({
          actionId: "controle_inopine:inventee",
          signature: { pin: patron.pin, methode: "pin", signeA: t.iso() },
        });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM assistant_proposition WHERE "compagnieId" = $1`,
        [d.compagnie.id],
      );
      expect(rows[0].n).toBe(0);
    });
  });
});
