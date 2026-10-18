import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPTIONS_BILLETTERIE } from "../billetterie/passerelle";
import { avec, especes, evenement } from "../billetterie/testing/app-billetterie-test";
import { SessionsCaissePrisma } from "../caisse/postgres";
import { SessionsCaisse } from "../caisse/ports";
import { aammjjDouala, versIsoDouala } from "../caisse/temps";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { ColisRepository } from "../colis/ports";
import { unColis } from "../colis/testing/contrat-ports";
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
import { ImpressionsPrisma } from "./postgres";
import { ImpressionsAgence } from "./ports";
import { contratImpressions, uneImpression } from "./testing/contrat-ports";

/**
 * Le module guichet sur PostgreSQL (recette AM-181, anomalie A2) : le contrat du port des impressions, ce que
 * seule la base garantit (une impression ne se modifie ni ne s'efface, clés étrangères), puis l'accueil, la
 * cadence, le quai et les impressions de bout en bout sur la vraie base (`API_STOCKAGE=postgres`), avec un vrai
 * départ, de vrais billets et de vrais colis.
 */

type Monde = {
  compagnie: { id: string; code: string };
  autre: { id: string; code: string };
  dla: { id: string; code: string; nom: string; ville: string };
  yde: { id: string; code: string; nom: string; ville: string };
  gareAutre: { id: string };
  guichet: { id: string; rang: number };
  departId: string;
  departAutreId: string;
  convoyeurId: string;
};

