import { voyageur } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USSD } from "../../../../packages/fixtures/src/ecrans/USSD";
import { BilletsService } from "../billetterie/billets.service";
import { Inventaire } from "../billetterie/ports";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import type { PersonnesMemoire } from "../socle/testing/memoire";
import {
  ALPHA,
  DEPART_ALPHA,
  DEPART_BAFOUSSAM,
  DEPART_BETA,
  DEPART_DEMAIN,
  DEPART_OMEGA,
  JETON_MTN,
  TEL_MTN,
  TEL_ORANGE,
  TEL_PROCHE,
  creerAppUssdTest,
  telephone,
  type AppUssdTest,
  type OptionsAppUssdTest,
} from "./testing/app-ussd-test";
import { TEXTES, ecranMenu } from "./textes";

const PLANCHE = USSD.donnees;

let t: AppUssdTest;

async function demarrer(options?: OptionsAppUssdTest) {
  t = await creerAppUssdTest(options);
}

afterEach(async () => {
  await t?.fermer();
});

/** Le siège est-il retenu ou vendu sur ce départ ? */
async function siegePris(departId: string, siege: number): Promise<boolean> {
  const plan = await t.app.get(Inventaire).plan(departId);
  return plan.occupes[siege] !== undefined || plan.bloques[siege] !== undefined;
}

/** Compose le code, tape 1 (Billet) puis le rang du départ : l'écran du siège et du paiement. */
async function jusquAuPaiement(tel: ReturnType<typeof telephone>, rang = "2") {
  await tel.composer();
  await tel.repondre("1");
  return tel.repondre(rang);
}

