import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART_ALPHA,
  DEPART_ELITE_VIP,
  creerAppVendeursTest,
  type AppVendeursTest,
} from "./testing/app-vendeurs-test";

const HEURE = 3_600_000;
const JOUR_MS = 24 * HEURE;

describe("vendeurs : les commissions sont versées le lundi", () => {
  let t: AppVendeursTest;

  beforeEach(async () => {
    t = await creerAppVendeursTest({ reglement: "memoire" });
  });
  afterEach(async () => {
    await t.fermer();
  });

  /** Le vendeur vend `n` billets Alpha à des voisins différents. */
  let voisins = 0;
  async function vendreDesBillets(jeton: string, n: number, depart = DEPART_ALPHA) {
    for (let i = 0; i < n; i++) {
      voisins += 1;
      const tel = `+23767099${String(voisins).padStart(4, "0")}`;
      const rep = await t.vendre(jeton, t.venteDe(depart, { nom: `Voisin ${i}`, telephone: tel }));
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    }
  }

  const messagesDeVersement = () =>
    t.messages.messages.filter((m) => m.message.includes("commissions"));

  it("le lundi à 9 h, verse tout le solde au numéro MoMo du vendeur, avec une clé qui porte la semaine", async () => {
    const v = await t.creerVendeur({});
    await vendreDesBillets(v.jeton, 2);
    expect(await t.commissions.solde(v.id)).toBe(200);
    expect(t.versements.envoyes).toHaveLength(0);

    const bilan = await t.services.commissions.verserLaSemaine();
    expect(bilan).toEqual({ verses: 1, enAttente: 0, refuses: 0 });
    expect(t.versements.envoyes).toHaveLength(1);
    expect(t.versements.envoyes[0]).toMatchObject({
      cle: `commissions:${v.id}:261102`,
      operateur: "mtn",
      telephone: v.telephone,
      montant: 200,
    });
    expect(t.versements.envoyes[0]?.libelle).toContain("commissions");
    expect(await t.commissions.solde(v.id)).toBe(0);
    expect([...t.commissions.debitsLignes.values()]).toMatchObject([
      { montant: 200, etat: "verse" },
    ]);
    // Le vendeur est prévenu, et son gain du mois reste affiché après le versement.
    expect(messagesDeVersement()).toHaveLength(1);
    expect(messagesDeVersement()[0]).toMatchObject({ telephone: v.telephone });
    expect(messagesDeVersement()[0]?.message).toContain("200 F");
    const espace = await t.http().get("/vendeurs/moi").set(t.avec(v.jeton));
    expect(espace.body.bilan.gainDuMois).toBe(200);
    expect(
      t.audit.lignes.some((l) => l.action === "vendeur.versement" && l.resultat === "succes"),
    ).toBe(true);
  });

  it("relancer la tâche le même lundi ne paie jamais deux fois", async () => {
    const v = await t.creerVendeur({});
    await vendreDesBillets(v.jeton, 2);
    await t.services.commissions.verserLaSemaine();
    for (let i = 0; i < 3; i++) {
      expect(await t.services.commissions.verserLaSemaine()).toEqual({
        verses: 0,
        enAttente: 0,
        refuses: 0,
      });
    }
    expect(t.versements.envoyes).toHaveLength(1);
  });

  it("pas avant 8 h le lundi, pas les autres jours : le solde attend le prochain lundi", async () => {
    const v = await t.creerVendeur({});
    await vendreDesBillets(v.jeton, 1);

    t.horloge.avancer(-90 * 60_000); // lundi 7 h 30
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(0);
    t.horloge.avancer(90 * 60_000 + JOUR_MS); // mardi 9 h
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(0);
    t.horloge.avancer(5 * JOUR_MS); // dimanche 9 h
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(0);
    expect(t.versements.envoyes).toHaveLength(0);
    expect(await t.commissions.solde(v.id)).toBe(100);

    t.horloge.avancer(JOUR_MS); // lundi 9 novembre, 9 h
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(1);
    expect(t.versements.envoyes[0]).toMatchObject({
      cle: `commissions:${v.id}:261109`,
      montant: 100,
    });
  });

  it("une commission gagnée après le versement attend le lundi suivant, sans toucher au premier paiement", async () => {
    const v = await t.creerVendeur({});
    await vendreDesBillets(v.jeton, 1);
    await t.services.commissions.verserLaSemaine();

    await vendreDesBillets(v.jeton, 1);
    expect(await t.commissions.solde(v.id)).toBe(100);
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(0);
    expect(t.versements.envoyes).toHaveLength(1);

    t.horloge.avancer(7 * JOUR_MS);
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(1);
    expect(t.versements.envoyes.map((e) => [e.cle.split(":")[2], e.montant])).toEqual([
      ["261102", 100],
      ["261109", 100],
    ]);
    expect(await t.commissions.solde(v.id)).toBe(0);
  });

  it("chaque vendeur reçoit ses propres commissions, VIP comprises, sur son opérateur", async () => {
    const mtn = await t.creerVendeur({});
    const orange = await t.creerVendeur({
      compagnies: [AUTRE_COMPAGNIE],
      telephone: "+237691000032",
      operateur: "orange",
    });
    await vendreDesBillets(mtn.jeton, 3);
    const vip = await t.vendre(orange.jeton, t.venteDe(DEPART_ELITE_VIP, {}, "orange_money"));
    expect(vip.status).toBe(201);

    const bilan = await t.services.commissions.verserLaSemaine();
    expect(bilan.verses).toBe(2);
    const parVendeur = new Map(t.versements.envoyes.map((e) => [e.telephone, e]));
    expect(parVendeur.get(mtn.telephone)).toMatchObject({ montant: 300, operateur: "mtn" });
    expect(parVendeur.get("+237691000032")).toMatchObject({ montant: 150, operateur: "orange" });
  });

  it("une commission de 0 F ne crée rien à verser", async () => {
    const v = await t.creerVendeur({ commissions: { commissionClassique: 0, commissionVip: 0 } });
    await vendreDesBillets(v.jeton, 1);
    expect(t.commissions.creditsLignes.size).toBe(0);
    expect(await t.services.commissions.verserLaSemaine()).toEqual({
      verses: 0,
      enAttente: 0,
      refuses: 0,
    });
    expect(t.versements.envoyes).toHaveLength(0);
  });

  it("le retrait de l'agrément n'enlève pas les commissions déjà gagnées", async () => {
    const v = await t.creerVendeur({});
    await vendreDesBillets(v.jeton, 2);
    const patron = await t.patronDe(COMPAGNIE);
    await t.http().post(`/agence/vendeurs/${v.id}/retrait`).set(t.avec(patron.jeton));
    expect((await t.services.commissions.verserLaSemaine()).verses).toBe(1);
    expect(t.versements.envoyes[0]?.montant).toBe(200);
  });

  describe("quand l'opérateur ne suit pas", () => {
    it("refus définitif : le solde revient, le vendeur est payé le lundi suivant la nouvelle tentative", async () => {
      const v = await t.creerVendeur({});
      await vendreDesBillets(v.jeton, 2);
      t.versements.refuse = true;
      expect(await t.services.commissions.verserLaSemaine()).toEqual({
        verses: 0,
        enAttente: 0,
        refuses: 1,
      });
      expect(await t.commissions.solde(v.id)).toBe(200);
      expect(t.commissions.debitsLignes.size).toBe(0);
      expect(messagesDeVersement()).toHaveLength(0);
      expect(
        t.audit.lignes.some((l) => l.action === "vendeur.versement" && l.resultat === "echec"),
      ).toBe(true);

      // Le numéro est corrigé : la tâche suivante du même lundi réussit.
      t.versements.refuse = false;
      expect((await t.services.commissions.verserLaSemaine()).verses).toBe(1);
      expect(t.versements.envoyes).toHaveLength(1);
      expect(await t.commissions.solde(v.id)).toBe(0);
    });

    it("pas de réponse : le montant reste réservé, la reprise le verse une seule fois", async () => {
      const v = await t.creerVendeur({});
      await vendreDesBillets(v.jeton, 2);
      t.versements.enPanne = true;
      expect(await t.services.commissions.verserLaSemaine()).toEqual({
        verses: 0,
        enAttente: 1,
        refuses: 0,
      });
      // Réservé : le solde n'est pas disponible une seconde fois, rien n'est parti.
      expect(await t.commissions.solde(v.id)).toBe(0);
      expect(t.versements.envoyes).toHaveLength(0);
      expect(await t.commissions.debitsEnAttente()).toHaveLength(1);

      // Une relance tant que l'opérateur est en panne ne change rien.
      expect(await t.services.commissions.reprendre()).toBe(0);
      expect(await t.services.commissions.verserLaSemaine()).toEqual({
        verses: 0,
        enAttente: 0,
        refuses: 0,
      });

      t.versements.enPanne = false;
      expect(await t.services.commissions.reprendre()).toBe(1);
      expect(t.versements.envoyes).toHaveLength(1);
      expect(t.versements.envoyes[0]).toMatchObject({
        montant: 200,
        cle: `commissions:${v.id}:261102`,
      });
      expect(await t.commissions.debitsEnAttente()).toHaveLength(0);
      expect(await t.services.commissions.reprendre()).toBe(0);
      expect(t.versements.envoyes).toHaveLength(1);
      expect(messagesDeVersement()).toHaveLength(1);
    });

    it("la tâche complète (ventes, versements, reprises) ne verse pas deux fois non plus", async () => {
      const v = await t.creerVendeur({});
      await vendreDesBillets(v.jeton, 2);
      t.versements.enPanne = true;
      await t.services.taches.toutExecuter();
      t.versements.enPanne = false;
      await t.services.taches.toutExecuter();
      await t.services.taches.toutExecuter();
      expect(t.versements.envoyes).toHaveLength(1);
      expect(t.versements.envoyes[0]?.montant).toBe(200);
    });

    it("deux instances qui versent en même temps : un seul versement", async () => {
      const v = await t.creerVendeur({});
      await vendreDesBillets(v.jeton, 2);
      const [a, b] = await Promise.all([
        t.services.commissions.verserLaSemaine(),
        t.services.commissions.verserLaSemaine(),
      ]);
      expect(a.verses + b.verses).toBe(1);
      expect(t.versements.envoyes).toHaveLength(1);
      expect(t.versements.envoyes[0]?.montant).toBe(200);
      expect(await t.commissions.solde(v.id)).toBe(0);
    });
  });
});
