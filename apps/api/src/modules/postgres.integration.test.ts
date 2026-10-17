import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../socle/app.module";
import { HachageService } from "../socle/auth/hachage.service";
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
import { AnnuaireMemoire, ReglagesMemoire } from "./memoire";
import type { ExceptionModule, ReglageModule } from "./portee";
import { AnnuaireAgencesPrisma, ReglagesModulesPrisma } from "./postgres";
import { AnnuaireAgences, ReglagesModules, type GareAnnuaire } from "./ports";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs du moteur des modules (AM-126) : les mêmes tests de contrat sur la mémoire (toujours)
 * et sur PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit et
 * l'API de bout en bout avec un redémarrage.
 */

interface BancModules {
  reglages: ReglagesModules;
  annuaire: AnnuaireAgences;
  /** Une agence neuve avec ses gares (Douala ×2, Yaoundé). */
  nouvelleAgence(): Promise<{ agenceId: string; gares: readonly GareAnnuaire[] }>;
}

const GARES = [
  { nom: "Douala Akwa", ville: "Douala", code: "AKW" },
  { nom: "Douala Bonanjo", ville: "Douala", code: "BON" },
  { nom: "Yaoundé Mvan", ville: "Yaoundé", code: "MVN" },
] as const;

/** Les exceptions n'ont pas d'ordre garanti : on compare des listes triées. */
function trier(exceptions: readonly ExceptionModule[]): ExceptionModule[] {
  const cle = (e: ExceptionModule) =>
    e.portee.type === "gare" ? `gare:${e.portee.id}` : `ville:${e.portee.nom}`;
  return [...exceptions].sort((a, b) => cle(a).localeCompare(cle(b)));
}

async function lireTrie(
  reglages: ReglagesModules,
  agenceId: string,
  code: string,
): Promise<ReglageModule | undefined> {
  const r = (await reglages.lire(agenceId)).get(code);
  return r === undefined ? undefined : { actif: r.actif, exceptions: trier(r.exceptions) };
}

