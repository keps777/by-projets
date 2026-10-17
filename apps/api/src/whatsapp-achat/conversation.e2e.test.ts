import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { USSD } from "../../../../packages/fixtures/src/ecrans/USSD";
import { Inventaire, PreferencesVoyageur } from "../billetterie/ports";
import type { EntrantAchat } from "./modeles";
import {
  DEPART_ALPHA,
  DEPART_BAFOUSSAM,
  TEL_AICHA,
  TEL_ETRANGER,
  TEL_MTN,
  creerAppAchatTest,
  telephone,
  type AppAchatTest,
  type OptionsAppAchatTest,
} from "./testing/app-achat-test";
import { textes } from "./textes";

const PLANCHE = USSD.donnees.whatsapp;
const [DEMANDE, LISTE, CHOIX, PROPOSITION, PAYE] = PLANCHE.echanges;
const lignes = (e: { texte: string[] } | undefined): string => e!.texte.join("\n");

let t: AppAchatTest;

async function demarrer(options?: OptionsAppAchatTest) {
  t = await creerAppAchatTest(options);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await t?.fermer();
});

/** Aïcha demande les départs de demain et choisit Alpha 08:30 (rang 2). */
async function jusquALaProposition(tel = telephone(t, TEL_AICHA)) {
  await tel.dire("Billet Douala Yaoundé demain matin");
  return tel.dire("2");
}

/** Une entrée du journal des sièges : le siège est-il retenu ou vendu ? */
async function siegePris(departId: string, siege: number): Promise<boolean> {
  const plan = await t.app.get(Inventaire).plan(departId);
  return plan.occupes[siege] !== undefined || plan.bloques[siege] !== undefined;
}

describe("un billet complet en 3 réponses, comme la planche", () => {
  it("« Billet Douala Yaoundé demain matin » → 3 départs → « 2 » → « Oui » → billet", async () => {
    await demarrer();
    await t.creerCompte("Aïcha Ngo", TEL_AICHA);
    // Les sièges 1 à 4 sont déjà pris : le premier siège fenêtre libre est le 5.
    await t.occuper(DEPART_ALPHA, [1, 2, 3, 4]);
    const aicha = telephone(t, TEL_AICHA);

    // réponse 1 : la demande de la planche donne les trois départs de la planche, au mot près
    expect(await aicha.dire(lignes(DEMANDE))).toBe(lignes(LISTE));

    // réponse 2 : « 2 » retient Alpha 08:30 ; le texte est celui de la planche (le siège et son
    // emplacement sont ceux du plan de la billetterie : le 7 de la planche est un siège couloir)
    expect(await aicha.dire(lignes(CHOIX))).toBe(
      lignes(PROPOSITION).replace("siège 7 fenêtre", "siège 5 fenêtre"),
    );
    const { commande } = await t.derniereCommande();
    expect(commande).toMatchObject({
      departId: DEPART_ALPHA,
      sieges: [5],
      statut: "en_attente_paiement",
      type: "billet",
      // « 4 000 F par MoMo » : le prix affiché est le prix payé, sans frais en plus
      total: 4000,
      codePromo: "WHATSAPP",
    });
    expect(commande.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["billet", 4000],
      ["frais_voyageur", 0],
    ]);

    // réponse 3 : « Oui » demande MoMo sur le numéro WhatsApp (Orange Money)
    const attente = await aicha.dire("Oui");
    expect(attente).toBe(textes("fr").paiementDemande);
    const [paiement] = await t.paiements.duCommande(commande.id);
    expect(paiement).toMatchObject({
      moyen: "orange_money",
      operateur: "orange",
      statut: "en_attente",
      montant: 4000,
      origine: "voyageur",
    });
    const transaction = t.agregateur.transactions.get(paiement!.id)!;
    expect(transaction.demande).toMatchObject({
      moyen: "orange_money",
      telephone: TEL_AICHA,
      montantFcfa: 4000,
    });
    // le prix va à la compagnie, rien à AfriMove
    expect(transaction.demande.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: "compte-alpha", montantFcfa: 4000 },
    ]);

    // pas de billet tant que le paiement n'est pas confirmé
    expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 0 });
    await t.vider();
    expect(aicha.recus()).toHaveLength(3);

    // MoMo confirme : le billet arrive dans la conversation, au texte de la planche
    await t.confirmerPaiement(commande.id);
    expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 1, billetsEnEchec: 0 });
    await t.vider();
    const billetId = (await t.commandes.trouver(commande.id))!.billetIds[0]!;
    const billet = (await t.billets.trouver(billetId))!;
    expect(aicha.recus()).toHaveLength(4);
    expect(aicha.recus()[3]).toBe(
      lignes(PAYE).replace("ALP-DLA-270106-0031", billet.numero).replace("5582", billet.codeBillet),
    );
    expect(billet).toMatchObject({
      etat: "paye",
      siege: 5,
      prix: 4000,
      acheteurId: commande.voyageurId,
    });
    expect(billet.codeBillet).toMatch(/^\d{4}$/);
    expect(billet.numero).toMatch(/^ALP-DLA-261102-\d{4}$/);

    // le suivi est terminé : un nouveau passage n'envoie plus rien
    expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 0 });
    await t.vider();
    expect(aicha.recus()).toHaveLength(4);
    // la conversation est terminée aussi : « 2 » ne rachète rien
    expect(await aicha.dire("2")).toBe(textes("fr").sansDemande);
  });

  it("un compte sans nom reçoit son billet sans salutation", async () => {
    await demarrer();
    const tel = telephone(t, TEL_MTN);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();
    expect(tel.recus().at(-1)).toMatch(
      /^✓ Payé\. Billet ALP-DLA-\d{6}-\d{4}, code \d{4}\. Bon voyage\.$/,
    );
  });

  it("MTN : le moyen est MTN MoMo, débité sur le numéro qui écrit", async () => {
    await demarrer();
    const tel = telephone(t, TEL_MTN);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    const [paiement] = await t.paiements.duCommande(commande.id);
    expect(paiement).toMatchObject({ moyen: "mtn_momo", operateur: "mtn" });
    expect(t.agregateur.transactions.get(paiement!.id)!.demande.telephone).toBe(TEL_MTN);
  });
});

