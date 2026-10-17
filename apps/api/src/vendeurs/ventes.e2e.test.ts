import { colis as contrats } from "@afrimove/contrats";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Passagers } from "../billetterie/passagers";
import type { Vente } from "./modele";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEMAIN,
  DEPART_ALPHA,
  DEPART_BAFOUSSAM,
  DEPART_ELITE_VIP,
  DEPART_FERME,
  DEPART_PARTI,
  DEPART_PETIT,
  TEL_VOISIN,
  creerAppVendeursTest,
  type AppVendeursTest,
} from "./testing/app-vendeurs-test";

const MINUTE = 60_000;

describe("vendeurs : vendre un billet au nom d'un voisin (règlement piloté)", () => {
  let t: AppVendeursTest;

  beforeEach(async () => {
    t = await creerAppVendeursTest({ reglement: "memoire" });
  });
  afterEach(async () => {
    await t.fermer();
  });

  const ventesDe = (vendeurId: string): Vente[] =>
    [...t.ventes.lignes.values()].filter((v) => v.vendeurId === vendeurId);

  /** Les places libres d'un départ de demain, vues par le vendeur. */
  async function placesLibres(jeton: string, departId: string): Promise<number | undefined> {
    const rep = await t.http().get(`/vendeurs/moi/departs?jour=${DEMAIN}`).set(t.avec(jeton));
    return (rep.body.departs as { departId: string; placesLibres: number }[] | undefined)?.find(
      (d) => d.departId === departId,
    )?.placesLibres;
  }

  describe("la vente réussie", () => {
    it("le voisin paie, le vendeur paie l'agence : billet au nom du voisin, SMS, commission", async () => {
      const v = await t.creerVendeur({});
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      expect(() => contrats.SchemaBilletVendu.parse(rep.body)).not.toThrow();
      expect(rep.body).toMatchObject({
        departId: DEPART_ALPHA,
        prix: 4000,
        commission: 100,
        aRegler: 4000,
        smsEnvoyeA: "6 70 …",
      });
      expect(rep.body.numero).toMatch(/^ALP-DLA-261102-\d{4}$/);

      // Le billet existe, payé, au nom du voisin et non à celui du vendeur.
      const billet = await t.billets.trouver(rep.body.billetId);
      expect(billet).toMatchObject({
        etat: "paye",
        canal: "vendeur",
        departId: DEPART_ALPHA,
        prix: 4000,
        siege: 1,
        auteurId: v.id,
        acheteurId: null,
        paiement: { mode: "momo" },
      });
      const passager = t.app.get(Passagers, { strict: false }).dechiffrer(billet!.passagerChiffre);
      expect(passager).toMatchObject({ nom: "Mme Ebogo", telephone: TEL_VOISIN });

      // L'agence a reçu le prix en entier, du numéro MoMo du vendeur, avec la vente pour clé.
      expect(t.reglements.demandes.size).toBe(1);
      const [demande] = [...t.reglements.demandes.values()];
      expect(demande).toMatchObject({
        compagnieId: COMPAGNIE,
        vendeurId: v.id,
        montant: 4000,
        moyen: "mtn_momo",
        telephone: v.telephone,
      });
      const vente = ventesDe(v.id)[0]!;
      expect(demande?.cle).toBe(vente.id);
      expect(vente).toMatchObject({ etat: "terminee", siege: 1, billetId: rep.body.billetId });
      expect(vente.reference).toMatch(/^MM-REG-/);

      // Le voisin reçoit son billet par SMS ; la commission est créditée, une seule fois.
      expect(t.messages.billets).toHaveLength(1);
      expect(t.messages.billets[0]).toMatchObject({
        billetId: rep.body.billetId,
        destinataire: TEL_VOISIN,
        code: billet!.codeBillet,
        siege: 1,
      });
      expect(await t.commissions.solde(v.id)).toBe(100);
      expect([...t.commissions.creditsLignes.keys()]).toEqual([`commission:${vente.id}`]);

      // La vente est tracée.
      expect(t.audit.lignes.filter((l) => l.action === "vendeur.vente")).toHaveLength(1);
    });

    it("billet VIP chez Élite par Orange Money : 150 F de commission", async () => {
      const v = await t.creerVendeur({
        compagnies: [AUTRE_COMPAGNIE],
        telephone: "+237691000032",
        operateur: "orange",
      });
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ELITE_VIP, {}, "orange_money"));
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      expect(rep.body).toMatchObject({ prix: 7500, commission: 150, aRegler: 7500 });
      const [demande] = [...t.reglements.demandes.values()];
      expect(demande).toMatchObject({
        compagnieId: AUTRE_COMPAGNIE,
        montant: 7500,
        moyen: "orange_money",
      });
      expect((await t.billets.trouver(rep.body.billetId))?.paiement?.mode).toBe("orange_money");
    });

    it("le nom du voisin est nettoyé, les places libres baissent d'une", async () => {
      const v = await t.creerVendeur({});
      expect(await placesLibres(v.jeton, DEPART_ALPHA)).toBe(40);
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, { nom: "  Mme Ebogo  " }));
      expect(rep.status).toBe(201);
      expect(ventesDe(v.id)[0]?.voisin.nom).toBe("Mme Ebogo");
      expect(await placesLibres(v.jeton, DEPART_ALPHA)).toBe(39);
    });

    it("le même voisin peut avoir un billet sur un autre départ", async () => {
      const v = await t.creerVendeur({});
      expect((await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA))).status).toBe(201);
      const autre = await t.vendre(v.jeton, t.venteDe(DEPART_BAFOUSSAM));
      expect(autre.status, JSON.stringify(autre.body)).toBe(201);
      expect(autre.body.prix).toBe(3500);
    });

    it("deux voisins sur le même départ ont deux billets et deux sièges", async () => {
      const v = await t.creerVendeur({});
      const a = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, { nom: "Un" }));
      const b = await t.vendre(
        v.jeton,
        t.venteDe(DEPART_ALPHA, { nom: "Deux", telephone: "+237670999999" }),
      );
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.billetId).not.toBe(b.body.billetId);
      const sieges = ventesDe(v.id)
        .map((x) => x.siege)
        .sort();
      expect(sieges).toEqual([1, 2]);
    });
  });

  describe("refus avant tout paiement", () => {
    async function aucunArgentNiBillet(vendeurId: string) {
      expect(t.reglements.appels, "aucune demande de paiement").toBe(0);
      expect(t.messages.billets).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(ventesDe(vendeurId).filter((x) => x.etat === "terminee")).toHaveLength(0);
    }

    it("la carte n'est pas un moyen de régler l'agence", async () => {
      const v = await t.creerVendeur({});
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, {}, "carte"));
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("moyen_indisponible");
      await aucunArgentNiBillet(v.id);
    });

    it("l'opérateur du moyen doit être celui du numéro MoMo du vendeur", async () => {
      const v = await t.creerVendeur({ operateur: "mtn" });
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, {}, "orange_money"));
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("moyen_incoherent");
      await aucunArgentNiBillet(v.id);
    });

    it("une agence qui n'a pas agréé le vendeur ne vend pas par lui", async () => {
      const v = await t.creerVendeur({});
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ELITE_VIP));
      expect(rep.status).toBe(403);
      expect(rep.body.code).toBe("compagnie_non_agreee");
      await aucunArgentNiBillet(v.id);
    });

    it("un départ inconnu, parti ou fermé à la vente", async () => {
      const v = await t.creerVendeur({});
      const inconnu = await t.vendre(v.jeton, t.venteDe(randomUUID()));
      expect([inconnu.status, inconnu.body.code]).toEqual([404, "depart_introuvable"]);
      const parti = await t.vendre(v.jeton, t.venteDe(DEPART_PARTI));
      expect([parti.status, parti.body.code]).toEqual([409, "depart_ferme"]);
      const ferme = await t.vendre(v.jeton, t.venteDe(DEPART_FERME));
      expect([ferme.status, ferme.body.code]).toEqual([409, "depart_ferme"]);
      await aucunArgentNiBillet(v.id);
      // Le départ fermé n'a pas laissé de vente en attente qui bloquerait la suivante.
      expect((await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA))).status).toBe(201);
    });

    it("un départ complet : pas de paiement pour une place qui n'existe plus", async () => {
      const v = await t.creerVendeur({});
      for (const i of [1, 2, 3, 4]) {
        const rep = await t.vendre(
          v.jeton,
          t.venteDe(DEPART_PETIT, { nom: `Voisin ${i}`, telephone: `+23767000000${i}` }),
        );
        expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      }
      expect(t.reglements.appels).toBe(4);
      const cinquieme = await t.vendre(
        v.jeton,
        t.venteDe(DEPART_PETIT, { nom: "Voisin 5", telephone: "+237670000005" }),
      );
      expect(cinquieme.status).toBe(409);
      expect(cinquieme.body.code).toBe("depart_complet");
      expect(t.reglements.appels, "le cinquième voisin n'est pas débité").toBe(4);
      expect(t.messages.billets).toHaveLength(4);
      // La vente avortée ne bloque pas le vendeur.
      expect((await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA))).status).toBe(201);
    });

    it("rejette un corps mal formé en nommant les champs", async () => {
      const v = await t.creerVendeur({});
      const rep = await t.vendre(v.jeton, {
        departId: "",
        voisin: { nom: "", telephone: "670" },
        reglementAgence: "wave",
      });
      expect(rep.status).toBe(400);
      expect((rep.body.details as { chemin: string }[]).map((d) => d.chemin).sort()).toEqual([
        "departId",
        "reglementAgence",
        "voisin.nom",
        "voisin.telephone",
      ]);
      expect(t.reglements.appels).toBe(0);
    });
  });

  describe("l'agence ne reçoit pas l'argent", () => {
    it("paiement refusé : 402, aucun billet, aucune commission, siège rendu, on peut réessayer", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "refuse";
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(rep.status).toBe(402);
      expect(rep.body.code).toBe("reglement_refuse");
      expect(rep.body.details).toMatchObject({ cause: "solde_insuffisant" });
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(t.messages.billets).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);
      expect(ventesDe(v.id)[0]).toMatchObject({ etat: "refusee", cause: "solde_insuffisant" });
      expect(await placesLibres(v.jeton, DEPART_ALPHA)).toBe(40);
      expect(
        t.audit.lignes.some((l) => l.action === "vendeur.vente" && l.resultat === "echec"),
      ).toBe(true);

      // Le vendeur recommence avec le même voisin (nouveau solde) : une nouvelle vente, un seul billet.
      t.reglements.issue = "reussi";
      const encore = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(encore.status, JSON.stringify(encore.body)).toBe(201);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
      expect(await t.commissions.solde(v.id)).toBe(100);
    });

    it("pas de réponse de l'opérateur : 409, rien n'est émis, une autre vente est refusée", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("reglement_en_attente");
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(t.messages.billets).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);
      expect(ventesDe(v.id)[0]?.etat).toBe("en_attente");
      // Le siège reste retenu pour cette vente.
      expect(await placesLibres(v.jeton, DEPART_ALPHA)).toBe(39);

      // Une seule vente à la fois par vendeur.
      const autre = await t.vendre(
        v.jeton,
        t.venteDe(DEPART_ALPHA, { nom: "Autre", telephone: "+237670999999" }),
      );
      expect([autre.status, autre.body.code]).toEqual([409, "vente_en_cours"]);
      expect(t.reglements.appels).toBe(1);
    });

    it("le renvoi de la même vente pendant l'attente ne paie pas une seconde fois", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const encore = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect([encore.status, encore.body.code]).toEqual([409, "reglement_en_attente"]);
      expect(t.reglements.demandes.size).toBe(1);
      expect(ventesDe(v.id)).toHaveLength(1);
    });

    it("la tâche de fond conclut quand l'opérateur confirme : billet, SMS et commission, une seule fois", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      expect((await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA))).status).toBe(409);
      const vente = ventesDe(v.id)[0]!;

      // Tant que l'opérateur n'a pas répondu, rien ne bouge.
      await t.services.taches.toutExecuter();
      expect((await t.ventes.trouver(vente.id))?.etat).toBe("en_attente");
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);

      t.reglements.confirmer(vente.id);
      const bilan = await t.services.taches.reprendreVentes();
      expect(bilan).toMatchObject({ terminees: 1, abandonnees: 0 });
      expect((await t.ventes.trouver(vente.id))?.etat).toBe("terminee");
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
      expect(t.messages.billets).toHaveLength(1);
      expect(await t.commissions.solde(v.id)).toBe(100);

      // Relancer les tâches ne refait rien. On est lundi après 8 h : la commission part, une fois.
      await t.services.taches.toutExecuter();
      await t.services.taches.toutExecuter();
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
      expect(t.messages.billets).toHaveLength(1);
      expect(t.commissions.creditsLignes.size).toBe(1);
      expect(t.versements.envoyes.map((e) => e.montant)).toEqual([100]);

      // Le vendeur renvoie la vente (réponse perdue) : le même billet, aucun nouveau paiement.
      const renvoi = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(renvoi.status).toBe(201);
      expect(renvoi.body.billetId).toBe((await t.billets.duDepart(DEPART_ALPHA))[0]?.id);
      expect(t.reglements.demandes.size).toBe(1);
      // Il peut enchaîner une autre vente.
      t.reglements.issue = "reussi";
      expect(
        (
          await t.vendre(
            v.jeton,
            t.venteDe(DEPART_ALPHA, { nom: "Autre", telephone: "+237670999999" }),
          )
        ).status,
      ).toBe(201);
    });

    it("l'opérateur refuse après coup : la tâche rend le siège, aucun billet", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const vente = ventesDe(v.id)[0]!;
      t.reglements.refuser(vente.id, "annule_par_le_client");
      const bilan = await t.services.taches.reprendreVentes();
      expect(bilan.abandonnees).toBe(1);
      expect(await t.ventes.trouver(vente.id)).toMatchObject({
        etat: "refusee",
        cause: "annule_par_le_client",
      });
      expect(await placesLibres(v.jeton, DEPART_ALPHA)).toBe(40);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);
    });

    it("sans confirmation en 10 minutes la vente expire et le siège est rendu", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const vente = ventesDe(v.id)[0]!;

      t.horloge.avancer(9 * MINUTE);
      await t.services.taches.reprendreVentes();
      expect((await t.ventes.trouver(vente.id))?.etat).toBe("en_attente");

      t.horloge.avancer(2 * MINUTE);
      const bilan = await t.services.taches.reprendreVentes();
      expect(bilan.abandonnees).toBe(1);
      expect(await t.ventes.trouver(vente.id)).toMatchObject({
        etat: "expiree",
        cause: "delai_depasse",
      });
      expect(await placesLibres(v.jeton, DEPART_ALPHA)).toBe(40);
      // Le vendeur est libre de vendre à nouveau.
      t.reglements.issue = "reussi";
      expect(
        (
          await t.vendre(
            v.jeton,
            t.venteDe(DEPART_ALPHA, { nom: "Autre", telephone: "+237670999999" }),
          )
        ).status,
      ).toBe(201);
    });

    it("l'argent arrive après l'expiration : pas de billet, la vente passe à rembourser", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const vente = ventesDe(v.id)[0]!;
      t.horloge.avancer(11 * MINUTE);
      await t.services.taches.reprendreVentes();
      expect((await t.ventes.trouver(vente.id))?.etat).toBe("expiree");

      t.reglements.confirmer(vente.id);
      const bilan = await t.services.taches.reprendreVentes();
      expect(bilan.aRembourser).toBe(1);
      expect(await t.ventes.trouver(vente.id)).toMatchObject({ etat: "a_rembourser" });
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(t.messages.billets).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);
      expect(t.audit.lignes.some((l) => l.action === "vendeur.reglement_tardif")).toBe(true);

      // Une seule alerte : la tâche ne la répète pas.
      expect((await t.services.taches.reprendreVentes()).aRembourser).toBe(0);
    });

    it("l'opérateur ne répond pas du tout : la vente reste en attente puis aboutit à la reprise", async () => {
      const v = await t.creerVendeur({});
      t.reglements.enPanne = true;
      const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect([rep.status, rep.body.code]).toEqual([409, "reglement_en_attente"]);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);

      t.reglements.enPanne = false;
      const bilan = await t.services.taches.reprendreVentes();
      expect(bilan.terminees).toBe(1);
      expect(t.reglements.demandes.size).toBe(1);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
      expect(await t.commissions.solde(v.id)).toBe(100);
    });

    it("le départ se ferme alors que l'agence est déjà payée : à rembourser, jamais de billet sans siège", async () => {
      const v = await t.creerVendeur({});
      t.reglements.issue = "en_attente";
      await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const vente = ventesDe(v.id)[0]!;
      // Le départ est annulé par l'agence entre-temps.
      const complet = (await t.catalogue.depart(DEPART_ALPHA))!;
      t.catalogue.ajouterDepart({ ...complet.depart, etat: "annule" });
      t.reglements.confirmer(vente.id);
      await t.services.taches.reprendreVentes();
      expect(await t.ventes.trouver(vente.id)).toMatchObject({
        etat: "a_rembourser",
        cause: "depart_ferme",
      });
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
      expect(t.commissions.creditsLignes.size).toBe(0);
      expect(t.audit.lignes.some((l) => l.action === "vendeur.a_rembourser")).toBe(true);
    });
  });

  describe("doubles envois et concurrence", () => {
    it("la même vente envoyée deux fois donne le même billet, un seul paiement, une seule commission", async () => {
      const v = await t.creerVendeur({});
      const a = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      const b = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body).toEqual(a.body);
      expect(t.reglements.demandes.size).toBe(1);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
      expect(t.messages.billets).toHaveLength(1);
      expect(await t.commissions.solde(v.id)).toBe(100);
      expect(ventesDe(v.id)).toHaveLength(1);
    });

    it("deux envois simultanés de la même vente : jamais deux billets, deux paiements ni deux commissions", async () => {
      const v = await t.creerVendeur({});
      const [a, b] = await Promise.all([
        t.vendre(v.jeton, t.venteDe(DEPART_ALPHA)),
        t.vendre(v.jeton, t.venteDe(DEPART_ALPHA)),
      ]);
      // L'un des deux peut voir la vente encore en route : 409, mais jamais d'erreur ni de doublon.
      for (const rep of [a, b]) expect([201, 409], JSON.stringify(rep.body)).toContain(rep.status);
      expect([a, b].some((r) => r.status === 201)).toBe(true);
      expect(t.reglements.demandes.size).toBe(1);
      expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
      expect(t.messages.billets).toHaveLength(1);
      expect(await t.commissions.solde(v.id)).toBe(100);
      // Le renvoi suivant retrouve le billet.
      const encore = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(encore.status).toBe(201);
    });

    it("six vendeurs se disputent les quatre places d'un minibus : quatre billets, deux refus sans paiement", async () => {
      const vendeurs = [];
      for (let i = 0; i < 6; i++) {
        vendeurs.push(await t.creerVendeur({ nom: `Vendeur ${i}`, telephone: `+23767711000${i}` }));
      }
      const reponses = await Promise.all(
        vendeurs.map((v, i) =>
          t.vendre(
            v.jeton,
            t.venteDe(DEPART_PETIT, { nom: `Voisin ${i}`, telephone: `+23767022000${i}` }),
          ),
        ),
      );
      const ok = reponses.filter((r) => r.status === 201);
      const complets = reponses.filter((r) => r.status === 409);
      expect(ok, JSON.stringify(reponses.map((r) => r.body))).toHaveLength(4);
      expect(complets).toHaveLength(2);
      for (const r of complets) expect(r.body.code).toBe("depart_complet");

      const billets = (await t.billets.duDepart(DEPART_PETIT)).filter((b) => b.etat !== "annule");
      expect(billets).toHaveLength(4);
      expect(billets.map((b) => b.siege).sort()).toEqual([1, 2, 3, 4]);
      expect(new Set(billets.map((b) => b.numero)).size).toBe(4);
      expect(new Set(billets.map((b) => b.codeBillet)).size).toBe(4);
      // Seuls les quatre qui ont une place ont été débités.
      expect(t.reglements.demandes.size).toBe(4);
      expect(t.commissions.creditsLignes.size).toBe(4);
      expect(t.messages.billets).toHaveLength(4);
    });
  });

  describe("le vendeur ne détient jamais l'argent du billet", () => {
    it("tout ce que le vendeur encaisse repart à l'agence ; seule sa commission lui revient, à part", async () => {
      const a = await t.creerVendeur({});
      const b = await t.creerVendeur({
        compagnies: [COMPAGNIE, AUTRE_COMPAGNIE],
        telephone: "+237677000077",
      });
      await t.vendre(a.jeton, t.venteDe(DEPART_ALPHA, { nom: "Un", telephone: "+237670000001" }));
      await t.vendre(
        a.jeton,
        t.venteDe(DEPART_BAFOUSSAM, { nom: "Deux", telephone: "+237670000002" }),
      );
      await t.vendre(
        b.jeton,
        t.venteDe(DEPART_ALPHA, { nom: "Trois", telephone: "+237670000003" }),
      );
      t.reglements.issue = "refuse";
      await t.vendre(
        b.jeton,
        t.venteDe(DEPART_ALPHA, { nom: "Refusé", telephone: "+237670000004" }),
      );

      const terminees = [...t.ventes.lignes.values()].filter((v) => v.etat === "terminee");
      expect(terminees).toHaveLength(3);
      const prix = terminees.reduce((s, v) => s + v.prix, 0);
      const reglees = [...t.reglements.demandes.values()].filter((d) => d.etat.etat === "reussi");
      // Chaque billet émis correspond à un règlement de l'agence du même montant.
      expect(reglees.reduce((s, d) => s + d.montant, 0)).toBe(prix);
      for (const v of terminees) {
        const d = t.reglements.demandes.get(v.id);
        expect(d, v.id).toMatchObject({ montant: v.prix, compagnieId: v.compagnieId });
      }
      // Le registre du vendeur ne contient que des commissions, toutes inférieures au prix d'un billet.
      const credits = [...t.commissions.creditsLignes.values()];
      expect(credits).toHaveLength(3);
      expect(credits.every((c) => c.montant === 100)).toBe(true);
      expect(Math.max(...credits.map((c) => c.montant))).toBeLessThan(
        Math.min(...terminees.map((v) => v.prix)),
      );
      // Rien n'a été versé au vendeur par la vente : les versements sont ceux du lundi, à part.
      expect(t.versements.envoyes).toHaveLength(0);
    });
  });

  describe("accès", () => {
    it("401 sans jeton, 403 pour tout autre rôle que vendeur", async () => {
      expect(
        (await t.http().post("/vendeurs/moi/ventes").send(t.venteDe(DEPART_ALPHA))).status,
      ).toBe(401);
      expect((await t.http().get("/vendeurs/moi")).status).toBe(401);
      for (const role of [
        "voyageur",
        "guichetier",
        "patron",
        "superviseur",
        "convoyeur",
        "afrimove",
      ] as const) {
        const c = await t.compte(role);
        for (const rep of [
          await t.vendre(c.jeton, t.venteDe(DEPART_ALPHA)),
          await t.http().get("/vendeurs/moi").set(t.avec(c.jeton)),
          await t.http().get("/vendeurs/moi/departs").set(t.avec(c.jeton)),
          await t.http().get("/vendeurs/moi/clients").set(t.avec(c.jeton)),
        ]) {
          expect(rep.status, role).toBe(403);
        }
      }
      expect(t.reglements.appels).toBe(0);
    });

    it("un compte vendeur sans fiche n'est pas encore agréé : 404", async () => {
      const c = await t.compte("vendeur");
      const rep = await t.http().get("/vendeurs/moi").set(t.avec(c.jeton));
      expect([rep.status, rep.body.code]).toEqual([404, "vendeur_introuvable"]);
      const vente = await t.vendre(c.jeton, t.venteDe(DEPART_ALPHA));
      expect([vente.status, vente.body.code]).toEqual([404, "vendeur_introuvable"]);
      expect(t.reglements.appels).toBe(0);
    });

    it("un vendeur suspendu ne vend plus et ne voit plus rien", async () => {
      const v = await t.creerVendeur({});
      const fiche = (await t.vendeurs.trouver(v.id))!;
      await t.vendeurs.remplacer({ ...fiche, actif: false }, fiche.version);
      for (const rep of [
        await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA)),
        await t.http().get("/vendeurs/moi").set(t.avec(v.jeton)),
        await t.http().get("/vendeurs/moi/departs").set(t.avec(v.jeton)),
      ]) {
        expect([rep.status, rep.body.code]).toEqual([403, "vendeur_suspendu"]);
      }
      expect(t.reglements.appels).toBe(0);
    });

    it("un vendeur ne voit que ses propres ventes dans ses clients", async () => {
      const a = await t.creerVendeur({});
      const b = await t.creerVendeur({});
      await t.vendre(a.jeton, t.venteDe(DEPART_ALPHA));
      const chezB = await t.http().get("/vendeurs/moi/clients").set(t.avec(b.jeton));
      expect(chezB.body.clients).toEqual([]);
      const chezA = await t.http().get("/vendeurs/moi/clients").set(t.avec(a.jeton));
      expect(chezA.body.clients).toHaveLength(1);
    });
  });
});
