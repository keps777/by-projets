import { describe, expect, it } from "vitest";
import { AgregateurAbsent } from "./agregateur-absent";
import { GardeAgregateur } from "./garde-agregateur";
import { ModeDegradeService } from "./mode-degrade.service";
import { vuePaiement } from "./vues";
import {
  AFRIMOVE,
  AUTRE_COMPAGNIE,
  AUTRE_VOYAGEUR,
  COMPAGNIE,
  COMPTE_COMPAGNIE,
  GUICHETIER,
  TEL_MTN,
  TEL_ORANGE,
  VOYAGEUR,
  commandeType,
  monterPaiements,
} from "./testing/montage";

const MTN = { moyen: "mtn_momo" as const, telephone: TEL_MTN };
const JETON = "tok_1NxQ7a2eZvKYlo2C";

/** JSON sans erreur sur les entiers longs du journal d'audit. */
const json = (valeur: unknown) =>
  JSON.stringify(valeur, (_cle, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

const refus = (promesse: Promise<unknown>) =>
  promesse.then(
    () => {
      throw new Error("Un refus était attendu");
    },
    (e: { code?: string; getStatus?: () => number }) => ({ code: e.code, statut: e.getStatus?.() }),
  );

describe("payer une commande", () => {
  it("MTN MoMo : paiement en attente, répartition prix / frais envoyée à l'agrégateur, référence idempotente", async () => {
    const t = monterPaiements();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);

    expect(p).toMatchObject({
      origine: "voyageur",
      commandeId: "commande-1",
      voyageurId: VOYAGEUR.id,
      moyen: "mtn_momo",
      operateur: "mtn",
      montant: 4250,
      statut: "en_attente",
      confirmation: "a_faire",
      fournisseur: "simule",
      idFournisseur: "simule-enc-1",
    });
    expect(t.agregateur.appelsEncaissement).toBe(1);
    const envoye = t.agregateur.transactions.get(p.id)!;
    expect(envoye.demande).toMatchObject({
      reference: p.id,
      moyen: "mtn_momo",
      montantFcfa: 4250,
      telephone: TEL_MTN,
      jetonCarte: null,
      libelle: "Alpha Voyages · Douala → Yaoundé · 14:00",
      repartition: [
        { beneficiaire: "compagnie", compteId: COMPTE_COMPAGNIE, montantFcfa: 4000 },
        { beneficiaire: "afrimove", compteId: "afrimove", montantFcfa: 250 },
      ],
    });
    // le délai de confirmation d'un mobile : 3 minutes
    expect(p.expireA.getTime() - p.creeA.getTime()).toBe(180_000);
  });

  it("sans numéro dans la demande, le numéro du compte est utilisé", async () => {
    const t = monterPaiements();
    await t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "orange_money" });
    expect([...t.agregateur.transactions.values()][0]!.demande).toMatchObject({
      moyen: "orange_money",
      telephone: TEL_ORANGE,
    });
  });

  it("le numéro est normalisé, chiffré en base, masqué à l'écran et absent des journaux", async () => {
    const t = monterPaiements();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", {
      moyen: "mtn_momo",
      telephone: "6 77 01 23 45",
    });
    expect(t.agregateur.transactions.get(p.id)!.demande.telephone).toBe(TEL_MTN);
    expect(p.telephoneMasque).toBe("+237 ••••• 345");
    const stocke = JSON.stringify((await t.paiements.trouver(p.id))!);
    expect(stocke).not.toContain("677012345");
    expect(t.chiffrement.dechiffrer(p.telephoneChiffre!, `paiement.telephone:${p.id}`)).toBe(
      TEL_MTN,
    );
    const audit = json(t.auditRepo.lignes);
    expect(audit).not.toContain("677012345");
    expect(audit).toContain("paiement.initie");
  });

  it("refuse un numéro invalide, étranger, ou absent", async () => {
    const t = monterPaiements();
    t.annuaire.ajouter("sans-numero", null, null);
    const inconnu = { ...VOYAGEUR, id: "sans-numero" };
    t.commandes.ajouter(commandeType({ id: "commande-2", voyageurId: "sans-numero" }));

    expect(
      await refus(
        t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "mtn_momo", telephone: "abc" }),
      ),
    ).toMatchObject({ code: "TELEPHONE_INVALIDE", statut: 422 });
    expect(
      await refus(
        t.service.payerCommande(VOYAGEUR, "commande-1", {
          moyen: "mtn_momo",
          telephone: "+14165551234",
        }),
      ),
    ).toMatchObject({ code: "TELEPHONE_NON_CAMEROUNAIS" });
    expect(
      await refus(t.service.payerCommande(inconnu, "commande-2", { moyen: "mtn_momo" })),
    ).toMatchObject({ code: "TELEPHONE_REQUIS" });
    expect(t.agregateur.appelsEncaissement).toBe(0);
    expect(t.paiements.tous()).toEqual([]);
  });

  it("rejouer la même demande (double clic) rend le paiement en cours sans second prélèvement", async () => {
    const t = monterPaiements();
    const p1 = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    const p2 = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(p2.id).toBe(p1.id);
    expect(t.paiements.tous()).toHaveLength(1);
    expect(t.agregateur.appelsEncaissement).toBe(1);
  });

  it("cinq demandes simultanées ne produisent qu'un paiement et qu'un appel à l'agrégateur", async () => {
    const t = monterPaiements();
    const resultats = await Promise.all(
      Array.from({ length: 5 }, () => t.service.payerCommande(VOYAGEUR, "commande-1", MTN)),
    );
    expect(new Set(resultats.map((p) => p.id)).size).toBe(1);
    expect(t.paiements.tous()).toHaveLength(1);
    expect(t.agregateur.appelsEncaissement).toBe(1);
  });

  it("un autre moyen est refusé tant que le premier paiement n'a pas abouti ni expiré", async () => {
    const t = monterPaiements();
    await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(
      await refus(t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "orange_money" })),
    ).toMatchObject({ code: "PAIEMENT_EN_COURS", statut: 409 });
    expect(
      await refus(
        t.service.payerCommande(VOYAGEUR, "commande-1", { ...MTN, telephone: "+237677999999" }),
      ),
    ).toMatchObject({ code: "PAIEMENT_EN_COURS" });
    expect(t.agregateur.appelsEncaissement).toBe(1);
  });

  it("après l'échec ou l'expiration du premier, un autre moyen est accepté", async () => {
    const t = monterPaiements();
    const a = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    t.agregateur.terminer(a.id, "echoue");
    await t.encaissements.synchroniser(a.id);
    expect((await t.paiements.trouver(a.id))!.statut).toBe("echoue");
    const b = await t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "orange_money" });
    expect(b.id).not.toBe(a.id);

    // délai dépassé sans nouvelle : le paiement est tranché avant d'en ouvrir un autre
    t.horloge.avancer(4 * 60_000);
    const c = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect((await t.paiements.trouver(b.id))!.statut).toBe("expire");
    expect(c.id).not.toBe(b.id);
  });

  it("carte : le jeton du prestataire part à l'agrégateur, rien n'en reste chez nous", async () => {
    const t = monterPaiements();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", {
      moyen: "carte",
      jetonCarte: JETON,
    });
    expect(p).toMatchObject({ moyen: "carte", operateur: null, telephoneChiffre: null });
    expect(p.urlAuthentification).toMatch(/^https:\/\/3ds\./);
    const demande = t.agregateur.transactions.get(p.id)!.demande;
    expect(demande.jetonCarte).toBe(JETON);
    expect(demande.telephone).toBeNull();
    expect(p.expireA.getTime() - p.creeA.getTime()).toBe(600_000);

    expect(JSON.stringify(t.paiements.tous())).not.toContain(JETON);
    expect(json(t.auditRepo.lignes)).not.toContain(JETON);
  });

  it("carte : un numéro de carte est refusé net, jamais transmis, stocké ni journalisé", async () => {
    const t = monterPaiements();
    for (const numero of ["4111111111111111", "4111 1111 1111 1111", "5555-5555-5555-4444"]) {
      expect(
        await refus(
          t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "carte", jetonCarte: numero }),
        ),
      ).toMatchObject({ code: "NUMERO_DE_CARTE_REFUSE", statut: 422 });
    }
    expect(t.agregateur.appelsEncaissement).toBe(0);
    expect(t.paiements.tous()).toEqual([]);
    expect(json(t.auditRepo.lignes)).not.toContain("4111");
  });

  it("carte : jeton absent ou mal formé", async () => {
    const t = monterPaiements();
    expect(
      await refus(t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "carte" })),
    ).toMatchObject({
      code: "JETON_CARTE_REQUIS",
    });
    expect(
      await refus(
        t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "carte", jetonCarte: "" }),
      ),
    ).toMatchObject({ code: "JETON_CARTE_REQUIS" });
    expect(
      await refus(
        t.service.payerCommande(VOYAGEUR, "commande-1", {
          moyen: "carte",
          jetonCarte: "a b c d e f g h",
        }),
      ),
    ).toMatchObject({ code: "JETON_CARTE_INVALIDE" });
  });

  it("commande en devise étrangère : carte seulement, avec le montant dans la devise", async () => {
    const t = monterPaiements();
    t.commandes.modifier("commande-1", {
      conversion: { devise: "CAD", montantMineur: 1290, approximatif: true },
    });
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "DEVISE_NON_SUPPORTEE",
    });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", {
      moyen: "carte",
      jetonCarte: JETON,
    });
    expect(p.devise).toEqual({ code: "CAD", montantMineur: 1290 });
    expect(t.agregateur.transactions.get(p.id)!.demande).toMatchObject({
      devise: { code: "CAD", montantMineur: 1290 },
      montantFcfa: 4250,
    });
  });

  it("« proche » n'est pas un moyen de paiement : il passe par un lien", async () => {
    const t = monterPaiements();
    expect(
      await refus(t.service.payerCommande(VOYAGEUR, "commande-1", { moyen: "proche" })),
    ).toMatchObject({
      code: "MOYEN_INVALIDE",
    });
  });

  it("commande inconnue, d'un autre voyageur, déjà payée ou expirée", async () => {
    const t = monterPaiements();
    expect(await refus(t.service.payerCommande(VOYAGEUR, "nope", MTN))).toMatchObject({
      code: "COMMANDE_INCONNUE",
      statut: 404,
    });
    expect(await refus(t.service.payerCommande(AUTRE_VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "COMMANDE_INCONNUE",
    });
    t.commandes.modifier("commande-1", { statut: "payee" });
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "COMMANDE_DEJA_PAYEE",
    });
    t.commandes.modifier("commande-1", { statut: "annulee" });
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "COMMANDE_EXPIREE",
    });
    t.commandes.modifier("commande-1", { statut: "en_attente_paiement" });
    t.horloge.avancer(16 * 60_000);
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "COMMANDE_EXPIREE",
      statut: 409,
    });
    expect(t.agregateur.appelsEncaissement).toBe(0);
  });

  it("une compagnie sans compte de reversement ne peut pas être payée : AfriMove n'encaisse pas à sa place", async () => {
    const t = monterPaiements({ sansCompte: true });
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "COMPAGNIE_SANS_COMPTE",
      statut: 422,
    });
    expect(t.agregateur.appelsEncaissement).toBe(0);
    expect(t.paiements.tous()).toEqual([]);
  });

  it("une commande dont le total ne correspond pas aux lignes est refusée avant tout appel", async () => {
    const t = monterPaiements();
    t.commandes.modifier("commande-1", { total: 9999 });
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "COMMANDE_INCOHERENTE",
    });
    expect(t.agregateur.appelsEncaissement).toBe(0);
  });

  it("frais offerts : toute la somme part vers la compagnie", async () => {
    const t = monterPaiements();
    t.commandes.modifier("commande-1", {
      lignes: [
        { code: "billet", libelle: "Billet", montant: 7500 },
        { code: "frais_voyageur", libelle: "Frais de service", montant: 0 },
      ],
      total: 7500,
    });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(p.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: COMPTE_COMPAGNIE, montant: 7500 },
    ]);
  });
});