describe("trois réponses = un billet", () => {
  beforeEach(() => demarrer());

  it("MTN : le menu, les départs et le paiement de la planche, puis le SMS avec le code", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);

    const menu = await tel.composer();
    expect(menu).toEqual({ texte: ecranMenu(), fin: false, statut: 200 });

    // réponse 1 : les départs de la planche, au caractère près
    const departs = await tel.repondre("1");
    expect(departs.fin).toBe(false);
    expect(departs.texte.split("\n")).toEqual(PLANCHE.ussd.ecran.slice(9, 13));

    // réponse 2 : le départ Alpha, siège attribué, demande de paiement de la planche
    const place = await tel.repondre("2");
    expect(place.fin).toBe(false);
    expect(place.texte.split("\n")).toEqual(["Place: 1", "Payer MoMo? 1=oui"]);
    const { commande } = await t.derniereCommande();
    expect(commande).toMatchObject({
      departId: DEPART_ALPHA,
      sieges: [1],
      statut: "en_attente_paiement",
      type: "billet",
      // « mêmes prix, zéro frais en plus » : le prix affiché (4 000 F) est le prix payé
      total: 4000,
      codePromo: "USSD",
    });
    expect(commande.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["billet", 4000],
      ["frais_voyageur", 0],
    ]);

    // réponse 3 : MoMo demandé sur le téléphone qui a composé le code
    const fin = await tel.repondre("1");
    expect(fin.fin).toBe(true);
    expect(fin.texte).toBe(TEXTES.paiementDemande);
    const [paiement] = await t.paiements.duCommande(commande.id);
    expect(paiement).toMatchObject({
      moyen: "mtn_momo",
      operateur: "mtn",
      statut: "en_attente",
      montant: 4000,
      origine: "voyageur",
    });
    const transaction = t.agregateur.transactions.get(paiement!.id)!;
    expect(transaction.demande).toMatchObject({
      moyen: "mtn_momo",
      telephone: TEL_MTN,
      montantFcfa: 4000,
    });
    // le prix va à la compagnie, rien à AfriMove
    expect(transaction.demande.repartition).toEqual([
      { beneficiaire: "compagnie", compteId: "compte-alpha", montantFcfa: 4000 },
    ]);

    // pas de SMS tant que le paiement n'est pas confirmé
    expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 0 });
    expect(t.notifieur.envoyes).toHaveLength(0);

    // MTN confirme : le billet est émis, le SMS part avec le code à 4 chiffres et le lien
    await t.confirmerPaiement(commande.id);
    expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 1, smsEnEchec: 0 });
    const billetId = (await t.commandes.trouver(commande.id))!.billetIds[0]!;
    const billet = (await t.billets.trouver(billetId))!;
    expect(t.notifieur.envoyes).toHaveLength(1);
    expect(t.notifieur.envoyes[0]).toMatchObject({
      billetId,
      destinataire: TEL_MTN,
      compagnieId: ALPHA,
      variables: {
        compagnie: "Alpha Voyages",
        origine: "Douala",
        destination: "Yaoundé",
        siege: "1",
        code: billet.codeBillet,
        lien: `https://afrimove.app/b/${billetId}`,
      },
    });
    expect(billet.codeBillet).toMatch(/^\d{4}$/);
    expect(billet).toMatchObject({ etat: "paye", siege: 1, prix: 4000 });

    // le suivi est terminé : un nouveau passage n'envoie plus rien
    expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 0 });
    expect(t.notifieur.envoyes).toHaveLength(1);
  });

  it("Orange : le même parcours débite Orange Money sur le numéro qui a composé le code", async () => {
    const tel = telephone(t, "orange", TEL_ORANGE);
    expect((await tel.composer()).texte).toBe(ecranMenu());
    expect((await tel.repondre("1")).texte.split("\n")).toEqual(PLANCHE.ussd.ecran.slice(9, 13));
    expect((await tel.repondre("1")).texte).toBe("Place: 1\nPayer MoMo? 1=oui");
    const fin = await tel.repondre("1");
    expect(fin).toMatchObject({ fin: true, texte: TEXTES.paiementDemande });

    const { commande } = await t.derniereCommande();
    expect(commande).toMatchObject({ departId: DEPART_BETA, total: 7500 });
    const [paiement] = await t.paiements.duCommande(commande.id);
    expect(paiement).toMatchObject({ moyen: "orange_money", operateur: "orange", montant: 7500 });
    expect(t.agregateur.transactions.get(paiement!.id)!.demande.telephone).toBe(TEL_ORANGE);
  });

  it("le numéro qui compose est son compte : créé sans nom, retrouvé aux appels suivants", async () => {
    const comptes = t.app.get(ComptesService);
    expect(await comptes.trouverParTelephone(TEL_MTN)).toBeNull();
    await telephone(t, "mtn", TEL_MTN).composer();
    const compte = await comptes.trouverParTelephone(TEL_MTN);
    expect(compte).toMatchObject({ nom: "", roles: ["voyageur"], actif: true });
    await telephone(t, "orange", TEL_MTN).composer();
    expect((await comptes.trouverParTelephone(TEL_MTN))!.id).toBe(compte!.id);
  });

  it("un compte désactivé n'ouvre pas de session", async () => {
    const comptes = t.app.get(ComptesService);
    const compte = await comptes.creer({ nom: "X", telephone: TEL_MTN, roles: ["voyageur"] });
    (t.app.get(PersonnesRepository) as PersonnesMemoire).lignes.get(compte.id)!.actif = false;
    const ecran = await telephone(t, "mtn", TEL_MTN).composer();
    expect(ecran).toMatchObject({ fin: true, texte: TEXTES.compteIndisponible });
  });

  it("la réponse « 1 » rejouée après la fin de la session ne paie pas une deuxième fois", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    expect((await tel.repondre("1")).fin).toBe(true);
    const rejeu = await tel.repondre("1");
    expect(rejeu).toMatchObject({ fin: true, texte: TEXTES.sessionExpiree("*123#") });
    const { commande } = await t.derniereCommande();
    expect(await t.paiements.duCommande(commande.id)).toHaveLength(1);
  });

  it("le même numéro qui recommence ne cumule pas les sièges : la nouvelle réservation remplace l'ancienne", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel); // siège 1 de l'Alpha, jamais payé
    const premiere = (await t.derniereCommande()).commande;
    const tel2 = telephone(t, "mtn", TEL_MTN);
    const place = await jusquAuPaiement(tel2);
    // le siège 1 était encore retenu quand le siège a été choisi : le voyageur a le 2, et le 1 est rendu
    expect(place.texte).toBe("Place: 2\nPayer MoMo? 1=oui");
    expect((await t.commandes.trouver(premiere.id))!.statut).toBe("annulee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(await siegePris(DEPART_ALPHA, 2)).toBe(true);
  });
});

