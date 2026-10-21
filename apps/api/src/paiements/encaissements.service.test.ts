import { describe, expect, it } from "vitest";
import { NotificationInvalide } from "./agregateur";
import { FournisseurInconnu } from "./encaissements.service";
import { canalStatutPaiement } from "./vues";
import {
  COMPAGNIE,
  TEL_MTN,
  VOYAGEUR,
  commandeType,
  monterPaiements,
  type Montage,
} from "./testing/montage";

const MTN = { moyen: "mtn_momo" as const, telephone: TEL_MTN };

const payer = (t: Montage, commandeId = "commande-1") =>
  t.service.payerCommande(VOYAGEUR, commandeId, MTN);

const etat = async (t: Montage, paiementId: string) => (await t.paiements.trouver(paiementId))!;
const commandeDe = async (t: Montage, id = "commande-1") => (await t.commandes.trouver(id))!;

describe("un paiement reçu une seule fois donne un seul jeu de billets", () => {
  it("la notification de réussite honore la commande", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p.id),
    );

    expect(resume).toEqual({ recus: 1, appliques: 1, ignores: 0, inconnus: 0 });
    const apres = await etat(t, p.id);
    expect(apres).toMatchObject({ statut: "reussi", confirmation: "faite", operateur: "mtn" });
    expect(apres.referenceOperateur).toMatch(/^MP/);
    expect(apres.billetIds).toHaveLength(1);
    expect(await commandeDe(t)).toMatchObject({ statut: "payee", billetIds: apres.billetIds });
    expect(t.commandes.confirmations).toEqual([{ commandeId: "commande-1", moyen: "mtn_momo" }]);
    expect(t.actions()).toEqual(
      expect.arrayContaining(["paiement.reussi", "paiement.commande_confirmee"]),
    );
  });

  it("la même notification reçue deux fois ne refait rien", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const notification = t.agregateur.notificationDeReussite(p.id);

    const premiere = await t.encaissements.traiterNotifications("simule", notification);
    const seconde = await t.encaissements.traiterNotifications("simule", notification);

    expect(premiere.appliques).toBe(1);
    expect(seconde).toEqual({ recus: 1, appliques: 0, ignores: 1, inconnus: 0 });
    expect(t.commandes.confirmations).toHaveLength(1);
    expect((await etat(t, p.id)).billetIds).toHaveLength(1);
    expect(t.actions().filter((a) => a === "paiement.reussi")).toHaveLength(1);
  });

  it("la même issue sous un autre identifiant d'événement ne refait rien non plus", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p.id, { evenementId: "evt-A" }),
    );
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p.id, { evenementId: "evt-B" }),
    );

    expect(resume).toMatchObject({ appliques: 0, ignores: 1 });
    expect(t.commandes.confirmations).toHaveLength(1);
  });

  it("deux notifications identiques simultanées : un seul jeu de billets", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const notification = t.agregateur.notificationDeReussite(p.id);

    const [a, b] = await Promise.all([
      t.encaissements.traiterNotifications("simule", notification),
      t.encaissements.traiterNotifications("simule", notification),
    ]);

    expect(a.appliques + b.appliques).toBe(1);
    expect(t.commandes.confirmations).toHaveLength(1);
    expect((await etat(t, p.id)).billetIds).toHaveLength(1);
  });

  it("plusieurs événements dans un même appel sont tous appliqués", async () => {
    const t = monterPaiements();
    t.commandes.ajouter(commandeType({ id: "commande-2" }));
    const p1 = await payer(t);
    const p2 = await payer(t, "commande-2");
    const t1 = t.agregateur.terminer(p1.id, "reussi");
    const t2 = t.agregateur.terminer(p2.id, "echoue", { code: "solde_insuffisant" });

    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "e1",
          transaction: t1.idFournisseur,
          reference: p1.id,
          etat: "reussi",
          montant: 4250,
        },
        {
          id: "e2",
          transaction: t2.idFournisseur,
          reference: p2.id,
          etat: "echoue",
          code: "solde_insuffisant",
        },
      ]),
    );

    expect(resume).toEqual({ recus: 2, appliques: 2, ignores: 0, inconnus: 0 });
    expect((await etat(t, p1.id)).statut).toBe("reussi");
    expect(await etat(t, p2.id)).toMatchObject({ statut: "echoue", cause: "solde_insuffisant" });
  });
});

