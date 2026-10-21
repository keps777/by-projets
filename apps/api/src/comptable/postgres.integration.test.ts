import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerSessionPg } from "../analyses/testing/session-pg";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  ActionsMemoire,
  ClotureMemoire,
  DecisionsMemoire,
  EnvoisMemoire,
  FacturesPayeesMemoire,
  FichiersApercusMemoire,
  ParametresMemoire,
  RelevesMemoire,
} from "./memoire";
import { ActionRefusee } from "./ports";
import {
  ActionsRapprochementPrisma,
  AnnulationsPrisma,
  CloturesPrisma,
  DecisionsPrisma,
  EnvoisPrisma,
  FacturesPayeesPrisma,
  FaitsPrisma,
  FichiersApercusPrisma,
  ParametresPrisma,
  RelevesPrisma,
  SessionsPrisma,
  VentesPrisma,
  initiales,
  moyenDe,
} from "./postgres";
import {
  contratPortsComptable,
  iso,
  uneCloture,
  uneDecision,
  uneLigneReleve,
  type BancComptable,
} from "./testing/contrat-ports";

/**
 * Adaptateurs PostgreSQL du comptable : les mêmes tests de contrat sur la mémoire (toujours) et sur
 * PostgreSQL (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (mois clos
 * définitif, décisions définitives, course entre une décision et la clôture de son mois, données
 * personnelles chiffrées), et la lecture des ventes, des caisses, des annulations et des faits du
 * rapprochement sur de vraies lignes.
 */

function bancMemoire(): BancComptable {
  const clotures = new ClotureMemoire();
  const releves = new RelevesMemoire();
  const factures = new FacturesPayeesMemoire();
  const parametres = new ParametresMemoire();
  return {
    parametres,
    clotures,
    decisions: new DecisionsMemoire(clotures),
    apercus: new FichiersApercusMemoire(),
    envois: new EnvoisMemoire(),
    releves,
    factures,
    definirParametres: async (p) => parametres.definir(p),
    importerReleves: async (compagnieId, lignes) => releves.ajouter(compagnieId, ...lignes),
    payerFacture: async (compagnieId, dimanche, jour) =>
      factures.payer(compagnieId, dimanche, jour),
    nouvelleCompagnie: async () => randomUUID(),
    fermer: async () => undefined,
  };
}

contratPortsComptable("contrat · adaptateurs en mémoire", async () => bancMemoire());

