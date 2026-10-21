import { randomUUID } from "node:crypto";
import { agence, voyageur } from "@afrimove/contrats";
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
import { OPTIONS_BILLETTERIE } from "./passerelle";
import {
  BilletsMemoire,
  CatalogueMemoire,
  CommandesMemoire,
  EvenementsTraitesMemoire,
  InventaireMemoire,
  PreferencesMemoire,
  ScansMemoire,
} from "./memoire";
import type { Bus, Compagnie, Depart, Gare, Guichet, Ligne } from "./modeles";
import {
  BilletsPrisma,
  CataloguePrisma,
  CommandesPrisma,
  EvenementsTraitesPrisma,
  InventairePrisma,
  NumerotationEnLigneServeur,
  PreferencesPrisma,
  ScansPrisma,
} from "./postgres";
import {
  Billets,
  Catalogue,
  Commandes,
  EvenementsTraites,
  Inventaire,
  NumerotationEnLigne,
  PreferencesVoyageur,
  Scans,
} from "./ports";
import { CommandesService } from "./commandes.service";
import {
  contratPortsBilletterie,
  type MondeBilletterie,
  type Reseau,
} from "./testing/contrat-ports";
import { avec, especes, evenement } from "./testing/app-billetterie-test";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs de la billetterie : les mêmes tests de contrat sur la mémoire (toujours) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (siège jamais
 * vendu deux fois, billet jamais scanné deux fois, événement jamais traité deux fois) et l'API de bout
 * en bout avec `API_STOCKAGE=postgres`, redémarrage compris.
 */

let compteurCodes = 0;
/** Code de compagnie à 3 lettres, unique dans le fichier. */
const code3 = (): string => {
  compteurCodes += 1;
  const n = compteurCodes;
  return [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26]
    .map((x) => String.fromCharCode(65 + x))
    .join("");
};

const heure = (hhmm: string, jour = "2027-01-06"): string => `${jour}T${hhmm}:00.000+01:00`;

