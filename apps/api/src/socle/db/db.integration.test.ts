import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { AuditService } from "../audit/audit.service";
import { ComptesService } from "../comptes/comptes.service";
import { CONFIG } from "../config/config";
import { configurerApp } from "../configurer-app";
import { EvenementsService } from "../evenements/evenements.service";
import { SmsGateway, SmsMock } from "../sms/sms.gateway";
import { configTest } from "../testing/app-test";
import {
  DOSSIER_MIGRATIONS,
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../testing/base-integration";
import { appliquerMigrations, MigrationInvalide } from "./migrer";
import { PrismaService } from "./prisma.service";
import { executerSeed, TELEPHONES_DEMO } from "./seed";

/**
 * Tests contre un vrai PostgreSQL. Ignorés sans DATABASE_URL_TEST (la CI actuelle n'a pas de base).
 *
 *   DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api test
 *
 * La base doit être JETABLE : son nom finit par « _test » et son schéma public est vidé avant les tests
 * (voir `testing/base-integration.ts`, qui sérialise aussi les fichiers d'intégration).
 */
const URL_BASE = URL_BASE_TEST;

describe.skipIf(!URL_BASE)("PostgreSQL réel", () => {
  let base: BaseDeTest;
  let sql: Client;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: () => request.Agent;
  const MOT_DE_PASSE = "Mot-de-passe-d-integration-1";
  let patronJeton = "";
  let afrimoveJeton = "";

  const requete = async (texte: string, valeurs: unknown[] = []) => sql.query(texte, valeurs);
  const erreur = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest(); // schéma vidé, toutes les migrations appliquées
    sql = base.sql;

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(configTest({ DATABASE_URL: URL_BASE!, SMS_MOCK_LOG_CODES: "false" }))
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configurerApp(app, configTest());
    await app.init();
    prisma = app.get(PrismaService);
    http = () => request(app.getHttpServer()) as unknown as request.Agent;

    await executerSeed({
      prisma,
      comptes: app.get(ComptesService),
      env: { SEED_PIN: "482915", SEED_MOT_DE_PASSE: MOT_DE_PASSE },
      journal: () => undefined,
    });
  });

  afterAll(async () => {
    await app?.close();
    await base?.fermer();
  });

  async function connexionDirection(telephone: string, role: string): Promise<string> {
    const sms = app.get<SmsMock>(SmsGateway);
    const e1 = await request(app.getHttpServer())
      .post("/auth/direction/connexion")
      .send({ telephone, motDePasse: MOT_DE_PASSE, role });
    expect(e1.status).toBe(202);
    const code = /code est (\d{6})/.exec(sms.dernier()?.message ?? "")?.[1];
    const e2 = await request(app.getHttpServer())
      .post("/auth/direction/verification")
      .send({ defiId: e1.body.defiId, code });
    expect(e2.status).toBe(200);
    return e2.body.accessToken as string;
  }

  describe("migrations", () => {
    it("sont rejouables sans effet, et la table est celle de Prisma", async () => {
      expect(await appliquerMigrations(URL_BASE!, DOSSIER_MIGRATIONS)).toEqual([]);
      const { rows } = await requete(
        `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`,
      );
      expect(rows.map((r) => r.migration_name)).toEqual([
        "20261017000000_initial",
        "20261017000100_ajout_seul_et_contraintes",
        "20261017000200_modules_metier",
        "20261017000300_modules_metier_garanties",
        "20261017000400_sms_et_heure_texte",
        "20261017000500_sms_garanties",
      ]);
      expect(rows.every((r) => r.finished_at !== null)).toBe(true);
    });

    it("refusent une migration modifiée après coup", async () => {
      const copie = await mkdtemp(path.join(tmpdir(), "migrations-"));
      await cp(DOSSIER_MIGRATIONS, copie, { recursive: true });
      const fichier = path.join(copie, "20261017000000_initial", "migration.sql");
      await writeFile(fichier, `${await readFile(fichier, "utf8")}\n-- modifié\n`);
      await expect(appliquerMigrations(URL_BASE!, copie)).rejects.toBeInstanceOf(MigrationInvalide);
    });

    it("le schéma contient les tables du domaine", async () => {
      const { rows } = await requete(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      const tables = rows.map((r) => r.table_name);
      for (const t of [
        "compagnie",
        "gare",
        "guichet",
        "ligne",
        "arret",
        "bus",
        "depart",
        "billet",
        "colis",
        "session_caisse",
        "personne",
        "module_compagnie",
        "appareil",
        "evenement",
        "journal_audit",
        "defi_otp",
        // modules métier (migration « modules_metier »)
        "appareil_sync",
        "journal_evenement",
        "plage_attribuee",
        "numero_vu",
        "siege_depart",
        "commande",
        "photo_colis",
        "reclamation_colis",
        "journal_agence",
        "demande_annulation",
        "module_exception",
      ]) {
        expect(tables, t).toContain(t);
      }
    });
  });

  describe("ajout seul", () => {
    const evenementId = "11111111-1111-4111-8111-111111111111";

    it("évènements : on peut ajouter, jamais modifier ni effacer ni vider", async () => {
      await requete(
        `INSERT INTO evenement (id, type, "at", "cibleType", "cibleId") VALUES ($1, 'billet.annule', now(), 'billet', $1)`,
        [evenementId],
      );
      expect(
        await erreur(`UPDATE evenement SET type = 'autre' WHERE id = $1`, [evenementId]),
      ).toMatch(/ajout seul/);
      expect(await erreur(`DELETE FROM evenement WHERE id = $1`, [evenementId])).toMatch(
        /ajout seul/,
      );
      expect(await erreur(`TRUNCATE evenement`)).toMatch(/ajout seul/);
      const { rows } = await requete(`SELECT count(*)::int AS n FROM evenement WHERE id = $1`, [
        evenementId,
      ]);
      expect(rows[0].n).toBe(1);
    });

    it("journal d'audit : on peut ajouter, jamais modifier ni effacer ni vider", async () => {
      await app.get(AuditService).enregistrer({ action: "test.ajout_seul", resultat: "succes" });
      expect(await erreur(`UPDATE journal_audit SET action = 'x'`)).toMatch(/ajout seul/);
      expect(await erreur(`DELETE FROM journal_audit`)).toMatch(/ajout seul/);
      expect(await erreur(`TRUNCATE journal_audit`)).toMatch(/ajout seul/);
    });

    it("le service d'événements ignore un rejeu (même identifiant)", async () => {
      const service = app.get(EvenementsService);
      const e = {
        id: "33333333-3333-4333-8333-333333333333",
        type: "colis.enregistre",
        at: new Date("2026-11-02T08:00:00.000Z"),
        appareilId: null,
        auteurId: null,
        cible: { type: "colis" as const, id: "44444444-4444-4444-8444-444444444444" },
        numeroPlage: 17,
        donnees: { poids: 3.5, note: "fragile" },
      };
      expect(await service.enregistrer(e)).toBe(true);
      expect(await service.enregistrer(e)).toBe(false);
      const [lu, ...reste] = await service.historique(e.cible);
      expect(reste).toHaveLength(0);
      expect(lu).toMatchObject({
        id: e.id,
        numeroPlage: 17,
        donnees: { poids: 3.5, note: "fragile" },
      });
      expect(lu?.at.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    });

    it("un billet ne s'efface pas et son numéro ne change pas", async () => {
      const c = (
        await requete(
          `INSERT INTO compagnie (id, code, nom) VALUES (gen_random_uuid(), 'TST', 'Test') RETURNING id`,
        )
      ).rows[0].id;
      const g = (
        await requete(
          `INSERT INTO gare (id, "compagnieId", code, nom, ville) VALUES (gen_random_uuid(), $1, 'AAA', 'A', 'A') RETURNING id`,
          [c],
        )
      ).rows[0].id;
      const g2 = (
        await requete(
          `INSERT INTO gare (id, "compagnieId", code, nom, ville) VALUES (gen_random_uuid(), $1, 'BBB', 'B', 'B') RETURNING id`,
          [c],
        )
      ).rows[0].id;
      const l = (
        await requete(
          `INSERT INTO ligne (id, "compagnieId", code, "origineGareId", "destinationGareId", "tarifClassique", "tarifVip", "tarifBagage") VALUES (gen_random_uuid(), $1, 'AAABBB', $2, $3, 4000, 6000, 500) RETURNING id`,
          [c, g, g2],
        )
      ).rows[0].id;
      const d = (
        await requete(
          `INSERT INTO depart (id, numero, "ligneId", classe, "heureDepart", etat) VALUES (gen_random_uuid(), 'TST-AAABBB-270105-0530', $1, 'classique', now(), 'en_vente') RETURNING id`,
          [l],
        )
      ).rows[0].id;
      const b = (
        await requete(
          `INSERT INTO billet (id, numero, sequence, "compagnieId", "gareId", "departId", classe, prix, canal, "codeBillet", "creeA", etat)
         VALUES (gen_random_uuid(), 'TST-AAA-270105-0001', 1, $1, $2, $3, 'classique', 4000, 'guichet', '1234', now(), 'paye') RETURNING id`,
          [c, g, d],
        )
      ).rows[0].id;
      expect(await erreur(`DELETE FROM billet WHERE id = $1`, [b])).toMatch(/ajout seul/);
      expect(
        await erreur(`UPDATE billet SET numero = 'TST-AAA-270105-9999' WHERE id = $1`, [b]),
      ).toMatch(/numéro/);
      // L'état, lui, évolue (annulation = changement d'état, le numéro est conservé).
      await requete(`UPDATE billet SET etat = 'annule' WHERE id = $1`, [b]);
      expect(await erreur(`UPDATE billet SET prix = -1 WHERE id = $1`, [b])).toMatch(
        /billet_prix_positif/,
      );
    });
  });

  describe("rôles stricts en base", () => {
    const inserer = (roles: string) =>
      erreur(
        `INSERT INTO personne (id, "telephoneChiffre", "telephoneIndex", roles) VALUES (gen_random_uuid(), 'x', md5(random()::text), ${roles})`,
      );

    it("AfriMove ne se cumule avec aucun rôle qui vend ou achète", async () => {
      for (const vente of ["voyageur", "guichetier", "convoyeur", "vendeur"]) {
        expect(await inserer(`ARRAY['afrimove','${vente}']::role[]`), vente).toMatch(
          /personne_afrimove_ne_vend_jamais/,
        );
      }
      expect(await inserer(`ARRAY['afrimove']::role[]`)).toBe("");
      expect(await inserer(`ARRAY['afrimove','comptable']::role[]`)).toBe("");
    });

    it("un compte a au moins un rôle", async () => {
      expect(await inserer(`ARRAY[]::role[]`)).toMatch(/personne_roles_non_vides/);
    });
  });

  describe("chiffrement au repos", () => {
    it("le téléphone n'est jamais lisible en base, et le PIN est un haché argon2id", async () => {
      const { rows } = await requete(`SELECT * FROM personne WHERE "telephoneIndex" <> ''`);
      expect(rows.length).toBeGreaterThanOrEqual(5);
      const tout = JSON.stringify(rows);
      for (const tel of Object.values(TELEPHONES_DEMO)) expect(tout).not.toContain(tel.slice(4));
      expect(tout).not.toContain("482915");
      expect(tout).not.toContain(MOT_DE_PASSE);
      const g = rows.find((r) => r.roles.includes("guichetier"));
      expect(g.pinHache).toMatch(/^\$argon2id\$/);
      expect(g.telephoneChiffre).toMatch(/^enc:v1:k1:/);
    });

    it("le code SMS n'est conservé que haché et le numéro du défi est effacé à l'usage", async () => {
      const dem = await request(app.getHttpServer())
        .post("/auth/voyageur/code")
        .send({ telephone: "+237655070001" });
      const code = /code est (\d{6})/.exec(
        app.get<SmsMock>(SmsGateway).dernier()?.message ?? "",
      )?.[1];
      let { rows } = await requete(`SELECT * FROM defi_otp WHERE id = $1`, [dem.body.defiId]);
      expect(JSON.stringify(rows)).not.toContain(code);
      expect(rows[0].telephoneChiffre).toMatch(/^enc:v1:/);
      const v = await request(app.getHttpServer())
        .post("/auth/voyageur/verification")
        .send({ defiId: dem.body.defiId, code });
      expect(v.status).toBe(200);
      ({ rows } = await requete(`SELECT * FROM defi_otp WHERE id = $1`, [dem.body.defiId]));
      expect(rows[0].telephoneChiffre).toBeNull();
      expect(rows[0].consommeA).not.toBeNull();
    });
  });

  describe("connexions de bout en bout sur la base", () => {
    it("guichetier (PIN), puis refus de l'espace patron", async () => {
      const rep = await http()
        .post("/auth/guichet/connexion")
        .send({ telephone: TELEPHONES_DEMO.guichetier, pin: "482915", role: "guichetier" });
      expect(rep.status).toBe(200);
      const patron = await http()
        .get("/patron/journal-audit")
        .set("Authorization", `Bearer ${rep.body.accessToken}`);
      expect(patron.status).toBe(403);
    });

    it("blocage du PIN persistant en base", async () => {
      const tel = TELEPHONES_DEMO.guichetier;
      for (let i = 0; i < 3; i++) {
        await http()
          .post("/auth/guichet/connexion")
          .send({ telephone: tel, pin: "135790", role: "guichetier" });
      }
      const bloque = await http()
        .post("/auth/guichet/connexion")
        .send({ telephone: tel, pin: "482915", role: "guichetier" });
      expect(bloque.status).toBe(423);
      await requete(`UPDATE personne SET "bloqueJusqua" = NULL, "echecsConnexion" = 0`);
    });

    it("patron et AfriMove (mot de passe + SMS) ; le patron lit le journal de sa compagnie", async () => {
      patronJeton = await connexionDirection(TELEPHONES_DEMO.patron, "patron");
      afrimoveJeton = await connexionDirection(TELEPHONES_DEMO.afrimove, "afrimove");
      const journal = await http()
        .get("/patron/journal-audit?limite=200")
        .set("Authorization", `Bearer ${patronJeton}`);
      expect(journal.status).toBe(200);
      expect(journal.body.length).toBeGreaterThan(0);
      const compagnie = (await requete(`SELECT id FROM compagnie WHERE code = 'DEM'`)).rows[0].id;
      const ids = new Set(
        (await requete(`SELECT id FROM personne WHERE "compagnieId" = $1`, [compagnie])).rows.map(
          (r) => r.id,
        ),
      );
      for (const ligne of journal.body as Array<{ acteurId: string | null }>) {
        if (ligne.acteurId) expect(ids.has(ligne.acteurId)).toBe(true);
      }
    });

    it("/health répond 200 avec la vraie base", async () => {
      const rep = await http().get("/health");
      expect(rep.status).toBe(200);
      expect(rep.body).toMatchObject({ statut: "ok", base: "ok" });
    });
  });

  describe("journal d'audit sur PostgreSQL", () => {
    it("la chaîne reste linéaire sous écritures concurrentes", async () => {
      const audit = app.get(AuditService);
      await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          audit.enregistrer({ action: `test.concurrent.${i}`, resultat: "succes" }),
        ),
      );
      const rapport = await audit.verifierChaine(10);
      expect(rapport.valide).toBe(true);
      expect(rapport.lignesVerifiees).toBeGreaterThanOrEqual(30);
      const rep = await http()
        .get("/afrimove/journal-audit/verification")
        .set("Authorization", `Bearer ${afrimoveJeton}`);
      expect(rep.body).toMatchObject({ valide: true });
    });

    it("détecte une falsification faite directement en base (déclencheur levé par un administrateur)", async () => {
      const audit = app.get(AuditService);
      expect((await audit.verifierChaine()).valide).toBe(true);
      await requete(`ALTER TABLE journal_audit DISABLE TRIGGER journal_audit_ajout_seul`);
      try {
        await requete(
          `UPDATE journal_audit SET resultat = 'echec' WHERE seq = (SELECT min(seq) + 3 FROM journal_audit)`,
        );
      } finally {
        await requete(`ALTER TABLE journal_audit ENABLE TRIGGER journal_audit_ajout_seul`);
      }
      const rapport = await audit.verifierChaine();
      expect(rapport.valide).toBe(false);
      expect(rapport.premiereLigneEnDefaut).toBeDefined();
      const rep = await http()
        .get("/afrimove/journal-audit/verification")
        .set("Authorization", `Bearer ${afrimoveJeton}`);
      expect(rep.body).toMatchObject({ valide: false });
    });
  });
});
