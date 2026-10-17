import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Passagers } from "../billetterie/passagers";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { creerColisPg } from "../relais/testing/fixtures-pg";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  AnnuaireCompagniesMemoire,
  BilletsCorrespondanceMemoire,
  BilletsEmisMemoire,
  ColisInterAgencesMemoire,
  CompteursReferencesMemoire,
  ContestationsMemoire,
  ConventionsMemoire,
  DepartsMemoire,
  InvitationsMemoire,
  ReglementsMemoire,
} from "./memoire";
import type { DepartInterAgences } from "./modele";
import {
  AnnuaireCompagniesPrisma,
  BilletsCorrespondancePrisma,
  BilletsEmisPrisma,
  CONTEXTE_MOMO_COMPAGNIE,
  ColisInterAgencesPrisma,
  CompteursReferencesPrisma,
  ContestationsPrisma,
  ConventionsPrisma,
  DepartsInterAgencesPrisma,
  InvitationsPrisma,
  ReglementsPrisma,
} from "./postgres";
import {
  T0,
  contratPortsInterAgences,
  uneContestation,
  uneConvention,
  uneCreance,
  uneInvitation,
  unBilletCorrespondance,
  unPlanColis,
  unReglement,
  type BancInterAgences,
} from "./testing/contrat-ports";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL du module inter-agences : le même contrat sur la mémoire (toujours) et sur
 * PostgreSQL (avec DATABASE_URL_TEST), puis ce que seule la base garantit.
 */

