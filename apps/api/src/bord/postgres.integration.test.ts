import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  ControlesBordMemoire,
  DepensesBordMemoire,
  IncidentsBordMemoire,
  PassagesRouteMemoire,
  RetardsDepartMemoire,
  VentesEnRouteMemoire,
} from "./memoire";
import {
  ControlesBordPrisma,
  DepensesBordPrisma,
  IncidentsBordPrisma,
  PassagesRoutePrisma,
  RetardsDepartPrisma,
  VentesEnRoutePrisma,
} from "./postgres";
import { contratPortsBord, type BancBord } from "./testing/contrat-ports";

/**
 * Les ports du bord : le même contrat sur la mémoire (toujours) et sur PostgreSQL (avec DATABASE_URL_TEST),
 * puis ce que seule la base garantit (clés étrangères, ajout seul, contrôle clos figé, un seul contrôle ouvert).
 */

contratPortsBord("contrat · ports du bord en mémoire", async () => {
  const banc: BancBord = {
    ventes: new VentesEnRouteMemoire(),
    passages: new PassagesRouteMemoire(),
    depenses: new DepensesBordMemoire(),
    incidents: new IncidentsBordMemoire(),
    retards: new RetardsDepartMemoire(),
    controles: new ControlesBordMemoire(),
    nouveauDepart: async () => randomUUID(),
    nouvellePersonne: async () => randomUUID(),
    nouveauBillet: async () => randomUUID(),
    fermer: async () => undefined,
  };
  return banc;
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · bord", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let fx: FixturesPg;
  let contexte: { compagnieId: string; gareId: string; ligneId: string };

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  async function departEnBase(): Promise<string> {
    return (await fx.depart(contexte.ligneId, { etat: "parti" })).id;
  }
  const personneEnBase = async (): Promise<string> =>
    (await fx.personne({ roles: ["convoyeur"], compagnieId: contexte.compagnieId })).id;
  const billetEnBase = async (departId: string): Promise<string> =>
    (await fx.billet({ compagnieId: contexte.compagnieId, gareId: contexte.gareId, departId })).id;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
    fx = new FixturesPg(prisma);
    const c = await fx.compagnie();
    const a = await fx.gare(c.id);
    const b = await fx.gare(c.id);
    const ligne = await fx.ligne(c.id, a.id, b.id);
    contexte = { compagnieId: c.id, gareId: a.id, ligneId: ligne.id };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsBord("contrat · ports du bord PostgreSQL", async () => {
    const banc: BancBord = {
      ventes: new VentesEnRoutePrisma(prisma),
      passages: new PassagesRoutePrisma(prisma),
      depenses: new DepensesBordPrisma(prisma),
      incidents: new IncidentsBordPrisma(prisma),
      retards: new RetardsDepartPrisma(prisma),
      controles: new ControlesBordPrisma(prisma),
      nouveauDepart: departEnBase,
      nouvellePersonne: personneEnBase,
      nouveauBillet: billetEnBase,
      fermer: async () => undefined,
    };
    return banc;
  });

  describe("ce que seule la base garantit", () => {
    it("les adaptateurs se déclarent durables", () => {
      for (const port of [
        new VentesEnRoutePrisma(prisma),
        new PassagesRoutePrisma(prisma),
        new DepensesBordPrisma(prisma),
        new IncidentsBordPrisma(prisma),
        new RetardsDepartPrisma(prisma),
        new ControlesBordPrisma(prisma),
      ]) {
        expect(port.durable).toBe(true);
      }
    });

    it("les migrations 0010c sont appliquées et ne cassent pas les lignes du lot C sans catégorie", async () => {
      const departId = await departEnBase();
      // Une dépense saisie ailleurs (sans catégorie ni justificatif) reste lisible par le bord.
      await prisma.departDepense.create({
        data: {
          id: randomUUID(),
          departId,
          nature: "carburant",
          montant: 5000,
          libelle: "Plein",
          saisieA: new Date(),
        },
      });
      await prisma.departDepense.create({
        data: {
          id: randomUUID(),
          departId,
          nature: "autre",
          montant: 700,
          libelle: "Divers",
          saisieA: new Date(),
        },
      });
      const lues = await new DepensesBordPrisma(prisma).duDepart(departId);
      expect(lues.map((d) => [d.categorie, d.justificatifRef, d.auteurId])).toEqual(
        expect.arrayContaining([
          ["carburant", null, null],
          ["autre", null, null],
        ]),
      );
    });

    it("une catégorie de dépense ou d'incident inconnue est refusée", async () => {
      const departId = await departEnBase();
      expect(
        await erreurSql(
          `INSERT INTO depart_depense (id, "departId", nature, montant, "saisieA", categorie)
           VALUES ($1, $2, 'autre', 100, now(), 'cadeau')`,
          [randomUUID(), departId],
        ),
      ).toMatch(/depart_depense_categorie_connue/);
      expect(
        await erreurSql(
          `INSERT INTO depart_incident (id, "departId", nature, description, "signaleA", categorie)
           VALUES ($1, $2, 'autre', 'x', now(), 'meteo')`,
          [randomUUID(), departId],
        ),
      ).toMatch(/depart_incident_categorie_connue/);
    });

    it("une position à moitié renseignée ou hors du globe est refusée", async () => {
      const departId = await departEnBase();
      const demi = await erreurSql(
        `INSERT INTO depart_incident (id, "departId", nature, description, "signaleA", latitude)
         VALUES ($1, $2, 'panne', 'x', now(), 3.9)`,
        [randomUUID(), departId],
      );
      expect(demi).toMatch(/depart_incident_position/);
      const hors = await erreurSql(
        `INSERT INTO depart_incident (id, "departId", nature, description, "signaleA", latitude, longitude)
         VALUES ($1, $2, 'panne', 'x', now(), 93, 10)`,
        [randomUUID(), departId],
      );
      expect(hors).toMatch(/depart_incident_position/);
    });

    it("une vente en route ne s'écrit que pour un billet, un départ et un convoyeur qui existent", async () => {
      const ventes = new VentesEnRoutePrisma(prisma);
      const departId = await departEnBase();
      await expect(
        ventes.ajouter({
          billetId: randomUUID(),
          departId,
          convoyeurId: await personneEnBase(),
          arretMontee: "Douala",
          arretDescente: "Édéa",
          position: null,
          venduA: "2026-11-02T09:00:00.000+01:00",
        }),
      ).rejects.toThrow();
    });

    it("les passages sont en ajout seul : ni modification, ni suppression, ni vidage", async () => {
      const passages = new PassagesRoutePrisma(prisma);
      const departId = await departEnBase();
      const id = randomUUID();
      await passages.ajouter({
        id,
        genre: "arrivee",
        departId,
        auteurId: await personneEnBase(),
        arret: "Édéa",
        billetId: null,
        resultat: null,
        position: null,
        at: "2026-11-02T09:00:00.000+01:00",
      });
      expect(
        await erreurSql(`UPDATE passage_route SET arret = 'Autre' WHERE id = $1`, [id]),
      ).not.toBe("");
      expect(await erreurSql(`DELETE FROM passage_route WHERE id = $1`, [id])).not.toBe("");
      expect(await erreurSql(`TRUNCATE passage_route`)).not.toBe("");
    });

    it("un passage a la forme de son genre : un scan porte un billet et un résultat, une arrivée aucun", async () => {
      const departId = await departEnBase();
      const auteur = await personneEnBase();
      const sansBillet = await erreurSql(
        `INSERT INTO passage_route (id, genre, "departId", "auteurId", arret, resultat, at)
         VALUES ($1, 'scan', $2, $3, 'Édéa', 'monte', now())`,
        [randomUUID(), departId, auteur],
      );
      expect(sansBillet).toMatch(/passage_route_forme/);
      const arriveeAvecResultat = await erreurSql(
        `INSERT INTO passage_route (id, genre, "departId", "auteurId", arret, resultat, at)
         VALUES ($1, 'arrivee', $2, $3, 'Édéa', 'monte', now())`,
        [randomUUID(), departId, auteur],
      );
      expect(arriveeAvecResultat).toMatch(/passage_route_forme/);
    });

    it("un contrôleur n'a qu'un contrôle ouvert : la base refuse le second", async () => {
      const departId = await departEnBase();
      const controleurId = await personneEnBase();
      const ouvrir = (id: string) =>
        erreurSql(
          `INSERT INTO controle_inopine (id, "departId", "controleurId", lieu, "ouvertA")
           VALUES ($1, $2, $3, 'Douala', now())`,
          [id, departId, controleurId],
        );
      expect(await ouvrir(randomUUID())).toBe("");
      expect(await ouvrir(randomUUID())).toMatch(/controle_inopine_un_ouvert_par_controleur/);
    });

    it("les comptes figés sont cohérents : l'écart vaut têtes moins liste, rien n'est figé tant que le contrôle est ouvert", async () => {
      const controles = new ControlesBordPrisma(prisma);
      const c = (
        await controles.ouvrir({
          id: randomUUID(),
          departId: await departEnBase(),
          controleurId: await personneEnBase(),
          lieu: "Douala",
          ouvertA: "2026-11-02T09:00:00.000+01:00",
          clotureA: null,
          liste: null,
          tetes: null,
          ecart: null,
          envoyeAuPatron: false,
        })
      ).controle;
      expect(
        await erreurSql(
          `UPDATE controle_inopine SET "clotureA" = now(), liste = 10, tetes = 12, ecart = 5 WHERE id = $1`,
          [c.id],
        ),
      ).toMatch(/controle_inopine_comptes/);
      expect(
        await erreurSql(
          `UPDATE controle_inopine SET liste = 10, tetes = 12, ecart = 2 WHERE id = $1`,
          [c.id],
        ),
      ).toMatch(/controle_inopine_comptes/);
      expect(
        await erreurSql(`UPDATE controle_inopine SET "envoyeAuPatron" = true WHERE id = $1`, [
          c.id,
        ]),
      ).toMatch(/controle_inopine_envoi/);
    });

    it("un contrôle clos ne change plus et ne se supprime pas ; l'envoi au patron ne se reprend pas", async () => {
      const controles = new ControlesBordPrisma(prisma);
      const c = (
        await controles.ouvrir({
          id: randomUUID(),
          departId: await departEnBase(),
          controleurId: await personneEnBase(),
          lieu: "Douala",
          ouvertA: "2026-11-02T09:00:00.000+01:00",
          clotureA: null,
          liste: null,
          tetes: null,
          ecart: null,
          envoyeAuPatron: false,
        })
      ).controle;
      await controles.clore(c.id, {
        clotureA: "2026-11-02T09:30:00.000+01:00",
        liste: 10,
        tetes: 12,
        ecart: 2,
      });
      await controles.marquerEnvoye(c.id);
      expect(
        await erreurSql(`UPDATE controle_inopine SET lieu = 'Ailleurs' WHERE id = $1`, [c.id]),
      ).toMatch(/clos/);
      expect(
        await erreurSql(`UPDATE controle_inopine SET liste = 11, tetes = 13 WHERE id = $1`, [c.id]),
      ).toMatch(/clos/);
      expect(
        await erreurSql(`UPDATE controle_inopine SET "envoyeAuPatron" = false WHERE id = $1`, [
          c.id,
        ]),
      ).toMatch(/ne se reprend pas/);
      expect(await erreurSql(`DELETE FROM controle_inopine WHERE id = $1`, [c.id])).toMatch(
        /ne se supprime pas/,
      );
      expect(await erreurSql(`TRUNCATE controle_inopine CASCADE`)).not.toBe("");
    });

    it("un constat de siège a une valeur connue et un siège positif", async () => {
      const controles = new ControlesBordPrisma(prisma);
      const c = (
        await controles.ouvrir({
          id: randomUUID(),
          departId: await departEnBase(),
          controleurId: await personneEnBase(),
          lieu: "Douala",
          ouvertA: "2026-11-02T09:00:00.000+01:00",
          clotureA: null,
          liste: null,
          tetes: null,
          ecart: null,
          envoyeAuPatron: false,
        })
      ).controle;
      expect(
        await erreurSql(
          `INSERT INTO controle_siege ("controleId", siege, constat, at) VALUES ($1, 3, 'fantome', now())`,
          [c.id],
        ),
      ).toMatch(/controle_siege_constat_connu/);
      expect(
        await erreurSql(
          `INSERT INTO controle_siege ("controleId", siege, constat, at) VALUES ($1, 0, 'libre', now())`,
          [c.id],
        ),
      ).toMatch(/controle_siege_numero/);
    });
  });
});