describe("deux paiements pour la même commande : un seul billet, l'autre est remboursé", () => {
  /** Premier essai resté sans réponse (expiré), second essai payé, puis le premier arrive en retard. */
  async function deuxPaiements(t: Montage) {
    const p1 = await payer(t);
    t.horloge.avancer(4 * 60_000);
    await t.encaissements.synchroniser(p1.id);
    expect((await etat(t, p1.id)).statut).toBe("expire");
    const p2 = await payer(t);
    expect(p2.id).not.toBe(p1.id);
    return { p1, p2 };
  }

  it("le second paiement réussi est remboursé en entier (prix à la compagnie, frais à AfriMove)", async () => {
    const t = monterPaiements();
    const { p1, p2 } = await deuxPaiements(t);

    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p2.id),
    );
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p1.id),
    );

    expect(resume.appliques).toBe(1);
    expect(t.commandes.confirmations).toHaveLength(1);
    expect(await etat(t, p2.id)).toMatchObject({ confirmation: "faite" });
    expect(await etat(t, p1.id)).toMatchObject({
      statut: "reussi",
      confirmation: "doublon",
      cause: "doublon",
      billetIds: [],
    });

    const rembourses = await t.remboursements.dePaiement(p1.id);
    expect(rembourses).toHaveLength(1);
    expect(rembourses[0]).toMatchObject({
      cause: "doublon_paiement",
      montant: 4250,
      statut: "reussi",
      lignes: [
        { beneficiaire: "compagnie", montant: 4000 },
        { beneficiaire: "afrimove", montant: 250 },
      ],
    });
    expect(t.agregateur.remboursements.size).toBe(1);
    expect(t.agregateur.remboursements.get(rembourses[0]!.id)?.demande).toMatchObject({
      idFournisseurPaiement: (await etat(t, p1.id)).idFournisseur,
      montantFcfa: 4250,
    });
    // le paiement honoré n'est pas remboursé
    expect(await t.remboursements.dePaiement(p2.id)).toEqual([]);
  });

  it("les deux notifications arrivent en même temps : un seul gagne, l'autre est remboursé", async () => {
    const t = monterPaiements();
    const { p1, p2 } = await deuxPaiements(t);
    const n1 = t.agregateur.notificationDeReussite(p1.id);
    const n2 = t.agregateur.notificationDeReussite(p2.id);

    await Promise.all([
      t.encaissements.traiterNotifications("simule", n1),
      t.encaissements.traiterNotifications("simule", n2),
    ]);

    expect(t.commandes.confirmations).toHaveLength(1);
    const apres = [await etat(t, p1.id), await etat(t, p2.id)];
    expect(apres.filter((p) => p.confirmation === "faite")).toHaveLength(1);
    expect(apres.filter((p) => p.confirmation === "doublon")).toHaveLength(1);
    expect(t.agregateur.remboursements.size).toBe(1);
    expect((await commandeDe(t)).billetIds).toHaveLength(1);
  });

  it("deux fois la même vérification ne rembourse qu'une fois", async () => {
    const t = monterPaiements();
    const { p1, p2 } = await deuxPaiements(t);
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p2.id),
    );
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p1.id, { evenementId: "x1" }),
    );
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p1.id, { evenementId: "x2" }),
    );
    await t.encaissements.balayer();

    expect(t.agregateur.remboursements.size).toBe(1);
    expect(t.agregateur.appelsRemboursement).toBe(1);
  });
});