describe("comprendre la demande", () => {
  it("le moment de la journée filtre la liste : matin, après-midi, nuit", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("billet Douala Yaoundé demain après-midi")).toBe(
      ["1 départ demain :", "1 · 15:00 Alpha 4 000", "Réponds 1."].join("\n"),
    );
    expect(await tel.dire("billet Douala Yaoundé demain nuit")).toBe(
      ["1 départ demain :", "1 · 22:00 Bêta 5 000", "Réponds 1."].join("\n"),
    );
    expect(await tel.dire("billet Douala Yaoundé demain matin")).toBe(lignes(LISTE));
  });

  it("une heure demandée propose les départs à partir de là", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("billet Douala Yaoundé demain 9h")).toBe(
      [
        "3 départs demain :",
        "1 · 09:30 Oméga 3 800",
        "2 · 15:00 Alpha 4 000",
        "3 · 22:00 Bêta 5 000",
        "Réponds 1, 2 ou 3.",
      ].join("\n"),
    );
  });

  it("sans jour : aujourd'hui s'il reste un départ, sinon demain", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    // lundi 07:00 : le Oméga de 11:00 part aujourd'hui
    expect(await tel.dire("billet Douala Yaoundé")).toBe(
      ["1 départ aujourd'hui :", "1 · 11:00 Oméga 3 800", "Réponds 1."].join("\n"),
    );
    // lundi 12:00 : plus rien aujourd'hui, la liste est celle de demain
    t.horloge.avancer(5 * 3_600_000);
    expect((await tel.dire("billet Douala Yaoundé")).split("\n")[0]).toBe("3 départs demain :");
  });

  it("après-demain", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("billet Douala Yaoundé après-demain")).toBe(
      ["1 départ après-demain :", "1 · 08:30 Alpha 4 000", "Réponds 1."].join("\n"),
    );
  });

  it("une seule ville : l'autre vient du trajet habituel, et la liste rappelle le trajet", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    // « je veux aller à Yaoundé demain » (le vocal de la planche) : Douala > Yaoundé par défaut
    expect(await tel.dire("je veux aller à Yaoundé demain")).toBe(
      [
        "Douala → Yaoundé",
        "3 départs demain :",
        "1 · 08:00 Bêta VIP 7 500",
        "2 · 08:30 Alpha 4 000",
        "3 · 09:30 Oméga 3 800",
        "Réponds 1, 2 ou 3.",
      ].join("\n"),
    );
    // Bafoussam : un seul départ, Douala > Bafoussam
    expect(await tel.dire("billet Bafoussam demain")).toBe(
      ["Douala → Bafoussam", "1 départ demain :", "1 · 10:00 Alpha 3 500", "Réponds 1."].join("\n"),
    );
    // « de Bafoussam » : le départ est dit, l'arrivée vient du trajet habituel (Douala > Yaoundé → Yaoundé)
    expect((await tel.dire("billet de Douala demain")).startsWith("Douala → Yaoundé\n")).toBe(true);
  });

  it("le trajet habituel suit le dernier billet du voyageur", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    // un billet Douala > Bafoussam payé : « billet demain » propose Douala > Bafoussam
    await tel.dire("billet Douala Bafoussam demain");
    await tel.dire("1");
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    expect(commande.departId).toBe(DEPART_BAFOUSSAM);
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();
    expect((await tel.dire("billet demain")).split("\n")[0]).toBe("Douala → Bafoussam");
  });

  it("une ville que nous ne desservons pas n'est jamais remplacée par un autre trajet", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    const reponse = await tel.dire("billet pour Garoua demain");
    expect(reponse).toContain("« garoua »");
    expect(reponse).toContain("Douala, Yaoundé, Bafoussam, Bamenda, Kribi, Ngaoundéré");
    expect(await t.achats.enEtat(["reservee", "paiement_demande"], 10)).toEqual([]);
  });

  it("une date qu'on ne sait pas lire est dite, pas devinée", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("billet Douala Yaoundé samedi")).toBe(textes("fr").dateNonLue);
    expect(await tel.dire("billet Douala Yaoundé le 5/11")).toBe(textes("fr").dateNonLue);
  });

  it("deux fois la même ville", async () => {
    await demarrer();
    expect(await telephone(t, TEL_AICHA).dire("billet Douala Douala demain")).toBe(
      textes("fr").memeVille,
    );
  });

  it("aucun départ : on le dit avec le trajet et le jour", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("billet Douala Kribi demain")).toBe(
      "Aucun départ demain pour Douala → Kribi. Essaie un autre jour ou un autre trajet.",
    );
    expect(await tel.dire("billet Douala Yaoundé après-demain soir")).toContain(
      "Aucun départ après-demain soir pour Douala → Yaoundé.",
    );
    expect(await tel.dire("billet Douala Yaoundé aujourd'hui nuit")).toBe(
      "Aucun départ aujourd'hui nuit pour Douala → Yaoundé. Essaie un autre jour ou un autre trajet.",
    );
  });

  it("choisir par le nom de la compagnie ou par l'heure", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await tel.dire("billet Douala Yaoundé demain matin");
    expect(await tel.dire("Alpha")).toMatch(/^Alpha 08:30, siège \d+ /);
    await tel.dire("billet Douala Yaoundé demain matin");
    expect(await tel.dire("9h30")).toMatch(/^Oméga 09:30, siège \d+ /);
    await tel.dire("billet Douala Yaoundé demain matin");
    expect(await tel.dire("le 1 svp")).toMatch(/^Bêta VIP 08:00, siège \d+ /);
  });

  it("la préférence de filtres du voyageur s'applique comme dans l'application", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    const compte = await t.creerCompte("Aïcha Ngo", TEL_AICHA);
    await t.app
      .get(PreferencesVoyageur, { strict: false })
      .enregistrerFiltres(compte.id, "DLA", "YDE", { classe: "vip" });
    expect(await tel.dire("billet Douala Yaoundé demain")).toBe(
      ["1 départ demain :", "1 · 08:00 Bêta VIP 7 500", "Réponds 1."].join("\n"),
    );
  });
});