function contratPortsModules(nom: string, monter: () => Promise<BancModules>): void {
  describe(nom, () => {
    let banc: BancModules;
    beforeAll(async () => {
      banc = await monter();
    }, 120_000);

    it("une agence qui n'a rien réglé n'a aucune ligne", async () => {
      const { agenceId } = await banc.nouvelleAgence();
      expect((await banc.reglages.lire(agenceId)).size).toBe(0);
    });

    it("la règle générale se pose, se relit et se remplace", async () => {
      const { agenceId } = await banc.nouvelleAgence();
      await banc.reglages.definirAgence(agenceId, "colis", false);
      expect(await lireTrie(banc.reglages, agenceId, "colis")).toEqual({
        actif: false,
        exceptions: [],
      });
      await banc.reglages.definirAgence(agenceId, "colis", true);
      expect(await lireTrie(banc.reglages, agenceId, "colis")).toEqual({
        actif: true,
        exceptions: [],
      });
      // Les autres modules n'ont pas bougé.
      expect([...(await banc.reglages.lire(agenceId)).keys()]).toEqual(["colis"]);
    });

    it("une exception de gare ou de ville s'ajoute, sans règle générale (actif : null)", async () => {
      const { agenceId, gares } = await banc.nouvelleAgence();
      const [akwa] = gares;
      await banc.reglages.poserException(agenceId, "relais", {
        portee: { type: "gare", id: akwa!.id },
        actif: false,
      });
      await banc.reglages.poserException(agenceId, "relais", {
        portee: { type: "ville", nom: "Yaoundé" },
        actif: true,
      });
      expect(await lireTrie(banc.reglages, agenceId, "relais")).toEqual({
        actif: null,
        exceptions: trier([
          { portee: { type: "gare", id: akwa!.id }, actif: false },
          { portee: { type: "ville", nom: "Yaoundé" }, actif: true },
        ]),
      });
    });

    it("poser deux fois la même exception la remplace : une seule ligne, la dernière valeur", async () => {
      const { agenceId, gares } = await banc.nouvelleAgence();
      const gare = gares[1]!;
      for (const actif of [false, true, false]) {
        await banc.reglages.poserException(agenceId, "ussd", {
          portee: { type: "gare", id: gare.id },
          actif,
        });
      }
      expect((await lireTrie(banc.reglages, agenceId, "ussd"))?.exceptions).toEqual([
        { portee: { type: "gare", id: gare.id }, actif: false },
      ]);
    });

    it("la ville se reconnaît sans accents ni casse ; l'écriture retenue est la dernière posée", async () => {
      const { agenceId } = await banc.nouvelleAgence();
      await banc.reglages.poserException(agenceId, "fidelite", {
        portee: { type: "ville", nom: "yaounde" },
        actif: true,
      });
      await banc.reglages.poserException(agenceId, "fidelite", {
        portee: { type: "ville", nom: "Yaoundé" },
        actif: false,
      });
      expect((await lireTrie(banc.reglages, agenceId, "fidelite"))?.exceptions).toEqual([
        { portee: { type: "ville", nom: "Yaoundé" }, actif: false },
      ]);
      // Retirer avec une autre écriture de la même ville retire la même exception.
      await banc.reglages.retirerException(agenceId, "fidelite", {
        type: "ville",
        nom: " YAOUNDE ",
      });
      expect((await lireTrie(banc.reglages, agenceId, "fidelite"))?.exceptions ?? []).toEqual([]);
    });

    it("retirer une exception qui n'existe pas ne fait rien", async () => {
      const { agenceId, gares } = await banc.nouvelleAgence();
      await banc.reglages.retirerException(agenceId, "colis", { type: "gare", id: gares[0]!.id });
      await banc.reglages.retirerException(agenceId, "colis", { type: "ville", nom: "Garoua" });
      expect((await banc.reglages.lire(agenceId)).size).toBe(0);
    });

    it("retirer une exception garde la règle générale et les autres exceptions", async () => {
      const { agenceId, gares } = await banc.nouvelleAgence();
      await banc.reglages.definirAgence(agenceId, "colis", false);
      await banc.reglages.poserException(agenceId, "colis", {
        portee: { type: "gare", id: gares[0]!.id },
        actif: true,
      });
      await banc.reglages.poserException(agenceId, "colis", {
        portee: { type: "ville", nom: "Douala" },
        actif: true,
      });
      await banc.reglages.retirerException(agenceId, "colis", { type: "gare", id: gares[0]!.id });
      expect(await lireTrie(banc.reglages, agenceId, "colis")).toEqual({
        actif: false,
        exceptions: [{ portee: { type: "ville", nom: "Douala" }, actif: true }],
      });
    });

    it("la règle de l'agence remet à plat les exceptions du module, et seulement de ce module", async () => {
      const { agenceId, gares } = await banc.nouvelleAgence();
      for (const code of ["colis", "relais"]) {
        await banc.reglages.poserException(agenceId, code, {
          portee: { type: "gare", id: gares[2]!.id },
          actif: false,
        });
        await banc.reglages.poserException(agenceId, code, {
          portee: { type: "ville", nom: "Douala" },
          actif: false,
        });
      }
      await banc.reglages.definirAgence(agenceId, "colis", true);
      expect(await lireTrie(banc.reglages, agenceId, "colis")).toEqual({
        actif: true,
        exceptions: [],
      });
      expect((await lireTrie(banc.reglages, agenceId, "relais"))?.exceptions).toHaveLength(2);
    });

    it("deux agences ne se voient pas", async () => {
      const a = await banc.nouvelleAgence();
      const b = await banc.nouvelleAgence();
      await banc.reglages.definirAgence(a.agenceId, "colis", false);
      await banc.reglages.poserException(a.agenceId, "ussd", {
        portee: { type: "ville", nom: "Douala" },
        actif: true,
      });
      expect((await banc.reglages.lire(b.agenceId)).size).toBe(0);
      await banc.reglages.definirAgence(b.agenceId, "colis", true);
      expect((await lireTrie(banc.reglages, a.agenceId, "colis"))?.actif).toBe(false);
      expect((await lireTrie(banc.reglages, b.agenceId, "colis"))?.actif).toBe(true);
    });

    it("des réglages simultanés de gares différentes se cumulent ; le même, il n'en reste qu'un", async () => {
      const { agenceId, gares } = await banc.nouvelleAgence();
      await Promise.all(
        gares.map((g) =>
          banc.reglages.poserException(agenceId, "livraison_moto", {
            portee: { type: "gare", id: g.id },
            actif: false,
          }),
        ),
      );
      expect((await lireTrie(banc.reglages, agenceId, "livraison_moto"))?.exceptions).toHaveLength(
        gares.length,
      );
      await Promise.all(
        [true, false, true, false, true].map((actif) =>
          banc.reglages.poserException(agenceId, "livraison_moto", {
            portee: { type: "ville", nom: "Douala" },
            actif,
          }),
        ),
      );
      const villes = (await lireTrie(banc.reglages, agenceId, "livraison_moto"))?.exceptions.filter(
        (e) => e.portee.type === "ville",
      );
      expect(villes).toHaveLength(1);
    });

    it("l'annuaire connaît l'agence et ses gares, et seulement les siennes", async () => {
      const a = await banc.nouvelleAgence();
      const b = await banc.nouvelleAgence();
      expect(await banc.annuaire.agenceExiste(a.agenceId)).toBe(true);
      expect(await banc.annuaire.agenceExiste(randomUUID())).toBe(false);
      const gares = await banc.annuaire.gares(a.agenceId);
      expect([...gares].map((g) => g.id).sort()).toEqual(a.gares.map((g) => g.id).sort());
      expect(gares.find((g) => g.id === a.gares[2]!.id)).toMatchObject({
        nom: "Yaoundé Mvan",
        ville: "Yaoundé",
      });
      expect([...(await banc.annuaire.gares(b.agenceId))].map((g) => g.id)).not.toContain(
        a.gares[0]!.id,
      );
      expect(await banc.annuaire.gares(randomUUID())).toEqual([]);
    });
  });
}