describe("fonctions pures de l'adaptateur", () => {
  it("initiales : deux premières lettres des deux premiers mots", () => {
    expect(initiales("Joseph Mbarga")).toBe("JM");
    expect(initiales("  marie   ngo bayiha ")).toBe("MN");
    expect(initiales("Paul")).toBe("P");
    expect(initiales("")).toBeNull();
    expect(initiales(null)).toBeNull();
  });

  it("moyenDe : ramène les modes des billets, commandes et colis à quatre moyens", () => {
    expect(moyenDe("cash")).toBe("cash");
    expect(moyenDe("momo")).toBe("mtn");
    expect(moyenDe("mtn_momo")).toBe("mtn");
    expect(moyenDe("orange_money")).toBe("orange");
    expect(moyenDe("carte")).toBe("carte");
    expect(moyenDe(null)).toBe("mtn");
    expect(moyenDe("inconnu", "cash")).toBe("cash");
  });
});

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · comptable", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
  let chiffrement: ChiffrementService;
  let fx: FixturesPg;
  let banc: BancComptable;
  let clotures: CloturesPrisma;
  let decisions: DecisionsPrisma;
  let releves: RelevesPrisma;
  let parametres: ParametresPrisma;
  let envois: EnvoisPrisma;

  const erreurSql = async (texte: string, valeurs: unknown[] = [], client: Client = sql) => {
    try {
      await client.query(texte, valeurs);
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
    parametres = new ParametresPrisma(prisma, chiffrement);
    clotures = new CloturesPrisma(prisma, chiffrement);
    decisions = new DecisionsPrisma(prisma);
    releves = new RelevesPrisma(prisma, chiffrement);
    envois = new EnvoisPrisma(prisma, chiffrement);
    const factures = new FacturesPayeesPrisma(prisma);
    banc = {
      parametres,
      clotures,
      decisions,
      apercus: new FichiersApercusPrisma(prisma),
      envois,
      releves,
      factures,
      definirParametres: (p) => parametres.definir(p),
      importerReleves: async (compagnieId, lignes) => {
        await releves.importer(compagnieId, lignes);
      },
      payerFacture: (compagnieId, dimanche, jour) =>
        factures.enregistrer(compagnieId, dimanche, jour),
      nouvelleCompagnie: async () => (await fx.compagnie()).id,
      fermer: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  // Les tests de contrat s'exécutent ici, sur la base préparée plus haut.
  contratPortsComptable("contrat · adaptateurs PostgreSQL", async () => banc);

  describe("ce que la base garantit seule", () => {
    it("un mois clos ne se rouvre pas : ni modification, ni suppression, ni vidage, même à la main", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      await clotures.verrouiller(uneCloture(compagnieId, "2026-12"));
      expect(
        await erreurSql(`UPDATE cloture_mois SET "parNom" = 'Faussaire' WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).toMatch(/Mois clôturé/);
      expect(
        await erreurSql(
          `UPDATE cloture_mois SET encaisse = '{"total": 1}'::jsonb WHERE "compagnieId" = $1`,
          [compagnieId],
        ),
      ).toMatch(/Mois clôturé/);
      expect(
        await erreurSql(`DELETE FROM cloture_mois WHERE "compagnieId" = $1`, [compagnieId]),
      ).toMatch(/Mois clôturé/);
      expect(await erreurSql(`TRUNCATE cloture_mois CASCADE`)).not.toBe("");
      const lue = await clotures.trouver(compagnieId, "2026-12");
      expect(lue?.parNom).toBe("Marie Ngo Bayiha");
    });

    it("seul l'accusé de réception du cabinet s'écrit sur une clôture, et une seule fois", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      await clotures.verrouiller(uneCloture(compagnieId, "2026-12", { envoiDemande: true }));
      // Accusé + autre champ : refusé.
      expect(
        await erreurSql(
          `UPDATE cloture_mois SET "envoiRecuA" = now(), "parNom" = 'x' WHERE "compagnieId" = $1`,
          [compagnieId],
        ),
      ).toMatch(/Mois clôturé/);
      expect(
        await erreurSql(`UPDATE cloture_mois SET "envoiRecuA" = now() WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).toBe("");
      // Réécrire l'accusé : refusé (il n'est plus nul).
      expect(
        await erreurSql(`UPDATE cloture_mois SET "envoiRecuA" = now() WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).toMatch(/Mois clôturé/);
    });

    it("les cinq fichiers d'une clôture sont figés : ni modifiés, ni supprimés ; un fichier ne vit pas sans clôture", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      await clotures.verrouiller(uneCloture(compagnieId, "2026-12"));
      expect(
        await erreurSql(`UPDATE export_fichier SET contenu = '\\x00' WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM export_fichier WHERE "compagnieId" = $1`, [compagnieId]),
      ).not.toBe("");
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM export_fichier WHERE "compagnieId" = $1`,
        [compagnieId],
      );
      expect(rows[0].n).toBe(5);
      // Un fichier pour un mois jamais clôturé : clé étrangère.
      const f = uneCloture(compagnieId, "2026-11").fichiers[0]!;
      expect(
        await erreurSql(
          `INSERT INTO export_fichier ("compagnieId", mois, "exportId", format, nom, "nomFichier", "typeMime",
             contenu, "tableauGz", empreinte, "genereA", colonnes)
           VALUES ($1, '2026-11', 'journal_ventes', 'XLSX', 'n', 'f', 't', '\\x00', '\\x00', $2, now(), 1)`,
          [compagnieId, f.empreinte],
        ),
      ).toMatch(/export_fichier_compagnieId_mois_fkey/);
    });

    it("la clôture et ses fichiers sont tout ou rien : un fichier invalide annule la clôture", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const c = uneCloture(compagnieId, "2026-12");
      c.fichiers[2] = { ...c.fichiers[2]!, empreinte: "pas-une-empreinte" };
      await expect(clotures.verrouiller(c)).rejects.toThrow();
      expect(await clotures.existe(compagnieId, "2026-12")).toBe(false);
      // Le mois reste clôturable ensuite.
      expect(await clotures.verrouiller(uneCloture(compagnieId, "2026-12"))).toBe(true);
    });

    it("formats refusés par la base : mois mal écrit, export inconnu, format inconnu", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const c = uneCloture(compagnieId, "2026-12");
      const nouvelle = (mois: string) =>
        erreurSql(
          `INSERT INTO cloture_mois ("compagnieId", mois, "clotureA", "parId", "parNom", "journalId",
             encaisse, rapprochement, lignes, exports)
           VALUES ($1, $2, now(), $3, 'x', $4, '{}', '{}', '[]', '[]')`,
          [compagnieId, mois, c.parId, c.journalId],
        );
      expect(await nouvelle("2026-13")).toMatch(/cloture_mois_forme/);
      expect(await nouvelle("décembre")).toMatch(/cloture_mois_forme/);
      await clotures.verrouiller(c);
      const fichier = (exportId: string, format: string) =>
        erreurSql(
          `INSERT INTO export_fichier ("compagnieId", mois, "exportId", format, nom, "nomFichier", "typeMime",
             contenu, "tableauGz", empreinte, "genereA", colonnes)
           VALUES ($1, '2026-12', $2, $3, 'n', 'f', 't', '\\x00', '\\x00', $4, now(), 1)`,
          [compagnieId, exportId, format, "a".repeat(64)],
        );
      expect(await fichier("journal_secret", "XLSX")).not.toBe("");
      expect(await fichier("journal_ventes", "DOCX")).not.toBe("");
    });

    it("une décision n'entre pas dans un mois clos : refusée par la base même écrite à la main", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      await clotures.verrouiller(uneCloture(compagnieId, "2026-12"));
      const d = uneDecision(compagnieId, "2026-12");
      expect(
        await erreurSql(
          `INSERT INTO decision_rapprochement ("compagnieId", mois, reference, action, montant, operateur,
             "telephoneMasque", cause, explication, "decideA", "parId", "parNom", "journalId", methode, execution)
           VALUES ($1, '2026-12', $2, 'rembourser', 5000, 'mtn', 'x', 'inconnue', 'x', now(), $3, 'x', $4, 'pin', 'en_attente')`,
          [compagnieId, d.reference, d.parId, d.journalId],
        ),
      ).toMatch(/MOIS_VERROUILLE/);
    });

    it("une décision est définitive : seul « en attente » vers « faite » est permis, et « rattacher » exige une cible", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const d = uneDecision(compagnieId, "2026-12");
      await decisions.enregistrer(d);
      const modifier = (colonne: string, valeur: string) =>
        erreurSql(
          `UPDATE decision_rapprochement SET ${colonne} = ${valeur} WHERE "compagnieId" = $1 AND reference = $2`,
          [compagnieId, d.reference],
        );
      expect(await modifier("montant", "1")).toMatch(/définitive/);
      expect(await modifier("action", "'demander'")).toMatch(/définitive/);
      expect(await modifier('"parNom"', "'Autre'")).toMatch(/définitive/);
      // Passer à « faite » sans référence d'opération : refusé par le CHECK.
      expect(await modifier("execution", "'faite'")).toMatch(/execution_reference/);
      await decisions.confirmer(compagnieId, "2026-12", d.reference, "OP-1");
      // Une fois faite : plus rien ne change, plus rien ne se supprime.
      expect(await modifier('"referenceExecution"', "'OP-2'")).toMatch(/définitive/);
      expect(
        await erreurSql(
          `DELETE FROM decision_rapprochement WHERE "compagnieId" = $1 AND reference = $2`,
          [compagnieId, d.reference],
        ),
      ).toMatch(/exécutée/);
      // « rattacher » sans cible : refusé.
      expect(
        await decisions
          .enregistrer(uneDecision(compagnieId, "2026-12", { action: "rattacher", cible: null }))
          .catch((e: Error) => e.message),
      ).toMatch(/decision_rapprochement_cible/);
    });

    it("la clôture attend une décision en cours d'écriture, puis voit qu'elle a changé le rapprochement", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const autre = new Client({ connectionString: base.url });
      await autre.connect();
      try {
        // Une décision écrite à la main dans une transaction pas encore validée : elle tient le verrou partagé.
        const d = uneDecision(compagnieId, "2026-12");
        await autre.query("BEGIN");
        await autre.query(
          `INSERT INTO decision_rapprochement ("compagnieId", mois, reference, action, montant, operateur,
             "telephoneMasque", cause, explication, "decideA", "parId", "parNom", "journalId", methode, execution)
           VALUES ($1, '2026-12', $2, 'rembourser', 5000, 'mtn', 'x', 'inconnue', 'x', now(), $3, 'x', $4, 'pin', 'en_attente')`,
          [compagnieId, d.reference, d.parId, d.journalId],
        );
        let terminee = false;
        // La clôture a calculé le rapprochement AVANT cette décision (aucune ligne décidée).
        const cloture = clotures.verrouiller(uneCloture(compagnieId, "2026-12")).then(
          (v) => ({ v }),
          (e: unknown) => ({ e }),
        );
        void cloture.then(() => {
          terminee = true;
        });
        await new Promise((r) => setTimeout(r, 400));
        expect(terminee, "la clôture doit attendre le verrou de la décision").toBe(false);
        await autre.query("COMMIT");
        const r = await cloture;
        expect("e" in r).toBe(true);
        expect(String((r as { e: unknown }).e)).toMatch(
          /RAPPROCHEMENT_CHANGE|Le rapprochement a changé/,
        );
        // Rien n'a été clôturé : le patron relance.
        expect(await clotures.existe(compagnieId, "2026-12")).toBe(false);
      } finally {
        await autre.end();
      }
    });

    it("une décision attend une clôture en cours d'écriture, puis trouve le mois clos", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const autre = new Client({ connectionString: base.url });
      await autre.connect();
      try {
        const c = uneCloture(compagnieId, "2026-12");
        await autre.query("BEGIN");
        await autre.query(
          `INSERT INTO cloture_mois ("compagnieId", mois, "clotureA", "parId", "parNom", "journalId",
             encaisse, rapprochement, lignes, exports)
           VALUES ($1, '2026-12', now(), $2, 'x', $3, '{}', '{}', '[]', '[]')`,
          [compagnieId, c.parId, c.journalId],
        );
        let terminee = false;
        const decision = decisions.enregistrer(uneDecision(compagnieId, "2026-12"));
        void decision.then(() => {
          terminee = true;
        });
        await new Promise((r) => setTimeout(r, 400));
        expect(terminee, "la décision doit attendre le verrou de la clôture").toBe(false);
        await autre.query("COMMIT");
        expect(await decision).toEqual({ resultat: "mois_verrouille" });
        expect(await decisions.lister(compagnieId, "2026-12")).toEqual([]);
      } finally {
        await autre.end();
      }
    });

    it("la clôture compte les décisions de la table : une décision absente de la clôture la fait échouer", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const d = uneDecision(compagnieId, "2026-12");
      await decisions.enregistrer(d);
      await expect(clotures.verrouiller(uneCloture(compagnieId, "2026-12"))).rejects.toThrow(
        /Le rapprochement a changé/,
      );
      const figee = uneCloture(compagnieId, "2026-12", {
        lignes: [
          {
            reference: d.reference,
            recueA: d.decideA,
            telephoneMasque: d.telephoneMasque,
            operateur: d.operateur,
            montant: d.montant,
            cause: d.cause,
            explication: d.explication,
            actionProposee: "rembourser",
            cibleSuggeree: null,
            decision: "rembourser",
          },
        ],
      });
      expect(await clotures.verrouiller(figee)).toBe(true);
    });

    it("les données personnelles ne sont pas lisibles en base : cabinet, destinataire, payeur du relevé", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      await parametres.definir({
        compagnieId,
        nomAgence: "Alpha",
        emailCabinet: "cabinet.mbarga@exemple.cm",
        envoiAutomatique: true,
        jourDEnvoi: 2,
        jourDeCloture: 5,
      });
      await clotures.verrouiller(uneCloture(compagnieId, "2026-12"));
      await envois.enregistrer({
        cle: `auto:${compagnieId}:2026-12`,
        compagnieId,
        mois: "2026-12",
        nature: "automatique",
        definitif: false,
        destinataire: "cabinet.mbarga@exemple.cm",
        envoyeA: iso("2027-01-02", "08:00:00"),
        recuA: null,
      });
      await releves.importer(compagnieId, [uneLigneReleve({ telephone: "+237677123441" })]);
      for (const [table, colonne] of [
        ["parametres_comptables", "emailCabinetChiffre"],
        ["cloture_mois", "destinataireChiffre"],
        ["envoi_cabinet", "destinataireChiffre"],
        ["releve_operateur_ligne", "telephoneChiffre"],
      ] as const) {
        const { rows } = await sql.query(
          `SELECT "${colonne}" AS v FROM ${table} WHERE "compagnieId" = $1`,
          [compagnieId],
        );
        expect(rows[0].v, `${table}.${colonne}`).toBeTruthy();
        expect(String(rows[0].v)).not.toMatch(/exemple\.cm|mbarga|677123441/);
      }
      // Et la lecture les rend intacts.
      expect((await parametres.lire(compagnieId))?.emailCabinet).toBe("cabinet.mbarga@exemple.cm");
      expect((await clotures.trouver(compagnieId, "2026-12"))?.destinataire).toBe(
        "cabinet.mbarga@exemple.cm",
      );
    });

    it("un relevé s'importe sans doublon et ne se modifie plus : c'est une preuve", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      const l = uneLigneReleve();
      expect(await releves.importer(compagnieId, [l, uneLigneReleve()])).toBe(2);
      expect(await releves.importer(compagnieId, [l])).toBe(0);
      expect(
        await erreurSql(`UPDATE releve_operateur_ligne SET montant = 1 WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM releve_operateur_ligne WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).not.toBe("");
      expect(
        await erreurSql(
          `INSERT INTO releve_operateur_ligne ("compagnieId", reference, "recueA", "telephoneChiffre", operateur, montant)
           VALUES ($1, 'REF-ZERO', now(), 'x', 'mtn', 0)`,
          [compagnieId],
        ),
      ).toMatch(/releve_operateur_ligne_montant/);
    });

    it("réglages : les jours d'envoi et de clôture restent dans le mois (1 à 28)", async () => {
      const compagnieId = await banc.nouvelleCompagnie();
      await expect(
        parametres.definir({
          compagnieId,
          nomAgence: "x",
          emailCabinet: null,
          envoiAutomatique: false,
          jourDEnvoi: 31,
          jourDeCloture: 5,
        }),
      ).rejects.toThrow();
    });

    it("un identifiant de compagnie qui n'est pas un UUID est traité comme inconnu, sans erreur SQL", async () => {
      expect(await parametres.lire("pas-un-uuid")).toBeNull();
      expect(await clotures.trouver("pas-un-uuid", "2026-12")).toBeNull();
      expect(await clotures.existe("pas-un-uuid", "2026-12")).toBe(false);
      expect(await clotures.mois("pas-un-uuid")).toEqual([]);
      expect(await decisions.lister("pas-un-uuid", "2026-12")).toEqual([]);
    });
  });

  /** Une agence avec sa gare, son guichet, son agent et un départ le 10 décembre 2026 à 07 h 30. */
  async function agence() {
    const compagnie = await fx.compagnie();
    const douala = await fx.gare(compagnie.id, { ville: "Douala" });
    const yaounde = await fx.gare(compagnie.id, { ville: "Yaoundé" });
    const guichet = await fx.guichet(douala.id, 2);
    const agent = await fx.personne({
      roles: ["guichetier"],
      compagnieId: compagnie.id,
      gareId: douala.id,
      guichetId: guichet.id,
      nom: "Joseph Mbarga",
    });
    const superviseur = await fx.personne({
      roles: ["superviseur"],
      compagnieId: compagnie.id,
      gareId: douala.id,
      nom: "Marie Ngo Bayiha",
    });
    const ligne = await fx.ligne(compagnie.id, douala.id, yaounde.id);
    const depart = await fx.depart(ligne.id, {
      heureDepart: new Date("2026-12-10T06:30:00.000Z"),
    });
    return {
      compagnie,
      douala,
      yaounde,
      guichet,
      agent,
      superviseur,
      depart,
      ctx: { compagnieId: compagnie.id, gareId: douala.id, departId: depart.id },
      codeLigne: `${douala.code}-${yaounde.code}`,
    };
  }

  /** Un colis payé ou non, rattaché à l'agence. */
  async function unColis(
    a: Awaited<ReturnType<typeof agence>>,
    o: {
      creeA: string;
      prixTotal?: number;
      paiement?: { etat: string; montant: number; moyen: string; reference: string | null } | null;
      expediteurTel?: string;
      destinataireTel?: string;
      deposePar?: string | null;
      deposeA?: string | null;
      etat?: "enregistre" | "perdu" | "retourne";
      poidsKg?: number;
      canal?: "agence" | "app";
    },
  ) {
    const n = fx.prochain();
    return prisma.colis.create({
      data: {
        numero: `C-${a.douala.code}-261211-${String(n).padStart(4, "0")}`,
        sequence: n,
        gareOrigineId: a.douala.id,
        gareDestinationId: a.yaounde.id,
        departId: a.depart.id,
        expediteurChiffre: "x",
        expediteurTelephoneIndex: o.expediteurTel
          ? chiffrement.indexAveugle(o.expediteurTel, "colis.telephone")
          : `exp-${n}`,
        destinataireChiffre: "x",
        destinataireTelephoneIndex: o.destinataireTel
          ? chiffrement.indexAveugle(o.destinataireTel, "colis.telephone")
          : `dest-${n}`,
        contenu: "Sac de riz",
        poidsKg: o.poidsKg ?? 5,
        valeurDeclaree: 10_000,
        mode: "gare",
        canal: o.canal ?? "agence",
        codeRetraitHache: "h",
        codeRetraitSel: "s",
        prixTotal: o.prixTotal ?? 3_000,
        creeA: new Date(o.creeA),
        etat: o.etat ?? "enregistre",
        jour: "261211",
        compagnieId: a.compagnie.id,
        paiementEtat: o.paiement?.etat ?? null,
        paiementMontant: o.paiement?.montant ?? null,
        paiementMoyen: o.paiement?.moyen ?? null,
        paiementReference: o.paiement?.reference ?? null,
        deposePar: o.deposePar ?? null,
        deposeA: o.deposeA ? new Date(o.deposeA) : null,
      },
    });
  }

  describe("lectures des ventes, des caisses et des annulations", () => {
    const DU = "2026-12-01T00:00:00.000+01:00";
    const AVANT = "2027-01-01T00:00:00.000+01:00";

    it("ventes : billets (guichet, mobile, en ligne, annulé) et colis payés, avec leur moyen, leur agent et leur référence", async () => {
      const a = await agence();
      const g = { guichetId: a.guichet.id, auteurId: a.agent.id };
      // 1 : cash au guichet 2, VIP, avec 500 F de bagage.
      const b1 = await fx.billet(a.ctx, {
        ...g,
        classe: "vip",
        prix: 12_000,
        bagage: 500,
        siege: 12,
        mode: "cash",
        creeA: new Date("2026-12-10T06:00:00.000Z"),
      });
      // 2 : MTN avec référence d'opérateur.
      const b2 = await fx.billet(a.ctx, {
        ...g,
        siege: 13,
        mode: "momo",
        creeA: new Date("2026-12-10T06:10:00.000Z"),
      });
      await prisma.billet.update({
        where: { id: b2.id },
        data: { paiement: { mode: "momo", reference: "MP261210.0900.AAA111" } },
      });
      // 3 : Orange avec une référence posée par le guichet (pas celle d'un opérateur).
      const b3 = await fx.billet(a.ctx, {
        ...g,
        siege: 14,
        mode: "orange_money",
        creeA: new Date("2026-12-10T06:20:00.000Z"),
      });
      await prisma.billet.update({
        where: { id: b3.id },
        data: { paiement: { mode: "orange_money", reference: "GUICHET-1234" } },
      });
      // 4 : acheté en ligne, soldé par Orange Money : le moyen vient de la commande.
      const voyageur = await fx.personne({ roles: ["voyageur"] });
      const commandeId = randomUUID();
      await prisma.commande.create({
        data: {
          id: commandeId,
          voyageurId: voyageur.id,
          departId: a.depart.id,
          type: "billet",
          libelle: "Douala - Yaoundé",
          total: 8_000,
          statut: "payee",
          creeA: new Date("2026-12-10T05:00:00.000Z"),
          expireA: new Date("2026-12-10T05:15:00.000Z"),
          passagersChiffre: "x",
          moyenPaiement: "orange_money",
        },
      });
      const b4 = await fx.billet(a.ctx, {
        siege: 15,
        canal: "en_ligne",
        mode: null,
        creeA: new Date("2026-12-10T07:00:00.000Z"),
      });
      await prisma.billet.update({ where: { id: b4.id }, data: { commandeId } });
      // 5 : annulé le 12 décembre à 10 h UTC : l'annulation est datée.
      const b5 = await fx.billet(a.ctx, {
        ...g,
        siege: 16,
        mode: "cash",
        etat: "annule",
        creeA: new Date("2026-12-10T06:30:00.000Z"),
      });
      await prisma.billet.update({
        where: { id: b5.id },
        data: {
          historique: [
            { action: "annuler", de: "paye", vers: "annule", at: "2026-12-12T10:00:00.000Z" },
          ],
        },
      });
      // Hors de la fenêtre : janvier.
      await fx.billet(a.ctx, { ...g, siege: 17, creeA: new Date("2027-01-03T08:00:00.000Z") });
      // Colis : un payé en MTN, un non payé (ne compte pas).
      const colisPaye = await unColis(a, {
        creeA: "2026-12-11T08:00:00.000Z",
        poidsKg: 2.5,
        deposePar: a.agent.id,
        paiement: {
          etat: "paye",
          montant: 3_000,
          moyen: "mtn_momo",
          reference: "MP261211.1000.BBB222",
        },
      });
      await unColis(a, { creeA: "2026-12-11T09:00:00.000Z", paiement: null });

      const ventes = await new VentesPrisma(prisma).ventes(a.compagnie.id, DU, AVANT);
      expect(ventes.map((v) => v.numero)).toEqual([
        // Le billet 4 (en ligne, 07:00Z) est le dernier billet de la fenêtre, avant le colis du 11.
        ...[b1, b2, b3, b5, b4].map((b) => b.numero),
        colisPaye.numero,
      ]);
      const par = new Map(ventes.map((v) => [v.numero, v]));
      expect(par.get(b1.numero)).toMatchObject({
        genre: "billet",
        ligne: a.codeLigne,
        depart: "07:30",
        siege: "12",
        classe: "VIP",
        prix: 12_500,
        moyen: "cash",
        guichet: "GU2",
        agent: "JM",
        referenceOperateur: null,
        annuleeA: null,
      });
      expect(par.get(b2.numero)).toMatchObject({
        moyen: "mtn",
        referenceOperateur: "MP261210.0900.AAA111",
        classe: "CLASSIQUE",
      });
      expect(par.get(b3.numero)).toMatchObject({ moyen: "orange", referenceOperateur: null });
      expect(par.get(b4.numero)).toMatchObject({
        moyen: "orange",
        guichet: "APP",
        agent: null,
      });
      expect(par.get(b5.numero)?.annuleeA).toBe("2026-12-12T11:00:00.000+01:00");
      expect(par.get(colisPaye.numero)).toMatchObject({
        genre: "colis",
        ligne: "COLIS",
        depart: null,
        siege: null,
        classe: "2,5 kg",
        prix: 3_000,
        moyen: "mtn",
        guichet: "AGENCE",
        agent: "JM",
        referenceOperateur: "MP261211.1000.BBB222",
      });
      // Une autre compagnie ne voit rien de tout cela.
      const autre = await fx.compagnie();
      expect(await new VentesPrisma(prisma).ventes(autre.id, DU, AVANT)).toEqual([]);
    });

    it("références connues et mois d'activité : billets et colis de la compagnie seulement", async () => {
      const a = await agence();
      const b = await fx.billet(a.ctx, {
        mode: "momo",
        creeA: new Date("2027-01-03T08:00:00.000Z"),
      });
      await prisma.billet.update({
        where: { id: b.id },
        data: { paiement: { mode: "momo", reference: "REF-BILLET-1" } },
      });
      await fx.billet(a.ctx, { creeA: new Date("2026-12-31T23:30:00.000Z") });
      await unColis(a, {
        creeA: "2026-11-11T08:00:00.000Z",
        paiement: { etat: "paye", montant: 3_000, moyen: "mtn_momo", reference: "REF-COLIS-1" },
      });
      const ventes = new VentesPrisma(prisma);
      expect(
        await ventes.referencesConnues(a.compagnie.id, [
          "REF-BILLET-1",
          "REF-COLIS-1",
          "REF-INCONNUE",
        ]),
      ).toEqual(new Set(["REF-BILLET-1", "REF-COLIS-1"]));
      expect(await ventes.referencesConnues(a.compagnie.id, [])).toEqual(new Set());
      const autre = await fx.compagnie();
      expect(await ventes.referencesConnues(autre.id, ["REF-BILLET-1"])).toEqual(new Set());
      // 31 décembre 23 h 30 UTC est déjà le 1er janvier à Douala : deux billets en janvier.
      expect(await ventes.moisAvecActivite(a.compagnie.id)).toEqual(["2027-01", "2026-11"]);
    });

    it("sessions de caisse : guichet, agent, écart et validation par le superviseur", async () => {
      const a = await agence();
      const s1 = await creerSessionPg(prisma, {
        compagnieId: a.compagnie.id,
        gareId: a.douala.id,
        guichetId: a.guichet.id,
        agentId: a.agent.id,
        superviseurId: a.superviseur.id,
        etat: "validee",
        ouverteA: "2026-12-10T06:00:00.000Z",
        ecart: -2_500,
        rang: 2,
      });
      const s2 = await creerSessionPg(prisma, {
        compagnieId: a.compagnie.id,
        gareId: a.douala.id,
        guichetId: a.guichet.id,
        agentId: a.agent.id,
        etat: "ouverte",
        ouverteA: "2026-12-11T06:00:00.000Z",
        rang: 2,
      });
      // Hors fenêtre.
      await creerSessionPg(prisma, {
        compagnieId: a.compagnie.id,
        gareId: a.douala.id,
        guichetId: a.guichet.id,
        agentId: a.agent.id,
        etat: "cloturee",
        ouverteA: "2027-02-11T06:00:00.000Z",
      });
      const sessions = await new SessionsPrisma(prisma).sessions(a.compagnie.id, DU, AVANT);
      expect(sessions).toEqual([
        {
          id: s1.id,
          numero: s1.numero,
          guichet: "GU2",
          agent: "Joseph Mbarga",
          ouverteA: "2026-12-10T07:00:00.000+01:00",
          clotureeA: "2026-12-10T07:00:00.000+01:00",
          fond: 25_000,
          cashAttendu: 25_000,
          cashCompte: 22_500,
          ecart: -2_500,
          validePar: "Marie Ngo Bayiha",
          validation: "pin",
        },
        {
          id: s2.id,
          numero: s2.numero,
          guichet: "GU2",
          agent: "Joseph Mbarga",
          ouverteA: "2026-12-11T07:00:00.000+01:00",
          clotureeA: null,
          fond: 25_000,
          cashAttendu: null,
          cashCompte: null,
          ecart: null,
          validePar: null,
          validation: null,
        },
      ]);
    });

    it("annulations : seules les demandes décidées de la fenêtre, avec le moyen de paiement de la vente", async () => {
      const a = await agence();
      const billet = await fx.billet(a.ctx, {
        prix: 8_000,
        bagage: 500,
        mode: "orange_money",
        guichetId: a.guichet.id,
        auteurId: a.agent.id,
        creeA: new Date("2026-12-05T08:00:00.000Z"),
      });
      const demandeId = randomUUID();
      await prisma.demandeAnnulation.create({
        data: {
          demandeId,
          billetId: billet.id,
          gareId: a.douala.id,
          compagnieId: a.compagnie.id,
          demandeurId: a.agent.id,
          guichetRang: 2,
          motif: "Le client a changé d'avis",
          demandeA: new Date("2026-12-12T08:00:00.000Z"),
          statut: "decidee",
          decision: "rembourser",
          decideeA: new Date("2026-12-12T09:00:00.000Z"),
          decideeParId: a.superviseur.id,
          evenementDemandeId: randomUUID(),
          evenementDecisionId: randomUUID(),
        },
      });
      // En attente : ne compte pas.
      const b2 = await fx.billet(a.ctx, { siege: 30 });
      await prisma.demandeAnnulation.create({
        data: {
          demandeId: randomUUID(),
          billetId: b2.id,
          gareId: a.douala.id,
          compagnieId: a.compagnie.id,
          demandeurId: a.agent.id,
          guichetRang: 2,
          motif: "x",
          demandeA: new Date("2026-12-12T08:00:00.000Z"),
          statut: "en_attente",
          evenementDemandeId: randomUUID(),
        },
      });
      const lues = await new AnnulationsPrisma(prisma).decidees(a.compagnie.id, DU, AVANT);
      expect(lues).toEqual([
        {
          id: demandeId,
          at: "2026-12-12T10:00:00.000+01:00",
          numero: billet.numero,
          genre: "billet",
          // Le montant décidé n'est pas renseigné : le prix du billet et son bagage.
          montant: 8_500,
          decision: "rembourser",
          motif: "Le client a changé d'avis",
          demandePar: "Joseph Mbarga",
          validePar: "Marie Ngo Bayiha",
          validation: "pin",
          venteAt: "2026-12-05T09:00:00.000+01:00",
          moyen: "orange",
        },
      ]);
      expect(
        await new AnnulationsPrisma(prisma).decidees(
          a.compagnie.id,
          DU,
          "2026-12-12T00:00:00.000+01:00",
        ),
      ).toEqual([]);
    });
  });

  describe("faits du rapprochement : les numéros se cherchent par index aveugle", () => {
    const TEL = "+237677123441";
    const AUTRE_TEL = "+237699000002";

    it("ventes autour d'une transaction : billets du passager et colis de l'expéditeur ou du destinataire, dans la fenêtre", async () => {
      const a = await agence();
      const faits = new FaitsPrisma(prisma, chiffrement);
      const b = await fx.billet(a.ctx, {
        mode: "momo",
        creeA: new Date("2026-12-03T10:45:00.000Z"),
      });
      await prisma.billet.update({
        where: { id: b.id },
        data: {
          passagerTelephoneIndex: chiffrement.indexAveugle(TEL, "telephone"),
          paiement: { mode: "momo", reference: "MP261203.1142.A71290" },
        },
      });
      // Même numéro, loin dans le temps ; autre numéro, même heure.
      const loin = await fx.billet(a.ctx, { creeA: new Date("2026-12-03T14:00:00.000Z") });
      await prisma.billet.update({
        where: { id: loin.id },
        data: { passagerTelephoneIndex: chiffrement.indexAveugle(TEL, "telephone") },
      });
      const autre = await fx.billet(a.ctx, { creeA: new Date("2026-12-03T10:46:00.000Z") });
      await prisma.billet.update({
        where: { id: autre.id },
        data: { passagerTelephoneIndex: chiffrement.indexAveugle(AUTRE_TEL, "telephone") },
      });
      const colis = await unColis(a, {
        creeA: "2026-12-03T10:50:00.000Z",
        destinataireTel: TEL,
        prixTotal: 4_000,
        canal: "app",
        paiement: { etat: "paye", montant: 4_000, moyen: "mtn_momo", reference: "GUICHET-77" },
      });
      const v = await faits.ventesAutour(a.compagnie.id, TEL, "2026-12-03T11:42:00.000+01:00", 15);
      expect(v).toEqual([
        {
          numero: b.numero,
          genre: "billet",
          at: "2026-12-03T11:45:00.000+01:00",
          montant: 8_000,
          ligne: a.codeLigne,
          depart: "07:30",
          referenceOperateur: "MP261203.1142.A71290",
          canal: "guichet",
        },
        {
          numero: colis.numero,
          genre: "colis",
          at: "2026-12-03T11:50:00.000+01:00",
          montant: 4_000,
          ligne: "COLIS",
          depart: null,
          referenceOperateur: null,
          canal: "en_ligne",
        },
      ]);
      // Une autre compagnie ne reconnaît pas ce numéro.
      const etrangere = await fx.compagnie();
      expect(
        await faits.ventesAutour(etrangere.id, TEL, "2026-12-03T11:42:00.000+01:00", 15),
      ).toEqual([]);
    });

    it("paiements expirés : la commande du voyageur dont le compte porte ce numéro", async () => {
      const a = await agence();
      const faits = new FaitsPrisma(prisma, chiffrement);
      const voyageur = await fx.personne({ roles: ["voyageur"] });
      await prisma.personne.update({
        where: { id: voyageur.id },
        data: { telephoneIndex: chiffrement.indexAveugle(TEL, "telephone") },
      });
      const commande = (expireA: string, statut: string) =>
        prisma.commande.create({
          data: {
            id: randomUUID(),
            voyageurId: voyageur.id,
            departId: a.depart.id,
            type: "billet",
            libelle: "x",
            total: 8_000,
            statut,
            creeA: new Date(new Date(expireA).getTime() - 15 * 60_000),
            expireA: new Date(expireA),
            passagersChiffre: "x",
          },
        });
      await commande("2026-12-09T05:58:00.000Z", "expiree");
      await commande("2026-12-09T05:58:00.000Z", "payee");
      await commande("2026-12-01T05:58:00.000Z", "expiree");
      const r = await faits.paiementsExpires(
        a.compagnie.id,
        TEL,
        "2026-12-09T07:00:00.000+01:00",
        120,
      );
      expect(r).toEqual([
        {
          expireA: "2026-12-09T06:58:00.000+01:00",
          montant: 8_000,
          ligne: a.codeLigne,
          depart: "07:30",
        },
      ]);
      expect(
        await faits.paiementsExpires(
          a.compagnie.id,
          AUTRE_TEL,
          "2026-12-09T07:00:00.000+01:00",
          120,
        ),
      ).toEqual([]);
    });

    it("colis sans dépôt : payé à l'arrivée, jamais déposé au relais, pour ce montant exact", async () => {
      const a = await agence();
      const faits = new FaitsPrisma(prisma, chiffrement);
      const sans = await unColis(a, {
        creeA: "2026-12-17T08:00:00.000Z",
        destinataireTel: TEL,
        prixTotal: 3_500,
      });
      await unColis(a, {
        creeA: "2026-12-17T08:00:00.000Z",
        destinataireTel: TEL,
        prixTotal: 3_500,
        deposeA: "2026-12-17T09:00:00.000Z",
      });
      await unColis(a, {
        creeA: "2026-12-17T08:00:00.000Z",
        destinataireTel: TEL,
        prixTotal: 9_999,
      });
      await unColis(a, {
        creeA: "2026-12-17T08:00:00.000Z",
        destinataireTel: TEL,
        prixTotal: 3_500,
        etat: "perdu",
      });
      expect(await faits.colisSansDepot(a.compagnie.id, TEL, 3_500)).toEqual([
        { numero: sans.numero, montant: 3_500, relais: null },
      ]);
      expect(await faits.colisSansDepot(a.compagnie.id, AUTRE_TEL, 3_500)).toEqual([]);
    });

    it("numéro connu : acheteur de billet, expéditeur ou destinataire de colis, voyageur d'une commande ; sinon inconnu", async () => {
      const a = await agence();
      const faits = new FaitsPrisma(prisma, chiffrement);
      expect(await faits.numeroConnu(a.compagnie.id, TEL)).toBe(false);
      const b = await fx.billet(a.ctx, {});
      await prisma.billet.update({
        where: { id: b.id },
        data: { passagerTelephoneIndex: chiffrement.indexAveugle(TEL, "telephone") },
      });
      expect(await faits.numeroConnu(a.compagnie.id, TEL)).toBe(true);
      await unColis(a, { creeA: "2026-12-17T08:00:00.000Z", expediteurTel: AUTRE_TEL });
      expect(await faits.numeroConnu(a.compagnie.id, AUTRE_TEL)).toBe(true);
      expect(await faits.numeroConnu(a.compagnie.id, "+237655000011")).toBe(false);
      const etrangere = await fx.compagnie();
      expect(await faits.numeroConnu(etrangere.id, TEL)).toBe(false);
    });
  });

  describe("rattacher une transaction du relevé à un colis ou à un billet", () => {
    const effets = new ActionsMemoire();
    let REF = "";

    async function decor() {
      const a = await agence();
      // Une référence d'opérateur par essai : elle est unique chez l'opérateur, donc dans toute la base.
      REF = `MP261217.${fx.prochain()}.B55012`;
      await releves.importer(a.compagnie.id, [uneLigneReleve({ reference: REF, montant: 3_500 })]);
      const colis = await unColis(a, {
        creeA: "2026-12-17T08:00:00.000Z",
        prixTotal: 3_500,
        paiement: { etat: "en_attente", montant: 3_500, moyen: "mtn_momo", reference: null },
      });
      return { a, colis };
    }
    const actions = () => new ActionsRapprochementPrisma(prisma, effets);

    it("écrit la référence de l'opérateur sur le colis, marque le paiement fait, et rejoue sans rien réécrire", async () => {
      const { colis } = await decor();
      const cle = `rattacher:${REF}`;
      const r1 = await actions().rattacher({ cle, reference: REF, cible: colis.numero });
      expect(r1).toEqual({ reference: `RATTACHE-${colis.numero}` });
      const apres = await prisma.colis.findUniqueOrThrow({ where: { id: colis.id } });
      expect(apres).toMatchObject({
        paiementReference: REF,
        paiementEtat: "paye",
        paiementMoyen: "mtn_momo",
        version: colis.version + 1,
      });
      // Rejeu : même résultat, la version n'avance pas.
      const r2 = await actions().rattacher({ cle, reference: REF, cible: colis.numero });
      expect(r2).toEqual(r1);
      expect((await prisma.colis.findUniqueOrThrow({ where: { id: colis.id } })).version).toBe(
        colis.version + 1,
      );
    });

    it("cinq rattachements simultanés de la même clé : un seul écrit, tous rendent le même résultat", async () => {
      const { colis } = await decor();
      const cle = `rattacher:${REF}`;
      const rs = await Promise.all(
        Array.from({ length: 5 }, () =>
          actions().rattacher({ cle, reference: REF, cible: colis.numero }),
        ),
      );
      expect(new Set(rs.map((r) => r.reference)).size).toBe(1);
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM action_rapprochement_faite WHERE cle = $1`,
        [cle],
      );
      expect(rows[0].n).toBe(1);
      expect((await prisma.colis.findUniqueOrThrow({ where: { id: colis.id } })).version).toBe(
        colis.version + 1,
      );
    });

    it("rattache aussi un billet payé en mobile money, mais jamais un billet payé en espèces", async () => {
      const a = await agence();
      await releves.importer(a.compagnie.id, [
        uneLigneReleve({ reference: "REF-BILLET-A", operateur: "orange", montant: 8_000 }),
        uneLigneReleve({ reference: "REF-BILLET-B", montant: 8_000 }),
      ]);
      const mobile = await fx.billet(a.ctx, { mode: "orange_money" });
      const cash = await fx.billet(a.ctx, { mode: "cash" });
      const r = await actions().rattacher({
        cle: "rattacher:REF-BILLET-A",
        reference: "REF-BILLET-A",
        cible: mobile.numero,
      });
      expect(r.reference).toBe(`RATTACHE-${mobile.numero}`);
      const apres = await prisma.billet.findUniqueOrThrow({ where: { id: mobile.id } });
      expect(apres.paiement).toEqual({ mode: "orange_money", reference: "REF-BILLET-A" });
      await expect(
        actions().rattacher({
          cle: "rattacher:REF-BILLET-B",
          reference: "REF-BILLET-B",
          cible: cash.numero,
        }),
      ).rejects.toBeInstanceOf(ActionRefusee);
    });

    it("refuse une référence absente des relevés, une cible inconnue, la cible d'une autre agence ou déjà rattachée", async () => {
      const { a, colis } = await decor();
      await expect(
        actions().rattacher({ cle: "k1", reference: "REF-INCONNUE", cible: colis.numero }),
      ).rejects.toBeInstanceOf(ActionRefusee);
      await expect(
        actions().rattacher({ cle: "k2", reference: REF, cible: "C-XXX-000000-0000" }),
      ).rejects.toBeInstanceOf(ActionRefusee);
      // Le colis d'une autre agence.
      const autre = await agence();
      const colisEtranger = await unColis(autre, { creeA: "2026-12-17T08:00:00.000Z" });
      await expect(
        actions().rattacher({ cle: "k3", reference: REF, cible: colisEtranger.numero }),
      ).rejects.toBeInstanceOf(ActionRefusee);
      // Un colis qui porte déjà une autre référence d'opérateur.
      const pris = await unColis(a, {
        creeA: "2026-12-17T08:00:00.000Z",
        paiement: { etat: "paye", montant: 3_500, moyen: "mtn_momo", reference: "MP-AUTRE" },
      });
      await expect(
        actions().rattacher({ cle: "k4", reference: REF, cible: pris.numero }),
      ).rejects.toBeInstanceOf(ActionRefusee);
      // Rien n'a été écrit par ces refus.
      const { rows } = await sql.query(
        `SELECT count(*)::int AS n FROM action_rapprochement_faite WHERE cle IN ('k1','k2','k3','k4')`,
      );
      expect(rows[0].n).toBe(0);
    });

    it("le journal des actions faites est en ajout seul", async () => {
      const { colis } = await decor();
      await actions().rattacher({
        cle: "rattacher:ajout-seul",
        reference: REF,
        cible: colis.numero,
      });
      expect(
        await erreurSql(`UPDATE action_rapprochement_faite SET resultat = 'x' WHERE cle = $1`, [
          "rattacher:ajout-seul",
        ]),
      ).not.toBe("");
      expect(
        await erreurSql(`DELETE FROM action_rapprochement_faite WHERE cle = $1`, [
          "rattacher:ajout-seul",
        ]),
      ).not.toBe("");
    });

    it("rembourser et réclamer restent confiés aux effets simulés : l'adaptateur n'est pas durable", async () => {
      expect(actions().durable).toBe(false);
      const r = await actions().rembourser({
        cle: "k-remb",
        reference: REF,
        operateur: "mtn",
        montant: 5_000,
      });
      expect(r.reference).toMatch(/^REMBOURSER-/);
    });
  });
});