describe("français, anglais, pidgin", () => {
  it("anglais : toute la conversation, billet compris", async () => {
    await demarrer();
    await t.creerCompte("Aïcha Ngo", TEL_AICHA);
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("ticket Douala Yaoundé tomorrow morning")).toBe(
      [
        "3 departures tomorrow:",
        "1 · 08:00 Bêta VIP 7 500",
        "2 · 08:30 Alpha 4 000",
        "3 · 09:30 Oméga 3 800",
        "Reply 1, 2 or 3.",
      ].join("\n"),
    );
    expect(await tel.dire("2")).toBe(
      "Alpha 08:30, seat 1 window · near the door. 4 000 F by MoMo?\nYes · Change seat",
    );
    expect(await tel.dire("Yes")).toBe(textes("en").paiementDemande);
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();
    expect(tel.recus().at(-1)).toMatch(
      /^✓ Paid\. Ticket ALP-DLA-\d{6}-\d{4}, code \d{4}\. Have a good trip, Aïcha\.$/,
    );
  });

  it("pidgin : « I wan go Yaounde tumara »", async () => {
    await demarrer();
    await t.creerCompte("Aïcha Ngo", TEL_AICHA);
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("I wan go Yaounde tumara")).toBe(
      [
        "Douala → Yaoundé",
        "3 bus fo tumara:",
        "1 · 08:00 Bêta VIP 7 500",
        "2 · 08:30 Alpha 4 000",
        "3 · 09:30 Oméga 3 800",
        "Ansa 1, 2 or 3.",
      ].join("\n"),
    );
    expect(await tel.dire("2")).toBe(
      "Alpha 08:30, seat 1 window · near di door. 4 000 F fo MoMo?\nYes · Change seat",
    );
    // « yes » est de l'anglais, mais aussi du pidgin : la conversation reste en pidgin
    expect(await tel.dire("yes")).toBe(textes("pcm").paiementDemande);
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();
    expect(tel.recus().at(-1)).toMatch(
      /^✓ Payment don enter\. Ticket ALP-DLA-\d{6}-\d{4}, code \d{4}\. Safe journey, Aïcha\.$/,
    );
  });

  it("la langue suit les mots du voyageur, et se change en l'écrivant", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect((await tel.dire("billet Douala Yaoundé demain")).includes("départs")).toBe(true);
    // un message sans indice (un chiffre) garde la langue de la conversation
    expect(await tel.dire("9")).toBe(textes("fr").choixInvalide(3));
    // la langue change dès que le voyageur écrit dans une autre
    expect(await tel.dire("ticket Douala Yaoundé tomorrow")).toContain("departures");
    expect(await tel.dire("pidgin")).toBe(textes("pcm").aide);
    expect(await tel.dire("français")).toBe(textes("fr").aide);
  });
});

