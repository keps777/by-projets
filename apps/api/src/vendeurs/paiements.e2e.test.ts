import { afterEach, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART_ALPHA,
  DEPART_ELITE_VIP,
  creerAppVendeursTest,
  type AppVendeursTest,
} from "./testing/app-vendeurs-test";

/**
 * Le règlement de l'agence passe par le vrai module des paiements (agrégateur simulé) et les SMS par
 * la vraie passerelle : le vendeur paie l'agence comme un guichet, tout l'argent va à la compagnie.
 */
describe("vendeurs : le règlement de l'agence par les paiements et les SMS réels", () => {
  let t: AppVendeursTest;
  afterEach(async () => {
    await t.fermer();
  });

  const clePaiement = (compagnieId: string, venteId: string) => `guichet:${compagnieId}:${venteId}`;

  it("paiement réussi : tout le prix va au compte de l'agence, le billet part par la passerelle SMS", async () => {
    t = await creerAppVendeursTest({
      reglement: "paiements",
      messages: "reel",
      issueAgregateur: "reussi",
    });
    const v = await t.creerVendeur({});
    const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(rep.body).toMatchObject({ prix: 4000, aRegler: 4000, commission: 100 });

    const vente = [...t.ventes.lignes.values()][0]!;
    const paiement = await t.paiements.parCle(clePaiement(COMPAGNIE, vente.id));
    expect(paiement).toMatchObject({
      origine: "guichet",
      statut: "reussi",
      moyen: "mtn_momo",
      montant: 4000,
      compagnieId: COMPAGNIE,
    });
    // AfriMove n'en prend rien, le vendeur non plus : un seul bénéficiaire, l'agence, pour 4 000 F.
    expect(paiement?.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: "compte-alpha", montant: 4000 },
    ]);
    // Le push est parti vers le numéro MoMo du vendeur, pas vers celui du voisin.
    const demande = t.agregateur.transactions.get(paiement!.id);
    expect(demande?.demande.telephone).toBe(v.telephone);
    expect(demande?.demande.montantFcfa).toBe(4000);

    // Le billet est dans la passerelle SMS, à destination du voisin, relié au billet et au vendeur.
    const messages = await t.journalSms.lister({ type: "billet", demandeurId: v.id });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      reference: { type: "billet", id: rep.body.billetId },
      compagnieId: COMPAGNIE,
    });
    expect(messages[0]?.destinataireMasque).toContain("456");
  });

  it("la même vente envoyée deux fois ne débite qu'une fois et n'envoie qu'un SMS", async () => {
    t = await creerAppVendeursTest({ reglement: "paiements", messages: "reel" });
    const v = await t.creerVendeur({});
    const a = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
    const b = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.body.billetId).toBe(a.body.billetId);
    expect(t.agregateur.transactions.size).toBe(1);
    expect(await t.journalSms.lister({ type: "billet" })).toHaveLength(1);
    expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
  });

  it("l'opérateur n'a pas encore répondu : 409, puis le billet part quand l'agrégateur confirme", async () => {
    t = await creerAppVendeursTest({
      reglement: "paiements",
      messages: "reel",
      issueAgregateur: "en_attente",
    });
    const v = await t.creerVendeur({});
    const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
    expect([rep.status, rep.body.code]).toEqual([409, "reglement_en_attente"]);
    const vente = [...t.ventes.lignes.values()][0]!;
    expect(vente.etat).toBe("en_attente");
    expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
    expect(await t.journalSms.lister({ type: "billet" })).toHaveLength(0);
    expect(t.commissions.creditsLignes.size).toBe(0);

    // Le vendeur valide sur son téléphone : la tâche de fond finit la vente.
    const paiement = await t.paiements.parCle(clePaiement(COMPAGNIE, vente.id));
    t.agregateur.terminer(paiement!.id, "reussi");
    const bilan = await t.services.taches.reprendreVentes();
    expect(bilan.terminees).toBe(1);
    expect((await t.ventes.trouver(vente.id))?.etat).toBe("terminee");
    expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
    expect(await t.journalSms.lister({ type: "billet" })).toHaveLength(1);
    expect(t.commissions.creditsLignes.size).toBe(1);
    expect(t.agregateur.transactions.size).toBe(1);
  });

  it("l'opérateur refuse : 402, aucun billet ni SMS ni commission, siège rendu", async () => {
    t = await creerAppVendeursTest({
      reglement: "paiements",
      messages: "reel",
      issueAgregateur: "echoue",
    });
    const v = await t.creerVendeur({});
    const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
    expect([rep.status, rep.body.code]).toEqual([402, "reglement_refuse"]);
    expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(0);
    expect(await t.journalSms.lister({ type: "billet" })).toHaveLength(0);
    expect(t.commissions.creditsLignes.size).toBe(0);
    expect([...t.ventes.lignes.values()][0]?.etat).toBe("refusee");
  });

  it("une agence sans compte de reversement ne peut pas être payée : refus net, rien n'est vendu", async () => {
    t = await creerAppVendeursTest({ reglement: "paiements", sansCompteElite: true });
    const v = await t.creerVendeur({
      compagnies: [AUTRE_COMPAGNIE],
      telephone: "+237691000032",
      operateur: "orange",
    });
    const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ELITE_VIP, {}, "orange_money"));
    expect(rep.status, JSON.stringify(rep.body)).toBe(402);
    expect(rep.body.code).toBe("reglement_refuse");
    expect(await t.billets.duDepart(DEPART_ELITE_VIP)).toHaveLength(0);
    expect(t.agregateur.transactions.size).toBe(0);
    expect(t.commissions.creditsLignes.size).toBe(0);
  });

  it("le SMS en panne ne défait pas la vente : le billet existe et la commission est due", async () => {
    t = await creerAppVendeursTest({ reglement: "memoire", messages: "memoire" });
    t.messages.enPanne = true;
    const v = await t.creerVendeur({});
    const rep = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(await t.billets.duDepart(DEPART_ALPHA)).toHaveLength(1);
    expect(t.commissions.creditsLignes.size).toBe(1);
  });
});