describe.skipIf(!URL_BASE_TEST)(
  "PostgreSQL réel · accueil du guichet, cadence et impressions",
  () => {
    let base: BaseDeTest;
    let sql: Client;
    let prisma: PrismaService;
    let fx: FixturesPg;

    beforeAll(async () => {
      base = await preparerBaseDeTest();
      sql = base.sql;
      prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
      fx = new FixturesPg(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await base?.fermer();
    });

    const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
      try {
        await sql.query(texte, valeurs);
        return "";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    contratImpressions("PostgreSQL", async () => ({
      impressions: new ImpressionsPrisma(prisma),
      nouveauContexte: async () => {
        const compagnie = await fx.compagnie();
        const auteur = await fx.personne({ compagnieId: compagnie.id });
        return { auteurId: auteur.id, compagnieId: compagnie.id };
      },
      fermer: async () => undefined,
    }));

    describe("ce que seule la base garantit", () => {
      const inserer = (
        id: string,
        auteurId: string,
        surcharge: { document?: string; copies?: number; compagnieId?: string | null } = {},
      ) =>
        erreurSql(
          `INSERT INTO impression_agence ("evenementId", document, "documentId", copies, reimpression,
           "auteurId", "appareilId", "compagnieId", "imprimeeA", "recuA")
         VALUES ($1, $2, 'doc-1', $3, false, $4, 'GU1', $5, now(), now())`,
          [
            id,
            surcharge.document ?? "billet",
            surcharge.copies ?? 1,
            auteurId,
            surcharge.compagnieId ?? null,
          ],
        );

      it("une impression ne se modifie ni ne s'efface, et la table ne se vide pas", async () => {
        const auteur = await fx.personne();
        const id = randomUUID();
        expect(await inserer(id, auteur.id)).toBe("");
        expect(
          await erreurSql(`UPDATE impression_agence SET copies = 2 WHERE "evenementId" = $1`, [id]),
        ).toContain("ajout seul");
        expect(
          await erreurSql(`DELETE FROM impression_agence WHERE "evenementId" = $1`, [id]),
        ).toContain("ajout seul");
        expect(await erreurSql(`TRUNCATE impression_agence`)).toContain("ajout seul");
      });

      it("refuse un document inconnu, un nombre de copies hors de 1 à 5, un auteur ou une compagnie inconnus", async () => {
        const auteur = await fx.personne();
        expect(await inserer(randomUUID(), auteur.id, { document: "facture" })).toContain(
          "impression_agence_document_connu",
        );
        expect(await inserer(randomUUID(), auteur.id, { copies: 0 })).toContain(
          "impression_agence_copies",
        );
        expect(await inserer(randomUUID(), auteur.id, { copies: 6 })).toContain(
          "impression_agence_copies",
        );
        expect(await inserer(randomUUID(), randomUUID())).toContain(
          "impression_agence_auteur_fkey",
        );
        expect(await inserer(randomUUID(), auteur.id, { compagnieId: randomUUID() })).toContain(
          "impression_agence_compagnie_fkey",
        );
      });

      it("l'adaptateur ne perd rien : ce qu'il écrit est ce que la table garde", async () => {
        const compagnie = await fx.compagnie();
        const auteur = await fx.personne({ compagnieId: compagnie.id });
        const i = uneImpression(
          { auteurId: auteur.id, compagnieId: compagnie.id },
          { document: "ticket_caisse", copies: 2, reimpression: true },
        );
        expect(await new ImpressionsPrisma(prisma).ajouter(i)).toBe(true);
        const { rows } = await sql.query(
          `SELECT document, "documentId", copies, reimpression, "appareilId" FROM impression_agence WHERE "evenementId" = $1`,
          [i.evenementId],
        );
        expect(rows).toEqual([
          {
            document: "ticket_caisse",
            documentId: i.documentId,
            copies: 2,
            reimpression: true,
            appareilId: "GU1-DLA",
          },
        ]);
      });
    });

    describe("l'API de bout en bout, stockage PostgreSQL", () => {
      const MOT_DE_PASSE = "Un-mot-de-passe-solide";
      let stockageAvant: string | undefined;
      let app: NestExpressApplication | null = null;
      let monde: Monde;
      let agent: { id: string; jeton: string };
      let compteur = 0;
      let code = 5000;
      let numeroPlage = 0;

      const http = () => request(app!.getHttpServer());
      const maintenant = (): string => versIsoDouala(new Date());
      const lire = (chemin: string, jeton = agent.jeton) => http().get(chemin).set(avec(jeton));
      const poster = (chemin: string, corps: unknown, jeton = agent.jeton) =>
        http()
          .post(chemin)
          .set(avec(jeton))
          .send(corps as object);

      async function demarrer(): Promise<NestExpressApplication> {
        const config = configTest({ DATABASE_URL: base.url });
        const module = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(CONFIG)
          .useValue(config)
          .overrideProvider(OPTIONS_BILLETTERIE)
          .useValue({ balayageMs: 0, pingMs: 0 })
          .compile();
        const a = module.createNestApplication<NestExpressApplication>();
        configurerApp(a, config);
        await a.init();
        a.getHttpServer().setMaxListeners(0);
        return a;
      }

      async function compte(role: Role, guichetId?: string) {
        compteur += 1;
        const p = await app!.get(ComptesService).creer({
          nom: `Test ${role} ${compteur}`,
          telephone: `+2376557${String(compteur).padStart(5, "0")}`,
          roles: [role],
          compagnieId: monde.compagnie.id,
          gareId: monde.dla.id,
          pin: "482915",
          ...(METHODE_PAR_ROLE[role] === "motdepasse_sms" ? { motDePasse: MOT_DE_PASSE } : {}),
        });
        if (guichetId) {
          await prisma.personne.update({ where: { id: p.id }, data: { guichetId } });
        }
        const { accessToken } = await app!.get(TokensService).emettre({
          sub: p.id,
          role,
          cid: p.compagnieId,
          gid: p.gareId,
        });
        return { id: p.id, jeton: accessToken };
      }

      async function vendre(siege: number, cadence = false) {
        const billetId = randomUUID();
        const commun = {
          billetId,
          departId: monde.departId,
          siege,
          prix: 8000,
          paiement: especes(8000),
          codeBillet: String(++code),
        };
        const evt = cadence
          ? evenement(
              agence.EVENEMENT_BILLET_VENDU_CADENCE,
              agent.id,
              maintenant(),
              { ...commun, telephone: null },
              { numeroPlage: ++numeroPlage },
            )
          : evenement(
              agence.EVENEMENT_BILLET_VENDU,
              agent.id,
              maintenant(),
              {
                ...commun,
                classe: "classique",
                bagage: 0,
                passager: {
                  nom: "Aminatou Fotso",
                  telephone: "+237691221008",
                  pieceQuatreDerniers: "4821",
                },
                sms: true,
              },
              { numeroPlage: ++numeroPlage },
            );
        const r = await poster(cadence ? "/agence/cadence/billets" : "/agence/billets", evt);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        return agence.SchemaResultatVente.parse(r.body).billet;
      }

      const evenementImpression = (
        document: "billet" | "etiquette_colis" | "ticket_caisse",
        documentId: string,
        o: { id?: string; copies?: number; reimpression?: boolean } = {},
      ) =>
        evenement(
          agence.EVENEMENT_IMPRESSION_DEMANDEE,
          agent.id,
          maintenant(),
          { document, documentId, copies: o.copies ?? 1, reimpression: o.reimpression ?? false },
          o.id ? { id: o.id } : {},
        );

      beforeAll(async () => {
        stockageAvant = process.env[VARIABLE_STOCKAGE];
        process.env[VARIABLE_STOCKAGE] = "postgres";

        const compagnie = await fx.compagnie();
        const autre = await fx.compagnie();
        const dla = await fx.gare(compagnie.id, { code: "DLA", nom: "Akwa", ville: "Douala" });
        const yde = await fx.gare(compagnie.id, { code: "YDE", nom: "Mvan", ville: "Yaoundé" });
        const gareAutre = await fx.gare(autre.id, {
          code: "DLA",
          nom: "Bonabéri",
          ville: "Douala",
        });
        const gareAutre2 = await fx.gare(autre.id, {
          code: "YDE",
          nom: "Biyem-Assi",
          ville: "Yaoundé",
        });
        const guichet = await fx.guichet(dla.id, 1);
        const ligne = await fx.ligne(compagnie.id, dla.id, yde.id);
        const ligneAutre = await fx.ligne(autre.id, gareAutre.id, gareAutre2.id);
        const bus = await fx.bus(compagnie.id, undefined, 40);
        const chauffeur = await fx.personne({ roles: ["chauffeur"], compagnieId: compagnie.id });
        const convoyeur = await fx.personne({ roles: ["convoyeur"], compagnieId: compagnie.id });
        // Un départ dans deux heures : en vente, bus, équipage et quai.
        const depart = await fx.depart(ligne.id, {
          heureDepart: new Date(Date.now() + 2 * 3_600_000),
          etat: "en_vente",
          quai: 3,
          busId: bus.id,
          chauffeurId: chauffeur.id,
          convoyeurId: convoyeur.id,
        });
        const departAutre = await fx.depart(ligneAutre.id, {
          heureDepart: new Date(Date.now() + 3 * 3_600_000),
        });
        monde = {
          compagnie,
          autre,
          dla,
          yde,
          gareAutre,
          guichet: { ...guichet, rang: 1 },
          departId: depart.id,
          departAutreId: departAutre.id,
          convoyeurId: convoyeur.id,
        };
        app = await demarrer();
        agent = await compte("guichetier", guichet.id);
      }, 120_000);

      afterAll(async () => {
        await app?.close();
        if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
        else process.env[VARIABLE_STOCKAGE] = stockageAvant;
      });

      it("le module utilise l'adaptateur PostgreSQL des impressions", () => {
        expect(app!.get(ImpressionsAgence)).toBeInstanceOf(ImpressionsPrisma);
        expect(app!.get(SessionsCaisse)).toBeInstanceOf(SessionsCaissePrisma);
      });

      it("l'accueil, avant toute vente et sans caisse : compteurs à zéro, vrai prochain départ et vrai quai", async () => {
        const r = await lire("/agence/guichet/accueil");
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        const a = agence.SchemaGuichetAccueil.parse(r.body);
        expect(a.agence).toEqual({ compagnie: `Agence ${monde.compagnie.code}`, gare: "Akwa" });
        expect(a.guichet).toMatchObject({ id: monde.guichet.id, rang: 1, caisseOuverteA: null });
        expect(a.compteurs).toEqual({
          billets: 0,
          colis: 0,
          colisACharger: 0,
          enCaisse: 0,
          ecart: 0,
        });
        expect(a.prochainDepart).toMatchObject({
          departId: monde.departId,
          destination: "Yaoundé",
          placesLibres: 40,
        });
        expect(a.prochainDepart!.dansMinutes).toBeGreaterThan(110);
        expect(a.prochainDepart!.dansMinutes).toBeLessThanOrEqual(120);
        expect(a.quai).toMatchObject({ departId: monde.departId, scannes: 0, capacite: 40 });
      });

      it("après l'ouverture de la caisse, deux ventes (dont une de cadence) et un colis : l'accueil les compte", async () => {
        const ouverture = await poster(
          "/agence/caisse/ouverture",
          evenement(agence.EVENEMENT_CAISSE_OUVERTE, agent.id, maintenant(), {
            sessionId: randomUUID(),
            numero: `K-${monde.dla.code}-${aammjjDouala(new Date())}-1-1`,
            guichetId: monde.guichet.id,
            fondDeCaisse: 20_000,
          }),
        );
        expect(ouverture.status, JSON.stringify(ouverture.body)).toBe(200);

        await vendre(5);
        await vendre(6, true);
        const colis = unColis(
          {
            compagnieId: monde.compagnie.id,
            origine: { ...monde.dla },
            destination: { ...monde.yde },
            expediteurId: randomUUID(),
            auteurId: agent.id,
            departId: monde.departId,
          },
          {
            canal: "agence",
            expediteurId: null,
            etat: "enregistre",
            creeA: maintenant(),
            depose: { a: maintenant(), poidsReleveKg: 2, photoRef: "photo-1", par: agent.id },
          },
        );
        expect(await app!.get(ColisRepository).ajouter(colis)).toBe("ajoute");

        const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
        expect(a.guichet.caisseOuverteA).not.toBeNull();
        expect(a.compteurs.billets).toBe(2);
        expect(a.compteurs.colis).toBe(1);
        expect(a.compteurs.colisACharger).toBe(1);
        // Fond de caisse 20 000 F + deux billets de 8 000 F payés en espèces.
        expect(a.compteurs.enCaisse).toBe(36_000);
        expect(a.cadence.fileAttente).toBe(1);
      });

      it("le mode cadence reconnaît les billets de cadence au type de leur événement, dans la base", async () => {
        const c = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
        expect(c.depart.departId).toBe(monde.departId);
        expect(c.vendusEnCadence).toBe(1);
        expect(c.annulations).toBe(0);
        expect(c.dernierBillet).toMatchObject({ siege: 6, nom: null, sequence: 2 });
        expect(c.prochain.prix).toBe(8000);

        const billetId = c.dernierBillet!.billetId;
        const b = agence.SchemaCadenceBillet.parse(
          (await lire(`/agence/cadence/billets/${billetId}`)).body,
        );
        expect(b.billet.billetId).toBe(billetId);
        expect(b.billet.aCompleterAuQuai).toBe(true);
        expect(b.recapitulatif).toMatchObject({
          plageSansTrou: true,
          siegeBloque: 6,
          imprime: false,
        });
        expect(b.recapitulatif.caisseCash).toBe(8000);

        // Le billet ordinaire (numéro 1) n'est pas un billet de cadence.
        const { rows } = await sql.query(
          `SELECT id FROM billet WHERE sequence = 1 AND "departId" = $1`,
          [monde.departId],
        );
        const ordinaire = await lire(`/agence/cadence/billets/${rows[0].id}`);
        expect(ordinaire.status).toBe(404);
      });

      it("le quai de la cadence montre le billet sans nom scanné", async () => {
        expect((await lire("/agence/quai/cadence")).status).toBe(404);
        const c = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
        const { rows } = await sql.query(`SELECT qr FROM billet WHERE id = $1`, [
          c.dernierBillet!.billetId,
        ]);
        const scan = await poster(
          "/agence/quai/scans",
          evenement(agence.EVENEMENT_QUAI_SCANNE, agent.id, maintenant(), {
            departId: monde.departId,
            qr: rows[0].qr,
          }),
        );
        expect(scan.status, JSON.stringify(scan.body)).toBe(200);
        expect(scan.body.scan.resultat).toBe("sans_nom");

        const r = await lire("/agence/quai/cadence");
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        const q = agence.SchemaQuaiCadence.parse(r.body);
        expect(q.quai).toBe(3);
        expect(q.scan).toMatchObject({
          billetId: c.dernierBillet!.billetId,
          siege: 6,
          guichetRang: 1,
          paiement: "cash",
          montant: 8000,
        });
        expect(q.convoyeur.id).toBe(monde.convoyeurId);
        expect(q.sansNom.total).toBe(1);
        expect(q.embarquement).toMatchObject({ embarques: 0, capacite: 40, cadenceCompletes: 0 });
      });

      it("les impressions sont écrites en base ; rejouer ne change rien ; le récapitulatif le sait", async () => {
        const c = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
        const billetId = c.dernierBillet!.billetId;
        const evt = evenementImpression("billet", billetId);
        const un = await poster("/agence/impressions", evt);
        expect(un.status, JSON.stringify(un.body)).toBe(200);
        expect(agence.SchemaResultatImpression.parse(un.body)).toMatchObject({
          statut: "imprime",
          accuse: { statut: "accepte" },
        });
        const deux = agence.SchemaResultatImpression.parse(
          (await poster("/agence/impressions", evt)).body,
        );
        expect(deux.accuse.statut).toBe("deja_recu");

        await poster(
          "/agence/impressions",
          evenementImpression("billet", billetId, { copies: 2, reimpression: true }),
        );
        const { rows } = await sql.query(
          `SELECT copies, reimpression, "auteurId", "compagnieId" FROM impression_agence
         WHERE document = 'billet' AND "documentId" = $1 ORDER BY "imprimeeA", copies`,
          [billetId],
        );
        expect(rows).toEqual([
          { copies: 1, reimpression: false, auteurId: agent.id, compagnieId: monde.compagnie.id },
          { copies: 2, reimpression: true, auteurId: agent.id, compagnieId: monde.compagnie.id },
        ]);

        const b = agence.SchemaCadenceBillet.parse(
          (await lire(`/agence/cadence/billets/${billetId}`)).body,
        );
        expect(b.recapitulatif.imprime).toBe(true);
      });

      it("imprime l'étiquette d'un colis et le ticket de la caisse ouverte", async () => {
        const { rows: colis } = await sql.query(`SELECT id FROM colis WHERE "deposePar" = $1`, [
          agent.id,
        ]);
        expect(colis).toHaveLength(1);
        const etiquette = await poster(
          "/agence/impressions",
          evenementImpression("etiquette_colis", colis[0].id),
        );
        expect(etiquette.status, JSON.stringify(etiquette.body)).toBe(200);
        const { rows: sessions } = await sql.query(
          `SELECT id FROM session_caisse WHERE "agentId" = $1`,
          [agent.id],
        );
        expect(sessions).toHaveLength(1);
        const ticket = await poster(
          "/agence/impressions",
          evenementImpression("ticket_caisse", sessions[0].id),
        );
        expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
      });

      it("refuse (404) le billet d'une autre compagnie ; un identifiant qui n'est pas un UUID est accepté tel quel", async () => {
        const etranger = await fx.billet({
          compagnieId: monde.autre.id,
          gareId: monde.gareAutre.id,
          departId: monde.departAutreId,
        });
        const r = await poster("/agence/impressions", evenementImpression("billet", etranger.id));
        expect(r.status).toBe(404);
        expect(r.body).toMatchObject({ code: "DOCUMENT_INCONNU" });
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM impression_agence WHERE "documentId" = $1`,
          [etranger.id],
        );
        expect(rows[0].n).toBe(0);

        const libre = await poster(
          "/agence/impressions",
          evenementImpression("billet", "billet-hors-ligne-1"),
        );
        expect(libre.status, JSON.stringify(libre.body)).toBe(200);
      });

      it("l'état de l'imprimante", async () => {
        const r = await lire("/agence/impression");
        expect(r.status).toBe(200);
        expect(agence.SchemaImpressionEtat.parse(r.body).imprimante.etat).toBe("ok");
      });

      it("tous les billets de cadence annulés : la cadence les compte parmi les annulations", async () => {
        const c = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
        await prisma.billet.update({
          where: { id: c.dernierBillet!.billetId },
          data: { etat: "annule" },
        });
        const apres = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
        expect(apres.vendusEnCadence).toBe(0);
        expect(apres.annulations).toBe(1);
        expect(apres.dernierBillet).toBeNull();
      });
    });
  },
);