describe("réponses de l'agrégateur à l'initiation", () => {
  it("refus définitif (carte refusée) : le paiement est échoué, le client peut réessayer", async () => {
    const t = monterPaiements();
    t.agregateur.programmer({ type: "refuse", code: "carte_refusee" });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", {
      moyen: "carte",
      jetonCarte: JETON,
    });
    expect(p).toMatchObject({ statut: "echoue", cause: "carte_refusee" });
    expect(vuePaiement(p)).toMatchObject({
      statut: "echoue",
      consigne: expect.stringContaining("Rien n'a été débité"),
    });
    const encore = await t.service.payerCommande(VOYAGEUR, "commande-1", {
      moyen: "carte",
      jetonCarte: JETON,
    });
    expect(encore.statut).toBe("en_attente");
    expect(encore.id).not.toBe(p.id);
  });

  it("réponse perdue : la transaction est retrouvée par sa référence, un nouvel essai ne double pas le débit", async () => {
    const t = monterPaiements();
    t.agregateur.programmer({ type: "reponse_perdue" });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(p).toMatchObject({ statut: "en_attente", idFournisseur: "simule-enc-1" });
    const bis = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(bis.id).toBe(p.id);
    expect(t.agregateur.transactions.size).toBe(1);
  });

  it("agrégateur en panne et transaction inconnue de lui : rien n'est parti, 503 et paiement échoué", async () => {
    const t = monterPaiements();
    t.agregateur.programmer({ type: "temporaire" });
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "MODE_DEGRADE",
      statut: 503,
    });
    expect(t.paiements.tous()).toMatchObject([
      { statut: "echoue", cause: "agregateur_indisponible" },
    ]);
    expect(t.agregateur.transactions.size).toBe(0);
  });

  it("injoignable même pour vérifier : le paiement reste en attente (initiation incertaine) pour que le balayage tranche", async () => {
    const t = monterPaiements();
    t.agregateur.mettreEnPanne();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(p).toMatchObject({ statut: "en_attente", cause: "initiation_incertaine" });
  });

  it("l'agrégateur répond déjà « réussi » : la commande est honorée tout de suite", async () => {
    const t = monterPaiements({ issue: "reussi" });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(p).toMatchObject({ statut: "reussi", confirmation: "faite" });
    expect(p.referenceOperateur).toMatch(/^MP/);
    expect(p.billetIds).toHaveLength(1);
    expect(t.commandes.confirmations).toEqual([{ commandeId: "commande-1", moyen: "mtn_momo" }]);
  });

  it("l'agrégateur répond déjà « échoué »", async () => {
    const t = monterPaiements({ issue: "echoue" });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect(p).toMatchObject({ statut: "echoue", cause: "refuse" });
    expect(t.commandes.confirmations).toEqual([]);
  });
});