describe("le menu", () => {
  beforeEach(() => demarrer());

  it("0 : l'aide, et la session se termine", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect(await tel.repondre("0")).toEqual({ texte: TEXTES.aide, fin: true, statut: 200 });
  });

  it("une réponse invalide réaffiche le menu, trois de suite ferment la session", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    const un = await tel.repondre("9");
    expect(un).toMatchObject({ fin: false, texte: `${TEXTES.invalide}\n${ecranMenu()}` });
    const deux = await tel.repondre("x");
    expect(deux).toMatchObject({ fin: false });
    expect(deux.texte.startsWith(TEXTES.invalide)).toBe(true);
    expect(await tel.repondre("7")).toMatchObject({
      fin: true,
      texte: TEXTES.tropDErreurs("*123#"),
    });
  });

  it("une bonne réponse remet le compteur d'erreurs à zéro", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    await tel.repondre("9");
    await tel.repondre("9");
    expect((await tel.repondre("3")).texte).toBe(TEXTES.numeroColis);
    expect((await tel.repondre("ab")).fin).toBe(false);
    expect((await tel.repondre("ab")).fin).toBe(false);
  });

  it("2 Mon billet : rien sans billet, puis le billet payé avec son code et sa place", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect(await tel.repondre("2")).toMatchObject({ fin: true, texte: TEXTES.aucunBillet });

    const achat = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(achat);
    await achat.repondre("1");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    const billet = (await t.billets.trouver(
      (await t.commandes.trouver(commande.id))!.billetIds[0]!,
    ))!;

    const apres = telephone(t, "orange", TEL_MTN);
    await apres.composer();
    const ecran = await apres.repondre("2");
    expect(ecran.fin).toBe(true);
    expect(ecran.texte.split("\n")).toEqual([
      `Billet ${billet.numero}`,
      "Alpha 08:30",
      "Douala>Yaounde",
      "Place: 1",
      `Code: ${billet.codeBillet}`,
    ]);
  });

  it("2 Mon billet : le prochain billet d'abord, et le nombre des autres", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    for (const rang of ["3", "2"]) {
      const achat = telephone(t, "mtn", TEL_MTN);
      await jusquAuPaiement(achat, rang);
      await achat.repondre("1");
      await t.confirmerPaiement((await t.derniereCommande()).commande.id);
    }
    await tel.composer();
    const ecran = await tel.repondre("2");
    expect(ecran.texte).toContain("Alpha 08:30");
    expect(ecran.texte.split("\n").at(-1)).toBe("+1 autre");
  });

  it("4 Suivre bus : sans billet, sans position, puis la position du bus du billet", async () => {
    const sans = telephone(t, "mtn", TEL_MTN);
    await sans.composer();
    expect(await sans.repondre("4")).toMatchObject({ fin: true, texte: TEXTES.aucunBus });

    const achat = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(achat);
    await achat.repondre("1");
    await t.confirmerPaiement((await t.derniereCommande()).commande.id);

    const nue = telephone(t, "mtn", TEL_MTN);
    await nue.composer();
    expect((await nue.repondre("4")).texte).toBe(TEXTES.busSansPosition);

    t.bus.definir(DEPART_ALPHA, {
      arriveeEstimee: new Date("2026-11-02T12:40:00+01:00"),
      retardMinutes: 10,
      prochainArret: "Édéa",
    });
    const avec = telephone(t, "mtn", TEL_MTN);
    await avec.composer();
    expect((await avec.repondre("4")).texte.split("\n")).toEqual([
      "Alpha Douala>Yaounde",
      "Arrivee prevue 12:40",
      "Retard: 10 min",
      "Prochain arret: Edea",
    ]);
  });

  it("3 Colis : l'état du colis, seulement pour son expéditeur ou son destinataire", async () => {
    t.colis.ajouter({ numero: "COL-0042", etat: "en_route" }, TEL_MTN);
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect((await tel.repondre("3")).texte).toBe(TEXTES.numeroColis);
    expect(await tel.repondre("col-0042")).toEqual({
      texte: "Colis COL-0042\nEn route",
      fin: true,
      statut: 200,
    });

    const autre = telephone(t, "orange", TEL_ORANGE);
    await autre.composer();
    await autre.repondre("3");
    expect(await autre.repondre("COL-0042")).toMatchObject({
      fin: true,
      texte: TEXTES.colisIntrouvable,
    });
  });

  it("3 Colis : un numéro mal tapé redemande le numéro", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    await tel.repondre("3");
    const ecran = await tel.repondre("!");
    expect(ecran).toMatchObject({ fin: false, texte: `${TEXTES.invalide}\n${TEXTES.numeroColis}` });
  });
});