describe("échec, retard, montant inattendu", () => {
  it("un échec annoncé ferme le paiement avec la cause de l'opérateur, sans billet", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const tr = t.agregateur.terminer(p.id, "echoue", { code: "solde_insuffisant" });
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "e1",
          transaction: tr.idFournisseur,
          reference: p.id,
          etat: "echoue",
          code: "solde_insuffisant",
        },
      ]),
    );

    expect(await etat(t, p.id)).toMatchObject({
      statut: "echoue",
      cause: "solde_insuffisant",
      confirmation: "a_faire",
    });
    expect(t.commandes.confirmations).toEqual([]);
    expect((await commandeDe(t)).statut).toBe("en_attente_paiement");
    expect(t.actions()).toContain("paiement.echoue");
  });

  it("l'échec d'un essai n'empêche pas de réessayer, puis de payer", async () => {
    const t = monterPaiements();
    const p1 = await payer(t);
    const tr = t.agregateur.terminer(p1.id, "echoue");
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        { id: "e1", transaction: tr.idFournisseur, reference: p1.id, etat: "echoue" },
      ]),
    );
    const p2 = await payer(t);
    await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p2.id),
    );

    expect((await commandeDe(t)).statut).toBe("payee");
    expect(t.commandes.confirmations).toHaveLength(1);
  });

  it("un échec tardif ne défait pas un paiement déjà reçu", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));
    const tr = t.agregateur.transactions.get(p.id)!;
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        { id: "e-tard", transaction: tr.idFournisseur, reference: p.id, etat: "echoue" },
      ]),
    );

    expect(resume).toMatchObject({ appliques: 0, ignores: 1 });
    expect(await etat(t, p.id)).toMatchObject({ statut: "reussi", confirmation: "faite" });
  });

  it("un paiement reçu après l'expiration du délai est accepté et honoré si les places sont là", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.horloge.avancer(4 * 60_000);
    await t.encaissements.synchroniser(p.id);
    expect((await etat(t, p.id)).statut).toBe("expire");

    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));

    expect(await etat(t, p.id)).toMatchObject({
      statut: "reussi",
      cause: "paiement_tardif",
      confirmation: "faite",
    });
    expect((await commandeDe(t)).statut).toBe("payee");
    expect(t.agregateur.remboursements.size).toBe(0);
  });

  it("montant différent de celui demandé : aucun billet, anomalie journalisée, paiement non clos", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.notificationDeReussite(p.id, { montant: 4000 }),
    );

    expect(resume).toMatchObject({ appliques: 0, ignores: 1 });
    expect(t.commandes.confirmations).toEqual([]);
    expect(await etat(t, p.id)).toMatchObject({ statut: "en_attente", cause: "montant_inattendu" });
    expect(t.actions()).toContain("paiement.montant_inattendu");
  });

  it("notification pour un paiement inconnu : comptée, journalisée, aucun effet", async () => {
    const t = monterPaiements();
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "e-x",
          transaction: "simule-enc-999",
          reference: "inconnu",
          etat: "reussi",
          montant: 4250,
        },
      ]),
    );
    expect(resume).toEqual({ recus: 1, appliques: 0, ignores: 0, inconnus: 1 });
    expect(t.actions()).toContain("paiement.notification_inconnue");
    expect(t.commandes.confirmations).toEqual([]);
  });

  it("identifiant de transaction qui ne correspond pas à celui du paiement : ignoré", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const resume = await t.encaissements.traiterNotifications(
      "simule",
      t.agregateur.fabriquerNotification([
        {
          id: "e-y",
          transaction: "simule-enc-777",
          reference: p.id,
          etat: "reussi",
          montant: 4250,
        },
      ]),
    );
    expect(resume).toMatchObject({ appliques: 0, ignores: 1 });
    expect((await etat(t, p.id)).statut).toBe("en_attente");
    expect(t.actions()).toContain("paiement.notification_incoherente");
  });
});

