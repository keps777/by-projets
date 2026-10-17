import { patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerAppFinancementTest, type AppFinancementTest } from "./testing/app-financement-test";

describe("financement : réponses du partenaire", () => {
  let t: AppFinancementTest;
  let chef: { id: string; jeton: string; telephone: string };
  let id: string;
  let reference: string;

  beforeEach(async () => {
    t = await creerAppFinancementTest();
    chef = await t.compte("patron");
    t.agenceEligible();
    const r = await t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(chef.jeton))
      .send({ montant: 6_000_000, signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    id = r.body.dossier.id;
    reference = `PART-${id}`;
  });
  afterEach(async () => {
    await t.fermer();
  });

  const lire = async () =>
    patron.DossierFinancementSchema.parse(
      (await t.http().get(`/patron/financement/demandes/${id}`).set(t.entete(chef.jeton))).body,
    );

  describe("authentification de l'appel", () => {
    it("sans secret du partenaire : 401, le dossier ne bouge pas", async () => {
      const r = await t.notifier({ type: "refuse", reference, at: t.iso(), motif: "x" }, null);
      expect(r.status).toBe(401);
      expect(r.body.code).toBe("SIGNATURE_INVALIDE");
      expect((await lire()).statut).toBe("en_analyse");
    });

    it("mauvais secret : 401", async () => {
      const r = await t.notifier({ type: "refuse", reference, at: t.iso(), motif: "x" }, "autre");
      expect(r.status).toBe(401);
      expect((await lire()).statut).toBe("en_analyse");
    });

    it("l'appel du partenaire n'a pas besoin de jeton, mais un jeton de patron ne le remplace pas", async () => {
      const r = await t
        .http()
        .post("/financement/partenaire/notifications")
        .set(t.entete(chef.jeton))
        .send({ type: "refuse", reference, at: t.iso(), motif: "x" });
      expect(r.status).toBe(401);
      expect((await lire()).statut).toBe("en_analyse");
    });

    it("corps illisible : 400 NOTIFICATION_ILLISIBLE", async () => {
      const r = await t.notifier({ type: "paye", reference });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe("NOTIFICATION_ILLISIBLE");
    });

    it("référence inconnue : 404 REFERENCE_INCONNUE", async () => {
      const r = await t.notifier({ type: "accuse", reference: "PART-AV-2026-0099", at: t.iso() });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe("REFERENCE_INCONNUE");
    });
  });

  describe("versement", () => {
    const verse = (over: Record<string, unknown> = {}) => ({
      type: "verse",
      reference,
      at: "2026-11-02T16:00:00.000+01:00",
      coutTotalPct: 5,
      ...over,
    });

    it("le dossier passe à versé avec le coût fixé par le partenaire ; le patron est prévenu par SMS", async () => {
      const r = await t.notifier(verse());
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toEqual({ dossier: id, statut: "verse" });
      const d = await lire();
      expect(d.statut).toBe("verse");
      expect(d.retirable).toBe(false);
      expect(d.montant).toBe(6_000_000);
      expect(d.conditions.coutTotalPct).toBe(5);
      expect(d.suivi.map((e) => e.etat)).toEqual(["fait", "fait", "fait"]);
      expect(d.suivi[2]!.detail).toContain("Versement sur ton compte");
      const sms = t.sms.messages().filter((m) => m.telephone === chef.telephone);
      expect(sms).toHaveLength(1);
      expect(sms[0]!.message).toContain("6 000 000 FCFA");
      expect(sms[0]!.message).toContain(id);
      // Ce qui est dû : le montant versé plus le coût (6 M + 5 %).
      expect(t.dossiers.lignes.get(id)!.resteDu).toBe(6_300_000);
    });

    it("rejouer la notification ne change rien et n'envoie pas un second SMS", async () => {
      await t.notifier(verse());
      const encore = await t.notifier(verse({ at: "2026-11-02T17:00:00.000+01:00" }));
      expect(encore.status).toBe(200);
      expect(t.sms.messages().filter((m) => m.telephone === chef.telephone)).toHaveLength(1);
      expect(t.dossiers.lignes.get(id)!.verseA).toBe("2026-11-02T16:00:00.000+01:00");
    });

    it("le partenaire peut verser moins que demandé : le dossier prend le montant versé", async () => {
      await t.notifier(verse({ montant: 4_000_000 }));
      const d = await lire();
      expect(d.montant).toBe(4_000_000);
      expect(t.dossiers.lignes.get(id)!.resteDu).toBe(4_200_000);
    });

    it("jamais plus que demandé : 409 NOTIFICATION_INCOHERENTE, le dossier reste en analyse", async () => {
      const r = await t.notifier(verse({ montant: 6_000_001 }));
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("NOTIFICATION_INCOHERENTE");
      expect((await lire()).statut).toBe("en_analyse");
      expect(t.sms.messages().filter((m) => m.telephone === chef.telephone)).toHaveLength(0);
    });

    it("versement d'un dossier retiré ou refusé : 409 et tracé au journal", async () => {
      await t
        .http()
        .post(`/patron/financement/demandes/${id}/retrait`)
        .set(t.entete(chef.jeton))
        .send({ dossierId: id, signature: t.signature() });
      const r = await t.notifier(verse());
      expect(r.status).toBe(409);
      expect((await lire()).statut).toBe("retire");
      const trace = t.auditRepo.lignes.find((l) => l.action === "financement.notification");
      expect(trace?.resultat).toBe("refus");
      expect(trace?.cibleId).toBe(id);
    });
  });

  describe("refus", () => {
    it("le dossier passe à refusé, n'est plus retirable, le patron est prévenu", async () => {
      const r = await t.notifier({
        type: "refuse",
        reference,
        at: "2026-11-02T16:00:00.000+01:00",
        motif: "Dossier incomplet",
      });
      expect(r.status).toBe(200);
      const d = await lire();
      expect(d.statut).toBe("refuse");
      expect(d.retirable).toBe(false);
      expect(d.suivi.map((e) => e.etat)).toEqual(["fait", "fait", "a_venir"]);
      expect(t.sms.messages().filter((m) => m.telephone === chef.telephone)).toHaveLength(1);
    });

    it("le motif du partenaire n'est pas montré au patron (le contrat n'a pas de champ pour lui)", async () => {
      await t.notifier({
        type: "refuse",
        reference,
        at: t.iso(),
        motif: "Motif confidentiel du partenaire",
      });
      const texte = JSON.stringify(await lire());
      expect(texte).not.toContain("confidentiel");
    });

    it("refus d'un dossier versé : 409, le dossier reste versé", async () => {
      await t.notifier({ type: "verse", reference, at: t.iso(), coutTotalPct: 5 });
      const r = await t.notifier({ type: "refuse", reference, at: t.iso(), motif: "x" });
      expect(r.status).toBe(409);
      expect((await lire()).statut).toBe("verse");
    });

    it("refus d'un dossier déjà retiré par le patron : ignoré, le dossier reste retiré", async () => {
      await t
        .http()
        .post(`/patron/financement/demandes/${id}/retrait`)
        .set(t.entete(chef.jeton))
        .send({ dossierId: id, signature: t.signature() });
      const r = await t.notifier({ type: "refuse", reference, at: t.iso(), motif: "x" });
      expect(r.status).toBe(200);
      expect((await lire()).statut).toBe("retire");
    });
  });

  describe("accusé de réception", () => {
    it("rejouer un accusé ne change rien", async () => {
      const avant = t.dossiers.lignes.get(id)!;
      const r = await t.notifier({ type: "accuse", reference, at: t.iso(60_000) });
      expect(r.status).toBe(200);
      expect(t.dossiers.lignes.get(id)!.accuseA).toBe(avant.accuseA);
      expect(t.dossiers.lignes.get(id)!.version).toBe(avant.version);
    });
  });

  describe("notification perdue", () => {
    it("la tâche de fond interroge le partenaire et applique sa décision", async () => {
      t.partenaire.decisions.set(reference, {
        type: "verse",
        reference,
        at: t.iso(),
        coutTotalPct: 6,
      });
      await t.taches.interrogerPartenaire();
      const d = await lire();
      expect(d.statut).toBe("verse");
      expect(d.conditions.coutTotalPct).toBe(6);
    });

    it("sans décision ni réponse du partenaire, le dossier reste en analyse", async () => {
      await t.taches.interrogerPartenaire();
      t.partenaire.panne = true;
      await t.taches.interrogerPartenaire();
      expect((await lire()).statut).toBe("en_analyse");
    });
  });
});