describe("les départs", () => {
  it("le trajet suit le dernier billet du voyageur", async () => {
    await demarrer();
    const comptes = t.app.get(ComptesService);
    const personne = await comptes.creer({ nom: "Aïcha", telephone: TEL_MTN, roles: ["voyageur"] });
    const utilisateur = {
      id: personne.id,
      role: "voyageur" as const,
      compagnieId: null,
      gareId: null,
    };
    const commande = await t.commandesService.creer(utilisateur, {
      departId: DEPART_BAFOUSSAM,
      sieges: [3],
      pour: "moi",
      codePromo: "USSD",
    });
    await t.commandesService.confirmerPaiement(commande.id, "mtn_momo");

    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    const departs = await tel.repondre("1");
    expect(departs.texte.split("\n")).toEqual(["Bafoussam>Douala", "1 10:00 Alpha 3500"]);
  });

  it("sans départ aujourd'hui, ceux de demain, annoncés", async () => {
    await demarrer({ sansDepartsAujourdhui: true });
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    const departs = await tel.repondre("1");
    expect(departs.texte.split("\n")).toEqual(["Douala>Yaounde demain", "1 07:00 Alpha 4000"]);
    await tel.repondre("1");
    expect((await t.derniereCommande()).commande.departId).toBe(DEPART_DEMAIN);
  });

  it("un départ complet n'est pas proposé, une liste vide le dit", async () => {
    await demarrer();
    const alpha = (await t.catalogue.depart(DEPART_ALPHA))!;
    // les 40 sièges de l'Alpha sont vendus : il disparaît de la liste
    for (let siege = 1; siege <= alpha.bus!.capacite; siege++) {
      await t.app.get(Inventaire).occuper({
        departId: DEPART_ALPHA,
        siege,
        billetId: `billet-${siege}`,
        par: null,
        maintenant: t.maintenant(),
      });
    }
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    const departs = await tel.repondre("1");
    expect(departs.texte.split("\n")).toEqual([
      "Douala>Yaounde",
      "1 08:00 Beta VIP 7500",
      "2 09:30 Omega 3800",
    ]);
  });

  it("aucun départ du tout : le dire, sans retenir de place", async () => {
    await demarrer({ sansDepartsAujourdhui: true });
    await t.catalogue.changerDepart(DEPART_DEMAIN, "en_vente", { etat: "annule" });
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.aucunDepart });
  });

  it("un numéro de départ hors liste redemande le choix sans retenir de siège", async () => {
    await demarrer();
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    const liste = (await tel.repondre("1")).texte;
    for (const mauvais of ["0", "4", "9", "a"]) {
      const ecran = await tel.repondre(mauvais);
      if (ecran.fin) break;
      expect(ecran.texte).toBe(`${TEXTES.invalide}\n${liste}`);
    }
    expect(await t.achats.enEtat(["reservee"], 10)).toHaveLength(0);
  });

  it("cinq voyageurs qui choisissent le même départ en même temps ont cinq sièges différents", async () => {
    await demarrer();
    const telephones = [40, 41, 42, 43, 44].map((n) => telephone(t, "mtn", `+2376770123${n}`));
    for (const tel of telephones) {
      await tel.composer();
      await tel.repondre("1");
    }
    const ecrans = await Promise.all(telephones.map((tel) => tel.repondre("2")));
    const sieges = ecrans.map((e) => Number(/^Place: (\d+)\n/.exec(e.texte)![1]));
    expect(new Set(sieges).size).toBe(5);
    expect([...sieges].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    for (const s of sieges) expect(await siegePris(DEPART_ALPHA, s)).toBe(true);
  });
});