describe("l'argent est reçu mais la commande ne peut plus être honorée", () => {
  it("places reprises : tout est remboursé et le client voit un échec", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const messages: Array<{ statut: string }> = [];
    t.diffusion.souscrire(canalStatutPaiement(p.id), (m) => messages.push(m as { statut: string }));
    t.commandes.erreurs.push({ statut: 409, code: "SIEGES_PERDUS" });

    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));

    expect(await etat(t, p.id)).toMatchObject({
      statut: "reussi",
      confirmation: "sieges_perdus",
      billetIds: [],
    });
    const rembourses = await t.remboursements.dePaiement(p.id);
    expect(rembourses).toHaveLength(1);
    expect(rembourses[0]).toMatchObject({
      cause: "sieges_perdus",
      montant: 4250,
      statut: "reussi",
    });
    expect(messages.at(-1)?.statut).toBe("echoue");
    expect(t.actions()).toContain("paiement.sans_billet");
  });

  it("commande annulée entre-temps : remboursement aussi", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.commandes.erreurs.push({ statut: 409, code: "COMMANDE_ANNULEE" });
    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));

    expect((await etat(t, p.id)).confirmation).toBe("commande_annulee");
    expect((await t.remboursements.dePaiement(p.id))[0]).toMatchObject({
      cause: "commande_annulee",
      montant: 4250,
    });
  });

  it("le remboursement du solde ne dépasse jamais ce qui a été payé", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.commandes.erreurs.push({ statut: 409, code: "SIEGES_PERDUS" });
    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));
    const apres = await etat(t, p.id);

    // une demande de plus sur le même paiement dépasserait la part de la compagnie
    await expect(
      t.remb.demander(p.id, {
        lignes: [{ beneficiaire: "compagnie", montant: 1 }],
        cause: "demande_afrimove",
        cle: "en-trop",
      }),
    ).rejects.toMatchObject({ code: "REMBOURSEMENT_SUPERIEUR_AU_PAIEMENT" });
    expect(apres.montant).toBe(4250);
    expect(
      (await t.remboursements.dePaiement(p.id)).reduce((somme, r) => somme + r.montant, 0),
    ).toBe(4250);
  });

  it("billetterie momentanément en échec : l'erreur remonte, rien n'est perdu, le rejeu ou le balayage finit le travail", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const notification = t.agregateur.notificationDeReussite(p.id);
    t.commandes.erreurs.push({ statut: 503, code: "INDISPONIBLE" });

    await expect(
      t.encaissements.traiterNotifications("simule", notification),
    ).rejects.toMatchObject({
      code: "INDISPONIBLE",
    });
    // l'argent est reçu, la commande attend
    expect(await etat(t, p.id)).toMatchObject({ statut: "reussi", confirmation: "a_faire" });
    expect((await commandeDe(t)).statut).toBe("en_attente_paiement");

    // l'agrégateur renvoie le lot : l'événement n'avait pas été mémorisé, la commande est honorée
    await t.encaissements.traiterNotifications("simule", notification);
    expect(await etat(t, p.id)).toMatchObject({ confirmation: "faite" });
    expect((await commandeDe(t)).billetIds).toHaveLength(1);
  });

  it("billetterie en échec et webhook jamais rejoué : le balayage reprend la confirmation", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.commandes.erreurs.push({ statut: 503, code: "INDISPONIBLE" });
    await t.encaissements
      .traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id))
      .catch(() => undefined);
    expect((await etat(t, p.id)).confirmation).toBe("a_faire");

    const bilan = await t.encaissements.balayer();

    expect(bilan.confirmations).toBe(1);
    expect(await etat(t, p.id)).toMatchObject({ confirmation: "faite" });
    expect(t.commandes.confirmations).toHaveLength(2);
    expect((await commandeDe(t)).billetIds).toHaveLength(1);
  });
});

