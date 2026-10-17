import { randomUUID } from "node:crypto";
import { genererCleAppareil } from "@afrimove/sync";
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
import { AlertesMemoire, AppareilsMemoire, JournalMemoire, SiegesMemoire } from "./memoire";
import {
  AlertesSyncPrisma,
  AppareilInvalide,
  AppareilsSyncPrisma,
  JournalSyncPrisma,
  SiegesSyncPrisma,
} from "./postgres";
import { AlertesSync, AppareilsSync, JournalSync, SiegesSync } from "./ports";
import { contratPortsSync } from "./testing/contrat-ports";
import { AppareilTest } from "./testing/outils";

/**
 * Adaptateurs de la synchronisation : les mêmes tests de contrat sur la mémoire (toujours) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (ajout seul,
 * idempotence par UUID d'événement, un seul gagnant quand deux rejeux se croisent) et l'API de bout
 * en bout avec `API_STOCKAGE=postgres`, redémarrage compris.
 */

contratPortsSync("contrat · adaptateurs en mémoire", async () => ({
  appareils: new AppareilsMemoire(),
  journal: new JournalMemoire(),
  sieges: new SiegesMemoire(),
  alertes: new AlertesMemoire(),
  nouvelleGare: async () => ({ gareId: randomUUID(), compagnieId: randomUUID() }),
  fermer: async () => undefined,
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · synchronisation", () => {
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

  let compteurCodes = 0;
  const code3 = (): string => {
    compteurCodes += 1;
    const n = compteurCodes;
    return [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26]
      .map((x) => String.fromCharCode(65 + x))
      .join("");
  };

  async function nouvelleGare() {
    const compagnie = await prisma.compagnie.create({
      data: { code: code3(), nom: "Agence test" },
    });
    const gare = await prisma.gare.create({
      data: { compagnieId: compagnie.id, code: "DLA", nom: "Akwa", ville: "Douala" },
    });
    return { gareId: gare.id, compagnieId: compagnie.id };
  }

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsSync("contrat · adaptateurs PostgreSQL", async () => ({
    appareils: new AppareilsSyncPrisma(prisma),
    journal: new JournalSyncPrisma(prisma),
    sieges: new SiegesSyncPrisma(prisma),
    alertes: new AlertesSyncPrisma(prisma),
    nouvelleGare,
    fermer: async () => undefined,
  }));

  describe("ce que la base garantit seule", () => {
    const ligneJournal = (id: string, surcharge: Record<string, unknown> = {}) =>
      sql.query(
        `INSERT INTO journal_evenement (id, type, at, "appareilId", "cibleType", "cibleId", origine, "recuA")
         VALUES ($1, 'billet.vendu', now(), 'tel', 'billet', 'b-1', $2, now())`,
        [id, surcharge["origine"] ?? "appareil"],
      );

    it("deux écritures SQL directes du même événement : la seconde est refusée par l'index unique", async () => {
      const id = randomUUID();
      await ligneJournal(id);
      expect(await erreurSql(`SELECT 1 FROM journal_evenement WHERE id = $1`, [id])).toBe("");
      await expect(ligneJournal(id)).rejects.toThrow(/journal_evenement_id_key/);
    });

    it("le journal est en ajout seul : ni UPDATE, ni DELETE, ni TRUNCATE", async () => {
      const id = randomUUID();
      await ligneJournal(id);
      expect(
        await erreurSql(`UPDATE journal_evenement SET type = 'x' WHERE id = $1`, [id]),
      ).toMatch(/ajout seul/);
      expect(await erreurSql(`DELETE FROM journal_evenement WHERE id = $1`, [id])).toMatch(
        /ajout seul/,
      );
      expect(await erreurSql(`TRUNCATE journal_evenement`)).toMatch(/ajout seul/);
    });

    it("le journal refuse une origine inconnue et un numéro non imprimable", async () => {
      expect(await erreurSql(`SELECT 1`)).toBe("");
      await expect(ligneJournal(randomUUID(), { origine: "inconnue" })).rejects.toThrow(
        /journal_evenement_origine_connue/,
      );
      expect(
        await erreurSql(
          `INSERT INTO journal_evenement (id, type, at, "cibleType", "cibleId", origine, "numeroPlage", "recuA")
           VALUES ($1, 't', now(), 'billet', 'b', 'appareil', 10000, now())`,
          [randomUUID()],
        ),
      ).toMatch(/journal_evenement_numero/);
    });

    it("les gestes sur un siège sont en ajout seul, et un même événement ne s'écrit qu'une fois par siège", async () => {
      const evenementId = randomUUID();
      const inserer = () =>
        erreurSql(
          `INSERT INTO siege_operation ("departId", siege, "evenementId", "billetId", kind, at, "appareilId", "auteurId")
           VALUES ('d-1', 4, $1, 'b-1', 'prend', now(), 'tel', 'a')`,
          [evenementId],
        );
      expect(await inserer()).toBe("");
      expect(await inserer()).toMatch(/siege_operation_pkey/);
      expect(
        await erreurSql(`UPDATE siege_operation SET kind = 'libere' WHERE "evenementId" = $1`, [
          evenementId,
        ]),
      ).toMatch(/ajout seul/);
      expect(await erreurSql(`DELETE FROM siege_operation`)).toMatch(/ajout seul/);
      expect(
        await erreurSql(
          `INSERT INTO siege_operation ("departId", siege, "evenementId", "billetId", kind, at, "appareilId", "auteurId")
           VALUES ('d-1', 0, $1, 'b-1', 'prend', now(), 'tel', 'a')`,
          [randomUUID()],
        ),
      ).toMatch(/siege_operation_siege/);
    });

    it("la fiche d'appareil refuse un genre inconnu et une plage à moitié donnée", async () => {
      expect(
        await erreurSql(`INSERT INTO appareil_sync (id, genre) VALUES ('t-1', 'robot')`),
      ).toMatch(/appareil_sync_genre_connu/);
      expect(
        await erreurSql(
          `INSERT INTO appareil_sync (id, genre, "plageDebut") VALUES ('t-2', 'guichet', 1)`,
        ),
      ).toMatch(/appareil_sync_plage/);
    });

    it("une gare ou une compagnie inconnue est une fiche d'appareil invalide, pas une erreur serveur", async () => {
      const appareils = new AppareilsSyncPrisma(prisma);
      await expect(
        appareils.declarer({ id: `tel-${randomUUID()}`, gareId: randomUUID() }),
      ).rejects.toBeInstanceOf(AppareilInvalide);
      await expect(
        appareils.declarer({ id: `tel-${randomUUID()}`, compagnieId: randomUUID() }),
      ).rejects.toBeInstanceOf(AppareilInvalide);
    });

    it("le journal vu par SQL : le rang d'arrivée est celui de la base, l'heure d'origine est gardée", async () => {
      const journal = new JournalSyncPrisma(prisma);
      const id = randomUUID();
      const ecrit = await journal.ajouter({
        evenement: {
          id,
          type: "billet.vendu",
          at: "2027-01-05T09:00:00+01:00",
          appareilId: "tel-sql",
          auteurId: "a",
          cible: { type: "billet", id: "b" },
          numeroPlage: 3,
          donnees: {},
        },
        recuA: "2027-01-05T09:05:00.000+01:00",
        ordreAppareil: 1,
        origine: "appareil",
      });
      const { rows } = await sql.query(
        `SELECT seq::int AS seq, "atTexte", at FROM journal_evenement WHERE id = $1`,
        [id],
      );
      expect(rows[0].seq).toBe(ecrit!.seq);
      expect(rows[0].atTexte).toBe("2027-01-05T09:00:00+01:00");
      expect(new Date(rows[0].at).toISOString()).toBe("2027-01-05T08:00:00.000Z");
    });
  });

  describe("l'API de bout en bout, stockage PostgreSQL", () => {
    const MOT_DE_PASSE = "Un-mot-de-passe-solide";
    let stockageAvant: string | undefined;
    let app: NestExpressApplication | null = null;
    let gare: { gareId: string; compagnieId: string };
    let compteur = 0;

    async function demarrer(): Promise<NestExpressApplication> {
      const config = configTest({ DATABASE_URL: base.url });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(config)
        .compile();
      const a = module.createNestApplication<NestExpressApplication>();
      configurerApp(a, config);
      await a.init();
      return a;
    }

    async function compte(role: Role) {
      compteur += 1;
      const personne = await app!.get(ComptesService).creer({
        nom: `Test ${role}`,
        telephone: `+2376554${String(compteur).padStart(5, "0")}`,
        roles: [role],
        compagnieId: gare.compagnieId,
        gareId: gare.gareId,
        pin: "482915",
        ...(METHODE_PAR_ROLE[role] === "motdepasse_sms" ? { motDePasse: MOT_DE_PASSE } : {}),
      });
      const { accessToken } = await app!.get(TokensService).emettre({
        sub: personne.id,
        role,
        cid: personne.compagnieId,
        gid: personne.gareId,
      });
      return { id: personne.id, jeton: accessToken };
    }

    /** Un guichet : compte, fiche d'appareil dans la gare, clé enrôlée par la route. */
    async function guichet(rang: number): Promise<AppareilTest> {
      const u = await compte("guichetier");
      const id = `guichet-${rang}-${randomUUID()}`;
      await app!.get(AppareilsSync).declarer({ id, genre: "guichet", rang, ...gare });
      const cle = await genererCleAppareil();
      const rep = await request(app!.getHttpServer())
        .put(`/sync/appareils/${id}/cle`)
        .set("Authorization", `Bearer ${u.jeton}`)
        .send({ cle: cle.publique });
      expect(rep.status).toBe(204);
      return new AppareilTest(id, u.id, u.jeton, cle);
    }

    const envoyer = (a: AppareilTest, lot: unknown) =>
      request(app!.getHttpServer())
        .post("/sync/evenements")
        .set("Authorization", `Bearer ${a.jeton}`)
        .send(lot as object);

    const maintenant = (): number => Date.now();

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      gare = await nouvelleGare();
      app = await demarrer();
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise les adaptateurs PostgreSQL quand API_STOCKAGE=postgres", () => {
      expect(app!.get(AppareilsSync)).toBeInstanceOf(AppareilsSyncPrisma);
      expect(app!.get(JournalSync)).toBeInstanceOf(JournalSyncPrisma);
      expect(app!.get(SiegesSync)).toBeInstanceOf(SiegesSyncPrisma);
      expect(app!.get(AlertesSync)).toBeInstanceOf(AlertesSyncPrisma);
    });

    it("une vente est acceptée, rejouée elle répond deja_recu, et le journal n'a qu'une ligne", async () => {
      const g = await guichet(2);
      const vente = g.vente({ at: maintenant(), numeroPlage: 1001, departId: randomUUID() });
      const lot = await g.lot([vente]);
      const premiere = await envoyer(g, lot);
      expect(premiere.status).toBe(200);
      expect(premiere.body.resultats[0]).toMatchObject({
        evenementId: vente.id,
        statut: "accepte",
      });
      const seconde = await envoyer(g, lot);
      expect(seconde.body.resultats[0]).toMatchObject({ statut: "deja_recu" });
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM journal_evenement WHERE id = $1`,
        [vente.id],
      );
      expect(rows[0].n).toBe(1);
      // Le numéro est au registre de la gare, et la fiche de l'appareil a avancé.
      const vu = await sql.query(
        `SELECT numero FROM numero_vu WHERE "evenementId" = $1 AND genre = 'billet'`,
        [vente.id],
      );
      expect(vu.rows).toEqual([{ numero: 1001 }]);
      const fiche = await app!.get(AppareilsSync).trouver(g.id);
      expect(fiche?.dernierOrdre).toBe(1);
      expect(fiche?.derniereSyncA).not.toBeNull();
    });

    it("le même lot envoyé six fois en même temps : chaque événement est accepté une seule fois", async () => {
      const g = await guichet(3);
      const departId = randomUUID();
      const ventes = [1, 2, 3, 4, 5].map((i) =>
        g.vente({ at: maintenant(), numeroPlage: 2000 + i, departId, siege: i }),
      );
      const lot = await g.lot(ventes);
      const reponses = await Promise.all(Array.from({ length: 6 }, () => envoyer(g, lot)));
      expect(reponses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      for (const vente of ventes) {
        const statuts = reponses.map(
          (r) =>
            (r.body.resultats as { evenementId: string; statut: string }[]).find(
              (x) => x.evenementId === vente.id,
            )?.statut,
        );
        // Chaque événement : accepté par un seul des six lots, reconnu par les autres.
        expect(statuts.filter((s) => s === "accepte").length).toBeLessThanOrEqual(1);
        expect(statuts.every((s) => s === "accepte" || s === "deja_recu")).toBe(true);
      }
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM journal_evenement WHERE "appareilId" = $1`,
        [g.id],
      );
      expect(rows[0].n).toBe(5);
      const alertes = await prisma.alerteSync.findMany({
        where: { appareilId: g.id, type: "numero_en_double" },
      });
      // Un événement rejoué n'est pas un doublon de numéro.
      expect(alertes).toEqual([]);
    });

    it("deux guichets vendent le même siège en même temps : un seul gagne, le perdant est signalé une seule fois", async () => {
      const g1 = await guichet(1);
      const g2 = await guichet(2);
      const departId = randomUUID();
      const t0 = maintenant();
      const gagnante = g1.vente({ at: t0 - 60_000, numeroPlage: 11, departId, siege: 9 });
      const perdante = g2.vente({ at: t0 - 30_000, numeroPlage: 1011, departId, siege: 9 });
      const [lot1, lot2] = [await g1.lot([gagnante]), await g2.lot([perdante])];
      // Les deux lots arrivent ensemble, puis le perdant renvoie son lot deux fois de plus.
      const reponses = await Promise.all([
        envoyer(g1, lot1),
        envoyer(g2, lot2),
        envoyer(g2, lot2),
        envoyer(g2, lot2),
      ]);
      expect(reponses.every((r) => r.status === 200)).toBe(true);

      const conflits = await prisma.siegeConflit.findMany({ where: { departId } });
      expect(conflits).toHaveLength(1);
      expect(conflits[0]).toMatchObject({
        evenementId: perdante.id,
        gagnantBilletId: gagnante.donnees["billetId"],
      });
      const aReplacer = await prisma.journalEvenement.findMany({
        where: { type: "billet.a_replacer", cibleId: perdante.donnees["billetId"] as string },
      });
      expect(aReplacer).toHaveLength(1);
      const alertes = await prisma.alerteSync.findMany({
        where: { type: "siege_en_conflit", evenementId: perdante.id },
      });
      expect(alertes).toHaveLength(1);
      // L'appareil du perdant le voit dans la réponse de sa prochaine synchronisation.
      const suite = await envoyer(g2, await g2.lot([], { depuis: 2 }));
      expect(suite.body.conflits).toMatchObject([
        { billetId: perdante.donnees["billetId"], motif: "siege_deja_pris" },
      ]);
    });

    it("une vente arrivée en retard mais datée d'avant prend le siège : l'ancien gagnant devient à replacer, et le conflit levé est signalé une fois", async () => {
      const g1 = await guichet(1);
      const g2 = await guichet(2);
      const departId = randomUUID();
      const t0 = maintenant();
      const tardive = g1.vente({ at: t0 - 120_000, numeroPlage: 21, departId, siege: 5 });
      const premiere = g2.vente({ at: t0 - 60_000, numeroPlage: 1021, departId, siege: 5 });
      // g2 arrive d'abord et occupe le siège ; g1, datée d'avant, arrive ensuite et gagne.
      await envoyer(g2, await g2.lot([premiere]));
      expect(await prisma.siegeConflit.count({ where: { departId } })).toBe(0);
      await envoyer(g1, await g1.lot([tardive]));
      const conflits = await prisma.siegeConflit.findMany({ where: { departId } });
      expect(conflits.map((c) => c.evenementId)).toEqual([premiere.id]);
      // g2 libère son siège (billet perdant) : rien ne change pour le gagnant.
      const liberation = g2.autre(
        "quai.libere",
        t0,
        { billetId: premiere.donnees["billetId"], departId, siege: 5 },
        { type: "billet", id: premiere.donnees["billetId"] as string },
      );
      await envoyer(g2, await g2.lot([liberation], { depuis: 2 }));
      expect(await prisma.siegeConflit.count({ where: { departId } })).toBe(1);
    });

    it("un événement dont l'identifiant n'est pas un UUID est rejeté seul, et signalé : jamais une erreur serveur", async () => {
      const g = await guichet(2);
      const bon = g.vente({ at: maintenant(), numeroPlage: 1051 });
      const mauvais = { ...g.vente({ at: maintenant(), numeroPlage: 1052 }), id: "pas-un-uuid" };
      const lot = await g.lot([bon, mauvais]);
      const rep = await envoyer(g, lot);
      expect(rep.status).toBe(200);
      expect(rep.body.resultats).toMatchObject([
        { statut: "accepte" },
        { evenementId: "pas-un-uuid", statut: "rejete", code: "enveloppe_invalide" },
      ]);
      const { rows } = await sql.query(
        `SELECT details FROM alerte_sync WHERE type = 'evenement_rejete' AND "appareilId" = $1`,
        [g.id],
      );
      expect(rows).toHaveLength(1);
      // Rejoué : toujours rejeté, jamais accepté.
      const encore = await envoyer(g, lot);
      expect(encore.body.resultats[1]).toMatchObject({ statut: "rejete" });
    });

    it("un superviseur débloque un appareil : l'octroi est en base et l'appareil le lit à sa synchronisation", async () => {
      const g = await guichet(2);
      const sup = await compte("superviseur");
      const supAppareil = `sup-${randomUUID()}`;
      await app!.get(AppareilsSync).declarer({ id: supAppareil, genre: "autre", ...gare });
      const cle = await genererCleAppareil();
      await request(app!.getHttpServer())
        .put(`/sync/appareils/${supAppareil}/cle`)
        .set("Authorization", `Bearer ${sup.jeton}`)
        .send({ cle: cle.publique })
        .expect(204);
      const poste = new AppareilTest(supAppareil, sup.id, sup.jeton, cle);
      const deblocage = poste.autre(
        "appareil.debloque",
        maintenant(),
        {
          appareilId: g.id,
          option: "debloquer_4h",
          validePar: { superviseurId: sup.id },
        },
        { type: "appareil", id: g.id },
      );
      const rep = await envoyer(poste, await poste.lot([deblocage]));
      expect(rep.body.resultats[0]).toMatchObject({ statut: "accepte" });
      const suite = await envoyer(g, await g.lot([]));
      expect(suite.body.appareil.octroi).toMatchObject({
        option: "debloquer_4h",
        superviseurId: sup.id,
      });
      expect((await app!.get(AppareilsSync).trouver(g.id))?.octroi?.option).toBe("debloquer_4h");
    });

    it("tout survit à un redémarrage de l'API : le lot rejoué est reconnu, le rang de file est gardé", async () => {
      const g = await guichet(2);
      const vente = g.vente({ at: maintenant(), numeroPlage: 1101 });
      const lot = await g.lot([vente]);
      expect((await envoyer(g, lot)).body.resultats[0].statut).toBe("accepte");

      await app!.close();
      app = await demarrer();

      const rep = await envoyer(g, lot);
      expect(rep.status).toBe(200);
      expect(rep.body.resultats[0].statut).toBe("deja_recu");
      expect((await app.get(AppareilsSync).trouver(g.id))?.dernierOrdre).toBe(1);
      const alertes = await app.get(AlertesSync).lister({ gareId: gare.gareId });
      expect(alertes.some((a) => a.appareilId === g.id && a.type === "file_reinitialisee")).toBe(
        false,
      );
    });

    it("la liste des alertes de la gare vient de la base", async () => {
      const g = await guichet(2);
      const sup = await compte("superviseur");
      const h = g.vente({ at: maintenant(), numeroPlage: 1201 });
      const doublon = g.vente({ at: maintenant(), numeroPlage: 1201 });
      await envoyer(g, await g.lot([h, doublon]));
      const rep = await request(app!.getHttpServer())
        .get("/sync/alertes")
        .set("Authorization", `Bearer ${sup.jeton}`);
      expect(rep.status).toBe(200);
      const types = (rep.body as { type: string; appareilId: string }[])
        .filter((a) => a.appareilId === g.id)
        .map((a) => a.type);
      expect(types).toContain("numero_en_double");
    });
  });
});