describe("changer de siège", () => {
  it("« Changer de siège » liste les sièges libres, un numéro retient le nouveau siège", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await jusquALaProposition(tel)).toBe(
      "Alpha 08:30, siège 1 fenêtre · près de la porte. 4 000 F par MoMo ?\nOui · Changer de siège",
    );
    const avant = (await t.derniereCommande()).commande;

    const sieges = await tel.dire("Changer de siège");
    expect(sieges).toBe(
      [
        "Sièges libres :",
        "2 · couloir · près de la porte",
        "3 · couloir · près de la porte",
        "4 · fenêtre · près de la porte",
        "5 · fenêtre",
        "6 · couloir",
        "7 · couloir",
        "8 · fenêtre",
        "9 · fenêtre",
        "Réponds avec le numéro du siège.",
      ].join("\n"),
    );

    expect(await tel.dire("siège 6")).toBe(
      "Alpha 08:30, siège 6 couloir. 4 000 F par MoMo ?\nOui · Changer de siège",
    );
    const apres = (await t.derniereCommande()).commande;
    expect(apres.id).not.toBe(avant.id);
    expect(apres).toMatchObject({ sieges: [6], statut: "en_attente_paiement", total: 4000 });
    // l'ancien siège est rendu à la vente
    expect((await t.commandes.trouver(avant.id))!.statut).toBe("annulee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(await siegePris(DEPART_ALPHA, 6)).toBe(true);

    // l'ancien achat est clos au prochain passage, le nouveau suit son cours
    await t.suivi.balayer();
    expect((await t.achats.trouver(avant.id))!.etat).toBe("abandonnee");
    expect((await t.achats.trouver(apres.id))!.etat).toBe("reservee");

    // le paiement porte sur le nouveau siège
    await tel.dire("Oui");
    await t.confirmerPaiement(apres.id);
    await t.suivi.balayer();
    const billet = (await t.billets.trouver((await t.commandes.trouver(apres.id))!.billetIds[0]!))!;
    expect(billet.siege).toBe(6);
  });

  it("un siège qui n'est plus libre est refusé, la place déjà retenue est gardée", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Changer de siège");
    await t.occuper(DEPART_ALPHA, [6]);
    expect(await tel.dire("6")).toBe(textes("fr").siegeInvalide);
    const { commande } = await t.derniereCommande();
    expect(commande).toMatchObject({ sieges: [1], statut: "en_attente_paiement" });
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
    // on peut encore choisir un autre siège de la liste
    expect(await tel.dire("7")).toMatch(/^Alpha 08:30, siège 7 couloir\./);
  });

  it("un siège pris pendant la réservation : une autre place est retenue, avec la raison", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Changer de siège");
    // un autre voyageur emporte le siège 6 entre la vérification et la réservation
    const inventaire = t.app.get(Inventaire);
    vi.spyOn(inventaire, "bloquer").mockImplementationOnce(async () => ({
      ok: false,
      raison: "pris" as const,
    }));
    const reponse = await tel.dire("6");
    expect(reponse).toBe(
      "Ce siège vient d'être pris. Voici une autre place.\n" +
        "Alpha 08:30, siège 1 fenêtre · près de la porte. 4 000 F par MoMo ?\nOui · Changer de siège",
    );
    const { commande } = await t.derniereCommande();
    expect(commande).toMatchObject({ sieges: [1], statut: "en_attente_paiement" });
  });

  it("garder son siège : répondre le numéro du siège déjà retenu", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Changer de siège");
    const avant = (await t.derniereCommande()).commande;
    expect(await tel.dire("1")).toBe(
      "Alpha 08:30, siège 1 fenêtre · près de la porte. 4 000 F par MoMo ?\nOui · Changer de siège",
    );
    expect((await t.derniereCommande()).commande.id).toBe(avant.id);
  });

  it("plus aucun autre siège : on le dit et la place est gardée", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await t.occuper(
      DEPART_ALPHA,
      Array.from({ length: 39 }, (_, i) => i + 2),
    );
    expect(await tel.dire("Changer de siège")).toBe(textes("fr").aucunAutreSiege);
    expect(await tel.dire("Oui")).toBe(textes("fr").paiementDemande);
  });
});

