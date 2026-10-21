import { randomUUID } from "node:crypto";
import { voyageur } from "@afrimove/contrats";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPTIONS_BILLETTERIE } from "../billetterie/passerelle";
import { CONFIG_SMS, chargerConfigSms } from "../sms/config";
import { AppModule } from "../socle/app.module";
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
import type { RequeteNotification } from "./agregateur";
import {
  ComptesReversementMemoire,
  LiensPaiementMemoire,
  NotificationsTraiteesMemoire,
  PaiementsMemoire,
  ReglagesPaiementsMemoire,
  RemboursementsMemoire,
} from "./memoire";
import {
  ComptesReversementPrisma,
  LiensPaiementPrisma,
  NotificationsTraiteesPrisma,
  PaiementsPrisma,
  ReglagesPaiementsPrisma,
  RemboursementsPrisma,
} from "./postgres";
import {
  ComptesReversement,
  LiensPaiement,
  NotificationsTraitees,
  Paiements,
  ReglagesPaiements,
  Remboursements,
} from "./ports";
import {
  COMPAGNIE,
  DEPART,
  avec,
  creerAppPaiementsTest,
  type AppPaiementsTest,
} from "./testing/app-paiements-test";
import {
  contratStockagePaiements,
  empreinte,
  unLien,
  unPaiement,
  unRemboursement,
} from "./testing/contrat-stockage";

/**
 * Stockage des paiements : les mêmes tests de contrat sur la mémoire (toujours) et sur PostgreSQL
 * (quand DATABASE_URL_TEST est définie), requêtes simultanées comprises, puis ce que seule la base
 * garantit (index uniques partiels, valeurs fermées) et un vrai parcours de paiement (commande,
 * webhook signé, billets, remboursements) sur les adaptateurs PostgreSQL.
 */

