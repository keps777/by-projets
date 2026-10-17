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
import { AvisMemoire, ColisMemoire, ProchesMemoire, PromotionsMemoire } from "./memoire";
import {
  AvisBilletsPrisma,
  ColisDuDepartPrisma,
  ProchesPrisma,
  PromotionsPrisma,
} from "./postgres-annexes";
import { contratAnnexesBilletterie, type BancAnnexes } from "./testing/contrat-annexes";

/**
 * Promotions, proches, colis du départ, avis : le même contrat sur la mémoire (toujours) et sur
 * PostgreSQL (avec DATABASE_URL_TEST), puis ce que seule la base garantit.
 */

contratAnnexesBilletterie("contrat · annexes en mémoire", async () => {
  const promotions = new PromotionsMemoire();
  const proches = new ProchesMemoire();
  const colis = new ColisMemoire();
  const avis = new AvisMemoire();
  const banc: BancAnnexes = {
    promotions,
    ajouterPromotion: async (p) => promotions.ajouter(p),
    retirerPromotion: async (code) => promotions.retirer(code),
    proches,
    nouveauVoyageur: async () => randomUUID(),
    ajouterProche: async (voyageurId, proche) => proches.ajouter(voyageurId, proche),
    colis,
    nouveauDepart: async () => randomUUID(),
    poserColis: async (departId, c) =>
      colis.definir(departId, {
        charges: (c.charges ?? 0) + (c.enRoute ?? 0),
        colisACharger: c.enregistres ?? 0,
      }),
    avis,
    lireAvis: async () => [...avis.publies],
    fermer: async () => undefined,
  };
  return banc;
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · billetterie, annexes", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let fx: FixturesPg;
  let chiffrement: ChiffrementService;

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  async function voyageur(): Promise<string> {
    return (await fx.personne({ roles: ["voyageur"] })).id;
  }

  async function departEnBase(): Promise<string> {
    const c = await fx.compagnie();
    const a = await fx.gare(c.id);
    const b = await fx.gare(c.id);
    const ligne = await fx.ligne(c.id, a.id, b.id);
    const d = await fx.depart(ligne.id);
    return d.id;
  }

  async function colisEnBase(
    departId: string,
    etat: "enregistre" | "charge" | "en_route" | "decharge" | "remis",
  ): Promise<void> {
    const depart = await prisma.depart.findUniqueOrThrow({
      where: { id: departId },
      include: { ligne: true },
    });
    const n = fx.prochain();
    await prisma.colis.create({
      data: {
        numero: `C-TST-270106-${n}-${randomUUID().slice(0, 4)}`,
        sequence: n,
        gareOrigineId: depart.ligne.origineGareId,
        gareDestinationId: depart.ligne.destinationGareId,
        departId,
        expediteurChiffre: "x",
        expediteurTelephoneIndex: randomUUID(),
        destinataireChiffre: "x",
        destinataireTelephoneIndex: randomUUID(),
        contenu: "Sac",
        poidsKg: 5,
        valeurDeclaree: 10_000,
        mode: "gare",
        canal: "agence",
        codeRetraitHache: "h",
        codeRetraitSel: "s",
        prixTotal: 3000,
        creeA: new Date("2027-01-05T08:00:00.000Z"),
        etat,
        jour: "270105",
      },
    });
  }

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

  contratAnnexesBilletterie("contrat · annexes PostgreSQL", async () => {
    const promotions = new PromotionsPrisma(prisma);
    const proches = new ProchesPrisma(prisma, chiffrement);
    const avis = new AvisBilletsPrisma(prisma);
    const banc: BancAnnexes = {
      promotions,
      ajouterPromotion: (p) => promotions.ajouter(p),
      retirerPromotion: (code) => promotions.retirer(code),
      proches,
      nouveauVoyageur: voyageur,
      ajouterProche: (voyageurId, proche) => proches.ajouter(voyageurId, proche),
      colis: new ColisDuDepartPrisma(prisma),
      nouveauDepart: departEnBase,
      poserColis: async (departId, c) => {
        const liste: [number | undefined, Parameters<typeof colisEnBase>[1]][] = [
          [c.enregistres, "enregistre"],
          [c.charges, "charge"],
          [c.enRoute, "en_route"],
          [c.decharges, "decharge"],
          [c.remis, "remis"],
        ];
        for (const [nombre, etat] of liste) {
          for (let i = 0; i < (nombre ?? 0); i++) await colisEnBase(departId, etat);
        }
      },
      avis,
      lireAvis: async () => {
        const lignes = await prisma.avisBilletterie.findMany({ orderBy: { id: "asc" } });
        return lignes.map((l) => l.avis as never);
      },
      fermer: async () => undefined,
    };
    return banc;
  });

  describe("ce que la base garantit seule", () => {
    it("les codes USSD et WHATSAPP existent dès la migration, sans frais", async () => {
      const promotions = new PromotionsPrisma(prisma);
      expect(await promotions.trouver("ussd")).toEqual({ code: "USSD", type: "frais_offerts" });
      expect(await promotions.trouver("WhatsApp")).toEqual({
        code: "WHATSAPP",
        type: "frais_offerts",
      });
    });

    it("un code mal formé ou d'un type inconnu est refusé par la base", async () => {
      expect(
        await erreurSql(`INSERT INTO promotion (code, type) VALUES ('minuscule', 'frais_offerts')`),
      ).toMatch(/promotion_code_normalise/);
      expect(
        await erreurSql(`INSERT INTO promotion (code, type) VALUES ('REMISE', 'pourcentage')`),
      ).toMatch(/promotion_type_connu/);
    });

    it("le téléphone d'un proche n'est jamais en clair", async () => {
      const proches = new ProchesPrisma(prisma, chiffrement);
      const v = await voyageur();
      const id = randomUUID();
      await proches.ajouter(v, { id, nom: "Maman Esther", telephone: "+237655123456" });
      const { rows } = await sql.query(
        `SELECT "telephoneChiffre" FROM proche_voyageur WHERE id = $1`,
        [id],
      );
      expect(rows[0].telephoneChiffre).toMatch(/^enc:v1:/);
      expect(rows[0].telephoneChiffre).not.toContain("655123456");
    });

    it("un proche ne se rattache qu'à un compte qui existe", async () => {
      expect(
        await erreurSql(
          `INSERT INTO proche_voyageur (id, "voyageurId", nom) VALUES ($1, $2, 'X')`,
          [randomUUID(), randomUUID()],
        ),
      ).toMatch(/proche_voyageur_voyageur_fkey/);
    });

    it("les avis sont en ajout seul : ni modifiés, ni effacés, ni vidés", async () => {
      const avis = new AvisBilletsPrisma(prisma);
      await avis.publier({
        type: "commande.expiree",
        commandeId: randomUUID(),
        voyageurId: randomUUID(),
      });
      expect(await erreurSql(`UPDATE avis_billetterie SET type = 'x'`)).not.toBe("");
      expect(await erreurSql(`DELETE FROM avis_billetterie`)).not.toBe("");
      expect(await erreurSql(`TRUNCATE avis_billetterie`)).not.toBe("");
    });

    it("les avis d'un billet se retrouvent par leur cible", async () => {
      const avis = new AvisBilletsPrisma(prisma);
      const billetId = randomUUID();
      await avis.publier({
        type: "billet.embarque",
        billetId,
        numero: "ALP-1",
        departId: randomUUID(),
        at: "2027-01-06T13:50:00.000+01:00",
      });
      const trouves = await avis.deLaCible(billetId);
      expect(trouves).toHaveLength(1);
      expect(trouves[0]?.type).toBe("billet.embarque");
    });

    it("un avis qui ne peut pas être écrit ne fait pas échouer l'appelant", async () => {
      const casse = new AvisBilletsPrisma({
        avisBilletterie: {
          create: async () => {
            throw new Error("base indisponible");
          },
        },
      } as unknown as PrismaService);
      await expect(
        casse.publier({
          type: "commande.expiree",
          commandeId: randomUUID(),
          voyageurId: randomUUID(),
        }),
      ).resolves.toBeUndefined();
    });
  });
});