describe("abandonner, se tromper, recommencer", () => {
  it("« Non » libère la place", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    const { commande, achat } = await t.derniereCommande();
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
    expect(await tel.dire("Non merci")).toBe(textes("fr").annule);
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
    expect((await t.achats.trouver(achat.commandeId))!.etat).toBe("abandonnee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(t.conversations.toutes).toHaveLength(0);
  });

  it("« annuler » partout dans la conversation", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await tel.dire("billet Douala Yaoundé demain");
    expect(await tel.dire("annuler")).toBe(textes("fr").annule);
    await jusquALaProposition(tel);
    await tel.dire("Changer de siège");
    expect(await tel.dire("annuler")).toBe(textes("fr").annule);
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
  });

  it("une nouvelle demande pendant la proposition rend la place retenue", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
    expect(await tel.dire("billet Douala Bafoussam demain")).toContain("Alpha 3 500");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
  });

  it("trois réponses incompréhensibles de suite ferment la conversation et rendent la place", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    expect(await tel.dire("hmm")).toBe(textes("fr").reponseInvalide);
    expect(await tel.dire("peut-être")).toBe(textes("fr").reponseInvalide);
    expect(await tel.dire("???")).toBe(textes("fr").tropDErreurs);
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(await tel.dire("Oui")).toBe(textes("fr").sansDemande);
  });

  it("une réponse comprise remet le compteur d'erreurs à zéro", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await tel.dire("billet Douala Yaoundé demain");
    await tel.dire("9");
    await tel.dire("9");
    expect(await tel.dire("2")).toMatch(/^Alpha 08:30, siège/);
    await tel.dire("hmm");
    await tel.dire("hmm");
    expect(await tel.dire("Oui")).toBe(textes("fr").paiementDemande);
  });

  it("« 2 » ou « Oui » sans conversation : la demande a expiré", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("2")).toBe(textes("fr").sansDemande);
    expect(await tel.dire("Oui")).toBe(textes("fr").sansDemande);
    await tel.dire("billet Douala Yaoundé demain");
    t.horloge.avancer(16 * 60_000);
    expect(await tel.dire("2")).toBe(textes("fr").sansDemande);
  });

  it("« Oui » après les 15 minutes de la place : le délai est dépassé", async () => {
    await demarrer({ env: { WHATSAPP_ACHAT_SESSION_TTL_MIN: "30" } });
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    t.horloge.avancer(16 * 60_000);
    expect(await tel.dire("Oui")).toBe(textes("fr").delaiDepasse);
    expect(await t.paiements.duCommande((await t.derniereCommande()).commande.id)).toEqual([]);
  });

  it("une place abandonnée est rendue sans attendre : le suivi la libère à l'échéance", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 0 });
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
    t.horloge.avancer(15 * 60_000 + 61_000);
    expect(await t.suivi.balayer()).toMatchObject({ conversationsPurgees: 1 });
    await t.commandesService.expirerEchues();
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect((await t.derniereCommande()).achat.etat).toBe("abandonnee");
  });
});

describe("le paiement", () => {
  it("un numéro qui n'est ni MTN ni Orange : on demande le numéro MoMo", async () => {
    await demarrer();
    const tel = telephone(t, TEL_ETRANGER);
    await jusquALaProposition(tel);
    expect(await tel.dire("Oui")).toBe(textes("fr").numeroMomo);
    expect(await tel.dire("pas de numéro")).toBe(textes("fr").numeroMomoInvalide);
    expect(await tel.dire("+22997001122")).toBe(textes("fr").numeroMomoInvalide);
    expect(await tel.dire("677 01 23 45")).toBe(textes("fr").paiementDemande);
    const { commande } = await t.derniereCommande();
    const [paiement] = await t.paiements.duCommande(commande.id);
    expect(paiement).toMatchObject({ moyen: "mtn_momo", operateur: "mtn" });
    expect(t.agregateur.transactions.get(paiement!.id)!.demande.telephone).toBe(TEL_MTN);
    // le billet part vers le numéro WhatsApp, pas vers le numéro MoMo
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();
    expect(tel.recus().at(-1)).toMatch(/^✓ Payé\. Billet /);
  });

  it("deux « Oui » ne font qu'un paiement", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    expect(await tel.dire("Oui")).toBe(textes("fr").paiementDemande);
    expect(await tel.dire("Oui")).toBe(textes("fr").paiementEnCours);
    const { commande } = await t.derniereCommande();
    expect(await t.paiements.duCommande(commande.id)).toHaveLength(1);
  });

  it("le voyageur ne peut pas annuler un paiement parti, ni en lancer un second sur le même départ", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    expect(await tel.dire("annuler")).toBe(textes("fr").paiementEnCours);
    // une autre demande de billet est possible, mais pas de nouvelle place sur le départ en cours de paiement
    await tel.dire("billet Douala Yaoundé demain matin");
    expect(await tel.dire("2")).toBe(textes("fr").paiementEnCours);
    const { commande } = await t.derniereCommande();
    expect(commande.statut).toBe("en_attente_paiement");
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("payee");
  });

  it("l'agrégateur refuse tout de suite : la place est rendue", async () => {
    await demarrer({ envPaiements: { PAIEMENTS_SIMULE_ISSUE: "echoue" } });
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    expect(await tel.dire("Oui")).toBe(textes("fr").paiementRefuse);
    const { commande, achat } = await t.derniereCommande();
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
    expect(achat.etat).toBe("abandonnee");
    expect(t.journal.de("paiement_refuse")).toHaveLength(1);
  });

  it("le voyageur refuse sur son téléphone : il en est prévenu une fois, la place est rendue", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    expect(await t.suivi.balayer()).toMatchObject({ echecsAnnonces: 0 });
    await t.refuserPaiement(commande.id);
    expect(await t.suivi.balayer()).toMatchObject({ echecsAnnonces: 1, placesLiberees: 1 });
    await t.vider();
    expect(tel.recus().at(-1)).toBe(textes("fr").paiementEchoue);
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect((await t.achats.trouver(commande.id))!.etat).toBe("echouee");
    // une seule fois, et la conversation est terminée
    expect(await t.suivi.balayer()).toMatchObject({ echecsAnnonces: 0 });
    await t.vider();
    expect(tel.recus().filter((m) => m === textes("fr").paiementEchoue)).toHaveLength(1);
    expect(await tel.dire("Oui")).toBe(textes("fr").sansDemande);
  });

  it("mode dégradé : pas de place retenue, on renvoie à la gare", async () => {
    await demarrer();
    await t.degrader(true);
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("Billet Douala Yaoundé demain matin")).toBe(textes("fr").modeDegrade);
    expect(await t.achats.enEtat(["reservee"], 10)).toEqual([]);
    expect(t.journal.de("mode_degrade")).toHaveLength(1);
    await t.degrader(false);
    expect(await tel.dire("Billet Douala Yaoundé demain matin")).toBe(lignes(LISTE));
  });

  it("coupure entre le choix du départ et « Oui » : la place est rendue", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await t.degrader(true);
    expect(await tel.dire("Oui")).toBe(textes("fr").modeDegrade);
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect((await t.derniereCommande()).achat.etat).toBe("abandonnee");
  });

  it("compagnie sans compte de reversement : même réponse, place rendue", async () => {
    await demarrer({ alphaSansCompte: true });
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    expect(await tel.dire("Oui")).toBe(textes("fr").modeDegrade);
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
  });

  it("le code « sans frais » absent : aucun achat, aucune place retenue, l'erreur est dans les logs", async () => {
    await demarrer({ sansPromotion: true });
    const erreur = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const tel = telephone(t, TEL_AICHA);
    await tel.dire("Billet Douala Yaoundé demain matin");
    expect(await tel.dire("2")).toBe(textes("fr").indisponible);
    expect(String(erreur.mock.calls.flat().join(" "))).toContain("WHATSAPP_ACHAT_CODE_SANS_FRAIS");
    expect(await t.achats.enEtat(["reservee"], 10)).toEqual([]);
    expect(t.journal.de("erreur").map((e) => e.code)).toEqual(["CODE_PROMO_INVALIDE"]);
  });

  it("le billet est renvoyé au passage suivant si WhatsApp refuse le premier envoi", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    vi.spyOn(t.passerelle, "repondre").mockRejectedValueOnce(new Error("file indisponible"));
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 0, billetsEnEchec: 1 });
    expect((await t.achats.trouver(commande.id))!.etat).toBe("paiement_demande");
    expect(await t.suivi.balayer()).toMatchObject({ billetsEnvoyes: 1, billetsEnEchec: 0 });
    await t.vider();
    expect(tel.recus().filter((m) => m.startsWith("✓ Payé"))).toHaveLength(1);
    expect(t.journal.de("billet_envoi_echec")).toHaveLength(1);
    expect((await t.achats.trouver(commande.id))!.etat).toBe("terminee");
  });
});