describe("moyens proposés", () => {
  it("quatre moyens, textes de la maquette, le moyen probable présélectionné", async () => {
    const t = monterPaiements();
    const moyens = await t.service.moyens(VOYAGEUR);
    expect(moyens.map((m) => m.code)).toEqual(["mtn_momo", "orange_money", "carte", "proche"]);
    expect(moyens[0]).toMatchObject({
      nom: "MTN Mobile Money",
      sigle: "MTN",
      detail: "6 91 22 10 08 · tu confirmes sur ton téléphone",
    });
    expect(moyens[1]).toMatchObject({
      nom: "Orange Money",
      detail: "code #150# ou confirmation dans l'app Orange",
    });
    expect(moyens[2]).toMatchObject({
      nom: "Carte bancaire",
      detail: "Visa, Mastercard · aussi depuis l'étranger",
    });
    expect(moyens[3]).toMatchObject({ nom: "Demander à un proche de payer" });
    // le compte est en 69… : Orange Money présélectionné
    expect(moyens.filter((m) => m.choisi).map((m) => m.code)).toEqual(["orange_money"]);
    const mtn = await t.service.moyens(AUTRE_VOYAGEUR);
    expect(mtn.filter((m) => m.choisi).map((m) => m.code)).toEqual(["mtn_momo"]);
  });

  it("vide en mode dégradé", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, "maintenance");
    expect(await t.service.moyens(VOYAGEUR)).toEqual([]);
  });
});

