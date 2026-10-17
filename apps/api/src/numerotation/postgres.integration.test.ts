import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../socle/app.module";
import { METHODE_PAR_ROLE, type Role } from "../socle/auth/roles";
import { TokensService } from "../socle/auth/tokens.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import { CONFIG } from "../socle/config/config";
import { configurerApp } from "../socle/configurer-app";
import { PrismaService } from "../socle/db/prisma.service";
import { VARIABLE_STOCKAGE } from "../socle/db/stockage";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { HorlogeFixe } from "../socle/testing/memoire";
import { ControleNumeros, AttributionPlages } from "../sync/ports";
import { AttributionPlagesServeur, ControleNumerosServeur } from "./adaptateurs";
import { ControleJourneeService } from "./controle-journee.service";
import { PlageChevauchante, PlageInvalide } from "./erreurs";
import {
  AlertesNumerotationMemoire,
  PlagesAttribueesMemoire,
  RegistreNumerosMemoire,
} from "./memoire";
import { NumerotationService } from "./numerotation.service";
import { PlagesService } from "./plages.service";
import {
  AlertesNumerotationPrisma,
  PlagesAttribueesPrisma,
  RegistreNumerosPrisma,
} from "./postgres";
import { PlagesAttribuees } from "./ports";
import { contratPortsNumerotation, type BancNumerotation } from "./testing/contrat-ports";

/**
 * Adaptateurs de la numérotation : les mêmes tests de contrat sur la mémoire (toujours) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (contrainte
 * d'exclusion, ajout seul, atomicité), le service complet sur PostgreSQL et l'API de bout en bout.
 */

// Les adaptateurs en mémoire passent le même contrat : c'est ce qui prouve que la mémoire (sur
// laquelle tournent tous les autres tests) se comporte comme la base.
contratPortsNumerotation("contrat · adaptateurs en mémoire", async () => ({
  plages: new PlagesAttribueesMemoire(),
  registre: new RegistreNumerosMemoire(),
  alertes: new AlertesNumerotationMemoire(),
  nouvelleGare: async () => ({ gareId: randomUUID(), compagnieId: randomUUID() }),
  fermer: async () => undefined,
}));

