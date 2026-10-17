import { describe, expect, it } from "vitest";
import { AvisMemoire } from "../billetterie/memoire";
import type { AvisBilletterie, Billets } from "../billetterie/ports";
import type { Cloture } from "../comptable/modele";
import { AbonnementAvisBilletterie, AvisPaiements, composerAvis } from "./avis";
import {
  AUTRE_COMPAGNIE,
  GUICHETIER,
  TEL_MTN,
  VOYAGEUR,
  commandeType,
  monterPaiements,
  type Montage,
} from "./testing/montage";

const MTN = { moyen: "mtn_momo" as const, telephone: TEL_MTN };

/** Un paiement MTN de 4 250 F (4 000 F de prix + 250 F de frais), reçu et honoré. */
async function paiementRecu(t: Montage, commandeId = "commande-1") {
  const p = await t.service.payerCommande(VOYAGEUR, commandeId, MTN);
  await t.encaissements.traiterNotifications(
    "simule",
    t.agregateur.notificationDeReussite(p.id, { evenementId: `evt-${p.id}` }),
  );
  return (await t.paiements.trouver(p.id))!;
}

const lignes = (compagnie: number, afrimove = 0) => [
  { beneficiaire: "compagnie" as const, montant: compagnie },
  { beneficiaire: "afrimove" as const, montant: afrimove },
];

describe("demander un remboursement", () => {
  it("part vers l'agrégateur avec la référence du remboursement et l'identifiant du paiement", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    const r = await t.remb.demander(p.id, {
      lignes: lignes(1500),
      cause: "billet_annule",
      cle: "k1",
      billetId: "billet-9",
    });

    expect(r).toMatchObject({
      statut: "reussi",
      montant: 1500,
      cause: "billet_annule",
      billetId: "billet-9",
      tentatives: 1,
      lignes: [{ beneficiaire: "compagnie", montant: 1500 }],
    });
    expect(r.referenceOperateur).toMatch(/^RB/);
    const envoye = t.agregateur.remboursements.get(r.id)!.demande;
    expect(envoye).toMatchObject({
      reference: r.id,
      idFournisseurPaiement: p.idFournisseur,
      montantFcfa: 1500,
      lignes: [{ beneficiaire: "compagnie", montantFcfa: 1500 }],
    });
    expect(t.actions()).toEqual(
      expect.arrayContaining(["paiement.remboursement_demande", "paiement.rembourse"]),
    );
  });

  it("la même clé ne produit jamais deux remboursements", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    const a = await t.remb.demander(p.id, {
      lignes: lignes(1000),
      cause: "billet_annule",
      cle: "k",
    });
    const b = await t.remb.demander(p.id, {
      lignes: lignes(1000),
      cause: "billet_annule",
      cle: "k",
    });
    const [c, d] = await Promise.all([
      t.remb.demander(p.id, { lignes: lignes(1000), cause: "billet_annule", cle: "k" }),
      t.remb.demander(p.id, { lignes: lignes(1000), cause: "billet_annule", cle: "k" }),
    ]);

    expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(1);
    expect(t.remboursements.tous()).toHaveLength(1);
    expect(t.agregateur.appelsRemboursement).toBe(1);
  });

  it("plafond par bénéficiaire : le prix ne peut pas être pris sur la part d'AfriMove ni l'inverse", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    const plafonne = (compagnie: number, afrimove: number, cle: string) =>
      t.remb.demander(p.id, {
        lignes: lignes(compagnie, afrimove),
        cause: "demande_afrimove",
        cle,
      });

    // 4 250 F payés, mais 4 001 F ne peuvent pas venir de la compagnie (elle n'en a reçu que 4 000)
    await expect(plafonne(4001, 0, "a")).rejects.toMatchObject({
      code: "REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT",
    });
    await expect(plafonne(0, 251, "b")).rejects.toMatchObject({
      code: "REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT",
    });
    expect(t.agregateur.appelsRemboursement).toBe(0);

    await plafonne(4000, 250, "c");
    await expect(plafonne(1, 0, "d")).rejects.toMatchObject({
      code: "REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT",
    });
    expect(t.remboursements.tous().reduce((somme, r) => somme + r.montant, 0)).toBe(4250);
  });

  it("deux remboursements simultanés ne dépassent pas ensemble le plafond", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    const essais = await Promise.allSettled([
      t.remb.demander(p.id, { lignes: lignes(3000), cause: "billet_annule", cle: "x" }),
      t.remb.demander(p.id, { lignes: lignes(3000), cause: "billet_annule", cle: "y" }),
    ]);
    expect(essais.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    expect(essais.filter((e) => e.status === "rejected")).toHaveLength(1);
  });

  it("un remboursement échoué libère sa part : on peut redemander", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.programmerRemboursement({ type: "refuse", code: "compte_ferme" });
    const rate = await t.remb.demander(p.id, {
      lignes: lignes(4000),
      cause: "billet_annule",
      cle: "1",
    });
    expect(rate).toMatchObject({ statut: "echoue", derniereErreur: "compte_ferme" });
    expect(t.actions()).toContain("paiement.remboursement_echec");

    const reussi = await t.remb.demander(p.id, {
      lignes: lignes(4000),
      cause: "billet_annule",
      cle: "2",
    });
    expect(reussi.statut).toBe("reussi");
  });

  it("refus : paiement inconnu, non reçu, pris à la gare, montants invalides", async () => {
    const t = monterPaiements();
    await expect(
      t.remb.demander("inconnu", { lignes: lignes(100), cause: "billet_annule", cle: "z" }),
    ).rejects.toMatchObject({ code: "PAIEMENT_INCONNU" });

    const enAttente = await t.service.payerCommande(VOYAGEUR, "commande-1", MTN);
    await expect(
      t.remb.demander(enAttente.id, { lignes: lignes(100), cause: "billet_annule", cle: "z" }),
    ).rejects.toMatchObject({ code: "PAIEMENT_NON_REUSSI" });

    const p = await paiementRecu(t);
    for (const mauvaises of [lignes(0, 0), lignes(10.5), lignes(-5, 100), lignes(100.5, 50)]) {
      await expect(
        t.remb.demander(p.id, { lignes: mauvaises, cause: "billet_annule", cle: "m" }),
      ).rejects.toMatchObject({ code: "MONTANT_INVALIDE" });
    }

    await t.mode.definir(
      { id: "a", role: "afrimove", compagnieId: null, gareId: null },
      true,
      "test",
    );
    t.commandes.ajouter(commandeType({ id: "commande-agence" }));
    const agence = await t.service.encaisserEnAgence(GUICHETIER, "commande-agence", {
      mode: "especes",
    });
    await expect(
      t.remb.demander(agence.id, { lignes: lignes(100), cause: "billet_annule", cle: "g" }),
    ).rejects.toMatchObject({ code: "REMBOURSEMENT_HORS_AGREGATEUR" });
  });
});