describe("statut d'un paiement", () => {
  it("visible de son voyageur seulement ; un paiement de guichet n'est pas visible ici", async () => {
    const t = monterPaiements();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect((await t.service.statut(VOYAGEUR, p.id)).id).toBe(p.id);
    expect(await refus(t.service.statut(AUTRE_VOYAGEUR, p.id))).toMatchObject({
      code: "PAIEMENT_INCONNU",
      statut: 404,
    });
    expect(await refus(t.service.statut(VOYAGEUR, "inconnu"))).toMatchObject({
      code: "PAIEMENT_INCONNU",
    });
    const g = await t.service.payerAuGuichet(GUICHETIER, {
      moyen: "mtn_momo",
      telephone: TEL_MTN,
      montant: 4000,
      cle: "vente-0001",
    });
    expect(await refus(t.service.statut(VOYAGEUR, g.id))).toMatchObject({
      code: "PAIEMENT_INCONNU",
    });
  });

  it("lire le statut interroge l'agrégateur quand le webhook tarde", async () => {
    const t = monterPaiements();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    expect((await t.service.statut(VOYAGEUR, p.id)).statut).toBe("en_attente");
    t.agregateur.terminer(p.id, "reussi");
    // avant le délai de consultation, on ne dérange pas l'agrégateur
    expect((await t.service.statut(VOYAGEUR, p.id)).statut).toBe("en_attente");
    t.horloge.avancer(25_000);
    const apres = await t.service.statut(VOYAGEUR, p.id);
    expect(apres).toMatchObject({ statut: "reussi", confirmation: "faite" });
  });
});