describe("5 Proche", () => {
  beforeEach(() => demarrer());

  it("le billet est au nom d'un proche et le SMS part vers son numéro, le paiement vient du payeur", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect((await tel.repondre("5")).texte).toBe(TEXTES.numeroProche);
    const refus = await tel.repondre("abc");
    expect(refus).toMatchObject({
      fin: false,
      texte: `${TEXTES.numeroProcheInvalide}\n${TEXTES.numeroProche}`,
    });
    const departs = await tel.repondre("655123456");
    expect(departs.texte.split("\n")).toEqual(PLANCHE.ussd.ecran.slice(9, 13));
    expect((await tel.repondre("2")).texte).toBe("Place: 1\nPayer MoMo? 1=oui");
    expect((await tel.repondre("1")).fin).toBe(true);

    const { commande } = await t.derniereCommande();
    expect(commande).toMatchObject({ type: "proche", total: 4000 });
    const [paiement] = await t.paiements.duCommande(commande.id);
    // c'est le téléphone qui a composé le code qui est débité
    expect(t.agregateur.transactions.get(paiement!.id)!.demande.telephone).toBe(TEL_MTN);

    await t.confirmerPaiement(commande.id);
    await t.suivi.balayer();
    const billet = (await t.billets.trouver(
      (await t.commandes.trouver(commande.id))!.billetIds[0]!,
    ))!;
    const passager = await t.app.get(BilletsService).passager(billet);
    expect(passager).toMatchObject({ nom: "Proche 3456", telephone: TEL_PROCHE });
    expect(t.notifieur.envoyes).toHaveLength(1);
    expect(t.notifieur.envoyes[0]!.destinataire).toBe(TEL_PROCHE);
  });
});

