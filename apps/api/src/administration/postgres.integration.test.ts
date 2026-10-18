import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../socle/db/prisma.service";
import { creerAppPg, type AppPg } from "../socle/testing/app-pg";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { AppareilsMemoire } from "../sync/memoire";
import { AppareilsSyncPrisma } from "../sync/postgres";
import { AppareilsSync } from "../sync/ports";
import {
  AnnuaireAdminMemoire,
  LignesMemoire,
  OrdresAppareilsMemoire,
  ParcBusMemoire,
  ProgrammeMemoire,
  RegistreAppareilsMemoire,
} from "./memoire";
import {
  AnnuaireAdmin,
  Lignes,
  OrdresAppareils,
  ParcBus,
  Programme,
  RegistreAppareils,
} from "./ports";
import {
  AnnuaireAdminPrisma,
  LignesPrisma,
  OrdresAppareilsPrisma,
  ParcBusPrisma,
  ProgrammePrisma,
  RegistreAppareilsPrisma,
} from "./postgres";
import {
  contratPortsAdministration,
  type AgenceDeTest,
  type BancAdministration,
} from "./testing/contrat-ports";

/**
 * Adaptateurs de l'administration : les mêmes tests de contrat sur la mémoire (toujours) et sur PostgreSQL (quand
 * DATABASE_URL_TEST est définie), puis ce que seule la base garantit (horaire unique par heure, ordre en attente
 * unique, accusé écrit une fois) et l'API de bout en bout avec `API_STOCKAGE=postgres`, redémarrage compris.
 */

let compteurAgences = 0;
const code3 = (): string => {
  compteurAgences += 1;
  const n = compteurAgences;
  return [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26]
    .map((x) => String.fromCharCode(66 + (x % 25)))
    .join("");
};