describe("mode dégradé", () => {
  it("activé par réglage : plus de paiement en ligne (503), aucun appel à l'agrégateur, journalisé", async () => {
    const t = monterPaiements();
    const etat = await t.mode.definir(AFRIMOVE, true, "Panne MTN annoncée");
    expect(etat).toMatchObject({ degrade: true, raison: "reglage", motif: "Panne MTN annoncée" });
    expect(etat.consigne).toContain("paie au guichet");
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "MODE_DEGRADE",
      statut: 503,
    });
    expect(t.agregateur.appelsEncaissement).toBe(0);
    expect(t.auditRepo.lignes.find((l) => l.action === "paiement.mode_degrade")).toMatchObject({
      acteurId: AFRIMOVE.id,
      details: { actif: true, motif: "Panne MTN annoncée" },
    });

    await t.mode.definir(AFRIMOVE, false, null);
    expect((await t.mode.etat()).degrade).toBe(false);
    await expect(t.service.payerCommande(VOYAGEUR, "commande-1", MTN)).resolves.toBeDefined();
  });

  it("activé par la configuration tant qu'aucun réglage n'a été enregistré", async () => {
    const t = monterPaiements({ env: { PAIEMENTS_MODE_DEGRADE: "true" } });
    expect((await t.mode.etat()).raison).toBe("reglage");
    await t.mode.definir(AFRIMOVE, false, null);
    expect((await t.mode.etat()).degrade).toBe(false);
  });

  it("aucun agrégateur configuré : mode dégradé permanent", async () => {
    const t = monterPaiements();
    const mode = new ModeDegradeService(
      t.reglages,
      new GardeAgregateur(new AgregateurAbsent(), t.disjoncteur),
      t.audit,
      t.horloge,
      t.config,
    );
    expect(await mode.etat()).toMatchObject({ degrade: true, raison: "agregateur_absent" });
    await mode.definir(AFRIMOVE, false, null);
    expect((await mode.etat()).raison).toBe("agregateur_absent");
  });

  it("l'agrégateur tombe : après 3 échecs le circuit s'ouvre et le mode dégradé s'active seul, puis se referme", async () => {
    const t = monterPaiements();
    t.agregateur.mettreEnPanne();
    for (let i = 0; i < 3; i++) {
      t.commandes.ajouter(commandeType({ id: `c-panne-${i}` }));
      // chaque tentative échoue côté agrégateur (injoignable, y compris pour vérifier : deux échecs
      // par tentative) ; une fois le circuit ouvert, les tentatives suivantes sont refusées net
      await t.service.payerCommande(VOYAGEUR, `c-panne-${i}`, MTN).catch(() => undefined);
    }
    expect(await t.mode.etat()).toMatchObject({ degrade: true, raison: "agregateur_indisponible" });
    const appels = t.agregateur.appelsEncaissement;
    expect(await refus(t.service.payerCommande(VOYAGEUR, "commande-1", MTN))).toMatchObject({
      code: "MODE_DEGRADE",
    });
    expect(t.agregateur.appelsEncaissement).toBe(appels);

    // le circuit se rouvre après 30 s : un appel d'essai passe, il réussit, le mode se referme
    t.agregateur.retablir();
    t.horloge.avancer(31_000);
    expect((await t.mode.etat()).degrade).toBe(false);
    await expect(t.service.payerCommande(VOYAGEUR, "commande-1", MTN)).resolves.toBeDefined();
    expect(t.disjoncteur.etat()).toBe("ferme");
  });

  it("un refus de carte n'est pas une panne : le circuit reste fermé", async () => {
    const t = monterPaiements();
    for (let i = 0; i < 5; i++) {
      t.commandes.ajouter(commandeType({ id: `c-refus-${i}` }));
      t.agregateur.programmer({ type: "refuse", code: "carte_refusee" });
      await t.service.payerCommande(VOYAGEUR, `c-refus-${i}`, {
        moyen: "carte",
        jetonCarte: JETON,
      });
    }
    expect(t.disjoncteur.etat()).toBe("ferme");
    expect((await t.mode.etat()).degrade).toBe(false);
  });
});

