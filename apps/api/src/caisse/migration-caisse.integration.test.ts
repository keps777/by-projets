import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appliquerMigrations } from "../socle/db/migrer";
import {
  DOSSIER_MIGRATIONS,
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";

/**
 * La migration « colis_caisse_supervision_garanties » s'applique sur une base qui a déjà des sessions
 * de caisse écrites dans l'ancien format (colonnes d'origine seules) : le JSON de clôture et de
 * validation est reconstruit, les copies interrogeables sont complétées, rien n'est perdu.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · reprise des sessions de caisse", () => {
  let base: BaseDeTest;
  let sql: Client;

  const compagnieId = randomUUID();
  const gareId = randomUUID();
  const guichetId = randomUUID();
  const agent = randomUUID();
  const superviseur = randomUUID();
  const ouverte = randomUUID();
  const cloturee = randomUUID();
  const validee = randomUUID();
  const colisId = randomUUID();

  beforeAll(async () => {
    // État de la base avant cette migration : toutes les précédentes sont posées.
    base = await preparerBaseDeTest({ migrations: (nom) => nom < "20261017000400" });
    sql = base.sql;

    await sql.query(`INSERT INTO compagnie (id, code, nom) VALUES ($1, 'ANC', 'Ancienne')`, [
      compagnieId,
    ]);
    await sql.query(
      `INSERT INTO gare (id, "compagnieId", code, nom, ville) VALUES ($1, $2, 'DLA', 'Douala', 'Douala')`,
      [gareId, compagnieId],
    );
    await sql.query(`INSERT INTO guichet (id, "gareId", rang) VALUES ($1, $2, 2)`, [
      guichetId,
      gareId,
    ]);
    for (const [id, nom, index] of [
      [agent, "Joseph", "ia"],
      [superviseur, "Marie Ngo", "is"],
    ]) {
      await sql.query(
        `INSERT INTO personne (id, nom, "telephoneChiffre", "telephoneIndex", roles, "compagnieId")
         VALUES ($1, $2, 'x', $3, '{guichetier}', $4)`,
        [id, nom, index, compagnieId],
      );
    }
    const colonnes = `id, numero, "guichetId", "agentId", "fondDeCaisse", "ouverteA", "guichetRang", "gareId", "compagnieId"`;
    await sql.query(
      `INSERT INTO session_caisse (${colonnes}, etat)
       VALUES ($1, 'K-DLA-261001-2-1', $2, $3, 20000, '2026-10-01T07:00:00Z', 2, $4, $5, 'ouverte')`,
      [ouverte, guichetId, agent, gareId, compagnieId],
    );
    await sql.query(
      `INSERT INTO session_caisse (${colonnes}, "clotureeA", "cashCompte", "cashAttendu", ecart,
         "clotureeAuto", etat)
       VALUES ($1, 'K-DLA-261001-2-2', $2, $3, 20000, '2026-10-01T07:00:00Z', 2, $4, $5,
         '2026-10-01T15:30:00.250Z', 41500, 42000, -500, false, 'cloturee')`,
      [cloturee, guichetId, agent, gareId, compagnieId],
    );
    await sql.query(
      `INSERT INTO session_caisse (${colonnes}, "clotureeA", "cashCompte", "cashAttendu", ecart,
         "clotureeAuto", "valideeA", "valideeParId", etat)
       VALUES ($1, 'K-DLA-261001-2-3', $2, $3, 20000, '2026-10-01T07:00:00Z', 2, $4, $5,
         '2026-10-01T15:30:00Z', 30000, 30000, 0, true, '2026-10-01T16:00:00Z', $6, 'validee')`,
      [validee, guichetId, agent, gareId, compagnieId, superviseur],
    );
    await sql.query(
      `INSERT INTO colis (id, numero, sequence, jour, "gareOrigineId", "gareDestinationId",
         "expediteurChiffre", "expediteurTelephoneIndex", "destinataireChiffre",
         "destinataireTelephoneIndex", contenu, "poidsKg", "valeurDeclaree", mode, canal,
         "codeRetraitHache", "codeRetraitSel", "prixTotal", "creeA", etat)
       VALUES ($1, 'C-001', 1, '261001', $2, $2, 'e', 'ie', 'd', 'id', 'Vêtements', 4.5, 10000, 'gare',
         'agence', 'h', 's', 2500, '2026-10-01T10:00:00Z', 'enregistre')`,
      [colisId, gareId],
    );

    await appliquerMigrations(base.url, DOSSIER_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await base?.fermer();
  });

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  it("une session ouverte n'a ni clôture ni validation", async () => {
    const { rows } = await sql.query(
      `SELECT etat, cloture, validation, "clotureeA", "valideeA" FROM session_caisse WHERE id = $1`,
      [ouverte],
    );
    expect(rows[0]).toEqual({
      etat: "ouverte",
      cloture: null,
      validation: null,
      clotureeA: null,
      valideeA: null,
    });
  });

  it("une session clôturée reçoit sa clôture en JSON, à l'heure de Douala, et garde ses colonnes", async () => {
    const { rows } = await sql.query(
      `SELECT cloture, validation, "cashCompte", "cashAttendu", ecart FROM session_caisse WHERE id = $1`,
      [cloturee],
    );
    const [a] = rows;
    expect(a.cloture).toMatchObject({
      at: "2026-10-01T16:30:00.250+01:00",
      auto: false,
      cashCompte: 41_500,
      cashAttendu: 42_000,
      ecart: -500,
      divergenceAppareil: 0,
      comptageAbsent: false,
    });
    expect(a.cloture.decompte.billetsCash).toEqual({ nombre: 0, montant: 0 });
    expect(a.cloture.evenementId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(a.validation).toBeNull();
    expect(a).toMatchObject({ cashCompte: 41_500, cashAttendu: 42_000, ecart: -500 });
  });

  it("une session validée reçoit sa clôture et sa validation, avec le nom du superviseur", async () => {
    const { rows } = await sql.query(
      `SELECT cloture, validation FROM session_caisse WHERE id = $1`,
      [validee],
    );
    const [b] = rows;
    expect(b.cloture).toMatchObject({ auto: true, cashCompte: 30_000, ecart: 0 });
    expect(b.validation).toMatchObject({
      at: "2026-10-01T17:00:00.000+01:00",
      superviseurId: superviseur,
      superviseurNom: "Marie Ngo",
      ecart: 0,
      commentaire: null,
    });
  });

  it("les lignes reprises respectent les nouveaux garde-fous quand on les modifie", async () => {
    await sql.query(`UPDATE session_caisse SET tolerance = 500`);
    const { rows } = await sql.query(`SELECT count(*)::int AS n FROM session_caisse`);
    expect(rows[0].n).toBe(3);
    // Les garde-fous valent pour toute écriture à venir.
    expect(
      await erreurSql(`UPDATE session_caisse SET ecart = 7 WHERE id = $1`, [cloturee]),
    ).toMatch(/session_cloture_copie/);
  });

  it("le colis repris garde ses données ; les essais du code sont bornés pour la suite", async () => {
    const { rows } = await sql.query(
      `SELECT "codeEssais", "codeBloque", contenu FROM colis WHERE id = $1`,
      [colisId],
    );
    expect(rows[0]).toEqual({ codeEssais: 0, codeBloque: false, contenu: "Vêtements" });
    expect(await erreurSql(`UPDATE colis SET "codeEssais" = 3 WHERE id = $1`, [colisId])).toMatch(
      /colis_code_bloque_apres_trois_essais/,
    );
    expect(
      await erreurSql(`UPDATE colis SET "codeEssais" = 3, "codeBloque" = true WHERE id = $1`, [
        colisId,
      ]),
    ).toBe("");
  });
});
