import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appliquerMigrations } from "./migrer";
import {
  DOSSIER_MIGRATIONS,
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../testing/base-integration";

/**
 * Les migrations « modules métier » s'appliquent sur une base qui a déjà des données : les sessions
 * de caisse et les colis existants sont repris (gare, compagnie, rang, jour) et rien n'est perdu.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · reprise des données existantes", () => {
  let base: BaseDeTest;
  let sql: Client;

  const compagnieId = randomUUID();
  const gareId = randomUUID();
  const gareArriveeId = randomUUID();
  const guichetId = randomUUID();
  const agentId = randomUUID();
  const sessionId = randomUUID();
  const colisId = randomUUID();

  beforeAll(async () => {
    // État de la base avant cette livraison : seules les deux premières migrations sont posées.
    base = await preparerBaseDeTest({
      migrations: (nom) => nom < "20261017000200",
    });
    sql = base.sql;

    await sql.query(`INSERT INTO compagnie (id, code, nom) VALUES ($1, 'ANC', 'Ancienne agence')`, [
      compagnieId,
    ]);
    for (const [id, code, ville] of [
      [gareId, "DLA", "Douala"],
      [gareArriveeId, "YDE", "Yaoundé"],
    ]) {
      await sql.query(
        `INSERT INTO gare (id, "compagnieId", code, nom, ville) VALUES ($1, $2, $3, $3, $4)`,
        [id, compagnieId, code, ville],
      );
    }
    await sql.query(`INSERT INTO guichet (id, "gareId", rang) VALUES ($1, $2, 3)`, [
      guichetId,
      gareId,
    ]);
    await sql.query(
      `INSERT INTO personne (id, nom, "telephoneChiffre", "telephoneIndex", roles, "compagnieId")
       VALUES ($1, 'Agent', 'x', 'idx-agent', '{guichetier}', $2)`,
      [agentId, compagnieId],
    );
    await sql.query(
      `INSERT INTO session_caisse (id, numero, "guichetId", "agentId", "fondDeCaisse", "ouverteA", etat)
       VALUES ($1, 'S-001', $2, $3, 20000, '2026-10-01T07:00:00+01:00', 'ouverte')`,
      [sessionId, guichetId, agentId],
    );
    await sql.query(
      `INSERT INTO colis (id, numero, sequence, "gareOrigineId", "gareDestinationId",
         "expediteurChiffre", "expediteurTelephoneIndex", "destinataireChiffre",
         "destinataireTelephoneIndex", contenu, "poidsKg", "valeurDeclaree", mode, canal,
         "codeRetraitHache", "codeRetraitSel", "prixTotal", "creeA", etat)
       VALUES ($1, 'C-001', 1, $2, $3, 'e', 'ie', 'd', 'id', 'Vêtements', 4.5, 10000, 'gare',
         'agence', 'h', 's', 2500, '2026-10-01T23:30:00Z', 'enregistre')`,
      [colisId, gareId, gareArriveeId],
    );

    await appliquerMigrations(base.url, DOSSIER_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await base?.fermer();
  });

  it("la session de caisse existante prend la gare, la compagnie et le rang de son guichet", async () => {
    const { rows } = await sql.query(
      `SELECT "gareId", "compagnieId", "guichetRang", numero, "fondDeCaisse", etat
       FROM session_caisse WHERE id = $1`,
      [sessionId],
    );
    expect(rows).toEqual([
      {
        gareId,
        compagnieId,
        guichetRang: 3,
        numero: "S-001",
        fondDeCaisse: 20000,
        etat: "ouverte",
      },
    ]);
  });

  it("le colis existant garde ses données, prend la compagnie de sa gare et le jour de Douala", async () => {
    const { rows } = await sql.query(
      `SELECT numero, "compagnieId", jour, version, contenu, "prixTotal", etat
       FROM colis WHERE id = $1`,
      [colisId],
    );
    // 23 h 30 UTC le 1er octobre = 00 h 30 à Douala le 2 octobre.
    expect(rows).toEqual([
      {
        numero: "C-001",
        compagnieId,
        jour: "261002",
        version: 1,
        contenu: "Vêtements",
        prixTotal: 2500,
        etat: "enregistre",
      },
    ]);
  });

  it("les nouvelles tables sont vides et les garanties sont en place sur les lignes reprises", async () => {
    const { rows } = await sql.query(
      `SELECT (SELECT count(*)::int FROM plage_attribuee) AS plages,
              (SELECT count(*)::int FROM journal_evenement) AS journal,
              (SELECT count(*)::int FROM module_exception) AS exceptions`,
    );
    expect(rows[0]).toEqual({ plages: 0, journal: 0, exceptions: 0 });
    // Le colis repris reste soumis aux triggers existants : il ne s'efface pas.
    await expect(sql.query(`DELETE FROM colis WHERE id = $1`, [colisId])).rejects.toThrow();
  });
});