describe("push MoMo au guichet", () => {
  const demande = {
    moyen: "mtn_momo" as const,
    telephone: TEL_MTN,
    montant: 4000,
    cle: "vente-0001",
  };

  it("tout le montant va à la compagnie, AfriMove n'y prend rien", async () => {
    const t = monterPaiements();
    const p = await t.service.payerAuGuichet(GUICHETIER, demande);
    expect(p).toMatchObject({
      origine: "guichet",
      commandeId: null,
      compagnieId: COMPAGNIE,
      montant: 4000,
      statut: "en_attente",
      confirmation: "sans_objet",
      repartition: [{ beneficiaire: "compagnie", compteId: COMPTE_COMPAGNIE, montant: 4000 }],
    });
    expect(t.agregateur.transactions.get(p.id)!.demande.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: COMPTE_COMPAGNIE, montantFcfa: 4000 },
    ]);
  });

  it("idempotent par vente : un double envoi ne débite qu'une fois", async () => {
    const t = monterPaiements();
    const [a, b, c] = await Promise.all([
      t.service.payerAuGuichet(GUICHETIER, demande),
      t.service.payerAuGuichet(GUICHETIER, demande),
      t.service.payerAuGuichet(GUICHETIER, demande),
    ]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect(t.agregateur.transactions.size).toBe(1);
  });

  it("la référence de l'opérateur est disponible quand le client a confirmé", async () => {
    const t = monterPaiements();
    const p = await t.service.payerAuGuichet(GUICHETIER, demande);
    const notif = t.agregateur.notificationDeReussite(p.id);
    await t.encaissements.traiterNotifications("simule", notif);
    const apres = await t.service.statutGuichet(GUICHETIER, p.id);
    expect(apres).toMatchObject({ statut: "reussi" });
    expect(apres.referenceOperateur).toMatch(/^MP/);
    // pas de commande à confirmer
    expect(t.commandes.confirmations).toEqual([]);
  });

  it("montant hors bornes, numéro invalide, compte sans compagnie ou compagnie sans compte", async () => {
    const t = monterPaiements();
    for (const montant of [0, 99, 1_000_001, 10.5, -4000]) {
      expect(
        await refus(t.service.payerAuGuichet(GUICHETIER, { ...demande, montant })),
      ).toMatchObject({
        code: "MONTANT_INVALIDE",
      });
    }
    expect(
      await refus(t.service.payerAuGuichet(GUICHETIER, { ...demande, telephone: "12" })),
    ).toMatchObject({ code: "TELEPHONE_INVALIDE" });
    expect(
      await refus(t.service.payerAuGuichet({ ...GUICHETIER, compagnieId: null }, demande)),
    ).toMatchObject({ statut: 403 });
    expect(
      await refus(
        t.service.payerAuGuichet({ ...GUICHETIER, compagnieId: AUTRE_COMPAGNIE }, demande),
      ),
    ).toMatchObject({ code: "COMPAGNIE_SANS_COMPTE" });
    expect(t.agregateur.appelsEncaissement).toBe(0);
  });

  it("le statut n'est lisible que par la compagnie qui l'a demandé", async () => {
    const t = monterPaiements();
    const p = await t.service.payerAuGuichet(GUICHETIER, demande);
    expect(
      await refus(t.service.statutGuichet({ ...GUICHETIER, compagnieId: AUTRE_COMPAGNIE }, p.id)),
    ).toMatchObject({ code: "PAIEMENT_INCONNU" });
  });

  it("coupé en mode dégradé", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, null);
    expect(await refus(t.service.payerAuGuichet(GUICHETIER, demande))).toMatchObject({
      code: "MODE_DEGRADE",
    });
  });
});