describe("abandon, expiration et sécurité des sessions", () => {
  beforeEach(() => demarrer());

  it("répondre autre chose que 1 libère la place tout de suite", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    const { commande } = await t.derniereCommande();
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);
    expect(await tel.repondre("2")).toMatchObject({ fin: true, texte: TEXTES.annule });
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect((await t.derniereCommande()).achat.etat).toBe("abandonnee");
    expect(await t.paiements.duCommande(commande.id)).toHaveLength(0);
  });

  it("raccrocher (Orange le signale) libère la place retenue", async () => {
    const tel = telephone(t, "orange", TEL_ORANGE);
    await jusquAuPaiement(tel, "1");
    expect(await siegePris(DEPART_BETA, 1)).toBe(true);
    const fin = await tel.quitter();
    expect(fin).toMatchObject({ fin: true, texte: "" });
    expect(await siegePris(DEPART_BETA, 1)).toBe(false);
    expect((await t.derniereCommande()).achat.etat).toBe("abandonnee");
  });

  it("une session sans réponse expire : la réponse tardive reçoit « session expirée »", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    t.horloge.avancer(t.config.sessionTtlMs + 1000);
    expect(await tel.repondre("1")).toMatchObject({
      fin: true,
      texte: TEXTES.sessionExpiree("*123#"),
    });
  });

  it("chaque réponse prolonge la session", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    t.horloge.avancer(t.config.sessionTtlMs - 5000);
    await tel.repondre("1");
    t.horloge.avancer(t.config.sessionTtlMs - 5000);
    expect((await tel.repondre("2")).texte).toContain("Place:");
  });

  it("une place retenue dont la session est échue est libérée par le suivi, sans attendre les 15 minutes", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    const { commande } = await t.derniereCommande();

    // dans le délai : rien ne bouge
    t.horloge.avancer(t.config.sessionTtlMs);
    expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 0 });
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(true);

    t.horloge.avancer(t.config.abandonApresMs);
    expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 1 });
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect((await t.derniereCommande()).achat.etat).toBe("abandonnee");
    expect(await t.suivi.balayer()).toMatchObject({ placesLiberees: 0 });
  });

  it("l'identifiant de session ne sert qu'au numéro qui l'a ouverte", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    const sessionId = (tel as unknown as { sessionId: string }).sessionId;
    const r = await t
      .http()
      .post("/ussd/mtn")
      .set("Authorization", `Bearer ${JETON_MTN}`)
      .send({ sessionId, msisdn: TEL_ORANGE, text: "1" });
    expect(r.status).toBe(200);
    expect(r.text).toBe(`END ${TEXTES.indisponible}`);
    expect(t.journal.de("numero_incoherent")).toHaveLength(1);
  });

  it("rien de personnel en clair dans les sessions, les achats ni le journal", async () => {
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    const stocke = JSON.stringify([t.sessions.toutes, await t.achats.enEtat(["reservee"], 10)]);
    expect(stocke).not.toContain("677012345");
    expect(stocke).not.toContain("Alpha");
    await tel.repondre("1");
    const journal = JSON.stringify(t.journal.entrees);
    expect(journal).not.toContain("677012345");
    expect(journal).not.toContain("Payer MoMo");
    expect(journal).not.toContain("Place:");
    expect(journal).not.toContain("session-");
    expect(t.journal.entrees.map((e) => e.evenement)).toEqual([
      "ouverte",
      "reponse",
      "achat_reserve",
      "reponse",
      "paiement_demande",
      "reponse",
    ]);
    expect(t.journal.entrees[0]).toMatchObject({
      operateur: "mtn",
      msisdnMasque: "+237 ••••• 345",
      etape: "menu",
    });
    expect(t.journal.entrees[0]!.sessionRef).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("le connecteur de l'opérateur", () => {
  beforeEach(() => demarrer());

  const corps = { sessionId: "s1", msisdn: TEL_MTN, text: "" };

  it("refuse un appel sans jeton ou avec un mauvais jeton, et n'ouvre aucune session", async () => {
    expect((await t.http().post("/ussd/mtn").send(corps)).status).toBe(401);
    const faux = await t.http().post("/ussd/mtn").set("Authorization", "Bearer faux").send(corps);
    expect(faux.status).toBe(401);
    expect(faux.body).toMatchObject({ code: "JETON_INVALIDE" });
    // le jeton d'Orange n'ouvre pas la porte de MTN
    const croise = await t
      .http()
      .post("/ussd/mtn")
      .set("x-ussd-jeton", "jeton-orange-pour-les-tests-uniquement-0123456789")
      .send(corps);
    expect(croise.status).toBe(401);
    expect(t.sessions.toutes).toHaveLength(0);
    expect(t.journal.de("refus_jeton")).toHaveLength(3);
  });

  it("accepte le jeton dans l'en-tête x-ussd-jeton", async () => {
    const r = await t.http().post("/ussd/mtn").set("x-ussd-jeton", JETON_MTN).send(corps);
    expect(r.status).toBe(200);
    expect(r.text).toBe(`CON ${ecranMenu()}`);
  });

  it("accepte un formulaire (application/x-www-form-urlencoded)", async () => {
    const r = await t
      .http()
      .post("/ussd/mtn")
      .set("Authorization", `Bearer ${JETON_MTN}`)
      .type("form")
      .send(corps);
    expect(r.status).toBe(200);
    expect(r.text.startsWith("CON AfriMove")).toBe(true);
  });

  it("répond 400 à une requête illisible, 404 à un opérateur inconnu", async () => {
    const illisible = await t
      .http()
      .post("/ussd/mtn")
      .set("Authorization", `Bearer ${JETON_MTN}`)
      .send({ sessionId: "s1", text: "" });
    expect(illisible.status).toBe(400);
    expect(illisible.body).toMatchObject({ code: "REQUETE_ILLISIBLE" });
    expect(t.journal.de("requete_illisible")).toHaveLength(1);
    const inconnu = await t
      .http()
      .post("/ussd/vodafone")
      .set("Authorization", `Bearer ${JETON_MTN}`)
      .send(corps);
    expect(inconnu.status).toBe(404);
  });

  it("un connecteur sans jeton configuré est inactif", async () => {
    await t.fermer();
    await demarrer({ env: { USSD_ORANGE_JETON: "" } });
    const r = await t
      .http()
      .post("/ussd/orange")
      .set("Authorization", "Bearer n-importe-quoi")
      .send({ session_id: "s", msisdn: TEL_ORANGE, request_type: "begin" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "CONNECTEUR_INCONNU" });
  });
});

describe("mode dégradé et pannes", () => {
  it("paiement en ligne coupé : on le dit dès « 1 Billet », sans retenir de place", async () => {
    await demarrer();
    await t.degrader(true);
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.modeDegrade });
    expect(await t.achats.enEtat(["reservee"], 10)).toHaveLength(0);
    expect(t.journal.de("mode_degrade")).toHaveLength(1);
    // le menu reste utilisable : Mon billet et l'aide ne dépendent pas de l'agrégateur
    const autre = telephone(t, "mtn", TEL_MTN);
    await autre.composer();
    expect((await autre.repondre("0")).texte).toBe(TEXTES.aide);
  });

  it("paiement coupé entre le choix du départ et « 1 » : la place est rendue", async () => {
    await demarrer();
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    const { commande } = await t.derniereCommande();
    await t.degrader(true);
    expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.modeDegrade });
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("annulee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(await t.paiements.duCommande(commande.id)).toHaveLength(0);
  });

  it("compagnie sans compte de reversement : même réponse, place rendue", async () => {
    await demarrer({ alphaSansCompte: true });
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.modeDegrade });
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
  });

  it("agrégateur en panne : deux paiements incertains ouvrent le circuit, puis le mode dégradé s'annonce", async () => {
    await demarrer();
    t.agregateur.mettreEnPanne();
    for (const n of [50, 51]) {
      const tel = telephone(t, "mtn", `+2376770123${n}`);
      await jusquAuPaiement(tel);
      // la demande est peut-être partie : le webhook ou le balayage des paiements tranchera
      expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.paiementDemande });
    }
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.modeDegrade });
    expect(await siegePris(DEPART_ALPHA, 3)).toBe(false);
  });

  it("l'agrégateur refuse la demande : le voyageur est prévenu et la place est rendue", async () => {
    await demarrer();
    t.agregateur.programmer({ type: "refuse", code: "solde_insuffisant" });
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    expect(await tel.repondre("1")).toMatchObject({ fin: true, texte: TEXTES.paiementRefuse });
    const { commande, achat } = await t.derniereCommande();
    expect(commande.statut).toBe("annulee");
    expect(achat.etat).toBe("abandonnee");
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(t.journal.de("paiement_refuse").map((e) => e.code)).toEqual(["solde_insuffisant"]);
  });

  it("le code « sans frais » absent des promotions : rien n'est retenu ni facturé", async () => {
    await demarrer({ sansPromotion: true });
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    await tel.repondre("1");
    expect(await tel.repondre("2")).toMatchObject({ fin: true, texte: TEXTES.indisponible });
    expect(await t.achats.enEtat(["reservee"], 10)).toHaveLength(0);
    expect(await siegePris(DEPART_ALPHA, 1)).toBe(false);
    expect(t.journal.de("erreur").map((e) => e.code)).toEqual(["CODE_PROMO_INVALIDE"]);
  });

  it("le départ part entre l'affichage et le choix : « départ indisponible », rien n'est retenu", async () => {
    await demarrer();
    const tel = telephone(t, "mtn", TEL_MTN);
    await tel.composer();
    await tel.repondre("1");
    await t.catalogue.changerDepart(DEPART_OMEGA, "en_vente", { etat: "annule" });
    const ecran = await tel.repondre("3");
    expect(ecran).toMatchObject({ fin: true, texte: TEXTES.departIndisponible("*123#") });
    expect(await t.achats.enEtat(["reservee"], 10)).toHaveLength(0);
  });

  it("un paiement déjà en cours sur ce départ : on le dit, sans annuler la commande ni en ouvrir un second", async () => {
    await demarrer();
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    await tel.repondre("1");
    const { commande } = await t.derniereCommande();

    // le voyageur recompose le code avant d'avoir validé sur son téléphone
    const encore = telephone(t, "mtn", TEL_MTN);
    const ecran = await jusquAuPaiement(encore);
    expect(ecran).toMatchObject({ fin: true, texte: TEXTES.paiementEnCours });
    expect((await t.commandes.trouver(commande.id))!.statut).toBe("en_attente_paiement");
    expect(await t.paiements.duCommande(commande.id)).toHaveLength(1);

    // il peut en revanche prendre un autre départ
    const autre = telephone(t, "mtn", TEL_MTN);
    await autre.composer();
    await autre.repondre("1");
    expect((await autre.repondre("3")).texte).toBe("Place: 1\nPayer MoMo? 1=oui");
  });
});

