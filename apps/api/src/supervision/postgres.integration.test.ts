import { randomUUID } from "node:crypto";
import { agence as c } from "@afrimove/contrats";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cloture, comptage, envoyer, evenement, lire, ouverture } from "../caisse/testing/outils";
import { creerAppAgencePg, type AppAgencePg } from "../caisse/testing/app-agence-pg";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { aammjjDouala, MS_PAR_HEURE, versIsoDouala } from "../caisse/temps";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { HorlogeFixe } from "../socle/testing/memoire";
import {
  DemandesAnnulationMemoire,
  EquipeMemoire,
  PinsEquipeMemoire,
  RegistreBilletsMemoire,
} from "./memoire";
import {
  DemandesAnnulationPrisma,
  EquipeGarePrisma,
  PinsEquipePrisma,
  RegistreBilletsPrisma,
  SYNCHRO_RECENTE_MINUTES,
  SourceGarePrisma,
} from "./postgres";
import type { BilletAnnulable } from "./ports";
import {
  contratPortsSupervision,
  instant,
  uneDemande,
  type BancSupervision,
  type ContexteSupervision,
  type OptionsBillet,
} from "./testing/contrat-ports";
import { SupervisionModule } from "./supervision.module";

/**
 * Adaptateurs PostgreSQL de la supervision : les mêmes tests de contrat sur la mémoire (toujours) et
 * sur PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit, ce que la
 * vue de la gare et l'équipe calculent depuis les tables, et l'API de bout en bout sur PostgreSQL
 * (clôture validée avec le PIN, annulation remboursée en cash, équipe).
 */

const CONTEXTE_PASSAGER = "billet.passager";
const VOYAGEUR = { nom: "Paul Essomba", pieceQuatreDerniers: "4821" };

function bancMemoire(): BancSupervision {
  const registre = new RegistreBilletsMemoire();
  const demandes = new DemandesAnnulationMemoire();
  const equipe = new EquipeMemoire();
  const pins = new PinsEquipeMemoire();
  const hachesDePin = new Map<string, string>();
  pins.surDefinition = (id, pinHache) => hachesDePin.set(id, pinHache);
  let n = 0;
  return {
    registre,
    demandes,
    equipe,
    pins,
    nouveauContexte: async () => ({
      compagnieId: randomUUID(),
      gareId: randomUUID(),
      guichets: [1, 2, 3].map((rang) => ({ id: randomUUID(), rang })),
      agents: [randomUUID(), randomUUID(), randomUUID()],
      superviseurId: randomUUID(),
    }),
    nouveauBillet: async (ctx, o: OptionsBillet = {}) => {
      n += 1;
      const rang = o.rang ?? 1;
      const billet: BilletAnnulable = {
        billetId: randomUUID(),
        numero: `ALP-DLA-270104-${String(n).padStart(4, "0")}`,
        sequence: n,
        prix: o.prix ?? 8_000,
        classe: "classique",
        etat: o.etat ?? "paye",
        gareId: ctx.gareId,
        compagnieId: ctx.compagnieId,
        depart: {
          departId: randomUUID(),
          heureDepart: instant(300),
          destination: "Yaoundé",
          siege: o.siege ?? 10 + n,
        },
        voyageur: { ...VOYAGEUR },
        vendu: {
          at: instant(-30),
          guichetRang: rang,
          mode: o.mode ?? "cash",
          agentId: ctx.agents[rang - 1]!,
          agentNom: `Agent ${rang}`,
        },
        scanne: o.scanne ?? false,
      };
      registre.ajouter(billet);
      return billet;
    },
    siegeLibre: async (billet) =>
      ["annule", "reporte"].includes(registre.lignes.get(billet.billetId)!.etat),
    nouveauMembre: async (ctx, o) => {
      const personneId = randomUUID();
      equipe.ajouter({
        personneId,
        role: o.role,
        gareId: o.gareId ?? ctx.gareId,
        compagnieId: ctx.compagnieId,
        guichetId: o.guichetId ?? null,
        affectation: null,
        situationDuJour: "en_service",
        situation: null,
        billets: 0,
        depuis: instant(-100),
        actif: true,
      });
      return personneId;
    },
    pinHacheDe: async (id) => hachesDePin.get(id) ?? null,
    fermer: async () => undefined,
  };
}