describe("mode dégradé : encaissement à la gare", () => {
  it("réservé au mode dégradé", async () => {
    const t = monterPaiements();
    expect(
      await refus(t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" })),
    ).toMatchObject({ code: "MODE_NORMAL", statut: 409 });
  });

  it("espèces : les billets sont émis comme en ligne, rien ne passe par l'agrégateur", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, null);
    const p = await t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" });
    expect(p).toMatchObject({
      origine: "agence",
      moyen: "especes_agence",
      statut: "reussi",
      confirmation: "faite",
      fournisseur: null,
      montant: 4250,
    });
    expect(p.billetIds).toHaveLength(1);
    expect(t.commandes.confirmations).toEqual([
      { commandeId: "commande-1", moyen: "especes_agence" },
    ]);
    expect(t.agregateur.appelsEncaissement).toBe(0);
    expect(t.auditRepo.lignes.some((l) => l.action === "paiement.encaissement_agence")).toBe(true);
  });

  it("MoMo marchand : la référence de la transaction est obligatoire et conservée", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, null);
    expect(
      await refus(t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "momo_marchand" })),
    ).toMatchObject({ code: "REFERENCE_REQUISE" });
    expect(
      await refus(
        t.service.encaisserEnAgence(GUICHETIER, "commande-1", {
          mode: "momo_marchand",
          reference: " ",
        }),
      ),
    ).toMatchObject({ code: "REFERENCE_REQUISE" });
    const p = await t.service.encaisserEnAgence(GUICHETIER, "commande-1", {
      mode: "momo_marchand",
      reference: "MP240105.1234.A12345",
    });
    expect(p).toMatchObject({ moyen: "momo_marchand", referenceOperateur: "MP240105.1234.A12345" });
  });

  it("rejouer l'encaissement ne produit rien de plus", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, null);
    const a = await t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" });
    const b = await t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" });
    expect(b.id).toBe(a.id);
    expect(t.paiements.tous()).toHaveLength(1);
    expect(t.commandes.confirmations).toHaveLength(1);
  });

  it("commande d'une autre compagnie : introuvable ; commande expirée : refusée", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, null);
    expect(
      await refus(
        t.service.encaisserEnAgence({ ...GUICHETIER, compagnieId: AUTRE_COMPAGNIE }, "commande-1", {
          mode: "especes",
        }),
      ),
    ).toMatchObject({ code: "COMMANDE_INCONNUE", statut: 404 });
    t.horloge.avancer(16 * 60_000);
    expect(
      await refus(t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" })),
    ).toMatchObject({ code: "COMMANDE_EXPIREE" });
  });

  it("places reprises entre-temps : 409, le guichetier rend l'argent (aucun remboursement automatique)", async () => {
    const t = monterPaiements();
    await t.mode.definir(AFRIMOVE, true, null);
    t.commandes.erreurs.push({ statut: 409, code: "SIEGES_PERDUS" });
    expect(
      await refus(t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" })),
    ).toMatchObject({ code: "SIEGES_PERDUS", statut: 409 });
    expect(t.remboursements.tous()).toEqual([]);
    expect(t.agregateur.appelsRemboursement).toBe(0);
  });

  it("un paiement en ligne en cours bloque l'encaissement à la gare (pas de double paiement)", async () => {
    const t = monterPaiements();
    await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    await t.mode.definir(AFRIMOVE, true, null);
    expect(
      await refus(t.service.encaisserEnAgence(GUICHETIER, "commande-1", { mode: "especes" })),
    ).toMatchObject({ code: "PAIEMENT_EN_COURS" });
  });

  it("le guichetier ne voit que les commandes de sa compagnie", async () => {
    const t = monterPaiements();
    expect(await t.service.commandeAEncaisser(GUICHETIER, "commande-1")).toMatchObject({
      commandeId: "commande-1",
      total: 4250,
    });
    expect(
      await refus(
        t.service.commandeAEncaisser({ ...GUICHETIER, compagnieId: AUTRE_COMPAGNIE }, "commande-1"),
      ),
    ).toMatchObject({ code: "COMMANDE_INCONNUE" });
  });
});

describe("références pour le rapprochement", () => {
  it("AfriMove voit tout, le patron et le comptable leur compagnie, pas celle des autres", async () => {
    const t = monterPaiements();
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));

    const tout = await t.service.references(AFRIMOVE, { limite: 50 });
    expect(tout).toHaveLength(1);
    expect(tout[0]!.paiement.referenceOperateur).toMatch(/^MP/);

    const patron = { ...GUICHETIER, role: "patron" as const };
    expect(await t.service.references(patron, { limite: 50 })).toHaveLength(1);
    expect(
      await t.service.references({ ...patron, compagnieId: AUTRE_COMPAGNIE }, { limite: 50 }),
    ).toHaveLength(0);
    expect(
      await refus(t.service.references(patron, { limite: 50, compagnieId: AUTRE_COMPAGNIE })),
    ).toMatchObject({ statut: 403 });
    expect(await t.service.references(AFRIMOVE, { limite: 50, statut: "echoue" })).toHaveLength(0);
    expect(
      await t.service.references(AFRIMOVE, {
        limite: 50,
        au: new Date(t.horloge.maintenant().getTime() - 1),
      }),
    ).toHaveLength(0);
  });
});