const JOUR = "270105";

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · numérotation", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let banc: BancNumerotation;

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  let compteurCodes = 0;
  /** Code de compagnie à 3 lettres, unique dans le fichier. */
  const code3 = (): string => {
    compteurCodes += 1;
    const n = compteurCodes;
    return [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26]
      .map((x) => String.fromCharCode(65 + x))
      .join("");
  };

  async function nouvelleGare() {
    const compagnie = await prisma.compagnie.create({
      data: { code: code3(), nom: "Agence test" },
    });
    const gare = await prisma.gare.create({
      data: { compagnieId: compagnie.id, code: "DLA", nom: "Akwa", ville: "Douala" },
    });
    return { gareId: gare.id, compagnieId: compagnie.id };
  }

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
    banc = {
      plages: new PlagesAttribueesPrisma(prisma),
      registre: new RegistreNumerosPrisma(prisma),
      alertes: new AlertesNumerotationPrisma(prisma),
      nouvelleGare,
      fermer: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Les tests de contrat s'exécutent ici, sur la base préparée plus haut.
  contratPortsNumerotation("contrat · adaptateurs PostgreSQL", async () => banc);

  describe("ce que la base garantit seule", () => {
    it("la contrainte d'exclusion refuse deux plages qui se recouvrent dans une gare, même écrites en SQL", async () => {
      const { gareId, compagnieId } = await nouvelleGare();
      const portee = `gare:${compagnieId}:${gareId}`;
      const inserer = (appareil: string, debut: number, fin: number, p = portee) =>
        erreurSql(
          `INSERT INTO plage_attribuee ("appareilId", genre, "plageDebut", "plageFin", portee, "attribueeA")
           VALUES ($1, 'guichet', $2, $3, $4, now())`,
          [appareil, debut, fin, p],
        );
      expect(await inserer("a", 1, 999)).toBe("");
      expect(await inserer("b", 999, 1500)).toMatch(/plage_attribuee_sans_chevauchement/);
      expect(await inserer("b", 1000, 1500)).toBe("");
      // Une autre portée n'est pas concernée.
      expect(await inserer("c", 1, 999, `gare:${compagnieId}:autre`)).toBe("");
      // Une plage libérée ne compte plus.
      await sql.query(`UPDATE plage_attribuee SET "libereeA" = now() WHERE "appareilId" = 'a'`);
      expect(await inserer("d", 1, 500)).toBe("");
    });

    it("refuse une plage au-delà de 4000 (réservée au serveur) et une plage inversée", async () => {
      const insert = (debut: number, fin: number) =>
        erreurSql(
          `INSERT INTO plage_attribuee ("appareilId", genre, "plageDebut", "plageFin", portee, "attribueeA")
           VALUES ($1, 'guichet', $2, $3, 'appareil:x', now())`,
          [`z-${debut}-${fin}`, debut, fin],
        );
      expect(await insert(3500, 4001)).toMatch(/plage_attribuee_fin/);
      expect(await insert(900, 100)).toMatch(/plage_attribuee_fin/);
      expect(await insert(0, 100)).toMatch(/plage_attribuee_debut/);
    });

    it("n'accepte qu'une attribution en cours par appareil", async () => {
      const ecrire = () =>
        erreurSql(
          `INSERT INTO plage_attribuee ("appareilId", genre, "plageDebut", "plageFin", portee, "attribueeA")
           VALUES ('unique-1', 'guichet', 1, 10, $1, now())`,
          [`appareil:${randomUUID()}`],
        );
      expect(await ecrire()).toBe("");
      expect(await ecrire()).toMatch(/plage_attribuee_appareil_en_cours/);
    });

    it("le registre des numéros est en ajout seul : un numéro pris reste pris", async () => {
      const gare = await nouvelleGare();
      const portee = `gare:${gare.compagnieId}:${gare.gareId}`;
      await sql.query(
        `INSERT INTO numero_vu (portee, jour, genre, numero, "appareilId", "evenementId", "recuA")
         VALUES ($1, $2, 'billet', 12, 'tel', 'e1', now())`,
        [portee, JOUR],
      );
      expect(
        await erreurSql(`UPDATE numero_vu SET numero = 13 WHERE portee = $1`, [portee]),
      ).toMatch(/ajout seul/);
      expect(await erreurSql(`DELETE FROM numero_vu WHERE portee = $1`, [portee])).toMatch(
        /ajout seul/,
      );
      expect(await erreurSql(`TRUNCATE numero_vu`)).toMatch(/ajout seul/);
    });

    it("le registre refuse un numéro non imprimable, un genre inconnu et un jour mal formé", async () => {
      const inserer = (numero: number, genre: string, jour: string) =>
        erreurSql(
          `INSERT INTO numero_vu (portee, jour, genre, numero, "appareilId", "evenementId", "recuA")
           VALUES ('p', $1, $2, $3, 'tel', 'e', now())`,
          [jour, genre, numero],
        );
      expect(await inserer(0, "billet", JOUR)).toMatch(/numero_vu_numero_imprimable/);
      expect(await inserer(10000, "billet", JOUR)).toMatch(/numero_vu_numero_imprimable/);
      expect(await inserer(5, "ticket", JOUR)).toMatch(/numero_vu_genre_connu/);
      expect(await inserer(5, "billet", "27015x")).toMatch(/numero_vu_jour_aammjj/);
    });

    it("une même référence ne reçoit jamais deux numéros du serveur, même par deux écritures directes", async () => {
      const portee = `gare:${randomUUID()}:${randomUUID()}`;
      const inserer = (numero: number) =>
        erreurSql(
          `INSERT INTO numero_vu (portee, jour, genre, numero, "appareilId", "evenementId", "recuA")
           VALUES ($1, $2, 'billet', $3, 'serveur-en-ligne', 'billet-1', now())`,
          [portee, JOUR, numero],
        );
      expect(await inserer(4001)).toBe("");
      expect(await inserer(4002)).toMatch(/numero_vu_reference_serveur/);
    });

    it("une attribution remplacée garde sa ligne, libérée ; la nouvelle est la seule en cours", async () => {
      const gare = await nouvelleGare();
      const un = { debut: 1, fin: 999 };
      const deux = { debut: 1001, fin: 1999 };
      const modele = {
        appareilId: "tel-remplace",
        genre: "guichet" as const,
        rang: 1,
        nbConvoyeurs: null,
        gareId: gare.gareId,
        compagnieId: gare.compagnieId,
        titulaire: null,
        attribueePar: null,
        libereeA: null,
      };
      await banc.plages.attribuer({
        ...modele,
        plage: un,
        attribueeA: "2027-01-05T08:00:00.000+01:00",
      });
      await banc.plages.attribuer({
        ...modele,
        plage: deux,
        attribueeA: "2027-01-05T09:00:00.000+01:00",
      });
      const { rows } = await sql.query(
        `SELECT "plageDebut", "libereeA" IS NULL AS en_cours FROM plage_attribuee
         WHERE "appareilId" = 'tel-remplace' ORDER BY id`,
      );
      expect(rows).toEqual([
        { plageDebut: 1, en_cours: false },
        { plageDebut: 1001, en_cours: true },
      ]);
      // Rejouer la même demande ne crée pas de ligne de plus.
      await banc.plages.attribuer({
        ...modele,
        plage: deux,
        attribueeA: "2027-01-05T10:00:00.000+01:00",
      });
      const { rows: apres } = await sql.query(
        `SELECT count(*)::int AS n FROM plage_attribuee WHERE "appareilId" = 'tel-remplace'`,
      );
      expect(apres[0].n).toBe(2);
    });

    it("une gare inconnue ou un identifiant mal formé sont des demandes invalides, pas des erreurs serveur", async () => {
      const modele = {
        appareilId: "tel-invalide",
        genre: "guichet" as const,
        rang: 1,
        nbConvoyeurs: null,
        plage: { debut: 1, fin: 999 },
        titulaire: null,
        attribueeA: "2027-01-05T08:00:00.000+01:00",
        attribueePar: null,
        libereeA: null,
      };
      await expect(
        banc.plages.attribuer({ ...modele, gareId: randomUUID(), compagnieId: null }),
      ).rejects.toBeInstanceOf(PlageInvalide);
      await expect(
        banc.plages.attribuer({ ...modele, gareId: "pas-un-uuid", compagnieId: null }),
      ).rejects.toBeInstanceOf(PlageInvalide);
      expect(await banc.plages.trouver("tel-invalide")).toBeNull();
    });
  });

  describe("la numérotation complète sur PostgreSQL", () => {
    function monter() {
      const horloge = new HorlogeFixe(new Date("2027-01-05T20:00:00.000Z"));
      const plagesStock = new PlagesAttribueesPrisma(prisma);
      const registre = new RegistreNumerosPrisma(prisma);
      const alertesStock = new AlertesNumerotationPrisma(prisma);
      const plages = new PlagesService(plagesStock, horloge);
      const numerotation = new NumerotationService(plagesStock, registre, horloge);
      return {
        horloge,
        plages,
        numerotation,
        controle: new ControleJourneeService(plagesStock, registre, alertesStock, horloge),
        controleNumeros: new ControleNumerosServeur(numerotation, registre, plagesStock),
        attribution: new AttributionPlagesServeur(plagesStock),
      };
    }

    const vendre = async (
      m: ReturnType<typeof monter>,
      appareilId: string,
      numeros: number[],
      genre: "billet" | "colis" = "billet",
    ) => {
      const anomalies = [];
      for (const numeroPlage of numeros) {
        anomalies.push(
          ...(await m.controleNumeros.enregistrer({
            appareilId,
            jour: JOUR,
            genre,
            numeroPlage,
            evenementId: randomUUID(),
            plage: null,
          })),
        );
      }
      return anomalies;
    };

    async function gareAvecDeuxGuichets() {
      const gare = await nouvelleGare();
      const m = monter();
      for (const [appareilId, rang, titulaire] of [
        ["g2", 2, { id: "p-marie", nom: "Marie Ngono" }],
        ["g3", 3, { id: "p-paul", nom: "Paul Essomba" }],
      ] as const) {
        await m.plages.attribuer({
          appareilId: `${appareilId}-${gare.gareId}`,
          genre: "guichet",
          rang,
          ...gare,
          titulaire,
        });
      }
      return { m, gare, g2: `g2-${gare.gareId}`, g3: `g3-${gare.gareId}` };
    }

    it("l'attribution suit le plan : guichet 2 = 1001–1999, et deux guichets ne se recouvrent pas", async () => {
      const { m, gare, g2 } = await gareAvecDeuxGuichets();
      expect((await m.plages.de(g2))?.plage).toEqual({ debut: 1001, fin: 1999 });
      await expect(
        m.plages.attribuer({
          appareilId: "renfort",
          genre: "guichet",
          plage: { debut: 1500, fin: 2500 },
          ...gare,
        }),
      ).rejects.toBeInstanceOf(PlageChevauchante);
      await expect(
        m.plages.attribuer({
          appareilId: "serveur-voulu",
          genre: "guichet",
          plage: { debut: 3900, fin: 4100 },
          ...gare,
        }),
      ).rejects.toBeInstanceOf(PlageInvalide);
    });

    it("la plage rendue à la synchronisation est celle de l'attribution", async () => {
      const { m, g2 } = await gareAvecDeuxGuichets();
      const plage = await m.attribution.plageDe({
        id: g2,
        cle: null,
        genre: "guichet",
        rang: 1,
        nbConvoyeurs: null,
        plage: null,
        gareId: null,
        compagnieId: null,
        derniereSyncA: null,
        dernierOrdre: 0,
        octroi: null,
        retire: false,
      });
      expect(plage).toEqual({ debut: 1001, fin: 1999 });
    });

    it("deux guichets de la même gare qui sortent le même numéro : doublon, hors plage, rien n'est perdu", async () => {
      const { m, g2, g3 } = await gareAvecDeuxGuichets();
      expect(await vendre(m, g2, [1001, 1002])).toEqual([]);
      // 1002 est déjà au registre (guichet 2) et n'est pas dans la plage du guichet 3 ; 1500 est
      // hors plage ; 2001 est un numéro normal.
      const anomalies = await vendre(m, g3, [1002, 1500, 2001]);
      expect(anomalies.map((a) => `${a.type}:${a.numeroPlage}`)).toEqual([
        "numero_en_double:1002",
        "numero_hors_plage:1002",
        "numero_hors_plage:1500",
      ]);
      // Le numéro hors plage entre au registre (la vente est imprimée) ; le doublon n'y entre pas.
      const compteur = await m.numerotation.resume(g3, JOUR);
      expect(compteur.billets.horsPlage).toEqual([1500]);
      expect(compteur.billets.emis).toBe(1);
    });

    it("un trou déclenche une alerte nominative, rejouable, refermée quand le billet arrive", async () => {
      const { m, gare, g2, g3 } = await gareAvecDeuxGuichets();
      await vendre(m, g2, [1001, 1002, 1005, 1006, 1009]);
      await vendre(m, g3, [2001, 2002]);
      const [alerte, ...autres] = await m.controle.controler(JOUR, { gareId: gare.gareId });
      expect(autres).toHaveLength(0);
      expect(alerte).toMatchObject({
        type: "trou_dans_la_plage",
        appareilId: g2,
        auteurId: "p-marie",
        gareId: gare.gareId,
        compagnieId: gare.compagnieId,
        resolueA: null,
        creeeA: "2027-01-05T21:00:00.000+01:00",
      });
      expect(alerte!.details).toMatchObject({
        numerosManquants: [1003, 1004, 1007, 1008],
        dernierRecu: 1009,
        titulaire: { id: "p-marie", nom: "Marie Ngono" },
      });

      // Relancer : une seule alerte, même date de création.
      m.horloge.avancer(60 * 60_000);
      const relance = await m.controle.controler(JOUR, { gareId: gare.gareId });
      expect(relance).toHaveLength(1);
      expect(relance[0]!.creeeA).toBe(alerte!.creeeA);

      // Les billets manquants arrivent en retard : l'alerte se referme.
      await vendre(m, g2, [1003, 1004, 1007, 1008]);
      expect(await m.controle.controler(JOUR, { gareId: gare.gareId })).toEqual([]);
      const toutes = await prisma.alerteSync.findMany({ where: { gareId: gare.gareId } });
      expect(toutes).toHaveLength(1);
      expect(toutes[0]?.resolueA).not.toBeNull();
    });

    it("numéros en ligne : le compteur du jour suit Douala, une référence rejouée rend le même numéro", async () => {
      const gare = await nouvelleGare();
      const m = monter();
      const demande = (reference: string, at: string) => ({
        gareId: gare.gareId,
        compagnieId: gare.compagnieId,
        genre: "billet" as const,
        at,
        reference,
      });
      const a = await m.numerotation.prendreEnLigne(demande("b-1", "2027-01-05T10:00:00.000Z"));
      const b = await m.numerotation.prendreEnLigne(demande("b-2", "2027-01-05T10:01:00.000Z"));
      const rejeu = await m.numerotation.prendreEnLigne(demande("b-1", "2027-01-05T10:05:00.000Z"));
      expect([a.numero, b.numero]).toEqual([4001, 4002]);
      expect(rejeu).toMatchObject({ numero: 4001, nouveau: false, jour: "270105" });
      // 23 h 30 UTC = minuit 30 à Douala : le lendemain, la numérotation repart de 4001.
      const lendemain = await m.numerotation.prendreEnLigne(
        demande("b-3", "2027-01-05T23:30:00.000Z"),
      );
      expect(lendemain).toMatchObject({ numero: 4001, jour: "270106" });
    });
  });

  describe("API de bout en bout, stockage PostgreSQL", () => {
    const MOT_DE_PASSE = "Un-mot-de-passe-solide";
    let stockageAvant: string | undefined;
    let app: NestExpressApplication | null = null;
    let gare: { gareId: string; compagnieId: string };

    async function demarrer(): Promise<NestExpressApplication> {
      const config = configTest({ DATABASE_URL: base.url });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(config)
        .compile();
      const a = module.createNestApplication<NestExpressApplication>();
      configurerApp(a, config);
      await a.init();
      return a;
    }

    async function jeton(
      role: Role,
      telephone: string,
      surcharge: { compagnieId: string; gareId: string },
    ) {
      const comptes = app!.get(ComptesService);
      const methodeMotDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
      const personne = await comptes.creer({
        nom: `Test ${role}`,
        telephone,
        roles: [role],
        compagnieId: surcharge.compagnieId,
        gareId: surcharge.gareId,
        pin: "482915",
        ...(methodeMotDePasse ? { motDePasse: MOT_DE_PASSE } : {}),
      });
      const { accessToken } = await app!.get(TokensService).emettre({
        sub: personne.id,
        role,
        cid: personne.compagnieId,
        gid: personne.gareId,
      });
      return accessToken;
    }

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      gare = await nouvelleGare();
      app = await demarrer();
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise les adaptateurs PostgreSQL quand API_STOCKAGE=postgres", () => {
      expect(app!.get(PlagesAttribuees)).toBeInstanceOf(PlagesAttribueesPrisma);
      expect(app!.get(ControleNumeros)).toBeInstanceOf(ControleNumerosServeur);
      expect((app!.get(ControleNumeros) as ControleNumerosServeur).durable).toBe(true);
      expect(app!.get(AttributionPlages)).toBeInstanceOf(AttributionPlagesServeur);
    });

    it("le superviseur attribue des plages, un chevauchement répond 409, et tout survit à un redémarrage", async () => {
      const superviseur = await jeton("superviseur", "+237655200001", gare);
      const http = () => request(app!.getHttpServer());

      const premiere = await http()
        .put("/numerotation/appareils/tel-api-1/plage")
        .set("Authorization", `Bearer ${superviseur}`)
        .send({ genre: "guichet", rang: 1, titulaire: { id: "p-1", nom: "Aïcha Ngono" } });
      expect(premiere.status).toBe(200);
      expect(premiere.body).toMatchObject({
        appareilId: "tel-api-1",
        plage: { debut: 1, fin: 999 },
      });

      const chevauche = await http()
        .put("/numerotation/appareils/tel-api-2/plage")
        .set("Authorization", `Bearer ${superviseur}`)
        .send({ genre: "guichet", plage: { debut: 500, fin: 1500 } });
      expect(chevauche.status).toBe(409);
      expect(JSON.stringify(chevauche.body)).toContain("tel-api-1");

      // Redémarrage de l'API : les plages sont en base, pas en mémoire.
      await app!.close();
      app = await demarrer();
      const apres = await request(app.getHttpServer())
        .get("/numerotation/appareils/tel-api-1/plage?jour=270105")
        .set("Authorization", `Bearer ${superviseur}`);
      expect(apres.status).toBe(200);
      expect(apres.body).toMatchObject({
        appareilId: "tel-api-1",
        plage: { debut: 1, fin: 999 },
        plageSansTrou: true,
        titulaire: { id: "p-1", nom: "Aïcha Ngono" },
      });
    });
  });
});