describe("agrégateur en difficulté : le remboursement n'est jamais perdu", () => {
  it("en panne : il reste demandé, puis le balayage le renvoie avec la même référence", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.mettreEnPanne();

    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    expect(r).toMatchObject({
      statut: "demande",
      tentatives: 1,
      derniereErreur: "agregateur_indisponible",
    });
    expect(r.prochainEssaiA!.getTime()).toBe(t.horloge.maintenant().getTime() + 30_000);

    // trop tôt : rien ne part
    expect(await t.remb.reprendre()).toBe(0);

    t.agregateur.retablir();
    t.horloge.avancer(31_000);
    expect(await t.remb.reprendre()).toBe(1);

    const apres = (await t.remboursements.trouver(r.id))!;
    expect(apres).toMatchObject({ statut: "reussi", tentatives: 2, prochainEssaiA: null });
    expect(t.agregateur.remboursements.size).toBe(1);
    // plus rien à reprendre
    expect(await t.remb.reprendre()).toBe(0);
  });

  it("l'attente double à chaque essai", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.mettreEnPanne();
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    t.horloge.avancer(31_000);
    await t.remb.reprendre();
    const apres = (await t.remboursements.trouver(r.id))!;
    expect(apres.tentatives).toBe(2);
    expect(apres.prochainEssaiA!.getTime() - t.horloge.maintenant().getTime()).toBe(60_000);
  });

  it("après le nombre maximal d'essais, il est déclaré échoué (à traiter à la main)", async () => {
    const t = monterPaiements({ env: { PAIEMENTS_REMBOURSEMENT_ESSAIS_MAX: "2" } });
    const p = await paiementRecu(t);
    t.agregateur.mettreEnPanne();
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    t.horloge.avancer(31_000);
    await t.remb.reprendre();

    expect(await t.remboursements.trouver(r.id)).toMatchObject({
      statut: "echoue",
      derniereErreur: "essais_epuises",
      tentatives: 2,
    });
    expect(t.actions()).toContain("paiement.remboursement_echec");
  });

  it("l'agrégateur dit « en cours » : il reste demandé, la notification de réussite le conclut", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.programmerRemboursement({ type: "ok", etat: "en_attente" });
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    expect(r.statut).toBe("demande");
    expect(r.idFournisseur).toMatch(/remb/);

    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "rb-1",
          type: "remboursement",
          transaction: r.idFournisseur!,
          reference: r.id,
          etat: "reussi",
        },
      ]),
    );
    expect(resume.appliques).toBe(1);
    expect(await t.remboursements.trouver(r.id)).toMatchObject({
      statut: "reussi",
      prochainEssaiA: null,
    });
    expect(t.actions()).toContain("paiement.rembourse");
  });

  it("la notification d'échec le déclare échoué ; un remboursement inconnu est compté à part", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.programmerRemboursement({ type: "ok", etat: "en_attente" });
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });

    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "rb-2",
          type: "remboursement",
          transaction: r.idFournisseur!,
          reference: r.id,
          etat: "echoue",
          code: "numero_inactif",
        },
        {
          id: "rb-3",
          type: "remboursement",
          transaction: "simule-remb-404",
          reference: "inconnu",
          etat: "reussi",
        },
      ]),
    );
    expect(resume).toMatchObject({ appliques: 1, inconnus: 1 });
    expect(await t.remboursements.trouver(r.id)).toMatchObject({
      statut: "echoue",
      derniereErreur: "numero_inactif",
    });
  });

  it("une notification datée d'un mois clôturé n'est pas refusée : la fin s'inscrit au mois ouvert suivant", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.programmerRemboursement({ type: "ok", etat: "en_attente" });
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    // Le comptable a clôturé janvier 2027 entre la demande et la réponse de l'agrégateur.
    await t.clotures.verrouiller({
      compagnieId: p.compagnieId,
      mois: "2027-01",
    } as unknown as Cloture);

    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "rb-tard",
          type: "remboursement",
          transaction: r.idFournisseur!,
          reference: r.id,
          etat: "reussi",
        },
      ]),
    );
    expect(resume.appliques).toBe(1);
    const apres = (await t.remboursements.trouver(r.id))!;
    expect(apres.statut).toBe("reussi");
    // Début de février 2027 à Douala (UTC+1), jamais une date de janvier.
    expect(apres.termineA?.toISOString()).toBe("2027-01-31T23:00:00.000Z");
  });

  it("une compagnie dont le mois n'est pas clôturé garde la date de l'agrégateur", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.programmerRemboursement({ type: "ok", etat: "en_attente" });
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    await t.clotures.verrouiller({
      compagnieId: AUTRE_COMPAGNIE,
      mois: "2027-01",
    } as unknown as Cloture);
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "rb-ouvert",
          type: "remboursement",
          transaction: r.idFournisseur!,
          reference: r.id,
          etat: "reussi",
        },
      ]),
    );
    const apres = (await t.remboursements.trouver(r.id))!;
    expect(apres.termineA!.getTime()).toBeGreaterThanOrEqual(t.horloge.maintenant().getTime() - 1);
    expect(apres.termineA!.toISOString().startsWith("2027-01-05")).toBe(true);
  });

  it("la même notification de remboursement rejouée ne change rien", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    t.agregateur.programmerRemboursement({ type: "ok", etat: "en_attente" });
    const r = await t.remb.demander(p.id, {
      lignes: lignes(2000),
      cause: "billet_annule",
      cle: "k",
    });
    const n = t.agregateur.fabriquerNotification([
      {
        id: "rb-1",
        type: "remboursement",
        transaction: r.idFournisseur!,
        reference: r.id,
        etat: "reussi",
      },
    ]);
    await t.encaissements.traiterNotifications("simule", n);
    const second = await t.encaissements.traiterNotifications("simule", n);
    expect(second).toMatchObject({ appliques: 0, ignores: 1 });
    expect(t.actions().filter((a) => a === "paiement.rembourse")).toHaveLength(1);
  });
});