describe("un webhook ne se croit pas sur parole", () => {
  it("signature fausse (corps modifié) : rejeté, rien n'est appliqué", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const vraie = t.agregateur.notificationDeReussite(p.id);
    const falsifiee = {
      ...vraie,
      corpsBrut: (vraie.corpsBrut ?? "").replace('"reussi"', '"reussi" '),
    };

    await expect(t.encaissements.traiterNotifications("simule", falsifiee)).rejects.toMatchObject({
      name: "NotificationInvalide",
      raison: "signature",
    });
    expect((await etat(t, p.id)).statut).toBe("en_attente");
    expect(t.commandes.confirmations).toEqual([]);
  });

  it("signée avec un autre secret : rejeté", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const tr = t.agregateur.terminer(p.id, "reussi");
    const n = t.agregateur.fabriquerNotification(
      [{ id: "e", transaction: tr.idFournisseur, reference: p.id, etat: "reussi", montant: 4250 }],
      { secret: "le-secret-d-un-autre" },
    );
    await expect(t.encaissements.traiterNotifications("simule", n)).rejects.toBeInstanceOf(
      NotificationInvalide,
    );
    expect((await etat(t, p.id)).statut).toBe("en_attente");
  });

  it("appel trop ancien (rejeu d'une capture) : rejeté", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    const tr = t.agregateur.terminer(p.id, "reussi");
    const ancien = t.agregateur.fabriquerNotification(
      [{ id: "e", transaction: tr.idFournisseur, reference: p.id, etat: "reussi", montant: 4250 }],
      { horodatage: new Date(t.horloge.maintenant().getTime() - 10 * 60_000) },
    );
    await expect(t.encaissements.traiterNotifications("simule", ancien)).rejects.toMatchObject({
      raison: "horodatage",
    });
  });

  it("agrégateur inconnu dans l'adresse : rejeté", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    await expect(
      t.encaissements.traiterNotifications("autre", t.agregateur.notificationDeReussite(p.id)),
    ).rejects.toBeInstanceOf(FournisseurInconnu);
  });
});

describe("webhook perdu ou en retard : on interroge l'agrégateur", () => {
  it("le balayage retrouve un paiement réussi dont la notification ne viendra pas", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.agregateur.terminer(p.id, "reussi");
    t.horloge.avancer(25_000);

    const bilan = await t.encaissements.balayer();

    expect(bilan.consultes).toBe(1);
    expect(await etat(t, p.id)).toMatchObject({ statut: "reussi", confirmation: "faite" });
    expect((await commandeDe(t)).statut).toBe("payee");
  });

  it("trop tôt : le balayage laisse l'opérateur répondre", async () => {
    const t = monterPaiements();
    await payer(t);
    t.horloge.avancer(5_000);
    expect((await t.encaissements.balayer()).consultes).toBe(0);
  });

  it("un paiement sans réponse après son délai devient expiré, la commande reste payable", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.horloge.avancer(4 * 60_000);
    await t.encaissements.balayer();

    expect(await etat(t, p.id)).toMatchObject({ statut: "expire", cause: "delai_depasse" });
    expect((await commandeDe(t)).statut).toBe("en_attente_paiement");
    expect(t.actions()).toContain("paiement.expire");
  });

  it("agrégateur injoignable pendant le balayage : on réessaie plus tard, rien ne change", async () => {
    const t = monterPaiements();
    const p = await payer(t);
    t.horloge.avancer(4 * 60_000);
    t.agregateur.mettreEnPanne();

    await t.encaissements.balayer();
    expect((await etat(t, p.id)).statut).toBe("en_attente");

    t.agregateur.retablir();
    t.horloge.avancer(31_000);
    await t.encaissements.balayer();
    expect((await etat(t, p.id)).statut).toBe("expire");
  });

  it("une issue connue dès l'initiation (carte acceptée sans attente) honore la commande aussitôt", async () => {
    const t = monterPaiements({ issue: "reussi" });
    const p = await t.service.payerCommande(VOYAGEUR, "commande-1", {
      moyen: "carte",
      jetonCarte: "tok_1NxQ7a2eZvKYlo2C",
    });
    expect(p).toMatchObject({ statut: "reussi", confirmation: "faite" });
    expect((await commandeDe(t)).statut).toBe("payee");
    expect(p.compagnieId).toBe(COMPAGNIE);
  });
});
