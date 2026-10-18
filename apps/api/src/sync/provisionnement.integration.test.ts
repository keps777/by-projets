import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { HorlogeFixe } from "../socle/testing/memoire";
import { MS_PAR_HEURE } from "./temps";
import { ProvisionnementPrisma } from "./postgres";
import type { AppareilSync } from "./ports";

/**
 * A7 : le provisionnement des sièges hors ligne sur PostgreSQL. Chaque test a sa gare, ses guichets et ses départs
 * (rien n'est partagé entre les tests) ; l'horloge est fixée pour que les fenêtres de départ soient déterministes.
 */

const MAINTENANT = new Date("2026-11-02T08:00:00.000Z");
const dans = (heures: number): Date => new Date(MAINTENANT.getTime() + heures * MS_PAR_HEURE);

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · parts de sièges hors ligne", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let provisionnement: ProvisionnementPrisma;
  let n = 0;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
    provisionnement = new ProvisionnementPrisma(prisma, new HorlogeFixe(MAINTENANT));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  interface Monde {
    compagnieId: string;
    gareId: string;
    ligneId: string;
    busId: string;
  }

  /** Une compagnie, sa gare d'origine, `nbGuichets` guichets (rangs 1…), une destination, une ligne et un bus. */
  async function monde(nbGuichets: number, capacite = 70): Promise<Monde> {
    n += 1;
    const code = String.fromCharCode(65 + (n % 26)) + String.fromCharCode(65 + Math.floor(n / 26));
    const compagnie = await prisma.compagnie.create({
      data: { code: `${code}X`, nom: "Agence test" },
    });
    const origine = await prisma.gare.create({
      data: { compagnieId: compagnie.id, code: "DLA", nom: "Akwa", ville: "Douala" },
    });
    const destination = await prisma.gare.create({
      data: { compagnieId: compagnie.id, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
    });
    for (let rang = 1; rang <= nbGuichets; rang++) {
      await prisma.guichet.create({ data: { gareId: origine.id, rang } });
    }
    const ligne = await prisma.ligne.create({
      data: {
        compagnieId: compagnie.id,
        code: "DLAYDE",
        origineGareId: origine.id,
        destinationGareId: destination.id,
        tarifClassique: 4000,
        tarifVip: 6000,
        tarifBagage: 500,
      },
    });
    const bus = await prisma.bus.create({
      data: {
        compagnieId: compagnie.id,
        immatriculation: `LT-${n}-AA`,
        capacite,
        classe: "classique",
      },
    });
    return {
      compagnieId: compagnie.id,
      gareId: origine.id,
      ligneId: ligne.id,
      busId: bus.id,
    };
  }

  async function depart(
    m: Monde,
    options: {
      heure?: Date;
      etat?: "en_vente" | "embarquement" | "parti" | "annule";
      busId?: string | null;
    } = {},
  ): Promise<string> {
    n += 1;
    const d = await prisma.depart.create({
      data: {
        numero: `T-${n}-${randomUUID().slice(0, 8)}`,
        ligneId: m.ligneId,
        busId: options.busId === undefined ? m.busId : options.busId,
        classe: "classique",
        heureDepart: options.heure ?? dans(3),
        etat: options.etat ?? "en_vente",
      },
    });
    return d.id;
  }

  const appareil = (
    m: Monde,
    rang: number,
    surcharge: Partial<AppareilSync> = {},
  ): AppareilSync => ({
    id: `tel-${randomUUID()}`,
    cle: null,
    genre: "guichet",
    rang,
    nbConvoyeurs: null,
    plage: null,
    gareId: m.gareId,
    compagnieId: m.compagnieId,
    derniereSyncA: null,
    dernierOrdre: 0,
    octroi: null,
    retire: false,
    ...surcharge,
  });

  const occuper = (departId: string, siege: number) =>
    sql.query(`INSERT INTO siege_depart ("departId", siege, "billetId") VALUES ($1, $2, $3)`, [
      departId,
      siege,
      randomUUID(),
    ]);

  describe("la répartition", () => {
    it("chaque guichet de la gare reçoit un bloc contigu, sans recouvrement, et la réserve en ligne n'est donnée à personne", async () => {
      const m = await monde(3, 70);
      const d = await depart(m);
      const parts = await Promise.all(
        [1, 2, 3].map((rang) => provisionnement.partsHorsLigne(appareil(m, rang))),
      );
      const [p1, p2, p3] = parts.map((p) => p[d]!);
      // 70 places, 15 % réservés (11), 59 à partager : 20 + 20 + 19.
      expect([p1!.length, p2!.length, p3!.length]).toEqual([20, 20, 19]);
      expect(p1).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(p2).toEqual(Array.from({ length: 20 }, (_, i) => i + 21));
      expect(p3).toEqual(Array.from({ length: 19 }, (_, i) => i + 41));
      const tous = [...p1!, ...p2!, ...p3!];
      expect(new Set(tous).size).toBe(tous.length);
      expect(Math.max(...tous)).toBe(59);
    });

    it("la répartition est figée en base à la première demande, une ligne par guichet", async () => {
      const m = await monde(2, 40);
      const d = await depart(m);
      await provisionnement.partsHorsLigne(appareil(m, 1));
      const { rows } = await sql.query(
        `SELECT rang, sieges FROM part_hors_ligne WHERE "departId" = $1 ORDER BY rang`,
        [d],
      );
      expect(rows.map((r) => r.rang)).toEqual([1, 2]);
      // 40 places, 6 réservées, 34 à partager : 17 + 17.
      expect(rows[0].sieges).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
      expect(rows[1].sieges).toEqual(Array.from({ length: 17 }, (_, i) => i + 18));
    });

    it("un guichet ajouté après coup ne change pas les parts déjà données, et n'en reçoit pas pour ce départ", async () => {
      const m = await monde(2, 40);
      const d = await depart(m);
      const avant = await provisionnement.partsHorsLigne(appareil(m, 1));
      await prisma.guichet.create({ data: { gareId: m.gareId, rang: 3 } });
      expect(await provisionnement.partsHorsLigne(appareil(m, 1))).toEqual(avant);
      expect(await provisionnement.partsHorsLigne(appareil(m, 3))).toEqual({});
      // Un autre départ, créé ensuite, est réparti entre les trois.
      const d2 = await depart(m, { heure: dans(5) });
      const apres = await provisionnement.partsHorsLigne(appareil(m, 3));
      expect(Object.keys(apres)).toEqual([d2]);
      expect(avant[d]).toBeDefined();
    });

    it("un téléphone de secours (même rang) reprend exactement la part de celui qu'il remplace", async () => {
      const m = await monde(3, 70);
      const d = await depart(m);
      const ancien = await provisionnement.partsHorsLigne(appareil(m, 2));
      const secours = await provisionnement.partsHorsLigne(appareil(m, 2));
      expect(secours).toEqual(ancien);
      expect(ancien[d]!.length).toBeGreaterThan(0);
    });

    it("des synchronisations simultanées s'entendent : une seule répartition, la même pour tous", async () => {
      const m = await monde(3, 70);
      const d = await depart(m);
      const reponses = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          provisionnement.partsHorsLigne(appareil(m, (i % 3) + 1)),
        ),
      );
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM part_hors_ligne WHERE "departId" = $1`,
        [d],
      );
      expect(rows[0].n).toBe(3);
      for (let rang = 1; rang <= 3; rang++) {
        const siennes = reponses.filter((_, i) => (i % 3) + 1 === rang).map((r) => r[d]);
        expect(new Set(siennes.map((s) => JSON.stringify(s))).size).toBe(1);
      }
      const toutes = [1, 2, 3].flatMap((rang) => reponses[rang - 1]![d]!);
      expect(new Set(toutes).size).toBe(toutes.length);
    });

    it("un bus trop petit pour être partagé, ou une gare sans guichet, ne donne rien", async () => {
      const petit = await monde(2, 1);
      await depart(petit);
      expect(await provisionnement.partsHorsLigne(appareil(petit, 1))).toEqual({});
      const vide = await monde(0, 40);
      await depart(vide);
      expect(await provisionnement.partsHorsLigne(appareil(vide, 1))).toEqual({});
    });
  });

  describe("reprise et libération des sièges", () => {
    it("un siège occupé (billet) ou retenu (commande) sort de la part, un siège libéré y revient", async () => {
      const m = await monde(2, 40);
      const d = await depart(m);
      const initiale = (await provisionnement.partsHorsLigne(appareil(m, 1)))[d]!;
      expect(initiale).toContain(3);
      expect(initiale).toContain(4);

      await occuper(d, 3);
      await sql.query(
        `INSERT INTO siege_depart ("departId", siege, "bloquePar", "bloqueJusqua", "commandeId")
         VALUES ($1, 4, 'voyageur-1', $2, $3)`,
        [d, dans(1), randomUUID()],
      );
      const apres = (await provisionnement.partsHorsLigne(appareil(m, 1)))[d]!;
      expect(apres).not.toContain(3);
      expect(apres).not.toContain(4);
      expect(apres).toHaveLength(initiale.length - 2);

      await sql.query(`DELETE FROM siege_depart WHERE "departId" = $1 AND siege = 3`, [d]);
      const libere = (await provisionnement.partsHorsLigne(appareil(m, 1)))[d]!;
      expect(libere).toContain(3);
      expect(libere).not.toContain(4);
    });

    it("une retenue échue ne retire plus le siège", async () => {
      const m = await monde(2, 40);
      const d = await depart(m);
      await sql.query(
        `INSERT INTO siege_depart ("departId", siege, "bloquePar", "bloqueJusqua", "commandeId")
         VALUES ($1, 5, 'voyageur-1', $2, $3)`,
        [d, dans(-1), randomUUID()],
      );
      expect((await provisionnement.partsHorsLigne(appareil(m, 1)))[d]).toContain(5);
    });

    it("la part d'un guichet n'est pas touchée par les sièges de l'autre", async () => {
      const m = await monde(2, 40);
      const d = await depart(m);
      const avant = (await provisionnement.partsHorsLigne(appareil(m, 1)))[d]!;
      await occuper(d, 20);
      expect((await provisionnement.partsHorsLigne(appareil(m, 1)))[d]).toEqual(avant);
      expect((await provisionnement.partsHorsLigne(appareil(m, 2)))[d]).not.toContain(20);
    });
  });

  describe("quels départs, quels appareils", () => {
    it("seuls les départs vendables, avec un bus, de la gare du téléphone et dans la fenêtre reçoivent une part", async () => {
      const m = await monde(2, 40);
      const ok1 = await depart(m, { heure: dans(2) });
      const ok2 = await depart(m, { etat: "embarquement", heure: dans(-1) });
      await depart(m, { etat: "parti" });
      await depart(m, { etat: "annule" });
      await depart(m, { busId: null });
      await depart(m, { heure: dans(49) });
      await depart(m, { heure: dans(-24 * 8) });
      const autre = await monde(2, 40);
      await depart(autre);

      const parts = await provisionnement.partsHorsLigne(appareil(m, 1));
      expect(Object.keys(parts).sort()).toEqual([ok1, ok2].sort());
    });

    it("un téléphone retiré, un convoyeur ou une fiche sans gare n'ont pas de part", async () => {
      const m = await monde(2, 40);
      await depart(m);
      expect(await provisionnement.partsHorsLigne(appareil(m, 1, { retire: true }))).toEqual({});
      expect(await provisionnement.partsHorsLigne(appareil(m, 1, { genre: "convoyeur" }))).toEqual(
        {},
      );
      expect(await provisionnement.partsHorsLigne(appareil(m, 1, { gareId: null }))).toEqual({});
      expect(await provisionnement.partsHorsLigne(appareil(m, 1, { rang: null }))).toEqual({});
    });

    it("un rang sans guichet dans la gare n'a pas de part (un seul téléphone par guichet existant)", async () => {
      const m = await monde(2, 40);
      await depart(m);
      expect(await provisionnement.partsHorsLigne(appareil(m, 3))).toEqual({});
    });

    it("les vérificateurs de PIN restent vides (le secret dérivé n'existe pas côté serveur)", async () => {
      expect(await provisionnement.verificateursPin()).toEqual([]);
    });
  });

  describe("ce que la base garantit seule", () => {
    const erreur = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
      try {
        await sql.query(texte, valeurs);
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
      return "";
    };

    it("une part est liée à son départ, et part avec lui", async () => {
      const m = await monde(2, 40);
      const d = await depart(m);
      await provisionnement.partsHorsLigne(appareil(m, 1));
      expect(
        await erreur(
          `INSERT INTO part_hors_ligne ("departId", rang, sieges) VALUES ($1, 1, '{1}')`,
          [randomUUID()],
        ),
      ).toMatch(/part_hors_ligne_depart_fkey/);
      await sql.query(`DELETE FROM depart WHERE id = $1`, [d]);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM part_hors_ligne WHERE "departId" = $1`,
        [d],
      );
      expect(rows[0].n).toBe(0);
    });

    it("un guichet n'a qu'une part par départ, de rang positif, de sièges positifs", async () => {
      const m = await monde(1, 40);
      const d = await depart(m);
      const inserer = (rang: number, sieges: string) =>
        erreur(`INSERT INTO part_hors_ligne ("departId", rang, sieges) VALUES ($1, $2, $3)`, [
          d,
          rang,
          sieges,
        ]);
      expect(await inserer(1, "{1,2}")).toBe("");
      expect(await inserer(1, "{3}")).toMatch(/part_hors_ligne_pkey/);
      expect(await inserer(0, "{3}")).toMatch(/part_hors_ligne_rang/);
      expect(await inserer(2, "{0,3}")).toMatch(/part_hors_ligne_sieges/);
      expect(await inserer(2, "{-1}")).toMatch(/part_hors_ligne_sieges/);
    });
  });
});
