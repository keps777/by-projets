import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import type { Vente } from "./modele";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEMAIN,
  DEPART_ALPHA,
  DEPART_ELITE_VIP,
  DEPART_PETIT,
  JOUR,
  creerAppVendeursTest,
  heure,
  type AppVendeursTest,
} from "./testing/app-vendeurs-test";
import { uneVente } from "./testing/fabrique";

const douala = (jour: string, hhmm: string) => `${jour}T${hhmm}:00.000+01:00`;

describe("vendeurs : l'espace, les départs à vendre et les clients", () => {
  let t: AppVendeursTest;

  beforeEach(async () => {
    t = await creerAppVendeursTest({ reglement: "memoire" });
  });
  afterEach(async () => {
    await t.fermer();
  });

  /** Ajoute à l'historique d'un vendeur une vente terminée à un voisin, comme si elle avait eu lieu. */
  function historique(vendeurId: string, surcharge: Partial<Vente>): Vente {
    const chiffrement = t.app.get(ChiffrementService);
    const telephone = surcharge.voisin?.telephone ?? "+237670123456";
    const vente = uneVente({
      vendeurId,
      compagnieId: COMPAGNIE,
      voisinIndex: chiffrement.indexAveugle(telephone, "vendeur.voisin"),
      ...surcharge,
    });
    t.ventes.lignes.set(vente.id, vente);
    return vente;
  }

  const get = (chemin: string, jeton: string) => t.http().get(chemin).set(t.avec(jeton));

  describe("l'espace du vendeur", () => {
    it("sa fiche, ses agences et la règle d'or, au format du contrat", async () => {
      const v = await t.creerVendeur({ nom: "Nadège", compagnies: [COMPAGNIE, AUTRE_COMPAGNIE] });
      const rep = await get("/vendeurs/moi", v.jeton);
      expect(rep.status).toBe(200);
      expect(() => contrats.SchemaEspaceVendeur.parse(rep.body)).not.toThrow();
      expect(rep.body.vendeur).toEqual({
        id: v.id,
        nom: "Nadège",
        numero: v.numero,
        quartier: "Ndokoti",
        compagnies: ["Alpha Voyages", "Élite Express"],
      });
      expect(rep.body.commissionParDefaut).toBe(100);
      expect(rep.body.bilan).toEqual({
        billetsDuMois: 0,
        gainDuMois: 0,
        versement: "lundi",
        clients: 0,
        clientsReguliers: 0,
      });
      expect(rep.body.regle).toContain("Tu ne gardes jamais d'argent");
    });

    it("le bilan du mois compte les billets vendus, les gains et les clients, sans les ventes d'autres mois", async () => {
      const v = await t.creerVendeur({});
      // Deux ventes réelles aujourd'hui (novembre 2026)…
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, { nom: "Un", telephone: "+237670000001" }));
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, { nom: "Deux", telephone: "+237670000002" }));
      // … et une vente d'octobre, qui n'est pas du mois, ni sa commission.
      const octobre = historique(v.id, {
        voisin: { nom: "Octobre", telephone: "+237670000003" },
        creeA: douala("2026-10-30", "10:00"),
        departA: douala("2026-10-31", "08:30"),
      });
      await t.commissions.crediter({
        cle: `commission:${octobre.id}`,
        vendeurId: v.id,
        compagnieId: COMPAGNIE,
        montant: 100,
        venteId: octobre.id,
        at: octobre.creeA,
      });
      const rep = await get("/vendeurs/moi", v.jeton);
      expect(rep.body.bilan).toMatchObject({
        billetsDuMois: 2,
        gainDuMois: 200,
        clients: 3,
        clientsReguliers: 0,
      });
    });

    it("compte les clients réguliers : trois billets achetés ou plus", async () => {
      const v = await t.creerVendeur({});
      for (const jour of ["2026-10-09", "2026-10-16", "2026-10-23"]) {
        historique(v.id, {
          voisin: { nom: "Mme Ebogo", telephone: "+237670123456" },
          creeA: douala(jour, "07:00"),
          departA: douala(jour, "08:30"),
        });
      }
      historique(v.id, { voisin: { nom: "Pasteur Nkou", telephone: "+237694000111" } });
      const rep = await get("/vendeurs/moi", v.jeton);
      expect(rep.body.bilan).toMatchObject({ clients: 2, clientsReguliers: 1 });
    });
  });

  describe("les départs à vendre", () => {
    it("demain par défaut, de la ville du vendeur vers la ligne la plus desservie, du plus tôt au plus tard", async () => {
      const v = await t.creerVendeur({});
      const rep = await get("/vendeurs/moi/departs", v.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(() => contrats.SchemaDepartsVendeur.parse(rep.body)).not.toThrow();
      expect(rep.body).toMatchObject({
        trajet: "Douala → Yaoundé",
        jour: DEMAIN,
        commissionLibelle: "commission 100 F / billet",
        detailPaiement: "le voisin paie cash, je paie MoMo, il reçoit le SMS",
      });
      expect(rep.body.departs).toEqual([
        {
          departId: DEPART_ALPHA,
          compagnie: "Alpha Voyages",
          classe: "classique",
          heureDepart: heure("08:30", DEMAIN),
          placesLibres: 40,
          prix: 4000,
          commission: 100,
        },
        {
          departId: DEPART_PETIT,
          compagnie: "Alpha Voyages",
          classe: "classique",
          heureDepart: heure("11:00", DEMAIN),
          placesLibres: 4,
          prix: 4000,
          commission: 100,
        },
      ]);
    });

    it("les agences du vendeur seulement, la commission de chacune, du plus tôt au plus tard", async () => {
      const v = await t.creerVendeur({
        compagnies: [COMPAGNIE, AUTRE_COMPAGNIE],
        commissions: { commissionClassique: 120, commissionVip: 300 },
      });
      const rep = await get("/vendeurs/moi/departs?destination=Yaound%C3%A9", v.jeton);
      expect(rep.status).toBe(200);
      expect(
        rep.body.departs.map((d: { departId: string; commission: number; heureDepart: string }) => [
          d.departId,
          d.commission,
        ]),
      ).toEqual([
        [DEPART_ELITE_VIP, 300],
        [DEPART_ALPHA, 120],
        [DEPART_PETIT, 120],
      ]);
      // Un vendeur qui n'a que l'agrément Alpha ne voit pas le départ d'Élite.
      const seul = await t.creerVendeur({ telephone: "+237677000055" });
      const chezAlpha = await get("/vendeurs/moi/departs", seul.jeton);
      expect(chezAlpha.body.departs.map((d: { departId: string }) => d.departId)).not.toContain(
        DEPART_ELITE_VIP,
      );
    });

    it("le trajet demandé : destination sans accents ni majuscules, ou jour choisi", async () => {
      const v = await t.creerVendeur({});
      const rep = await get("/vendeurs/moi/departs?destination=bafoussam", v.jeton);
      expect(rep.body.trajet).toBe("Douala → Bafoussam");
      expect(rep.body.departs).toHaveLength(1);
      expect(rep.body.departs[0]).toMatchObject({ prix: 3500, placesLibres: 40 });
      expect(() => contrats.SchemaDepartsVendeur.parse(rep.body)).not.toThrow();
    });

    it("aujourd'hui, seulement les départs qui ne sont pas encore partis", async () => {
      const v = await t.creerVendeur({});
      const rep = await get(`/vendeurs/moi/departs?jour=${JOUR}`, v.jeton);
      expect(rep.status).toBe(200);
      expect(rep.body.departs.map((d: { heureDepart: string }) => d.heureDepart)).toEqual([
        heure("14:00", JOUR),
      ]);
    });

    it("sans historique la ligne la plus desservie ; avec, la destination que le vendeur vend le plus", async () => {
      const v = await t.creerVendeur({});
      expect((await get("/vendeurs/moi/departs", v.jeton)).body.trajet).toBe("Douala → Yaoundé");
      historique(v.id, {
        voisin: { nom: "A", telephone: "+237670000001" },
        destination: { code: "BFM", ville: "Bafoussam" },
      });
      historique(v.id, {
        voisin: { nom: "B", telephone: "+237670000002" },
        destination: { code: "BFM", ville: "Bafoussam" },
      });
      historique(v.id, { voisin: { nom: "C", telephone: "+237670000003" } });
      const rep = await get("/vendeurs/moi/departs", v.jeton);
      expect(rep.body.trajet).toBe("Douala → Bafoussam");
    });

    it("les places libres baissent à chaque billet vendu", async () => {
      const v = await t.creerVendeur({});
      await t.vendre(v.jeton, t.venteDe(DEPART_PETIT, { nom: "Un", telephone: "+237670000001" }));
      await t.vendre(v.jeton, t.venteDe(DEPART_PETIT, { nom: "Deux", telephone: "+237670000002" }));
      const rep = await get("/vendeurs/moi/departs", v.jeton);
      const petit = rep.body.departs.find((d: { departId: string }) => d.departId === DEPART_PETIT);
      expect(petit.placesLibres).toBe(2);
    });

    it("un vendeur sans agrément en vigueur n'a aucun départ à vendre", async () => {
      const v = await t.creerVendeur({});
      const patron = await t.patronDe(COMPAGNIE);
      await t.http().post(`/agence/vendeurs/${v.id}/retrait`).set(t.avec(patron.jeton));
      const rep = await get("/vendeurs/moi/departs", v.jeton);
      expect([rep.status, rep.body.code]).toEqual([403, "aucun_agrement"]);
    });

    it("refuse un jour mal écrit", async () => {
      const v = await t.creerVendeur({});
      const rep = await get("/vendeurs/moi/departs?jour=demain", v.jeton);
      expect(rep.status).toBe(400);
      expect(rep.body.code).toBe("REQUETE_INVALIDE");
    });
  });

  describe("les clients à qui revendre en une touche", () => {
    it("Mme Ebogo voyage chaque vendredi : proposition « vendredi 08:30 » ; le Pasteur Nkou, son dernier voyage", async () => {
      const v = await t.creerVendeur({});
      // Mme Ebogo : Douala → Yaoundé, les trois derniers vendredis à 08:30.
      for (const jour of ["2026-10-09", "2026-10-16", "2026-10-23"]) {
        historique(v.id, {
          voisin: { nom: "Mme Ebogo", telephone: "+237670123456" },
          creeA: douala(jour, "07:00"),
          departA: douala(jour, "08:30"),
        });
      }
      // Pasteur Nkou : un seul voyage pour Bafoussam, fin décembre 2025.
      historique(v.id, {
        voisin: { nom: "Pasteur Nkou", telephone: "+237694000111" },
        destination: { code: "BFM", ville: "Bafoussam" },
        creeA: douala("2025-12-26", "10:00"),
        departA: douala("2025-12-28", "07:00"),
      });
      const rep = await get("/vendeurs/moi/clients", v.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(() => contrats.SchemaClientsVendeur.parse(rep.body)).not.toThrow();
      expect(rep.body.titre).toBe("Mes clients · revendre en 1 touche");
      expect(rep.body.clients).toEqual([
        {
          nom: "Mme Ebogo",
          destination: "Yaoundé",
          habitude: "chaque vendredi",
          telephoneMasque: "6 70 …",
          proposition: "vendredi 08:30",
          dernierVoyage: null,
        },
        {
          nom: "Pasteur Nkou",
          destination: "Bafoussam",
          habitude: null,
          telephoneMasque: "6 94 …",
          proposition: null,
          dernierVoyage: douala("2025-12-28", "00:00"),
        },
      ]);
    });

    it("une habitude sans départ correspondant cette semaine : pas de proposition, mais le dernier voyage", async () => {
      const v = await t.creerVendeur({});
      // Trois mercredis à 09 h 15 : aucun départ de ce genre n'existe dans le réseau de test.
      for (const jour of ["2026-10-14", "2026-10-21", "2026-10-28"]) {
        historique(v.id, {
          voisin: { nom: "M. Tchoua", telephone: "+237670555000" },
          creeA: douala(jour, "07:00"),
          departA: douala(jour, "09:15"),
        });
      }
      const rep = await get("/vendeurs/moi/clients", v.jeton);
      expect(rep.body.clients).toHaveLength(1);
      expect(rep.body.clients[0]).toMatchObject({
        habitude: "chaque mercredi",
        proposition: null,
        dernierVoyage: douala("2026-10-28", "00:00"),
      });
    });

    it("ne propose pas un départ complet ni d'un autre trajet", async () => {
      const v = await t.creerVendeur({});
      // Habitude du vendredi, mais sur Bafoussam : le vendredi 08:30 du réseau va à Yaoundé.
      for (const jour of ["2026-10-09", "2026-10-16", "2026-10-23"]) {
        historique(v.id, {
          voisin: { nom: "Mme Ebogo", telephone: "+237670123456" },
          destination: { code: "BFM", ville: "Bafoussam" },
          creeA: douala(jour, "07:00"),
          departA: douala(jour, "08:30"),
        });
      }
      const rep = await get("/vendeurs/moi/clients", v.jeton);
      expect(rep.body.clients[0]).toMatchObject({ habitude: "chaque vendredi", proposition: null });
      expect(rep.body.clients[0].dernierVoyage).toBe(douala("2026-10-23", "00:00"));
    });

    it("les clients les plus récents d'abord, jamais le numéro complet, jamais les ventes sans billet", async () => {
      const v = await t.creerVendeur({});
      historique(v.id, {
        voisin: { nom: "Ancien", telephone: "+237670000001" },
        creeA: douala("2026-09-01", "10:00"),
      });
      historique(v.id, {
        voisin: { nom: "Récent", telephone: "+237670000002" },
        creeA: douala("2026-10-25", "10:00"),
      });
      historique(v.id, {
        voisin: { nom: "Jamais payé", telephone: "+237670000003" },
        etat: "refusee",
      });
      historique(v.id, {
        voisin: { nom: "Hors fenêtre", telephone: "+237670000004" },
        creeA: douala("2025-06-01", "10:00"),
        departA: douala("2025-06-02", "08:30"),
      });
      const rep = await get("/vendeurs/moi/clients", v.jeton);
      expect(rep.body.clients.map((c: { nom: string }) => c.nom)).toEqual(["Récent", "Ancien"]);
      expect(JSON.stringify(rep.body)).not.toMatch(/\+237|670000/);
    });

    it("n'en montre pas plus de vingt", async () => {
      const v = await t.creerVendeur({});
      for (let i = 0; i < 25; i++) {
        historique(v.id, {
          voisin: { nom: `Client ${i}`, telephone: `+2376700001${String(i).padStart(2, "0")}` },
          creeA: douala("2026-10-20", "10:00"),
        });
      }
      const rep = await get("/vendeurs/moi/clients", v.jeton);
      expect(rep.body.clients).toHaveLength(20);
    });

    it("une vraie vente fait apparaître son voisin dans les clients, par son prénom et son numéro masqué", async () => {
      const v = await t.creerVendeur({});
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const rep = await get("/vendeurs/moi/clients", v.jeton);
      expect(rep.body.clients).toEqual([
        {
          nom: "Mme Ebogo",
          destination: "Yaoundé",
          habitude: null,
          telephoneMasque: "6 70 …",
          proposition: null,
          dernierVoyage: douala(DEMAIN, "00:00"),
        },
      ]);
    });
  });
});
