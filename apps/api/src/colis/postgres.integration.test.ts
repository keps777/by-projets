import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { NumerotationService } from "../numerotation/numerotation.service";
import { PlagesAttribueesPrisma, RegistreNumerosPrisma } from "../numerotation/postgres";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { HorlogeFixe } from "../socle/testing/memoire";
import { ColisMemoire, NumerotationMemoire, PhotosMemoire, ReclamationsMemoire } from "./memoire";
import {
  ColisPrisma,
  NumerotationColisServeur,
  PhotosColisPrisma,
  ReclamationsColisPrisma,
} from "./postgres";
import { ColisRepository } from "./ports";
import { ESSAIS_CODE_MAX } from "./regles";
import {
  AUTRE_GARE,
  COMPAGNIE,
  GARE_BAF,
  GARE_DLA,
  creerAppColisTest,
  entete,
  type AppColisTest,
} from "./testing/app-colis-test";
import {
  contratPortsColis,
  unColis,
  type BancColis,
  type ContexteColis,
} from "./testing/contrat-ports";
import {
  amenerJusquaDisponible,
  creerColisApp,
  creerEquipe,
  scanner,
  type Equipe,
} from "./testing/scenarios";

/**
 * Adaptateurs PostgreSQL du module colis : les mêmes tests de contrat sur la mémoire (toujours) et
 * sur PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit, et
 * l'API de bout en bout sur PostgreSQL (code de retrait deviné par plusieurs personnes à la fois).
 */