contratStockagePaiements("mémoire", async () => ({
  paiements: new PaiementsMemoire(),
  remboursements: new RemboursementsMemoire(),
  notifications: new NotificationsTraiteesMemoire(),
  liens: new LiensPaiementMemoire(),
  comptes: new ComptesReversementMemoire(),
  reglages: new ReglagesPaiementsMemoire(),
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · paiements", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;

  const banc = async () => ({
    paiements: new PaiementsPrisma(prisma),
    remboursements: new RemboursementsPrisma(prisma),
    notifications: new NotificationsTraiteesPrisma(prisma),
    liens: new LiensPaiementPrisma(prisma),
    comptes: new ComptesReversementPrisma(prisma),
    reglages: new ReglagesPaiementsPrisma(prisma),
  });

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Avant le contrat : la table n'a encore aucune ligne.
  it("sans réglage enregistré, le mode dégradé se lit « jamais réglé »", async () => {
    expect(await new ReglagesPaiementsPrisma(prisma).lire()).toBeNull();
  });

  contratStockagePaiements("PostgreSQL", banc);

  describe("ce que la base garantit seule", () => {
    const inserer = (surcharge: Record<string, unknown> = {}) => {
      const v = {
        id: randomUUID(),
        cle: null,
        origine: "voyageur",
        commandeId: randomUUID(),
        moyen: "mtn_momo",
        operateur: "mtn",
        montant: 4250,
        statut: "en_attente",
        confirmation: "a_faire",
        fournisseur: null,
        idFournisseur: null,
        deviseCode: null,
        deviseMontantMineur: null,
        expireA: new Date(Date.now() + 180_000),
        ...surcharge,
      };
      return sql.query(
        `INSERT INTO paiement (id, cle, origine, "commandeId", "compagnieId", moyen, operateur, montant,
           "deviseCode", "deviseMontantMineur", repartition, statut, confirmation, fournisseur,
           "idFournisseur", "creeA", "expireA")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '[]', $11, $12, $13, $14, now(), $15)`,
        [
          v.id,
          v.cle,
          v.origine,
          v.commandeId,
          randomUUID(),
          v.moyen,
          v.operateur,
          v.montant,
          v.deviseCode,
          v.deviseMontantMineur,
          v.statut,
          v.confirmation,
          v.fournisseur,
          v.idFournisseur,
          v.expireA,
        ],
      );
    };

    it("un seul paiement en attente par commande, même écrit à la main", async () => {
      const commandeId = randomUUID();
      await inserer({ commandeId });
      await expect(inserer({ commandeId })).rejects.toThrow(/paiement_un_en_cours/);
      // Un paiement échoué ne gêne pas.
      await inserer({ commandeId, statut: "echoue" });
      await inserer({ commandeId, statut: "echoue" });
    });

    it("un seul paiement « billets faits » par commande", async () => {
      const commandeId = randomUUID();
      await inserer({ commandeId, statut: "reussi", confirmation: "faite" });
      await expect(
        inserer({ commandeId, statut: "reussi", confirmation: "faite" }),
      ).rejects.toThrow(/paiement_une_confirmee/);
      await inserer({ commandeId, statut: "reussi", confirmation: "doublon" });
    });

    it("une clé d'idempotence et un identifiant de transaction n'appartiennent qu'à un paiement", async () => {
      const cle = `guichet:${randomUUID()}`;
      await inserer({ cle, commandeId: null });
      await expect(inserer({ cle, commandeId: null })).rejects.toThrow(/paiement_cle_key/);
      const idFournisseur = `ext-${randomUUID()}`;
      await inserer({ fournisseur: "a", idFournisseur });
      await expect(inserer({ fournisseur: "a", idFournisseur })).rejects.toThrow(
        /paiement_fournisseur_identifiant/,
      );
      await inserer({ fournisseur: "b", idFournisseur });
    });

    it("refuse un moyen, une origine, un statut ou une confirmation inconnus et un montant nul", async () => {
      await expect(inserer({ moyen: "cheque" })).rejects.toThrow(/paiement_moyen_connu/);
      await expect(inserer({ origine: "robot" })).rejects.toThrow(/paiement_origine_connue/);
      await expect(inserer({ operateur: "moov" })).rejects.toThrow(/paiement_operateur_connu/);
      await expect(inserer({ statut: "perdu" })).rejects.toThrow(/paiement_statut_connu/);
      await expect(inserer({ confirmation: "peut-etre" })).rejects.toThrow(
        /paiement_confirmation_connue/,
      );
      await expect(inserer({ montant: 0 })).rejects.toThrow(/paiement_montant_positif/);
      await expect(inserer({ deviseCode: "CAD" })).rejects.toThrow(/paiement_devise_complete/);
      await expect(inserer({ expireA: new Date(Date.now() - 3_600_000) })).rejects.toThrow(
        /paiement_echeance/,
      );
    });

    it("un remboursement appartient à un paiement qui existe ; sa cause et son montant sont contrôlés", async () => {
      const remboursements = new RemboursementsPrisma(prisma);
      await expect(
        remboursements.ajouter(unRemboursement(randomUUID()), { compagnie: 9999, afrimove: 9999 }),
      ).rejects.toThrow();
      const p = unPaiement({ statut: "reussi" });
      await new PaiementsPrisma(prisma).ouvrir(p);
      const direct = (cause: string, montant: number) =>
        sql.query(
          `INSERT INTO paiement_remboursement (id, "paiementId", cle, cause, lignes, montant, statut, "creeA")
           VALUES ($1, $2, $3, $4, '[]', $5, 'demande', now())`,
          [randomUUID(), p.id, randomUUID(), cause, montant],
        );
      await expect(direct("caprice", 10)).rejects.toThrow(/paiement_remboursement_cause_connue/);
      await expect(direct("billet_annule", 0)).rejects.toThrow(
        /paiement_remboursement_montant_positif/,
      );
      await direct("billet_annule", 10);
    });

    it("un seul lien vivant par commande et une empreinte SHA-256 de 64 caractères", async () => {
      const commandeId = randomUUID();
      const insertion = (emp: string, revoque: Date | null) =>
        sql.query(
          `INSERT INTO paiement_lien (id, "commandeId", empreinte, "creePar", "creeA", "expireA", "revoqueA")
           VALUES ($1, $2, $3, $4, now(), now() + interval '15 minutes', $5)`,
          [randomUUID(), commandeId, emp, randomUUID(), revoque],
        );
      await insertion(empreinte(), null);
      await expect(insertion(empreinte(), null)).rejects.toThrow(/paiement_lien_un_actif/);
      await insertion(empreinte(), new Date());
      await expect(insertion("jeton-en-clair", new Date())).rejects.toThrow(
        /paiement_lien_empreinte_sha256/,
      );
      // Le lien ne garde que l'empreinte : aucune colonne pour le jeton.
      const { rows } = await sql.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'paiement_lien'`,
      );
      expect(rows.map((r: { column_name: string }) => r.column_name)).not.toContain("jeton");
    });

    it("le réglage du mode dégradé n'a qu'une ligne", async () => {
      await expect(
        sql.query(`INSERT INTO reglage_paiements (id, degrade) VALUES (2, true)`),
      ).rejects.toThrow(/reglage_paiements_une_ligne/);
    });

    it("le numéro de téléphone n'est jamais en clair : seules les colonnes chiffrée et masquée existent", async () => {
      const { rows } = await sql.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'paiement'`,
      );
      const colonnes = rows.map((r: { column_name: string }) => r.column_name.toLowerCase());
      expect(colonnes).toContain("telephonechiffre");
      expect(colonnes).not.toContain("telephone");
      expect(colonnes).not.toContain("jetoncarte");
      expect(colonnes).not.toContain("numerocarte");
    });
  });

  describe("un vrai parcours de paiement sur PostgreSQL", () => {
    let t: AppPaiementsTest;
    let v1: { id: string; jeton: string };
    let afrimove: { id: string; jeton: string };
    let prochainSiege = 10;

    const webhook = (n: Pick<RequeteNotification, "entetes" | "corpsBrut">) =>
      t
        .http()
        .post("/paiements/webhooks/simule")
        .set(n.entetes as Record<string, string>)
        .send(n.corpsBrut ?? "");
    const post = (chemin: string, corps: object = {}, jeton = v1.jeton) =>
      t.http().post(chemin).set(avec(jeton)).send(corps);

    async function commander() {
      const r = await post("/voyageur/commandes", {
        departId: DEPART,
        sieges: [prochainSiege++],
        pour: "moi",
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return voyageur.SchemaCommande.parse(r.body);
    }
    async function payer(commandeId: string) {
      const r = await post(`/voyageur/commandes/${commandeId}/paiements`, { moyen: "mtn_momo" });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return voyageur.SchemaPaiement.parse(r.body);
    }
    const ligne = async (id: string) =>
      (await sql.query(`SELECT * FROM paiement WHERE id = $1`, [id])).rows[0];

    beforeAll(async () => {
      t = await creerAppPaiementsTest({
        prisma: new PrismaService(configTest({ DATABASE_URL: base.url })),
      });
      v1 = await t.compte("voyageur", { nom: "Mireille Kamga" });
      afrimove = await t.compte("afrimove");
    }, 120_000);

    afterAll(async () => t?.fermer());

    it("les six ports de stockage sont ceux de PostgreSQL", () => {
      expect(t.app.get(Paiements)).toBeInstanceOf(PaiementsPrisma);
      expect(t.app.get(Remboursements)).toBeInstanceOf(RemboursementsPrisma);
      expect(t.app.get(NotificationsTraitees)).toBeInstanceOf(NotificationsTraiteesPrisma);
      expect(t.app.get(LiensPaiement)).toBeInstanceOf(LiensPaiementPrisma);
      expect(t.app.get(ComptesReversement)).toBeInstanceOf(ComptesReversementPrisma);
      expect(t.app.get(ReglagesPaiements)).toBeInstanceOf(ReglagesPaiementsPrisma);
    });

    it("la commande, le paiement et le compte de reversement sont en base ; le numéro n'y est jamais en clair", async () => {
      const commande = await commander();
      const p = await payer(commande.id);
      const l = await ligne(p.id);
      expect(l).toMatchObject({
        commandeId: commande.id,
        compagnieId: COMPAGNIE,
        moyen: "mtn_momo",
        statut: "en_attente",
        confirmation: "a_faire",
        montant: 4250,
      });
      expect(l.repartition).toEqual([
        { beneficiaire: "compagnie", compteId: "compte-alpha", montant: 4000 },
        { beneficiaire: "afrimove", compteId: expect.any(String), montant: 250 },
      ]);
      const compte = await sql.query(`SELECT * FROM compte_reversement WHERE "compagnieId" = $1`, [
        COMPAGNIE,
      ]);
      expect(compte.rows[0].compteId).toBe("compte-alpha");
    });

    it("le webhook signé reçoit l'argent et émet les billets ; le même webhook rejoué ne change rien", async () => {
      const commande = await commander();
      const p = await payer(commande.id);
      const evt = t.agregateur.notificationDeReussite(p.id, { evenementId: `evt-${randomUUID()}` });
      const un = await webhook(evt);
      expect(un.status, JSON.stringify(un.body)).toBe(200);
      expect(un.body).toMatchObject({ appliques: 1 });
      const rejeu = await webhook(evt);
      expect(rejeu.body).toMatchObject({ appliques: 0, ignores: 1 });

      const l = await ligne(p.id);
      expect(l).toMatchObject({ statut: "reussi", confirmation: "faite" });
      expect(l.billetIds).toHaveLength(1);
      expect(l.billetIds).toEqual((await t.commandes.trouver(commande.id))!.billetIds);
    });

    it("six webhooks du même paiement sous six identifiants d'événement, envoyés ensemble : un seul jeu de billets", async () => {
      const commande = await commander();
      const p = await payer(commande.id);
      const reponses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          webhook(
            t.agregateur.notificationDeReussite(p.id, { evenementId: `evt-${i}-${randomUUID()}` }),
          ),
        ),
      );
      expect(reponses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(reponses.reduce((n, r) => n + (r.body as { appliques: number }).appliques, 0)).toBe(1);
      const l = await ligne(p.id);
      expect(l.confirmation).toBe("faite");
      expect(l.billetIds).toHaveLength(1);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM paiement WHERE "commandeId" = $1 AND confirmation = 'faite'`,
        [commande.id],
      );
      expect(rows[0].n).toBe(1);
    });

    it("deux demandes identiques et simultanées pour la même commande : un seul paiement, rendu aux deux", async () => {
      const commande = await commander();
      const [a, b] = await Promise.all([
        post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "mtn_momo" }),
        post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "mtn_momo" }),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM paiement WHERE "commandeId" = $1`,
        [commande.id],
      );
      expect(rows[0].n).toBe(1);
    });

    it("deux moyens différents demandés ensemble pour la même commande : un seul paiement, l'autre reçoit PAIEMENT_EN_COURS", async () => {
      const commande = await commander();
      const [a, b] = await Promise.all([
        post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "mtn_momo" }),
        post(`/voyageur/commandes/${commande.id}/paiements`, { moyen: "orange_money" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect([a.body.code, b.body.code]).toContain("PAIEMENT_EN_COURS");
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM paiement WHERE "commandeId" = $1`,
        [commande.id],
      );
      expect(rows[0].n).toBe(1);
    });

    it("des remboursements manuels simultanés ne dépassent jamais ce que la compagnie a encaissé", async () => {
      const commande = await commander();
      const p = await payer(commande.id);
      await webhook(t.agregateur.notificationDeReussite(p.id));
      const reponses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          post(
            `/paiements/${p.id}/remboursements`,
            {
              montantCompagnie: 1500,
              montantAfrimove: 0,
              motif: "Geste",
              cle: `geste-${i}-${p.id}`,
            },
            afrimove.jeton,
          ),
        ),
      );
      const codes = reponses.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(2);
      expect(codes.filter((c) => c === 409)).toHaveLength(4);
      const { rows } = await sql.query(
        `SELECT coalesce(sum(montant), 0)::int AS total FROM paiement_remboursement
          WHERE "paiementId" = $1 AND statut <> 'echoue'`,
        [p.id],
      );
      expect(rows[0].total).toBe(3000);
    });

    it("le mode dégradé réglé par AfriMove survit à un redémarrage", async () => {
      const r = await t
        .http()
        .put("/paiements/mode-degrade")
        .set(avec(afrimove.jeton))
        .send({ actif: true, motif: "Test de redémarrage" });
      expect(r.status).toBe(200);
      const avant = (await sql.query(`SELECT * FROM reglage_paiements`)).rows;
      expect(avant).toHaveLength(1);
      expect(avant[0]).toMatchObject({ id: 1, degrade: true, motif: "Test de redémarrage" });

      await t.fermer();
      t = await creerAppPaiementsTest({
        prisma: new PrismaService(configTest({ DATABASE_URL: base.url })),
      });
      afrimove = await t.compte("afrimove");
      const mode = await t.http().get("/paiements/mode").set(avec(afrimove.jeton));
      expect(mode.body).toMatchObject({ degrade: true });
      await t
        .http()
        .put("/paiements/mode-degrade")
        .set(avec(afrimove.jeton))
        .send({ actif: false });
    });
  });

  describe("le choix du stockage par API_STOCKAGE", () => {
    let stockageAvant: string | undefined;
    let app: NestExpressApplication | null = null;

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      const config = configTest({ DATABASE_URL: base.url });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CONFIG)
        .useValue(config)
        .overrideProvider(CONFIG_SMS)
        .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
        .overrideProvider(OPTIONS_BILLETTERIE)
        .useValue({ balayageMs: 0, pingMs: 0 })
        .compile();
      app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
      configurerApp(app, config);
      await app.init();
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("avec API_STOCKAGE=postgres, le module des paiements utilise les six adaptateurs PostgreSQL", () => {
      expect(app!.get(Paiements)).toBeInstanceOf(PaiementsPrisma);
      expect(app!.get(Remboursements)).toBeInstanceOf(RemboursementsPrisma);
      expect(app!.get(NotificationsTraitees)).toBeInstanceOf(NotificationsTraiteesPrisma);
      expect(app!.get(LiensPaiement)).toBeInstanceOf(LiensPaiementPrisma);
      expect(app!.get(ComptesReversement)).toBeInstanceOf(ComptesReversementPrisma);
      expect(app!.get(ReglagesPaiements)).toBeInstanceOf(ReglagesPaiementsPrisma);
    });

    it("un lien de paiement d'un proche se remplace en base", async () => {
      const liens = app!.get(LiensPaiement);
      const commandeId = randomUUID();
      const a = unLien(commandeId);
      const b = unLien(commandeId);
      await liens.remplacer(a);
      await liens.remplacer(b);
      expect((await liens.parEmpreinte(a.empreinte))?.revoqueA).not.toBeNull();
      expect((await liens.parEmpreinte(b.empreinte))?.revoqueA).toBeNull();
    });
  });
});
