import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../socle/db/prisma.service";
import { VARIABLE_STOCKAGE } from "../socle/db/stockage";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { RapportsSoirMemoire } from "./memoire";
import {
  ActiviteColisPrisma,
  AnnulationsDuJourPrisma,
  ControlesEnRoutePrisma,
  RapportsSoirPrisma,
  ReferentielRapportPrisma,
  VentesBilletsPrisma,
  modeDuRapport,
} from "./postgres";
import {
  ActiviteColis,
  AnnulationsDuJour,
  ControlesEnRoute,
  ReferentielRapport,
  RapportsSoir,
  VentesBillets,
} from "./ports";
import { creerAppRapportTest, type AppRapportTest } from "./testing/app-rapport-test";
import { contratRapportsSoir, unStocke } from "./testing/contrat-stockage";
import {
  AKWA,
  AUTRE_COMPAGNIE,
  BAFOUSSAM,
  COMPAGNIE,
  GARE_AUTRE,
  JOUR,
  MVAN,
  NOM_COMPAGNIE,
  VINGT_ET_UNE_HEURES,
} from "./testing/montage";

/**
 * Rapport du soir : le contrat du port `RapportsSoir` sur la mémoire (toujours) et sur PostgreSQL
 * (quand DATABASE_URL_TEST est définie), puis ce que seule la base garantit (un rapport par
 * compagnie et par jour sous requêtes simultanées, ajout seul), les cinq lectures des tables des
 * autres modules (bornes du jour de Douala, périmètre de la compagnie) et l'API de bout en bout
 * avec `API_STOCKAGE=postgres`.
 */

contratRapportsSoir("mémoire", async () => ({
  rapports: new RapportsSoirMemoire(),
  fermer: async () => undefined,
}));

describe("modeDuRapport", () => {
  it("ramène les moyens de paiement de chaque module aux trois du rapport", () => {
    expect(modeDuRapport("cash")).toBe("cash");
    expect(modeDuRapport("especes_agence")).toBe("cash");
    expect(modeDuRapport("momo")).toBe("momo");
    expect(modeDuRapport("mtn_momo")).toBe("momo");
    expect(modeDuRapport("orange_money")).toBe("orange_money");
    expect(modeDuRapport("carte")).toBeNull();
    expect(modeDuRapport(null)).toBeNull();
    expect(modeDuRapport(42)).toBeNull();
  });
});