describe("le SMS du billet", () => {
  it("un échec d'envoi est repris au passage suivant, sans doublon", async () => {
    await demarrer();
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    await tel.repondre("1");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);

    t.notifieur.panne = true;
    expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 0, smsEnEchec: 1 });
    expect((await t.achats.trouver(commande.id))!.etat).toBe("paiement_demande");
    expect(t.journal.de("sms_billet_echec")).toHaveLength(1);

    t.notifieur.panne = false;
    expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 1, smsEnEchec: 0 });
    expect((await t.achats.trouver(commande.id))!.etat).toBe("terminee");
    expect(t.notifieur.envoyes).toHaveLength(1);
  });

  it("par la passerelle SMS : un seul SMS « billet » par billet, même si le suivi repasse", async () => {
    await demarrer({ smsReel: true });
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    await tel.repondre("1");
    const { commande } = await t.derniereCommande();
    await t.confirmerPaiement(commande.id);
    const billetId = (await t.commandes.trouver(commande.id))!.billetIds[0]!;

    expect(await t.suivi.balayer()).toMatchObject({ smsEnvoyes: 1 });
    const filtre = { type: "billet" as const, reference: { type: "billet", id: billetId } };
    expect(await t.journalSms.lister(filtre)).toHaveLength(1);

    // le suivi est relancé (deuxième instance, reprise après incident) : la clé d'idempotence tient
    await t.achats.transitionner(commande.id, ["terminee"], "paiement_demande");
    await t.suivi.balayer();
    expect(await t.journalSms.lister(filtre)).toHaveLength(1);
  });

  it("une commande jamais payée n'envoie aucun SMS et est close après 24 h", async () => {
    await demarrer();
    const tel = telephone(t, "mtn", TEL_MTN);
    await jusquAuPaiement(tel);
    await tel.repondre("1");
    const { commande } = await t.derniereCommande();
    t.horloge.avancer(60 * 60_000);
    await t.suivi.balayer();
    expect((await t.achats.trouver(commande.id))!.etat).toBe("paiement_demande");
    t.horloge.avancer(24 * 60 * 60_000);
    await t.suivi.balayer();
    expect((await t.achats.trouver(commande.id))!.etat).toBe("terminee");
    expect(t.notifieur.envoyes).toHaveLength(0);
  });
});

