import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART_ALPHA,
  DEPART_ELITE_VIP,
  creerAppVendeursTest,
  type AppVendeursTest,
} from "./testing/app-vendeurs-test";

describe("vendeurs : l'agrément par les agences", () => {
  let t: AppVendeursTest;

  beforeEach(async () => {
    t = await creerAppVendeursTest({ reglement: "memoire" });
  });
  afterEach(async () => {
    await t.fermer();
  });

  const agreer = (jeton: string, corps: Record<string, unknown> = {}) =>
    t
      .http()
      .post("/agence/vendeurs")
      .set(t.avec(jeton))
      .send({
        nom: "Nadège",
        telephone: "+237677000031",
        quartier: "Ndokoti",
        ville: "Douala",
        ...corps,
      });

  it("un patron agrée un vendeur : compte créé, numéro V-0001, commissions 100 F et 150 F par défaut", async () => {
    const patron = await t.patronDe(COMPAGNIE);
    const rep = await agreer(patron.jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(rep.body).toMatchObject({
      numero: "V-0001",
      nom: "Nadège",
      quartier: "Ndokoti",
      ville: "Douala",
      etat: "actif",
      commissionClassique: 100,
      commissionVip: 150,
      billetsDuMois: 0,
      commissionsDuMois: 0,
      nouveauCompte: true,
    });
    // Le compte a reçu le rôle vendeur et la fiche porte son numéro MoMo (par défaut son téléphone).
    const fiche = await t.vendeurs.trouver(rep.body.vendeurId);
    expect(fiche?.momo).toEqual({ telephone: "+237677000031", operateur: "mtn" });
    expect(fiche?.telephone).toBe("+237677000031");
    // Le vendeur est prévenu par SMS, commission comprise.
    expect(t.messages.messages).toHaveLength(1);
    expect(t.messages.messages[0]?.telephone).toBe("+237677000031");
    expect(t.messages.messages[0]?.message).toContain("Alpha Voyages");
    expect(t.messages.messages[0]?.message).toContain("V-0001");
    expect(t.messages.messages[0]?.message).toContain("100 F");
    expect(t.messages.messages[0]?.message).toContain("150 F");
  });

  it("un superviseur agrée aussi, avec sa propre commission et son numéro MoMo", async () => {
    const superviseur = await t.compte("superviseur");
    const rep = await agreer(superviseur.jeton, {
      commissionClassique: 200,
      commissionVip: 300,
      momo: { telephone: "+237691000032", operateur: "orange" },
    });
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(rep.body).toMatchObject({ commissionClassique: 200, commissionVip: 300 });
    const fiche = await t.vendeurs.trouver(rep.body.vendeurId);
    expect(fiche?.momo).toEqual({ telephone: "+237691000032", operateur: "orange" });
  });

  it("une même agence ne peut pas agréer deux fois le même vendeur", async () => {
    const patron = await t.patronDe(COMPAGNIE);
    expect((await agreer(patron.jeton)).status).toBe(201);
    const deuxieme = await agreer(patron.jeton);
    expect(deuxieme.status).toBe(409);
    expect(deuxieme.body.code).toBe("deja_agree");
  });

  it("deux agences agréent le même vendeur : un seul compte, un seul numéro, deux agréments", async () => {
    const alpha = await t.patronDe(COMPAGNIE);
    const elite = await t.patronDe(AUTRE_COMPAGNIE);
    const premiere = await agreer(alpha.jeton);
    const seconde = await agreer(elite.jeton, { quartier: "Bonamoussadi", commissionVip: 400 });
    expect(seconde.status, JSON.stringify(seconde.body)).toBe(201);
    expect(seconde.body.vendeurId).toBe(premiere.body.vendeurId);
    expect(seconde.body.numero).toBe("V-0001");
    expect(seconde.body.nouveauCompte).toBe(false);
    // La fiche reste celle du premier agrément : une agence ne réécrit pas le quartier d'un vendeur.
    expect((await t.vendeurs.trouver(premiere.body.vendeurId))?.quartier).toBe("Ndokoti");
    const jeton = await t.jetonVendeur(premiere.body.vendeurId);
    const espace = await t.http().get("/vendeurs/moi").set(t.avec(jeton));
    expect(espace.body.vendeur.compagnies).toEqual(["Alpha Voyages", "Élite Express"]);
    expect(espace.body.vendeur.numero).toBe("V-0001");
  });

  it("donne des numéros qui se suivent sans trou", async () => {
    const patron = await t.patronDe(COMPAGNIE);
    const numeros: string[] = [];
    for (const [i, nom] of ["Un", "Deux", "Trois"].entries()) {
      const rep = await agreer(patron.jeton, { nom, telephone: `+23767700010${i}` });
      numeros.push(rep.body.numero);
    }
    expect(numeros).toEqual(["V-0001", "V-0002", "V-0003"]);
  });

  it("ne laisse agréer que le patron et les superviseurs, chacun pour sa seule agence", async () => {
    for (const role of ["voyageur", "guichetier", "convoyeur", "vendeur", "afrimove"] as const) {
      const c = await t.compte(role);
      const rep = await agreer(c.jeton);
      expect(rep.status, role).toBe(403);
    }
    expect((await t.http().post("/agence/vendeurs").send({})).status).toBe(401);
    // Un patron sans agence n'agrée personne.
    const sansAgence = await t.compte("patron", { compagnieId: null, gareId: null });
    const rep = await agreer(sansAgence.jeton);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("compagnie_requise");
  });

  it("refuse une fiche mal formée en nommant les champs fautifs", async () => {
    const patron = await t.patronDe(COMPAGNIE);
    const rep = await agreer(patron.jeton, {
      nom: "",
      telephone: "677000031",
      commissionClassique: 5000,
      momo: { telephone: "+237677000031", operateur: "wave" },
    });
    expect(rep.status).toBe(400);
    expect(rep.body.code).toBe("REQUETE_INVALIDE");
    const chemins = (rep.body.details as { chemin: string }[]).map((d) => d.chemin).sort();
    expect(chemins).toEqual(["commissionClassique", "momo.operateur", "nom", "telephone"]);
  });

  it("un compte vendeur suspendu n'est pas agréé de nouveau", async () => {
    const patron = await t.patronDe(COMPAGNIE);
    const premiere = await agreer(patron.jeton);
    const fiche = (await t.vendeurs.trouver(premiere.body.vendeurId))!;
    await t.vendeurs.remplacer({ ...fiche, actif: false }, fiche.version);
    const elite = await t.patronDe(AUTRE_COMPAGNIE);
    const rep = await agreer(elite.jeton);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("vendeur_suspendu");
  });

  describe("retirer l'agrément, fixer la commission, lister", () => {
    it("la liste ne montre que les vendeurs de l'agence, avec les billets et commissions du mois", async () => {
      const v = await t.creerVendeur({ nom: "Nadège" });
      await t.creerVendeur({
        nom: "Autre",
        compagnies: [AUTRE_COMPAGNIE],
        telephone: "+237677000099",
      });
      const patron = await t.patronDe(COMPAGNIE);
      expect((await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA))).status).toBe(201);
      const rep = await t.http().get("/agence/vendeurs").set(t.avec(patron.jeton));
      expect(rep.status).toBe(200);
      expect(rep.body.vendeurs).toHaveLength(1);
      expect(rep.body.vendeurs[0]).toMatchObject({
        vendeurId: v.id,
        numero: v.numero,
        etat: "actif",
        billetsDuMois: 1,
        commissionsDuMois: 100,
      });
    });

    it("la commission fixée vaut pour les prochaines ventes seulement", async () => {
      const v = await t.creerVendeur({});
      const patron = await t.patronDe(COMPAGNIE);
      const avant = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA, { nom: "Premier" }));
      expect(avant.body.commission).toBe(100);
      const rep = await t
        .http()
        .put(`/agence/vendeurs/${v.id}/commissions`)
        .set(t.avec(patron.jeton))
        .send({ commissionClassique: 250, commissionVip: 350 });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body).toMatchObject({ commissionClassique: 250, commissionVip: 350 });
      const apres = await t.vendre(
        v.jeton,
        t.venteDe(DEPART_ALPHA, { nom: "Second", telephone: "+237670999999" }),
      );
      expect(apres.body.commission).toBe(250);
      // Le billet déjà vendu garde sa commission de 100 F.
      const premiere = await t.ventes.duVendeur(v.id, { etats: ["terminee"] });
      // (L'horloge de test est figée : les deux ventes ont le même instant, l'ordre n'est pas celui de la vente.)
      expect(premiere.map((x) => x.commission).sort((a, b) => a - b)).toEqual([100, 250]);
    });

    it("l'agence ne règle que ses propres vendeurs", async () => {
      const v = await t.creerVendeur({});
      const elite = await t.patronDe(AUTRE_COMPAGNIE);
      for (const [methode, chemin, corps] of [
        ["post", `/agence/vendeurs/${v.id}/retrait`, {}],
        [
          "put",
          `/agence/vendeurs/${v.id}/commissions`,
          { commissionClassique: 1, commissionVip: 2 },
        ],
      ] as const) {
        const rep = await t.http()[methode](chemin).set(t.avec(elite.jeton)).send(corps);
        expect(rep.status, chemin).toBe(404);
        expect(rep.body.code).toBe("agrement_introuvable");
      }
    });

    it("après le retrait, le vendeur ne vend plus les billets de cette agence, mais ceux déjà vendus restent valables", async () => {
      const v = await t.creerVendeur({ compagnies: [COMPAGNIE, AUTRE_COMPAGNIE] });
      const vendu = await t.vendre(v.jeton, t.venteDe(DEPART_ALPHA));
      expect(vendu.status).toBe(201);
      const patron = await t.patronDe(COMPAGNIE);
      const retrait = await t
        .http()
        .post(`/agence/vendeurs/${v.id}/retrait`)
        .set(t.avec(patron.jeton));
      expect(retrait.status, JSON.stringify(retrait.body)).toBe(200);
      expect(retrait.body.etat).toBe("retire");

      const refus = await t.vendre(
        v.jeton,
        t.venteDe(DEPART_ALPHA, { nom: "Autre", telephone: "+237670999999" }),
      );
      expect(refus.status).toBe(403);
      expect(refus.body.code).toBe("compagnie_non_agreee");
      // L'autre agence continue.
      const elite = await t.vendre(
        v.jeton,
        t.venteDe(DEPART_ELITE_VIP, { nom: "Autre", telephone: "+237670999999" }),
      );
      expect(elite.status, JSON.stringify(elite.body)).toBe(201);
      // Le billet vendu avant le retrait existe toujours.
      const billet = await t.billets.trouver(vendu.body.billetId);
      expect(billet?.etat).toBe("paye");
      const espace = await t.http().get("/vendeurs/moi").set(t.avec(v.jeton));
      expect(espace.body.vendeur.compagnies).toEqual(["Élite Express"]);
      // L'agrément retiré peut être redonné.
      const reagree = await agreer(patron.jeton, { telephone: v.telephone });
      expect(reagree.status, JSON.stringify(reagree.body)).toBe(201);
      expect(reagree.body.numero).toBe(v.numero);
    });

    it("le contrat de l'espace est respecté", async () => {
      const v = await t.creerVendeur({});
      const rep = await t.http().get("/vendeurs/moi").set(t.avec(v.jeton));
      expect(() => contrats.SchemaEspaceVendeur.parse(rep.body)).not.toThrow();
    });
  });
});
