import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ColisPrisma } from "../colis/postgres";
import { unColis } from "../colis/testing/contrat-ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { HorlogeFixe } from "../socle/testing/memoire";
import { JournalSigneService } from "./journal/journal.service";
import { EvenementsTraitesMemoire, JournalAgenceMemoire } from "./journal/memoire";
import { EvenementsTraitesPrisma, JournalAgencePrisma } from "./journal/postgres";
import {
  AlertesPatronMemoire,
  GuichetsMemoire,
  MouvementsMemoire,
  ReglesMemoire,
  SessionsMemoire,
} from "./memoire";
import {
  AlertesPatronPrisma,
  GuichetsAgencePrisma,
  MouvementsCaissePrisma,
  ReglesAgencePrisma,
  SessionsCaissePrisma,
} from "./postgres";
import { creerAppAgencePg, type AppAgencePg } from "./testing/app-agence-pg";
import {
  contratPortsCaisse,
  instant,
  uneCloture,
  uneSession,
  type BancCaisse,
  type ContexteCaisse,
} from "./testing/contrat-ports";
import { cloture, comptage, envoyer, lire, ouverture } from "./testing/outils";
import { FixturesPg } from "./testing/fixtures-pg";
import { aammjjDouala, MS_PAR_HEURE } from "./temps";

/**
 * Adaptateurs PostgreSQL de la caisse et du journal d'agence : les mêmes tests de contrat sur la
 * mémoire (toujours) et sur PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la
 * base garantit, et l'API de bout en bout sur PostgreSQL (une caisse par agent, journal signé chaîné,
 * clôture de minuit, redémarrage).
 */

function bancMemoire(): BancCaisse {
  const sessions = new SessionsMemoire();
  const mouvements = new MouvementsMemoire();
  const guichets = new GuichetsMemoire();
  const regles = new ReglesMemoire();
  const alertes = new AlertesPatronMemoire();
  return {
    sessions,
    mouvements,
    guichets,
    regles,
    alertes,
    journal: new JournalAgenceMemoire(),
    traites: new EvenementsTraitesMemoire(),
    nouveauContexte: async () => {
      const compagnieId = randomUUID();
      const gareId = randomUUID();
      const gareCode = "DLA";
      const ctx: ContexteCaisse = {
        compagnieId,
        gareId,
        gareCode,
        guichets: [1, 2, 3].map((rang) => ({ id: randomUUID(), rang })),
        agents: [randomUUID(), randomUUID(), randomUUID()],
        superviseurId: randomUUID(),
      };
      for (const g of ctx.guichets) {
        guichets.declarer({ id: g.id, rang: g.rang, gareId, gareCode, compagnieId });
      }
      return ctx;
    },
    vendre: async (_ctx, v) => {
      const m = { agentId: v.agentId, guichetId: v.guichetId, montant: v.montant, at: v.at };
      if (v.genre === "billet_cash") mouvements.venteCash(m);
      else if (v.genre === "colis_cash") mouvements.colisEnCash(m);
      else mouvements.venteMomo(m);
    },
    definirTolerance: async (compagnieId, montant) => regles.definirTolerance(compagnieId, montant),
    alertesDe: async (compagnieId) => alertes.lignes.filter((a) => a.compagnieId === compagnieId),
    fermer: async () => undefined,
  };
}