describe("billet annulé : la billetterie prévient, le paiement rembourse", () => {
  const avisAnnulation = (
    surcharge: Partial<Extract<AvisBilletterie, { type: "billet.annule" }>> = {},
  ): AvisBilletterie => ({
    type: "billet.annule",
    billetId: "billet-1",
    numero: "N-1",
    departId: "depart-1",
    raison: "voyageur",
    retenue: 800,
    remboursement: 3200,
    acheteurId: VOYAGEUR.id,
    ...surcharge,
  });

  function monterAvis(t: Montage, commandeId: string | null = "commande-1") {
    const billets = {
      trouver: async (id: string) => ({ id, commandeId }),
    } as unknown as Billets;
    return new AvisPaiements(billets, t.paiements, t.commandes, t.remb, t.audit, t.horloge);
  }

  it("annulation voulue : le prix remboursé revient de la compagnie, les frais restent acquis", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    await monterAvis(t).publier(avisAnnulation());

    const [r] = await t.remboursements.dePaiement(p.id);
    expect(r).toMatchObject({
      cause: "billet_annule",
      montant: 3200,
      billetId: "billet-1",
      statut: "demande",
      cle: "billet-annule:billet-1",
      lignes: [{ beneficiaire: "compagnie", montant: 3200 }],
    });
    // l'annulation ne doit pas attendre l'agrégateur : le balayage envoie
    expect(t.agregateur.appelsRemboursement).toBe(0);
    expect(await t.remb.reprendre()).toBe(1);
    expect((await t.remboursements.trouver(r!.id))!.statut).toBe("reussi");
  });

  it("départ annulé : les frais de service de ce billet reviennent aussi, d'AfriMove", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    await monterAvis(t).publier(
      avisAnnulation({ raison: "depart_annule", retenue: 0, remboursement: 4000 }),
    );
    const [r] = await t.remboursements.dePaiement(p.id);
    expect(r).toMatchObject({ cause: "depart_annule", montant: 4250 });
    expect(r!.lignes).toEqual([
      { beneficiaire: "compagnie", montant: 4000 },
      { beneficiaire: "afrimove", montant: 250 },
    ]);
  });

  it("le même avis reçu deux fois ne rembourse qu'une fois", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    const avis = monterAvis(t);
    await avis.publier(avisAnnulation());
    await avis.publier(avisAnnulation());
    expect(await t.remboursements.dePaiement(p.id)).toHaveLength(1);
  });

  it("billet vendu au guichet, paiement pris à la gare ou autre avis : rien à rembourser ici", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    await monterAvis(t, null).publier(avisAnnulation());
    await monterAvis(t).publier({
      type: "billet.embarque",
      billetId: "b",
      numero: "N",
      departId: "d",
      at: "x",
    });
    await monterAvis(t).publier(
      avisAnnulation({ billetId: "b2", remboursement: 0, retenue: 4000 }),
    );
    expect(await t.remboursements.dePaiement(p.id)).toEqual([]);

    await t.mode.definir(
      { id: "a", role: "afrimove", compagnieId: null, gareId: null },
      true,
      "test",
    );
    t.commandes.ajouter(commandeType({ id: "commande-agence" }));
    const agence = await t.service.encaisserEnAgence(GUICHETIER, "commande-agence", {
      mode: "especes",
    });
    await monterAvis(t, "commande-agence").publier(avisAnnulation({ billetId: "b3" }));
    expect(await t.remboursements.dePaiement(agence.id)).toEqual([]);
  });

  it("un remboursement impossible n'empêche pas l'annulation : l'avis ne lève pas, l'échec est audité", async () => {
    const t = monterPaiements();
    await paiementRecu(t);
    await expect(
      monterAvis(t).publier(avisAnnulation({ remboursement: 9000 })),
    ).resolves.toBeUndefined();
    expect(t.actions()).toContain("paiement.remboursement_billet_echec");
  });

  it("abonnement : les avis de la billetterie arrivent au paiement, une seule fois, sans perdre l'écouteur d'origine", async () => {
    const t = monterPaiements();
    const p = await paiementRecu(t);
    const avisBillets = new AvisMemoire();
    const abonnement = new AbonnementAvisBilletterie(avisBillets, monterAvis(t), t.config);
    abonnement.onModuleInit();
    abonnement.onModuleInit();

    await Promise.resolve(avisBillets.publier(avisAnnulation()));

    expect(avisBillets.de("billet.annule")).toHaveLength(1);
    expect(await t.remboursements.dePaiement(p.id)).toHaveLength(1);
  });

  it("abonnement coupé par la configuration : l'écouteur d'origine reste seul", async () => {
    const t = monterPaiements({ env: { PAIEMENTS_ABONNER_AVIS: "false" } });
    const p = await paiementRecu(t);
    const avisBillets = new AvisMemoire();
    new AbonnementAvisBilletterie(avisBillets, monterAvis(t), t.config).onModuleInit();
    await Promise.resolve(avisBillets.publier(avisAnnulation()));
    expect(await t.remboursements.dePaiement(p.id)).toEqual([]);
  });

  it("composerAvis : l'échec d'un écouteur n'empêche pas les autres", async () => {
    const recus: string[] = [];
    const compose = composerAvis(
      { publier: () => Promise.reject(new Error("panne")) },
      { publier: (a) => void recus.push(a.type) },
    );
    await compose.publier(avisAnnulation());
    expect(recus).toEqual(["billet.annule"]);
  });
});
