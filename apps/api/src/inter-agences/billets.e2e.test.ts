import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALPHA,
  D_ALPHA_YDE,
  D_BETA,
  D_OMEGA,
  D_OMEGA_SUIVANT,
  D_OMEGA_TROP_TOT,
  OMEGA,
  allerA,
  creerAppInterAgencesTest,
  dernierSmsA,
  entete,
  type AppInterAgencesTest,
} from "./testing/app-inter-agences-test";

const NUMERO = "ALP-YDE-261102-0142";
const LUNDI_08H = "2026-11-09T08:00:00.000+01:00";

describe("billets voyageurs en correspondance : 25 minutes garanties, 15 minutes d'attente, replacement gratuit", () => {
  let t: AppInterAgencesTest;
  let conventionId: string;

  beforeEach(async () => {
    t = await creerAppInterAgencesTest();
    conventionId = await t.conventionEnVigueur();
  });
  afterEach(async () => {
    await t.fermer();
  });

  const equiper = (departId: string, billet = NUMERO, jeton = t.equipe.guichetierAlpha.jeton) =>
    t.http().post("/inter-agences/billets").set(entete(jeton)).send({ billet, departId });

  const embarquer = (jeton: string, reference: string, rang: number) =>
    t
      .http()
      .post(`/inter-agences/billets/${reference}/embarquements`)
      .set(entete(jeton))
      .send({ rang });

  const arrivee = (jeton: string, reference: string, arriveeLe: string) =>
    t
      .http()
      .post(`/inter-agences/billets/${reference}/arrivee-premier-bus`)
      .set(entete(jeton))
      .send({ arriveeLe });

  describe("équiper un billet vendu d'un second tronçon", () => {
    it("le billet garde son numéro, les parts suivent la convention (4 000 F / 3 000 F sur 7 000 F)", async () => {
      t.vendreBillet();
      const rep = await equiper(D_OMEGA.id);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      expect(rep.body).toMatchObject({ numero: NUMERO, conventionId, voyageur: "Ngo Aïcha" });
      expect(rep.body.troncons).toEqual([
        {
          rang: 1,
          compagnie: "Alpha",
          trajet: "Yaoundé → Bafoussam",
          depart: D_ALPHA_YDE.heureDepart,
          bus: D_ALPHA_YDE.bus,
          arrivee: D_ALPHA_YDE.arriveePrevue,
          part: 4000,
          etat: "prevu",
          embarqueLe: null,
        },
        {
          rang: 2,
          compagnie: "Oméga",
          trajet: "Bafoussam → Bamenda",
          depart: D_OMEGA.heureDepart,
          bus: D_OMEGA.bus,
          arrivee: D_OMEGA.arriveePrevue,
          part: 3000,
          etat: "prevu",
          embarqueLe: null,
        },
      ]);
      expect(rep.body.arriveePremierBus).toBeNull();
      expect(rep.body.replacement).toBeNull();
    });

    it("moins de 25 minutes entre les deux bus : 422, rien n'est enregistré", async () => {
      t.vendreBillet();
      const rep = await equiper(D_OMEGA_TROP_TOT.id);
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("correspondance_trop_courte");
      expect(rep.body.message).toContain("25");
      expect(await t.billetsRepo.trouverParNumero(NUMERO)).toBeNull();
    });

    it("exactement 25 minutes : accepté", async () => {
      t.vendreBillet();
      t.departs.departs.set("dep-ome-1525", {
        ...D_OMEGA,
        id: "dep-ome-1525",
        heureDepart: "2026-11-02T15:25:00.000+01:00",
      });
      expect((await equiper("dep-ome-1525")).status).toBe(201);
    });

    it("un trajet que la convention ne prévoit pas : 422 ligne_non_prevue", async () => {
      t.vendreBillet({ departId: D_ALPHA_YDE.id });
      t.departs.departs.set("dep-ome-baf-nkongsamba", {
        ...D_OMEGA,
        id: "dep-ome-baf-nkongsamba",
        destination: "Nkongsamba",
      });
      const rep = await equiper("dep-ome-baf-nkongsamba");
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("ligne_non_prevue");
    });

    it("le premier tronçon est celui de la compagnie qui vend : un billet d'Oméga sur un bus d'Alpha est inconnu", async () => {
      t.vendreBillet({ compagnieId: OMEGA, departId: D_ALPHA_YDE.id });
      const rep = await equiper(D_OMEGA.id, NUMERO, t.equipe.guichetierOmega.jeton);
      expect(rep.status).toBe(404);
    });

    it("sans convention avec la compagnie du second bus : 422 pas_de_convention", async () => {
      t.vendreBillet();
      t.departs.departs.set("dep-bet-1600", {
        ...D_BETA,
        origine: "Bafoussam",
        destination: "Bamenda",
      });
      const rep = await equiper(D_BETA.id);
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("pas_de_convention");
    });

    it("un billet annulé ou inconnu ne s'équipe pas ; un billet d'une autre compagnie est inconnu : 404", async () => {
      t.vendreBillet({ annule: true });
      const annule = await equiper(D_OMEGA.id);
      expect(annule.status).toBe(409);
      expect(annule.body.code).toBe("billet_annule");

      const inconnu = await equiper(D_OMEGA.id, "ALP-XXX-000000-0000");
      expect(inconnu.status).toBe(404);

      const autre = await equiper(D_OMEGA.id, NUMERO, t.equipe.guichetierOmega.jeton);
      expect(autre.status).toBe(404);
    });

    it("un billet ne s'équipe qu'une fois : 409", async () => {
      t.vendreBillet();
      await equiper(D_OMEGA.id);
      const rep = await equiper(D_OMEGA.id);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("deja_enregistre");
    });
  });

  describe("embarquement", () => {
    async function billetEquipe() {
      t.vendreBillet();
      const rep = await equiper(D_OMEGA.id);
      return rep.body.id as string;
    }

    it("chaque compagnie fait monter le voyageur dans son bus, dans l'ordre", async () => {
      const id = await billetEquipe();
      const trop_tot = await embarquer(t.equipe.convoyeurOmega.jeton, id, 2);
      expect(trop_tot.status).toBe(409);
      expect(trop_tot.body.code).toBe("troncon_precedent");

      const premier = await embarquer(t.equipe.convoyeurAlpha.jeton, id, 1);
      expect(premier.status, JSON.stringify(premier.body)).toBe(200);
      expect(premier.body.troncons[0]).toMatchObject({
        etat: "embarque",
        embarqueLe: "2026-11-02T09:00:00.000+01:00",
      });

      const second = await embarquer(t.equipe.convoyeurOmega.jeton, id, 2);
      expect(second.status).toBe(200);
      expect(second.body.troncons[1].etat).toBe("embarque");
    });

    it("on ne fait pas monter le voyageur dans le bus d'une autre compagnie : 403", async () => {
      const id = await billetEquipe();
      const rep = await embarquer(t.equipe.convoyeurOmega.jeton, id, 1);
      expect(rep.status).toBe(403);
      expect(rep.body.code).toBe("pas_votre_troncon");
    });

    it("rejouer l'embarquement ne change pas l'heure et ne double rien", async () => {
      const id = await billetEquipe();
      const a = await embarquer(t.equipe.convoyeurAlpha.jeton, id, 1);
      t.horloge.avancer(60_000);
      const b = await embarquer(t.equipe.convoyeurAlpha.jeton, id, 1);
      expect(b.body.troncons[0].embarqueLe).toBe(a.body.troncons[0].embarqueLe);
      const traces = t.auditRepo.lignes.filter((l) => l.action === "inter_agences.billet_embarque");
      expect(traces).toHaveLength(1);
    });

    it("tronçon inconnu : 422 ; billet inconnu ou d'une troisième compagnie : 404", async () => {
      const id = await billetEquipe();
      expect((await embarquer(t.equipe.convoyeurAlpha.jeton, id, 3)).status).toBe(422);
      expect((await embarquer(t.equipe.convoyeurBeta.jeton, id, 1)).status).toBe(404);
      expect((await embarquer(t.equipe.convoyeurAlpha.jeton, "inconnu", 1)).status).toBe(404);
    });

    it("le billet se lit par identifiant ou par numéro, par les deux compagnies seulement", async () => {
      const id = await billetEquipe();
      for (const reference of [id, NUMERO]) {
        for (const jeton of [t.equipe.patronAlpha.jeton, t.equipe.patronOmega.jeton]) {
          const rep = await t.http().get(`/inter-agences/billets/${reference}`).set(entete(jeton));
          expect(rep.status).toBe(200);
          expect(rep.body.id).toBe(id);
        }
        const beta = await t
          .http()
          .get(`/inter-agences/billets/${reference}`)
          .set(entete(t.equipe.patronBeta.jeton));
        expect(beta.status).toBe(404);
      }
      const liste = await t
        .http()
        .get("/inter-agences/billets")
        .set(entete(t.equipe.patronOmega.jeton));
      expect(liste.body.billets.map((b: { id: string }) => b.id)).toEqual([id]);
      const listeBeta = await t
        .http()
        .get("/inter-agences/billets")
        .set(entete(t.equipe.patronBeta.jeton));
      expect(listeBeta.body.billets).toEqual([]);
    });
  });

  describe("arrivée du premier bus", () => {
    async function billetEmbarque() {
      t.vendreBillet();
      const id = (await equiper(D_OMEGA.id)).body.id as string;
      await embarquer(t.equipe.convoyeurAlpha.jeton, id, 1);
      return id;
    }

    it("à l'heure : le voyageur monte dans le second bus, aucun SMS", async () => {
      const id = await billetEmbarque();
      const avant = t.sms.messages().length;
      const rep = await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T15:35:00.000+01:00");
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body.issue).toEqual({ type: "a_l_heure" });
      expect(rep.body.billet.replacement).toBeNull();
      expect(t.sms.messages().length).toBe(avant);
    });

    it("jusqu'à 15 minutes de retard : le second bus attend, le voyageur est prévenu", async () => {
      const id = await billetEmbarque();
      const rep = await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T15:55:00.000+01:00");
      expect(rep.body.issue).toEqual({ type: "attente", minutes: 15 });
      expect(rep.body.billet.replacement).toBeNull();
      expect(rep.body.billet.arriveePremierBus).toEqual({
        a: "2026-11-02T15:55:00.000+01:00",
        par: expect.any(String),
        retardMinutes: 15,
      });
      expect(dernierSmsA(t, "+237691221008")).toContain(NUMERO);
      expect(dernierSmsA(t, "+237691221008")).toContain("15");
    });

    it("16 minutes de retard : replacement gratuit sur le départ suivant, à la charge du retardataire", async () => {
      const id = await billetEmbarque();
      const rep = await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T15:56:00.000+01:00");
      expect(rep.body.issue).toEqual({ type: "replacement", retardMinutes: 16 });
      expect(rep.body.billet.replacement).toEqual({
        decideLe: expect.any(String),
        heureDepart: D_OMEGA_SUIVANT.heureDepart,
        bus: D_OMEGA_SUIVANT.bus,
        retardataire: "Alpha",
      });
      expect(rep.body.billet.troncons[1]).toMatchObject({
        depart: D_OMEGA_SUIVANT.heureDepart,
        bus: D_OMEGA_SUIVANT.bus,
        etat: "replace",
      });
      expect(dernierSmsA(t, "+237691221008")).toMatch(/replacé gratuitement/);
    });

    it("sans départ suivant à replacer : 409, rien ne change", async () => {
      const id = await billetEmbarque();
      t.departs.departs.delete(D_OMEGA_SUIVANT.id);
      const rep = await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T17:00:00.000+01:00");
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("aucun_depart_suivant");
      expect((await t.billetsRepo.trouver(id))?.arriveePremierBus).toBeNull();
    });

    it("la décision ne se prend qu'une fois : rejouer rend la même issue, sans second SMS", async () => {
      const id = await billetEmbarque();
      await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T16:30:00.000+01:00");
      const sms = t.sms.messages().length;
      const rejeu = await arrivee(
        t.equipe.convoyeurOmega.jeton,
        id,
        "2026-11-02T15:00:00.000+01:00",
      );
      expect(rejeu.status).toBe(200);
      expect(rejeu.body.issue.type).toBe("replacement");
      expect(t.sms.messages().length).toBe(sms);
      expect(
        t.auditRepo.lignes.filter((l) => l.action === "inter_agences.correspondance_constatee"),
      ).toHaveLength(1);
    });

    it("avant que le voyageur soit monté dans le premier bus : 409", async () => {
      t.vendreBillet();
      const id = (await equiper(D_OMEGA.id)).body.id as string;
      const rep = await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T15:00:00.000+01:00");
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("pas_embarque");
    });

    it("une heure illisible : 400 ; une troisième compagnie : 404", async () => {
      const id = await billetEmbarque();
      expect((await arrivee(t.equipe.convoyeurOmega.jeton, id, "bientôt")).status).toBe(400);
      expect(
        (await arrivee(t.equipe.convoyeurBeta.jeton, id, "2026-11-02T15:00:00.000+01:00")).status,
      ).toBe(404);
    });
  });

  describe("effets sur le règlement du lundi", () => {
    it("un voyageur monté dans les deux bus : Alpha doit 3 000 F à Oméga", async () => {
      t.vendreBillet();
      const id = (await equiper(D_OMEGA.id)).body.id as string;
      await embarquer(t.equipe.convoyeurAlpha.jeton, id, 1);
      await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T15:35:00.000+01:00");
      await embarquer(t.equipe.convoyeurOmega.jeton, id, 2);

      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 1 });
      expect([...t.operateur.envoyes.values()][0]).toMatchObject({
        montant: 3000,
        debiteur: { compagnieId: ALPHA },
        creancier: { compagnieId: OMEGA },
      });
    });

    it("un voyageur qui rate la correspondance : le siège perdu est payé par le retardataire, en plus du trajet de remplacement", async () => {
      t.vendreBillet();
      const id = (await equiper(D_OMEGA.id)).body.id as string;
      await embarquer(t.equipe.convoyeurAlpha.jeton, id, 1);
      await arrivee(t.equipe.convoyeurOmega.jeton, id, "2026-11-02T16:30:00.000+01:00");
      // Avant l'embarquement de remplacement : seule la pénalité est due.
      expect(
        contrats.SchemaReglementHebdo.parse(
          (await t.http().get("/inter-agences/reglement").set(entete(t.equipe.patronOmega.jeton)))
            .body,
        ).soldeNet,
      ).toBe(3000);
      allerA(t, "2026-11-03T08:05:00.000+01:00");
      await embarquer(t.equipe.convoyeurOmega.jeton, id, 2);
      const r = contrats.SchemaReglementHebdo.parse(
        (await t.http().get("/inter-agences/reglement").set(entete(t.equipe.patronOmega.jeton)))
          .body,
      );
      expect(r.soldeNet).toBe(6000);
    });
  });

  describe("les lignes voyageurs de la convention", () => {
    it("la route des correspondances donne l'origine du billet : de où à où, via quelle ville, quelle compagnie en premier", async () => {
      const rep = await t
        .http()
        .get("/inter-agences/correspondances")
        .set(entete(t.equipe.patronOmega.jeton));
      expect(rep.status).toBe(200);
      expect(rep.body.lignes).toEqual([
        expect.objectContaining({
          conventionId,
          origine: "Yaoundé",
          via: "Bafoussam",
          destination: "Bamenda",
          premiere: "Alpha",
          seconde: "Oméga",
          garantieMinutes: 25,
          attenteMinutes: 15,
        }),
      ]);
      const beta = await t
        .http()
        .get("/inter-agences/correspondances")
        .set(entete(t.equipe.patronBeta.jeton));
      expect(beta.body.lignes).toEqual([]);
    });
  });
});
