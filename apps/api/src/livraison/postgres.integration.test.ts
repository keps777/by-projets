import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { creerColisPg } from "../relais/testing/fixtures-pg";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  DemandesLivreurMemoire,
  InvitationsMemoire,
  LivreursMemoire,
  MissionsMemoire,
  PartagesSuiviMemoire,
} from "./memoire";
import {
  DemandesLivreurPrisma,
  InvitationsPrisma,
  LivreursPrisma,
  MissionsPrisma,
  PartagesSuiviPrisma,
} from "./postgres";
import {
  contratPortsLivraison,
  unLivreur,
  uneDemandeLivreur,
  uneMission,
  type BancLivraison,
} from "./testing/contrat-ports";

/**
 * Adaptateurs PostgreSQL de la livraison moto : le même contrat sur la mémoire (toujours) et sur
 * PostgreSQL (avec DATABASE_URL_TEST), puis ce que seule la base garantit.
 */

contratPortsLivraison("contrat · livraison en mémoire", async () => {
  const livreurs = new LivreursMemoire();
  return {
    livreurs,
    demandes: new DemandesLivreurMemoire(),
    missions: new MissionsMemoire(),
    partages: new PartagesSuiviMemoire(),
    invitations: new InvitationsMemoire(),
    personne: async () => randomUUID(),
    colis: async () => ({ id: randomUUID(), numero: `C-MEM-${randomUUID().slice(0, 8)}` }),
    livreur: async (over) => {
      const l = unLivreur(randomUUID(), over);
      await livreurs.ajouter(l);
      return l;
    },
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · livraison", () => {
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
  const colis = async () => creerColisPg(prisma, fx, { mode: "moto", etat: "disponible" });

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

  contratPortsLivraison("contrat · livraison PostgreSQL", async () => {
    const livreurs = new LivreursPrisma(prisma, chiffrement);
    return {
      livreurs,
      demandes: new DemandesLivreurPrisma(prisma, chiffrement),
      missions: new MissionsPrisma(prisma),
      partages: new PartagesSuiviPrisma(prisma),
      invitations: new InvitationsPrisma(prisma),
      personne,
      colis,
      livreur: async (over) => {
        const l = unLivreur(await personne(), over);
        expect(await livreurs.ajouter(l)).toBe(true);
        return l;
      },
      fermer: async () => undefined,
    } satisfies BancLivraison;
  });

  describe("ce que la base garantit seule", () => {
    it("les numéros MoMo ne sont jamais en clair : livreur et demande", async () => {
      const livreurs = new LivreursPrisma(prisma, chiffrement);
      const demandes = new DemandesLivreurPrisma(prisma, chiffrement);
      const l = unLivreur(await personne(), {
        momo: { telephone: "+237699887766", operateur: "orange" },
      });
      await livreurs.ajouter(l);
      await demandes.ajouter(
        uneDemandeLivreur(await personne(), {
          momo: { telephone: "+237699887766", operateur: "orange" },
        }),
      );
      for (const [table, colonne] of [
        ["livreur", `"momoTelephoneChiffre"`],
        ["demande_livreur", `"momoTelephoneChiffre"`],
      ] as const) {
        const { rows } = await sql.query(`SELECT ${colonne} AS v FROM ${table}`);
        expect(rows.length, table).toBeGreaterThan(0);
        for (const ligne of rows) expect(String(ligne.v), table).not.toContain("699887766");
      }
      // Lu par un autre contexte de chiffrement, le numéro ne se déchiffre pas.
      const { rows } = await sql.query(
        `SELECT "momoTelephoneChiffre" AS v FROM livreur WHERE id = $1`,
        [l.id],
      );
      expect(() => chiffrement.dechiffrer(String(rows[0].v), "relais.momo.telephone")).toThrow();
    });

    it("l'index unique partiel : une seule mission ouverte par colis, par SQL direct aussi", async () => {
      const missions = new MissionsPrisma(prisma);
      const c = await colis();
      await missions.ajouter(uneMission(c));
      expect(
        await erreurSql(
          `INSERT INTO mission_livraison (id, "colisId", "colisNumero", etat, essais, tour, "creeA",
             trajet, "distanceM", "dureeMinutes", "prixLivraison", gain)
           VALUES (gen_random_uuid(), $1, $2, 'en_attente', '[]', 1, now(), '{}', 1, 1, 1000, 700)`,
          [c.id, c.numero],
        ),
      ).toMatch(/mission_livraison_une_ouverte/);
    });

    it("l'index unique partiel : une seule demande ouverte par personne, par SQL direct aussi", async () => {
      const p = await personne();
      await new DemandesLivreurPrisma(prisma, chiffrement).ajouter(uneDemandeLivreur(p));
      expect(
        await erreurSql(
          `INSERT INTO demande_livreur (dossier, "personneId", numero, ville, deplacement, zone, heures,
             "chargeMax", "momoTelephoneChiffre", "momoOperateur", "deposeeA", etat)
           VALUES ($1, $2, 1, 'Bafoussam', 'pied', 'z', 'h', 'c', 'x', 'mtn', now(), 'recue')`,
          [`L-DIRECT-${randomUUID()}`, p],
        ),
      ).toMatch(/demande_livreur_une_ouverte/);
    });

    it("une mission se rattache à un colis et à un livreur qui existent, et reste cohérente", async () => {
      const c = await colis();
      const insere = (colisId: string, etat: string, livreurId: string | null, gain = 700) =>
        erreurSql(
          `INSERT INTO mission_livraison (id, "colisId", "colisNumero", etat, "livreurId", essais, tour,
             "creeA", trajet, "distanceM", "dureeMinutes", "prixLivraison", gain)
           VALUES (gen_random_uuid(), $1, 'n', $2, $3, '[]', 1, now(), '{}', 1, 1, 1000, $4)`,
          [colisId, etat, livreurId, gain],
        );
      expect(await insere(randomUUID(), "en_attente", null)).toMatch(
        /mission_livraison_colis_fkey/,
      );
      expect(await insere(c.id, "proposee", randomUUID())).toMatch(
        /mission_livraison_livreurId_fkey/,
      );
      expect(await insere(c.id, "proposee", null)).toMatch(/mission_livraison_livreur_nomme/);
      expect(await insere(c.id, "en_attente", null, 1500)).toMatch(/mission_livraison_quantites/);
      expect(await insere(c.id, "perdue", null)).toMatch(/mission_livraison_etat_connu/);
    });

    it("un livreur a un déplacement et un opérateur connus, et ne se supprime pas s'il a des missions", async () => {
      const livreurs = new LivreursPrisma(prisma, chiffrement);
      const l = unLivreur(await personne());
      await livreurs.ajouter(l);
      expect(
        await erreurSql(`UPDATE livreur SET deplacement = 'fusee' WHERE id = $1`, [l.id]),
      ).toMatch(/livreur_deplacement_connu/);
      expect(
        await erreurSql(`UPDATE livreur SET "momoOperateur" = 'moov' WHERE id = $1`, [l.id]),
      ).toMatch(/livreur_operateur_connu/);
      await new MissionsPrisma(prisma).ajouter(
        uneMission(await colis(), { etat: "acceptee", livreurId: l.id }),
      );
      expect(await erreurSql(`DELETE FROM livreur WHERE id = $1`, [l.id])).toMatch(
        /mission_livraison_livreurId_fkey/,
      );
    });

    it("les invitations sont en ajout seul", async () => {
      const livreurs = new LivreursPrisma(prisma, chiffrement);
      const l = unLivreur(await personne());
      await livreurs.ajouter(l);
      await new InvitationsPrisma(prisma).ajouter({
        livreurId: l.id,
        at: "2027-01-05T09:00:00.000+01:00",
      });
      expect(
        await erreurSql(`UPDATE invitation_livreur SET at = now() WHERE "livreurId" = $1`, [l.id]),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM invitation_livreur WHERE "livreurId" = $1`, [l.id]),
      ).not.toBe("");
      expect(await erreurSql(`TRUNCATE invitation_livreur`)).not.toBe("");
    });

    it("un lien de suivi se rattache à un colis qui existe et a une validité positive", async () => {
      const c = await colis();
      expect(
        await erreurSql(
          `INSERT INTO partage_suivi ("jetonHache", "colisId", "creeA", "expireA") VALUES ('h1', $1, now(), now() - interval '1 hour')`,
          [c.id],
        ),
      ).toMatch(/partage_suivi_validite/);
      expect(
        await erreurSql(
          `INSERT INTO partage_suivi ("jetonHache", "colisId", "creeA", "expireA") VALUES ('h2', $1, now(), now() + interval '1 hour')`,
          [randomUUID()],
        ),
      ).toMatch(/partage_suivi_colis_fkey/);
    });
  });
});
