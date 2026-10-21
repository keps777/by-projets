import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENCE,
  AUTRE_AGENCE,
  creerAppFinancementTest,
  type AppFinancementTest,
} from "./testing/app-financement-test";

const VERSE_A = "2026-11-02T16:00:00.000+01:00";
const APRES = "2026-11-02T16:00:01.000+01:00";
const AVANT = "2026-11-02T15:59:59.000+01:00";

describe("financement : prélèvement d'un pourcentage des ventes MoMo", () => {
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

  /** Demande une avance de `montant` et la fait verser par le partenaire (coût en %). */
  async function avanceVersee(montant = 6_000_000, coutTotalPct = 0): Promise<string> {
    const r = await t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(chef.jeton))
      .send({ montant, signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const n = await t.notifier({
      type: "verse",
      reference: `PART-${r.body.dossier.id}`,
      at: VERSE_A,
      coutTotalPct,
    });
    expect(n.status, JSON.stringify(n.body)).toBe(200);
    return r.body.dossier.id as string;
  }

  const vente = (venteId: string, montant: number, at = APRES, agenceId = AGENCE) =>
    t.prelevementsService.enregistrerVenteMomo({ agenceId, venteId, montant, at });

  it("sans avance versée, rien n'est prélevé", async () => {
    expect(await vente("v1", 10_000)).toEqual({ resultat: "aucun_mandat" });
    expect(t.partenaire.prelevements.size).toBe(0);
  });

  it("une avance seulement demandée ou en analyse ne prélève rien", async () => {
    await t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(chef.jeton))
      .send({ montant: 6_000_000, signature: t.signature() });
    expect(await vente("v1", 10_000)).toEqual({ resultat: "aucun_mandat" });
  });

  it("démarre au premier billet MoMo qui suit le versement, pas avant", async () => {
    await avanceVersee();
    expect(await vente("avant", 10_000, AVANT)).toEqual({ resultat: "avant_versement" });
    expect(await vente("pile", 10_000, VERSE_A)).toEqual({ resultat: "avant_versement" });
    expect(t.partenaire.prelevements.size).toBe(0);
    expect(await vente("apres", 10_000, APRES)).toEqual({ resultat: "preleve", montant: 800 });
  });

  it("prélève 8 % de la vente, par ordre au partenaire, et l'enregistre exécuté", async () => {
    await avanceVersee();
    expect(await vente("v1", 12_500)).toEqual({ resultat: "preleve", montant: 1_000 });
    const ordre = t.partenaire.prelevements.get("prelevement:v1");
    expect(ordre).toMatchObject({ montant: 1_000 });
    const ligne = t.prelevements.lignes.get("prelevement:v1")!;
    expect(ligne).toMatchObject({
      etat: "execute",
      montant: 1_000,
      montantVente: 12_500,
      venteId: "v1",
      agenceId: AGENCE,
    });
    expect(ligne.reference).toBe(ordre!.reference);
  });

  it("la même vente n'est jamais prélevée deux fois, même signalée deux fois en même temps", async () => {
    await avanceVersee();
    expect(await vente("v1", 10_000)).toEqual({ resultat: "preleve", montant: 800 });
    expect(await vente("v1", 10_000)).toEqual({ resultat: "deja_compte" });
    const resultats = await Promise.all([
      vente("v2", 10_000),
      vente("v2", 10_000),
      vente("v2", 10_000),
    ]);
    expect(resultats.filter((r) => r.resultat === "preleve")).toHaveLength(1);
    expect(t.prelevements.lignes.size).toBe(2);
    expect(t.partenaire.prelevements.size).toBe(2);
  });

  it("un montant nul, négatif, décimal ou trop petit pour donner 1 F ne prélève rien", async () => {
    await avanceVersee();
    for (const montant of [0, -5_000, 100.5, 12]) {
      expect(await vente(`n${montant}`, montant), String(montant)).toEqual({
        resultat: "montant_nul",
      });
    }
    expect(t.prelevements.lignes.size).toBe(0);
  });

  it("jamais plus que ce qui reste dû ; la dette soldée révoque le mandat et prévient le patron", async () => {
    // 100 000 F à 0 % de coût : 100 000 F dus, à 8 % des ventes.
    const id = await avanceVersee(100_000, 0);
    expect(t.dossiers.lignes.get(id)!.resteDu).toBe(100_000);
    // 1 M de vente = 80 000 F, puis 1 M = 20 000 F (le reste), puis plus rien.
    expect(await vente("v1", 1_000_000)).toEqual({ resultat: "preleve", montant: 80_000 });
    expect(await vente("v2", 1_000_000)).toEqual({ resultat: "preleve", montant: 20_000 });
    expect(t.dossiers.lignes.get(id)!.mandat.actif).toBe(false);
    expect(t.dossiers.lignes.get(id)!.rembourseA).not.toBeNull();
    expect(await vente("v3", 1_000_000)).toEqual({ resultat: "aucun_mandat" });
    let total = 0;
    for (const o of t.partenaire.prelevements.values()) total += o.montant;
    expect(total).toBe(100_000);
    const sms = t.sms.messages().filter((m) => m.telephone === chef.telephone);
    expect(sms.at(-1)!.message).toContain("remboursée en totalité");
  });

  it("des ventes simultanées ne dépassent jamais ce qui est dû", async () => {
    const id = await avanceVersee(100_000, 0);
    const resultats = await Promise.all(
      Array.from({ length: 10 }, (_, i) => vente(`v${i}`, 1_000_000)),
    );
    let total = 0;
    for (const o of t.partenaire.prelevements.values()) total += o.montant;
    expect(total).toBe(100_000);
    expect(await t.prelevements.totalReserve(id)).toBe(100_000);
    expect(
      resultats.filter((r) => r.resultat === "preleve" || r.resultat === "solde_nul").length,
    ).toBeGreaterThan(0);
  });

  it("le coût du partenaire s'ajoute à ce qui est dû", async () => {
    const id = await avanceVersee(100_000, 10);
    expect(t.dossiers.lignes.get(id)!.resteDu).toBe(110_000);
    // 500 000 F de vente = 40 000 F : deux ventes font 80 000 F, la troisième ne prend que les 30 000 F restants.
    await vente("v1", 500_000);
    await vente("v2", 500_000);
    expect(t.dossiers.lignes.get(id)!.mandat.actif).toBe(true);
    expect(await vente("v3", 500_000)).toEqual({ resultat: "preleve", montant: 30_000 });
    expect(await t.prelevements.totalExecute(id)).toBe(110_000);
    expect(t.dossiers.lignes.get(id)!.mandat.actif).toBe(false);
  });

  it("soldée, l'agence peut demander une nouvelle avance", async () => {
    await avanceVersee(100_000, 0);
    await vente("v1", 1_000_000);
    await vente("v2", 1_000_000);
    const r = await t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(chef.jeton))
      .send({ montant: 200_000, signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  });

  it("tant que la dette n'est pas soldée, aucune nouvelle avance", async () => {
    await avanceVersee(100_000, 0);
    const r = await t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(chef.jeton))
      .send({ montant: 200_000, signature: t.signature() });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("DEMANDE_EN_COURS");
  });

  it("une vente d'une autre agence ne touche pas ce mandat", async () => {
    await avanceVersee();
    expect(await vente("v1", 10_000, APRES, AUTRE_AGENCE)).toEqual({ resultat: "aucun_mandat" });
    expect(t.partenaire.prelevements.size).toBe(0);
  });

  it("un dossier refusé ou retiré ne prélève rien", async () => {
    const r = await t
      .http()
      .post("/patron/financement/demandes")
      .set(t.entete(chef.jeton))
      .send({ montant: 6_000_000, signature: t.signature() });
    await t
      .http()
      .post(`/patron/financement/demandes/${r.body.dossier.id}/retrait`)
      .set(t.entete(chef.jeton))
      .send({ dossierId: r.body.dossier.id, signature: t.signature() });
    expect(await vente("v1", 10_000)).toEqual({ resultat: "aucun_mandat" });
  });

  describe("partenaire en panne ou qui refuse", () => {
    it("sans réponse : le prélèvement reste en attente, puis la tâche le rejoue sans doublon", async () => {
      const id = await avanceVersee();
      t.partenaire.panne = true;
      expect(await vente("v1", 10_000)).toEqual({ resultat: "en_attente", montant: 800 });
      expect(t.prelevements.lignes.get("prelevement:v1")!.etat).toBe("en_attente");
      expect(await t.prelevements.totalExecute(id)).toBe(0);
      // Tant que le partenaire est en panne, la tâche ne change rien.
      expect(await t.prelevementsService.rejouerEnAttente()).toBe(0);
      t.partenaire.panne = false;
      expect(await t.prelevementsService.rejouerEnAttente()).toBe(1);
      expect(t.prelevements.lignes.get("prelevement:v1")!.etat).toBe("execute");
      expect(await t.prelevementsService.rejouerEnAttente()).toBe(0);
      expect(t.partenaire.prelevements.size).toBe(1);
      expect(await t.prelevements.totalExecute(id)).toBe(800);
    });

    it("pendant l'attente, la vente est déjà réservée : un rejeu de la même vente ne la double pas", async () => {
      await avanceVersee();
      t.partenaire.panne = true;
      await vente("v1", 10_000);
      expect(await vente("v1", 10_000)).toEqual({ resultat: "deja_compte" });
      expect(t.prelevements.lignes.size).toBe(1);
    });

    it("refus définitif : la réservation disparaît, l'agence garde cette vente", async () => {
      const id = await avanceVersee();
      t.partenaire.prelevementRefuse = true;
      expect(await vente("v1", 10_000)).toEqual({ resultat: "refuse", montant: 800 });
      expect(t.prelevements.lignes.size).toBe(0);
      expect(await t.prelevements.totalReserve(id)).toBe(0);
    });

    it("la tâche de fond rejoue aussi les prélèvements dans la tâche de fond complète", async () => {
      await avanceVersee();
      t.partenaire.panne = true;
      await vente("v1", 10_000);
      t.partenaire.panne = false;
      await t.taches.toutExecuter();
      expect(t.prelevements.lignes.get("prelevement:v1")!.etat).toBe("execute");
    });
  });
});