contratPortsInterAgences("contrat · inter-agences en mémoire", async () => {
  const annuaire = new AnnuaireCompagniesMemoire();
  const departs = new DepartsMemoire();
  const emis = new BilletsEmisMemoire();
  return {
    conventions: new ConventionsMemoire(),
    colis: new ColisInterAgencesMemoire(),
    billets: new BilletsCorrespondanceMemoire(),
    reglements: new ReglementsMemoire(),
    contestations: new ContestationsMemoire(),
    invitations: new InvitationsMemoire(),
    compteurs: new CompteursReferencesMemoire(),
    annuaire,
    departs,
    emis,
    personne: async () => randomUUID(),
    compagnie: async () => randomUUID(),
    colisExistant: async () => randomUUID(),
    billetVendu: async () => ({
      id: randomUUID(),
      numero: `ALP-DLA-270105-${randomUUID().slice(0, 8)}`,
    }),
    poserCompagnie: async ({ nom, momo }) => {
      const id = randomUUID();
      annuaire.compagnies.set(id, { id, nom, momo });
      return id;
    },
    poserDepart: async (o) => {
      const depart: DepartInterAgences = {
        id: randomUUID(),
        compagnieId: o.compagnieId,
        origine: o.origine,
        destination: o.destination,
        heureDepart: o.heureDepart,
        arriveePrevue: versIsoDouala(Date.parse(o.heureDepart) + o.dureeMinutes * 60_000),
        bus: o.bus,
      };
      // Un départ annulé n'est simplement pas un candidat.
      if (!o.annule) departs.departs.set(depart.id, depart);
      return depart;
    },
    poserBillet: async (o) => {
      const billet = {
        id: randomUUID(),
        numero: `ALP-YDE-270105-${randomUUID().slice(0, 8)}`,
        compagnieId: o.compagnieId,
        departId: o.departId,
        voyageur: o.voyageur,
        prix: o.prix,
        annule: o.annule ?? false,
      };
      emis.billets.set(billet.id, billet);
      return billet;
    },
    fermer: async () => undefined,
  } satisfies BancInterAgences;
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · inter-agences", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let chiffrement: ChiffrementService;
  let passagers: Passagers;
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
    (await fx.personne({ roles: ["patron"], compagnieId: null, gareId: null })).id;
  const compagnie = async (): Promise<string> => (await fx.compagnie()).id;

  /** Un départ de la billetterie (gares, ligne, bus), et ce qu'il doit donner à `DepartsInterAgences`. */
  const poserDepart: BancInterAgences["poserDepart"] = async (o) => {
    const origine = await fx.gare(o.compagnieId, { ville: o.origine });
    const destination = await fx.gare(o.compagnieId, { ville: o.destination });
    const ligne = await fx.ligne(o.compagnieId, origine.id, destination.id);
    await prisma.ligne.update({ where: { id: ligne.id }, data: { dureeMinutes: o.dureeMinutes } });
    const bus = await fx.bus(o.compagnieId, o.bus);
    const d = await fx.depart(ligne.id, {
      busId: bus.id,
      heureDepart: new Date(o.heureDepart),
      etat: o.annule ? "annule" : "en_vente",
    });
    return {
      id: d.id,
      compagnieId: o.compagnieId,
      origine: o.origine,
      destination: o.destination,
      heureDepart: o.heureDepart,
      arriveePrevue: versIsoDouala(Date.parse(o.heureDepart) + o.dureeMinutes * 60_000),
      bus: o.bus,
    };
  };

  const poserBillet: BancInterAgences["poserBillet"] = async (o) => {
    const depart = await prisma.depart.findUniqueOrThrow({
      where: { id: o.departId },
      include: { ligne: true },
    });
    const b = await fx.billet(
      { compagnieId: o.compagnieId, gareId: depart.ligne.origineGareId, departId: o.departId },
      {
        prix: o.prix,
        etat: o.annule ? "annule" : "paye",
        passagerChiffre: passagers.chiffrer({ ...o.voyageur, pieceQuatreDerniers: null }),
      },
    );
    return {
      id: b.id,
      numero: b.numero,
      compagnieId: o.compagnieId,
      departId: o.departId,
      voyageur: o.voyageur,
      prix: o.prix,
      annule: o.annule ?? false,
    };
  };

  const billetVendu = async () => {
    const c = await compagnie();
    const depart = await poserDepart({
      compagnieId: c,
      origine: "Yaoundé",
      destination: "Bafoussam",
      heureDepart: "2027-01-05T11:00:00.000+01:00",
      dureeMinutes: 240,
      bus: `LT ${randomUUID().slice(0, 6)}`,
    });
    const b = await poserBillet({
      compagnieId: c,
      departId: depart.id,
      voyageur: { nom: "Voyageur", telephone: "+237677000000" },
      prix: 7000,
    });
    return { id: b.id, numero: b.numero };
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    const config = configTest({ DATABASE_URL: base.url });
    prisma = new PrismaService(config);
    chiffrement = new ChiffrementService(config);
    passagers = new Passagers(chiffrement);
    fx = new FixturesPg(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratPortsInterAgences("contrat · inter-agences PostgreSQL", async () => {
    return {
      conventions: new ConventionsPrisma(prisma),
      colis: new ColisInterAgencesPrisma(prisma),
      billets: new BilletsCorrespondancePrisma(prisma, chiffrement),
      reglements: new ReglementsPrisma(prisma),
      contestations: new ContestationsPrisma(prisma),
      invitations: new InvitationsPrisma(prisma, chiffrement),
      compteurs: new CompteursReferencesPrisma(prisma),
      annuaire: new AnnuaireCompagniesPrisma(prisma, chiffrement),
      departs: new DepartsInterAgencesPrisma(prisma),
      emis: new BilletsEmisPrisma(prisma, passagers),
      personne,
      compagnie,
      colisExistant: async () => (await creerColisPg(prisma, fx)).id,
      billetVendu,
      poserCompagnie: async ({ nom, momo }) => {
        const id = await compagnie();
        await prisma.compagnie.update({ where: { id }, data: { nom } });
        if (momo) {
          await prisma.compteMomoCompagnie.create({
            data: {
              compagnieId: id,
              telephoneChiffre: chiffrement.chiffrer(momo.telephone, CONTEXTE_MOMO_COMPAGNIE),
              operateur: momo.operateur,
            },
          });
        }
        return id;
      },
      poserDepart,
      poserBillet,
      fermer: async () => undefined,
    } satisfies BancInterAgences;
  });

  describe("ce que la base garantit seule", () => {
    const decor = async () => {
      const [a, c] = [await compagnie(), await compagnie()];
      const [pa, pc] = [await personne(), await personne()];
      const convention = uneConvention(a, c, { a: pa, b: pc });
      await new ConventionsPrisma(prisma).ajouter(convention);
      return { a, c, pa, pc, convention };
    };

    it("rien d'identifiant n'est en clair : voyageur, invitation, compte MoMo", async () => {
      const { a, c, pa, convention } = await decor();
      const vendu = await billetVendu();
      await new BilletsCorrespondancePrisma(prisma, chiffrement).ajouter(
        unBilletCorrespondance(vendu, convention, pa, {
          voyageur: { nom: "Zacharie Fotso", telephone: "+237655443322" },
        }),
      );
      await new InvitationsPrisma(prisma, chiffrement).ajouterOuExistante(
        uneInvitation(a, pa, { telephone: "+237677998811" }),
      );
      await prisma.compteMomoCompagnie.create({
        data: {
          compagnieId: c,
          telephoneChiffre: chiffrement.chiffrer("+237670123456", CONTEXTE_MOMO_COMPAGNIE),
          operateur: "mtn",
        },
      });
      for (const [table, colonne, secret] of [
        ["billet_correspondance", `"voyageurNomChiffre"`, "Zacharie"],
        ["billet_correspondance", `"voyageurTelephoneChiffre"`, "655443322"],
        ["invitation_compagnie", `"telephoneChiffre"`, "677998811"],
        ["compte_momo_compagnie", `"telephoneChiffre"`, "670123456"],
      ] as const) {
        const { rows } = await sql.query(`SELECT ${colonne} AS v FROM ${table}`);
        expect(rows.length, table).toBeGreaterThan(0);
        for (const ligne of rows) expect(String(ligne.v), table).not.toContain(secret);
      }
    });

    it("l'index unique partiel sur la paire triée : une convention ouverte par paire, par SQL direct aussi", async () => {
      const { a, c } = await decor();
      const insere = (x: string, y: string, statut: string) =>
        erreurSql(
          `INSERT INTO convention_inter_agences (id, "compagnieAId", "compagnieBId", statut, renouvellement,
             parts, voyageurs, "proposeeLe")
           VALUES (gen_random_uuid(), $1, $2, $3, 'annuel', '{}', '{}', now())`,
          [x, y, statut],
        );
      expect(await insere(a, c, "proposee")).toMatch(/convention_inter_agences_une_ouverte/);
      expect(await insere(c, a, "active")).toMatch(/convention_inter_agences_une_ouverte/);
      expect(await insere(c, a, "suspendue")).toMatch(/convention_inter_agences_une_ouverte/);
      expect(await insere(c, a, "resiliee")).toBe("");
      expect(await insere(a, a, "resiliee")).toMatch(/convention_inter_agences_deux_compagnies/);
      expect(await insere(a, await compagnie(), "gelee")).toMatch(
        /convention_inter_agences_statut_connu/,
      );
      expect(await insere(a, randomUUID(), "resiliee")).toMatch(/convention_inter_agences_b_fkey/);
    });

    it("une convention ne se supprime pas, et une signature est unique, en ajout seul", async () => {
      const { a, convention } = await decor();
      expect(
        await erreurSql(`DELETE FROM convention_inter_agences WHERE id = $1`, [convention.id]),
      ).not.toBe("");
      expect(await erreurSql(`TRUNCATE convention_inter_agences CASCADE`)).not.toBe("");
      expect(
        await erreurSql(
          `INSERT INTO signature_convention ("conventionId", "compagnieId", "personneId", "signeLe", rang)
           VALUES ($1, $2, $3, now(), 5)`,
          [convention.id, a, convention.signatures[0]!.personneId],
        ),
      ).toMatch(/signature_convention_pkey/);
      expect(
        await erreurSql(
          `UPDATE signature_convention SET "personneId" = $2 WHERE "conventionId" = $1`,
          [convention.id, await personne()],
        ),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM signature_convention WHERE "conventionId" = $1`, [
          convention.id,
        ]),
      ).not.toBe("");
    });

    it("un plan de colis et un billet en correspondance sont rattachés à un colis, un billet, une convention qui existent", async () => {
      const { convention, pa } = await decor();
      const insereColis = (colisId: string, conventionId: string) =>
        erreurSql(
          `INSERT INTO colis_inter_agences ("colisId", numero, "conventionId", "emettriceId", prix, troncons,
             "compagnieIds", transferts, "creeLe", "creePar")
           VALUES ($1, 'C-X', $2, $3, 3000, '[]', '{}', '[]', now(), $4)`,
          [colisId, conventionId, convention.compagnieA, pa],
        );
      expect(await insereColis(randomUUID(), convention.id)).toMatch(
        /colis_inter_agences_colis_fkey/,
      );
      const colis = await creerColisPg(prisma, fx);
      expect(await insereColis(colis.id, randomUUID())).toMatch(
        /colis_inter_agences_conventionId_fkey/,
      );
      expect(await insereColis(colis.id, convention.id)).toBe("");
      expect(await insereColis(colis.id, convention.id)).toMatch(/colis_inter_agences_pkey/);

      const billet = await new BilletsCorrespondancePrisma(prisma, chiffrement)
        .ajouter(unBilletCorrespondance({ id: randomUUID(), numero: "ALP-X-1" }, convention, pa))
        .catch((e: unknown) => String(e));
      expect(String(billet)).toMatch(/billet_correspondance_billet_fkey|foreign key/i);
    });

    it("un règlement a un débiteur et un créancier différents, ou un solde nul ; payé, il a sa référence", async () => {
      const { a, c, convention } = await decor();
      const insere = (o: {
        etat: string;
        debiteur: string | null;
        creancier: string | null;
        montant: number;
        reference?: string | null;
        payeLe?: boolean;
      }) =>
        erreurSql(
          `INSERT INTO reglement_inter_agences (cle, "conventionId", "paiementLe", "gelLe", lignes,
             "debiteurId", "creancierId", montant, etat, reference, "payeLe")
           VALUES ($1, $2, now(), now(), '[]', $3, $4, $5, $6, $7, ${o.payeLe ? "now()" : "NULL"})`,
          [
            `${convention.id}:${randomUUID()}`,
            convention.id,
            o.debiteur,
            o.creancier,
            o.montant,
            o.etat,
            o.reference ?? null,
          ],
        );
      const parties = { debiteur: a, creancier: c, montant: 1000 };
      expect(await insere({ ...parties, etat: "regle" })).toMatch(
        /reglement_inter_agences_etat_connu/,
      );
      expect(await insere({ ...parties, creancier: a, etat: "a_payer" })).toMatch(
        /reglement_inter_agences_parties/,
      );
      expect(await insere({ ...parties, creancier: null, etat: "a_payer" })).toMatch(
        /reglement_inter_agences_parties/,
      );
      expect(
        await insere({ debiteur: null, creancier: null, montant: 0, etat: "a_payer" }),
      ).toMatch(/reglement_inter_agences_parties/);
      expect(await insere({ ...parties, etat: "sans_solde" })).toMatch(
        /reglement_inter_agences_parties/,
      );
      expect(await insere({ ...parties, montant: -5, etat: "a_payer" })).toMatch(
        /reglement_inter_agences_montant/,
      );
      expect(await insere({ ...parties, etat: "paye" })).toMatch(
        /reglement_inter_agences_paye_complet/,
      );
      expect(await insere({ ...parties, etat: "paye", reference: "MOMO-1", payeLe: true })).toBe(
        "",
      );
      expect(
        await insere({ debiteur: null, creancier: null, montant: 0, etat: "sans_solde" }),
      ).toBe("");
    });

    it("un règlement clos ne bouge plus, aucun ne se supprime, une opération ne se règle qu'une fois", async () => {
      const { convention } = await decor();
      const reglements = new ReglementsPrisma(prisma);
      const creance = uneCreance(convention);
      const r = unReglement(convention, [creance]);
      const sans = unReglement(convention, []);
      await reglements.ajouter(r);
      await reglements.ajouter(sans);
      // À payer : l'état, la référence et l'échec changent.
      expect(
        await erreurSql(`UPDATE reglement_inter_agences SET erreur = 'x' WHERE cle = $1`, [r.cle]),
      ).toBe("");
      expect(
        await erreurSql(
          `UPDATE reglement_inter_agences SET etat = 'paye', reference = 'MOMO-1', "payeLe" = now() WHERE cle = $1`,
          [r.cle],
        ),
      ).toBe("");
      // Payé ou sans solde : clos.
      for (const cle of [r.cle, sans.cle]) {
        expect(
          await erreurSql(`UPDATE reglement_inter_agences SET erreur = 'y' WHERE cle = $1`, [cle]),
        ).toMatch(/ne se modifie pas/);
        expect(
          await erreurSql(`DELETE FROM reglement_inter_agences WHERE cle = $1`, [cle]),
        ).not.toBe("");
      }
      expect(await erreurSql(`TRUNCATE reglement_inter_agences CASCADE`)).not.toBe("");
      // L'opération réglée est écrite, une fois, en ajout seul.
      expect(
        await erreurSql(`INSERT INTO creance_reglee (cle, "reglementCle") VALUES ($1, $2)`, [
          creance.cle,
          sans.cle,
        ]),
      ).toMatch(/creance_reglee_pkey/);
      expect(await erreurSql(`DELETE FROM creance_reglee WHERE cle = $1`, [creance.cle])).not.toBe(
        "",
      );
      expect(
        await erreurSql(`UPDATE creance_reglee SET "reglementCle" = $2 WHERE cle = $1`, [
          creance.cle,
          sans.cle,
        ]),
      ).not.toBe("");
      expect(await erreurSql(`TRUNCATE creance_reglee`)).not.toBe("");
    });

    it("une contestation est recevable ou irrecevable, résolue ou ouverte, et close elle ne bouge plus", async () => {
      const { a, pa, convention } = await decor();
      const contestations = new ContestationsPrisma(prisma);
      const k = uneContestation(a, pa, [convention.id], ["colis:1:1"]);
      await contestations.ajouter(k);
      const insere = (over: { statut: string; recevable: boolean; resolue?: boolean }) =>
        erreurSql(
          `INSERT INTO contestation_reglement (reference, "conventionIds", "compagnieId", "personneId", motif,
             cles, "deposeeLe", recevable, statut, "resolueLe", "resoluePar")
           VALUES ($1, '{}', $2, $3, 'm', '{}', now(), $4, $5, ${over.resolue ? "now()" : "NULL"}, ${over.resolue ? "$3" : "NULL"})`,
          [`CTX-${randomUUID()}`, a, pa, over.recevable, over.statut],
        );
      expect(await insere({ statut: "irrecevable", recevable: true })).toMatch(
        /recevable_coherent/,
      );
      expect(await insere({ statut: "ouverte", recevable: false })).toMatch(/recevable_coherent/);
      expect(await insere({ statut: "accordee", recevable: true })).toMatch(/resolution_coherente/);
      expect(await insere({ statut: "ouverte", recevable: true, resolue: true })).toMatch(
        /resolution_coherente/,
      );
      expect(await insere({ statut: "soldee", recevable: true })).toMatch(/statut_connu/);
      expect(await insere({ statut: "rejetee", recevable: true, resolue: true })).toBe("");
      // Close, elle ne bouge plus ; ouverte, elle reçoit sa décision. Aucune ne se supprime.
      await contestations.remplacer(
        { ...k, statut: "rejetee", resolueLe: T0, resoluePar: pa },
        "ouverte",
      );
      expect(
        await erreurSql(
          `UPDATE contestation_reglement SET statut = 'accordee' WHERE reference = $1`,
          [k.reference],
        ),
      ).toMatch(/ne se modifie pas/);
      expect(
        await erreurSql(`DELETE FROM contestation_reglement WHERE reference = $1`, [k.reference]),
      ).not.toBe("");
      expect(await erreurSql(`TRUNCATE contestation_reglement`)).not.toBe("");
    });

    it("les invitations sont en ajout seul, et le compte MoMo d'une compagnie a un opérateur connu", async () => {
      const { a, pa } = await decor();
      const inv = uneInvitation(a, pa);
      await new InvitationsPrisma(prisma, chiffrement).ajouterOuExistante(inv);
      expect(
        await erreurSql(
          `UPDATE invitation_compagnie SET "nomCompagnie" = 'x' WHERE reference = $1`,
          [inv.reference],
        ),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM invitation_compagnie WHERE reference = $1`, [inv.reference]),
      ).not.toBe("");
      expect(
        await erreurSql(
          `INSERT INTO invitation_compagnie (reference, cle, "compagnieId", "personneId", "nomCompagnie", "telephoneChiffre", "envoyeeLe")
           VALUES ('INV-2', $1, $2, $3, 'x', 't', now())`,
          [inv.cle, a, pa],
        ),
      ).toMatch(/invitation_compagnie_cle_key/);
      expect(
        await erreurSql(
          `INSERT INTO compte_momo_compagnie ("compagnieId", "telephoneChiffre", operateur) VALUES ($1, 't', 'moov')`,
          [a],
        ),
      ).toMatch(/compte_momo_compagnie_operateur_connu/);
    });

    it("les échanges d'une compagnie se retrouvent par l'index sur les tronçons, après une nouvelle connexion", async () => {
      const { c, pa, convention } = await decor();
      const colisId = (await creerColisPg(prisma, fx)).id;
      const plan = unPlanColis(colisId, convention, pa);
      await new ColisInterAgencesPrisma(prisma).ajouter(plan);
      const autre = new PrismaService(configTest({ DATABASE_URL: base.url }));
      try {
        expect(await new ColisInterAgencesPrisma(autre).lister({ compagnieId: c })).toEqual([plan]);
      } finally {
        await autre.$disconnect();
      }
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM colis_inter_agences WHERE "compagnieIds" @> ARRAY[$1]::uuid[]`,
        [c],
      );
      expect(rows[0].n).toBe(1);
    });
  });
});