contratPortsCaisse("contrat · adaptateurs en mémoire", async () => bancMemoire());

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · caisse et journal d'agence", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let fx: FixturesPg;
  let banc: BancCaisse;
  let colis: ColisPrisma;

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
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    fx = new FixturesPg(prisma);
    colis = new ColisPrisma(prisma, new ChiffrementService(config));

    // Une horloge qui avance d'une seconde à chaque lecture : les alertes ont des heures distinctes.
    let tic = 0;
    const horloge = {
      maintenant: () => new Date(Date.parse("2027-01-04T08:00:00.000Z") + 1000 * tic++),
    };
    const departs = new Map<
      string,
      { departId: string; gare: Awaited<ReturnType<typeof fx.gare>> }
    >();

    banc = {
      sessions: new SessionsCaissePrisma(prisma),
      mouvements: new MouvementsCaissePrisma(prisma),
      guichets: new GuichetsAgencePrisma(prisma),
      regles: new ReglesAgencePrisma(prisma),
      alertes: new AlertesPatronPrisma(prisma, horloge as never),
      journal: new JournalAgencePrisma(prisma),
      traites: new EvenementsTraitesPrisma(prisma),
      nouveauContexte: async () => {
        const compagnie = await fx.compagnie();
        const gare = await fx.gare(compagnie.id);
        const guichets = [
          await fx.guichet(gare.id, 1),
          await fx.guichet(gare.id, 2),
          await fx.guichet(gare.id, 3),
        ];
        const agents: string[] = [];
        for (let i = 0; i < 3; i++) {
          agents.push(
            (
              await fx.personne({
                roles: ["guichetier"],
                compagnieId: compagnie.id,
                gareId: gare.id,
                guichetId: guichets[i]!.id,
              })
            ).id,
          );
        }
        const superviseur = await fx.personne({
          roles: ["superviseur"],
          compagnieId: compagnie.id,
          gareId: gare.id,
        });
        const ligne = await fx.ligne(compagnie.id, gare.id, gare.id);
        const depart = await fx.depart(ligne.id);
        departs.set(compagnie.id, { departId: depart.id, gare });
        return {
          compagnieId: compagnie.id,
          gareId: gare.id,
          gareCode: gare.code,
          guichets,
          agents,
          superviseurId: superviseur.id,
        };
      },
      vendre: async (ctx, v) => {
        const { departId, gare } = departs.get(ctx.compagnieId)!;
        const at = new Date(v.at);
        if (v.genre === "colis_cash") {
          const contexte = {
            compagnieId: ctx.compagnieId,
            origine: { id: gare.id, code: gare.code, nom: gare.nom, ville: gare.ville },
            destination: { id: gare.id, code: gare.code, nom: gare.nom, ville: gare.ville },
            expediteurId: v.agentId,
            auteurId: v.agentId,
            departId,
          };
          await colis.ajouter(
            unColis(contexte, {
              canal: "agence",
              creeA: v.at,
              prixTotal: v.montant,
              paiement: {
                reference: `PAY-${randomUUID().slice(0, 8)}`,
                moyen: "cash",
                etat: "paye",
                montant: v.montant,
                numero: null,
              },
              depose: { a: v.at, poidsReleveKg: 4, photoRef: "photos/depot.jpg", par: v.agentId },
            }),
          );
          return;
        }
        await fx.billet(
          { compagnieId: ctx.compagnieId, gareId: ctx.gareId, departId },
          {
            canal: "guichet",
            guichetId: v.guichetId,
            auteurId: v.agentId,
            prix: v.montant,
            mode:
              v.genre === "billet_cash"
                ? "cash"
                : v.genre === "billet_momo"
                  ? "momo"
                  : "orange_money",
            creeA: at,
          },
        );
      },
      definirTolerance: async (compagnieId, montant) => {
        await prisma.compagnie.update({
          where: { id: compagnieId },
          data: { toleranceEcartCaisse: montant },
        });
      },
      alertesDe: async (compagnieId) => {
        const lignes = await prisma.alertePatron.findMany({
          where: { compagnieId },
          orderBy: { creeA: "asc" },
        });
        return lignes.map((l) => ({
          type: l.type as never,
          compagnieId: l.compagnieId,
          gareId: l.gareId,
          message: l.message,
          details: l.details as Record<string, unknown>,
        }));
      },
      fermer: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Les tests de contrat s'exécutent ici, sur la base préparée plus haut.
  contratPortsCaisse("contrat · adaptateurs PostgreSQL", async () => banc, {
    attendreFin: false,
  });

  describe("ce que la base garantit seule", () => {
    it("deux caisses ouvertes pour un agent ou un guichet : l'index unique refuse, même écrit à la main", async () => {
      const ctx = await banc.nouveauContexte();
      const s = uneSession(ctx, { rang: 1 });
      await banc.sessions.creer(s);
      const inserer = (agent: number, rang: number) => {
        const autre = uneSession(ctx, { rang, agent });
        return erreurSql(
          `INSERT INTO session_caisse (id, numero, "guichetId", "agentId", "fondDeCaisse", "ouverteA",
             etat, "guichetRang", "gareId", "compagnieId")
           VALUES ($1, $2, $3, $4, 1000, now(), 'ouverte', $5, $6, $7)`,
          [
            autre.id,
            autre.numero,
            autre.guichetId,
            autre.agentId,
            rang,
            ctx.gareId,
            ctx.compagnieId,
          ],
        );
      };
      expect(await inserer(0, 2)).toMatch(/session_caisse_une_ouverte_par_agent/);
      expect(await inserer(1, 1)).toMatch(/session_caisse_une_ouverte_par_guichet/);
      expect(await inserer(1, 2)).toBe("");
    });

    it("la clôture et sa copie interrogeable ne divergent jamais : le CHECK refuse", async () => {
      const ctx = await banc.nouveauContexte();
      const s = uneSession(ctx);
      await banc.sessions.creer(s);
      const k = uneCloture({ cashCompte: 41_500, cashAttendu: 42_000, ecart: -500 });
      await banc.sessions.transiter(s.id, "ouverte", { etat: "cloturee", cloture: k });
      // L'adaptateur a écrit les copies dans la même instruction.
      const { rows } = await sql.query(
        `SELECT "clotureeA", "cashCompte", "cashAttendu", ecart, "clotureeAuto", etat FROM session_caisse WHERE id = $1`,
        [s.id],
      );
      expect(rows[0]).toMatchObject({
        cashCompte: 41_500,
        cashAttendu: 42_000,
        ecart: -500,
        clotureeAuto: false,
        etat: "cloturee",
      });
      expect(new Date(rows[0].clotureeA).toISOString()).toBe(new Date(k.at).toISOString());
      // Une copie qui diverge du JSON est refusée.
      expect(await erreurSql(`UPDATE session_caisse SET ecart = 0 WHERE id = $1`, [s.id])).toMatch(
        /session_cloture_copie/,
      );
      expect(
        await erreurSql(`UPDATE session_caisse SET "cashCompte" = 1 WHERE id = $1`, [s.id]),
      ).toMatch(/session_cloture_copie/);
      // Une session clôturée sans clôture, ou une session ouverte avec une clôture : refusé.
      expect(
        await erreurSql(`UPDATE session_caisse SET cloture = NULL WHERE id = $1`, [s.id]),
      ).toMatch(/session_etat_cloture|session_cloture_copie/);
      expect(
        await erreurSql(`UPDATE session_caisse SET etat = 'ouverte' WHERE id = $1`, [s.id]),
      ).toMatch(/session_etat_cloture/);
      // Valider sans validation, ou une validation dont la copie diverge.
      expect(
        await erreurSql(`UPDATE session_caisse SET etat = 'validee' WHERE id = $1`, [s.id]),
      ).toMatch(/session_etat_validation/);
    });

    it("la validation et sa copie ne divergent pas non plus", async () => {
      const ctx = await banc.nouveauContexte();
      const s = uneSession(ctx);
      await banc.sessions.creer(s);
      await banc.sessions.transiter(s.id, "ouverte", { etat: "cloturee", cloture: uneCloture() });
      const validation = {
        at: instant(500),
        superviseurId: ctx.superviseurId,
        superviseurNom: "Marie Ngo",
        ecart: -500,
        commentaire: "RAS",
        evenementId: randomUUID(),
      };
      await banc.sessions.transiter(s.id, "cloturee", { etat: "validee", validation });
      const { rows } = await sql.query(
        `SELECT "valideeA", "valideeParId" FROM session_caisse WHERE id = $1`,
        [s.id],
      );
      expect(rows[0].valideeParId).toBe(ctx.superviseurId);
      expect(new Date(rows[0].valideeA).toISOString()).toBe(new Date(validation.at).toISOString());
      expect(
        await erreurSql(`UPDATE session_caisse SET "valideeParId" = $2 WHERE id = $1`, [
          s.id,
          ctx.agents[0],
        ]),
      ).toMatch(/session_validation_copie/);
    });

    it("la colonne abandonnée « historique » reste vide : le journal signé est l'historique", async () => {
      const ctx = await banc.nouveauContexte();
      const s = uneSession(ctx);
      await banc.sessions.creer(s);
      await banc.sessions.transiter(s.id, "ouverte", { etat: "cloturee", cloture: uneCloture() });
      const { rows } = await sql.query(`SELECT historique FROM session_caisse WHERE id = $1`, [
        s.id,
      ]);
      expect(rows[0].historique).toEqual([]);
    });

    it("des identifiants qui ne sont pas des UUID sont refusés proprement, sans écrire", async () => {
      const ctx = await banc.nouveauContexte();
      const mauvais = uneSession(ctx, { id: "session-1" });
      expect(await banc.sessions.creer(mauvais)).toBe("identifiant_invalide");
      expect(
        await banc.sessions.creer(uneSession(ctx, { evenementOuvertureId: "evenement-1" })),
      ).toBe("identifiant_invalide");
      expect(
        await banc.sessions.ouvertes().then((l) => l.filter((s) => s.gareId === ctx.gareId)),
      ).toEqual([]);
    });

    it("le journal d'agence est en ajout seul : ni UPDATE, ni DELETE, ni TRUNCATE", async () => {
      const ctx = await banc.nouveauContexte();
      const evenementId = randomUUID();
      await banc.journal.ajouter(ctx.compagnieId, evenementId, (precedente) => ({
        gareId: ctx.gareId,
        compagnieId: ctx.compagnieId,
        evenementId,
        type: "caisse.ouverte",
        at: instant(1),
        auteur: { id: ctx.agents[0]!, nom: "Joseph" },
        appareilId: null,
        cible: { type: "session", id: randomUUID() },
        numeroPlage: null,
        resume: "Ouverture",
        validePar: null,
        empreinte: "e".repeat(64),
        precedente,
      }));
      expect(
        await erreurSql(`UPDATE journal_agence SET resume = 'truqué' WHERE "evenementId" = $1`, [
          evenementId,
        ]),
      ).toMatch(/ajout|modification|interdit/i);
      expect(
        await erreurSql(`DELETE FROM journal_agence WHERE "evenementId" = $1`, [evenementId]),
      ).toMatch(/ajout|modification|interdit/i);
      expect(await erreurSql(`TRUNCATE journal_agence`)).toMatch(/ajout|modification|interdit/i);
      expect(await banc.journal.chaine(ctx.compagnieId)).toHaveLength(1);
    });

    it("la chaîne ne se ramifie pas : deux entrées ne suivent jamais la même, même écrit à la main", async () => {
      const ctx = await banc.nouveauContexte();
      const premiere = await banc.journal.ajouter(ctx.compagnieId, randomUUID(), (precedente) => ({
        gareId: ctx.gareId,
        compagnieId: ctx.compagnieId,
        evenementId: randomUUID(),
        type: "caisse.ouverte",
        at: instant(1),
        auteur: { id: ctx.agents[0]!, nom: "Joseph" },
        appareilId: null,
        cible: { type: "session", id: randomUUID() },
        numeroPlage: null,
        resume: "Ouverture",
        validePar: null,
        empreinte: "a".repeat(64),
        precedente,
      }));
      const inserer = (precedente: string | null) =>
        erreurSql(
          `INSERT INTO journal_agence (chaine, "evenementId", type, at, "auteurId", "auteurNom",
             "cibleType", "cibleId", resume, empreinte, precedente)
           VALUES ($1, $2, 'caisse.ouverte', now(), 'x', 'X', 'session', 'y', 'r', $3, $4)`,
          [ctx.compagnieId, randomUUID(), "b".repeat(64), precedente],
        );
      // Une deuxième « première » entrée de la chaîne, ou une deuxième suite de la même entrée.
      expect(await inserer(null)).toMatch(/journal_agence_chaine_precedente_key/);
      expect(await inserer("a".repeat(64))).toBe("");
      expect(premiere).not.toBeNull();
      expect(await inserer("a".repeat(64))).toMatch(/journal_agence_chaine_precedente_key/);
    });

    it("les annulations retranchées sont en ajout seul et jamais négatives", async () => {
      const ctx = await banc.nouveauContexte();
      const s = uneSession(ctx);
      await banc.sessions.creer(s);
      const demandeId = randomUUID();
      await banc.mouvements.enregistrerAnnulation({
        demandeId,
        sessionId: s.id,
        montant: 5_000,
        at: instant(5),
      });
      expect(
        await erreurSql(`UPDATE annulation_caisse SET montant = 0 WHERE "demandeId" = $1`, [
          demandeId,
        ]),
      ).toMatch(/ajout|modification|interdit/i);
      expect(
        await erreurSql(`DELETE FROM annulation_caisse WHERE "demandeId" = $1`, [demandeId]),
      ).toMatch(/ajout|modification|interdit/i);
      expect(
        await erreurSql(
          `INSERT INTO annulation_caisse ("demandeId", "sessionId", montant, at) VALUES ($1, $2, -1, now())`,
          [randomUUID(), s.id],
        ),
      ).toMatch(/annulation_caisse_montant/);
    });

    it("un type d'alerte inconnu ou une tolérance négative : la base refuse", async () => {
      const ctx = await banc.nouveauContexte();
      expect(
        await erreurSql(
          `INSERT INTO alerte_patron (id, type, message, "creeA") VALUES ($1, 'inconnu', 'm', now())`,
          [randomUUID()],
        ),
      ).toMatch(/alerte_patron_type_connu/);
      expect(
        await erreurSql(`UPDATE compagnie SET "toleranceEcartCaisse" = -1 WHERE id = $1`, [
          ctx.compagnieId,
        ]),
      ).toMatch(/compagnie_tolerance_ecart_positive/);
    });

    it("un traitement « en cours » abandonné depuis plus de cinq minutes est repris", async () => {
      const id = randomUUID();
      expect(await banc.traites.commencer(id)).toEqual({ etat: "nouveau" });
      expect(await banc.traites.commencer(id)).toEqual({ etat: "en_cours" });
      await sql.query(
        `UPDATE evenement_agence_traite SET "recuA" = now() - interval '6 minutes' WHERE "evenementId" = $1`,
        [id],
      );
      // Le premier qui rejoue l'événement reprend le traitement ; les autres attendent.
      const etats = await Promise.all(Array.from({ length: 6 }, () => banc.traites.commencer(id)));
      expect(etats.filter((e) => e.etat === "nouveau")).toHaveLength(1);
      expect(etats.filter((e) => e.etat === "en_cours")).toHaveLength(5);
    });
  });

  describe("journal signé sur PostgreSQL", () => {
    it("trente écritures simultanées par le service : chaîne valide ; une entrée truquée la casse", async () => {
      const ctx = await banc.nouveauContexte();
      const config = configTest({ DATABASE_URL: base.url });
      const journal = new JournalSigneService(
        new JournalAgencePrisma(prisma),
        { trouverParId: async (id: string) => ({ id, nom: `Agent ${id.slice(0, 4)}` }) } as never,
        new HorlogeFixe(new Date("2027-01-04T08:00:00.000Z")),
        config,
      );
      const ecrire = (i: number) =>
        journal.ecrire({
          evenement: {
            id: randomUUID().toUpperCase(),
            type: "caisse.ouverte",
            // Sans millisecondes, comme un appareil peut l'envoyer.
            at: "2027-01-04T09:00:00+01:00",
            appareilId: "GU1-DLA",
            cible: { type: "session", id: randomUUID() },
            numeroPlage: null,
          },
          auteurId: ctx.agents[i % 3]!,
          resume: `Ouverture n° ${i} · Aïcha Ngô · 25 000 F`,
          gareId: ctx.gareId,
          compagnieId: ctx.compagnieId,
          ...(i % 5 === 0
            ? {
                validePar: {
                  superviseurId: ctx.superviseurId,
                  methode: "pin" as const,
                  signature: "ab".repeat(36),
                },
              }
            : {}),
        });
      await Promise.all(Array.from({ length: 30 }, (_, i) => ecrire(i)));
      expect(await journal.verifier(ctx.compagnieId)).toEqual({
        valide: true,
        entreesVerifiees: 30,
      });

      // Le journal est en ajout seul : on ne peut pas l'abîmer par SQL ordinaire…
      expect(
        await erreurSql(`UPDATE journal_agence SET resume = 'truqué' WHERE chaine = $1`, [
          ctx.compagnieId,
        ]),
      ).not.toBe("");
      // …mais un administrateur qui contourne les déclencheurs casse la chaîne, et on le voit.
      await sql.query(`ALTER TABLE journal_agence DISABLE TRIGGER journal_agence_ajout_seul`);
      try {
        await sql.query(
          `UPDATE journal_agence SET resume = 'truqué'
           WHERE seq = (SELECT seq FROM journal_agence WHERE chaine = $1 ORDER BY seq OFFSET 7 LIMIT 1)`,
          [ctx.compagnieId],
        );
      } finally {
        await sql.query(`ALTER TABLE journal_agence ENABLE TRIGGER journal_agence_ajout_seul`);
      }
      const rapport = await journal.verifier(ctx.compagnieId);
      expect(rapport.valide).toBe(false);
      expect(rapport.entreesVerifiees).toBe(7);
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

    it("une seule caisse par agent, même quand dix ouvertures arrivent en même temps", async () => {
      const d = await t.decor();
      const g = await t.compte("guichetier", { compagnieId: d.compagnie.id, gareId: d.gare.id });
      const guichet = d.guichets[1]!;
      const evenements = Array.from({ length: 10 }, (_, i) =>
        ouverture(t, g.id, {
          guichetId: guichet.id,
          numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-${i + 1}`,
        }),
      );
      const reponses = await Promise.all(
        evenements.map((e) => envoyer(t, "/agence/caisse/ouverture", g.jeton, e)),
      );
      const statuts = reponses.map((r) => r.status);
      expect(statuts.filter((s) => s === 200)).toHaveLength(1);
      expect(statuts.filter((s) => s === 409)).toHaveLength(9);
      expect(
        reponses
          .filter((r) => r.status === 409)
          .every((r) => r.body.code === "SESSION_DEJA_OUVERTE"),
      ).toBe(true);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM session_caisse WHERE "agentId" = $1 AND etat = 'ouverte'`,
        [g.id],
      );
      expect(rows[0].n).toBe(1);

      // Les refus ne sont pas retenus : l'appareil peut renvoyer l'événement une fois la cause levée.
      const refuse = reponses.findIndex((r) => r.status === 409);
      const { rows: traites } = await sql.query(
        `SELECT etat FROM evenement_agence_traite WHERE "evenementId" = $1`,
        [evenements[refuse]!.id],
      );
      expect(traites).toEqual([]);

      // Un deuxième agent sur le même guichet : refusé.
      const autre = await t.compte("guichetier", {
        compagnieId: d.compagnie.id,
        gareId: d.gare.id,
      });
      const rep = await envoyer(
        t,
        "/agence/caisse/ouverture",
        autre.jeton,
        ouverture(t, autre.id, {
          guichetId: guichet.id,
          numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-99`,
        }),
      );
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("GUICHET_OCCUPE");

      // Un identifiant de session qui n'est pas un UUID : 422, rien n'est écrit.
      const sansUuid = await t.compte("guichetier", {
        compagnieId: d.compagnie.id,
        gareId: d.gare.id,
      });
      const mauvais = await envoyer(
        t,
        "/agence/caisse/ouverture",
        sansUuid.jeton,
        ouverture(t, sansUuid.id, {
          sessionId: "session-1",
          guichetId: d.guichets[2]!.id,
          rang: 3,
          numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-3-1`,
        }),
      );
      expect(mauvais.status).toBe(422);
      expect(mauvais.body.code).toBe("IDENTIFIANT_INVALIDE");
    });

    it("ouvrir, vendre, compter, clôturer : le cash attendu vient des ventes en base, le journal est chaîné", async () => {
      const d = await t.decor();
      const g = await t.compte("guichetier", {
        compagnieId: d.compagnie.id,
        gareId: d.gare.id,
      });
      const guichet = d.guichets[1]!;
      const ligne = await t.fx.ligne(d.compagnie.id, d.gare.id, d.gare.id);
      const depart = await t.fx.depart(ligne.id);
      const contexte = { compagnieId: d.compagnie.id, gareId: d.gare.id, departId: depart.id };

      const sessionId = randomUUID();
      const ouv = ouverture(t, g.id, {
        sessionId,
        guichetId: guichet.id,
        numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
        fond: 25_000,
      });
      const rep = await envoyer(t, "/agence/caisse/ouverture", g.jeton, ouv);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body.accuse.statut).toBe("accepte");

      // Rejouée : même réponse, aucune seconde écriture.
      const rejeu = await envoyer(t, "/agence/caisse/ouverture", g.jeton, ouv);
      expect(rejeu.body.accuse.statut).toBe("deja_recu");
      expect(rejeu.body.session).toEqual(rep.body.session);

      // Deux billets cash (dont un avec bagage), un MoMo, au guichet de l'agent ; un billet d'un autre
      // guichet qui ne compte pas.
      t.horloge.avancer(30 * 60_000);
      const vente = (surcharge: Parameters<typeof t.fx.billet>[1]) =>
        t.fx.billet(contexte, {
          canal: "guichet",
          guichetId: guichet.id,
          auteurId: g.id,
          creeA: t.horloge.maintenant(),
          ...surcharge,
        });
      await vente({ prix: 8_000, mode: "cash" });
      await vente({ prix: 9_000, bagage: 500, mode: "cash" });
      await vente({ prix: 7_500, mode: "momo" });
      await vente({ prix: 99_000, mode: "cash", guichetId: d.guichets[0]!.id });

      t.horloge.avancer(6 * MS_PAR_HEURE);
      const lecture = await lire(t, "/agence/caisse/session", g.jeton);
      expect(lecture.status).toBe(200);
      expect(lecture.body.cashAttendu).toBe(25_000 + 8_000 + 9_500);
      expect(lecture.body.decompte.billetsCash).toEqual({ nombre: 2, montant: 17_500 });
      expect(lecture.body.decompte.momo).toEqual({ ventes: 1, montant: 7_500 });

      const compte = await envoyer(
        t,
        "/agence/caisse/comptage",
        g.jeton,
        comptage(g.id, sessionId, { 10_000: 4, 500: 3 }, 0, { at: t.iso() }),
      );
      expect(compte.status, JSON.stringify(compte.body)).toBe(200);

      const attendu = 25_000 + 17_500;
      const clot = cloture(g.id, sessionId, 41_500, attendu, { at: t.iso() });
      const fin = await envoyer(t, "/agence/caisse/cloture", g.jeton, clot);
      expect(fin.status, JSON.stringify(fin.body)).toBe(200);
      expect(fin.body.session).toMatchObject({ etat: "cloturee", cashAttendu: attendu });
      expect(fin.body.session.ecart.montant).toBe(41_500 - attendu);

      const { rows } = await sql.query(
        `SELECT etat, "cashCompte", "cashAttendu", ecart, "clotureeAuto", cloture FROM session_caisse WHERE id = $1`,
        [sessionId],
      );
      expect(rows[0]).toMatchObject({
        etat: "cloturee",
        cashCompte: 41_500,
        cashAttendu: attendu,
        ecart: 41_500 - attendu,
        clotureeAuto: false,
      });
      expect(rows[0].cloture.decompte.billetsCash).toEqual({ nombre: 2, montant: 17_500 });

      // Une deuxième clôture (autre événement) : refusée, la première reste.
      const encore = await envoyer(
        t,
        "/agence/caisse/cloture",
        g.jeton,
        cloture(g.id, sessionId, 1, attendu, { at: t.iso() }),
      );
      expect(encore.status).toBe(409);

      // Ouverture, comptage, clôture : trois entrées signées, la chaîne de la compagnie est valide.
      const rapport = await t.journal.verifier(d.compagnie.id);
      expect(rapport).toEqual({ valide: true, entreesVerifiees: 3 });
      const { rows: journal } = await sql.query(
        `SELECT type FROM journal_agence WHERE chaine = $1 ORDER BY seq`,
        [d.compagnie.id],
      );
      expect(journal.map((r) => r.type)).toEqual([
        "caisse.ouverte",
        "caisse.comptee",
        "caisse.cloturee",
      ]);
    });

    it("clôture de minuit : une seule fois, le patron est alerté, même quand trois instances la lancent ensemble", async () => {
      const d = await t.decor();
      const g = await t.compte("guichetier", { compagnieId: d.compagnie.id, gareId: d.gare.id });
      const sessionId = randomUUID();
      const rep = await envoyer(
        t,
        "/agence/caisse/ouverture",
        g.jeton,
        ouverture(t, g.id, {
          sessionId,
          guichetId: d.guichets[1]!.id,
          numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
        }),
      );
      expect(rep.status).toBe(200);

      // Le lendemain à 00 h 05 (Douala).
      const minuit = Date.parse("2027-01-05T00:05:00.000+01:00");
      t.horloge.avancer(minuit - t.horloge.maintenant().getTime());
      const comptes = await Promise.all([
        t.caisse.cloturerLesSessionsDeMinuit(),
        t.caisse.cloturerLesSessionsDeMinuit(),
        t.caisse.cloturerLesSessionsDeMinuit(),
      ]);
      expect(comptes.reduce((s, n) => s + n, 0)).toBeGreaterThanOrEqual(1);

      const { rows } = await sql.query(
        `SELECT etat, "clotureeAuto", cloture ->> 'comptageAbsent' AS absent FROM session_caisse WHERE id = $1`,
        [sessionId],
      );
      expect(rows[0]).toEqual({ etat: "cloturee", clotureeAuto: true, absent: "true" });
      const { rows: alertes } = await sql.query(
        `SELECT type FROM alerte_patron WHERE "compagnieId" = $1`,
        [d.compagnie.id],
      );
      expect(alertes).toEqual([{ type: "cloture_automatique" }]);
      const { rows: journal } = await sql.query(
        `SELECT count(*)::int AS n FROM journal_agence WHERE chaine = $1 AND type = 'caisse.cloturee'`,
        [d.compagnie.id],
      );
      expect(journal[0].n).toBe(1);
      expect(await t.journal.verifier(d.compagnie.id)).toMatchObject({ valide: true });
    });

    it("après un redémarrage, tout est relu de la base : session, journal, idempotence", async () => {
      const d = await t.decor();
      const g = await t.compte("guichetier", { compagnieId: d.compagnie.id, gareId: d.gare.id });
      const sessionId = randomUUID();
      const ouv = ouverture(t, g.id, {
        sessionId,
        guichetId: d.guichets[1]!.id,
        numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
        at: t.iso(),
      });
      const premiere = await envoyer(t, "/agence/caisse/ouverture", g.jeton, ouv);
      expect(premiere.status).toBe(200);

      const t2 = await creerAppAgencePg({ url: base.url, debut: t.horloge.maintenant() });
      try {
        const lecture = await lire(t2, "/agence/caisse/session", g.jeton);
        expect(lecture.status).toBe(200);
        expect(lecture.body.sessionId).toBe(sessionId);
        expect(lecture.body.etat).toBe("ouverte");
        const rejeu = await envoyer(t2, "/agence/caisse/ouverture", g.jeton, ouv);
        expect(rejeu.body.accuse.statut).toBe("deja_recu");
        expect(rejeu.body.accuse.recuA).toBe(premiere.body.accuse.recuA);
        expect(await t2.journal.verifier(d.compagnie.id)).toEqual({
          valide: true,
          entreesVerifiees: 1,
        });
      } finally {
        await t2.fermer();
      }
    });
  });
});