// Les adaptateurs en mémoire passent le même contrat : c'est ce qui prouve que la mémoire (sur
// laquelle tournent tous les autres tests) se comporte comme la base.
contratPortsColis("contrat · adaptateurs en mémoire", async () => {
  const colis = new ColisMemoire();
  const numerotation = new NumerotationMemoire();
  return {
    colis,
    photos: new PhotosMemoire(),
    reclamations: new ReclamationsMemoire(),
    numerotation,
    nouveauContexte: async () => ({
      compagnieId: randomUUID(),
      origine: { id: randomUUID(), code: "DLA", nom: "Alpha Douala", ville: "Douala" },
      destination: { id: randomUUID(), code: "BAF", nom: "Alpha Bafoussam", ville: "Bafoussam" },
      expediteurId: randomUUID(),
      auteurId: randomUUID(),
      departId: randomUUID(),
    }),
    remplirNumerosEnLigne: async (contexte, at) => {
      for (let n = 4001; n < 9999; n++) {
        await numerotation.prochainEnLigne({
          gareId: contexte.origine.id,
          compagnieId: contexte.compagnieId,
          at,
          reference: `plein-${n}`,
        });
      }
    },
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · colis", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let chiffrement: ChiffrementService;
  let fx: FixturesPg;
  let banc: BancColis;

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
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    chiffrement = new ChiffrementService(config);
    fx = new FixturesPg(prisma);
    const registre = new RegistreNumerosPrisma(prisma);
    const numerotation = new NumerotationService(
      new PlagesAttribueesPrisma(prisma),
      registre,
      new HorlogeFixe(new Date("2027-01-05T08:00:00.000Z")),
    );
    banc = {
      colis: new ColisPrisma(prisma, chiffrement),
      photos: new PhotosColisPrisma(prisma),
      reclamations: new ReclamationsColisPrisma(prisma),
      numerotation: new NumerotationColisServeur(numerotation, registre),
      nouveauContexte: async () => {
        const compagnie = await fx.compagnie();
        const origine = await fx.gare(compagnie.id, { ville: "Douala" });
        const destination = await fx.gare(compagnie.id, { ville: "Bafoussam" });
        const expediteur = await fx.personne({ roles: ["voyageur"] });
        const auteur = await fx.personne({ roles: ["voyageur"] });
        const ligne = await fx.ligne(compagnie.id, origine.id, destination.id);
        const depart = await fx.depart(ligne.id);
        const ref = (g: typeof origine) => ({ id: g.id, code: g.code, nom: g.nom, ville: g.ville });
        return {
          compagnieId: compagnie.id,
          origine: ref(origine),
          destination: ref(destination),
          expediteurId: expediteur.id,
          auteurId: auteur.id,
          departId: depart.id,
        };
      },
      remplirNumerosEnLigne: async (contexte: ContexteColis, at: string) => {
        const jour = at.slice(2, 10).replaceAll("-", "");
        await sql.query(
          `INSERT INTO numero_vu (portee, jour, genre, numero, "appareilId", "evenementId", "gareId", "compagnieId", "recuA")
           SELECT $1, $2, 'colis', n, 'serveur-en-ligne', 'plein-' || n, $3::uuid, $4::uuid, now()
           FROM generate_series(4001, 9998) AS n`,
          [
            `gare:${contexte.compagnieId}:${contexte.origine.id}`,
            jour,
            contexte.origine.id,
            contexte.compagnieId,
          ],
        );
      },
      fermer: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Les tests de contrat s'exécutent ici, sur la base préparée plus haut.
  contratPortsColis("contrat · adaptateurs PostgreSQL", async () => banc);

  describe("ce que la base garantit seule", () => {
    it("trois essais faux sans blocage, ou plus de trois essais : la base refuse", async () => {
      const ctx = await banc.nouveauContexte();
      const colis = unColis(ctx);
      await banc.colis.ajouter(colis);
      const poser = (essais: number, bloque: boolean) =>
        erreurSql(`UPDATE colis SET "codeEssais" = $2, "codeBloque" = $3 WHERE id = $1`, [
          colis.id,
          essais,
          bloque,
        ]);
      expect(await poser(ESSAIS_CODE_MAX - 1, false)).toBe("");
      expect(await poser(ESSAIS_CODE_MAX, false)).toMatch(/colis_code_bloque_apres_trois_essais/);
      expect(await poser(ESSAIS_CODE_MAX, true)).toBe("");
      expect(await poser(ESSAIS_CODE_MAX + 1, true)).toMatch(/colis_code_essais_max/);
      expect(await poser(-1, false)).toMatch(/colis_montants_complementaires/);
    });

    it("le numéro d'un colis est unique, même écrit à la main", async () => {
      const ctx = await banc.nouveauContexte();
      const colis = unColis(ctx);
      await banc.colis.ajouter(colis);
      const doublon = await erreurSql(
        `INSERT INTO colis (id, numero, sequence, jour, "gareOrigineId", "gareDestinationId",
           "expediteurChiffre", "expediteurTelephoneIndex", "destinataireChiffre",
           "destinataireTelephoneIndex", contenu, "poidsKg", "valeurDeclaree", mode, canal,
           "codeRetraitHache", "codeRetraitSel", "prixTotal", "creeA", etat)
         VALUES ($1, $2, 1, '270105', $3, $4, 'e', 'ie', 'd', 'id', 'x', 1, 0, 'gare', 'agence',
           'h', 's', 0, now(), 'enregistre')`,
        [randomUUID(), colis.numero, ctx.origine.id, ctx.destination.id],
      );
      expect(doublon).toMatch(/colis_numero_key/);
    });

    it("aucun téléphone n'est en clair en base : chiffrés, avec un index aveugle", async () => {
      const ctx = await banc.nouveauContexte();
      const colis = unColis(ctx);
      await banc.colis.ajouter(colis);
      const { rows } = await sql.query(
        `SELECT "expediteurChiffre", "expediteurTelephoneIndex", "destinataireChiffre",
                "destinataireTelephoneIndex", "codeRetraitChiffre", "codeRetraitHache"
         FROM colis WHERE id = $1`,
        [colis.id],
      );
      const ligne = JSON.stringify(rows[0]);
      expect(ligne).not.toContain("691221008");
      expect(ligne).not.toContain("699401822");
      expect(ligne).not.toContain("Aïcha");
      expect(rows[0].expediteurChiffre).toMatch(/^enc:v1:/);
      expect(rows[0].destinataireChiffre).toMatch(/^enc:v1:/);
      expect(rows[0].expediteurTelephoneIndex).toMatch(/^[0-9a-f]{64}$/);
      // Un chiffré recopié dans l'autre colonne est refusé au déchiffrement (contexte lié).
      await sql.query(
        `UPDATE colis SET "destinataireChiffre" = "expediteurChiffre" WHERE id = $1`,
        [colis.id],
      );
      await expect(banc.colis.trouver(colis.id)).rejects.toThrow();
    });

    it("une réclamation ouverte n'a pas de décision, une réclamation tranchée en a une", async () => {
      const ctx = await banc.nouveauContexte();
      const colis = unColis(ctx);
      await banc.colis.ajouter(colis);
      const reference = `R-270105-${randomUUID().slice(0, 6).toUpperCase()}`;
      await sql.query(
        `INSERT INTO reclamation_colis (reference, "colisId", "colisNumero", "compagnieId", "auteurId",
           motif, "ouverteA", "reponseAvant", statut)
         VALUES ($1, $2, $3, $4, $5, 'perdu', now(), now(), 'ouverte')`,
        [reference, colis.id, colis.numero, ctx.compagnieId, ctx.auteurId],
      );
      expect(
        await erreurSql(`UPDATE reclamation_colis SET statut = 'acceptee' WHERE reference = $1`, [
          reference,
        ]),
      ).toMatch(/reclamation_colis_decision/);
      expect(
        await erreurSql(
          `UPDATE reclamation_colis SET statut = 'close', decision = '{}' WHERE reference = $1`,
          [reference],
        ),
      ).toMatch(/reclamation_colis_statut_connu/);
    });

    it("une photo expire après avoir été prise, avec un genre connu", async () => {
      const ctx = await banc.nouveauContexte();
      const colis = unColis(ctx);
      await banc.colis.ajouter(colis);
      const inserer = (genre: string, prise: string, expire: string) =>
        erreurSql(
          `INSERT INTO photo_colis (ref, "colisId", genre, "priseA", "expireA")
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), colis.id, genre, prise, expire],
        );
      expect(await inserer("depot", "2027-01-05T09:00:00Z", "2027-04-05T09:00:00Z")).toBe("");
      expect(await inserer("selfie", "2027-01-05T09:00:00Z", "2027-04-05T09:00:00Z")).toMatch(
        /photo_colis_genre_connu/,
      );
      expect(await inserer("depot", "2027-01-05T09:00:00Z", "2027-01-01T09:00:00Z")).toMatch(
        /photo_colis_expiration/,
      );
    });

    it("le numéro d'un colis de l'app est inscrit au registre des numéros, sans trou ni doublon", async () => {
      const ctx = await banc.nouveauContexte();
      const references = Array.from({ length: 5 }, () => randomUUID());
      await Promise.all(
        references.map((reference) =>
          banc.numerotation.prochainEnLigne({
            gareId: ctx.origine.id,
            compagnieId: ctx.compagnieId,
            at: "2027-01-05T09:00:00.000+01:00",
            reference,
          }),
        ),
      );
      const { rows } = await sql.query(
        `SELECT numero, genre, "appareilId" FROM numero_vu WHERE "gareId" = $1 ORDER BY numero`,
        [ctx.origine.id],
      );
      expect(rows.map((r) => r.numero)).toEqual([4001, 4002, 4003, 4004, 4005]);
      expect(new Set(rows.map((r) => r.genre))).toEqual(new Set(["colis"]));
      expect(new Set(rows.map((r) => r.appareilId))).toEqual(new Set(["serveur-en-ligne"]));
    });
  });

  describe("API de bout en bout, stockage PostgreSQL", () => {
    let t: AppColisTest;
    let equipe: Equipe;
    let departId: string;

    beforeAll(async () => {
      // Les lignes que désignent les constantes des harnais de test (compagnie, gares).
      await prisma.compagnie.create({ data: { id: COMPAGNIE, code: "ALP", nom: "Alpha Voyages" } });
      for (const g of [GARE_DLA, GARE_BAF, AUTRE_GARE]) {
        await prisma.gare.create({
          data: { id: g.id, compagnieId: COMPAGNIE, code: g.code, nom: g.nom, ville: g.ville },
        });
      }
      const ligne = await fx.ligne(COMPAGNIE, GARE_DLA.id, GARE_BAF.id);
      departId = (await fx.depart(ligne.id)).id;
      t = await creerAppColisTest({ postgres: { url: base.url, departId } });
      equipe = await creerEquipe(t);
    }, 120_000);

    afterAll(async () => {
      await t?.fermer();
    });

    it("le module utilise les adaptateurs PostgreSQL quand API_STOCKAGE=postgres", () => {
      expect(t.app.get(ColisRepository)).toBeInstanceOf(ColisPrisma);
    });

    it("un colis créé dans l'app est en base, avec un numéro du registre, et survit à un relevé direct", async () => {
      const colis = await creerColisApp(t, equipe, {
        departId,
        photoRef: `photos/${randomUUID()}.jpg`,
      });
      expect(colis.numero).toMatch(/^C-DLA-261102-40\d\d$/);
      const { rows } = await sql.query(
        `SELECT numero, canal, etat, version, "gareOrigineId" FROM colis WHERE id = $1`,
        [colis.colisId],
      );
      expect(rows[0]).toMatchObject({
        numero: colis.numero,
        canal: "app",
        etat: "enregistre",
        version: expect.any(Number),
        gareOrigineId: GARE_DLA.id,
      });
      const registre = await sql.query(
        `SELECT numero FROM numero_vu WHERE genre = 'colis' AND "gareId" = $1 AND "evenementId" = $2`,
        [GARE_DLA.id, colis.colisId],
      );
      expect(`C-DLA-261102-${registre.rows[0].numero}`).toBe(colis.numero);
    });

    it("douze personnes devinent le code en même temps : trois essais comptés, colis bloqué, bon code refusé", async () => {
      const colis = await creerColisApp(t, equipe, {
        departId,
        photoRef: `photos/${randomUUID()}.jpg`,
      });
      await amenerJusquaDisponible(t, equipe, colis.colisId);
      const faux = colis.code === "123456" ? "654321" : "123456";
      const remise = (code: string) =>
        scanner(t, equipe.guichetierBaf.jeton, {
          colisId: colis.colisId,
          action: "remettre",
          code,
          pieceVerifiee: true,
          photoRef: `photos/remise-${randomUUID()}.jpg`,
        });

      const reponses = await Promise.all(Array.from({ length: 12 }, () => remise(faux)));
      const statuts = reponses.map((r) => r.status);
      // Deux refus « code invalide » (essais 1 et 2), puis le blocage (423) pour tous les autres.
      expect(statuts.filter((s) => s === 422)).toHaveLength(ESSAIS_CODE_MAX - 1);
      expect(statuts.filter((s) => s === 423)).toHaveLength(12 - (ESSAIS_CODE_MAX - 1));
      expect(statuts.filter((s) => s !== 422 && s !== 423)).toEqual([]);
      const restants = reponses
        .filter((r) => r.status === 422)
        .map((r) => r.body.details.essaisRestants as number)
        .sort();
      expect(restants).toEqual([1, 2]);

      const { rows } = await sql.query(
        `SELECT "codeEssais", "codeBloque", etat FROM colis WHERE id = $1`,
        [colis.colisId],
      );
      expect(rows[0]).toEqual({
        codeEssais: ESSAIS_CODE_MAX,
        codeBloque: true,
        etat: "disponible",
      });

      // Bloqué : même le bon code est refusé.
      expect((await remise(colis.code)).status).toBe(423);
      const { rows: apres } = await sql.query(`SELECT etat FROM colis WHERE id = $1`, [
        colis.colisId,
      ]);
      expect(apres[0].etat).toBe("disponible");

      // Un superviseur débloque : le compteur repart de zéro et le bon code passe.
      const debloque = await t
        .http()
        .post(`/agence/colis/${colis.colisId}/deblocage`)
        .set(entete(equipe.superviseur.jeton));
      expect(debloque.status).toBe(204);
      const ok = await remise(colis.code);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const { rows: fin } = await sql.query(
        `SELECT etat, "codeEssais", "codeBloque", "remiseA" IS NOT NULL AS remis FROM colis WHERE id = $1`,
        [colis.colisId],
      );
      expect(fin[0]).toEqual({ etat: "remis", codeEssais: 0, codeBloque: false, remis: true });
    });

    it("le journal d'audit n'a jamais le code deviné", async () => {
      const { rows } = await sql.query(
        `SELECT action, details FROM journal_audit WHERE action LIKE 'colis.code_%'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(JSON.stringify(rows)).not.toMatch(/"(code|pin)"\s*:\s*"?\d{6}/);
    });
  });
});
