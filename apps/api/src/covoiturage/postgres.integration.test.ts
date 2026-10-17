import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { PrismaService } from "../socle/db/prisma.service";
import { configTest } from "../socle/testing/app-test";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import {
  DemandesMemoire,
  DossiersMemoire,
  NotesMemoire,
  ReservationsMemoire,
  TrajetsMemoire,
  TrajetsReguliersMemoire,
  VersementsMemoire,
} from "./memoire";
import {
  DemandesPrisma,
  DossiersPrisma,
  NotesPrisma,
  ReferentielLignesPrisma,
  ReservationsPrisma,
  TrajetsPrisma,
  TrajetsReguliersPrisma,
  VersementsPrisma,
} from "./postgres";
import {
  contratPortsCovoiturage,
  unTrajet,
  uneReservation,
  unVersement,
} from "./testing/contrat-ports";

/**
 * Adaptateurs PostgreSQL du covoiturage : le même contrat sur la mémoire (toujours) et sur PostgreSQL
 * (avec DATABASE_URL_TEST), puis ce que seule la base garantit, et le référentiel.
 */

contratPortsCovoiturage("contrat · covoiturage en mémoire", async () => ({
  trajets: new TrajetsMemoire(),
  reservations: new ReservationsMemoire(),
  dossiers: new DossiersMemoire(),
  versements: new VersementsMemoire(),
  demandes: new DemandesMemoire(),
  notes: new NotesMemoire(),
  reguliers: new TrajetsReguliersMemoire(),
  personne: async () => randomUUID(),
  fermer: async () => undefined,
}));

describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · covoiturage", () => {
  let base: BaseDeTest;
  let sql: Client;
  let prisma: PrismaService;
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

  contratPortsCovoiturage("contrat · covoiturage PostgreSQL", async () => ({
    trajets: new TrajetsPrisma(prisma),
    reservations: new ReservationsPrisma(prisma),
    dossiers: new DossiersPrisma(prisma),
    versements: new VersementsPrisma(prisma),
    demandes: new DemandesPrisma(prisma),
    notes: new NotesPrisma(prisma),
    reguliers: new TrajetsReguliersPrisma(prisma),
    personne,
    fermer: async () => undefined,
  }));

  describe("ce que la base garantit seule", () => {
    async function reservationEnBase() {
      const trajets = new TrajetsPrisma(prisma);
      const reservations = new ReservationsPrisma(prisma);
      const t = unTrajet(await personne());
      await trajets.creer(t);
      const r = uneReservation(t, await personne());
      await reservations.reserver(r, t.places, new Date("2027-01-10T08:00:00.000Z"));
      return { t, r };
    }

    it("deux réservations en cours du même passager sur un trajet : la base refuse la deuxième", async () => {
      const { t, r } = await reservationEnBase();
      const autre = uneReservation(t, r.passagerId);
      expect(
        await erreurSql(
          `INSERT INTO reservation_covoiturage (id, "trajetId", "conducteurId", "passagerId", places,
             "prixParPlace", "fraisParPlace", libelle, statut, "creeA", "expireA", "departA", "liberationAutoA")
           VALUES ($1, $2, $3, $4, 1, 4000, 250, 'x', 'payee', now(), now(), now(), now())`,
          [autre.id, t.id, t.conducteurId, r.passagerId],
        ),
      ).toMatch(/reservation_covoiturage_une_en_cours/);
      // Une réservation annulée ne compte pas : le passager peut réserver de nouveau.
      await sql.query(`UPDATE reservation_covoiturage SET statut = 'annulee' WHERE id = $1`, [
        r.id,
      ]);
      expect(
        await erreurSql(
          `INSERT INTO reservation_covoiturage (id, "trajetId", "conducteurId", "passagerId", places,
             "prixParPlace", "fraisParPlace", libelle, statut, "creeA", "expireA", "departA", "liberationAutoA")
           VALUES ($1, $2, $3, $4, 1, 4000, 250, 'x', 'payee', now(), now(), now(), now())`,
          [autre.id, t.id, t.conducteurId, r.passagerId],
        ),
      ).toBe("");
    });

    it("un versement par réservation, même par SQL direct", async () => {
      const { t, r } = await reservationEnBase();
      const versements = new VersementsPrisma(prisma);
      expect(await versements.creer(unVersement(r.id, t.conducteurId))).toBe(true);
      expect(
        await erreurSql(
          `INSERT INTO versement_covoiturage (id, "reservationId", "conducteurId", montant, motif, statut, "creeA")
           VALUES ($1, $2, $3, 100, 'delai_depasse', 'a_faire', now())`,
          [randomUUID(), r.id, t.conducteurId],
        ),
      ).toMatch(/reservationId/);
    });

    it("refuse les valeurs hors vocabulaire et les quantités absurdes", async () => {
      const { t, r } = await reservationEnBase();
      expect(
        await erreurSql(`UPDATE reservation_covoiturage SET statut = 'inconnu' WHERE id = $1`, [
          r.id,
        ]),
      ).toMatch(/reservation_covoiturage_statut_connu/);
      expect(
        await erreurSql(`UPDATE reservation_covoiturage SET places = 0 WHERE id = $1`, [r.id]),
      ).toMatch(/reservation_covoiturage_quantites/);
      expect(
        await erreurSql(
          `UPDATE reservation_covoiturage SET "remboursementPrix" = 100 WHERE id = $1`,
          [r.id],
        ),
      ).toMatch(/reservation_covoiturage_remboursement_complet/);
      expect(
        await erreurSql(`UPDATE trajet_covoiturage SET statut = 'efface' WHERE id = $1`, [t.id]),
      ).toMatch(/trajet_covoiturage_statut_connu/);
      expect(
        await erreurSql(`UPDATE trajet_covoiturage SET places = 0 WHERE id = $1`, [t.id]),
      ).toMatch(/trajet_covoiturage_quantites/);
    });

    it("une note va de 1 à 5, un trajet régulier a une vraie heure", async () => {
      const { t, r } = await reservationEnBase();
      expect(
        await erreurSql(
          `INSERT INTO note_covoiturage (id, "reservationId", "noteId", "roleNote", "auteurId", valeur, "creeA")
           VALUES ($1, $2, $3, 'conducteur', $4, 6, now())`,
          [randomUUID(), r.id, t.conducteurId, r.passagerId],
        ),
      ).toMatch(/note_covoiturage_valeur/);
      expect(
        await erreurSql(
          `INSERT INTO trajet_regulier_passager ("voyageurId", ville, "departPoint", "arriveePoint", "departA", actif, "modifieA")
           VALUES ($1, 'Douala', 'a', 'b', '25:99', true, now())`,
          [r.passagerId],
        ),
      ).toMatch(/trajet_regulier_passager_heure/);
    });

    it("un trajet appartient à un compte qui existe, et un véhicule est complet ou absent", async () => {
      expect(
        await erreurSql(
          `INSERT INTO trajet_covoiturage (id, "conducteurId", type, "departVille", "departVilleNorm", "departPoint",
             "arriveeVille", "arriveeVilleNorm", "arriveePoint", "departA", "dureeMinutes", places, "prixParPlace",
             vehicule, immatriculation, statut, "creeA")
           VALUES ($1, $2, 'ville', 'a', 'a', 'a', 'b', 'b', 'b', now(), 10, 2, 100, 'v', 'i', 'publie', now())`,
          [randomUUID(), randomUUID()],
        ),
      ).toMatch(/trajet_covoiturage_conducteur_fkey/);
      const c = await personne();
      expect(
        await erreurSql(
          `INSERT INTO dossier_conducteur ("conducteurId", "vehiculeMarque", "creeA", "modifieA") VALUES ($1, 'Toyota', now(), now())`,
          [c],
        ),
      ).toMatch(/dossier_conducteur_vehicule_complet/);
    });

    it("une personne ne s'efface pas tant qu'elle a un trajet (pas de cascade)", async () => {
      const { t } = await reservationEnBase();
      expect(await erreurSql(`DELETE FROM personne WHERE id = $1`, [t.conducteurId])).not.toBe("");
    });
  });

  describe("référentiel des lignes", () => {
    it("connaît les villes des gares du réseau, par code ou par nom, et le conseil Douala ↔ Kribi", async () => {
      const referentiel = new ReferentielLignesPrisma(prisma);
      const c = await fx.compagnie();
      await fx.gare(c.id, { code: "EBA", nom: "Gare d'Ebolowa", ville: "Ébolowa" });
      expect(await referentiel.ville("EBA")).toBe("Ébolowa");
      expect(await referentiel.ville("ebolowa")).toBe("Ébolowa");
      expect(await referentiel.ville("KRIBI")).toBe("Kribi");
      expect(await referentiel.ville("Atlantis")).toBeNull();
      expect(await referentiel.ville("  ")).toBeNull();
      const conseil = { prix: { min: 3500, max: 4500 }, dureeMinutes: 150 };
      expect(await referentiel.conseil("Douala", "Kribi")).toEqual(conseil);
      expect(await referentiel.conseil("kribi", "DOUALA")).toEqual(conseil);
      expect(await referentiel.conseil("Douala", "Yaoundé")).toBeNull();
      expect(await referentiel.conseil("Douala", "Douala")).toBeNull();
    });
  });
});
