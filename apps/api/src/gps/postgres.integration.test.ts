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
import { AlertesMemoire, EtatsSuiviMemoire, PositionsMemoire, PrevenirMemoire } from "./memoire";
import {
  AlertesArretPrisma,
  EtatsSuiviPrisma,
  PositionsPrisma,
  PrevenirProchesPrisma,
} from "./postgres";
import { AlertesArret, EtatsSuivi, Positions, PrevenirProches } from "./ports";
import { avec, creerAppGpsTest, peupler, type AppGpsTest } from "./testing/app-gps-test";
import {
  contratStockageGps,
  instant,
  unEtat,
  unPrevenir,
  unePosition,
  uneAlerte,
} from "./testing/contrat-stockage";
import { DEPART, pointAuKm } from "./testing/monde";
import { MS_PAR_MINUTE, versIsoDouala } from "./temps";

/**
 * Stockage du suivi GPS : les mêmes tests de contrat sur la mémoire (toujours) et sur PostgreSQL
 * (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit sous requêtes
 * simultanées (position, état, alerte, SMS au proche) et l'API de bout en bout avec
 * `API_STOCKAGE=postgres`.
 */

contratStockageGps("mémoire", async () => ({
  positions: new PositionsMemoire(),
  etats: new EtatsSuiviMemoire(),
  alertes: new AlertesMemoire(),
  prevenirs: new PrevenirMemoire(),
  fermer: async () => undefined,
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · GPS", () => {
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

  contratStockageGps("PostgreSQL", async () => ({
    positions: new PositionsPrisma(prisma),
    etats: new EtatsSuiviPrisma(prisma),
    alertes: new AlertesArretPrisma(prisma),
    prevenirs: new PrevenirProchesPrisma(prisma),
    fermer: async () => undefined,
  }));

  describe("sous requêtes simultanées", () => {
    it("douze envois du même lot : la position n'est gardée qu'une fois", async () => {
      const positions = new PositionsPrisma(prisma);
      const p = unePosition();
      const resultats = await Promise.all(Array.from({ length: 12 }, () => positions.ajouter(p)));
      expect(resultats.filter(Boolean)).toHaveLength(1);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM position_gps WHERE sujet = $1`,
        [p.sujet],
      );
      expect(rows[0].n).toBe(1);
    });

    it("le chauffeur et le convoyeur écrivent l'état en même temps : un seul gagne chaque version", async () => {
      const etats = new EtatsSuiviPrisma(prisma);
      const departId = randomUUID();
      // Dix créations de la version 1 avec des contenus différents.
      const creations = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          etats.ecrire(unEtat(departId, 1, { progressionKm: i })),
        ),
      );
      expect(creations.filter(Boolean)).toHaveLength(1);
      // Puis dix écritures de la version 2.
      const suites = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          etats.ecrire(unEtat(departId, 2, { progressionKm: 100 + i })),
        ),
      );
      expect(suites.filter(Boolean)).toHaveLength(1);
      const lu = await etats.lire(departId);
      expect(lu?.version).toBe(2);
      // La ligne est celle du gagnant, pas un mélange des deux écritures.
      expect(lu?.progressionKm).toBeGreaterThanOrEqual(100);
    });

    it("dix positions qui franchissent les dix minutes : une seule alerte s'ouvre", async () => {
      const alertes = new AlertesArretPrisma(prisma);
      const departId = randomUUID();
      const resultats = await Promise.all(
        Array.from({ length: 10 }, () => alertes.ouvrir(uneAlerte({ departId }))),
      );
      expect(resultats.filter((r) => r !== null)).toHaveLength(1);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM alerte_arret WHERE "departId" = $1 AND "resolueA" IS NULL`,
        [departId],
      );
      expect(rows[0].n).toBe(1);
    });

    it("huit fermetures simultanées de la même alerte : une seule la ferme", async () => {
      const alertes = new AlertesArretPrisma(prisma);
      const a = uneAlerte();
      await alertes.ouvrir(a);
      const resultats = await Promise.all(
        Array.from({ length: 8 }, (_, i) => alertes.resoudre(a.id, instant(1000 + i))),
      );
      expect(resultats.filter((r) => r !== null)).toHaveLength(1);
    });

    it("huit envois du SMS au proche en même temps : un seul est noté, donc un seul SMS part", async () => {
      const prevenirs = new PrevenirProchesPrisma(prisma);
      const p = unPrevenir();
      await prevenirs.enregistrer(p);
      const resultats = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          prevenirs.marquerEnvoye(p.billetId, p.procheId, instant(500 + i)),
        ),
      );
      expect(resultats.filter(Boolean)).toHaveLength(1);
    });

    it("dix activations simultanées du même proche : une seule ligne", async () => {
      const prevenirs = new PrevenirProchesPrisma(prisma);
      const p = unPrevenir();
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          prevenirs.enregistrer({ ...p, minutesAvantArrivee: 1 + i }),
        ),
      );
      expect(await prevenirs.deBillet(p.billetId)).toHaveLength(1);
    });
  });

  describe("ce que la base garantit seule", () => {
    const insererAlerte = (surcharge: Record<string, unknown> = {}) => {
      const v = {
        id: randomUUID(),
        departId: randomUUID(),
        soupcon: "autre",
        resolueA: null,
        aBord: 10,
        ...surcharge,
      };
      return sql.query(
        `INSERT INTO alerte_arret (id, "departId", "compagnieId", immatriculation, apres, "arretDepuis",
           "ouverteA", latitude, longitude, soupcon, "aBord", "resolueA")
         VALUES ($1, $2, $3, 'LT 1', 'Edéa', now() - interval '12 minutes', now(), 3.8, 10.1, $4, $5, $6)`,
        [v.id, v.departId, randomUUID(), v.soupcon, v.aBord, v.resolueA],
      );
    };

    it("une seule alerte ouverte par départ, même écrite à la main ; une fermée ne gêne pas", async () => {
      const departId = randomUUID();
      await insererAlerte({ departId });
      await expect(insererAlerte({ departId })).rejects.toThrow(
        /alerte_arret_une_ouverte_par_depart/,
      );
      await insererAlerte({ departId: randomUUID() });
      // Fermée (dans le futur de l'ouverture), elle libère le départ.
      const fermee = randomUUID();
      await insererAlerte({
        id: fermee,
        departId: randomUUID(),
        resolueA: new Date(Date.now() + 1000),
      });
    });

    it("refuse un soupçon inconnu, un nombre de voyageurs négatif et une fermeture avant l'ouverture", async () => {
      await expect(insererAlerte({ soupcon: "sabotage" })).rejects.toThrow(
        /alerte_arret_soupcon_connu/,
      );
      await expect(insererAlerte({ aBord: -1 })).rejects.toThrow(/alerte_arret_bord/);
      await expect(insererAlerte({ resolueA: new Date(Date.now() - 3_600_000) })).rejects.toThrow(
        /alerte_arret_ordre/,
      );
    });

    it("refuse une latitude ou une longitude impossible et une vitesse négative", async () => {
      const inserer = (lat: number, lng: number, vitesse: number | null) =>
        erreurSql(
          `INSERT INTO position_gps (sujet, "auteurId", instant, latitude, longitude, "vitesseKmh", "recuA")
           VALUES ($1, $2, now(), $3, $4, $5, now())`,
          [`bus:${randomUUID()}`, randomUUID(), lat, lng, vitesse],
        );
      expect(await inserer(91, 10, 0)).toMatch(/position_gps_coordonnees/);
      expect(await inserer(4, -181, 0)).toMatch(/position_gps_coordonnees/);
      expect(await inserer(4, 10, -3)).toMatch(/position_gps_mesures/);
      expect(await inserer(4, 10, null)).toBe("");
    });

    it("« prévenir un proche » : de 1 à 120 minutes", async () => {
      const prevenirs = new PrevenirProchesPrisma(prisma);
      await expect(prevenirs.enregistrer(unPrevenir({ minutesAvantArrivee: 0 }))).rejects.toThrow();
      await expect(
        prevenirs.enregistrer(unPrevenir({ minutesAvantArrivee: 121 })),
      ).rejects.toThrow();
      await prevenirs.enregistrer(unPrevenir({ minutesAvantArrivee: 120 }));
    });

    it("l'état d'un départ ne peut pas commencer à la version 0", async () => {
      const erreur = await erreurSql(
        `INSERT INTO suivi_depart ("departId", version, "progressionKm", passages)
         VALUES ($1, 0, 0, '{}')`,
        [randomUUID()],
      );
      expect(erreur).toMatch(/suivi_depart_version/);
    });
  });

  describe("l'API de bout en bout, stockage PostgreSQL", () => {
    let stockageAvant: string | undefined;
    let t: AppGpsTest;
    let g: Awaited<ReturnType<typeof peupler>>;
    const billetId = randomUUID();
    // Une connexion par application : fermer l'application la ferme, pas celle des autres tests.
    const nouvelleConnexion = () => new PrismaService(configTest({ DATABASE_URL: base.url }));

    const position = (km: number, extra: Record<string, unknown> = {}, decalageS = 0) => ({
      instant: versIsoDouala(t.horloge.maintenant().getTime() + decalageS * 1000),
      ...pointAuKm(km),
      precisionM: 8,
      vitesseKmh: 80,
      ...extra,
    });
    const envoyer = (positions: unknown[], jeton = () => g.chauffeur.jeton) =>
      t.http().post(`/gps/bus/${DEPART}/positions`).set(avec(jeton())).send({ positions });

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      t = await creerAppGpsTest({
        prisma: nouvelleConnexion(),
        debut: new Date("2026-11-02T07:04:00.000Z"),
      });
      g = await peupler(t);
      t.billets.ajouter({
        billetId,
        departId: DEPART,
        voyageurId: g.voyageur.id,
        siege: 9,
        passagerNom: "Aïcha",
        valide: true,
      });
    }, 120_000);

    afterAll(async () => {
      await t?.fermer();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise les adaptateurs PostgreSQL pour les quatre ports qu'il écrit", () => {
      expect(t.app.get(Positions)).toBeInstanceOf(PositionsPrisma);
      expect(t.app.get(EtatsSuivi)).toBeInstanceOf(EtatsSuiviPrisma);
      expect(t.app.get(AlertesArret)).toBeInstanceOf(AlertesArretPrisma);
      expect(t.app.get(PrevenirProches)).toBeInstanceOf(PrevenirProchesPrisma);
    });

    it("les positions sont en base, un lot renvoyé ne change rien, l'état suit", async () => {
      t.horloge.avancer(MS_PAR_MINUTE);
      const lot = [position(10), position(11, {}, 30)];
      const premier = await envoyer(lot);
      expect(premier.status).toBe(200);
      expect(premier.body).toMatchObject({ acceptees: 2, doublons: 0 });
      const rejeu = await envoyer(lot);
      expect(rejeu.body).toMatchObject({ acceptees: 0, doublons: 2 });
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM position_gps WHERE sujet = $1`,
        [`bus:${DEPART}`],
      );
      expect(rows[0].n).toBe(2);
      const etat = (await sql.query(`SELECT * FROM suivi_depart WHERE "departId" = $1`, [DEPART]))
        .rows[0];
      expect(etat.version).toBeGreaterThanOrEqual(1);
      expect(etat.progressionKm).toBeCloseTo(11, 0);
    });

    it("le chauffeur et le convoyeur envoient en même temps : les deux sont reçus, l'état ne régresse pas", async () => {
      t.horloge.avancer(2 * MS_PAR_MINUTE);
      const [a, b] = await Promise.all([
        envoyer([position(20)]),
        envoyer([position(21, {}, 10)], () => g.convoyeur.jeton),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const etat = (await sql.query(`SELECT * FROM suivi_depart WHERE "departId" = $1`, [DEPART]))
        .rows[0];
      expect(etat.progressionKm).toBeCloseTo(21, 0);
    });

    it("« prévenir un proche » est rangé en base", async () => {
      const r = await t
        .http()
        .put(`/voyageur/billets/${billetId}/prevenir`)
        .set(avec(g.voyageur.jeton))
        .send({ procheId: "proche-maman" });
      expect(r.status).toBe(200);
      const ligne = (
        await sql.query(`SELECT * FROM prevenir_proche WHERE "billetId" = $1`, [billetId])
      ).rows[0];
      expect(ligne).toMatchObject({
        procheId: "proche-maman",
        voyageurId: g.voyageur.id,
        departId: DEPART,
        minutesAvantArrivee: 15,
        actif: true,
        envoyeA: null,
      });
      const direct = await t
        .http()
        .get(`/voyageur/billets/${billetId}/direct`)
        .set(avec(g.voyageur.jeton));
      expect(direct.status).toBe(200);
      expect(direct.body.prevenir).toMatchObject({ procheId: "proche-maman", actif: true });
    });

    it("une alerte d'arrêt s'ouvre une fois en base, se lit à la salle de contrôle et se ferme quand le bus repart", async () => {
      for (let i = 0; i < 22; i++) {
        t.horloge.avancer(30_000);
        await envoyer([position(70, { vitesseKmh: 0 })], () => g.convoyeur.jeton);
      }
      const ouvertes = (
        await sql.query(`SELECT * FROM alerte_arret WHERE "departId" = $1 AND "resolueA" IS NULL`, [
          DEPART,
        ])
      ).rows;
      expect(ouvertes).toHaveLength(1);
      expect(ouvertes[0]).toMatchObject({ immatriculation: "LT 412 AB", soupcon: "autre" });
      const carte = await t.http().get("/patron/controle/bus").set(avec(g.patron.jeton));
      expect(carte.body.aTraiter).toHaveLength(1);
      expect(t.avis.alertes).toHaveLength(1);

      t.horloge.avancer(30_000);
      await envoyer([position(72, { vitesseKmh: 70 })], () => g.convoyeur.jeton);
      const apres = (
        await sql.query(`SELECT "resolueA" FROM alerte_arret WHERE "departId" = $1`, [DEPART])
      ).rows;
      expect(apres.every((l: { resolueA: Date | null }) => l.resolueA !== null)).toBe(true);
      expect(
        (await t.http().get("/patron/controle/bus").set(avec(g.patron.jeton))).body.alerte,
      ).toBeNull();
    });

    it("après un redémarrage, l'état du suivi et les positions sont toujours là", async () => {
      const avant = (
        await sql.query(`SELECT version, "progressionKm" FROM suivi_depart WHERE "departId" = $1`, [
          DEPART,
        ])
      ).rows[0];
      const heure = t.horloge.maintenant();
      await t.fermer();
      t = await creerAppGpsTest({ prisma: nouvelleConnexion(), debut: heure });
      g = await peupler(t);
      const etat = await t.app.get(EtatsSuivi).lire(DEPART);
      expect(etat?.version).toBe(avant.version);
      expect(etat?.progressionKm).toBeCloseTo(avant.progressionKm, 5);
      expect(await t.app.get(Positions).derniere(`bus:${DEPART}`)).not.toBeNull();
    });
  });
});
