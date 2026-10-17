import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  AttributionRolesMemoire,
  BrouillonsRelaisMemoire,
  CompteursDossiersMemoire,
  DemandesRelaisMemoire,
  LieuxMemoire,
  PortefeuilleMemoire,
  ReceptionsRelaisMemoire,
  RelaisMemoire,
} from "./memoire";
import {
  AttributionRolesPrisma,
  BrouillonsRelaisPrisma,
  CompteursDossiersPrisma,
  DemandesRelaisPrisma,
  LieuxPrisma,
  PortefeuillePrisma,
  ReceptionsRelaisPrisma,
  RelaisPrisma,
} from "./postgres";
import { contratPortsRelais, unRelais, uneDemande, type BancRelais } from "./testing/contrat-ports";
import { creerColisPg } from "./testing/fixtures-pg";

/**
 * Adaptateurs PostgreSQL des points relais et du portefeuille : le même contrat sur la mémoire
 * (toujours) et sur PostgreSQL (avec DATABASE_URL_TEST), puis ce que seule la base garantit.
 */

contratPortsRelais("contrat · relais en mémoire", async () => {
  const lieux = new LieuxMemoire();
  const roles = new AttributionRolesMemoire();
  return {
    relais: new RelaisMemoire(),
    demandes: new DemandesRelaisMemoire(),
    brouillons: new BrouillonsRelaisMemoire(),
    compteurs: new CompteursDossiersMemoire(),
    receptions: new ReceptionsRelaisMemoire(),
    portefeuille: new PortefeuilleMemoire(),
    lieux,
    roles,
    personne: async () => randomUUID(),
    colis: async () => randomUUID(),
    gare: async (point) => {
      const id = randomUUID();
      if (point) lieux.gares.set(id, point);
      return id;
    },
    poserAdresse: async (adresse, ville, point) => lieux.poserAdresse(adresse, ville, point),
    rolesDe: async (personneId) =>
      roles.attributions.filter((a) => a.personneId === personneId).map((a) => a.role),
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · relais", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let chiffrement: ChiffrementService;
  let fx: FixturesPg;

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };
  const personne = async (): Promise<string> =>
    (await fx.personne({ roles: ["voyageur"], compagnieId: null, gareId: null })).id;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    chiffrement = new ChiffrementService(config);
    fx = new FixturesPg(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsRelais("contrat · relais PostgreSQL", async () => {
    const lieux = new LieuxPrisma(prisma);
    return {
      relais: new RelaisPrisma(prisma, chiffrement),
      demandes: new DemandesRelaisPrisma(prisma, chiffrement),
      brouillons: new BrouillonsRelaisPrisma(prisma, chiffrement),
      compteurs: new CompteursDossiersPrisma(prisma),
      receptions: new ReceptionsRelaisPrisma(prisma),
      portefeuille: new PortefeuillePrisma(prisma, chiffrement),
      lieux,
      roles: new AttributionRolesPrisma(prisma),
      personne,
      colis: async () => (await creerColisPg(prisma, fx)).id,
      gare: async (point) => {
        const c = await fx.compagnie();
        const g = await fx.gare(c.id);
        if (point) {
          await prisma.coordonneesGare.create({
            data: { gareId: g.id, latitude: point.lat, longitude: point.lon },
          });
        }
        return g.id;
      },
      poserAdresse: (adresse, ville, point) => lieux.poserAdresse(adresse, ville, point),
      rolesDe: async (personneId) =>
        (await prisma.personne.findUniqueOrThrow({ where: { id: personneId } })).roles,
      fermer: async () => undefined,
    } satisfies BancRelais;
  });

  describe("ce que la base garantit seule", () => {
    it("les numéros MoMo ne sont jamais en clair : relais, demande, brouillon, débit", async () => {
      const relais = new RelaisPrisma(prisma, chiffrement);
      const demandes = new DemandesRelaisPrisma(prisma, chiffrement);
      const brouillons = new BrouillonsRelaisPrisma(prisma, chiffrement);
      const portefeuille = new PortefeuillePrisma(prisma, chiffrement);
      const p = await personne();
      const r = unRelais(p, { momo: { telephone: "+237699887766", operateur: "orange" } });
      await relais.ajouter(r);
      const d = uneDemande(await personne());
      d.fiche.momo.telephone = "+237699887766";
      await demandes.ajouter(d);
      await brouillons.enregistrer({
        personneId: await personne(),
        fiche: { momo: { telephone: "+237699887766", operateur: "orange" } },
        enregistreA: "2027-01-05T09:00:00.000+01:00",
      });
      await prisma.creditPartenaire.create({
        data: {
          cle: `c-${randomUUID()}`,
          type: "relais",
          partenaireId: r.id,
          montant: 500,
          motif: "remise",
          reference: "x",
          at: new Date(),
        },
      });
      await portefeuille.reserver({
        cle: `retrait:${randomUUID()}`,
        type: "relais",
        partenaireId: r.id,
        montant: 500,
        motif: "retrait",
        at: "2027-01-05T09:00:00.000+01:00",
        soldeMinimum: 0,
        operateur: "orange",
        telephone: "+237699887766",
        libelle: "Retrait",
      });
      for (const [table, colonne] of [
        ["relais", `"momoTelephoneChiffre"`],
        ["demande_relais", "fiche::text"],
        ["brouillon_relais", "fiche::text"],
        ["debit_partenaire", `"telephoneChiffre"`],
      ] as const) {
        const { rows } = await sql.query(`SELECT ${colonne} AS v FROM ${table}`);
        expect(rows.length, table).toBeGreaterThan(0);
        for (const ligne of rows) expect(String(ligne.v), table).not.toContain("699887766");
      }
    });

    it("une personne n'a qu'un relais, et un relais n'a qu'un code", async () => {
      const relais = new RelaisPrisma(prisma, chiffrement);
      const p = await personne();
      expect(await relais.ajouter(unRelais(p))).toBe(true);
      expect(await relais.ajouter(unRelais(p))).toBe(false);
      expect(await erreurSql(`UPDATE relais SET "momoOperateur" = 'moov'`)).toMatch(
        /relais_operateur_connu/,
      );
      expect(
        await erreurSql(`UPDATE relais SET latitude = NULL WHERE "personneId" = $1`, [p]),
      ).toMatch(/relais_position_complete/);
    });

    it("l'index unique partiel : une seule demande ouverte par personne, par SQL direct aussi", async () => {
      const p = await personne();
      const demandes = new DemandesRelaisPrisma(prisma, chiffrement);
      await demandes.ajouter(uneDemande(p));
      expect(
        await erreurSql(
          `INSERT INTO demande_relais (dossier, "personneId", fiche, etat, "deposeeA")
           VALUES ($1, $2, '{}', 'visite_planifiee', now())`,
          [`R-DIRECT-${randomUUID()}`, p],
        ),
      ).toMatch(/demande_relais_une_ouverte/);
    });

    it("les gains sont en ajout seul et les débits versés ne bougent plus", async () => {
      const portefeuille = new PortefeuillePrisma(prisma, chiffrement);
      const id = randomUUID();
      const cle = `remise:${randomUUID()}`;
      await portefeuille.crediter({
        cle,
        type: "relais",
        partenaireId: id,
        montant: 1000,
        motif: "remise",
        reference: "colis",
        at: "2027-01-05T09:00:00.000+01:00",
      });
      expect(
        await erreurSql(`UPDATE credit_partenaire SET montant = 99999 WHERE cle = $1`, [cle]),
      ).not.toBe("");
      expect(await erreurSql(`DELETE FROM credit_partenaire WHERE cle = $1`, [cle])).not.toBe("");
      expect(await erreurSql(`TRUNCATE credit_partenaire`)).not.toBe("");
      expect(
        await erreurSql(
          `INSERT INTO credit_partenaire (cle, type, "partenaireId", montant, motif, reference, "at")
           VALUES ('x-' || gen_random_uuid(), 'relais', $1, 0, 'remise', 'r', now())`,
          [id],
        ),
      ).toMatch(/credit_partenaire_montant/);

      const retrait = `retrait:${randomUUID()}`;
      await portefeuille.reserver({
        cle: retrait,
        type: "relais",
        partenaireId: id,
        montant: 400,
        motif: "retrait",
        at: "2027-01-05T10:00:00.000+01:00",
        soldeMinimum: 0,
        operateur: "mtn",
        telephone: "+237677112233",
        libelle: "Retrait",
      });
      await portefeuille.confirmer(retrait, "MM-42");
      expect(await erreurSql(`DELETE FROM debit_partenaire WHERE cle = $1`, [retrait])).toMatch(
        /ne se supprime pas/,
      );
      expect(
        await erreurSql(`UPDATE debit_partenaire SET montant = 1 WHERE cle = $1`, [retrait]),
      ).toMatch(/ne se modifie pas/);
      expect(await portefeuille.solde("relais", id)).toBe(600);
    });

    it("une réception se rattache à un colis et à un relais qui existent", async () => {
      expect(
        await erreurSql(
          `INSERT INTO reception_relais ("colisId", "relaisId", "recuA") VALUES ($1, $2, now())`,
          [randomUUID(), randomUUID()],
        ),
      ).toMatch(/reception_relais_(colis|relais)_fkey/);
    });

    it("les coordonnées sont bornées", async () => {
      expect(
        await erreurSql(
          `INSERT INTO adresse_geolocalisee (cle, latitude, longitude) VALUES ('a|b', 95, 0)`,
        ),
      ).toMatch(/adresse_geolocalisee_bornes/);
      expect(
        await erreurSql(
          `INSERT INTO adresse_geolocalisee (cle, latitude, longitude) VALUES ('A|B', 1, 0)`,
        ),
      ).toMatch(/adresse_geolocalisee_cle_minuscule/);
    });

    it("le rôle donné au compte respecte les règles des rôles (afrimove ne se cumule pas avec un rôle de vente)", async () => {
      const roles = new AttributionRolesPrisma(prisma);
      const p = (await fx.personne({ roles: ["afrimove"], compagnieId: null, gareId: null })).id;
      await roles.ajouterRole(p, "relais");
      const { roles: apres } = await prisma.personne.findUniqueOrThrow({ where: { id: p } });
      expect(apres).toEqual(["afrimove", "relais"]);
    });
  });
});
