import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VerificationPortsColis } from "./colis.module";
import { NotificationsColis, NumerotationColis } from "./ports";
import { creerAppColisTest, dernierSmsA, type AppColisTest } from "./testing/app-colis-test";
import {
  amenerJusquaDisponible,
  creerColisApp,
  creerEquipe,
  type Equipe,
} from "./testing/scenarios";

const JOUR = 24 * 3600_000;

describe("tâches de fond des colis", () => {
  let t: AppColisTest;
  let e: Equipe;

  beforeEach(async () => {
    t = await creerAppColisTest();
    e = await creerEquipe(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  const neuf = (over: Record<string, unknown> = {}) =>
    creerColisApp(t, e, { photoRef: `photos/colis-${randomUUID()}.jpg`, ...over });

  describe("suppression des photos à 90 jours", () => {
    it("garde la photo à 89 jours, la supprime (fichier puis trace) à 90 jours, une seule fois", async () => {
      const colis = await neuf({ photoRef: "photos/a-supprimer.jpg" });
      t.fichiers.presents.add("photos/a-supprimer.jpg");

      t.horloge.avancer(89 * JOUR);
      expect(await t.taches.purgerPhotos()).toBe(0);
      expect(t.fichiers.presents.has("photos/a-supprimer.jpg")).toBe(true);

      t.horloge.avancer(JOUR);
      expect(await t.taches.purgerPhotos()).toBe(1);
      expect(t.fichiers.presents.has("photos/a-supprimer.jpg")).toBe(false);
      const photo = (await t.photos.parColis(colis.colisId))[0];
      expect(photo).toMatchObject({
        ref: "photos/a-supprimer.jpg",
        supprimeeA: "2027-01-31T09:00:00.000+01:00",
      });

      expect(await t.taches.purgerPhotos()).toBe(0);
      expect(t.fichiers.supprimes).toEqual(["photos/a-supprimer.jpg"]);
    });

    it("reprend au prochain passage quand le stockage de fichiers échoue", async () => {
      await neuf({ photoRef: "photos/fragile.jpg" });
      t.horloge.avancer(91 * JOUR);
      const supprimer = t.fichiers.supprimer.bind(t.fichiers);
      t.fichiers.supprimer = async () => {
        throw new Error("stockage injoignable");
      };
      expect(await t.taches.purgerPhotos()).toBe(0);
      expect((await t.photos.trouver("photos/fragile.jpg"))?.supprimeeA).toBeNull();

      t.fichiers.supprimer = supprimer;
      expect(await t.taches.purgerPhotos()).toBe(1);
      expect((await t.photos.trouver("photos/fragile.jpg"))?.supprimeeA).not.toBeNull();
    });

    it("garde chaque photo 90 jours depuis sa propre prise (remise comprise)", async () => {
      const colis = await neuf({ photoRef: "photos/envoi-a.jpg" });
      await amenerJusquaDisponible(t, e, colis.colisId);
      t.horloge.avancer(60 * JOUR);
      await t
        .http()
        .post("/agence/colis/scans")
        .set({ Authorization: `Bearer ${e.guichetierBaf.jeton}` })
        .send({
          colisId: colis.colisId,
          action: "remettre",
          code: colis.code,
          pieceVerifiee: true,
          photoRef: "photos/remise-a.jpg",
        });
      t.horloge.avancer(35 * JOUR); // 95 jours après l'envoi, 35 après la remise
      expect(await t.taches.purgerPhotos()).toBe(1);
      expect((await t.photos.trouver("photos/envoi-a.jpg"))?.supprimeeA).not.toBeNull();
      expect((await t.photos.trouver("photos/remise-a.jpg"))?.supprimeeA).toBeNull();
    });
  });

  describe("colis non retirés après 7 jours de garde", () => {
    it("les marque à 7 jours pile, prévient l'expéditeur et le destinataire, puis les laisse tranquilles", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);

      t.horloge.avancer(7 * JOUR - 60_000);
      expect(await t.taches.marquerNonRetires()).toBe(0);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");

      t.horloge.avancer(60_000);
      expect(await t.taches.marquerNonRetires()).toBe(1);
      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke?.etat).toBe("non_retire");
      expect(stocke?.historique.at(-1)).toMatchObject({
        action: "marquer_non_retire",
        motif: "garde de 7 jours écoulée",
      });
      expect(dernierSmsA(t, "+237691221008")).toContain("n'a pas été retiré dans les 7 jours");
      expect(dernierSmsA(t, "+237699401822")).toContain("va être retourné");
      expect(await t.taches.marquerNonRetires()).toBe(0);
    });

    it("n'y touche pas s'il a été remis à temps, et laisse les colis encore en route", async () => {
      const remis = await neuf();
      await amenerJusquaDisponible(t, e, remis.colisId);
      const reponse = await t
        .http()
        .post("/agence/colis/scans")
        .set({ Authorization: `Bearer ${e.guichetierBaf.jeton}` })
        .send({
          colisId: remis.colisId,
          action: "remettre",
          code: remis.code,
          pieceVerifiee: true,
          photoRef: "photos/remise-b.jpg",
        });
      expect(reponse.status).toBe(200);
      const enRoute = await neuf();
      await t
        .http()
        .post("/agence/colis/scans")
        .set({ Authorization: `Bearer ${e.guichetier.jeton}` })
        .send({ colisId: enRoute.colisId, action: "charger" });

      t.horloge.avancer(30 * JOUR);
      expect(await t.taches.marquerNonRetires()).toBe(0);
      expect((await t.repo.trouver(remis.colisId))?.etat).toBe("remis");
      expect((await t.repo.trouver(enRoute.colisId))?.etat).toBe("charge");
    });
  });

  describe("assurances et codes en attente", () => {
    it("souscrit l'assurance que l'assureur n'avait pas pu enregistrer", async () => {
      t.assureur.indisponible = true;
      const colis = await neuf();
      expect((await t.repo.trouver(colis.colisId))?.assurance).toEqual({
        police: null,
        enAttente: true,
      });
      expect(await t.taches.rejouerAssurances()).toBe(0);

      t.assureur.indisponible = false;
      expect(await t.taches.rejouerAssurances()).toBe(1);
      const assurance = (await t.repo.trouver(colis.colisId))?.assurance;
      expect(assurance?.police).toMatch(/^POL-/);
      expect(assurance?.enAttente).toBe(false);
      expect(await t.taches.rejouerAssurances()).toBe(0);
      expect(t.assureur.polices.filter((p) => p.numeroColis === colis.numero)).toHaveLength(1);
    });

    it("renvoie le code que le SMS n'avait pas pu porter, sans le donner à personne d'autre", async () => {
      const original = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("opérateur en panne");
      };
      const colis = await neuf();
      t.sms.envoyer = original;
      expect(t.sms.messages().some((m) => m.message.includes(colis.code))).toBe(false);

      expect(await t.taches.renvoyerCodes()).toBe(1);
      const portent = t.sms.messages().filter((m) => m.message.includes(colis.code));
      expect(portent.map((m) => m.telephone)).toEqual(["+237699401822"]);
      expect(await t.taches.renvoyerCodes()).toBe(0);
    });

    it("toutExecuter lance les quatre tâches et rend leurs comptes", async () => {
      const colis = await neuf({ photoRef: "photos/tout.jpg" });
      await amenerJusquaDisponible(t, e, colis.colisId);
      t.horloge.avancer(91 * JOUR);
      expect(await t.taches.toutExecuter()).toEqual({
        photosSupprimees: 1,
        colisNonRetires: 1,
        assurancesSouscrites: 0,
        codesRenvoyes: 0,
      });
    });
  });

  describe("garde-fou de production", () => {
    it("accepte les ports en mémoire hors production", () => {
      const verif = t.app.get(VerificationPortsColis);
      expect(() => verif.onModuleInit()).not.toThrow();
    });

    it("refuse de démarrer en production avec des ports en mémoire, en les nommant", () => {
      const verif = new VerificationPortsColis(
        { ...t.config, env: "production" },
        t.repo,
        t.photos,
        t.fichiers,
        t.reclamationsRepo,
        t.app.get(NumerotationColis),
        t.analyse,
        t.paiements,
        t.assureur,
        t.app.get(NotificationsColis),
        t.diffusion,
        t.referentiel,
      );
      expect(() => verif.onModuleInit()).toThrow(/ColisRepository.*PhotosColis.*FichiersPhotos/s);
      expect(() => verif.onModuleInit()).toThrow(/README\.md/);
    });
  });
});