contratPortsSupervision("contrat · adaptateurs en mémoire", async () => bancMemoire());

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · supervision", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let chiffrement: ChiffrementService;
  let fx: FixturesPg;
  let banc: BancSupervision;
  const horloge = new HorlogeFixe(new Date("2027-01-04T08:00:00.000Z"));

  /** Ce que le banc a posé pour chaque compagnie : le départ, le bus, la gare d'arrivée. */
  const decors = new Map<
    string,
    { departId: string; gareArriveeId: string; busId: string; noms: Map<string, string> }
  >();

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  async function contexte(): Promise<ContexteSupervision> {
    const compagnie = await fx.compagnie();
    const gare = await fx.gare(compagnie.id, { ville: "Douala" });
    const arrivee = await fx.gare(compagnie.id, { ville: "Yaoundé" });
    const guichets = [
      await fx.guichet(gare.id, 1),
      await fx.guichet(gare.id, 2),
      await fx.guichet(gare.id, 3),
    ];
    const noms = new Map<string, string>();
    const agents: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await fx.personne({
        roles: ["guichetier"],
        compagnieId: compagnie.id,
        gareId: gare.id,
        guichetId: guichets[i]!.id,
      });
      agents.push(p.id);
      noms.set(p.id, p.nom);
    }
    const superviseur = await fx.personne({
      roles: ["superviseur"],
      compagnieId: compagnie.id,
      gareId: gare.id,
    });
    const ligne = await fx.ligne(compagnie.id, gare.id, arrivee.id);
    const bus = await fx.bus(compagnie.id);
    const depart = await fx.depart(ligne.id, {
      heureDepart: new Date("2027-01-04T13:00:00.000Z"),
      quai: 2,
      busId: bus.id,
    });
    decors.set(compagnie.id, {
      departId: depart.id,
      gareArriveeId: arrivee.id,
      busId: bus.id,
      noms,
    });
    return {
      compagnieId: compagnie.id,
      gareId: gare.id,
      guichets,
      agents,
      superviseurId: superviseur.id,
    };
  }

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    chiffrement = new ChiffrementService(config);
    fx = new FixturesPg(prisma);

    banc = {
      registre: new RegistreBilletsPrisma(prisma, chiffrement),
      demandes: new DemandesAnnulationPrisma(prisma),
      equipe: new EquipeGarePrisma(prisma, horloge),
      pins: new PinsEquipePrisma(prisma),
      nouveauContexte: contexte,
      nouveauBillet: async (ctx, o: OptionsBillet = {}) => {
        const decor = decors.get(ctx.compagnieId)!;
        const rang = o.rang ?? 1;
        const guichet = ctx.guichets[rang - 1]!;
        const agentId = ctx.agents[rang - 1]!;
        const etat = o.etat ?? "paye";
        const mode = o.mode ?? "cash";
        const creeA = new Date("2027-01-04T07:30:00.000Z");
        const siege = o.siege ?? 10 + fx.prochain();
        const prix = o.prix ?? 8_000;
        const b = await fx.billet(
          { compagnieId: ctx.compagnieId, gareId: ctx.gareId, departId: decor.departId },
          {
            siege,
            prix,
            etat,
            canal: "guichet",
            guichetId: guichet.id,
            auteurId: agentId,
            mode,
            creeA,
            passagerChiffre: chiffrement.chiffrerJson(
              {
                nom: VOYAGEUR.nom,
                telephone: null,
                pieceQuatreDerniers: VOYAGEUR.pieceQuatreDerniers,
              },
              CONTEXTE_PASSAGER,
            ),
          },
        );
        if (["reserve", "paye", "embarque", "voyage"].includes(etat)) {
          await prisma.siegeDepart.create({
            data: { departId: decor.departId, siege, billetId: b.id },
          });
        }
        if (o.scanne) {
          await prisma.scanQuai.create({
            data: {
              evenementId: randomUUID(),
              departId: decor.departId,
              billetId: b.id,
              numero: b.numero,
              resultat: "monte",
              at: new Date("2027-01-04T10:00:00.000Z"),
              appareilId: "QUAI-1",
              auteurId: agentId,
            },
          });
        }
        return {
          billetId: b.id,
          numero: b.numero,
          sequence: b.sequence,
          prix,
          classe: "classique",
          etat,
          gareId: ctx.gareId,
          compagnieId: ctx.compagnieId,
          depart: {
            departId: decor.departId,
            heureDepart: versIsoDouala("2027-01-04T13:00:00.000Z"),
            destination: "Yaoundé",
            siege,
          },
          voyageur: { ...VOYAGEUR },
          vendu: {
            at: versIsoDouala(creeA),
            guichetRang: rang,
            mode,
            agentId,
            agentNom: decor.noms.get(agentId)!,
          },
          scanne: o.scanne ?? false,
        };
      },
      siegeLibre: async (billet) =>
        (await prisma.siegeDepart.findFirst({ where: { billetId: billet.billetId } })) === null,
      nouveauMembre: async (ctx, o) => {
        const p = await fx.personne({
          roles: [o.role],
          compagnieId: ctx.compagnieId,
          gareId: o.gareId ?? ctx.gareId,
          guichetId: o.guichetId ?? null,
        });
        return p.id;
      },
      pinHacheDe: async (id) =>
        (await prisma.personne.findUnique({ where: { id }, select: { pinHache: true } }))
          ?.pinHache ?? null,
      fermer: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Les tests de contrat s'exécutent ici, sur la base préparée plus haut.
  contratPortsSupervision("contrat · adaptateurs PostgreSQL", async () => banc, {
    attendreFin: false,
  });

  describe("ce que la base garantit seule", () => {
    it("une seule demande en attente par billet : l'index unique refuse, même écrit à la main", async () => {
      const ctx = await banc.nouveauContexte();
      const b = await banc.nouveauBillet(ctx);
      await banc.demandes.creer(uneDemande(ctx, b));
      const autre = uneDemande(ctx, b);
      expect(
        await erreurSql(
          `INSERT INTO demande_annulation ("demandeId", "billetId", "gareId", "compagnieId", "demandeurId",
             "guichetRang", motif, "demandeA", statut, "evenementDemandeId")
           VALUES ($1, $2, $3, $4, $5, 1, 'x', now(), 'en_attente', $6)`,
          [autre.demandeId, b.billetId, ctx.gareId, ctx.compagnieId, ctx.agents[0], randomUUID()],
        ),
      ).toMatch(/demande_annulation_une_en_attente_par_billet/);
    });

    it("une demande décidée porte sa décision, son auteur et son heure ; une demande en attente aucune", async () => {
      const ctx = await banc.nouveauContexte();
      const b = await banc.nouveauBillet(ctx);
      const d = uneDemande(ctx, b);
      await banc.demandes.creer(d);
      expect(
        await erreurSql(`UPDATE demande_annulation SET statut = 'decidee' WHERE "demandeId" = $1`, [
          d.demandeId,
        ]),
      ).toMatch(/demande_annulation_coherence/);
      expect(
        await erreurSql(
          `UPDATE demande_annulation SET decision = 'refuser', "decideeA" = now(),
             "decideeParId" = "demandeurId" WHERE "demandeId" = $1`,
          [d.demandeId],
        ),
      ).toMatch(/demande_annulation_coherence/);
      expect(
        await erreurSql(
          `UPDATE demande_annulation SET decision = 'offrir' WHERE "demandeId" = $1`,
          [d.demandeId],
        ),
      ).toMatch(/demande_annulation_decision_connue/);
    });

    it("annuler libère le siège dans la même transaction, avance la version du plan et trace l'historique", async () => {
      const ctx = await banc.nouveauContexte();
      const b = await banc.nouveauBillet(ctx, { siege: 31 });
      const { departId } = decors.get(ctx.compagnieId)!;
      const avant = await sql.query(`SELECT "versionPlan" FROM depart WHERE id = $1`, [departId]);
      await banc.registre.appliquer(b.billetId, "annuler", {
        at: instant(30),
        parId: ctx.superviseurId,
        motif: "Erreur de destination",
      });
      const apres = await sql.query(`SELECT "versionPlan" FROM depart WHERE id = $1`, [departId]);
      expect(apres.rows[0].versionPlan).toBe(avant.rows[0].versionPlan + 1);
      const { rows } = await sql.query(
        `SELECT etat, numero, siege, historique FROM billet WHERE id = $1`,
        [b.billetId],
      );
      expect(rows[0]).toMatchObject({ etat: "annule", numero: b.numero, siege: 31 });
      expect(rows[0].historique).toEqual([
        {
          action: "annuler",
          de: "paye",
          vers: "annule",
          at: instant(30),
          par: ctx.superviseurId,
          motif: "Erreur de destination",
        },
      ]);
      // Le siège peut être revendu : un autre billet l'occupe sans conflit.
      const revendu = await banc.nouveauBillet(ctx, { siege: 31 });
      expect((await banc.registre.trouver(revendu.billetId))!.depart.siege).toBe(31);
    });

    it("un billet embarqué ne s'annule pas, même si la demande a été décidée : la base garde l'état", async () => {
      const ctx = await banc.nouveauContexte();
      const b = await banc.nouveauBillet(ctx, { etat: "embarque" });
      expect(
        await banc.registre.appliquer(b.billetId, "annuler", {
          at: instant(30),
          parId: ctx.superviseurId,
          motif: null,
        }),
      ).toBeNull();
      const { rows } = await sql.query(`SELECT etat, historique FROM billet WHERE id = $1`, [
        b.billetId,
      ]);
      expect(rows[0]).toEqual({ etat: "embarque", historique: [] });
      expect(await banc.siegeLibre(b)).toBe(false);
    });

    it("le numéro d'un billet ne change jamais, même annulé ; le billet ne s'efface pas", async () => {
      const ctx = await banc.nouveauContexte();
      const b = await banc.nouveauBillet(ctx);
      await banc.registre.appliquer(b.billetId, "annuler", {
        at: instant(30),
        parId: ctx.superviseurId,
        motif: null,
      });
      expect(
        await erreurSql(`UPDATE billet SET numero = 'AUTRE-0001' WHERE id = $1`, [b.billetId]),
      ).not.toBe("");
      expect(await erreurSql(`DELETE FROM billet WHERE id = $1`, [b.billetId])).not.toBe("");
    });

    it("un identifiant qui n'est pas un UUID est refusé proprement par la demande", async () => {
      const ctx = await banc.nouveauContexte();
      const b = await banc.nouveauBillet(ctx);
      expect(await banc.demandes.creer(uneDemande(ctx, b, { demandeId: "dem-1" }))).toBe(
        "identifiant_invalide",
      );
      expect(await banc.demandes.creer(uneDemande(ctx, { ...b, billetId: "billet-171" }))).toBe(
        "identifiant_invalide",
      );
    });

    it("le PIN provisoire est écrit avec son échéance : le haché et la date vont ensemble", async () => {
      const ctx = await banc.nouveauContexte();
      const id = await banc.nouveauMembre(ctx, { role: "guichetier" });
      await banc.pins.definirProvisoire(
        id,
        "$argon2id$haché",
        new Date("2027-01-04T09:00:00.000Z"),
      );
      const { rows } = await sql.query(
        `SELECT "pinHache", "pinProvisoireJusqua" FROM personne WHERE id = $1`,
        [id],
      );
      expect(rows[0].pinHache).toBe("$argon2id$haché");
      expect(rows[0].pinProvisoireJusqua.toISOString()).toBe("2027-01-04T09:00:00.000Z");
    });
  });

  describe("la gare vue depuis les tables", () => {
    it("guichets, billets du jour, départs de l'après-midi, quais et appareils synchronisés", async () => {
      const ctx = await contexte();
      const decor = decors.get(ctx.compagnieId)!;
      const source = new SourceGarePrisma(prisma, horloge);
      const ligne = await fx.ligne(ctx.compagnieId, ctx.gareId, decor.gareArriveeId);

      // Aujourd'hui (4 janvier 2027, Douala) : un départ le matin, deux l'après-midi, un annulé, un
      // départ d'une autre gare, un demain.
      const matin = await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-04T06:00:00.000Z"),
        quai: 1,
      });
      const bus = await fx.bus(ctx.compagnieId, "LT 412 AB", 70);
      const soir = await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-04T17:30:00.000Z"),
        quai: 4,
        busId: bus.id,
      });
      const annule = await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-04T15:00:00.000Z"),
        etat: "annule",
        quai: 3,
      });
      await fx.depart(ligne.id, { heureDepart: new Date("2027-01-05T14:00:00.000Z"), quai: 6 });
      void matin;
      void annule;

      // Les billets du jour : 3 au guichet 2, 1 au guichet 1 hier (ne compte pas), 2 vivants sur le soir.
      const contexteBillet = {
        compagnieId: ctx.compagnieId,
        gareId: ctx.gareId,
        departId: soir.id,
      };
      const vente = (guichet: number, surcharge: Parameters<typeof fx.billet>[1] = {}) =>
        fx.billet(contexteBillet, {
          canal: "guichet",
          guichetId: ctx.guichets[guichet - 1]!.id,
          auteurId: ctx.agents[guichet - 1]!,
          creeA: new Date("2027-01-04T07:30:00.000Z"),
          ...surcharge,
        });
      await vente(2);
      await vente(2);
      await vente(2, { etat: "annule" });
      await vente(1, { creeA: new Date("2027-01-03T07:30:00.000Z"), etat: "embarque" });

      // Les appareils : un à jour, un ancien, un retiré, un jamais vu.
      const maintenant = horloge.maintenant().getTime();
      for (const [id, derniere, retire] of [
        ["A-recent", maintenant - 60_000, false],
        ["A-ancien", maintenant - (SYNCHRO_RECENTE_MINUTES + 5) * 60_000, false],
        ["A-retire", maintenant - 60_000, true],
        ["A-jamais", null, false],
      ] as const) {
        await prisma.appareilSync.create({
          data: {
            id: `${id}-${ctx.gareId}`,
            genre: "guichet",
            gareId: ctx.gareId,
            compagnieId: ctx.compagnieId,
            retire,
            derniereSyncA: derniere === null ? null : new Date(derniere),
          },
        });
      }

      const vue = (await source.gare(ctx.gareId))!;
      expect(vue.id).toBe(ctx.gareId);
      expect(vue.quais).toBe(6);
      expect(vue.synchro).toEqual({ synchronises: 1, total: 3 });
      expect(vue.guichets).toEqual([
        { rang: 1, billets: 0 },
        { rang: 2, billets: 3 },
        { rang: 3, billets: 0 },
      ]);
      // L'après-midi seulement (à partir de 12 h à Douala), sans le départ annulé, dans l'ordre : le
      // départ du décor (14 h) puis celui de 18 h 30.
      expect(vue.departsApresMidi.map((d) => d.heureDepart)).toEqual([
        versIsoDouala("2027-01-04T13:00:00.000Z"),
        versIsoDouala("2027-01-04T17:30:00.000Z"),
      ]);
      expect(vue.departsApresMidi[1]).toEqual({
        departId: soir.id,
        heureDepart: versIsoDouala("2027-01-04T17:30:00.000Z"),
        destination: "Yaoundé",
        quai: 4,
        bus: "LT 412 AB",
        // Les billets vivants du départ, quel que soit le jour de la vente : 2 vendus, 1 embarqué.
        vendus: 3,
        capacite: 70,
        fusionProposeeAvec: null,
      });
      // Un départ sans bus reste lisible selon le contrat (capacité ≥ 1).
      expect(vue.departsApresMidi[0]).toMatchObject({
        departId: decor.departId,
        vendus: 0,
        quai: 2,
      });
      expect(await source.gare(randomUUID())).toBeNull();
      expect(await source.gare("pas-un-identifiant")).toBeNull();
      // La vue répond au contrat.
      const contrat = c.SchemaSuperviseurGare.shape.apresMidi.parse(vue.departsApresMidi);
      expect(contrat).toHaveLength(2);
    });

    it("compte les billets de cadence sans nom, et les demandes d'annulation de l'agent sur 10 jours", async () => {
      const ctx = await contexte();
      const decor = decors.get(ctx.compagnieId)!;
      const source = new SourceGarePrisma(prisma, horloge);
      const contexteBillet = {
        compagnieId: ctx.compagnieId,
        gareId: ctx.gareId,
        departId: decor.departId,
      };
      await prisma.billet.update({
        where: {
          id: (await fx.billet(contexteBillet, { creeA: new Date("2027-01-04T07:00:00.000Z") })).id,
        },
        data: { aCompleterAuQuai: true },
      });
      await prisma.billet.update({
        where: {
          id: (await fx.billet(contexteBillet, { creeA: new Date("2027-01-03T07:00:00.000Z") })).id,
        },
        data: { aCompleterAuQuai: true },
      });
      await fx.billet(contexteBillet, { creeA: new Date("2027-01-04T07:00:00.000Z") });
      expect(await source.cadenceSansNom(ctx.gareId, "270104")).toBe(1);
      expect(await source.cadenceSansNom(ctx.gareId, "270103")).toBe(1);
      expect(await source.cadenceSansNom(ctx.gareId, "270105")).toBe(0);
      expect(await source.cadenceSansNom(ctx.gareId, "pas-un-jour")).toBe(0);

      // Trois demandes aujourd'hui, une il y a 5 jours, une il y a 20 jours (hors période) ; un autre
      // guichetier en fait deux.
      const demander = async (agent: number, jours: number) => {
        const b = await banc.nouveauBillet(ctx, { rang: agent + 1 });
        await banc.demandes.creer(
          uneDemande(ctx, b, {
            demandeurId: ctx.agents[agent]!,
            demandeA: versIsoDouala(horloge.maintenant().getTime() - jours * 24 * MS_PAR_HEURE),
          }),
        );
      };
      await demander(0, 0);
      await demander(0, 0);
      await demander(0, 0);
      await demander(0, 5);
      await demander(0, 20);
      await demander(1, 1);
      await demander(1, 2);
      const stats = await source.annulationsAgent(
        ctx.agents[0]!,
        ctx.gareId,
        versIsoDouala(horloge.maintenant()),
      );
      // 6 demandes de la gare sur 10 jours (hors la plus ancienne) pour 3 guichets : 2 en moyenne.
      expect(stats).toEqual({ aujourdhui: 3, dixJours: 4, moyenneGuichets: 2 });
      expect(
        await source.annulationsAgent("x", ctx.gareId, versIsoDouala(horloge.maintenant())),
      ).toEqual({
        aujourdhui: 0,
        dixJours: 0,
        moyenneGuichets: 0,
      });
    });
  });

  describe("l'équipe vue depuis les tables", () => {
    it("situation du jour : guichetier avec caisse ouverte, chauffeur à bord, convoyeur au quai, billets des 90 jours", async () => {
      const ctx = await contexte();
      const decor = decors.get(ctx.compagnieId)!;
      const equipe = new EquipeGarePrisma(prisma, horloge);
      const gare = await prisma.gare.findUniqueOrThrow({ where: { id: ctx.gareId } });

      const chauffeur = await fx.personne({
        roles: ["chauffeur"],
        compagnieId: ctx.compagnieId,
        gareId: ctx.gareId,
      });
      const convoyeur = await fx.personne({
        roles: ["convoyeur"],
        compagnieId: ctx.compagnieId,
        gareId: ctx.gareId,
      });
      const repos = await fx.personne({
        roles: ["chauffeur"],
        compagnieId: ctx.compagnieId,
        gareId: ctx.gareId,
      });
      const ligne = await fx.ligne(ctx.compagnieId, ctx.gareId, decor.gareArriveeId);
      const bus = await fx.bus(ctx.compagnieId, "LT 412 AB");
      await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-04T07:00:00.000Z"),
        etat: "parti",
        busId: bus.id,
        chauffeurId: chauffeur.id,
      });
      const bus2 = await fx.bus(ctx.compagnieId, "LT 077 CD");
      await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-04T15:00:00.000Z"),
        etat: "embarquement",
        busId: bus2.id,
        convoyeurId: convoyeur.id,
      });
      // Un départ de la veille ne compte pas.
      await fx.depart(ligne.id, {
        heureDepart: new Date("2027-01-03T15:00:00.000Z"),
        etat: "parti",
        chauffeurId: repos.id,
      });

      // Le guichetier du guichet 2 a une caisse ouverte et trois billets vendus ; celui du guichet 1 non.
      await prisma.sessionCaisse.create({
        data: {
          numero: `K-${gare.code}-270104-2-1`,
          guichetId: ctx.guichets[1]!.id,
          guichetRang: 2,
          gareId: ctx.gareId,
          compagnieId: ctx.compagnieId,
          agentId: ctx.agents[1]!,
          fondDeCaisse: 1000,
          ouverteA: new Date("2027-01-04T07:00:00.000Z"),
          etat: "ouverte",
        },
      });
      const contexteBillet = {
        compagnieId: ctx.compagnieId,
        gareId: ctx.gareId,
        departId: decor.departId,
      };
      for (let i = 0; i < 3; i++) {
        await fx.billet(contexteBillet, {
          auteurId: ctx.agents[1]!,
          creeA: new Date("2026-12-01T08:00:00.000Z"),
        });
      }
      // Hors des 90 jours : ne compte pas.
      await fx.billet(contexteBillet, {
        auteurId: ctx.agents[1]!,
        creeA: new Date("2026-09-01T08:00:00.000Z"),
      });

      const par = new Map((await equipe.lister(ctx.gareId)).map((m) => [m.personneId, m]));
      expect(par.get(chauffeur.id)).toMatchObject({
        role: "chauffeur",
        affectation: "LT 412 AB",
        situationDuJour: "a_bord",
        situation: "en route vers Yaoundé",
      });
      expect(par.get(convoyeur.id)).toMatchObject({
        role: "convoyeur",
        affectation: "LT 077 CD",
        situationDuJour: "en_service",
        situation: null,
      });
      expect(par.get(repos.id)).toMatchObject({
        situationDuJour: "hors_service",
        affectation: null,
      });
      expect(par.get(ctx.agents[1]!)).toMatchObject({
        role: "guichetier",
        affectation: "guichet 2",
        situationDuJour: "en_service",
        billets: 3,
      });
      expect(par.get(ctx.agents[0]!)).toMatchObject({
        affectation: "guichet 1",
        situationDuJour: "hors_service",
        billets: 0,
      });
      expect(par.get(ctx.superviseurId)).toMatchObject({ role: "superviseur" });
      expect(par.get(ctx.agents[1]!)!.depuis).toMatch(/\+01:00$/);
    });
  });

  describe("API de bout en bout, stockage PostgreSQL", () => {
    let t: AppAgencePg;

    beforeAll(async () => {
      t = await creerAppAgencePg({ url: base.url, modules: [SupervisionModule] });
    }, 120_000);

    afterAll(async () => {
      await t?.fermer();
    });

    interface Decor {
      d: Awaited<ReturnType<AppAgencePg["decor"]>>;
      sup: { id: string; jeton: string; pin: string };
      g: { id: string; jeton: string };
      departId: string;
    }

    async function decor(): Promise<Decor> {
      const d = await t.decor();
      const sup = await t.compte(
        "superviseur",
        { compagnieId: d.compagnie.id, gareId: d.gare.id },
        { nom: "Marie Ngo Bayiha", pin: "739104" },
      );
      const g = await t.compte(
        "guichetier",
        { compagnieId: d.compagnie.id, gareId: d.gare.id },
        { nom: "Joseph Mbarga", guichetId: d.guichets[1]!.id },
      );
      const arrivee = await t.fx.gare(d.compagnie.id, { ville: "Yaoundé" });
      const ligne = await t.fx.ligne(d.compagnie.id, d.gare.id, arrivee.id);
      const depart = await t.fx.depart(ligne.id, {
        heureDepart: new Date(t.horloge.maintenant().getTime() + 5 * MS_PAR_HEURE),
        quai: 2,
      });
      return { d, sup, g, departId: depart.id };
    }

    const signer = async (
      s: Decor["sup"],
      evt: ReturnType<typeof evenement>,
    ): Promise<ReturnType<typeof evenement>> => {
      const rep = await envoyer(t, "/agence/superviseur/pin", s.jeton, {
        pin: s.pin,
        evenement: evt,
      });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const donnees = evt.donnees as { validePar: Record<string, unknown> };
      return {
        ...evt,
        donnees: {
          ...evt.donnees,
          validePar: { ...donnees.validePar, signature: rep.body.signature as string },
        },
      };
    };
    const evenementSup = (
      type: string,
      s: Decor["sup"],
      donnees: Record<string, unknown>,
    ): ReturnType<typeof evenement> =>
      evenement(
        type,
        s.id,
        { ...donnees, validePar: { superviseurId: s.id, methode: "pin" } },
        { at: t.iso(), appareilId: "SUP-DLA" },
      );

    it("clôture à valider : l'accueil la montre, le superviseur la valide avec son PIN, la base garde les deux", async () => {
      const x = await decor();
      const sessionId = randomUUID();
      const ouv = await envoyer(
        t,
        "/agence/caisse/ouverture",
        x.g.jeton,
        ouverture(t, x.g.id, {
          sessionId,
          guichetId: x.d.guichets[1]!.id,
          numero: `K-${x.d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
          fond: 25_000,
        }),
      );
      expect(ouv.status, JSON.stringify(ouv.body)).toBe(200);
      await envoyer(
        t,
        "/agence/caisse/comptage",
        x.g.jeton,
        comptage(x.g.id, sessionId, {}, 24_500, { at: t.iso() }),
      );
      const fin = await envoyer(
        t,
        "/agence/caisse/cloture",
        x.g.jeton,
        cloture(x.g.id, sessionId, 24_500, 25_000, { at: t.iso(60_000) }),
      );
      expect(fin.status, JSON.stringify(fin.body)).toBe(200);

      const accueil = await lire(t, "/agence/superviseur/gare", x.sup.jeton);
      expect(accueil.status, JSON.stringify(accueil.body)).toBe(200);
      const gare = c.SchemaSuperviseurGare.parse(accueil.body);
      expect(gare.gare).toEqual({ id: x.d.gare.id, nom: x.d.gare.nom });
      expect(gare.superviseur).toEqual({ id: x.sup.id, nom: "Marie Ngo Bayiha" });
      expect(gare.demandes).toMatchObject([
        { genre: "cloture", sessionId, guichetRang: 2, compte: 24_500, ecart: -500 },
      ]);
      expect(gare.guichets.find((u) => u.rang === 2)).toMatchObject({
        etat: "a_valider",
        ecart: -500,
      });
      expect(gare.apresMidi.map((u) => u.departId)).toEqual([x.departId]);

      const fiche = await lire(t, `/agence/superviseur/clotures/${sessionId}`, x.sup.jeton);
      expect(fiche.status, JSON.stringify(fiche.body)).toBe(200);
      expect(c.SchemaSuperviseurCloture.parse(fiche.body).bilan).toMatchObject({
        attendu: 25_000,
        compte: 24_500,
        ecart: -500,
      });

      // Sans la preuve du PIN : refusé, et la base ne bouge pas.
      const sansPreuve = evenementSup("caisse.validee", x.sup, {
        sessionId,
        ecart: -500,
        commentaire: null,
      });
      const sansSignature = await envoyer(
        t,
        "/agence/superviseur/validations",
        x.sup.jeton,
        sansPreuve,
      );
      expect(sansSignature.status).toBe(422);
      const inventee = {
        ...sansPreuve,
        donnees: {
          ...sansPreuve.donnees,
          validePar: { superviseurId: x.sup.id, methode: "pin", signature: "ab".repeat(32) },
        },
      };
      const refuse = await envoyer(t, "/agence/superviseur/validations", x.sup.jeton, inventee);
      expect(refuse.status, JSON.stringify(refuse.body)).toBe(403);

      const evt = await signer(
        x.sup,
        evenementSup("caisse.validee", x.sup, { sessionId, ecart: -500, commentaire: "RAS" }),
      );
      const ok = await envoyer(t, "/agence/superviseur/validations", x.sup.jeton, evt);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const { rows } = await t.prisma.$queryRaw<
        { etat: string; valideeParId: string; validation: { superviseurNom: string } }[]
      >`SELECT etat::text AS etat, "valideeParId", validation FROM session_caisse WHERE id = ${sessionId}::uuid`.then(
        (r) => ({ rows: r }),
      );
      expect(rows[0]).toMatchObject({ etat: "validee", valideeParId: x.sup.id });
      expect(rows[0]!.validation.superviseurNom).toBe("Marie Ngo Bayiha");

      // Rejouée : deja_recu ; une deuxième validation d'une autre main : 409.
      const rejeu = await envoyer(t, "/agence/superviseur/validations", x.sup.jeton, evt);
      expect(rejeu.body.accuse.statut).toBe("deja_recu");
      const autre = await signer(
        x.sup,
        evenementSup("caisse.validee", x.sup, { sessionId, ecart: -500, commentaire: null }),
      );
      expect((await envoyer(t, "/agence/superviseur/validations", x.sup.jeton, autre)).status).toBe(
        409,
      );
      expect(await t.journal.verifier(x.d.compagnie.id)).toMatchObject({ valide: true });
    });

    it("refuser · recompter : la caisse redevient ouverte, avec l'historique des refus", async () => {
      const x = await decor();
      const sessionId = randomUUID();
      await envoyer(
        t,
        "/agence/caisse/ouverture",
        x.g.jeton,
        ouverture(t, x.g.id, {
          sessionId,
          guichetId: x.d.guichets[1]!.id,
          numero: `K-${x.d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
        }),
      );
      await envoyer(
        t,
        "/agence/caisse/cloture",
        x.g.jeton,
        cloture(x.g.id, sessionId, 20_000, 25_000, { at: t.iso(60_000) }),
      );
      const evt = await signer(
        x.sup,
        evenementSup("caisse.refusee", x.sup, { sessionId, motif: "Recomptez le tiroir" }),
      );
      const rep = await envoyer(t, "/agence/superviseur/refus", x.sup.jeton, evt);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const { rows } = await sql.query(
        `SELECT etat, cloture, "clotureeA", "cashCompte", refus, "reouverteA" FROM session_caisse WHERE id = $1`,
        [sessionId],
      );
      expect(rows[0]).toMatchObject({
        etat: "ouverte",
        cloture: null,
        clotureeA: null,
        cashCompte: null,
      });
      expect(rows[0].refus).toHaveLength(1);
      expect(rows[0].refus[0]).toMatchObject({ motif: "Recomptez le tiroir", ecart: -5_000 });
      expect(rows[0].reouverteA).not.toBeNull();
      // Le guichetier peut recompter et clôturer à nouveau.
      const encore = await envoyer(
        t,
        "/agence/caisse/cloture",
        x.g.jeton,
        cloture(x.g.id, sessionId, 25_000, 25_000, { at: t.iso(120_000) }),
      );
      expect(encore.status, JSON.stringify(encore.body)).toBe(200);
    });

    it("annulation remboursée en cash : le billet garde son numéro, le siège est libéré, la caisse retranche une seule fois", async () => {
      const x = await decor();
      const sessionId = randomUUID();
      await envoyer(
        t,
        "/agence/caisse/ouverture",
        x.g.jeton,
        ouverture(t, x.g.id, {
          sessionId,
          guichetId: x.d.guichets[1]!.id,
          numero: `K-${x.d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
          fond: 25_000,
        }),
      );
      t.horloge.avancer(10 * 60_000);
      const billet = await t.fx.billet(
        { compagnieId: x.d.compagnie.id, gareId: x.d.gare.id, departId: x.departId },
        {
          siege: 14,
          prix: 7_500,
          etat: "paye",
          canal: "guichet",
          guichetId: x.d.guichets[1]!.id,
          auteurId: x.g.id,
          mode: "cash",
          creeA: t.horloge.maintenant(),
        },
      );
      await t.prisma.siegeDepart.create({
        data: { departId: x.departId, siege: 14, billetId: billet.id },
      });

      // Le guichetier demande l'annulation ; il ne peut pas l'annuler seul.
      const demandeId = randomUUID();
      const demande = await envoyer(
        t,
        "/agence/annulations",
        x.g.jeton,
        evenement(
          "annulation.demandee",
          x.g.id,
          { demandeId, billetId: billet.id, motif: "Le client a changé d'avis" },
          { at: t.iso() },
        ),
      );
      expect(demande.status, JSON.stringify(demande.body)).toBe(200);
      // Une deuxième demande pour le même billet : 409.
      const doublon = await envoyer(
        t,
        "/agence/annulations",
        x.g.jeton,
        evenement(
          "annulation.demandee",
          x.g.id,
          { demandeId: randomUUID(), billetId: billet.id, motif: "Encore" },
          { at: t.iso() },
        ),
      );
      expect(doublon.status).toBe(409);
      expect(doublon.body.code).toBe("DEMANDE_EXISTANTE");

      const fiche = await lire(t, `/agence/superviseur/annulations/${demandeId}`, x.sup.jeton);
      expect(fiche.status, JSON.stringify(fiche.body)).toBe(200);
      expect(c.SchemaSuperviseurAnnulation.parse(fiche.body).billet).toMatchObject({
        numero: billet.numero,
        prix: 7_500,
        // Billet de cadence : pas de nom saisi, la fiche reste lisible.
        voyageur: { nom: "Voyageur sans nom" },
        depart: { siege: 14, destination: "Yaoundé" },
        vendu: { mode: "cash", agent: { id: x.g.id, nom: "Joseph Mbarga" } },
      });

      // Dix décisions simultanées (autant d'événements signés) : une seule passe.
      const decisions = await Promise.all(
        Array.from({ length: 10 }, () =>
          signer(
            x.sup,
            evenementSup("annulation.decidee", x.sup, {
              demandeId,
              billetId: billet.id,
              decision: "rembourser",
              montant: 7_500,
            }),
          ),
        ),
      );
      const reponses = await Promise.all(
        decisions.map((e) => envoyer(t, "/agence/superviseur/annulations", x.sup.jeton, e)),
      );
      const statuts = reponses.map((r) => `${r.status}`);
      expect(
        statuts.filter((s) => s === "200"),
        JSON.stringify(reponses.map((r) => r.body)),
      ).toHaveLength(1);
      expect(statuts.filter((s) => s === "409")).toHaveLength(9);

      const { rows } = await sql.query(
        `SELECT etat, numero, historique FROM billet WHERE id = $1`,
        [billet.id],
      );
      expect(rows[0].etat).toBe("annule");
      expect(rows[0].numero).toBe(billet.numero);
      expect(rows[0].historique).toHaveLength(1);
      const sieges = await sql.query(`SELECT 1 FROM siege_depart WHERE "billetId" = $1`, [
        billet.id,
      ]);
      expect(sieges.rowCount).toBe(0);
      const { rows: demandes } = await sql.query(
        `SELECT statut, decision, montant, "decideeParId" FROM demande_annulation WHERE "demandeId" = $1`,
        [demandeId],
      );
      expect(demandes[0]).toEqual({
        statut: "decidee",
        decision: "rembourser",
        montant: 7_500,
        decideeParId: x.sup.id,
      });
      const { rows: retranche } = await sql.query(
        `SELECT "sessionId", montant FROM annulation_caisse WHERE "demandeId" = $1`,
        [demandeId],
      );
      expect(retranche).toEqual([{ sessionId, montant: 7_500 }]);

      // La caisse du guichetier : fond + ventes cash − remboursement.
      const lecture = await lire(t, "/agence/caisse/session", x.g.jeton);
      expect(lecture.body.cashAttendu).toBe(25_000 + 7_500 - 7_500);
      expect(lecture.body.decompte.annulationsValidees).toEqual({ nombre: 1, montant: 7_500 });
      expect(await t.journal.verifier(x.d.compagnie.id)).toMatchObject({ valide: true });
    });

    it("équipe : PIN provisoire par SMS (jamais en clair en base), changement d'affectation, désactivation immédiate", async () => {
      const x = await decor();
      const membre = await t.compte(
        "convoyeur",
        { compagnieId: x.d.compagnie.id, gareId: x.d.gare.id },
        { nom: "Paul Mbida" },
      );
      const lueAvant = await lire(t, "/agence/superviseur/equipe", x.sup.jeton);
      expect(lueAvant.status, JSON.stringify(lueAvant.body)).toBe(200);
      expect(c.SchemaSuperviseurEquipe.parse(lueAvant.body).effectif).toBeGreaterThanOrEqual(3);

      // PIN provisoire.
      const pin = await signer(
        x.sup,
        evenementSup("equipe.pin_renouvele", x.sup, { personneId: membre.id }),
      );
      const rep = await envoyer(t, "/agence/superviseur/equipe/pin", x.sup.jeton, pin);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const sms = t.sms.dernier()!;
      const provisoire = /\b(\d{6})\b/.exec(sms.message)![1]!;
      const { rows } = await sql.query(
        `SELECT "pinHache", "pinProvisoireJusqua" FROM personne WHERE id = $1`,
        [membre.id],
      );
      expect(rows[0].pinHache).toMatch(/^\$argon2id\$/);
      expect(rows[0].pinHache).not.toContain(provisoire);
      expect(rows[0].pinProvisoireJusqua).toBeInstanceOf(Date);
      expect(JSON.stringify(rep.body)).not.toContain(provisoire);
      const { rows: journal } = await sql.query(
        `SELECT resume FROM journal_agence WHERE chaine = $1 AND type = 'equipe.pin_renouvele'`,
        [x.d.compagnie.id],
      );
      expect(JSON.stringify(journal)).not.toContain(provisoire);

      // Affectation : guichet 3.
      const affectation = await signer(
        x.sup,
        evenementSup("equipe.affectation_changee", x.sup, {
          personneId: membre.id,
          guichetId: x.d.guichets[2]!.id,
          role: null,
        }),
      );
      const r2 = await envoyer(
        t,
        "/agence/superviseur/equipe/affectation",
        x.sup.jeton,
        affectation,
      );
      expect(r2.status, JSON.stringify(r2.body)).toBe(200);
      const { rows: apres } = await sql.query(`SELECT "guichetId" FROM personne WHERE id = $1`, [
        membre.id,
      ]);
      expect(apres[0].guichetId).toBe(x.d.guichets[2]!.id);

      // Désactivation : le jeton déjà émis cesse de passer, le patron est alerté.
      expect((await lire(t, "/agence/caisse/session", membre.jeton)).status).not.toBe(401);
      const desactive = await signer(
        x.sup,
        evenementSup("equipe.compte_desactive", x.sup, { personneId: membre.id }),
      );
      const r3 = await envoyer(
        t,
        "/agence/superviseur/equipe/desactivation",
        x.sup.jeton,
        desactive,
      );
      expect(r3.status, JSON.stringify(r3.body)).toBe(200);
      const { rows: actif } = await sql.query(`SELECT actif FROM personne WHERE id = $1`, [
        membre.id,
      ]);
      expect(actif[0].actif).toBe(false);
      expect((await lire(t, "/agence/caisse/session", membre.jeton)).status).toBe(401);
      const { rows: alertes } = await sql.query(
        `SELECT type FROM alerte_patron WHERE "compagnieId" = $1`,
        [x.d.compagnie.id],
      );
      expect(alertes).toEqual([{ type: "compte_desactive" }]);
    });

    it("un identifiant de demande qui n'est pas un UUID : 422, rien n'est écrit", async () => {
      const x = await decor();
      const billet = await t.fx.billet(
        { compagnieId: x.d.compagnie.id, gareId: x.d.gare.id, departId: x.departId },
        { canal: "guichet", guichetId: x.d.guichets[1]!.id, auteurId: x.g.id },
      );
      const rep = await envoyer(
        t,
        "/agence/annulations",
        x.g.jeton,
        evenement(
          "annulation.demandee",
          x.g.id,
          { demandeId: "dem-1", billetId: billet.id, motif: "Erreur" },
          { at: t.iso() },
        ),
      );
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("IDENTIFIANT_INVALIDE");
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM demande_annulation WHERE "billetId" = $1`,
        [billet.id],
      );
      expect(rows[0].n).toBe(0);
    });
  });
});
