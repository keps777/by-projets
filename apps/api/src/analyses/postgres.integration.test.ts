import { randomUUID } from "node:crypto";
import { patron } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerAppAgencePg, type AppAgencePg } from "../caisse/testing/app-agence-pg";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { creerSessionPg } from "./testing/session-pg";
import {
  FaitsCaissePrisma,
  FaitsDepartsPrisma,
  OffresPubliquesPrisma,
  ReferentielAnalysesPrisma,
  ReseauAnonymePrisma,
} from "./postgres";

/**
 * Adaptateurs PostgreSQL des analyses : chaque port lit des tables écrites par d'autres modules (départs,
 * billets, colis, caisse) et par les tables d'exploitation du lot (fiche du bus, observations, incidents,
 * dépenses). On vérifie sur de vraies lignes : les jours de Douala (UTC+1) à la frontière de minuit, les
 * billets qui ne comptent pas, le cloisonnement par compagnie, et le seuil d'anonymat du réseau, qui est
 * dans la requête.
 */

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · analyses", () => {
  let base: BaseDeTest;
  let prisma: PrismaService;
  let fx: FixturesPg;
  let referentiel: ReferentielAnalysesPrisma;
  let departs: FaitsDepartsPrisma;
  let caisse: FaitsCaissePrisma;
  let offres: OffresPubliquesPrisma;
  let reseau: ReseauAnonymePrisma;

  /** La compagnie du patron et ce qu'on lui a posé. */
  const A = {
    id: "",
    nom: "",
    douala: "",
    yaounde: "",
    ligneId: "",
    ligneCode: "DLAYDE",
    busId: "",
    chauffeurId: "",
    guichetier: { id: "", nom: "" },
    guichetId: "",
    d1: "",
    d2: "",
    d3: "",
  };
  const CODE_PUBLIC = "DLAYDE";

  async function ligneAvecCode(compagnieId: string, code: string) {
    const origine = await fx.gare(compagnieId, { ville: "Douala" });
    const destination = await fx.gare(compagnieId, { ville: "Yaoundé" });
    const l = await prisma.ligne.create({
      data: {
        compagnieId,
        code,
        origineGareId: origine.id,
        destinationGareId: destination.id,
        tarifClassique: 8000,
        tarifVip: 12000,
        tarifBagage: 500,
      },
    });
    return { id: l.id, origine, destination };
  }

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
    fx = new FixturesPg(prisma);
    referentiel = new ReferentielAnalysesPrisma(prisma);
    departs = new FaitsDepartsPrisma(prisma);
    caisse = new FaitsCaissePrisma(prisma);
    offres = new OffresPubliquesPrisma(prisma);
    reseau = new ReseauAnonymePrisma(prisma);

    const compagnie = await fx.compagnie();
    A.id = compagnie.id;
    A.nom = `Agence ${compagnie.code}`;
    const ligne = await ligneAvecCode(A.id, A.ligneCode);
    A.ligneId = ligne.id;
    A.douala = ligne.origine.id;
    A.yaounde = ligne.destination.id;
    const chauffeur = await fx.personne({
      roles: ["chauffeur"],
      compagnieId: A.id,
      nom: "Paul Mbida",
    });
    A.chauffeurId = chauffeur.id;
    const guichet = await fx.guichet(ligne.origine.id, 1);
    A.guichetId = guichet.id;
    const g = await fx.personne({
      roles: ["guichetier"],
      compagnieId: A.id,
      gareId: ligne.origine.id,
      guichetId: guichet.id,
      nom: "Joseph Mbarga",
    });
    A.guichetier = g;
    // Un patron et un chauffeur ne sont pas des agents de vente.
    await fx.personne({ roles: ["patron"], compagnieId: A.id, nom: "Le Patron" });
    const bus = await fx.bus(A.id, "LT 412 AB", 70);
    A.busId = bus.id;
    await prisma.busFiche.create({
      data: { busId: bus.id, modele: "Yutong ZK6122", annee: 2019, entretien: "Vidange à faire" },
    });

    // d1 : 4 janvier 2027, 07 h 30 à Douala (06:30 UTC), classique, avec bus et chauffeur.
    const d1 = await fx.depart(ligne.id, {
      heureDepart: new Date("2027-01-04T06:30:00.000Z"),
      busId: bus.id,
      chauffeurId: chauffeur.id,
    });
    A.d1 = d1.id;
    // d2 : 23 h 30 à Douala le même jour (22:30 UTC), annulé.
    A.d2 = (
      await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-04T22:30:00.000Z"),
        etat: "annule",
      })
    ).id;
    // d3 : 23:30 UTC = 00 h 30 à Douala le LENDEMAIN (5 janvier).
    A.d3 = (await fx.depart(ligne.id, { heureDepart: new Date("2027-01-04T23:30:00.000Z") })).id;

    const ctx = { compagnieId: A.id, gareId: A.douala, departId: d1.id };
    // Billets de d1 : 3 au guichet (dont un avec 500 F de bagage), 1 en ligne, 1 vendu en route, plus
    // un annulé et un reporté qui ne comptent pas.
    await fx.billet(ctx, { prix: 8000, bagage: 500, guichetId: guichet.id, auteurId: g.id });
    await fx.billet(ctx, { prix: 8000, guichetId: guichet.id, auteurId: g.id });
    await fx.billet(ctx, { prix: 8000, guichetId: guichet.id, auteurId: g.id, etat: "embarque" });
    await fx.billet(ctx, { prix: 8000, canal: "en_ligne", mode: "momo" });
    await fx.billet(ctx, { prix: 8000, canal: "convoyeur", auteurId: g.id });
    await fx.billet(ctx, { prix: 8000, etat: "annule" });
    await fx.billet(ctx, { prix: 8000, etat: "reporte" });
    // Colis : un compte, un perdu qui ne compte pas.
    for (const [etat, prix] of [
      ["enregistre", 2500],
      ["perdu", 9999],
    ] as const) {
      const n = fx.prochain();
      await prisma.colis.create({
        data: {
          numero: `C-${A.douala.slice(0, 3)}-270104-${n}`,
          sequence: n,
          gareOrigineId: A.douala,
          gareDestinationId: A.yaounde,
          departId: d1.id,
          expediteurChiffre: "x",
          expediteurTelephoneIndex: `i-${n}-e`,
          destinataireChiffre: "x",
          destinataireTelephoneIndex: `i-${n}-d`,
          contenu: "Sac de riz",
          poidsKg: 5,
          valeurDeclaree: 10_000,
          mode: "gare",
          canal: "agence",
          codeRetraitHache: "h",
          codeRetraitSel: "s",
          prixTotal: prix,
          creeA: new Date("2027-01-04T05:00:00.000Z"),
          etat,
          jour: "270104",
          compagnieId: A.id,
        },
      });
    }
    await prisma.departObservation.create({
      data: { departId: d1.id, note: "Soute pleine", retardMinutes: 15 },
    });
    // Un incident « autre » puis une panne : la panne l'emporte.
    await prisma.departIncident.create({
      data: {
        id: randomUUID(),
        departId: d1.id,
        nature: "autre",
        description: "Pneu crevé réparé",
        dureeMinutes: 10,
        signaleA: new Date("2027-01-04T09:00:00.000Z"),
      },
    });
    await prisma.departIncident.create({
      data: {
        id: randomUUID(),
        departId: d1.id,
        nature: "panne",
        description: "Panne de radiateur",
        dureeMinutes: 40,
        signaleA: new Date("2027-01-04T08:00:00.000Z"),
      },
    });
    for (const [nature, montant] of [
      ["carburant", 20_000],
      ["carburant", 5_000],
      ["panne", 15_000],
      ["autre", 3_000],
    ] as const) {
      await prisma.departDepense.create({
        data: { id: randomUUID(), departId: d1.id, nature, montant },
      });
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  describe("référentiel", () => {
    it("lignes : « Douala → Yaoundé » avec son code, et jamais celles d'une autre compagnie", async () => {
      const autre = await fx.compagnie();
      await ligneAvecCode(autre.id, "BFMYDE");
      expect(await referentiel.lignes(A.id)).toEqual([
        {
          id: A.ligneId,
          nom: "Douala → Yaoundé",
          code: A.ligneCode,
          origine: "Douala",
          destination: "Yaoundé",
        },
      ]);
      expect(await referentiel.lignes("pas-un-uuid")).toEqual([]);
    });

    it("bus : fiche de l'atelier et chauffeur du dernier départ, à défaut de chauffeur habituel", async () => {
      expect(await referentiel.bus(A.id)).toEqual([
        {
          id: A.busId,
          immatriculation: "LT 412 AB",
          modele: "Yutong ZK6122",
          capacite: 70,
          annee: 2019,
          chauffeurId: A.chauffeurId,
          chauffeurNom: "Paul Mbida",
          entretien: "Vidange à faire",
        },
      ]);
      // Un bus sans fiche ni départ : valeurs neutres, pas d'erreur.
      const nu = await fx.bus(A.id, "LT 999 ZZ", 30);
      const tous = await referentiel.bus(A.id);
      expect(tous.find((b) => b.id === nu.id)).toEqual({
        id: nu.id,
        immatriculation: "LT 999 ZZ",
        modele: "",
        capacite: 30,
        annee: 0,
        chauffeurId: null,
        chauffeurNom: "",
        entretien: null,
      });
      // La fiche l'emporte : un chauffeur habituel désigné prend la place du dernier chauffeur.
      const titulaire = await fx.personne({
        roles: ["chauffeur"],
        compagnieId: A.id,
        nom: "Habib Eto",
      });
      await prisma.busFiche.update({
        where: { busId: A.busId },
        data: { chauffeurHabituelId: titulaire.id },
      });
      expect((await referentiel.bus(A.id)).find((b) => b.id === A.busId)?.chauffeurNom).toBe(
        "Habib Eto",
      );
      await prisma.busFiche.update({
        where: { busId: A.busId },
        data: { chauffeurHabituelId: null },
      });
    });

    it("agents : guichetiers, convoyeurs et vendeurs seulement ; gares : celles de la compagnie", async () => {
      const agents = await referentiel.agents(A.id);
      expect(agents).toEqual([{ id: A.guichetier.id, nom: "Joseph Mbarga" }]);
      const gares = await referentiel.gares(A.id);
      expect(gares.map((x) => x.ville).sort()).toEqual(["Douala", "Yaoundé"]);
    });
  });

  describe("départs", () => {
    it("un départ : billets, recette (prix + bagage), canaux, colis, incident, dépenses, observation", async () => {
      const faits = await departs.entre(A.id, "2027-01-04", "2027-01-04");
      const d1 = faits.find((f) => f.departId === A.d1)!;
      expect(d1).toMatchObject({
        ligneId: A.ligneId,
        jour: "2027-01-04",
        heure: "07:30",
        classe: "classique",
        prix: 8000,
        busId: A.busId,
        chauffeurId: A.chauffeurId,
        capacite: 70,
        annule: false,
        billets: 5,
        recetteBillets: 5 * 8000 + 500,
        billetsEnLigne: 1,
        billetsEnRoute: 1,
        colis: 1,
        recetteColis: 2500,
        note: "Soute pleine",
        retardMinutes: 15,
        incident: { nature: "panne", description: "Panne de radiateur", dureeMinutes: 40 },
        carburant: 25_000,
        coutPanne: 15_000,
        autresDepenses: 3_000,
      });
    });

    it("les jours sont ceux de Douala : 23 h 30 reste le 4, 00 h 30 UTC+1 est le 5", async () => {
      const quatre = await departs.entre(A.id, "2027-01-04", "2027-01-04");
      expect(quatre.map((f) => f.departId).sort()).toEqual([A.d1, A.d2].sort());
      const d2 = quatre.find((f) => f.departId === A.d2)!;
      expect(d2).toMatchObject({ jour: "2027-01-04", heure: "23:30", annule: true, billets: 0 });
      const cinq = await departs.entre(A.id, "2027-01-05", "2027-01-05");
      expect(cinq).toHaveLength(1);
      expect(cinq[0]).toMatchObject({ departId: A.d3, jour: "2027-01-05", heure: "00:30" });
      // Une fenêtre de deux jours rend les trois, dans l'ordre des heures.
      const deux = await departs.entre(A.id, "2027-01-04", "2027-01-05");
      expect(deux.map((f) => f.departId)).toEqual([A.d1, A.d2, A.d3]);
    });

    it("sans bus : capacité 0 ; sans incident : null ; sans dépense : zéros", async () => {
      const d3 = (await departs.entre(A.id, "2027-01-05", "2027-01-05"))[0]!;
      expect(d3).toMatchObject({
        busId: null,
        capacite: 0,
        incident: null,
        note: null,
        retardMinutes: null,
        carburant: 0,
        coutPanne: 0,
        autresDepenses: 0,
        billets: 0,
        colis: 0,
      });
    });

    it("ne rend jamais les départs d'une autre compagnie", async () => {
      const autre = await fx.compagnie();
      const l = await ligneAvecCode(autre.id, "XYZABC");
      const dep = await fx.depart(l.id, { heureDepart: new Date("2027-01-04T06:30:00.000Z") });
      const faits = await departs.entre(A.id, "2026-12-01", "2027-02-01");
      expect(faits.map((f) => f.departId)).not.toContain(dep.id);
      expect(
        (await departs.entre(autre.id, "2027-01-04", "2027-01-04")).map((f) => f.departId),
      ).toEqual([dep.id]);
      expect(await departs.entre("pas-un-uuid", "2027-01-04", "2027-01-04")).toEqual([]);
    });

    it("une fenêtre de 90 jours reste une seule requête, même avec beaucoup de départs", async () => {
      const compagnie = await fx.compagnie();
      const l = await ligneAvecCode(compagnie.id, "KRIDLA");
      const bus = await fx.bus(compagnie.id, "LT 1 AA", 70);
      for (let jour = 0; jour < 90; jour++) {
        await fx.depart(l.id, {
          heureDepart: new Date(Date.UTC(2027, 1, 1 + jour, 6, 30)),
          busId: bus.id,
        });
      }
      const t0 = Date.now();
      const faits = await departs.entre(compagnie.id, "2027-02-01", "2027-05-31");
      expect(faits).toHaveLength(90);
      expect(Date.now() - t0).toBeLessThan(2_000);
    });
  });

  describe("caisse", () => {
    const session = (
      etat: "ouverte" | "cloturee" | "validee",
      ouverteA: string,
      ecart: number | null,
      surcharge: { rang?: number } = {},
    ) =>
      creerSessionPg(prisma, {
        compagnieId: A.id,
        gareId: A.douala,
        guichetId: A.guichetId,
        agentId: A.guichetier.id,
        superviseurId: A.chauffeurId,
        etat,
        ouverteA,
        ...(ecart === null ? {} : { ecart }),
        ...(surcharge.rang === undefined ? {} : { rang: surcharge.rang }),
      });

    it("écarts : les caisses clôturées ou validées de la fenêtre, avec leur jour de Douala", async () => {
      const s1 = await session("cloturee", "2027-01-04T07:00:00.000Z", -2_500);
      const s2 = await session("validee", "2027-01-04T22:30:00.000Z", 1_500, { rang: 2 });
      await session("ouverte", "2027-01-04T07:00:00.000Z", null, { rang: 3 });
      // Hors fenêtre : la veille.
      await session("cloturee", "2027-01-03T07:00:00.000Z", -9_000);
      const ecarts = await caisse.ecarts(A.id, "2027-01-04", "2027-01-04");
      expect(ecarts).toEqual([
        {
          sessionId: s1.id,
          agentId: A.guichetier.id,
          gareId: A.douala,
          guichet: "Guichet 1",
          jour: "2027-01-04",
          ecart: -2_500,
          tolerance: 1_000,
          validee: false,
        },
        {
          sessionId: s2.id,
          agentId: A.guichetier.id,
          gareId: A.douala,
          guichet: "Guichet 2",
          jour: "2027-01-04",
          ecart: 1_500,
          tolerance: 1_000,
          validee: true,
        },
      ]);
    });

    it("écarts : jamais ceux d'une autre compagnie", async () => {
      expect(await caisse.ecarts(randomUUID(), "2027-01-01", "2027-12-31")).toEqual([]);
      expect(await caisse.ecarts("pas-un-uuid", "2027-01-01", "2027-12-31")).toEqual([]);
    });

    it("ventes en cadence : billets à compléter au quai par agent et par départ, dont ceux sans nom", async () => {
      const ctx = { compagnieId: A.id, gareId: A.douala, departId: A.d3 };
      const g = A.guichetier.id;
      const sans = [
        await fx.billet(ctx, { auteurId: g, guichetId: A.guichetId }),
        await fx.billet(ctx, { auteurId: g, guichetId: A.guichetId }),
      ];
      const avecNom = await fx.billet(ctx, { auteurId: g, guichetId: A.guichetId });
      const annule = await fx.billet(ctx, { auteurId: g, guichetId: A.guichetId, etat: "annule" });
      for (const b of [...sans, avecNom, annule]) {
        await prisma.billet.update({ where: { id: b.id }, data: { aCompleterAuQuai: true } });
      }
      await prisma.billet.update({
        where: { id: avecNom.id },
        data: { passagerTelephoneIndex: "indice-saisi" },
      });
      const ventes = await caisse.ventesCadence(A.id, "2027-01-05", "2027-01-05");
      expect(ventes).toEqual([
        {
          agentId: g,
          gareId: A.douala,
          departId: A.d3,
          ligneId: A.ligneId,
          heure: "00:30",
          jour: "2027-01-05",
          billets: 3,
          sansNom: 2,
        },
      ]);
      expect(await caisse.ventesCadence(A.id, "2027-01-04", "2027-01-04")).toEqual([]);
    });
  });

  describe("hors de la compagnie : offres publiques et moyennes du réseau", () => {
    const concurrents: { id: string; nom: string }[] = [];

    async function departPublic(
      compagnieId: string,
      heureUtc: string,
      options: {
        billets?: number;
        capacite?: number;
        classe?: "classique" | "vip";
        annule?: boolean;
      } = {},
    ) {
      const ligne =
        (await prisma.ligne.findUnique({
          where: { compagnieId_code: { compagnieId, code: CODE_PUBLIC } },
        })) ?? (await ligneAvecCode(compagnieId, CODE_PUBLIC));
      const bus = await fx.bus(compagnieId, `LT ${fx.prochain()} CC`, options.capacite ?? 4);
      const d = await fx.depart(ligne.id, {
        heureDepart: new Date(heureUtc),
        busId: bus.id,
        etat: options.annule ? "annule" : "en_vente",
      });
      await prisma.depart.update({
        where: { id: d.id },
        data: { classe: options.classe ?? "classique" },
      });
      const gare = await prisma.gare.findFirstOrThrow({ where: { compagnieId } });
      for (let i = 0; i < (options.billets ?? 0); i++) {
        await fx.billet({ compagnieId, gareId: gare.id, departId: d.id }, {});
      }
      return d.id;
    }

    beforeAll(async () => {
      for (let i = 0; i < 4; i++) {
        const c = await fx.compagnie();
        concurrents.push({ id: c.id, nom: `Agence ${c.code}` });
      }
      // Trois concurrents actifs publient 08 h 00 (07:00 UTC) ; le quatrième est désactivé.
      await prisma.compagnie.update({ where: { id: concurrents[3]!.id }, data: { actif: false } });
      // Remplissage : 2/4, 3/4 et 1/4 -> 50, 75 et 25 : moyenne 50.
      await departPublic(concurrents[0]!.id, "2027-01-04T07:00:00.000Z", { billets: 2 });
      await departPublic(concurrents[1]!.id, "2027-01-04T07:00:00.000Z", {
        billets: 3,
        classe: "vip",
      });
      await departPublic(concurrents[2]!.id, "2027-01-04T07:00:00.000Z", { billets: 1 });
      // Le désactivé et un départ annulé ne comptent pas.
      await departPublic(concurrents[3]!.id, "2027-01-04T07:00:00.000Z", { billets: 4 });
      await departPublic(concurrents[0]!.id, "2027-01-04T09:00:00.000Z", {
        billets: 4,
        annule: true,
      });
      // Un second jour, même créneau, pour deux concurrents seulement : sous le seuil.
      await departPublic(concurrents[0]!.id, "2027-01-04T13:00:00.000Z", { billets: 1 });
      await departPublic(concurrents[1]!.id, "2027-01-04T13:00:00.000Z", { billets: 1 });
    }, 120_000);

    it("offres : horaire et prix des autres compagnies actives sur la même ligne, rien d'autre", async () => {
      const liste = await offres.entre(A.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04");
      const noms = concurrents
        .slice(0, 3)
        .map((c) => c.nom)
        .sort();
      expect(
        liste
          .filter((o) => o.heure === "08:00")
          .map((o) => o.compagnie)
          .sort(),
      ).toEqual(noms);
      expect(liste.map((o) => o.compagnie)).not.toContain(concurrents[3]!.nom);
      expect(liste.map((o) => o.compagnie)).not.toContain(A.nom);
      // Le départ annulé de 10 h n'est pas publié.
      expect(liste.some((o) => o.heure === "10:00")).toBe(false);
      const vip = liste.find((o) => o.compagnie === concurrents[1]!.nom && o.heure === "08:00")!;
      expect(vip).toEqual({
        compagnie: concurrents[1]!.nom,
        ligneCode: CODE_PUBLIC,
        jour: "2027-01-04",
        heure: "08:00",
        prix: 12000,
      });
      // Aucune vente, aucun identifiant : exactement ces cinq champs.
      for (const o of liste) {
        expect(Object.keys(o).sort()).toEqual(["compagnie", "heure", "jour", "ligneCode", "prix"]);
      }
      expect(await offres.entre(A.id, [], "2027-01-04", "2027-01-04")).toEqual([]);
      expect(await offres.entre(A.id, ["AUTRE"], "2027-01-04", "2027-01-04")).toEqual([]);
    });

    it("réseau : la moyenne n'existe qu'à partir de trois compagnies, sans nom ni identifiant", async () => {
      const moyennes = await reseau.moyennes(A.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04", 3);
      // Les quatre concurrents comptent (une compagnie désactivée garde son historique) :
      // 50, 75, 25 et 100 % -> 62,5 %.
      expect(moyennes).toEqual([
        {
          ligneCode: CODE_PUBLIC,
          creneau: "08:00",
          compagnies: 4,
          remplissageMoyenPct: 62.5,
          jours: 1,
        },
      ]);
      // Le créneau de 14 h n'a que deux compagnies : absent, quoi que le seuil demandé.
      for (const seuil of [0, 1, 2, 3]) {
        const r = await reseau.moyennes(A.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04", seuil);
        expect(r.some((x) => x.creneau === "14:00")).toBe(false);
      }
      const texte = JSON.stringify(moyennes);
      for (const c of concurrents) {
        expect(texte).not.toContain(c.id);
        expect(texte).not.toContain(c.nom);
      }
    });

    it("réseau : un seuil de cinq compagnies masque un créneau qui n'en compte que quatre", async () => {
      expect(await reseau.moyennes(A.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04", 5)).toEqual([]);
    });

    it("réseau : un seuil demandé trop bas est relevé à trois compagnies", async () => {
      for (const seuil of [-1, 0, 1, 2]) {
        const r = await reseau.moyennes(A.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04", seuil);
        expect(r.every((x) => x.compagnies >= 3)).toBe(true);
      }
    });

    it("réseau : la compagnie qui demande ne compte pas dans sa propre moyenne", async () => {
      // Le concurrent 0 (50 %) demande : restent trois autres compagnies, 75, 25 et 100 % -> 66,7 %.
      expect(
        await reseau.moyennes(concurrents[0]!.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04", 3),
      ).toEqual([
        {
          ligneCode: CODE_PUBLIC,
          creneau: "08:00",
          compagnies: 3,
          remplissageMoyenPct: 66.7,
          jours: 1,
        },
      ]);
      // Avec le concurrent 3 (désactivé, 100 %) qui demande : 50, 75 et 25 -> 50 %.
      expect(
        (await reseau.moyennes(concurrents[3]!.id, [CODE_PUBLIC], "2027-01-04", "2027-01-04", 3))[0]
          ?.remplissageMoyenPct,
      ).toBe(50);
    });
  });

  describe("API de bout en bout, stockage PostgreSQL", () => {
    let t: AppAgencePg;
    let jeton: string;
    let jetonAutre: string;

    beforeAll(async () => {
      // « Aujourd'hui » est le 6 janvier : la semaine qui se termine hier couvre les 4 et 5 janvier.
      t = await creerAppAgencePg({ url: base.url, debut: new Date("2027-01-06T08:00:00.000Z") });
      jeton = (await t.compte("patron", { compagnieId: A.id, gareId: null })).jeton;
      const autre = await fx.compagnie();
      jetonAutre = (await t.compte("patron", { compagnieId: autre.id, gareId: null })).jeton;
    }, 120_000);
    afterAll(async () => {
      await t?.fermer();
    });

    const get = (chemin: string, j = jeton) =>
      t
        .http()
        .get(chemin)
        .set({ Authorization: `Bearer ${j}` });

    it("la synthèse lit les vrais départs, billets et colis de la compagnie, conforme au contrat", async () => {
      const r = await get("/patron/analyses?periode=semaine");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const lu = patron.AnalysesSchema.parse(r.body);
      // d1 : 5 billets (40 500 F avec le bagage) et 1 colis (2 500 F) ; d3 (5 janvier) : 3 billets de
      // cadence vivants (24 000 F), le quatrième est annulé.
      expect(lu.recette.total).toBe(5 * 8000 + 500 + 2500 + 3 * 8000);
      expect(lu.lignes.map((l) => l.nom)).toEqual(["Douala → Yaoundé"]);
    });

    it("l'analyse d'une ligne et d'un bus reconnaît l'identifiant PostgreSQL ; une autre compagnie reçoit 404", async () => {
      const ligne = await get(`/patron/analyses/lignes/${A.ligneId}`);
      expect(ligne.status, JSON.stringify(ligne.body)).toBe(200);
      expect(patron.AnalyseLigneSchema.parse(ligne.body).ligne).toEqual({
        id: A.ligneId,
        nom: "Douala → Yaoundé",
      });
      const bus = await get(`/patron/analyses/bus/${A.busId}`);
      expect(bus.status, JSON.stringify(bus.body)).toBe(200);
      const lu = patron.AnalyseBusSchema.parse(bus.body);
      expect(lu.trajets.some((x) => x.incident?.nature === "panne")).toBe(true);
      expect((await get(`/patron/analyses/lignes/${A.ligneId}`, jetonAutre)).status).toBe(404);
      expect((await get(`/patron/analyses/bus/${A.busId}`, jetonAutre)).status).toBe(404);
      expect((await get("/patron/analyses/lignes/pas-un-uuid")).status).toBe(404);
    });
  });
});
