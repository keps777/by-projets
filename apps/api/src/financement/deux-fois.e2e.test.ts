import { patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENCE,
  AUTRE_AGENCE,
  creerAppFinancementTest,
  type AppFinancementTest,
} from "./testing/app-financement-test";

describe("paiement du billet en 2 fois (option par agence)", () => {
  let t: AppFinancementTest;
  let chef: { id: string; jeton: string; telephone: string };

  beforeEach(async () => {
    t = await creerAppFinancementTest();
    chef = await t.compte("patron");
  });
  afterEach(async () => {
    await t.fermer();
  });

  const regler = (actif: unknown, over: Record<string, unknown> = {}, jeton = chef.jeton) =>
    t
      .http()
      .put("/patron/financement/billet-en-deux-fois")
      .set(t.entete(jeton))
      .send({ actif, signature: t.signature(), ...over });

  const offre = async (jeton = chef.jeton) =>
    patron.OffreFinancementSchema.parse(
      (await t.http().get("/patron/financement").set(t.entete(jeton))).body,
    );

  it("est coupé par défaut, l'offre le dit avec l'exemple de la planche", async () => {
    const o = await offre();
    expect(o.billetEnDeuxFois).toEqual({
      actif: false,
      exemple: { prixBillet: 7_500, reservation: 4_000, veille: 3_500 },
    });
    expect(await t.deuxFois.plan(AGENCE, 7_500)).toBeNull();
  });

  it("le patron l'active, signé par son PIN : l'offre et le plan suivent", async () => {
    const r = await regler(true);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ actif: true, signePar: chef.id });
    expect((await offre()).billetEnDeuxFois.actif).toBe(true);
    expect(await t.deuxFois.plan(AGENCE, 7_500)).toEqual({ reservation: 4_000, veille: 3_500 });
    // Un billet trop petit pour être coupé n'a pas de plan, même option active.
    expect(await t.deuxFois.plan(AGENCE, 500)).toBeNull();
  });

  it("puis le coupe : plus de plan", async () => {
    await regler(true);
    await regler(false);
    expect((await offre()).billetEnDeuxFois.actif).toBe(false);
    expect(await t.deuxFois.plan(AGENCE, 7_500)).toBeNull();
  });

  it("l'option est propre à chaque agence", async () => {
    const voisin = await t.compte("patron", { compagnieId: AUTRE_AGENCE });
    await regler(true);
    expect((await offre(voisin.jeton)).billetEnDeuxFois.actif).toBe(false);
    expect(await t.deuxFois.plan(AUTRE_AGENCE, 7_500)).toBeNull();
    expect(await t.deuxFois.actif(AGENCE)).toBe(true);
  });

  it("sans signature : 401 PIN_REQUIS ; PIN faux : 403 ; rien ne change", async () => {
    const sans = await t
      .http()
      .put("/patron/financement/billet-en-deux-fois")
      .set(t.entete(chef.jeton))
      .send({ actif: true });
    expect(sans.status).toBe(401);
    expect(sans.body.code).toBe("PIN_REQUIS");
    const faux = await regler(true, { signature: t.signature("111111") });
    expect(faux.status).toBe(403);
    expect(await t.deuxFois.actif(AGENCE)).toBe(false);
  });

  it("corps invalide : 422 ; autres rôles : 403", async () => {
    expect((await regler("oui")).status).toBe(422);
    expect((await regler(true, { extra: 1 })).status).toBe(422);
    const guichetier = await t.compte("guichetier");
    expect((await regler(true, {}, guichetier.jeton)).status).toBe(403);
    expect(await t.deuxFois.actif(AGENCE)).toBe(false);
  });

  it("le changement entre au journal", async () => {
    const r = await regler(true);
    const ligne = t.auditRepo.lignes.find((l) => l.action === "financement.billet_en_deux_fois");
    expect(ligne?.resultat).toBe("succes");
    expect(ligne?.id).toBe(r.body.journalId);
  });
});