describe("messages vocaux", () => {
  const vocal = (idMedia: string | null, id = `entrant-${idMedia}`): EntrantAchat => ({
    id,
    de: TEL_AICHA,
    texte: null,
    typeMessage: "audio",
    recuA: new Date(),
    idMedia,
  });

  async function parler(entrant: EntrantAchat): Promise<string[]> {
    const tel = telephone(t, TEL_AICHA);
    const avant = tel.recus().length;
    expect(await t.conversation.traiter(entrant)).toBe("traite");
    await t.vider();
    return tel.recus().slice(avant);
  }

  /** La passerelle n'accepte du texte libre que dans les 24 h qui suivent un message du voyageur. */
  async function aEcrit() {
    await t.recevoir({ de: TEL_AICHA, texte: "bonjour" });
  }

  it("« je veux aller à Yaoundé demain » : compris, redit au voyageur, puis la liste", async () => {
    await demarrer();
    await aEcrit();
    t.transcription.definir("media-1", {
      texte: "je veux aller à Yaoundé demain",
      langue: "fr",
    });
    const [reponse] = await parler(vocal("media-1"));
    expect(reponse).toBe(
      [
        "J'ai compris : « je veux aller à Yaoundé demain ».",
        "Douala → Yaoundé",
        "3 départs demain :",
        "1 · 08:00 Bêta VIP 7 500",
        "2 · 08:30 Alpha 4 000",
        "3 · 09:30 Oméga 3 800",
        "Réponds 1, 2 ou 3.",
      ].join("\n"),
    );
    expect(t.transcription.demandes).toEqual([{ idMedia: "media-1", expediteur: TEL_AICHA }]);
    // la suite se fait à l'écrit
    expect(await telephone(t, TEL_AICHA).dire("2")).toMatch(/^Alpha 08:30, siège/);
  });

  it("le vocal est compris dans la langue dite : anglais, pidgin", async () => {
    await demarrer();
    await aEcrit();
    t.transcription.definir("en", {
      texte: "I want a ticket to Yaoundé tomorrow morning",
      langue: "en",
    });
    const [anglais] = await parler(vocal("en"));
    expect(anglais!.split("\n").slice(0, 3)).toEqual([
      "I understood: « I want a ticket to Yaoundé tomorrow morning ».",
      "Douala → Yaoundé",
      "3 departures tomorrow:",
    ]);
    t.transcription.definir("pcm", { texte: "I wan go Yaounde tumara", langue: null });
    const [pidgin] = await parler(vocal("pcm"));
    expect(pidgin!.split("\n").slice(0, 3)).toEqual([
      "I don understand: « I wan go Yaounde tumara ».",
      "Douala → Yaoundé",
      "3 bus fo tumara:",
    ]);
  });

  it("l'indice de langue de la transcription sert quand les mots n'en disent pas", async () => {
    await demarrer();
    await aEcrit();
    t.transcription.definir("indice", { texte: "Douala Yaoundé", langue: "en" });
    const [reponse] = await parler(vocal("indice"));
    expect(reponse).toContain("I understood: « Douala Yaoundé ».");
    expect(reponse).toContain("Reply 1");
  });

  it("vocal illisible, vide, en panne ou trop lent : un message d'excuse, aucune place retenue", async () => {
    await demarrer({ env: { WHATSAPP_ACHAT_DELAI_VOCAL_MS: "1000" } });
    await aEcrit();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const excuse = textes("fr").vocalIllisible;
    // l'audio n'a rien donné
    expect(await parler(vocal("inconnu"))).toEqual([excuse]);
    // le service de transcription est en panne
    t.transcription.panne = true;
    expect(await parler(vocal("media-2"))).toEqual([excuse]);
    t.transcription.panne = false;
    // il met plus de temps que le délai
    t.transcription.definir("lent", { texte: "Douala Yaoundé demain", langue: "fr" });
    t.transcription.lenteurMs = 1500;
    expect(await parler(vocal("lent"))).toEqual([excuse]);
    t.transcription.lenteurMs = 0;
    expect(t.journal.de("vocal_echec").map((e) => e.code)).toEqual([
      "VOCAL_ILLISIBLE",
      "VOCAL_PANNE",
      "VOCAL_PANNE",
    ]);
    expect(await t.achats.enEtat(["reservee"], 10)).toEqual([]);
  });

  it("un vocal sans identifiant de média (la passerelle ne le transmet pas encore) reçoit l'excuse", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    // par le vrai webhook : le lecteur de la passerelle ne garde pas l'identifiant du fichier audio
    expect(await tel.parler()).toEqual([textes("fr").vocalIllisible]);
    expect(t.transcription.demandes).toEqual([]);
    expect(t.journal.de("vocal_echec").map((e) => e.code)).toEqual(["VOCAL_INDISPONIBLE"]);
  });

  it("sans transcription branchée, ou vocal coupé par la configuration : l'excuse aussi", async () => {
    await demarrer({ sansTranscription: true });
    await aEcrit();
    expect(await parler(vocal("media-1"))).toEqual([textes("fr").vocalIllisible]);
    await t.fermer();
    await demarrer({ env: { WHATSAPP_ACHAT_VOCAL: "false" } });
    await aEcrit();
    t.transcription.definir("media-1", { texte: "Douala Yaoundé demain", langue: "fr" });
    expect(await parler(vocal("media-1"))).toEqual([textes("fr").vocalIllisible]);
    expect(t.transcription.demandes).toEqual([]);
  });

  it("un vocal que personne ne comprend reçoit l'aide, sans rien retenir", async () => {
    await demarrer();
    await aEcrit();
    t.transcription.definir("bruit", { texte: "euh bah voilà quoi", langue: null });
    const [reponse] = await parler(vocal("bruit"));
    expect(reponse).toBe(`J'ai compris : « euh bah voilà quoi ».\n${textes("fr").aide}`);
  });

  it("ni le vocal ni sa transcription ne sont conservés", async () => {
    await demarrer();
    await aEcrit();
    t.transcription.definir("secret", {
      texte: "billet Douala Yaoundé demain matin",
      langue: "fr",
    });
    await parler(vocal("secret"));
    const trace = JSON.stringify({
      conversations: t.conversations.toutes,
      journal: t.journal.entrees,
      achats: await t.achats.enEtat(["reservee"], 10),
    });
    expect(trace).not.toContain("secret");
    expect(trace).not.toContain("Douala");
    expect(trace).not.toContain("billet");
  });
});

