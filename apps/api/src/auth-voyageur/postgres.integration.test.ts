import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../socle/db/prisma.service";
import { VARIABLE_STOCKAGE } from "../socle/db/stockage";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { FichesVoyageurPrisma, StockageConnexionPrisma } from "./postgres";
import { FichesVoyageur, StockageConnexion } from "./ports";
import { creerAppAuthTest, type AppAuthTest } from "./testing/app-auth-test";
import {
  ENVOI,
  ESSAIS,
  T0,
  apres,
  contratFichesVoyageur,
  contratStockageConnexion,
  unCode,
} from "./testing/contrat-stockage";
import { autreCode } from "./testing/montage";

/**
 * Connexion du voyageur : les mêmes tests de contrat sur la mémoire (dans `stockage.test.ts`) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (quota d'envois,
 * usage unique du code et blocage sous requêtes simultanées de deux instances, empreinte jamais
 * réécrite, aucun code ni numéro en clair) et l'API de bout en bout avec `API_STOCKAGE=postgres`,
 * redémarrage compris.
 */

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · connexion du voyageur", () => {
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

  contratStockageConnexion("PostgreSQL", async () => ({
    banc: { stockage: new StockageConnexionPrisma(prisma), nouveauNumero: () => randomUUID() },
  }));

  contratFichesVoyageur("PostgreSQL", async () => ({ fiches: new FichesVoyageurPrisma(prisma) }));

  describe("deux instances sur la même base", () => {
    const nouvelleConnexion = () => new PrismaService(configTest({ DATABASE_URL: base.url }));

    it("des envois simultanés venus de deux instances ne dépassent ni l'intervalle ni le quota", async () => {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const stockages = [new StockageConnexionPrisma(a), new StockageConnexionPrisma(b)];
        const tel = randomUUID();
        const memeInstant = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            stockages[i % 2]!.reserverEnvoi(unCode(tel, T0), ENVOI),
          ),
        );
        expect(memeInstant.filter((r) => r.ok)).toHaveLength(1);

        const autre = randomUUID();
        const espaces = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            stockages[i % 2]!.reserverEnvoi(unCode(autre, apres(i * 41_000)), ENVOI),
          ),
        );
        expect(espaces.filter((r) => r.ok)).toHaveLength(5);
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM code_connexion_voyageur WHERE "telephoneIndex" = $1`,
          [autre],
        );
        expect(rows[0].n).toBe(5);
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    });

    it("un code consommé par deux instances à la fois ne l'est qu'une fois", async () => {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const stockages = [new StockageConnexionPrisma(a), new StockageConnexionPrisma(b)];
        const code = unCode(randomUUID(), T0);
        await stockages[0]!.reserverEnvoi(code, ENVOI);
        const resultats = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            stockages[i % 2]!.consommer(code.id, apres(1000 + i)),
          ),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        // La date retenue est celle du gagnant, pas un mélange.
        const lu = await stockages[1]!.dernierCode(code.telephoneIndex);
        expect(lu?.consommeA?.getTime()).toBeGreaterThanOrEqual(apres(1000).getTime());
        expect(lu?.consommeA?.getTime()).toBeLessThan(apres(1010).getTime());
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    });

    it("des mauvais codes venus de deux instances bloquent le numéro une seule fois", async () => {
      const [a, b] = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const stockages = [new StockageConnexionPrisma(a), new StockageConnexionPrisma(b)];
        const tel = randomUUID();
        await Promise.all(
          Array.from({ length: 14 }, (_, i) =>
            stockages[i % 2]!.noterEchec(tel, apres(1000), ESSAIS),
          ),
        );
        expect(await stockages[0]!.etat(tel)).toEqual({
          echecs: 0,
          blocages: 1,
          bloqueJusqua: apres(1000 + 900_000),
          dernierEchecA: apres(1000),
        });
      } finally {
        await Promise.all([a.$disconnect(), b.$disconnect()]);
      }
    });
  });

  describe("ce que seule la base garantit", () => {
    const stockage = () => new StockageConnexionPrisma(prisma);

    it("un identifiant de code est unique : le même code ne s'insère pas deux fois", async () => {
      const code = unCode(randomUUID(), T0);
      expect(await stockage().reserverEnvoi(code, ENVOI)).toEqual({ ok: true });
      await expect(
        stockage().reserverEnvoi({ ...code, creeA: apres(3_600_000 * 5) }, ENVOI),
      ).rejects.toThrow();
    });

    it("l'empreinte, le canal et l'échéance sont contrôlés par la base", async () => {
      const insere = (surcharge: Record<string, unknown>) => {
        const c = { ...unCode(randomUUID(), T0), ...surcharge };
        return erreurSql(
          `INSERT INTO code_connexion_voyageur (id, "telephoneIndex", "codeHache", canal, "creeA", "expireA")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.id, c.telephoneIndex, c.codeHache, c.canal, c.creeA, c.expireA],
        );
      };
      expect(await insere({ codeHache: "1234" })).toContain("code_connexion_voyageur_empreinte");
      expect(await insere({ codeHache: "A".repeat(64) })).toContain(
        "code_connexion_voyageur_empreinte",
      );
      expect(await insere({ canal: "ussd" })).toContain("code_connexion_voyageur_canal_connu");
      expect(await insere({ expireA: T0 })).toContain("code_connexion_voyageur_echeance");
      expect(await insere({})).toBe("");
    });

    it("un code émis ne se réécrit pas : seul son usage s'enregistre, une fois", async () => {
      const code = unCode(randomUUID(), T0);
      await stockage().reserverEnvoi(code, ENVOI);
      const message = "un code de connexion ne se modifie pas";
      expect(
        await erreurSql(`UPDATE code_connexion_voyageur SET "codeHache" = $1 WHERE id = $2`, [
          "b".repeat(64),
          code.id,
        ]),
      ).toContain(message);
      expect(
        await erreurSql(`UPDATE code_connexion_voyageur SET "expireA" = $1 WHERE id = $2`, [
          apres(86_400_000),
          code.id,
        ]),
      ).toContain(message);
      expect(
        await erreurSql(`UPDATE code_connexion_voyageur SET "consommeA" = $1 WHERE id = $2`, [
          apres(1000),
          code.id,
        ]),
      ).toBe("");
      // Consommé : impossible de le rendre à nouveau valable ou de changer la date.
      expect(
        await erreurSql(`UPDATE code_connexion_voyageur SET "consommeA" = NULL WHERE id = $1`, [
          code.id,
        ]),
      ).toContain(message);
      expect(
        await erreurSql(`UPDATE code_connexion_voyageur SET "consommeA" = $1 WHERE id = $2`, [
          apres(2000),
          code.id,
        ]),
      ).toContain(message);
      expect((await stockage().dernierCode(code.telephoneIndex))?.consommeA).toEqual(apres(1000));
    });

    it("les compteurs d'essais ne sont jamais négatifs, la fiche a une langue et une pièce valides", async () => {
      expect(
        await erreurSql(
          `INSERT INTO limite_connexion_voyageur ("telephoneIndex", echecs) VALUES ($1, -1)`,
          [randomUUID()],
        ),
      ).toContain("limite_connexion_voyageur_compteurs");
      const insere = (langue: string, piece: string | null) =>
        erreurSql(
          `INSERT INTO fiche_voyageur ("personneId", "inscritA", langue, "pieceQuatreDerniers")
           VALUES ($1, now(), $2, $3)`,
          [randomUUID(), langue, piece],
        );
      expect(await insere("de", null)).toContain("fiche_voyageur_langue_connue");
      expect(await insere("fr", "12")).toContain("fiche_voyageur_piece");
      expect(await insere("fr", "12ab")).toContain("fiche_voyageur_piece");
      expect(await insere("en", "1234")).toBe("");
    });

    it("un identifiant mal formé ne lit ni n'écrit rien", async () => {
      expect(await stockage().consommer("pas-un-uuid", T0)).toBe(false);
      await expect(stockage().annulerEnvoi("pas-un-uuid")).resolves.toBeUndefined();
      await expect(new FichesVoyageurPrisma(prisma).ouvrir("pas-un-uuid", T0)).rejects.toThrow(
        RangeError,
      );
    });
  });

  describe("l'API de bout en bout, stockage PostgreSQL", () => {
    let stockageAvant: string | undefined;
    let t: AppAuthTest;
    let suivant = 0;
    // Une connexion par application : fermer l'application la ferme, pas celle des autres tests.
    const nouvelleConnexion = () => new PrismaService(configTest({ DATABASE_URL: base.url }));
    const numero = (): string => `+23765200${String(++suivant).padStart(4, "0")}`;
    const demander = (corps: object) => t.http().post("/voyageur/connexion/code").send(corps);
    const verifier = (corps: object) =>
      t.http().post("/voyageur/connexion/verification").send(corps);

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      t = await creerAppAuthTest({ prisma: nouvelleConnexion() });
    }, 120_000);

    afterAll(async () => {
      await t?.fermer();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise les adaptateurs PostgreSQL pour les codes et pour les fiches", () => {
      expect(t.app.get(StockageConnexion)).toBeInstanceOf(StockageConnexionPrisma);
      expect(t.app.get(FichesVoyageur)).toBeInstanceOf(FichesVoyageurPrisma);
    });

    it("le code demandé est rangé en empreinte, le numéro en index, jamais en clair", async () => {
      const tel = numero();
      const r = await demander({ telephone: tel });
      expect(r.status).toBe(200);
      const code = t.sms.dernierCode();
      const { rows } = await sql.query(`SELECT * FROM code_connexion_voyageur`);
      const ligne = rows.find((l) => l.canal === "sms" && l.consommeA === null);
      expect(ligne).toBeDefined();
      expect(ligne.codeHache).toMatch(/^[0-9a-f]{64}$/);
      const toutes = JSON.stringify(rows);
      expect(toutes).not.toContain(tel);
      expect(toutes).not.toContain(tel.slice(1));
      expect(toutes).not.toContain(`"${code}"`);
    });

    it("un renvoi trop rapproché est refusé, deux demandes simultanées n'envoient qu'un SMS", async () => {
      const tel = numero();
      const avant = t.sms.boite.length;
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () => demander({ telephone: tel })),
      );
      expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        reponses
          .filter((r) => r.status === 429)
          .every((r) => r.body.code === "ENVOI_TROP_RAPPROCHE"),
      ).toBe(true);
      expect(t.sms.boite.length - avant).toBe(1);
    });

    it("le bon code ouvre une session une seule fois, même demandé dix fois en même temps", async () => {
      const tel = numero();
      await demander({ telephone: tel });
      const code = t.sms.dernierCode();
      const reponses = await Promise.all(
        Array.from({ length: 10 }, () => verifier({ telephone: tel, code })),
      );
      const reussies = reponses.filter((r) => r.status === 200);
      expect(reussies).toHaveLength(1);
      expect(reussies[0]!.body.nouveauCompte).toBe(true);
      expect(
        reponses.filter((r) => r.status === 401).every((r) => r.body.code === "CODE_EXPIRE"),
      ).toBe(true);
      const fiche = await sql.query(`SELECT count(*)::int AS n FROM fiche_voyageur`);
      expect(fiche.rows[0].n).toBeGreaterThanOrEqual(1);
      // Rejouer le code : déjà utilisé.
      const rejeu = await verifier({ telephone: tel, code });
      expect(rejeu.status).toBe(401);
      expect(rejeu.body.code).toBe("CODE_EXPIRE");
    });

    it("le blocage après cinq mauvais codes survit au redémarrage de l'application", async () => {
      const tel = numero();
      await demander({ telephone: tel });
      const bon = t.sms.dernierCode();
      const mauvais = autreCode(bon);
      for (let i = 0; i < 4; i++) {
        expect((await verifier({ telephone: tel, code: mauvais })).status).toBe(401);
      }
      const bloque = await verifier({ telephone: tel, code: mauvais });
      expect(bloque.status).toBe(429);
      expect(bloque.body.code).toBe("TROP_ESSAIS");

      // Redémarrage : une nouvelle application sur la même base.
      await t.fermer();
      t = await creerAppAuthTest({ prisma: nouvelleConnexion() });
      const encore = await verifier({ telephone: tel, code: bon });
      expect(encore.status).toBe(429);
      expect(encore.body.code).toBe("TROP_ESSAIS");
      const demande = await demander({ telephone: tel });
      expect(demande.status).toBe(429);
      expect(demande.body.code).toBe("TROP_ESSAIS");
    });
  });
});