const DOUALA = (jour: string, hhmm: string, secondes = "00"): Date =>
  new Date(`${jour}T${hhmm}:${secondes}.000+01:00`);

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · rapport du soir", () => {
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

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    prisma = new PrismaService(configTest({ DATABASE_URL: base.url }));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await base?.fermer();
  });

  contratRapportsSoir("PostgreSQL", async () => ({
    rapports: new RapportsSoirPrisma(prisma),
    fermer: async () => undefined,
  }));

  describe("rapport_soir : ce que seule la base garantit", () => {
    it("un rapport arrêté ne se modifie ni ne se supprime, la table ne se vide pas", async () => {
      const rapports = new RapportsSoirPrisma(prisma);
      const e = unStocke();
      await rapports.creer(e);
      expect(
        await erreurSql(`UPDATE rapport_soir SET rapport = '{}' WHERE "compagnieId" = $1`, [
          e.compagnieId,
        ]),
      ).toContain("ajout seul");
      expect(
        await erreurSql(`DELETE FROM rapport_soir WHERE "compagnieId" = $1`, [e.compagnieId]),
      ).toContain("ajout seul");
      expect(await erreurSql(`TRUNCATE rapport_soir`)).toContain("ajout seul");
      expect(await rapports.trouver(e.compagnieId, e.jour)).toEqual(e);
    });

    it("la clé primaire (compagnie, jour) refuse un second rapport écrit directement", async () => {
      const rapports = new RapportsSoirPrisma(prisma);
      const e = unStocke();
      await rapports.creer(e);
      const message = await erreurSql(
        `INSERT INTO rapport_soir ("compagnieId", jour, "genereA", rapport)
         VALUES ($1, $2, now(), '{}')`,
        [e.compagnieId, e.jour],
      );
      expect(message).toContain("rapport_soir_pkey");
    });

    it("le jour est gardé comme un jour calendaire, sans décalage de fuseau", async () => {
      const rapports = new RapportsSoirPrisma(prisma);
      const e = unStocke({ jour: "2027-03-01", genereA: "2027-03-01T21:00:00.000+01:00" });
      await rapports.creer(e);
      const { rows } = await sql.query(
        `SELECT jour::text AS jour FROM rapport_soir WHERE "compagnieId" = $1`,
        [e.compagnieId],
      );
      expect(rows[0].jour).toBe("2027-03-01");
    });

    it("une compagnie ou un jour mal formé n'est jamais trouvé, et ne s'écrit pas", async () => {
      const rapports = new RapportsSoirPrisma(prisma);
      expect(await rapports.trouver("pas-un-uuid", "2027-01-05")).toBeNull();
      expect(await rapports.trouver(randomUUID(), "2027-02-30")).toBeNull();
      await expect(rapports.creer(unStocke({ compagnieId: "pas-un-uuid" }))).rejects.toThrow(
        RangeError,
      );
    });
  });

  /* ---------------------------------------------------------------- les lectures */

  describe("lectures des tables des autres modules", () => {
    // Un monde : deux compagnies, des billets, des colis, des annulations, des contrôles.
    const J = "2026-10-10";
    const J1 = "2026-10-11";
    const compagnieA = randomUUID();
    const compagnieB = randomUUID();
    const gareA1 = randomUUID();
    const gareA2 = randomUUID();
    const gareB = randomUUID();
    const departParti = randomUUID();
    const departProgramme = randomUUID();
    const departB = randomUUID();
    const superviseur = randomUUID();
    const billets: Record<string, string> = {};
    const colis: Record<string, string> = {};
    let compteur = 0;

    const nouveauBillet = async (
      nom: string,
      o: {
        compagnieId?: string;
        gareId?: string;
        departId?: string;
        creeA: Date;
        prix?: number;
        bagage?: number;
        canal?: "guichet" | "convoyeur" | "en_ligne" | "vendeur";
        etat?: "reserve" | "paye" | "embarque" | "voyage" | "annule" | "non_presente" | "reporte";
        paiement?: unknown;
        aCompleterAuQuai?: boolean;
        embarqueA?: Date | null;
        reporteDeId?: string | null;
      },
    ) => {
      compteur += 1;
      const b = await prisma.billet.create({
        data: {
          numero: `ALP-DLA-261010-${String(compteur).padStart(4, "0")}`,
          sequence: compteur,
          compagnieId: o.compagnieId ?? compagnieA,
          gareId: o.gareId ?? gareA1,
          departId: o.departId ?? departParti,
          classe: "classique",
          prix: o.prix ?? 5_000,
          bagage: o.bagage ?? 0,
          canal: o.canal ?? "guichet",
          codeBillet: String(1000 + compteur),
          creeA: o.creeA,
          etat: o.etat ?? "paye",
          paiement: (o.paiement ?? undefined) as never,
          aCompleterAuQuai: o.aCompleterAuQuai ?? false,
          embarqueA: o.embarqueA ?? null,
          reporteDeId: o.reporteDeId ?? null,
        },
      });
      billets[nom] = b.id;
      return b;
    };

    const nouveauColis = async (
      nom: string,
      o: {
        compagnieId?: string | null;
        gareOrigineId?: string;
        creeA: Date;
        prixTotal: number;
        complementPoids?: number;
        paiementEtat?: string | null;
        paiementMoyen?: string | null;
      },
    ) => {
      compteur += 1;
      const c = await prisma.colis.create({
        data: {
          numero: `C-DLA-261010-${String(compteur).padStart(4, "0")}`,
          sequence: compteur,
          gareOrigineId: o.gareOrigineId ?? gareA1,
          gareDestinationId: gareA2,
          expediteurChiffre: "x",
          expediteurTelephoneIndex: randomUUID(),
          destinataireChiffre: "y",
          destinataireTelephoneIndex: randomUUID(),
          contenu: "Sacs de manioc",
          poidsKg: 12,
          valeurDeclaree: 0,
          mode: "gare",
          canal: "agence",
          codeRetraitHache: "h",
          codeRetraitSel: "s",
          prixTotal: o.prixTotal,
          complementPoids: o.complementPoids ?? 0,
          creeA: o.creeA,
          etat: "enregistre",
          jour: "261010",
          compagnieId: o.compagnieId === undefined ? compagnieA : o.compagnieId,
          paiementEtat: o.paiementEtat ?? null,
          paiementMoyen: o.paiementMoyen ?? null,
        },
      });
      colis[nom] = c.id;
      return c;
    };

    const evenement = async (
      type: string,
      at: Date,
      donnees: Record<string, unknown>,
      cible: { type: string; id: string },
    ) =>
      prisma.journalEvenement.create({
        data: {
          id: randomUUID(),
          type,
          at,
          cibleType: cible.type,
          cibleId: cible.id,
          donnees: donnees as never,
          origine: "serveur",
        },
      });

    beforeAll(async () => {
      await prisma.compagnie.createMany({
        data: [
          { id: compagnieA, code: "ALP", nom: "Alpha Voyages" },
          { id: compagnieB, code: "BET", nom: "Beta Express" },
        ],
      });
      await prisma.compagnie.create({
        data: { id: randomUUID(), code: "OLD", nom: "Ancienne compagnie", actif: false },
      });
      await prisma.gare.createMany({
        data: [
          { id: gareA1, compagnieId: compagnieA, code: "DLA", nom: "Akwa", ville: "Douala" },
          { id: gareA2, compagnieId: compagnieA, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
          { id: gareB, compagnieId: compagnieB, code: "DLA", nom: "Bonabéri", ville: "Douala" },
        ],
      });
      const ligneA = randomUUID();
      const ligneB = randomUUID();
      await prisma.ligne.createMany({
        data: [
          {
            id: ligneA,
            compagnieId: compagnieA,
            code: "DLAYDE",
            origineGareId: gareA1,
            destinationGareId: gareA2,
            tarifClassique: 5_000,
            tarifVip: 8_000,
            tarifBagage: 500,
          },
          {
            id: ligneB,
            compagnieId: compagnieB,
            code: "DLADLA",
            origineGareId: gareB,
            destinationGareId: gareB,
            tarifClassique: 5_000,
            tarifVip: 8_000,
            tarifBagage: 500,
          },
        ],
      });
      await prisma.depart.createMany({
        data: [
          {
            id: departParti,
            numero: "ALP-DLAYDE-261010-0800",
            ligneId: ligneA,
            classe: "classique",
            heureDepart: DOUALA(J, "08:00"),
            etat: "parti",
          },
          {
            id: departProgramme,
            numero: "ALP-DLAYDE-261010-1700",
            ligneId: ligneA,
            classe: "classique",
            heureDepart: DOUALA(J, "17:00"),
            etat: "programme",
          },
          {
            id: departB,
            numero: "BET-DLADLA-261010-0900",
            ligneId: ligneB,
            classe: "classique",
            heureDepart: DOUALA(J, "09:00"),
            etat: "parti",
          },
        ],
      });
      await prisma.personne.create({
        data: {
          id: superviseur,
          nom: "Essono",
          telephoneChiffre: "chiffre",
          telephoneIndex: randomUUID(),
          roles: ["superviseur"],
          compagnieId: compagnieA,
        },
      });

      // Billets de la compagnie A, jour J.
      await nouveauBillet("b1", {
        creeA: DOUALA(J, "10:00"),
        prix: 5_000,
        bagage: 500,
        paiement: { mode: "cash", reference: null },
        embarqueA: DOUALA(J, "07:55"),
      });
      await nouveauBillet("b2", {
        creeA: DOUALA(J, "23:59", "59"),
        canal: "en_ligne",
        prix: 4_000,
        paiement: { mode: "momo", reference: "MP1" },
        gareId: gareA2,
      });
      await nouveauBillet("minuit", {
        creeA: DOUALA(J, "00:00"),
        canal: "convoyeur",
        paiement: { mode: "orange_money" },
      });
      await nouveauBillet("lendemain", { creeA: DOUALA(J1, "00:00") });
      await nouveauBillet("veille", { creeA: new Date(DOUALA(J, "00:00").getTime() - 1) });
      await nouveauBillet("report", {
        creeA: DOUALA(J, "11:00"),
        reporteDeId: billets["b1"]!,
        departId: departProgramme,
      });
      await nouveauBillet("cadence", {
        creeA: DOUALA(J, "12:00"),
        departId: departProgramme,
        aCompleterAuQuai: true,
        paiement: null,
      });
      await nouveauBillet("annule", { creeA: DOUALA(J, "13:00"), etat: "annule" });
      await nouveauBillet("autreCompagnie", {
        compagnieId: compagnieB,
        gareId: gareB,
        departId: departB,
        creeA: DOUALA(J, "10:00"),
      });

      // Colis.
      await nouveauColis("paye", {
        creeA: DOUALA(J, "09:00"),
        prixTotal: 6_000,
        complementPoids: 1_000,
        paiementEtat: "paye",
        paiementMoyen: "mtn_momo",
      });
      await nouveauColis("guichetCash", {
        creeA: DOUALA(J, "09:30"),
        prixTotal: 2_500,
        paiementEtat: "paye",
        paiementMoyen: "cash",
        gareOrigineId: gareA2,
      });
      await nouveauColis("attente", {
        creeA: DOUALA(J, "10:00"),
        prixTotal: 4_000,
        complementPoids: 500,
        paiementEtat: "en_attente",
        paiementMoyen: "orange_money",
      });
      await nouveauColis("lendemain", { creeA: DOUALA(J1, "00:00"), prixTotal: 3_000 });
      await nouveauColis("autreCompagnie", {
        compagnieId: compagnieB,
        gareOrigineId: gareB,
        creeA: DOUALA(J, "09:00"),
        prixTotal: 9_000,
      });

      // Réclamations : deux ouvertes le jour J, une la veille, une chez B.
      const reclamation = (reference: string, compagnieId: string, colisId: string, a: Date) =>
        prisma.reclamationColis.create({
          data: {
            reference,
            colisId,
            colisNumero: "C-X",
            compagnieId,
            auteurId: superviseur,
            motif: "colis_abime",
            ouverteA: a,
            reponseAvant: new Date(a.getTime() + 72 * 3_600_000),
            statut: "ouverte",
          },
        });
      await reclamation("R-261010-AAAAAA", compagnieA, colis["paye"]!, DOUALA(J, "14:00"));
      await reclamation("R-261010-BBBBBB", compagnieA, colis["attente"]!, DOUALA(J, "23:30"));
      await reclamation(
        "R-261009-CCCCCC",
        compagnieA,
        colis["paye"]!,
        DOUALA("2026-10-09", "23:59"),
      );
      await reclamation(
        "R-261010-DDDDDD",
        compagnieB,
        colis["autreCompagnie"]!,
        DOUALA(J, "14:00"),
      );

      // Demandes d'annulation.
      const demande = (
        nom: string,
        o: {
          compagnieId?: string;
          statut: "en_attente" | "decidee";
          decision?: "rembourser" | "reporter" | "avoir" | "refuser";
          montant?: number | null;
          decideeA?: Date;
        },
      ) =>
        prisma.demandeAnnulation.create({
          data: {
            demandeId: randomUUID(),
            billetId: billets[nom]!,
            gareId: gareA1,
            compagnieId: o.compagnieId ?? compagnieA,
            demandeurId: superviseur,
            guichetRang: 1,
            motif: "client change d'avis",
            demandeA: DOUALA(J, "09:00"),
            statut: o.statut,
            decision: o.decision ?? null,
            montant: o.montant ?? null,
            decideeA: o.decideeA ?? null,
            decideeParId: o.statut === "decidee" ? superviseur : null,
            evenementDemandeId: randomUUID(),
            evenementDecisionId: o.statut === "decidee" ? randomUUID() : null,
          },
        });
      await demande("b1", {
        statut: "decidee",
        decision: "rembourser",
        montant: 4_500,
        decideeA: DOUALA(J, "15:00"),
      });
      await demande("minuit", {
        statut: "decidee",
        decision: "avoir",
        montant: null,
        decideeA: DOUALA(J, "16:00"),
      });
      await demande("b2", {
        statut: "decidee",
        decision: "refuser",
        montant: 0,
        decideeA: DOUALA(J, "16:30"),
      });
      await demande("report", {
        statut: "decidee",
        decision: "reporter",
        montant: 0,
        decideeA: DOUALA(J, "16:40"),
      });
      await demande("cadence", { statut: "en_attente" });
      await demande("lendemain", {
        statut: "decidee",
        decision: "rembourser",
        montant: 5_000,
        decideeA: DOUALA(J1, "08:00"),
      });
      await demande("autreCompagnie", {
        compagnieId: compagnieB,
        statut: "decidee",
        decision: "rembourser",
        montant: 5_000,
        decideeA: DOUALA(J, "12:00"),
      });

      // Journal : arrêts annoncés puis contrôles inopinés.
      const dp = { type: "depart", id: departParti };
      await evenement(
        "chauffeur.arrivee_arret",
        DOUALA(J, "08:50"),
        { departId: departParti, arret: "Yassa", gps: null },
        dp,
      );
      await evenement(
        "chauffeur.arrivee_arret",
        DOUALA(J, "09:25"),
        { departId: departParti, arret: "Edéa", gps: null },
        dp,
      );
      await evenement(
        "chauffeur.arrivee_arret",
        DOUALA(J, "13:00"),
        { departId: departParti, arret: "Pouma", gps: null },
        dp,
      );
      const c1 = randomUUID();
      const c2 = randomUUID();
      const c3 = randomUUID();
      await evenement(
        "controle.regularise",
        DOUALA(J, "09:30"),
        { controleId: c1, billetId: randomUUID(), departId: departParti },
        { type: "billet", id: randomUUID() },
      );
      await evenement(
        "controle.regularise",
        DOUALA(J, "09:35"),
        { controleId: c1, billetId: randomUUID(), departId: departParti },
        { type: "billet", id: randomUUID() },
      );
      await evenement(
        "controle.convoyeur_signale",
        DOUALA(J, "09:40"),
        {
          controleId: c1,
          departId: departParti,
          convoyeurId: randomUUID(),
          siege: 4,
          montantDeclare: 3_000,
          note: null,
        },
        { type: "controle", id: c1 },
      );
      await evenement(
        "controle.cloture",
        DOUALA(J, "09:50"),
        { controleId: c1, departId: departParti, liste: 40, tetes: 41, ecart: 1 },
        { type: "controle", id: c1 },
      );
      await evenement(
        "controle.cloture",
        DOUALA(J, "14:00"),
        { controleId: c2, departId: departParti, liste: 40, tetes: 40, ecart: 0 },
        { type: "controle", id: c2 },
      );
      // Un contrôle sans arrêt annoncé avant lui (départ du programme), le lendemain, et chez B.
      await evenement(
        "controle.cloture",
        DOUALA(J, "10:00"),
        { controleId: c3, departId: departProgramme, liste: 1, tetes: 1, ecart: 0 },
        { type: "controle", id: c3 },
      );
      await evenement(
        "controle.cloture",
        DOUALA(J1, "09:00"),
        { controleId: randomUUID(), departId: departParti, liste: 1, tetes: 1, ecart: 0 },
        { type: "controle", id: randomUUID() },
      );
      await evenement(
        "controle.cloture",
        DOUALA(J, "09:00"),
        { controleId: randomUUID(), departId: departB, liste: 1, tetes: 1, ecart: 0 },
        { type: "controle", id: randomUUID() },
      );
      // Charges mal formées : ignorées sans faire échouer la lecture.
      await evenement(
        "controle.cloture",
        DOUALA(J, "09:00"),
        { controleId: randomUUID(), departId: "pas-un-uuid" },
        { type: "controle", id: randomUUID() },
      );
      await evenement(
        "controle.cloture",
        DOUALA(J, "09:00"),
        { departId: departParti },
        { type: "controle", id: randomUUID() },
      );
      controles = { c1, c2, c3 };
    }, 120_000);

    let controles: { c1: string; c2: string; c3: string };

    it("référentiel : compagnies actives et gares de la compagnie, dans l'ordre de création", async () => {
      const ref = new ReferentielRapportPrisma(prisma);
      const compagnies = await ref.compagnies();
      expect(compagnies.map((c) => c.nom).sort()).toEqual(["Alpha Voyages", "Beta Express"]);
      expect(await ref.compagnie(compagnieA)).toEqual({ id: compagnieA, nom: "Alpha Voyages" });
      expect(await ref.compagnie(randomUUID())).toBeNull();
      expect(await ref.compagnie("pas-un-uuid")).toBeNull();
      expect((await ref.gares(compagnieA)).map((g) => g.nom).sort()).toEqual(["Akwa", "Mvan"]);
      expect(await ref.gares(compagnieB)).toEqual([{ id: gareB, nom: "Bonabéri" }]);
      expect(await ref.gares("pas-un-uuid")).toEqual([]);
    });

    it("billets : ceux de la compagnie créés dans le jour de Douala, tous états confondus", async () => {
      const ventes = new VentesBilletsPrisma(prisma);
      const du = await ventes.duJour(compagnieA, J);
      expect(du.map((b) => b.id).sort()).toEqual(
        [
          billets["b1"],
          billets["b2"],
          billets["minuit"],
          billets["report"],
          billets["cadence"],
          billets["annule"],
        ]
          .map(String)
          .sort(),
      );
      // Bornes : 00:00:00 de J est dans J, 00:00 de J+1 et la dernière milliseconde de la veille non.
      expect(du.map((b) => b.id)).not.toContain(billets["lendemain"]);
      expect(du.map((b) => b.id)).not.toContain(billets["veille"]);
      expect(du.map((b) => b.id)).not.toContain(billets["autreCompagnie"]);
      const suivant = await ventes.duJour(compagnieA, J1);
      expect(suivant.map((b) => b.id)).toEqual([billets["lendemain"]]);
    });

    it("billets : montant, mode, canal, report, cadence et départ parti sont ceux de la base", async () => {
      const ventes = new VentesBilletsPrisma(prisma);
      const du = new Map((await ventes.duJour(compagnieA, J)).map((b) => [b.id, b]));
      expect(du.get(billets["b1"]!)).toMatchObject({
        gareId: gareA1,
        canal: "guichet",
        mode: "cash",
        montant: 5_500,
        venduA: "2026-10-10T10:00:00.000+01:00",
        etat: "paye",
        reporteDe: null,
        embarque: true,
        departParti: true,
      });
      expect(du.get(billets["b2"]!)).toMatchObject({
        gareId: gareA2,
        canal: "en_ligne",
        mode: "momo",
        venduA: "2026-10-10T23:59:59.000+01:00",
        embarque: false,
      });
      expect(du.get(billets["minuit"]!)).toMatchObject({
        canal: "convoyeur",
        mode: "orange_money",
      });
      expect(du.get(billets["report"]!)).toMatchObject({
        reporteDe: billets["b1"],
        departParti: false,
      });
      expect(du.get(billets["cadence"]!)).toMatchObject({
        mode: null,
        aCompleterAuQuai: true,
        sansNom: true,
        departParti: false,
      });
      expect(du.get(billets["annule"]!)?.etat).toBe("annule");
    });

    it("billets : une compagnie ou un jour mal formé ne lit rien", async () => {
      const ventes = new VentesBilletsPrisma(prisma);
      expect(await ventes.duJour("pas-un-uuid", J)).toEqual([]);
      expect(await ventes.duJour(compagnieA, "2026-02-30")).toEqual([]);
      expect(await ventes.duJour(randomUUID(), J)).toEqual([]);
    });

    it("colis : le montant compte le complément de poids, le mode vient du moyen de paiement", async () => {
      const activite = new ActiviteColisPrisma(prisma);
      const du = new Map((await activite.enregistresLe(compagnieA, J)).map((c) => [c.id, c]));
      expect([...du.keys()].sort()).toEqual(
        [colis["paye"], colis["guichetCash"], colis["attente"]].map(String).sort(),
      );
      expect(du.get(colis["paye"]!)).toMatchObject({
        gareId: gareA1,
        montant: 6_000,
        mode: "momo",
        creeA: "2026-10-10T09:00:00.000+01:00",
      });
      expect(du.get(colis["guichetCash"]!)).toMatchObject({
        gareId: gareA2,
        montant: 2_500,
        mode: "cash",
      });
      // Port pas encore payé : seul le complément de poids est entré, et aucun mode n'est retenu.
      expect(du.get(colis["attente"]!)).toMatchObject({ montant: 500, mode: null });
      expect(await activite.enregistresLe(compagnieA, J1)).toHaveLength(1);
      expect(await activite.enregistresLe("pas-un-uuid", J)).toEqual([]);
    });

    it("litiges : les réclamations ouvertes dans le jour sur les colis de la compagnie", async () => {
      const activite = new ActiviteColisPrisma(prisma);
      expect(await activite.litigesOuvertsLe(compagnieA, J)).toBe(2);
      expect(await activite.litigesOuvertsLe(compagnieB, J)).toBe(1);
      expect(await activite.litigesOuvertsLe(compagnieA, "2026-10-09")).toBe(1);
      expect(await activite.litigesOuvertsLe(compagnieA, J1)).toBe(0);
      expect(await activite.litigesOuvertsLe("pas-un-uuid", J)).toBe(0);
      expect(await activite.litigesOuvertsLe(compagnieA, "pas-un-jour")).toBe(0);
    });

    it("annulations : remboursées ou en avoir, décidées dans le jour, avec PIN", async () => {
      const annulations = new AnnulationsDuJourPrisma(prisma);
      const faites = await annulations.duJour(compagnieA, J);
      expect(faites).toHaveLength(2);
      expect(faites[0]).toMatchObject({
        billetId: billets["b1"],
        gareId: gareA1,
        montant: 4_500,
        avecPin: true,
        at: "2026-10-10T15:00:00.000+01:00",
      });
      expect(faites[0]?.numero).toMatch(/^ALP-DLA-261010-/);
      // Un avoir sans montant compte zéro franc rendu.
      expect(faites[1]).toMatchObject({ billetId: billets["minuit"], montant: 0 });
      expect(await annulations.duJour(compagnieA, J1)).toHaveLength(1);
      expect(await annulations.duJour(compagnieB, J)).toHaveLength(1);
      expect(await annulations.duJour("pas-un-uuid", J)).toEqual([]);
    });

    it("contrôles en route : regroupés par contrôle, lieu = dernier arrêt annoncé avant, périmètre de la compagnie", async () => {
      const lus = new ControlesEnRoutePrisma(prisma);
      const du = await lus.duJour(compagnieA, J);
      const parId = new Map(du.map((c) => [c.controleId, c]));
      expect(du).toHaveLength(3);
      expect(parId.get(controles.c1)).toEqual({
        controleId: controles.c1,
        lieu: "Edéa",
        regularisations: 2,
        ventesNonEnregistrees: 1,
      });
      // Le second contrôle a eu lieu après l'arrêt de Pouma.
      expect(parId.get(controles.c2)).toMatchObject({ lieu: "Pouma", regularisations: 0 });
      // Aucun arrêt annoncé pour ce départ : lieu vide, jamais inventé.
      expect(parId.get(controles.c3)).toMatchObject({ lieu: "", regularisations: 0 });
      expect((await lus.duJour(compagnieB, J)).length).toBe(1);
      expect((await lus.duJour(compagnieA, J1)).length).toBe(1);
      expect(await lus.duJour("pas-un-uuid", J)).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------- de bout en bout */

  describe("l'API de bout en bout, stockage PostgreSQL", () => {
    let stockageAvant: string | undefined;
    let t: AppRapportTest;
    let patron: { id: string; jeton: string };
    const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
    // Une connexion par application : fermer l'application la ferme, pas celle des autres tests.
    const nouvelleConnexion = () => new PrismaService(configTest({ DATABASE_URL: base.url }));

    beforeAll(async () => {
      stockageAvant = process.env[VARIABLE_STOCKAGE];
      process.env[VARIABLE_STOCKAGE] = "postgres";
      // Le monde du rapport : la compagnie de la planche, ses trois gares, des billets et un colis.
      const racine = nouvelleConnexion();
      await racine.compagnie.createMany({
        data: [
          { id: COMPAGNIE, code: "OME", nom: NOM_COMPAGNIE },
          { id: AUTRE_COMPAGNIE, code: "BEX", nom: "Beta Express" },
        ],
      });
      await racine.gare.createMany({
        data: [
          { id: AKWA, compagnieId: COMPAGNIE, code: "DLA", nom: "Akwa", ville: "Douala" },
          { id: MVAN, compagnieId: COMPAGNIE, code: "MVA", nom: "Mvan", ville: "Yaoundé" },
          {
            id: BAFOUSSAM,
            compagnieId: COMPAGNIE,
            code: "BAF",
            nom: "Bafoussam",
            ville: "Bafoussam",
          },
          {
            id: GARE_AUTRE,
            compagnieId: AUTRE_COMPAGNIE,
            code: "BON",
            nom: "Bonabéri",
            ville: "Douala",
          },
        ],
      });
      const ligne = randomUUID();
      const depart = randomUUID();
      await racine.ligne.create({
        data: {
          id: ligne,
          compagnieId: COMPAGNIE,
          code: "DLAMVA",
          origineGareId: AKWA,
          destinationGareId: MVAN,
          tarifClassique: 5_000,
          tarifVip: 8_000,
          tarifBagage: 500,
        },
      });
      await racine.depart.create({
        data: {
          id: depart,
          numero: "OME-DLAMVA-270105-0800",
          ligneId: ligne,
          classe: "classique",
          heureDepart: DOUALA(JOUR, "08:00"),
          etat: "parti",
        },
      });
      const heures = ["08:10", "09:20", "10:30", "11:40"];
      for (const [i, heure] of heures.entries()) {
        await racine.billet.create({
          data: {
            numero: `OME-DLA-270105-${String(i + 1).padStart(4, "0")}`,
            sequence: i + 1,
            compagnieId: COMPAGNIE,
            gareId: i < 3 ? AKWA : MVAN,
            departId: depart,
            classe: "classique",
            prix: 5_000,
            canal: i === 3 ? "en_ligne" : "guichet",
            codeBillet: String(2000 + i),
            creeA: DOUALA(JOUR, heure),
            etat: "embarque",
            embarqueA: DOUALA(JOUR, heure),
            paiement: { mode: i === 0 ? "cash" : "momo" } as never,
          },
        });
      }
      await racine.colis.create({
        data: {
          numero: "C-DLA-270105-0001",
          sequence: 1,
          gareOrigineId: AKWA,
          gareDestinationId: MVAN,
          expediteurChiffre: "x",
          expediteurTelephoneIndex: randomUUID(),
          destinataireChiffre: "y",
          destinataireTelephoneIndex: randomUUID(),
          contenu: "Colis",
          poidsKg: 3,
          valeurDeclaree: 0,
          mode: "gare",
          canal: "agence",
          codeRetraitHache: "h",
          codeRetraitSel: "s",
          prixTotal: 2_500,
          creeA: DOUALA(JOUR, "12:00"),
          etat: "enregistre",
          jour: "270105",
          compagnieId: COMPAGNIE,
          paiementEtat: "paye",
          paiementMoyen: "cash",
        },
      });
      await racine.$disconnect();

      t = await creerAppRapportTest({ prisma: nouvelleConnexion() });
      patron = await t.compte("patron");
    }, 120_000);

    afterAll(async () => {
      await t?.fermer();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    });

    it("le module utilise les adaptateurs PostgreSQL pour les six ports qu'il lit ou écrit", () => {
      expect(t.app.get(ReferentielRapport)).toBeInstanceOf(ReferentielRapportPrisma);
      expect(t.app.get(VentesBillets)).toBeInstanceOf(VentesBilletsPrisma);
      expect(t.app.get(ActiviteColis)).toBeInstanceOf(ActiviteColisPrisma);
      expect(t.app.get(AnnulationsDuJour)).toBeInstanceOf(AnnulationsDuJourPrisma);
      expect(t.app.get(ControlesEnRoute)).toBeInstanceOf(ControlesEnRoutePrisma);
      expect(t.app.get(RapportsSoir)).toBeInstanceOf(RapportsSoirPrisma);
    });

    it("avant 21 h, le rapport du jour n'est pas encore arrêté", async () => {
      const r = await t.http().get(`/patron/rapports/soir?jour=${JOUR}`).set(avec(patron.jeton));
      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ code: "RAPPORT_PAS_ENCORE" });
    });

    it("à 21 h, le rapport est calculé sur les tables, écrit une fois, et le patron le reçoit", async () => {
      t.montage.allerA(VINGT_ET_UNE_HEURES);
      const r = await t.http().get(`/patron/rapports/soir?jour=${JOUR}`).set(avec(patron.jeton));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        jour: JOUR,
        nbGares: 3,
        chiffres: { billets: 4, colis: 1, recette: 22_500, cash: 7_500, momo: 15_000 },
        enLigne: { billets: 1, partPct: 25 },
      });
      // Rangées par nombre de billets décroissant.
      expect(r.body.gares.map((g: { nom: string; billets: number }) => [g.nom, g.billets])).toEqual(
        [
          ["Akwa", 3],
          ["Mvan", 1],
          ["Bafoussam", 0],
        ],
      );
      const { rows } = await sql.query(
        `SELECT "genereA", jour::text AS jour, rapport FROM rapport_soir WHERE "compagnieId" = $1`,
        [COMPAGNIE],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].jour).toBe(JOUR);
      expect(rows[0].rapport.chiffres.recette).toBe(22_500);
    });

    it("un second appel renvoie le rapport figé : une vente tardive ne le change pas", async () => {
      const prisma2 = nouvelleConnexion();
      try {
        await prisma2.billet.create({
          data: {
            numero: "OME-DLA-270105-0900",
            sequence: 900,
            compagnieId: COMPAGNIE,
            gareId: AKWA,
            departId: (await prisma2.depart.findFirstOrThrow()).id,
            classe: "classique",
            prix: 9_000,
            canal: "guichet",
            codeBillet: "9999",
            creeA: DOUALA(JOUR, "22:30"),
            etat: "paye",
          },
        });
      } finally {
        await prisma2.$disconnect();
      }
      const r = await t.http().get(`/patron/rapports/soir?jour=${JOUR}`).set(avec(patron.jeton));
      expect(r.status).toBe(200);
      expect(r.body.chiffres.billets).toBe(4);
      expect(r.body.chiffres.recette).toBe(22_500);
    });

    it("deux instances qui arrêtent le rapport en même temps n'en écrivent qu'un", async () => {
      // Le lendemain, deux services construits sur la même base mais deux connexions distinctes.
      const jour = "2027-01-06";
      const connexions = [nouvelleConnexion(), nouvelleConnexion()];
      try {
        const rapports = connexions.map((c) => new RapportsSoirPrisma(c));
        const resultats = await Promise.all(
          rapports.flatMap((r, i) =>
            Array.from({ length: 6 }, (_, k) =>
              r.creer(
                unStocke({
                  compagnieId: COMPAGNIE,
                  jour,
                  genereA: `${jour}T21:00:00.0${i}${k}+01:00`,
                }),
              ),
            ),
          ),
        );
        expect(resultats.filter((r) => r.nouveau)).toHaveLength(1);
        const { rows } = await sql.query(
          `SELECT count(*)::int AS n FROM rapport_soir WHERE "compagnieId" = $1 AND jour = $2`,
          [COMPAGNIE, jour],
        );
        expect(rows[0].n).toBe(1);
      } finally {
        await Promise.all(connexions.map((c) => c.$disconnect()));
      }
    });

    it("un patron d'une autre compagnie ne lit pas ce rapport", async () => {
      const autre = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
      const r = await t.http().get(`/patron/rapports/soir?jour=${JOUR}`).set(avec(autre.jeton));
      expect(r.status).toBe(200);
      expect(r.body.chiffres.billets).toBe(0);
      expect(r.body.nbGares).toBe(1);
    });
  });
});