describe("autres messages", () => {
  it("une image ou un autre média : on dit ce qu'on lit", async () => {
    await demarrer();
    await t.recevoir({ de: TEL_AICHA, texte: null, type: "image" });
    expect(telephone(t, TEL_AICHA).recus()).toEqual([textes("fr").nonTexte]);
  });

  it("bonjour : l'aide, dans la langue de la salutation", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    expect(await tel.dire("Bonjour")).toBe(textes("fr").salutation);
    expect(await tel.dire("Hello")).toBe(textes("en").salutation);
    expect(await tel.dire("how far")).toBe(textes("pcm").salutation);
    expect(textes("fr").salutation).toContain("Écris « billet »");
  });

  it("annuler sans achat en cours : rien à annuler, un billet payé s'annule ailleurs", async () => {
    await demarrer();
    expect(await telephone(t, TEL_AICHA).dire("annuler mon billet")).toBe(
      textes("fr").rienAAnnuler,
    );
  });

  it("un message sans rapport reçoit la phrase d'orientation, ou va à l'assistant s'il y en a un", async () => {
    await demarrer();
    expect(await telephone(t, TEL_AICHA).dire("Pourquoi le 09:30 part si vide ?")).toBe(
      textes("fr").sansDemande,
    );
    await t.fermer();

    await demarrer({ avecAssistant: true });
    await t.recevoir({ de: TEL_AICHA, texte: "Pourquoi le 09:30 part si vide ?" });
    expect(t.assistant.recus).toEqual([
      { de: TEL_AICHA, texte: "Pourquoi le 09:30 part si vide ?" },
    ]);
    expect(telephone(t, TEL_AICHA).recus()).toEqual([]);
  });

  it("l'équipe (patron, superviseurs) va à l'assistant, même si son message parle de billets", async () => {
    await demarrer({ avecAssistant: true });
    t.equipe.ajouter("+237655010001");
    await t.recevoir({ de: "+237655010001", texte: "Combien de billets Bafoussam hier ?" });
    expect(t.assistant.recus).toEqual([
      { de: "+237655010001", texte: "Combien de billets Bafoussam hier ?" },
    ]);
    expect(telephone(t, "+237655010001").recus()).toEqual([]);
    expect(await t.achats.enEtat(["reservee"], 10)).toEqual([]);
  });

  it("un appel rejoué par WhatsApp (même identifiant de message) ne répond qu'une fois", async () => {
    await demarrer();
    await t.recevoir({
      de: TEL_AICHA,
      texte: "billet Douala Yaoundé demain",
      idFournisseur: "wamid.rejeu",
    });
    await t.recevoir({
      de: TEL_AICHA,
      texte: "billet Douala Yaoundé demain",
      idFournisseur: "wamid.rejeu",
    });
    expect(telephone(t, TEL_AICHA).recus()).toHaveLength(1);
  });

  it("une panne d'envoi n'échoue jamais le webhook : elle est journalisée", async () => {
    await demarrer();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    vi.spyOn(t.passerelle, "repondre").mockRejectedValue(new Error("file indisponible"));
    await t.recevoir({ de: TEL_AICHA, texte: "Bonjour" });
    expect(t.journal.de("reponse_non_envoyee")).toHaveLength(1);
  });
});

