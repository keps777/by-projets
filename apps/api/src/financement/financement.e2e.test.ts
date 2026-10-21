import { patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENCE,
  AUTRE_AGENCE,
  PIN_PATRON,
  creerAppFinancementTest,
  salairesTypes,
  type AppFinancementTest,
} from "./testing/app-financement-test";

describe("financement : offre, demande d'avance, suivi et retrait", () => {
  let t: AppFinancementTest;
  let chef: { id: string; jeton: string; telephone: string };

  beforeEach(async () => {
    t = await creerAppFinancementTest();
    chef = await t.compte("patron");
    t.agenceEligible();
  });
  afterEach(async () => {
    await t.fermer();
  });

  const offre = (jeton = chef.jeton) => t.http().get("/patron/financement").set(t.entete(jeton));

  const demander = (montant: number, over: Record<string, unknown> = {}, jeton = chef.jeton) =>
    t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(jeton))
      .send({ montant, signature: t.signature(), ...over });

  const dossier = (id: string, jeton = chef.jeton) =>
    t.http().get(`/patron/financement/demandes/${id}`).set(t.entete(jeton));

  const retirer = (id: string, over: Record<string, unknown> = {}, jeton = chef.jeton) =>
    t
      .http()
      .post(`/patron/financement/demandes/${id}/retrait`)
      .set(t.entete(jeton))
      .send({ dossierId: id, signature: t.signature(), ...over });

  /* ------------------------------------------------------------------ accès */

  describe("accès", () => {
    it("sans jeton : 401 sur chaque route", async () => {
      expect((await t.http().get("/patron/financement")).status).toBe(401);
      expect((await t.http().get("/patron/financement/demandes/AV-2026-0001")).status).toBe(401);
      expect((await t.http().post("/patron/financement/demandes").send({})).status).toBe(401);
      expect(
        (await t.http().post("/patron/financement/demandes/AV-2026-0001/retrait").send({})).status,
      ).toBe(401);
    });

    it.each(["voyageur", "guichetier", "comptable", "superviseur"] as const)(
      "le rôle %s ne voit ni ne demande rien : 403",
      async (role) => {
        const autre = await t.compte(role);
        expect((await offre(autre.jeton)).status).toBe(403);
        expect((await demander(1_000_000, {}, autre.jeton)).status).toBe(403);
        expect((await dossier("AV-2026-0001", autre.jeton)).status).toBe(403);
        expect((await retirer("AV-2026-0001", {}, autre.jeton)).status).toBe(403);
      },
    );

    it("un patron sans agence : 403 AGENCE_REQUISE", async () => {
      const orphelin = await t.compte("patron", { compagnieId: null });
      const r = await offre(orphelin.jeton);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("AGENCE_REQUISE");
    });

    it("le dossier d'une autre agence n'existe pas : 404 DOSSIER_INCONNU", async () => {
      const r = await demander(6_000_000);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const id = r.body.dossier.id as string;
      const voisin = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
      const lu = await dossier(id, voisin.jeton);
      expect(lu.status).toBe(404);
      expect(lu.body.code).toBe("DOSSIER_INCONNU");
      // Il ne peut pas non plus le retirer, ni deviner son existence par une autre erreur.
      const retire = await retirer(id, {}, voisin.jeton);
      expect(retire.status).toBe(404);
      expect(retire.body.code).toBe("DOSSIER_INCONNU");
      expect((await dossier(id)).body.statut).toBe("en_analyse");
    });

    it("un identifiant mal formé ou inconnu : 404 DOSSIER_INCONNU", async () => {
      for (const id of ["AV-2026-9999", "n-importe-quoi", "AV-26-1"]) {
        const r = await dossier(id);
        expect(r.status, id).toBe(404);
        expect(r.body.code).toBe("DOSSIER_INCONNU");
      }
    });
  });

  /* ------------------------------------------------------------------ offre */

  describe("offre", () => {
    it("respecte OffreFinancementSchema et reprend les chiffres de la planche", async () => {
      t.credits.offres.set(AGENCE, {
        description: "2 téléphones + imprimante pour la nouvelle gare",
        montantTotal: 1_100_000,
        mensualites: 12,
        montantMensualite: 100_000,
      });
      t.salaires.parAgence.set(AGENCE, [
        ...salairesTypes(),
        { personneId: "p-0", nom: "Sans salaire", montant: 0, compte: null },
      ]);
      const r = await offre();
      expect(r.status).toBe(200);
      const o = patron.OffreFinancementSchema.parse(r.body);
      expect(o.partenaire).toBe("Banque Atlantique");
      expect(o.conventionSignee).toBe(true);
      expect(o.avance).toEqual({
        statut: "eligible",
        plafond: 12_000_000,
        equivalentJoursDeVentes: 10,
        montantPropose: 6_000_000,
        conditions: { remboursementPctVentesMomo: 8, dureeEstimeeSemaines: 10, coutTotalPct: null },
        versementSousHeures: 24,
      });
      expect(o.creditMateriel).toEqual({
        description: "2 téléphones + imprimante pour la nouvelle gare",
        montantTotal: 1_100_000,
        mensualites: 12,
        montantMensualite: 100_000,
      });
      // Les 4 salariés comptés sont ceux que le module équipe calcule (3 ici, celui à 0 F est compté aussi).
      expect(o.paie).toEqual({ nbSalaires: 4, jourDeVersement: "vendredi" });
      expect(o.billetEnDeuxFois).toEqual({
        actif: false,
        exemple: { prixBillet: 7_500, reservation: 4_000, veille: 3_500 },
      });
      expect(r.headers["cache-control"]).toBe("no-store");
    });

    it("convention non signée : partenaire absent, avance non éligible, plafond à zéro", async () => {
      t.agenceEligible(AGENCE, { signee: false });
      const o = patron.OffreFinancementSchema.parse((await offre()).body);
      expect(o.partenaire).toBeNull();
      expect(o.conventionSignee).toBe(false);
      expect(o.avance.statut).toBe("non_eligible");
      expect(o.avance.plafond).toBe(0);
      expect(o.avance.montantPropose).toBe(0);
    });

    it("agence sans données : réponse valide, non éligible, pas d'offre de crédit", async () => {
      const neuf = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
      const o = patron.OffreFinancementSchema.parse((await offre(neuf.jeton)).body);
      expect(o.partenaire).toBeNull();
      expect(o.avance.statut).toBe("non_eligible");
      expect(o.creditMateriel.montantTotal).toBe(0);
      expect(o.paie.nbSalaires).toBe(0);
    });

    it("moins de 90 jours d'historique : non éligible", async () => {
      t.donnees.ventesParAgence.set(AGENCE, {
        joursCouverts: 60,
        total: 70_000_000,
        billets: 5000,
        colis: 1000,
        ventesMomo: 60_000_000,
      });
      const o = patron.OffreFinancementSchema.parse((await offre()).body);
      expect(o.avance.statut).toBe("non_eligible");
    });

    it("l'exemple du paiement en 2 fois suit le prix de billet de l'agence", async () => {
      t.donnees.prix.set(AGENCE, 12_000);
      const o = patron.OffreFinancementSchema.parse((await offre()).body);
      expect(o.billetEnDeuxFois.exemple).toEqual({
        prixBillet: 12_000,
        reservation: 6_000,
        veille: 6_000,
      });
    });

    it("une agence ne voit jamais l'offre d'une autre", async () => {
      const voisin = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
      t.credits.offres.set(AGENCE, {
        description: "Secret de l'agence 1",
        montantTotal: 5,
        mensualites: 1,
        montantMensualite: 5,
      });
      const o = patron.OffreFinancementSchema.parse((await offre(voisin.jeton)).body);
      expect(JSON.stringify(o)).not.toContain("Secret");
    });
  });

  /* ------------------------------------------------------------------ demander */

  describe("demander l'avance", () => {
    it("crée le dossier, l'envoie au partenaire et respecte AvanceDemandeeSchema", async () => {
      const r = await demander(6_000_000);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const accuse = patron.AvanceDemandeeSchema.parse(r.body);
      expect(accuse.signePar).toBe(chef.id);
      const d = accuse.dossier;
      expect(d.id).toBe("AV-2026-0001");
      expect(d.produit).toBe("avance");
      expect(d.statut).toBe("en_analyse");
      expect(d.partenaire).toBe("Banque Atlantique");
      expect(d.montant).toBe(6_000_000);
      expect(d.envoyeA).toBe("2026-11-02T09:00:00.000+01:00");
      expect(d.reponseAvant).toBe("2026-11-03T09:00:00.000+01:00");
      expect(d.conditions).toEqual({
        remboursementPctVentesMomo: 8,
        dureeEstimeeSemaines: 10,
        coutTotalPct: null,
      });
      expect(d.retirable).toBe(true);
      expect(d.pieces.map((p) => [p.nom, p.detail, p.format])).toEqual([
        ["90 jours de ventes certifiées AfriMove", "108 M · 8 940 billets · 2 310 colis", "pdf"],
        ["Relevés MoMo rapprochés · 3 mois", "99,8 % de correspondance", "csv"],
        ["Registre de commerce · carte contribuable", "fournis à l'inscription · valides", "pdf"],
        [
          "Mandat de prélèvement 8 % · signé PIN",
          "sur le compte marchand MoMo · révocable à solde zéro",
          "pdf",
        ],
      ]);
      expect(d.suivi.map((e) => [e.code, e.etat])).toEqual([
        ["envoye", "fait"],
        ["analyse", "en_cours"],
        ["versement", "a_venir"],
      ]);
      expect(d.suivi[0]!.detail).toBe("aujourd'hui 09:00 · accusé reçu du partenaire");
    });

    it("transmet au partenaire le dossier, les pièces et le mandat, sans PIN ni numéro de téléphone", async () => {
      const r = await demander(6_000_000);
      const recu = t.partenaire.recus.get(r.body.dossier.id)!;
      expect(recu.montant).toBe(6_000_000);
      expect(recu.agenceId).toBe(AGENCE);
      expect(recu.pieces).toHaveLength(4);
      expect(recu.mandat).toMatchObject({ pourcentage: 8, operateur: "mtn" });
      expect(JSON.stringify(recu)).not.toContain(PIN_PATRON);
      expect(JSON.stringify(recu)).not.toContain(chef.telephone);
    });

    it("ne laisse sortir ni la référence du partenaire, ni l'agence, ni le mandat", async () => {
      const r = await demander(6_000_000);
      const texte = JSON.stringify(r.body);
      expect(texte).not.toContain("PART-");
      expect(texte).not.toContain("marchand-");
      expect(texte).not.toContain(AGENCE);
      expect(Object.keys(r.body.dossier).sort()).toEqual(
        [
          "conditions",
          "envoyeA",
          "id",
          "montant",
          "partenaire",
          "pieces",
          "produit",
          "reponseAvant",
          "retirable",
          "statut",
          "suivi",
        ].sort(),
      );
    });

    it("le dossier se relit, et l'offre passe à « en cours » avec le montant demandé", async () => {
      const r = await demander(4_000_000);
      const lu = await dossier(r.body.dossier.id);
      expect(lu.status).toBe(200);
      expect(patron.DossierFinancementSchema.parse(lu.body)).toEqual(r.body.dossier);
      const o = patron.OffreFinancementSchema.parse((await offre()).body);
      expect(o.avance.statut).toBe("en_cours");
      // L'offre renvoie vers le dossier ouvert (écran FinancementDemande).
      expect(o.avance.dossierId).toBe(r.body.dossier.id);
      expect(o.avance.montantPropose).toBe(4_000_000);
      expect(o.avance.conditions.dureeEstimeeSemaines).toBe(
        r.body.dossier.conditions.dureeEstimeeSemaines,
      );
    });

    it("accepte exactement le plafond", async () => {
      const r = await demander(12_000_000);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    });

    it("au-dessus du plafond : 422 AU_DESSUS_DU_PLAFOND, aucun dossier, aucun envoi", async () => {
      const r = await demander(12_000_001);
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("AU_DESSUS_DU_PLAFOND");
      expect(r.body.message).toContain("12000000");
      expect(t.dossiers.lignes.size).toBe(0);
      expect(t.partenaire.recus.size).toBe(0);
    });

    it("en dessous du minimum : 422 EN_DESSOUS_DU_MINIMUM", async () => {
      for (const montant of [0, 99_999]) {
        const r = await demander(montant);
        expect(r.status, String(montant)).toBe(422);
        expect(r.body.code).toBe("EN_DESSOUS_DU_MINIMUM");
      }
    });

    it("un refus ne consomme pas de numéro de dossier", async () => {
      await demander(99_999);
      await demander(99_000_000);
      const r = await demander(6_000_000);
      expect(r.body.dossier.id).toBe("AV-2026-0001");
    });

    it("convention non signée : 409 CONVENTION_NON_SIGNEE", async () => {
      t.agenceEligible(AGENCE, { signee: false });
      const r = await demander(6_000_000);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("CONVENTION_NON_SIGNEE");
      expect(t.dossiers.lignes.size).toBe(0);
    });

    it("agence non éligible : 409 NON_ELIGIBLE avec les raisons", async () => {
      t.donnees.piecesParAgence.set(AGENCE, { registreEtCarteValides: false });
      t.donnees.releves.set(AGENCE, { mois: 3, correspondancePct: 80 });
      const r = await demander(6_000_000);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("NON_ELIGIBLE");
      expect(r.body.details.raisons).toEqual(["rapprochement_insuffisant", "pieces_invalides"]);
    });

    it("sans compte marchand MoMo : 409 COMPTE_MARCHAND_ABSENT (le mandat serait impossible)", async () => {
      t.donnees.comptes.delete(AGENCE);
      const r = await demander(6_000_000);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("COMPTE_MARCHAND_ABSENT");
    });

    it("une seule demande à la fois : la seconde est refusée 409 DEMANDE_EN_COURS", async () => {
      expect((await demander(6_000_000)).status).toBe(201);
      const r = await demander(2_000_000);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("DEMANDE_EN_COURS");
      expect(t.dossiers.lignes.size).toBe(1);
    });

    it("deux demandes simultanées : une seule passe", async () => {
      const [a, b] = await Promise.all([demander(6_000_000), demander(6_000_000)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(t.dossiers.lignes.size).toBe(1);
      expect(t.partenaire.recus.size).toBe(1);
    });

    it("deux agences demandent chacune la leur, avec des numéros qui se suivent", async () => {
      t.agenceEligible(AUTRE_AGENCE);
      const voisin = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
      const a = await demander(6_000_000);
      const b = await demander(6_000_000, {}, voisin.jeton);
      expect(a.body.dossier.id).toBe("AV-2026-0001");
      expect(b.body.dossier.id).toBe("AV-2026-0002");
    });

    it("après un refus du partenaire, l'agence peut redemander", async () => {
      const r = await demander(6_000_000);
      await t.notifier({
        type: "refuse",
        reference: `PART-${r.body.dossier.id}`,
        at: t.iso(),
        motif: "Dossier incomplet",
      });
      const encore = await demander(3_000_000);
      expect(encore.status, JSON.stringify(encore.body)).toBe(201);
      expect(encore.body.dossier.id).toBe("AV-2026-0002");
    });

    it("partenaire injoignable : le dossier est créé, « envoyé » sans accusé, et rejoué ensuite", async () => {
      t.partenaire.panne = true;
      const r = await demander(6_000_000);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.dossier.statut).toBe("envoye");
      expect(r.body.dossier.retirable).toBe(true);
      expect(r.body.dossier.suivi[0].detail).toContain("n'a pas encore accusé réception");
      expect(t.partenaire.recus.size).toBe(0);

      expect(await t.taches.rejouerTransmissions()).toBe(0);
      t.partenaire.panne = false;
      expect(await t.taches.rejouerTransmissions()).toBe(1);
      const lu = (await dossier(r.body.dossier.id)).body;
      expect(lu.statut).toBe("en_analyse");
      expect(lu.suivi[0].detail).toContain("accusé reçu du partenaire");
      // Rejouer encore n'envoie pas deux fois.
      expect(await t.taches.rejouerTransmissions()).toBe(0);
      expect(t.partenaire.recus.size).toBe(1);
    });
  });

  /* ------------------------------------------------------------------ signature PIN */

  describe("signature PIN", () => {
    it("sans signature : 401 PIN_REQUIS, rien n'est créé", async () => {
      const r = await t
        .http()
        .post("/patron/financement/demandes")
        .set(t.entete(chef.jeton))
        .send({ montant: 6_000_000 });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe("PIN_REQUIS");
      expect(t.dossiers.lignes.size).toBe(0);
    });

    it("PIN faux : 403 PIN_INCORRECT, rien n'est créé, l'essai est tracé sans le PIN", async () => {
      const r = await demander(6_000_000, { signature: t.signature("111111") });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("PIN_INCORRECT");
      expect(t.dossiers.lignes.size).toBe(0);
      const refus = t.auditRepo.lignes.filter((l) => l.action === "financement.demander");
      expect(refus).toHaveLength(1);
      expect(refus[0]!.resultat).toBe("refus");
      expect(JSON.stringify(refus.map((l) => l.details))).not.toContain("111111");
      expect(JSON.stringify(refus.map((l) => l.details))).not.toContain(PIN_PATRON);
    });

    it("trois PIN faux bloquent le compte : 423, même avec le bon PIN ensuite", async () => {
      for (let i = 0; i < 3; i++) {
        await demander(6_000_000, { signature: t.signature("111111") });
      }
      const r = await demander(6_000_000);
      expect(r.status).toBe(423);
      expect(r.body.code).toBe("PIN_BLOQUE");
      expect(t.dossiers.lignes.size).toBe(0);
    });

    it("heure de l'appareil trop éloignée : 422 SIGNATURE_PERIMEE", async () => {
      const r = await demander(6_000_000, {
        signature: { pin: PIN_PATRON, methode: "pin", signeA: t.iso(-11 * 60_000) },
      });
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("SIGNATURE_PERIMEE");
    });

    it("corps invalide mais signé : 422 COMMANDE_INVALIDE", async () => {
      const r = await demander(6_000_000, { montant: "beaucoup", extra: true });
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("COMMANDE_INVALIDE");
    });

    it("la demande acceptée entre au journal (sans PIN) avec son accusé", async () => {
      const r = await demander(6_000_000);
      const ligne = t.auditRepo.lignes.find((l) => l.action === "financement.demander");
      expect(ligne).toBeDefined();
      expect(ligne!.resultat).toBe("succes");
      expect(ligne!.id).toBe(r.body.journalId);
      expect(ligne!.acteurId).toBe(chef.id);
      expect(JSON.stringify(ligne!.details)).not.toContain(PIN_PATRON);
    });
  });

  /* ------------------------------------------------------------------ retirer */

  describe("retirer la demande", () => {
    async function dossierEnCours() {
      const r = await demander(6_000_000);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.dossier.id as string;
    }

    it("retire la demande tant qu'elle n'est pas versée (DemandeRetireeSchema)", async () => {
      const id = await dossierEnCours();
      const r = await retirer(id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const accuse = patron.DemandeRetireeSchema.parse(r.body);
      expect(accuse.dossier.statut).toBe("retire");
      expect(accuse.dossier.retirable).toBe(false);
      expect(accuse.dossier.suivi.map((e) => e.etat)).toEqual(["fait", "a_venir", "a_venir"]);
      expect(t.partenaire.retires.has(`PART-${id}`)).toBe(true);
      expect((await dossier(id)).body.statut).toBe("retire");
    });

    it("l'offre redevient éligible et l'agence peut redemander", async () => {
      const id = await dossierEnCours();
      await retirer(id);
      const o = patron.OffreFinancementSchema.parse((await offre()).body);
      expect(o.avance.statut).toBe("eligible");
      expect(o.avance.dossierId).toBeUndefined();
      expect((await demander(3_000_000)).status).toBe(201);
    });

    it("rejouer le retrait d'un dossier déjà retiré répond la même chose (200)", async () => {
      const id = await dossierEnCours();
      expect((await retirer(id)).status).toBe(200);
      const encore = await retirer(id);
      expect(encore.status).toBe(200);
      expect(encore.body.dossier.statut).toBe("retire");
    });

    it("le retrait est signé : sans signature 401, PIN faux 403, et le dossier reste en analyse", async () => {
      const id = await dossierEnCours();
      const sans = await t
        .http()
        .post(`/patron/financement/demandes/${id}/retrait`)
        .set(t.entete(chef.jeton))
        .send({ dossierId: id });
      expect(sans.status).toBe(401);
      expect(sans.body.code).toBe("PIN_REQUIS");
      const faux = await retirer(id, { signature: t.signature("999999") });
      expect(faux.status).toBe(403);
      expect(faux.body.code).toBe("PIN_INCORRECT");
      expect((await dossier(id)).body.statut).toBe("en_analyse");
      expect(t.partenaire.retires.size).toBe(0);
    });

    it("le dossier du corps doit être celui de l'URL : 422", async () => {
      const id = await dossierEnCours();
      const r = await retirer(id, { dossierId: "AV-2026-0002" });
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("COMMANDE_INVALIDE");
      expect((await dossier(id)).body.statut).toBe("en_analyse");
    });

    it("dossier inconnu : 404 DOSSIER_INCONNU", async () => {
      const r = await retirer("AV-2026-0042");
      expect(r.status).toBe(404);
      expect(r.body.code).toBe("DOSSIER_INCONNU");
    });

    it("une fois versé : 409 DOSSIER_NON_RETIRABLE, le dossier reste versé", async () => {
      const id = await dossierEnCours();
      await t.notifier({
        type: "verse",
        reference: `PART-${id}`,
        at: t.iso(),
        coutTotalPct: 5,
      });
      const lu = (await dossier(id)).body;
      expect(lu.statut).toBe("verse");
      expect(lu.retirable).toBe(false);
      const r = await retirer(id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("DOSSIER_NON_RETIRABLE");
      expect((await dossier(id)).body.statut).toBe("verse");
      expect(t.partenaire.retires.size).toBe(0);
    });

    it("après un refus : 409 DOSSIER_NON_RETIRABLE", async () => {
      const id = await dossierEnCours();
      await t.notifier({ type: "refuse", reference: `PART-${id}`, at: t.iso(), motif: "Non" });
      const r = await retirer(id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("DOSSIER_NON_RETIRABLE");
    });

    it("le partenaire a versé en même temps : le retrait est refusé et le dossier prend l'issue du partenaire", async () => {
      const id = await dossierEnCours();
      const reference = `PART-${id}`;
      t.partenaire.dejaVerses.add(reference);
      t.partenaire.decisions.set(reference, {
        type: "verse",
        reference,
        at: t.iso(),
        coutTotalPct: 4,
      });
      const r = await retirer(id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("DOSSIER_NON_RETIRABLE");
      const lu = (await dossier(id)).body;
      expect(lu.statut).toBe("verse");
      expect(lu.conditions.coutTotalPct).toBe(4);
    });

    it("partenaire injoignable : 503, le dossier n'est pas marqué retiré (il pourrait être versé)", async () => {
      const id = await dossierEnCours();
      t.partenaire.panne = true;
      const r = await retirer(id);
      expect(r.status).toBe(503);
      expect(r.body.code).toBe("PARTENAIRE_INDISPONIBLE");
      t.partenaire.panne = false;
      expect((await dossier(id)).body.statut).toBe("en_analyse");
      // Le patron réessaie : cette fois le partenaire répond.
      expect((await retirer(id)).status).toBe(200);
    });

    it("dossier jamais reçu par le partenaire : retiré sans l'appeler, et jamais envoyé ensuite", async () => {
      t.partenaire.panne = true;
      const id = (await demander(6_000_000)).body.dossier.id as string;
      const r = await retirer(id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.dossier.statut).toBe("retire");
      t.partenaire.panne = false;
      await t.taches.rejouerTransmissions();
      expect(t.partenaire.recus.size).toBe(0);
      expect((await dossier(id)).body.statut).toBe("retire");
    });

    it("deux retraits simultanés : les deux répondent 200, le dossier est retiré une fois", async () => {
      const id = await dossierEnCours();
      const [a, b] = await Promise.all([retirer(id), retirer(id)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((await dossier(id)).body.statut).toBe("retire");
    });

    it("le retrait entre au journal avec le dossier visé", async () => {
      const id = await dossierEnCours();
      await retirer(id);
      const ligne = t.auditRepo.lignes.find((l) => l.action === "financement.retirer");
      expect(ligne?.resultat).toBe("succes");
      expect(ligne?.cibleId).toBe(id);
    });
  });
});
