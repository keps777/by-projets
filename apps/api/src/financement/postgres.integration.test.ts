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
  ConventionsMemoire,
  DossiersMemoire,
  LotsPaieMemoire,
  OffresCreditMemoire,
  PrelevementsMemoire,
  ReglagesMemoire,
} from "./memoire";
import {
  ConventionsPrisma,
  DossiersPrisma,
  LotsPaiePrisma,
  OffresCreditPrisma,
  PrelevementsPrisma,
  ReglagesPrisma,
} from "./postgres";
import {
  T0,
  contratPortsFinancement,
  uneLignePaie,
  unDossier,
  unLot,
  verse,
  type BancFinancement,
} from "./testing/contrat-ports";

/**
 * Adaptateurs PostgreSQL du financement : le même contrat sur la mémoire (toujours) et sur PostgreSQL
 * (avec DATABASE_URL_TEST), puis ce que seule la base garantit.
 */

contratPortsFinancement("contrat · financement en mémoire", async () => {
  const conventions = new ConventionsMemoire();
  const offres = new OffresCreditMemoire();
  return {
    dossiers: new DossiersMemoire(),
    prelevements: new PrelevementsMemoire(),
    lots: new LotsPaieMemoire(),
    reglages: new ReglagesMemoire(),
    conventions,
    offres,
    personne: async () => randomUUID(),
    compagnie: async () => randomUUID(),
    poserConvention: async (agenceId, c) => {
      conventions.conventions.set(agenceId, c);
    },
    poserOffre: async (agenceId, o) => {
      offres.offres.set(agenceId, o);
    },
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · financement", () => {
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
    (await fx.personne({ roles: ["patron"], compagnieId: null, gareId: null })).id;
  const compagnie = async (): Promise<string> => (await fx.compagnie()).id;

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

  contratPortsFinancement("contrat · financement PostgreSQL", async () => {
    return {
      dossiers: new DossiersPrisma(prisma),
      prelevements: new PrelevementsPrisma(prisma),
      lots: new LotsPaiePrisma(prisma, chiffrement),
      reglages: new ReglagesPrisma(prisma),
      conventions: new ConventionsPrisma(prisma),
      offres: new OffresCreditPrisma(prisma),
      personne,
      compagnie,
      poserConvention: async (agenceId, c) => {
        await prisma.conventionFinancement.create({
          data: {
            agenceId,
            partenaire: c.partenaire,
            signeeA: c.signeeA === null ? null : new Date(c.signeeA),
          },
        });
      },
      poserOffre: async (agenceId, o) => {
        await prisma.offreCreditMateriel.create({ data: { agenceId, ...o } });
      },
      fermer: async () => undefined,
    } satisfies BancFinancement;
  });

  describe("ce que la base garantit seule", () => {
    const dossierVerse = async () => {
      const agenceId = await compagnie();
      const patronId = await personne();
      const dossier = unDossier(agenceId, patronId, verse());
      await new DossiersPrisma(prisma).ajouter(dossier);
      return { agenceId, patronId, dossier };
    };

    it("aucun numéro MoMo de salarié n'est en clair", async () => {
      const lots = new LotsPaiePrisma(prisma, chiffrement);
      const agenceId = await compagnie();
      const lot = unLot(agenceId, await personne(), [
        uneLignePaie(await personne(), { telephone: "+237655443322" }),
        uneLignePaie(await personne(), { operateur: "orange", telephone: "+237699887766" }),
      ]);
      await lots.creer(lot);
      const { rows } = await sql.query(
        `SELECT "telephoneChiffre" AS v FROM ligne_paie WHERE "lotId" = $1`,
        [lot.id],
      );
      expect(rows).toHaveLength(2);
      for (const ligne of rows) {
        expect(String(ligne.v)).not.toContain("655443322");
        expect(String(ligne.v)).not.toContain("699887766");
      }
      // Le contexte est lié au chiffrement : le même texte ne se lit pas dans un autre contexte.
      expect(() => chiffrement.dechiffrer(String(rows[0].v), "autre.contexte")).toThrow();
    });

    it("l'index unique partiel : une avance ouverte par agence, même par SQL direct", async () => {
      const { agenceId, patronId, dossier } = await dossierVerse();
      const insere = (id: string, statut: string, actif: boolean) =>
        erreurSql(
          `INSERT INTO dossier_financement (id, "agenceId", "demandePar", montant, statut, conditions,
             "envoyeA", "reponseAvant", pieces, "mandatPourcentage", "mandatSigneA", "mandatSignePar",
             "mandatCompteMarchandId", "mandatOperateur", "mandatActif")
           VALUES ($1, $2, $3, 100000, $4, '{}', now(), now(), '[]', 8, now(), $3, 'marchand', 'mtn', $5)`,
          [id, agenceId, patronId, statut, actif],
        );
      expect(await insere("AV-2027-8001", "en_analyse", true)).toMatch(
        /dossier_financement_une_ouverte/,
      );
      expect(await insere("AV-2027-8002", "verse", true)).toMatch(
        /dossier_financement_une_ouverte/,
      );
      // Fermés (refusé, retiré, versé et soldé), les dossiers s'accumulent : seule la place compte.
      expect(await insere("AV-2027-8003", "refuse", true)).toBe("");
      expect(await insere("AV-2027-8004", "retire", false)).toBe("");
      expect(await insere("AV-2027-8005", "verse", false)).toBe("");
      expect(await insere(dossier.id, "refuse", false)).toMatch(/dossier_financement_pkey/);
    });

    it("les valeurs sont fermées et les montants bornés", async () => {
      const { dossier } = await dossierVerse();
      const maj = (colonne: string, valeur: string) =>
        erreurSql(`UPDATE dossier_financement SET ${colonne} = ${valeur} WHERE id = $1`, [
          dossier.id,
        ]);
      expect(await maj("statut", "'accorde'")).toMatch(/dossier_financement_statut_connu/);
      expect(await maj('"mandatOperateur"', "'moov'")).toMatch(
        /dossier_financement_operateur_connu/,
      );
      expect(await maj("montant", "0")).toMatch(/dossier_financement_quantites/);
      expect(await maj('"mandatPourcentage"', "101")).toMatch(/dossier_financement_quantites/);
      expect(await maj('"resteDu"', "-1")).toMatch(/dossier_financement_quantites/);
      expect(await maj("id", "'AVANCE-1'")).toMatch(/dossier_financement_numero/);
      expect(await maj('"agenceId"', `'${randomUUID()}'`)).toMatch(
        /dossier_financement_compagnie_fkey/,
      );
    });

    it("un dossier ne se supprime pas, et la référence du partenaire est unique", async () => {
      const { dossier } = await dossierVerse();
      expect(
        await erreurSql(`DELETE FROM dossier_financement WHERE id = $1`, [dossier.id]),
      ).not.toBe("");
      expect(await erreurSql(`TRUNCATE dossier_financement CASCADE`)).not.toBe("");
      const autre = unDossier(await compagnie(), await personne(), {
        statut: "refuse",
        referencePartenaire: dossier.referencePartenaire,
      });
      await expect(new DossiersPrisma(prisma).ajouter(autre)).rejects.toThrow();
    });

    it("un prélèvement exécuté est de l'argent parti : il ne se modifie ni ne se supprime", async () => {
      const { agenceId, dossier } = await dossierVerse();
      const prelevements = new PrelevementsPrisma(prisma);
      const reserve = async (venteId: string, montant: number) =>
        prelevements.reserver({
          cle: `prelevement:${venteId}`,
          dossierId: dossier.id,
          agenceId,
          venteId,
          montantVente: montant * 12,
          souhaite: montant,
          totalDu: 6_480_000,
          at: T0,
        });
      await reserve("v1", 500);
      await reserve("v2", 300);
      await prelevements.confirmer("prelevement:v1", "PREL-1");
      expect(
        await erreurSql(`DELETE FROM prelevement_avance WHERE cle = 'prelevement:v1'`),
      ).toMatch(/ne se supprime pas/);
      expect(
        await erreurSql(`UPDATE prelevement_avance SET montant = 1 WHERE cle = 'prelevement:v1'`),
      ).toMatch(/ne se modifie pas/);
      // Une réservation en attente peut disparaître (refus définitif du partenaire).
      expect(await erreurSql(`DELETE FROM prelevement_avance WHERE cle = 'prelevement:v2'`)).toBe(
        "",
      );
      // Une vente ne se prélève qu'une fois : même sous une autre clé.
      expect(
        await erreurSql(
          `INSERT INTO prelevement_avance (cle, "dossierId", "agenceId", "venteId", "montantVente", montant, at, etat)
           VALUES ('autre-cle', $1, $2, 'v1', 6000, 500, now(), 'en_attente')`,
          [dossier.id, agenceId],
        ),
      ).toMatch(/prelevement_avance_venteId_key/);
      expect(
        await erreurSql(
          `INSERT INTO prelevement_avance (cle, "dossierId", "agenceId", "venteId", "montantVente", montant, at, etat)
           VALUES ('zero', $1, $2, 'v3', 6000, 0, now(), 'en_attente')`,
          [dossier.id, agenceId],
        ),
      ).toMatch(/prelevement_avance_montants/);
      expect(
        await erreurSql(
          `INSERT INTO prelevement_avance (cle, "dossierId", "agenceId", "venteId", "montantVente", montant, at, etat)
           VALUES ('sans-ref', $1, $2, 'v4', 6000, 500, now(), 'execute')`,
          [dossier.id, agenceId],
        ),
      ).toMatch(/prelevement_avance_reference_si_execute/);
      expect(
        await erreurSql(
          `INSERT INTO prelevement_avance (cle, "dossierId", "agenceId", "venteId", "montantVente", montant, at, etat)
           VALUES ('orphelin', 'AV-2027-0000', $1, 'v5', 6000, 500, now(), 'en_attente')`,
          [agenceId],
        ),
      ).toMatch(/prelevement_avance_dossierId_fkey/);
    });

    it("la paie : un lot par agence et par mois, des lignes qui ont un sens, rien ne se supprime", async () => {
      const lots = new LotsPaiePrisma(prisma, chiffrement);
      const agenceId = await compagnie();
      const patronId = await personne();
      const p = await personne();
      const lot = unLot(agenceId, patronId, [uneLignePaie(p)]);
      await lots.creer(lot);
      const insereLot = (mois: string, id = randomUUID()) =>
        erreurSql(
          `INSERT INTO lot_paie (id, "agenceId", mois, "lancePar", "lanceA", total)
           VALUES ($1, $2, $3, $4, now(), 0)`,
          [id, agenceId, mois, patronId],
        );
      expect(await insereLot("2027-01")).toMatch(/lot_paie_agenceId_mois_key/);
      expect(await insereLot("2027-13")).toMatch(/lot_paie_mois_valide/);
      expect(await insereLot("27-01")).toMatch(/lot_paie_mois_valide/);
      expect(await insereLot("2027-02")).toBe("");

      const ligne = (set: string) =>
        erreurSql(`UPDATE ligne_paie SET ${set} WHERE "lotId" = $1`, [lot.id]);
      expect(await ligne(`etat = 'paye'`)).toMatch(/ligne_paie_etat_connu/);
      expect(await ligne(`operateur = 'moov'`)).toMatch(/ligne_paie_operateur_connu/);
      expect(await ligne(`montant = 0`)).toMatch(/ligne_paie_quantites/);
      expect(await ligne(`etat = 'verse'`)).toMatch(/ligne_paie_reference_si_verse/);
      expect(await ligne(`operateur = NULL`)).toMatch(/ligne_paie_compte_complet/);
      expect(await ligne(`etat = 'verse', reference = 'MOMO-1'`)).toBe("");

      expect(await erreurSql(`DELETE FROM ligne_paie WHERE "lotId" = $1`, [lot.id])).not.toBe("");
      expect(await erreurSql(`DELETE FROM lot_paie WHERE id = $1`, [lot.id])).not.toBe("");
      expect(await erreurSql(`TRUNCATE lot_paie CASCADE`)).not.toBe("");
      expect(
        await erreurSql(
          `INSERT INTO ligne_paie ("lotId", "personneId", rang, nom, montant, etat, tentative)
           VALUES ($1, $2, 5, 'x', 100, 'en_attente', 0)`,
          [lot.id, randomUUID()],
        ),
      ).toMatch(/ligne_paie_personne_fkey/);
    });

    it("les lots et les dossiers survivent à une nouvelle connexion (redémarrage)", async () => {
      const { agenceId, dossier } = await dossierVerse();
      const lot = unLot(agenceId, dossier.demandePar, [uneLignePaie(await personne())], {
        mois: "2027-05",
      });
      await new LotsPaiePrisma(prisma, chiffrement).creer(lot);
      const config = configTest({ DATABASE_URL: base.url });
      const autre = new PrismaService(config);
      try {
        const lu = await new DossiersPrisma(autre).trouver(agenceId, dossier.id);
        expect(lu).toEqual({ ...dossier, version: 1 });
        expect(
          await new LotsPaiePrisma(autre, new ChiffrementService(config)).trouver(
            agenceId,
            "2027-05",
          ),
        ).toEqual(lot);
      } finally {
        await autre.$disconnect();
      }
    });

    it("l'offre de crédit et la convention ont les bornes d'une offre", async () => {
      const agenceId = await compagnie();
      expect(
        await erreurSql(
          `INSERT INTO offre_credit_materiel ("agenceId", description, "montantTotal", mensualites, "montantMensualite")
           VALUES ($1, 'x', 100, 0, 10)`,
          [agenceId],
        ),
      ).toMatch(/offre_credit_materiel_quantites/);
      expect(
        await erreurSql(
          `INSERT INTO convention_financement ("agenceId", partenaire) VALUES ($1, 'Banque')`,
          [randomUUID()],
        ),
      ).toMatch(/convention_financement_compagnie_fkey/);
    });
  });
});