describe("plusieurs voyageurs à la fois", () => {
  it("5 voyageurs choisissent le même départ en même temps : 5 sièges distincts, 5 commandes", async () => {
    await demarrer();
    const numeros = [
      "+237677000001",
      "+237677000002",
      "+237677000003",
      "+237677000004",
      "+237677000005",
    ];
    const tels = numeros.map((n) => telephone(t, n));
    await Promise.all(tels.map((tel) => tel.dire("billet Douala Yaoundé demain matin")));
    await Promise.all(tels.map((tel) => tel.dire("2")));
    const achats = await t.achats.enEtat(["reservee"], 20);
    expect(achats).toHaveLength(5);
    const commandes = await Promise.all(achats.map((a) => t.commandes.trouver(a.commandeId)));
    const sieges = commandes.map((c) => c!.sieges[0]!).sort((a, b) => a - b);
    expect(new Set(sieges).size).toBe(5);
    expect(commandes.every((c) => c!.departId === DEPART_ALPHA)).toBe(true);
  });

  it("deux messages d'un même voyageur envoyés ensemble passent l'un après l'autre", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await tel.dire("billet Douala Yaoundé demain matin");
    await Promise.all([
      t.recevoir({ de: TEL_AICHA, texte: "2" }),
      t.recevoir({ de: TEL_AICHA, texte: "2" }),
    ]);
    // le premier « 2 » retient la place ; le second, qui arrive sur l'écran de confirmation, est incompris
    const recus = tel.recus();
    expect(recus).toHaveLength(3);
    expect(recus.filter((m) => m.startsWith("Alpha 08:30"))).toHaveLength(1);
    expect(await t.achats.enEtat(["reservee"], 10)).toHaveLength(1);
  });
});

describe("confidentialité", () => {
  it("rien d'identifiant en clair dans les conversations, les achats et le journal", async () => {
    await demarrer();
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();

    const stockage = JSON.stringify({
      conversations: t.conversations.toutes,
      achats: await t.achats.enEtat(["reservee", "paiement_demande", "terminee"], 10),
    });
    expect(stockage).not.toContain("691221008");
    expect(stockage).not.toContain("Douala");

    const journal = JSON.stringify(t.journal.entrees);
    expect(journal).not.toContain("691221008");
    expect(journal).not.toContain("5582");
    expect(journal).not.toContain("Douala");
    expect(journal).not.toContain("Aïcha");
    // le numéro n'apparaît que masqué, et la conversation que par une empreinte
    expect(t.journal.entrees.some((e) => e.numeroMasque === "+237 ••••• 008")).toBe(true);
    expect(
      t.journal.entrees.every(
        (e) => e.conversationRef === null || /^[0-9a-f]{12}$/.test(e.conversationRef),
      ),
    ).toBe(true);
    expect(t.journal.entrees.map((e) => e.evenement)).toEqual(
      expect.arrayContaining([
        "departs_proposes",
        "achat_reserve",
        "paiement_demande",
        "billet_envoye",
      ]),
    );
  });

  it("les journaux techniques ne contiennent ni numéro ni texte de message", async () => {
    await demarrer();
    const logs: string[] = [];
    for (const niveau of ["log", "warn", "error", "debug"] as const) {
      vi.spyOn(Logger.prototype, niveau).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    }
    const tel = telephone(t, TEL_AICHA);
    await jusquALaProposition(tel);
    await tel.dire("Oui");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    await t.vider();
    const tout = logs.join("\n");
    expect(tout).not.toContain("691221008");
    expect(tout).not.toContain("Alpha 08:30");
    expect(tout).not.toContain("Billet Douala");
  });
});