/** Ce que le monde crée, dans le vocabulaire du domaine ; la mémoire et la base reçoivent les mêmes. */
function reseauType(): Reseau {
  const compagnie: Compagnie = { id: randomUUID(), code: code3(), nom: "Agence test" };
  const origine: Gare = {
    id: randomUUID(),
    compagnieId: compagnie.id,
    code: "DLA",
    nom: "Akwa",
    ville: "Douala",
  };
  const destination: Gare = {
    id: randomUUID(),
    compagnieId: compagnie.id,
    code: "YDE",
    nom: "Mvan",
    ville: "Yaoundé",
  };
  const guichet: Guichet = { id: randomUUID(), gareId: origine.id, rang: 1 };
  const bus: Bus = {
    id: randomUUID(),
    compagnieId: compagnie.id,
    immatriculation: `LT ${Math.floor(Math.random() * 900 + 100)} AB`,
    capacite: 40,
    capaciteSoute: 20,
    classe: "classique",
  };
  const ligne: Ligne = {
    id: randomUUID(),
    compagnieId: compagnie.id,
    code: "DLAYDE",
    origineGareId: origine.id,
    destinationGareId: destination.id,
    tarifs: { classique: 4000, vip: 6000, bagage: 500 },
    dureeMinutes: 270,
    arrets: [
      { id: randomUUID(), nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
      { id: randomUUID(), nom: "Édéa", ordre: 1, kmDepuisOrigine: 65, montee: true },
      { id: randomUUID(), nom: "Yaoundé", ordre: 2, kmDepuisOrigine: 250, montee: false },
    ],
  };
  return { compagnie, origine, destination, guichet, ligne, bus };
}

function departType(
  r: Reseau,
  equipage: Pick<Depart, "chauffeur" | "convoyeur">,
  s: Partial<Depart>,
): Depart {
  return {
    id: randomUUID(),
    numero: `${r.compagnie.code}-DLAYDE-270106-${String(Math.floor(Math.random() * 9000 + 1000))}${randomUUID().slice(0, 4)}`,
    ligneId: r.ligne.id,
    busId: r.bus.id,
    classe: "classique",
    heureDepart: heure("14:00"),
    etat: "en_vente",
    historique: [],
    fusionneDansId: null,
    quai: 3,
    ...equipage,
    ...s,
  };
}

/* ------------------------------------------------------------------ mémoire */

function mondeMemoire(catalogue: CatalogueMemoire): MondeBilletterie {
  const personne = async (nom = "Personne test") => ({ id: randomUUID(), nom });
  return {
    personne,
    async affecter(personneId, guichetId) {
      catalogue.affecterGuichet(personneId, guichetId);
    },
    async reseau() {
      const r = reseauType();
      catalogue.ajouterCompagnie(r.compagnie);
      catalogue.ajouterGare(r.origine);
      catalogue.ajouterGare(r.destination);
      catalogue.ajouterGuichet(r.guichet);
      catalogue.ajouterBus(r.bus);
      catalogue.ajouterLigne(r.ligne);
      return r;
    },
    async depart(r, surcharge = {}) {
      const d = departType(
        r,
        { chauffeur: await personne("Paul Mbarga"), convoyeur: await personne("Joël Ndzana") },
        surcharge,
      );
      catalogue.ajouterDepart(d);
      return d;
    },
  };
}

contratPortsBilletterie("contrat · adaptateurs en mémoire", async () => {
  const catalogue = new CatalogueMemoire();
  return {
    catalogue,
    billets: new BilletsMemoire(),
    inventaire: new InventaireMemoire(),
    commandes: new CommandesMemoire(),
    scans: new ScansMemoire(),
    traites: new EvenementsTraitesMemoire(),
    preferences: new PreferencesMemoire(),
    monde: mondeMemoire(catalogue),
    fermer: async () => undefined,
  };
});

/* ------------------------------------------------------------------ PostgreSQL */

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · billetterie", () => {
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

  async function personne(nom = "Personne test") {
    const p = await prisma.personne.create({
      data: { nom, telephoneChiffre: "chiffre", telephoneIndex: randomUUID(), roles: ["voyageur"] },
    });
    return { id: p.id, nom };
  }

  async function reseau(): Promise<Reseau> {
    const r = reseauType();
    await prisma.compagnie.create({
      data: { id: r.compagnie.id, code: r.compagnie.code, nom: r.compagnie.nom },
    });
    for (const g of [r.origine, r.destination]) {
      await prisma.gare.create({
        data: {
          id: g.id,
          compagnieId: g.compagnieId,
          code: g.code,
          nom: g.nom,
          ville: g.ville,
        },
      });
    }
    await prisma.guichet.create({
      data: { id: r.guichet.id, gareId: r.guichet.gareId, rang: r.guichet.rang },
    });
    await prisma.bus.create({
      data: {
        id: r.bus.id,
        compagnieId: r.bus.compagnieId,
        immatriculation: r.bus.immatriculation,
        capacite: r.bus.capacite,
        capaciteSoute: r.bus.capaciteSoute,
        classe: r.bus.classe,
      },
    });
    await prisma.ligne.create({
      data: {
        id: r.ligne.id,
        compagnieId: r.ligne.compagnieId,
        code: r.ligne.code,
        origineGareId: r.ligne.origineGareId,
        destinationGareId: r.ligne.destinationGareId,
        tarifClassique: r.ligne.tarifs.classique,
        tarifVip: r.ligne.tarifs.vip,
        tarifBagage: r.ligne.tarifs.bagage,
        dureeMinutes: r.ligne.dureeMinutes,
        arrets: {
          create: r.ligne.arrets.map((a) => ({
            id: a.id,
            ordre: a.ordre,
            nom: a.nom,
            kmDepuisOrigine: a.kmDepuisOrigine,
            montee: a.montee,
          })),
        },
      },
    });
    return r;
  }

  async function departEnBase(r: Reseau, surcharge: Partial<Depart> = {}): Promise<Depart> {
    const d = departType(
      r,
      { chauffeur: await personne("Paul Mbarga"), convoyeur: await personne("Joël Ndzana") },
      surcharge,
    );
    await prisma.depart.create({
      data: {
        id: d.id,
        numero: d.numero,
        ligneId: d.ligneId,
        busId: d.busId,
        classe: d.classe,
        heureDepart: new Date(d.heureDepart),
        etat: d.etat,
        historique: d.historique as never,
        fusionneDansId: d.fusionneDansId,
        quai: d.quai,
        chauffeurId: d.chauffeur?.id ?? null,
        convoyeurId: d.convoyeur?.id ?? null,
      },
    });
    return d;
  }

  const mondePg: MondeBilletterie = {
    reseau,
    depart: departEnBase,
    personne,
    async affecter(personneId, guichetId) {
      await prisma.personne.update({ where: { id: personneId }, data: { guichetId } });
    },
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsBilletterie("contrat · adaptateurs PostgreSQL", async () => ({
    catalogue: new CataloguePrisma(prisma),
    billets: new BilletsPrisma(prisma),
    inventaire: new InventairePrisma(prisma),
    commandes: new CommandesPrisma(prisma),
    scans: new ScansPrisma(prisma),
    traites: new EvenementsTraitesPrisma(prisma),
    preferences: new PreferencesPrisma(prisma),
    monde: mondePg,
    fermer: async () => undefined,
  }));

  /* ---------------------------------------------------------------- ce que la base garantit */

  describe("ce que la base garantit seule", () => {
    it("un siège ne se vend pas deux fois, même par deux écritures SQL directes", async () => {
      const d = await departEnBase(await reseau());
      const occuper = (billetId: string) =>
        erreurSql(`INSERT INTO siege_depart ("departId", siege, "billetId") VALUES ($1, 5, $2)`, [
          d.id,
          billetId,
        ]);
      expect(await occuper(randomUUID())).toBe("");
      expect(await occuper(randomUUID())).toMatch(/siege_depart_pkey/);
    });

    it("un siège est occupé ou retenu, jamais les deux ni aucun des deux", async () => {
      const d = await departEnBase(await reseau());
      const ecrire = (colonnes: string, valeurs: string) =>
        erreurSql(
          `INSERT INTO siege_depart ("departId", siege, ${colonnes}) VALUES ($1, 6, ${valeurs})`,
          [d.id],
        );
      expect(
        await ecrire(`"billetId", "bloquePar", "bloqueJusqua"`, `gen_random_uuid(), 'v', now()`),
      ).toMatch(/siege_depart_occupe_ou_retenu/);
      expect(await ecrire(`"commandeId"`, `NULL`)).toMatch(/siege_depart_occupe_ou_retenu/);
      expect(await ecrire(`"bloquePar"`, `'v'`)).toMatch(/siege_depart_retenue_complete/);
      expect(
        await erreurSql(
          `INSERT INTO siege_depart ("departId", siege, "billetId") VALUES ($1, 0, gen_random_uuid())`,
          [d.id],
        ),
      ).toMatch(/siege_depart_siege_positif/);
    });

    it("jamais deux billets vivants sur le même siège d'un départ, même écrits à la main ; un billet annulé libère le siège", async () => {
      const r = await reseau();
      const d = await departEnBase(r);
      const banc = new BilletsPrisma(prisma);
      const un = {
        id: randomUUID(),
        numero: `${r.compagnie.code}-DLA-270106-0001`,
        sequence: 1,
        compagnieId: r.compagnie.id,
        gareId: r.origine.id,
        departId: d.id,
        siege: 11,
        classe: "classique" as const,
        prix: 4000,
        bagage: 0,
        canal: "guichet" as const,
        guichetId: null,
        acheteurId: null,
        commandeId: null,
        passagerChiffre: "x",
        passagerTelephoneIndex: null,
        codeBillet: "1111",
        qr: "",
        creeA: "2027-01-05T09:00:00.000+01:00",
        etat: "paye" as const,
        historique: [],
        evenementId: null,
        appareilId: null,
        auteurId: null,
        paiement: null,
        aCompleterAuQuai: false,
        smsEnvoye: false,
        retardPrevenu: false,
        embarqueA: null,
        reporteDe: null,
      };
      expect(await banc.ajouter(un)).toBe("ok");
      // Un second billet vivant sur le même siège : l'index unique partiel le refuse.
      await expect(
        banc.ajouter({
          ...un,
          id: randomUUID(),
          numero: `${r.compagnie.code}-DLA-270106-0002`,
          codeBillet: "2222",
        }),
      ).rejects.toThrow();
      await banc.transitionner(un.id, ["paye"], { etat: "annule" });
      expect(
        await banc.ajouter({
          ...un,
          id: randomUUID(),
          numero: `${r.compagnie.code}-DLA-270106-0002`,
          codeBillet: "2222",
        }),
      ).toBe("ok");
    });

    it("le journal des scans et celui des événements traités sont en ajout seul", async () => {
      const scans = new ScansPrisma(prisma);
      const traites = new EvenementsTraitesPrisma(prisma);
      const evenementId = randomUUID();
      await scans.ajouter({
        evenementId,
        departId: randomUUID(),
        billetId: null,
        numero: null,
        resultat: "introuvable",
        at: "2027-01-06T13:00:00.000+01:00",
        siege: null,
        classe: null,
        bagagesSoute: 0,
        premierScanA: null,
        appareilId: "tel",
        auteurId: "a",
      });
      await traites.memoriser({
        id: evenementId,
        type: "billet.vendu",
        recuA: "2027-01-06T13:00:00.000+01:00",
        reponseChiffree: "x",
      });
      for (const table of ["scan_quai", "evenement_traite"]) {
        const cle = table === "scan_quai" ? `"evenementId"` : "id";
        expect(
          await erreurSql(
            `UPDATE ${table} SET type = 'x'`.replace(
              "type",
              table === "scan_quai" ? "numero" : "type",
            ),
          ),
        ).toMatch(/ajout seul/);
        expect(await erreurSql(`DELETE FROM ${table} WHERE ${cle} = $1`, [evenementId])).toMatch(
          /ajout seul/,
        );
        expect(await erreurSql(`TRUNCATE ${table}`)).toMatch(/ajout seul/);
      }
    });

    it("une commande a un statut connu, un total positif et une échéance après sa création", async () => {
      const r = await reseau();
      const d = await departEnBase(r);
      const v = await personne();
      const inserer = (statut: string, total: number, expire: string) =>
        erreurSql(
          `INSERT INTO commande (id, "voyageurId", "departId", type, libelle, total, statut, "creeA", "expireA", "passagersChiffre")
           VALUES (gen_random_uuid(), $1, $2, 'billet', 'x', $3, $4, '2027-01-05T09:00:00+01:00', $5, 'c')`,
          [v.id, d.id, total, statut, expire],
        );
      expect(await inserer("en_attente_paiement", 4000, "2027-01-05T09:15:00+01:00")).toBe("");
      expect(await inserer("inconnu", 4000, "2027-01-05T09:15:00+01:00")).toMatch(
        /commande_statut_connu/,
      );
      expect(await inserer("payee", -1, "2027-01-05T09:15:00+01:00")).toMatch(
        /commande_total_positif/,
      );
      expect(await inserer("payee", 1, "2027-01-05T08:00:00+01:00")).toMatch(/commande_expiration/);
    });

    it("la version du plan monte dans la même transaction que le siège : un échec ne la fait pas monter", async () => {
      const d = await departEnBase(await reseau());
      const inventaire = new InventairePrisma(prisma);
      await inventaire.occuper({
        departId: d.id,
        siege: 1,
        billetId: randomUUID(),
        par: null,
        maintenant: "2027-01-05T09:00:00.000+01:00",
      });
      const refus = await inventaire.occuper({
        departId: d.id,
        siege: 1,
        billetId: randomUUID(),
        par: null,
        maintenant: "2027-01-05T09:00:00.000+01:00",
      });
      expect(refus.ok).toBe(false);
      const { rows } = await sql.query(`SELECT "versionPlan" FROM depart WHERE id = $1`, [d.id]);
      expect(rows[0].versionPlan).toBe(1);
      // Un départ qui n'existe pas ne peut pas avoir de siège (clé étrangère).
      await expect(
        inventaire.occuper({
          departId: randomUUID(),
          siege: 1,
          billetId: randomUUID(),
          par: null,
          maintenant: "2027-01-05T09:00:00.000+01:00",
        }),
      ).rejects.toThrow();
    });

    it("supprimer un départ rend ses sièges (cascade) et le départ garde ses billets (clé étrangère)", async () => {
      const r = await reseau();
      const d = await departEnBase(r);
      await new InventairePrisma(prisma).bloquer({
        departId: d.id,
        siege: 2,
        par: "v",
        commandeId: null,
        jusqua: "2027-01-05T09:15:00.000+01:00",
        maintenant: "2027-01-05T09:00:00.000+01:00",
      });
      expect(await erreurSql(`DELETE FROM depart WHERE id = $1`, [d.id])).toBe("");
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM siege_depart WHERE "departId" = $1`,
        [d.id],
      );
      expect(rows[0].n).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- l'API de bout en bout */

  describe("l'API de bout en bout, stockage PostgreSQL", () => {
    const MOT_DE_PASSE = "Un-mot-de-passe-solide";
    let stockageAvant: string | undefined;
    let app: NestExpressApplication | null = null;
    let r: Reseau;
    let depart: Depart;
    let compteur = 0;
    let demain = "";

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

    async function compte(role: Role, options: { guichetId?: string } = {}) {
      compteur += 1;
      const voyageurRole = role === "voyageur";
      const p = await app!.get(ComptesService).creer({
        nom: `Test ${role} ${compteur}`,
        telephone: `+2376556${String(compteur).padStart(5, "0")}`,
        roles: [role],
        compagnieId: voyageurRole ? null : r.compagnie.id,
        gareId: voyageurRole ? null : r.origine.id,
        pin: "482915",
        ...(METHODE_PAR_ROLE[role] === "motdepasse_sms" ? { motDePasse: MOT_DE_PASSE } : {}),
      });
      if (options.guichetId) {
        await prisma.personne.update({
          where: { id: p.id },
          data: { guichetId: options.guichetId },
        });
      }
      const { accessToken } = await app!.get(TokensService).emettre({
        sub: p.id,
        role,
        cid: p.compagnieId,
        gid: p.gareId,
      });
      return { id: p.id, jeton: accessToken };
    }

    const http = () => request(app!.getHttpServer());
    const maintenant = (): string => versIsoDouala(new Date());
    let numeroPlage = 0;

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      r = await reseau();
      // Un départ demain à 14 h (heure de Douala), de quoi vendre quel que soit le jour du test.
      demain = versIsoDouala(Date.now() + 24 * 3_600_000).slice(0, 10);
      depart = await departEnBase(r, { heureDepart: heure("14:00", demain) });
      app = await demarrer();
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise les adaptateurs PostgreSQL quand API_STOCKAGE=postgres", () => {
      expect(app!.get(Catalogue)).toBeInstanceOf(CataloguePrisma);
      expect(app!.get(Billets)).toBeInstanceOf(BilletsPrisma);
      expect(app!.get(Inventaire)).toBeInstanceOf(InventairePrisma);
      expect(app!.get(Commandes)).toBeInstanceOf(CommandesPrisma);
      expect(app!.get(Scans)).toBeInstanceOf(ScansPrisma);
      expect(app!.get(EvenementsTraites)).toBeInstanceOf(EvenementsTraitesPrisma);
      expect(app!.get(PreferencesVoyageur)).toBeInstanceOf(PreferencesPrisma);
      expect(app!.get(NumerotationEnLigne)).toBeInstanceOf(NumerotationEnLigneServeur);
    });

    it("la recherche et le plan des sièges viennent de la base", async () => {
      const v = await compte("voyageur");
      const recherche = await http()
        .get(`/voyageur/departs?depart=DLA&arrivee=YDE&jour=${demain}&compagnies=${r.compagnie.id}`)
        .set(avec(v.jeton));
      expect(recherche.status, JSON.stringify(recherche.body)).toBe(200);
      const res = voyageur.SchemaResultatRechercheDeparts.parse(recherche.body);
      expect(res.departs.map((x) => x.id)).toContain(depart.id);
      const plan = await http().get(`/voyageur/departs/${depart.id}/sieges`).set(avec(v.jeton));
      expect(plan.status).toBe(200);
      expect(plan.body.versionPlan).toBeGreaterThanOrEqual(0);
    });

    it("dix voyageurs bloquent le même siège en même temps : un seul l'obtient", async () => {
      const foule = await Promise.all(Array.from({ length: 10 }, () => compte("voyageur")));
      const reponses = await Promise.all(
        foule.map((v) =>
          http()
            .post(`/voyageur/departs/${depart.id}/sieges/30/blocage`)
            .set(avec(v.jeton))
            .send({}),
        ),
      );
      expect(reponses.filter((x) => x.status === 200)).toHaveLength(1);
      expect(reponses.filter((x) => x.status === 409)).toHaveLength(9);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM siege_depart WHERE "departId" = $1 AND siege = 30`,
        [depart.id],
      );
      expect(rows[0].n).toBe(1);
    });

    it("commande, paiement, billet : numéros du serveur sans trou, sièges occupés, billet relu, annulation qui rend le siège", async () => {
      const v = await compte("voyageur");
      const commande = await http()
        .post("/voyageur/commandes")
        .set(avec(v.jeton))
        .send({
          departId: depart.id,
          sieges: [31, 32],
          pour: "plusieurs",
          passagers: [{ nom: "Mireille Kamga" }, { nom: "Paul Essomba" }],
        });
      expect(commande.status, JSON.stringify(commande.body)).toBe(201);
      const cmd = voyageur.SchemaCommande.parse(commande.body);
      const lignesBloquees = await sql.query(
        `SELECT siege FROM siege_depart WHERE "departId" = $1 AND "commandeId" = $2 ORDER BY siege`,
        [depart.id, cmd.id],
      );
      expect(lignesBloquees.rows.map((x) => x.siege)).toEqual([31, 32]);

      const { billets } = await app!.get(CommandesService).confirmerPaiement(cmd.id, "mtn_momo");
      expect(billets).toHaveLength(2);
      const sequences = billets.map((b) => b.sequence).sort((a, b) => a - b);
      expect(sequences[1]! - sequences[0]!).toBe(1);
      expect(sequences[0]).toBeGreaterThanOrEqual(4001);
      // Rejouer le paiement (webhook renvoyé) ne crée rien de plus.
      await app!.get(CommandesService).confirmerPaiement(cmd.id, "mtn_momo");
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM billet WHERE "commandeId" = $1`,
        [cmd.id],
      );
      expect(rows[0].n).toBe(2);
      const occupes = await sql.query(
        `SELECT siege FROM siege_depart WHERE "departId" = $1 AND "billetId" IS NOT NULL AND siege IN (31, 32) ORDER BY siege`,
        [depart.id],
      );
      expect(occupes.rows.map((x) => x.siege)).toEqual([31, 32]);

      const lu = await http().get(`/voyageur/billets/${billets[0]!.id}`).set(avec(v.jeton));
      expect(lu.status, JSON.stringify(lu.body)).toBe(200);
      voyageur.SchemaBilletVoyageur.parse(lu.body);

      const annulation = await http()
        .post(`/voyageur/billets/${billets[0]!.id}/annulation`)
        .set(avec(v.jeton))
        .send({});
      expect(annulation.status, JSON.stringify(annulation.body)).toBe(200);
      const siegeRendu = await sql.query(
        `SELECT count(*)::int AS n FROM siege_depart WHERE "departId" = $1 AND siege = $2`,
        [depart.id, billets[0]!.siege],
      );
      expect(siegeRendu.rows[0].n).toBe(0);
    });

    it("ventes au guichet : un siège vendu une fois, un événement traité une fois, même en parallèle", async () => {
      const g = await compte("guichetier", { guichetId: r.guichet.id });
      const vente = (siege: number, id?: string) =>
        evenement(
          agence.EVENEMENT_BILLET_VENDU,
          g.id,
          maintenant(),
          {
            billetId: randomUUID(),
            departId: depart.id,
            siege,
            classe: "classique",
            prix: 4000,
            bagage: 0,
            passager: {
              nom: "Aminatou Fotso",
              telephone: "+237691221008",
              pieceQuatreDerniers: "4821",
            },
            paiement: especes(4000),
            codeBillet: String(1000 + (numeroPlage + 1)),
            sms: false,
          },
          { ...(id ? { id } : {}), numeroPlage: ++numeroPlage },
        );
      const poster = (corps: unknown) =>
        http()
          .post("/agence/billets")
          .set(avec(g.jeton))
          .send(corps as object);

      // Dix ventes du même siège, dix événements différents : une seule passe.
      const course = await Promise.all(Array.from({ length: 10 }, () => poster(vente(20))));
      expect(course.filter((x) => x.status === 200)).toHaveLength(1);
      expect(
        course
          .filter((x) => x.status === 409)
          .every(
            (x) =>
              x.body.code === "SIEGE_PRIS" ||
              x.body.code === "CODE_BILLET_PRIS" ||
              x.body.code === "NUMERO_EN_DOUBLE",
          ),
      ).toBe(true);
      const vivants = await sql.query(
        `SELECT count(*)::int AS n FROM billet WHERE "departId" = $1 AND siege = 20 AND etat <> 'annule'`,
        [depart.id],
      );
      expect(vivants.rows[0].n).toBe(1);

      // Le même événement cinq fois en même temps : un billet, un « accepté », quatre « déjà reçu ».
      const evt = vente(21);
      const cinq = await Promise.all(Array.from({ length: 5 }, () => poster(evt)));
      expect(cinq.every((x) => x.status === 200)).toBe(true);
      expect(cinq.map((x) => x.body.accuse.statut as string).sort()).toEqual([
        "accepte",
        "deja_recu",
        "deja_recu",
        "deja_recu",
        "deja_recu",
      ]);
      const unique = await sql.query(
        `SELECT count(*)::int AS n FROM billet WHERE "evenementId" = $1`,
        [evt["id"]],
      );
      expect(unique.rows[0].n).toBe(1);
      const traites = await sql.query(
        `SELECT count(*)::int AS n FROM evenement_traite WHERE id = $1`,
        [evt["id"]],
      );
      expect(traites.rows[0].n).toBe(1);
    });

    it("embarquement : six appareils scannent le même billet au même instant, un seul « monte »", async () => {
      const g = await compte("guichetier", { guichetId: r.guichet.id });
      const venteEvt = evenement(
        agence.EVENEMENT_BILLET_VENDU,
        g.id,
        maintenant(),
        {
          billetId: randomUUID(),
          departId: depart.id,
          siege: 25,
          classe: "classique",
          prix: 4000,
          bagage: 0,
          passager: { nom: "Aminatou Fotso", telephone: null, pieceQuatreDerniers: null },
          paiement: especes(4000),
          codeBillet: "7777",
          sms: false,
        },
        { numeroPlage: ++numeroPlage },
      );
      const vendu = await http().post("/agence/billets").set(avec(g.jeton)).send(venteEvt);
      expect(vendu.status, JSON.stringify(vendu.body)).toBe(200);
      const qr = agence.SchemaResultatVente.parse(vendu.body).billet.qr;

      const scans = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          http()
            .post("/agence/quai/scans")
            .set(avec(g.jeton))
            .send(
              evenement(
                agence.EVENEMENT_QUAI_SCANNE,
                g.id,
                maintenant(),
                { departId: depart.id, qr },
                { appareilId: `quai-${i}` },
              ),
            ),
        ),
      );
      expect(
        scans.every((x) => x.status === 200),
        JSON.stringify(scans.map((x) => x.body)),
      ).toBe(true);
      const resultats = scans.map(
        (x) => agence.SchemaResultatScanQuai.parse(x.body).scan.resultat as string,
      );
      expect(resultats.filter((x) => x === "monte")).toHaveLength(1);
      expect(resultats.filter((x) => x === "deja_scanne")).toHaveLength(5);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM scan_quai WHERE "departId" = $1 AND numero = $2 AND resultat = 'monte'`,
        [depart.id, vendu.body.billet.numero],
      );
      expect(rows[0].n).toBe(1);
      const etat = await sql.query(`SELECT etat FROM billet WHERE numero = $1`, [
        vendu.body.billet.numero,
      ]);
      expect(etat.rows[0].etat).toBe("embarque");
    });

    it("tout survit à un redémarrage de l'API : billets, sièges, version du plan, numéros en ligne", async () => {
      const avant = await sql.query(
        `SELECT (SELECT count(*)::int FROM billet WHERE "departId" = $1) AS billets,
                (SELECT count(*)::int FROM siege_depart WHERE "departId" = $1) AS sieges,
                (SELECT "versionPlan" FROM depart WHERE id = $1) AS version`,
        [depart.id],
      );
      const v = await compte("voyageur");
      await app!.close();
      app = await demarrer();
      const plan = await http().get(`/voyageur/departs/${depart.id}/sieges`).set(avec(v.jeton));
      expect(plan.status).toBe(200);
      expect(plan.body.versionPlan).toBe(avant.rows[0].version);
      const sieges = (plan.body.sieges as { etat: string }[]).filter((s) => s.etat === "pris");
      expect(sieges.length).toBeGreaterThanOrEqual(1);
      // Les numéros du serveur repartent là où ils en étaient : jamais le même deux fois.
      const c = await http()
        .post("/voyageur/commandes")
        .set(avec(v.jeton))
        .send({ departId: depart.id, sieges: [35], pour: "moi" });
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      const { billets } = await app!
        .get(CommandesService)
        .confirmerPaiement(voyageur.SchemaCommande.parse(c.body).id, "mtn_momo");
      const numeros = await sql.query(
        `SELECT numero, count(*)::int AS n FROM billet GROUP BY numero HAVING count(*) > 1`,
      );
      expect(numeros.rows).toEqual([]);
      expect(billets[0]!.sequence).toBeGreaterThanOrEqual(4001);
    });
  });
});
