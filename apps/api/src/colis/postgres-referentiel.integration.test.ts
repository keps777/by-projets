import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
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
import { ReferentielMemoire } from "./memoire";
import { ColisPrisma } from "./postgres";
import {
  ETATS_DEPART_OUVERTS_AUX_COLIS,
  PORT_COLIS_PAR_DEFAUT,
  ReferentielColisPrisma,
  pourcentageSoute,
} from "./postgres-referentiel";
import { ReferentielColis } from "./ports";
import { creerAppColisTest, entete, evenementEnregistre } from "./testing/app-colis-test";
import type { AppColisTest } from "./testing/app-colis-test";
import { unColis } from "./testing/contrat-ports";

/**
 * Le référentiel du module colis sur PostgreSQL (recette AM-181, anomalie A5) : avant, le module colis lisait
 * un annuaire en mémoire, vide au démarrage, et `POST /agence/colis` répondait 404 `DEPART_INCONNU` pour un
 * départ qui existait en base. Ces tests lisent de vraies lignes (compagnie, gares, lignes, bus, départs,
 * guichets) et passent par l'API complète.
 */

type EtatDepart =
  | "programme"
  | "en_vente"
  | "embarquement"
  | "parti"
  | "arrive"
  | "annule"
  | "retarde";

describe("pourcentageSoute", () => {
  it("un colis par place de soute, en pourcentage entier plafonné à 100", () => {
    expect(pourcentageSoute(0, 20)).toBe(0);
    expect(pourcentageSoute(5, 20)).toBe(25);
    expect(pourcentageSoute(1, 3)).toBe(33);
    expect(pourcentageSoute(2, 3)).toBe(67);
    expect(pourcentageSoute(30, 20)).toBe(100);
  });

  it("0 quand la soute n'est pas renseignée ou qu'il n'y a pas de bus", () => {
    expect(pourcentageSoute(5, 0)).toBe(0);
    expect(pourcentageSoute(5, -1)).toBe(0);
  });
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · référentiel du module colis", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let fx: FixturesPg;
  let referentiel: ReferentielColisPrisma;

  /** 2026-11-02 09:00 à Douala : l'horloge des harnais de test du module. */
  const MAINTENANT = "2026-11-02T09:00:00.000+01:00";
  const heure = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 2, h - 1, m));

  const monde = {
    compagnie: { id: "", code: "" },
    autre: { id: "", code: "" },
    dla: { id: "", code: "DLA", nom: "Akwa", ville: "Douala" },
    yde: { id: "", code: "YDE", nom: "Mvan", ville: "Yaoundé" },
    baf: { id: "", code: "BAF", nom: "Gare routière", ville: "Bafoussam" },
    gareAutre: { id: "", code: "DLA", nom: "Bonabéri", ville: "Douala" },
    guichet: { id: "", rang: 2 },
    guichetier: { id: "" },
    ligneDlaYde: { id: "" },
    ligneDlaBaf: { id: "" },
    ligneAutre: { id: "" },
    bus: { id: "" },
    departs: {
      ouvert: "",
      embarquement: "",
      retarde: "",
      programme: "",
      parti: "",
      annule: "",
      autreCompagnie: "",
      sansBus: "",
    },
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    fx = new FixturesPg(prisma);
    referentiel = new ReferentielColisPrisma(prisma);

    const c = await fx.compagnie();
    monde.compagnie = c;
    monde.autre = await fx.compagnie();
    for (const g of [monde.dla, monde.yde, monde.baf]) {
      const cree = await fx.gare(c.id, { code: g.code, nom: g.nom, ville: g.ville });
      g.id = cree.id;
    }
    monde.gareAutre.id = (
      await fx.gare(monde.autre.id, { code: "DLA", nom: "Bonabéri", ville: "Douala" })
    ).id;
    monde.guichet = { ...(await fx.guichet(monde.dla.id, 2)), rang: 2 };
    monde.guichetier = await fx.personne({
      roles: ["guichetier"],
      compagnieId: c.id,
      gareId: monde.dla.id,
      guichetId: monde.guichet.id,
    });

    monde.ligneDlaYde = await fx.ligne(c.id, monde.dla.id, monde.yde.id);
    await prisma.ligne.update({ where: { id: monde.ligneDlaYde.id }, data: { dureeMinutes: 300 } });
    monde.ligneDlaBaf = await fx.ligne(c.id, monde.dla.id, monde.baf.id);
    monde.ligneAutre = await fx.ligne(monde.autre.id, monde.gareAutre.id, monde.yde.id);
    monde.bus = await fx.bus(c.id);

    const depart = async (
      ligneId: string,
      h: number,
      etat: EtatDepart,
      busId: string | null = monde.bus.id,
    ) => (await fx.depart(ligneId, { heureDepart: heure(h), etat, busId })).id;
    monde.departs.ouvert = await depart(monde.ligneDlaYde.id, 10, "en_vente");
    monde.departs.embarquement = await depart(monde.ligneDlaBaf.id, 9, "embarquement");
    monde.departs.retarde = await depart(monde.ligneDlaYde.id, 14, "retarde");
    monde.departs.programme = await depart(monde.ligneDlaYde.id, 11, "programme");
    monde.departs.parti = await depart(monde.ligneDlaYde.id, 12, "parti");
    monde.departs.annule = await depart(monde.ligneDlaYde.id, 13, "annule");
    monde.departs.autreCompagnie = await depart(monde.ligneAutre.id, 10, "en_vente");
    monde.departs.sansBus = await depart(monde.ligneDlaYde.id, 15, "en_vente", null);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  const critere = (
    surcharge: Partial<Parameters<ReferentielColisPrisma["departsOuverts"]>[0]> = {},
  ) => ({
    gareOrigineId: monde.dla.id,
    compagnieId: monde.compagnie.id,
    villeDestination: null,
    apres: MAINTENANT,
    ...surcharge,
  });

  describe("départs", () => {
    it("liste les départs à venir qui acceptent des colis, du plus proche au plus lointain", async () => {
      const departs = await referentiel.departsOuverts(critere());
      // 09:00 est l'heure courante : le départ de 09:00 (embarquement) n'est plus « à venir ».
      expect(departs.map((d) => d.id)).toEqual([
        monde.departs.ouvert, // 10:00 en vente
        monde.departs.retarde, // 14:00 retardé
        monde.departs.sansBus, // 15:00 en vente, sans bus
      ]);
      expect(departs.every((d) => d.ouvertAuColis)).toBe(true);
    });

    it("n'écarte pas un départ en embarquement qui n'est pas encore parti", async () => {
      const departs = await referentiel.departsOuverts(
        critere({ apres: "2026-11-02T08:00:00.000+01:00" }),
      );
      expect(departs.map((d) => d.id)).toEqual([
        monde.departs.embarquement,
        monde.departs.ouvert,
        monde.departs.retarde,
        monde.departs.sansBus,
      ]);
    });

    it("ne propose jamais un départ programmé, parti ou annulé", async () => {
      const ids = (
        await referentiel.departsOuverts(critere({ apres: "2026-11-01T00:00:00.000+01:00" }))
      ).map((d) => d.id);
      for (const exclu of [monde.departs.programme, monde.departs.parti, monde.departs.annule]) {
        expect(ids).not.toContain(exclu);
      }
      expect([...ETATS_DEPART_OUVERTS_AUX_COLIS]).toEqual(["en_vente", "embarquement", "retarde"]);
    });

    it("filtre par gare d'origine, par compagnie et par ville de destination (sans tenir compte de la casse)", async () => {
      const versYaounde = await referentiel.departsOuverts(
        critere({ villeDestination: "YAOUNDÉ" }),
      );
      expect(versYaounde.map((d) => d.id)).toEqual([
        monde.departs.ouvert,
        monde.departs.retarde,
        monde.departs.sansBus,
      ]);
      const versBafoussam = await referentiel.departsOuverts(
        critere({ villeDestination: "bafoussam", apres: "2026-11-02T08:00:00.000+01:00" }),
      );
      expect(versBafoussam.map((d) => d.id)).toEqual([monde.departs.embarquement]);

      // Les départs de l'autre compagnie ne sont vus que par sa gare, sa compagnie.
      const autre = await referentiel.departsOuverts({
        gareOrigineId: monde.gareAutre.id,
        compagnieId: monde.autre.id,
        villeDestination: null,
        apres: MAINTENANT,
      });
      expect(autre.map((d) => d.id)).toEqual([monde.departs.autreCompagnie]);
      expect(await referentiel.departsOuverts(critere({ compagnieId: monde.autre.id }))).toEqual(
        [],
      );

      // Sans critère de gare ni de compagnie : tous les départs ouverts à venir.
      const tous = await referentiel.departsOuverts(
        critere({ gareOrigineId: null, compagnieId: null }),
      );
      expect(tous.map((d) => d.id)).toContain(monde.departs.autreCompagnie);
      expect(tous.map((d) => d.id)).toContain(monde.departs.ouvert);
    });

    it("des identifiants qui ne sont pas des UUID ne donnent ni erreur SQL ni départ", async () => {
      expect(await referentiel.departsOuverts(critere({ gareOrigineId: "pas-un-uuid" }))).toEqual(
        [],
      );
      expect(await referentiel.departsOuverts(critere({ compagnieId: "pas-un-uuid" }))).toEqual([]);
      expect(await referentiel.depart("dep-alp-dlabaf-261102-1000")).toBeNull();
      expect(await referentiel.depart(randomUUID())).toBeNull();
    });

    it("décrit un départ : compagnie, gares, heures de Douala, port, soute vide, ouvert aux colis", async () => {
      const d = await referentiel.depart(monde.departs.ouvert);
      expect(d).toEqual({
        id: monde.departs.ouvert,
        compagnieId: monde.compagnie.id,
        compagnieNom: `Agence ${monde.compagnie.code}`,
        gareOrigine: { id: monde.dla.id, code: "DLA", nom: "Akwa", ville: "Douala" },
        gareDestination: { id: monde.yde.id, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
        heureDepart: "2026-11-02T10:00:00.000+01:00",
        // 300 minutes de trajet sur la ligne.
        arriveePrevue: "2026-11-02T15:00:00.000+01:00",
        portColis: PORT_COLIS_PAR_DEFAUT,
        soutePct: 0,
        ouvertAuColis: true,
      });
    });

    it("rend aussi un départ fermé aux colis (le service refuse ensuite avec DEPART_FERME), et 0 de soute sans bus", async () => {
      const parti = await referentiel.depart(monde.departs.parti);
      expect(parti?.ouvertAuColis).toBe(false);
      const sansBus = await referentiel.depart(monde.departs.sansBus);
      expect(sansBus).toMatchObject({ soutePct: 0, ouvertAuColis: true });
    });

    it("sans durée de ligne, l'arrivée prévue est l'heure de départ", async () => {
      const d = await referentiel.depart(monde.departs.embarquement);
      expect(d?.arriveePrevue).toBe(d?.heureDepart);
    });

    it("la soute est la part des places occupées par des colis enregistrés, chargés ou en route", async () => {
      const colis = new ColisPrisma(
        prisma,
        new ChiffrementService(configTest({ DATABASE_URL: base.url })),
      );
      const contexte = {
        compagnieId: monde.compagnie.id,
        origine: monde.dla,
        destination: monde.yde,
        expediteurId: monde.guichetier.id,
        auteurId: monde.guichetier.id,
        departId: monde.departs.retarde,
      };
      // Le bus de la fixture a 20 places de soute : 3 colis en soute = 15 %, les colis remis ou perdus n'en occupent plus.
      for (const etat of ["enregistre", "charge", "en_route", "remis", "perdu"] as const) {
        const resultat = await colis.ajouter(
          unColis(contexte, { canal: "agence", expediteurId: null, etat }),
        );
        expect(resultat).toBe("ajoute");
      }
      expect((await referentiel.depart(monde.departs.retarde))?.soutePct).toBe(15);
      // Et la liste donne la même valeur, avec une seule lecture des colis.
      const liste = await referentiel.departsOuverts(critere());
      expect(liste.find((d) => d.id === monde.departs.retarde)?.soutePct).toBe(15);
      expect(liste.find((d) => d.id === monde.departs.ouvert)?.soutePct).toBe(0);
    });
  });

  describe("gares, guichets, relais", () => {
    it("lit une gare, ou rien pour un identifiant inconnu ou invalide", async () => {
      expect(await referentiel.gare(monde.baf.id)).toEqual({
        id: monde.baf.id,
        code: "BAF",
        nom: "Gare routière",
        ville: "Bafoussam",
      });
      expect(await referentiel.gare(randomUUID())).toBeNull();
      expect(await referentiel.gare("pas-un-uuid")).toBeNull();
    });

    it("le guichet de la personne connectée, sinon le premier de sa gare, ou celui qu'on nomme", async () => {
      const attendu = {
        id: monde.guichet.id,
        rang: 2,
        gare: { id: monde.dla.id, code: "DLA", nom: "Akwa", ville: "Douala" },
        compagnieId: monde.compagnie.id,
      };
      expect(
        await referentiel.guichet({
          guichetId: null,
          utilisateurId: monde.guichetier.id,
          gareId: monde.dla.id,
        }),
      ).toEqual(attendu);
      // Une personne sans guichet affecté : le guichet de rang le plus bas de la gare.
      const sansGuichet = await fx.personne({ roles: ["guichetier"], gareId: monde.dla.id });
      const dernier = await fx.guichet(monde.dla.id, 3);
      expect(
        await referentiel.guichet({
          guichetId: null,
          utilisateurId: sansGuichet.id,
          gareId: monde.dla.id,
        }),
      ).toEqual(attendu);
      // Nommé : celui-là, même si ce n'est pas le premier.
      expect(
        (
          await referentiel.guichet({
            guichetId: dernier.id,
            utilisateurId: sansGuichet.id,
            gareId: null,
          })
        )?.rang,
      ).toBe(3);
      expect(
        await referentiel.guichet({
          guichetId: "nulle-part",
          utilisateurId: sansGuichet.id,
          gareId: null,
        }),
      ).toBeNull();
      expect(
        await referentiel.guichet({
          guichetId: null,
          utilisateurId: sansGuichet.id,
          gareId: monde.baf.id,
        }),
      ).toBeNull();
    });

    it("un point relais actif ou non, lu dans la table des relais", async () => {
      const personne = await fx.personne({ roles: ["voyageur"] });
      const id = randomUUID();
      await prisma.relais.create({
        data: {
          id,
          code: "R-BAF-0001",
          personneId: personne.id,
          nom: "Boutique Mama Ngo",
          typeBoutique: "boutique",
          ville: "Bafoussam",
          quartier: "Tamdja",
          ouvert: "07:00-20:00",
          tailleMax: "moyen",
          capacite: 20,
          momoTelephoneChiffre: "chiffre",
          momoOperateur: "mtn",
          facadeRef: "photos/facade.jpg",
          actif: false,
          note: 4.5,
          creeA: new Date("2026-10-01T08:00:00.000Z"),
        },
      });
      expect(await referentiel.relais(id)).toEqual({
        id,
        nom: "Boutique Mama Ngo",
        ville: "Bafoussam",
        actif: false,
      });
      expect(await referentiel.relais(randomUUID())).toBeNull();
      expect(await referentiel.relais("pas-un-uuid")).toBeNull();
    });

    it("les colis « autre ville » ne sont proposés que si le module des inter-agences le dit", async () => {
      expect(await referentiel.interAgencesDisponible()).toBe(false);
    });
  });

  describe("API de bout en bout : POST /agence/colis sur un départ qui existe en base", () => {
    let t: AppColisTest;
    let jeton: string;
    let auteurId: string;

    beforeAll(async () => {
      t = await creerAppColisTest({
        postgres: { url: base.url, departId: monde.departs.ouvert, referentielReel: true },
      });
      const guichetier = await t.compte("guichetier", {
        compagnieId: monde.compagnie.id,
        gareId: monde.dla.id,
      });
      jeton = guichetier.jeton;
      auteurId = guichetier.id;
    }, 120_000);

    afterAll(async () => {
      await t?.fermer();
    });

    it("le module utilise le référentiel PostgreSQL, pas l'annuaire en mémoire", () => {
      const ref = t.app.get(ReferentielColis);
      expect(ref).toBeInstanceOf(ReferentielColisPrisma);
      expect(ref).not.toBeInstanceOf(ReferentielMemoire);
      expect((ref as { durable?: boolean }).durable).toBe(true);
    });

    it("le formulaire du guichet liste les départs de la base et donne le prochain numéro de la plage", async () => {
      const rep = await t.http().get("/agence/colis/formulaire").set(entete(jeton));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const f = agence.SchemaColisFormulaire.parse(rep.body);
      expect(f.guichet).toEqual({ id: monde.guichet.id, rang: 2 });
      expect(f.prochainNumero).toEqual({ sequence: 1001, numero: "C-DLA-261102-1001" });
      expect(f.departs.map((d) => d.departId)).toEqual([
        monde.departs.ouvert,
        monde.departs.retarde,
        monde.departs.sansBus,
      ]);
      expect(f.departs[0]).toMatchObject({ destination: "Yaoundé", soutePct: 0 });
      expect(f.devis.total).toBe(PORT_COLIS_PAR_DEFAUT);
    });

    it("déclare un colis au guichet (A5 : 404 DEPART_INCONNU avant) et l'écrit en base", async () => {
      const colisId = randomUUID();
      const evenement = evenementEnregistre(auteurId, {
        colisId,
        numeroPlage: 1001,
        donnees: { departId: monde.departs.ouvert },
      });
      const rep = await t.http().post("/agence/colis").set(entete(jeton)).send(evenement);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body.accuse.statut).toBe("accepte");
      const { rows } = await sql.query(
        `SELECT numero, canal, etat, "departId", "gareOrigineId", "gareDestinationId", "compagnieId", "prixTotal"
           FROM colis WHERE id = $1`,
        [colisId],
      );
      expect(rows[0]).toMatchObject({
        numero: "C-DLA-261102-1001",
        canal: "agence",
        departId: monde.departs.ouvert,
        gareOrigineId: monde.dla.id,
        gareDestinationId: monde.yde.id,
        compagnieId: monde.compagnie.id,
        prixTotal: 2000,
      });
      // Le colis occupe maintenant une place de la soute du départ (1 sur 20 = 5 %).
      expect(
        (await new ReferentielColisPrisma(prisma).depart(monde.departs.ouvert))?.soutePct,
      ).toBe(5);
    });

    it("refuse toujours un départ fermé aux colis, un départ d'une autre compagnie et un départ inconnu", async () => {
      const essai = (departId: string, numeroPlage: number) =>
        t
          .http()
          .post("/agence/colis")
          .set(entete(jeton))
          .send(evenementEnregistre(auteurId, { numeroPlage, donnees: { departId } }));
      const parti = await essai(monde.departs.parti, 1002);
      expect([parti.status, parti.body.code]).toEqual([422, "DEPART_FERME"]);
      const autreCompagnie = await essai(monde.departs.autreCompagnie, 1003);
      expect([autreCompagnie.status, autreCompagnie.body.code]).toEqual([404, "DEPART_INCONNU"]);
      const inconnu = await essai(randomUUID(), 1004);
      expect([inconnu.status, inconnu.body.code]).toEqual([404, "DEPART_INCONNU"]);
    });
  });
});