describe("l'aperçu « Sans internet » de l'application", () => {
  beforeEach(() => demarrer());

  it("sert l'écran de la planche, au format du contrat", async () => {
    await telephone(t, "mtn", TEL_MTN).composer();
    const jeton = await t.jeton(TEL_MTN);
    const r = await t.http().get("/voyageur/sans-internet").set("Authorization", `Bearer ${jeton}`);
    expect(r.status).toBe(200);
    const apercu = voyageur.SchemaApercuSansInternet.parse(r.body);
    expect(apercu.ussd.code).toBe("*123#");
    expect(apercu.ussd.lignes).toEqual(PLANCHE.ussd.ecran);
    expect(apercu.ussd.touches).toEqual(PLANCHE.ussd.clavier);
    expect(apercu.ussd.note).toBe(PLANCHE.ussd.note);
    expect(apercu.whatsapp.echanges).toHaveLength(PLANCHE.whatsapp.echanges.length);
    expect(apercu.whatsapp.vocal).toBe(PLANCHE.whatsapp.vocal);
  });

  it("le menu du vrai service est le menu de l'aperçu", async () => {
    await telephone(t, "mtn", TEL_MTN).composer();
    const jeton = await t.jeton(TEL_MTN);
    const apercu = voyageur.SchemaApercuSansInternet.parse(
      (await t.http().get("/voyageur/sans-internet").set("Authorization", `Bearer ${jeton}`)).body,
    );
    const vrai = (await telephone(t, "orange", TEL_ORANGE).composer()).texte.split("\n");
    expect(apercu.ussd.lignes.slice(0, 7)).toEqual(vrai.slice(0, 7));
  });

  it("demande un compte voyageur", async () => {
    expect((await t.http().get("/voyageur/sans-internet")).status).toBe(401);
  });
});