contratPortsModules("contrat · adaptateurs en mémoire", async () => {
  const reglages = new ReglagesMemoire();
  const annuaire = new AnnuaireMemoire();
  return {
    reglages,
    annuaire,
    nouvelleAgence: async () => {
      const agenceId = randomUUID();
      const gares = GARES.map((g) => ({ id: randomUUID(), nom: g.nom, ville: g.ville }));
      annuaire.declarer(agenceId, gares);
      return { agenceId, gares };
    },
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · modules", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let banc: BancModules;

  let compteurCodes = 0;
  const code3 = (): string => {
    compteurCodes += 1;
    const n = compteurCodes;
    return [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26]
      .map((x) => String.fromCharCode(65 + x))
      .join("");
  };

  async function nouvelleAgence() {
    const compagnie = await prisma.compagnie.create({
      data: { code: code3(), nom: "Agence test" },
    });
    const gares: GareAnnuaire[] = [];
    for (const g of GARES) {
      const gare = await prisma.gare.create({
        data: { compagnieId: compagnie.id, code: g.code, nom: g.nom, ville: g.ville },
      });
      gares.push({ id: gare.id, nom: gare.nom, ville: gare.ville });
    }
    return { agenceId: compagnie.id, gares };
  }

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
    banc = {
      reglages: new ReglagesModulesPrisma(prisma),
      annuaire: new AnnuaireAgencesPrisma(prisma),
      nouvelleAgence,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsModules("contrat · adaptateurs PostgreSQL", async () => banc);

  describe("ce que la base garantit seule", () => {
    it("un identifiant qui n'est pas un UUID n'est celui d'aucune agence ni d'aucune gare", async () => {
      expect(await banc.annuaire.agenceExiste("pas-un-uuid")).toBe(false);
      expect(await banc.annuaire.gares("pas-un-uuid")).toEqual([]);
      expect((await banc.reglages.lire("pas-un-uuid")).size).toBe(0);
      await expect(
        banc.reglages.retirerException(randomUUID(), "colis", { type: "gare", id: "pas-un-uuid" }),
      ).resolves.toBeUndefined();
    });

    it("module_compagnie refuse un code de module inconnu", async () => {
      const { agenceId } = await nouvelleAgence();
      const message = await erreurSql(
        `INSERT INTO module_compagnie ("compagnieId", code, nom, actif) VALUES ($1, 'inconnu', 'x', true)`,
        [agenceId],
      );
      expect(message).toContain("module_compagnie_code_connu");
    });

    it("module_exception refuse un code inconnu, une portée incohérente et un doublon", async () => {
      const { agenceId, gares } = await nouvelleAgence();
      const inserer = (colonnes: string, valeurs: unknown[]) =>
        erreurSql(
          `INSERT INTO module_exception (id, "compagnieId", ${colonnes}, actif)
           VALUES (gen_random_uuid(), $1, ${valeurs.map((_, i) => `$${i + 2}`).join(", ")}, true)`,
          [agenceId, ...valeurs],
        );
      expect(
        await inserer(`code, "porteeType", "gareId"`, ["inconnu", "gare", gares[0]!.id]),
      ).toContain("module_exception_code_connu");
      expect(await inserer(`code, "porteeType"`, ["colis", "region"])).toMatch(
        /module_exception_portee_(connue|coherente)/,
      );
      // Une exception de gare sans gare, une exception de ville avec une gare : incohérentes.
      expect(await inserer(`code, "porteeType"`, ["colis", "gare"])).toContain(
        "module_exception_portee_coherente",
      );
      expect(
        await inserer(`code, "porteeType", "gareId", "villeCle", "villeNom"`, [
          "colis",
          "ville",
          gares[0]!.id,
          "douala",
          "Douala",
        ]),
      ).toContain("module_exception_portee_coherente");

      expect(await inserer(`code, "porteeType", "gareId"`, ["colis", "gare", gares[0]!.id])).toBe(
        "",
      );
      expect(
        await inserer(`code, "porteeType", "gareId"`, ["colis", "gare", gares[0]!.id]),
      ).toMatch(/duplicate key|unique/i);
      // La même gare dans un autre module, ou une autre gare dans le même, est permise.
      expect(await inserer(`code, "porteeType", "gareId"`, ["relais", "gare", gares[0]!.id])).toBe(
        "",
      );
      expect(await inserer(`code, "porteeType", "gareId"`, ["colis", "gare", gares[1]!.id])).toBe(
        "",
      );
      // Deux villes différentes dans le même module coexistent ; la même ville deux fois, non.
      const ville = (cle: string) =>
        inserer(`code, "porteeType", "villeCle", "villeNom"`, ["colis", "ville", cle, cle]);
      expect(await ville("douala")).toBe("");
      expect(await ville("yaounde")).toBe("");
      expect(await ville("douala")).toMatch(/duplicate key|unique/i);
    });

    it("module_exception refuse une gare qui n'existe pas", async () => {
      const { agenceId } = await nouvelleAgence();
      const message = await erreurSql(
        `INSERT INTO module_exception (id, "compagnieId", code, "porteeType", "gareId", actif)
         VALUES (gen_random_uuid(), $1, 'colis', 'gare', $2, true)`,
        [agenceId, randomUUID()],
      );
      expect(message).toMatch(/foreign key|violates/i);
    });

    it("un réglage ne meurt pas avec une écriture partagée : la règle générale et ses exceptions changent dans la même transaction", async () => {
      const { agenceId, gares } = await nouvelleAgence();
      await banc.reglages.poserException(agenceId, "colis", {
        portee: { type: "gare", id: gares[0]!.id },
        actif: false,
      });
      // Un code inconnu fait échouer la transaction entière : les exceptions restent.
      await expect(banc.reglages.definirAgence(agenceId, "inconnu", true)).rejects.toThrow();
      expect((await lireTrie(banc.reglages, agenceId, "colis"))?.exceptions).toHaveLength(1);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM module_compagnie WHERE "compagnieId" = $1`,
        [agenceId],
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe("API de bout en bout, stockage PostgreSQL", () => {
    const PIN = "482915";
    let stockageAvant: string | undefined;
    let app: NestExpressApplication | null = null;
    let agence: { agenceId: string; gares: readonly GareAnnuaire[] };
    let jetonPatron: string;
    let jetonGuichetier: string;

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

    const http = () => request(app!.getHttpServer());
    const auth = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
    const corps = (
      code: string,
      actif: boolean,
      portee: Record<string, unknown> = { type: "agence" },
      pin = PIN,
    ) => ({
      code,
      actif,
      portee,
      signature: { pin, methode: "pin", signeA: versIsoDouala(new Date()) },
    });

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      agence = await nouvelleAgence();
      app = await demarrer();

      const comptes = app.get(ComptesService);
      const tokens = app.get(TokensService);
      const patron = await comptes.creer({
        nom: "Patron test",
        telephone: "+237655300001",
        roles: ["patron"],
        compagnieId: agence.agenceId,
        gareId: null,
        motDePasse: "Un-mot-de-passe-solide",
      });
      // Un patron se connecte par mot de passe : son PIN de signature est posé à part.
      await prisma.personne.update({
        where: { id: patron.id },
        data: { pinHache: await app.get(HachageService).hacher(PIN) },
      });
      jetonPatron = (
        await tokens.emettre({ sub: patron.id, role: "patron", cid: agence.agenceId, gid: null })
      ).accessToken;
      const guichetier = await comptes.creer({
        nom: "Guichetier test",
        telephone: "+237655300002",
        roles: ["guichetier"],
        compagnieId: agence.agenceId,
        gareId: agence.gares[0]!.id,
        pin: PIN,
      });
      jetonGuichetier = (
        await tokens.emettre({
          sub: guichetier.id,
          role: "guichetier",
          cid: agence.agenceId,
          gid: agence.gares[0]!.id,
        })
      ).accessToken;
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    const visible = async (jeton: string, code: string, requete = "") => {
      const r = await http().get(`/modules/actifs${requete}`).set(auth(jeton));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return (r.body.modules as { code: string; actif: boolean }[]).find((m) => m.code === code)
        ?.actif;
    };

    it("le moteur utilise les adaptateurs PostgreSQL quand API_STOCKAGE=postgres", () => {
      expect(app!.get(ReglagesModules)).toBeInstanceOf(ReglagesModulesPrisma);
      expect(app!.get(AnnuaireAgences)).toBeInstanceOf(AnnuaireAgencesPrisma);
    });

    it("sans PIN valide, le changement est refusé et rien n'est écrit", async () => {
      const mauvais = await http()
        .put("/patron/modules/colis")
        .set(auth(jetonPatron))
        .send(corps("colis", false, { type: "agence" }, "111111"));
      expect(mauvais.status).toBe(403);
      const sansSignature = await http()
        .put("/patron/modules/colis")
        .set(auth(jetonPatron))
        .send({ code: "colis", actif: false, portee: { type: "agence" } });
      expect(sansSignature.status).toBe(401);
      expect(sansSignature.body.code).toBe("PIN_REQUIS");
      expect(await visible(jetonGuichetier, "colis")).toBe(true);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM module_compagnie WHERE "compagnieId" = $1`,
        [agence.agenceId],
      );
      expect(rows[0].n).toBe(0);
    });

    it("le patron masque un module par agence puis par ville, tout est tracé et survit à un redémarrage", async () => {
      const masque = await http()
        .put("/patron/modules/colis")
        .set(auth(jetonPatron))
        .send(corps("colis", false));
      expect(masque.status, JSON.stringify(masque.body)).toBe(200);
      expect(await visible(jetonGuichetier, "colis")).toBe(false);

      // Douala le rallume : le guichetier d'Akwa le revoit, pas Yaoundé.
      const rallume = await http()
        .put("/patron/modules/colis")
        .set(auth(jetonPatron))
        .send(corps("colis", true, { type: "ville", nom: "douala" }));
      expect(rallume.status, JSON.stringify(rallume.body)).toBe(200);
      expect(rallume.body.module.exceptions).toEqual([
        { portee: { type: "ville", nom: "Douala" }, actif: true },
      ]);
      expect(await visible(jetonGuichetier, "colis")).toBe(true);
      expect(await visible(jetonPatron, "colis", `?gare=${agence.gares[2]!.id}`)).toBe(false);

      // Une gare d'une autre agence est refusée.
      const autre = await nouvelleAgence();
      const refus = await http()
        .put("/patron/modules/relais")
        .set(auth(jetonPatron))
        .send(corps("relais", false, { type: "gare", id: autre.gares[0]!.id }));
      expect(refus.status).toBe(404);
      expect(refus.body.code).toBe("GARE_INCONNUE");

      // Journal d'audit : le PIN faux, les deux changements réussis, puis la gare refusée.
      const lignes = await prisma.journalAudit.findMany({
        where: { action: "module.changer", compagnieId: agence.agenceId },
        orderBy: { seq: "asc" },
      });
      expect(lignes.map((l) => l.resultat)).toEqual(["refus", "succes", "succes", "refus"]);
      expect(
        JSON.stringify(lignes, (_c, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
      ).not.toContain(PIN);

      // Redémarrage de l'API : les réglages sont en base, pas en mémoire.
      await app!.close();
      app = await demarrer();
      const comptes = await prisma.personne.findMany({ where: { compagnieId: agence.agenceId } });
      expect(comptes).toHaveLength(2);
      expect(await visible(jetonGuichetier, "colis")).toBe(true);
      expect(await visible(jetonPatron, "colis", `?gare=${agence.gares[2]!.id}`)).toBe(false);
      const liste = await http().get("/patron/modules").set(auth(jetonPatron));
      expect(liste.status).toBe(200);
      expect(liste.body.actifs).toBe(9);
    });
  });
});
