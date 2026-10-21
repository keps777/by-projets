import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { HachageService } from "../socle/auth/hachage.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesPrisma } from "../socle/comptes/personnes.repository";
import { PrismaService } from "../socle/db/prisma.service";
import { SmsMock } from "../socle/sms/sms.gateway";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  AgrementsMemoire,
  CommissionsMemoire,
  NumerosVendeursMemoire,
  VendeursMemoire,
  VentesMemoire,
} from "./memoire";
import {
  AgrementsPrisma,
  CommissionsPrisma,
  ComptesVendeursPrisma,
  NumerosVendeursPrisma,
  VendeursPrisma,
  VentesPrisma,
  genererPin,
} from "./postgres";
import {
  T0,
  contratPortsVendeurs,
  unAgrement,
  unVendeur,
  uneVente,
  type BancVendeurs,
} from "./testing/contrat-ports";

/**
 * Adaptateurs PostgreSQL des vendeurs ambulants : le même contrat sur la mémoire (toujours) et sur
 * PostgreSQL (avec DATABASE_URL_TEST), puis ce que seule la base garantit, et les comptes.
 */

contratPortsVendeurs("contrat · vendeurs en mémoire", async () => {
  const vendeurs = new VendeursMemoire();
  return {
    vendeurs,
    agrements: new AgrementsMemoire(),
    numeros: new NumerosVendeursMemoire(),
    ventes: new VentesMemoire(),
    commissions: new CommissionsMemoire(),
    personne: async () => randomUUID(),
    compagnie: async () => randomUUID(),
    depart: async () => ({ departId: randomUUID(), compagnieId: randomUUID() }),
    vendeur: async (over) => {
      const v = unVendeur(randomUUID(), over);
      await vendeurs.ajouter(v);
      return v;
    },
    fermer: async () => undefined,
  };
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · vendeurs", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let chiffrement: ChiffrementService;
  let fx: FixturesPg;

  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };
  const personne = async (): Promise<string> =>
    (await fx.personne({ roles: ["voyageur"], compagnieId: null, gareId: null })).id;
  const compagnie = async (): Promise<string> => (await fx.compagnie()).id;
  const depart = async () => {
    const c = await fx.compagnie();
    const origine = await fx.gare(c.id, { ville: "Douala" });
    const destination = await fx.gare(c.id, { ville: "Yaoundé" });
    const ligne = await fx.ligne(c.id, origine.id, destination.id);
    const d = await fx.depart(ligne.id);
    return { departId: d.id, compagnieId: c.id };
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    chiffrement = new ChiffrementService(config);
    fx = new FixturesPg(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsVendeurs("contrat · vendeurs PostgreSQL", async () => {
    const vendeurs = new VendeursPrisma(prisma, chiffrement);
    return {
      vendeurs,
      agrements: new AgrementsPrisma(prisma),
      numeros: new NumerosVendeursPrisma(prisma),
      ventes: new VentesPrisma(prisma, chiffrement),
      commissions: new CommissionsPrisma(prisma, chiffrement),
      personne,
      compagnie,
      depart,
      vendeur: async (over) => {
        const v = unVendeur(await personne(), over);
        expect(await vendeurs.ajouter(v)).toBe(true);
        return v;
      },
      fermer: async () => undefined,
    } satisfies BancVendeurs;
  });

  describe("ce que la base garantit seule", () => {
    const vendeur = async (): Promise<string> => {
      const v = unVendeur(await personne());
      await new VendeursPrisma(prisma, chiffrement).ajouter(v);
      return v.id;
    };

    it("rien d'identifiant n'est en clair : vendeur, voisin, versement", async () => {
      const vendeurs = new VendeursPrisma(prisma, chiffrement);
      const ventes = new VentesPrisma(prisma, chiffrement);
      const commissions = new CommissionsPrisma(prisma, chiffrement);
      const v = unVendeur(await personne(), {
        nom: "Zacharie Fotso",
        telephone: "+237655443322",
        momo: { telephone: "+237699887766", operateur: "orange" },
      });
      await vendeurs.ajouter(v);
      const d = await depart();
      const vente = uneVente(v.id, d, {
        voisin: { nom: "Bernadette Kamga", telephone: "+237677001122" },
        etat: "terminee",
      });
      await ventes.ajouter(vente);
      await commissions.crediter({
        cle: `commission:${vente.id}`,
        vendeurId: v.id,
        compagnieId: d.compagnieId,
        montant: 1000,
        venteId: vente.id,
        at: T0,
      });
      await commissions.reserver({
        cle: `commissions:${v.id}:x`,
        vendeurId: v.id,
        montant: 1000,
        at: T0,
        operateur: "orange",
        telephone: "+237699887766",
        libelle: "Commissions",
      });
      for (const [table, colonne, secret] of [
        ["vendeur", `"nomChiffre"`, "Zacharie"],
        ["vendeur", `"telephoneChiffre"`, "655443322"],
        ["vendeur", `"momoTelephoneChiffre"`, "699887766"],
        ["vente_vendeur", `"voisinNomChiffre"`, "Bernadette"],
        ["vente_vendeur", `"voisinTelephoneChiffre"`, "677001122"],
        ["debit_commission_vendeur", `"telephoneChiffre"`, "699887766"],
      ] as const) {
        const { rows } = await sql.query(`SELECT ${colonne} AS v FROM ${table}`);
        expect(rows.length, table).toBeGreaterThan(0);
        for (const ligne of rows)
          expect(String(ligne.v), `${table}.${colonne}`).not.toContain(secret);
      }
    });

    it("les index uniques partiels : une vente en attente par vendeur, un voisin une fois par départ, par SQL direct aussi", async () => {
      const vendeurs = new VendeursPrisma(prisma, chiffrement);
      const ventes = new VentesPrisma(prisma, chiffrement);
      const v = unVendeur(await personne());
      await vendeurs.ajouter(v);
      const d = await depart();
      const vente = uneVente(v.id, d);
      await ventes.ajouter(vente);
      const insere = (departId: string, empreinte: string, etat: string, billetId = randomUUID()) =>
        erreurSql(
          `INSERT INTO vente_vendeur (id, "vendeurId", "compagnieId", "departId", "billetId",
             "voisinNomChiffre", "voisinTelephoneChiffre", "voisinIndex", empreinte,
             "origineCode", "origineVille", "destinationCode", "destinationVille", classe, "departA",
             prix, commission, moyen, etat, "creeA", "expireA", "majA")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'n', 't', 'i', $5, 'DLA', 'Douala', 'YDE',
             'Yaoundé', 'classique', now(), 4500, 100, 'mtn_momo', $6, now(), now(), now())`,
          [v.id, d.compagnieId, departId, billetId, empreinte, etat],
        );
      expect(await insere((await depart()).departId, "autre", "en_attente")).toMatch(
        /vente_vendeur_une_en_attente/,
      );
      await ventes.transitionner(vente.id, ["en_attente"], { etat: "reglee" });
      expect(await insere(d.departId, vente.empreinte, "reglee")).toMatch(
        /vente_vendeur_voisin_depart/,
      );
      expect(await insere(d.departId, "un-autre-voisin", "reglee")).toBe("");
    });

    it("les valeurs sont fermées et les montants bornés", async () => {
      const id = await vendeur();
      const c = await compagnie();
      const par = await personne();
      const agrement = (commission: number, etat = "actif", retire = "NULL") =>
        erreurSql(
          `INSERT INTO agrement_vendeur ("vendeurId", "compagnieId", "compagnieNom", etat,
             "commissionClassique", "commissionVip", "accordeLe", "accordePar", "retireLe")
           VALUES ($1, $2, 'A', $3, $4, 150, now(), $5, ${retire})`,
          [id, c, etat, commission, par],
        );
      expect(await agrement(2001)).toMatch(/agrement_vendeur_commissions/);
      expect(await agrement(100, "suspendu")).toMatch(/agrement_vendeur_etat_connu/);
      expect(await agrement(100, "retire")).toMatch(/agrement_vendeur_retrait_coherent/);
      expect(await agrement(100, "retire", "now()")).toBe("");
      expect(
        await erreurSql(`UPDATE vendeur SET "momoOperateur" = 'moov' WHERE id = $1`, [id]),
      ).toMatch(/vendeur_operateur_connu/);
    });

    it("un vendeur est un compte qui existe, et ne se supprime pas s'il a des ventes", async () => {
      expect(
        await erreurSql(
          `INSERT INTO vendeur (id, numero, "nomChiffre", "telephoneChiffre", quartier, ville,
             "momoTelephoneChiffre", "momoOperateur", actif, "creeA")
           VALUES ($1, 'V-X', 'n', 't', 'q', 'v', 'm', 'mtn', true, now())`,
          [randomUUID()],
        ),
      ).toMatch(/vendeur_personne_fkey/);
      const v = unVendeur(await personne());
      await new VendeursPrisma(prisma, chiffrement).ajouter(v);
      await new VentesPrisma(prisma, chiffrement).ajouter(uneVente(v.id, await depart()));
      expect(await erreurSql(`DELETE FROM vendeur WHERE id = $1`, [v.id])).toMatch(
        /vente_vendeur_vendeurId_fkey/,
      );
      expect(
        await erreurSql(
          `INSERT INTO credit_commission_vendeur (cle, "vendeurId", "compagnieId", "venteId", montant, at)
           VALUES ('c-' || gen_random_uuid(), $1, $2, $3, 100, now())`,
          [v.id, (await depart()).compagnieId, randomUUID()],
        ),
      ).toMatch(/credit_commission_vendeur_venteId_fkey/);
    });

    it("les commissions gagnées sont en ajout seul et les versements faits ne bougent plus", async () => {
      const vendeurs = new VendeursPrisma(prisma, chiffrement);
      const ventes = new VentesPrisma(prisma, chiffrement);
      const commissions = new CommissionsPrisma(prisma, chiffrement);
      const v = unVendeur(await personne());
      await vendeurs.ajouter(v);
      const d = await depart();
      const vente = uneVente(v.id, d, { etat: "terminee" });
      await ventes.ajouter(vente);
      const cle = `commission:${vente.id}`;
      await commissions.crediter({
        cle,
        vendeurId: v.id,
        compagnieId: d.compagnieId,
        montant: 1000,
        venteId: vente.id,
        at: T0,
      });
      expect(
        await erreurSql(`UPDATE credit_commission_vendeur SET montant = 9 WHERE cle = $1`, [cle]),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM credit_commission_vendeur WHERE cle = $1`, [cle]),
      ).not.toBe("");
      expect(await erreurSql(`TRUNCATE credit_commission_vendeur`)).not.toBe("");
      expect(
        await erreurSql(
          `INSERT INTO credit_commission_vendeur (cle, "vendeurId", "compagnieId", "venteId", montant, at)
           VALUES ('zero', $1, $2, $3, 0, now())`,
          [v.id, d.compagnieId, vente.id],
        ),
      ).toMatch(/credit_commission_vendeur_montant/);

      const retrait = `commissions:${v.id}:lundi`;
      await commissions.reserver({
        cle: retrait,
        vendeurId: v.id,
        montant: 400,
        at: T0,
        operateur: "mtn",
        telephone: "+237677112233",
        libelle: "Commissions",
      });
      await commissions.confirmer(retrait, "MM-42");
      expect(
        await erreurSql(`DELETE FROM debit_commission_vendeur WHERE cle = $1`, [retrait]),
      ).toMatch(/ne se supprime pas/);
      expect(
        await erreurSql(`UPDATE debit_commission_vendeur SET montant = 1 WHERE cle = $1`, [
          retrait,
        ]),
      ).toMatch(/ne se modifie pas/);
      expect(await commissions.solde(v.id)).toBe(600);
    });

    it("les agréments se lisent avec le bon ordre et la bonne clé", async () => {
      const id = await vendeur();
      const agrements = new AgrementsPrisma(prisma);
      const c = await compagnie();
      const par = await personne();
      await agrements.enregistrer(unAgrement(id, c, par));
      expect(
        await erreurSql(
          `INSERT INTO agrement_vendeur ("vendeurId", "compagnieId", "compagnieNom", etat,
             "commissionClassique", "commissionVip", "accordeLe", "accordePar")
           VALUES ($1, $2, 'A', 'actif', 100, 150, now(), $3)`,
          [id, c, par],
        ),
      ).toMatch(/agrement_vendeur_pkey/);
    });
  });

  describe("les comptes des vendeurs", () => {
    let sms: SmsMock;
    let comptes: ComptesVendeursPrisma;
    let service: ComptesService;

    beforeAll(() => {
      const config = configTest({ DATABASE_URL: base.url });
      sms = new SmsMock(config);
      service = new ComptesService(
        new PersonnesPrisma(prisma),
        chiffrement,
        new HachageService(config),
      );
      comptes = new ComptesVendeursPrisma(prisma, service, new HachageService(config), sms);
    });

    it("génère des PIN que le socle accepte", () => {
      for (let i = 0; i < 200; i++) expect(genererPin()).toMatch(/^\d{6}$/);
    });

    it("crée le compte au rôle vendeur avec un PIN provisoire envoyé par SMS, puis le retrouve", async () => {
      const telephone = "+237670112200";
      const premier = await comptes.ouvrir({ nom: "Paul Ekani", telephone });
      expect(premier.nouveau).toBe(true);
      const p = await prisma.personne.findUniqueOrThrow({ where: { id: premier.personneId } });
      expect(p.roles).toEqual(["vendeur"]);
      expect(p.pinHache).not.toBeNull();
      const envoye = sms.messages().filter((m) => m.telephone === telephone);
      expect(envoye).toHaveLength(1);
      const pin = /PIN provisoire est (\d{6})/.exec(envoye[0]!.message)?.[1];
      expect(pin).toBeDefined();
      expect(await new HachageService(configTest()).verifier(p.pinHache!, pin!)).toBe(true);

      const second = await comptes.ouvrir({ nom: "Autre nom", telephone });
      expect(second).toEqual({ personneId: premier.personneId, nom: "Paul Ekani", nouveau: false });
      expect(sms.messages().filter((m) => m.telephone === telephone)).toHaveLength(1);
    });

    it("cinq ouvertures simultanées du même numéro : un seul compte, un seul « nouveau »", async () => {
      const telephone = "+237670112201";
      const rep = await Promise.all(
        [1, 2, 3, 4, 5].map(() => comptes.ouvrir({ nom: "Paul Ekani", telephone })),
      );
      expect(new Set(rep.map((r) => r.personneId)).size).toBe(1);
      expect(rep.filter((r) => r.nouveau)).toHaveLength(1);
      const p = await prisma.personne.findUniqueOrThrow({ where: { id: rep[0]!.personneId } });
      expect(p.roles).toEqual(["vendeur"]);
    });

    it("donne le rôle à un voyageur qui a déjà un compte, une seule fois, avec un PIN s'il n'en a pas", async () => {
      const telephone = "+237670112202";
      const voyageur = await service.creer({ nom: "Marie Nkoa", telephone, roles: ["voyageur"] });
      expect(voyageur.pinHache).toBeNull();
      const r = await comptes.ouvrir({ nom: "Marie Nkoa", telephone });
      expect(r).toEqual({ personneId: voyageur.id, nom: "Marie Nkoa", nouveau: false });
      await comptes.ouvrir({ nom: "Marie Nkoa", telephone });
      const p = await prisma.personne.findUniqueOrThrow({ where: { id: voyageur.id } });
      expect(p.roles).toEqual(["voyageur", "vendeur"]);
      expect(p.pinHache).not.toBeNull();
      expect(sms.messages().filter((m) => m.telephone === telephone)).toHaveLength(1);
    });

    it("AfriMove ne devient jamais vendeur", async () => {
      const telephone = "+237670112203";
      await service.creer({
        nom: "Agent",
        telephone,
        roles: ["afrimove"],
        motDePasse: "Un-mot-de-passe-solide",
      });
      await expect(comptes.ouvrir({ nom: "Agent", telephone })).rejects.toThrow(
        /AfriMove ne vend jamais/,
      );
    });
  });
});