contratPortsAdministration(
  "contrat · adaptateurs en mémoire",
  async (): Promise<BancAdministration> => {
    const annuaire = new AnnuaireAdminMemoire();
    const lignes = new LignesMemoire();
    const appareilsSync = new AppareilsMemoire();
    return {
      annuaire,
      lignes,
      parc: new ParcBusMemoire(),
      programme: new ProgrammeMemoire(lignes),
      registre: new RegistreAppareilsMemoire(),
      ordres: new OrdresAppareilsMemoire(),
      nouvelleAgence: async () => {
        const compagnie = { id: randomUUID(), code: code3(), nom: "Agence test" };
        const origine = {
          id: randomUUID(),
          compagnieId: compagnie.id,
          code: "DLA",
          nom: "Akwa",
          ville: "Douala",
        };
        const destination = {
          id: randomUUID(),
          compagnieId: compagnie.id,
          code: "YDE",
          nom: "Mvan",
          ville: "Yaoundé",
        };
        annuaire.declarerCompagnie(compagnie);
        annuaire.declarerGare(origine);
        annuaire.declarerGare(destination);
        return { compagnie, origine, destination };
      },
      nouvellePersonne: async () => randomUUID(),
      nouvelAppareilSync: async (agence: AgenceDeTest) => {
        const id = `tel-${randomUUID()}`;
        await appareilsSync.declarer({
          id,
          gareId: agence.origine.id,
          compagnieId: agence.compagnie.id,
        });
        return id;
      },
      fermer: async () => undefined,
    };
  },
);

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · administration", () => {
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

  async function nouvelleAgence(): Promise<AgenceDeTest> {
    const compagnie = await prisma.compagnie.create({
      data: { code: code3(), nom: "Agence test" },
    });
    const origine = await prisma.gare.create({
      data: { compagnieId: compagnie.id, code: "DLA", nom: "Akwa", ville: "Douala" },
    });
    const destination = await prisma.gare.create({
      data: { compagnieId: compagnie.id, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
    });
    return {
      compagnie: { id: compagnie.id, code: compagnie.code, nom: compagnie.nom },
      origine: {
        id: origine.id,
        compagnieId: compagnie.id,
        code: "DLA",
        nom: "Akwa",
        ville: "Douala",
      },
      destination: {
        id: destination.id,
        compagnieId: compagnie.id,
        code: "YDE",
        nom: "Mvan",
        ville: "Yaoundé",
      },
    };
  }

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsAdministration(
    "contrat · adaptateurs PostgreSQL",
    async (): Promise<BancAdministration> => {
      const appareilsSync = new AppareilsSyncPrisma(prisma);
      return {
        annuaire: new AnnuaireAdminPrisma(prisma),
        lignes: new LignesPrisma(prisma),
        parc: new ParcBusPrisma(prisma),
        programme: new ProgrammePrisma(prisma),
        registre: new RegistreAppareilsPrisma(prisma),
        ordres: new OrdresAppareilsPrisma(prisma),
        nouvelleAgence,
        nouvellePersonne: async (compagnieId) => {
          const p = await prisma.personne.create({
            data: {
              nom: "Chauffeur test",
              telephoneChiffre: `chiffre-${randomUUID()}`,
              telephoneIndex: `index-${randomUUID()}`,
              roles: ["chauffeur"],
              compagnieId,
            },
          });
          return p.id;
        },
        nouvelAppareilSync: async (agence) => {
          const id = `tel-${randomUUID()}`;
          await appareilsSync.declarer({
            id,
            gareId: agence.origine.id,
            compagnieId: agence.compagnie.id,
          });
          return id;
        },
        fermer: async () => undefined,
      };
    },
  );

  describe("ce que la base garantit seule", () => {
    async function uneLigne() {
      const a = await nouvelleAgence();
      const l = await new LignesPrisma(prisma).creer({
        compagnieId: a.compagnie.id,
        code: "DLAYDE",
        origineGareId: a.origine.id,
        destinationGareId: a.destination.id,
        tarifs: { classique: 4000, vip: 6000, bagage: 500 },
        dureeMinutes: 240,
        arrets: [
          { nom: "Douala", kmDepuisOrigine: 0, montee: true },
          { nom: "Yaoundé", kmDepuisOrigine: 240, montee: false },
        ],
        plan: { capacite: 70, disposition: "2+2", rangees: 18 },
        options: { venteEnLigne: true, fusionAuto: false },
      });
      return { a, ligneId: l!.id };
    }

    const horaire = (ligneId: string, heure: string, actif = true, jours = "{}") =>
      sql.query(
        `INSERT INTO horaire_ligne (id, "ligneId", heure, classe, actif, jours) VALUES ($1, $2, $3, 'classique', $4, $5::text[])`,
        [randomUUID(), ligneId, heure, actif, jours],
      );

    it("deux horaires actifs à la même heure sont refusés par la base, un horaire désactivé non", async () => {
      const { ligneId } = await uneLigne();
      await horaire(ligneId, "06:00");
      await expect(horaire(ligneId, "06:00")).rejects.toThrow(/horaire_ligne_actif_unique/);
      await horaire(ligneId, "06:00", false);
      await horaire(ligneId, "07:00");
    });

    it("un horaire refuse une heure mal écrite et un jour inconnu", async () => {
      const { ligneId } = await uneLigne();
      await expect(horaire(ligneId, "6:00")).rejects.toThrow(/horaire_ligne_heure_forme/);
      await expect(horaire(ligneId, "24:00")).rejects.toThrow(/horaire_ligne_heure_forme/);
      await expect(horaire(ligneId, "06:00", true, "{lundi}")).rejects.toThrow(
        /horaire_ligne_jours_connus/,
      );
    });

    it("le réglage d'une ligne refuse un plan incohérent et un brouillon sans jour d'effet", async () => {
      const { ligneId } = await uneLigne();
      expect(
        await erreurSql(`UPDATE reglage_ligne SET disposition = 'deux' WHERE "ligneId" = $1`, [
          ligneId,
        ]),
      ).toMatch(/reglage_ligne_plan/);
      expect(
        await erreurSql(`UPDATE reglage_ligne SET brouillon = '{}'::jsonb WHERE "ligneId" = $1`, [
          ligneId,
        ]),
      ).toMatch(/reglage_ligne_brouillon/);
      expect(
        await erreurSql(
          `UPDATE reglage_ligne SET brouillon = '{}'::jsonb, "effetDu" = '09/11/2026' WHERE "ligneId" = $1`,
          [ligneId],
        ),
      ).toMatch(/reglage_ligne_effet_forme/);
    });

    async function unAppareil() {
      const a = await nouvelleAgence();
      const id = `tel-${randomUUID()}`;
      await new AppareilsSyncPrisma(prisma).declarer({
        id,
        gareId: a.origine.id,
        compagnieId: a.compagnie.id,
      });
      return { a, id };
    }

    const enrolement = (appareilId: string, compagnieId: string, code: string | null) =>
      sql.query(
        `INSERT INTO enrolement_appareil ("appareilId", "compagnieId", "codeHache", "codeExpireA") VALUES ($1, $2, $3, $4)`,
        [appareilId, compagnieId, code, code === null ? null : new Date()],
      );

    it("un code d'enrôlement n'ouvre qu'un appareil, et un code va avec son échéance", async () => {
      const { a, id } = await unAppareil();
      const autre = await unAppareil();
      const code = `c-${randomUUID()}`;
      await enrolement(id, a.compagnie.id, code);
      await expect(enrolement(autre.id, autre.a.compagnie.id, code)).rejects.toThrow(
        /enrolement_appareil_code_unique/,
      );
      expect(
        await erreurSql(
          `INSERT INTO enrolement_appareil ("appareilId", "compagnieId", "codeHache") VALUES ($1, $2, 'x')`,
          [autre.id, autre.a.compagnie.id],
        ),
      ).toMatch(/enrolement_appareil_code_et_echeance/);
      expect(
        await erreurSql(
          `INSERT INTO enrolement_appareil ("appareilId", "compagnieId") VALUES ('inconnu', $1)`,
          [a.compagnie.id],
        ),
      ).toMatch(/enrolement_appareil_appareil_fkey/);
    });

    it("un seul ordre en attente par appareil, et un type d'ordre connu", async () => {
      const { id } = await unAppareil();
      const inserer = (type = "effacer") =>
        erreurSql(
          `INSERT INTO commande_appareil (id, "appareilId", type, "emiseA") VALUES ($1, $2, $3, now())`,
          [randomUUID(), id, type],
        );
      expect(await inserer()).toBe("");
      expect(await inserer()).toMatch(/commande_appareil_en_attente/);
      expect(await inserer("redemarrer")).toMatch(/commande_appareil_type/);
    });

    it("l'accusé s'écrit une fois ; un ordre ne change plus, ne se supprime pas, et un accusé va avec son rapport", async () => {
      const { id } = await unAppareil();
      const ordre = randomUUID();
      await sql.query(
        `INSERT INTO commande_appareil (id, "appareilId", type, "emiseA") VALUES ($1, $2, 'effacer', now())`,
        [ordre, id],
      );
      expect(
        await erreurSql(`UPDATE commande_appareil SET "acquitteeA" = now() WHERE id = $1`, [ordre]),
      ).toMatch(/commande_appareil_rapport/);
      expect(
        await erreurSql(`UPDATE commande_appareil SET motif = 'autre' WHERE id = $1`, [ordre]),
      ).toMatch(/seul l'accusé s'écrit/);
      expect(
        await erreurSql(
          `UPDATE commande_appareil SET "acquitteeA" = now(), rapport = '{"complet":true}'::jsonb, motif = 'truqué' WHERE id = $1`,
          [ordre],
        ),
      ).toMatch(/seul l'accusé s'écrit/);
      expect(
        await erreurSql(
          `UPDATE commande_appareil SET "acquitteeA" = now(), rapport = '{"complet":true}'::jsonb WHERE id = $1`,
          [ordre],
        ),
      ).toBe("");
      expect(
        await erreurSql(
          `UPDATE commande_appareil SET "acquitteeA" = now() + interval '1 hour', rapport = '{"complet":false}'::jsonb WHERE id = $1`,
          [ordre],
        ),
      ).toMatch(/déjà acquitté/);
      expect(await erreurSql(`DELETE FROM commande_appareil WHERE id = $1`, [ordre])).toMatch(
        /suppression interdite/,
      );
    });
  });

  describe("l'API entière sur PostgreSQL", () => {
    let app: AppPg;
    let patronJeton: string;
    let ids: { compagnieId: string; origine: string; destination: string };

    beforeAll(async () => {
      const a = await nouvelleAgence();
      ids = { compagnieId: a.compagnie.id, origine: a.origine.id, destination: a.destination.id };
      app = await creerAppPg({ url: base.url });
      patronJeton = (await app.compte("patron", { compagnieId: ids.compagnieId })).jeton;
    }, 120_000);

    afterAll(async () => {
      await app?.fermer();
    });

    const auth = () => ({ Authorization: `Bearer ${patronJeton}` });
    const signature = () => ({
      pin: "482915",
      methode: "pin",
      signeA: new Date(app.horloge.maintenant().getTime() + 3_600_000)
        .toISOString()
        .replace("Z", "+01:00"),
    });

    it("le module utilise les adaptateurs PostgreSQL quand API_STOCKAGE=postgres", () => {
      expect(app.resoudre(AnnuaireAdmin)).toBeInstanceOf(AnnuaireAdminPrisma);
      expect(app.resoudre(Lignes)).toBeInstanceOf(LignesPrisma);
      expect(app.resoudre(ParcBus)).toBeInstanceOf(ParcBusPrisma);
      expect(app.resoudre(Programme)).toBeInstanceOf(ProgrammePrisma);
      expect(app.resoudre(RegistreAppareils)).toBeInstanceOf(RegistreAppareilsPrisma);
      expect(app.resoudre(OrdresAppareils)).toBeInstanceOf(OrdresAppareilsPrisma);
    });

    let ligneId = "";
    let secret = "";
    let appareilId = "";

    it("crée une ligne, publie ses horaires et génère les départs de la semaine", async () => {
      const creee = await app
        .http()
        .post("/patron/reglages/lignes")
        .set(auth())
        .send({
          origineGareId: ids.origine,
          destinationGareId: ids.destination,
          tarifs: { classique: 4000, vip: 6000, bagage: 500 },
          arrets: ["Édéa"],
          capacite: 70,
          signature: signature(),
        });
      expect(creee.status, JSON.stringify(creee.body)).toBe(201);
      ligneId = creee.body.ligne.id;
      const pub = await app
        .http()
        .put(`/patron/reglages/lignes/${ligneId}`)
        .set(auth())
        .send({
          ligneId,
          departs: [
            {
              id: null,
              heure: "05:30",
              heureInitiale: null,
              classe: "classique",
              prix: 4000,
              actif: true,
              note: null,
              jours: [],
              nouveau: true,
            },
            {
              id: null,
              heure: "08:00",
              heureInitiale: null,
              classe: "vip",
              prix: 6000,
              actif: true,
              note: null,
              jours: ["lun"],
              nouveau: true,
            },
          ],
          signature: signature(),
        });
      expect(pub.status, JSON.stringify(pub.body)).toBe(200);
      // L'horloge de test est au lundi 4 janvier 2027, 9 h à Douala.
      const generation = await app
        .http()
        .post("/admin/departs/generer")
        .set(auth())
        .send({ du: "2027-01-04", au: "2027-01-10" });
      expect(generation.status, JSON.stringify(generation.body)).toBe(200);
      expect(generation.body).toMatchObject({ passes: 2, dejaPresents: 0 });
      expect(generation.body.crees).toHaveLength(6);
      const rejeu = await app
        .http()
        .post("/admin/departs/generer")
        .set(auth())
        .send({ du: "2027-01-04", au: "2027-01-10" });
      expect(rejeu.body).toMatchObject({ crees: [], dejaPresents: 6 });
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM depart WHERE "ligneId" = $1`,
        [ligneId],
      );
      expect(rows[0].n).toBe(6);
    });

    it("équipe un départ avec un bus et refuse le même bus sur un départ qui chevauche", async () => {
      const bus = await app
        .http()
        .post("/admin/bus")
        .set(auth())
        .send({ immatriculation: "LT 77 PG", capacite: 70, classe: "classique" });
      expect(bus.status).toBe(201);
      const departs = await app.http().get("/admin/departs?jour=2027-01-05").set(auth());
      expect(departs.body).toHaveLength(1);
      const ok = await app
        .http()
        .patch(`/admin/departs/${departs.body[0].id}/equipage`)
        .set(auth())
        .send({ busId: bus.body.id, quai: 2 });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const autre = await app.http().post("/admin/departs").set(auth()).send({
        ligneId,
        heureDepart: "2027-01-05T07:00:00.000+01:00",
        busId: bus.body.id,
      });
      expect(autre.status).toBe(409);
      expect(autre.body.code).toBe("RESSOURCE_OCCUPEE");
    });

    it("déclare un appareil, l'enrôle, lui envoie l'ordre d'effacement et reçoit l'accusé, une seule fois", async () => {
      const d = await app.http().post("/admin/appareils").set(auth()).send({
        genre: "guichet",
        rang: 1,
        gareId: ids.origine,
        signature: signature(),
      });
      expect(d.status, JSON.stringify(d.body)).toBe(201);
      appareilId = d.body.appareil.id;
      const fiche = await app.resoudre(AppareilsSync).trouver(appareilId);
      expect(fiche).toMatchObject({ genre: "guichet", rang: 1, gareId: ids.origine });
      const e = await app
        .http()
        .post("/appareils/enrolement")
        .send({ code: d.body.codeEnrolement });
      expect(e.status).toBe(200);
      secret = e.body.secret;
      const emis = await app
        .http()
        .post(`/admin/appareils/${appareilId}/effacement`)
        .set(auth())
        .send({ motif: "Vol", signature: signature() });
      expect(emis.status, JSON.stringify(emis.body)).toBe(201);
      const lu = await app
        .http()
        .get(`/appareils/${appareilId}/commande`)
        .set({ Authorization: `Bearer ${secret}` });
      expect(lu.body.commande).toMatchObject({ id: emis.body.commandeId, type: "effacer" });
      const accuse = (s: string) =>
        app
          .http()
          .post(`/appareils/${appareilId}/commandes/${emis.body.commandeId}/acquittement`)
          .set({ Authorization: `Bearer ${s}` })
          .send({
            effaceA: "2027-01-04T09:01:00.000+01:00",
            complet: true,
            etapes: [{ nom: "localStorage", ok: true }],
          });
      expect((await accuse("faux")).status).toBe(401);
      const [a, b] = await Promise.all([
        accuse(lu.body.commande.secretAcquittement),
        accuse(lu.body.commande.secretAcquittement),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const { rows } = await sql.query(
        `SELECT "acquitteeA", rapport FROM commande_appareil WHERE id = $1`,
        [emis.body.commandeId],
      );
      expect(rows[0].acquitteeA).not.toBeNull();
      expect(rows[0].rapport).toMatchObject({ complet: true });
      expect(
        (
          await app
            .http()
            .get(`/appareils/${appareilId}/commande`)
            .set({ Authorization: `Bearer ${secret}` })
        ).status,
      ).toBe(401);
    });

    it("après un redémarrage de l'API, lignes, départs et appareils sont toujours là", async () => {
      const d = await app.http().post("/admin/appareils").set(auth()).send({
        genre: "guichet",
        rang: 2,
        gareId: ids.origine,
        signature: signature(),
      });
      const e = await app
        .http()
        .post("/appareils/enrolement")
        .send({ code: d.body.codeEnrolement });
      const nouveau = await creerAppPg({ url: base.url });
      try {
        const jeton = (
          await nouveau.compte("patron", {
            compagnieId: ids.compagnieId,
            telephone: "+237655199999",
          })
        ).jeton;
        const lignes = await nouveau
          .http()
          .get("/admin/lignes")
          .set({ Authorization: `Bearer ${jeton}` });
        expect(lignes.body.map((l: { id: string }) => l.id)).toEqual([ligneId]);
        const departs = await nouveau
          .http()
          .get("/admin/departs?jour=2027-01-06")
          .set({ Authorization: `Bearer ${jeton}` });
        expect(departs.body).toHaveLength(1);
        // L'appareil enrôlé avant le redémarrage lit encore ses ordres avec le même secret.
        const lu = await nouveau
          .http()
          .get(`/appareils/${d.body.appareil.id}/commande`)
          .set({ Authorization: `Bearer ${e.body.secret}` });
        expect(lu.status).toBe(200);
        expect(lu.body).toEqual({ commande: null });
      } finally {
        await nouveau.fermer();
      }
    });
  });
});
