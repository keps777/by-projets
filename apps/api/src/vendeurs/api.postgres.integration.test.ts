import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPTIONS_BILLETTERIE } from "../billetterie/passerelle";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { CONFIG_PAIEMENTS, chargerConfigPaiements } from "../paiements/config";
import { creerAppPg, entetePg, type AppPg } from "../socle/testing/app-pg";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { CommissionsVendeurs, OPTIONS_VENDEURS, type OptionsVendeurs } from "./ports";

/**
 * Les vendeurs ambulants sur PostgreSQL, par l'API : agrément par le patron d'une agence (compte créé, PIN
 * provisoire envoyé par SMS), vente d'un billet à un voisin avec règlement de l'agence par l'agrégateur
 * simulé, commission créditée une fois, vente rejouée sans doublon, puis redémarrage de l'API.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · vendeurs, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let t: AppPg;

  const options: OptionsVendeurs = {
    delaiReglementMs: 2_000,
    sondageMs: 5,
    tachesMs: 0,
    baseLienBillet: "https://afrimove.app/b/",
  };
  const montage = () =>
    creerAppPg({
      url: base.url,
      personnaliser: (builder) =>
        builder
          .overrideProvider(CONFIG_PAIEMENTS)
          .useValue(
            chargerConfigPaiements({
              PAIEMENTS_FOURNISSEUR: "simule",
              PAIEMENTS_SIMULE_ISSUE: "reussi",
              PAIEMENTS_BALAYAGE_MS: "0",
              PAIEMENTS_CONSULTATION_APRES_MS: "0",
              PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
            }),
          )
          .overrideProvider(OPTIONS_BILLETTERIE)
          .useValue({ balayageMs: 0, pingMs: 0 })
          .overrideProvider(OPTIONS_VENDEURS)
          .useValue(options),
    });

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await montage();
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  it("de l'agrément à la commission, puis après un redémarrage", async () => {
    // Le réseau : une agence, deux gares, une ligne, un bus, un départ demain à 8 h 30 (Douala).
    const fx = new FixturesPg(t.prisma);
    const agence = await fx.compagnie();
    const douala = await fx.gare(agence.id, { ville: "Douala" });
    const yaounde = await fx.gare(agence.id, { ville: "Yaoundé" });
    const ligne = await fx.ligne(agence.id, douala.id, yaounde.id);
    const bus = await fx.bus(agence.id);
    const depart = await fx.depart(ligne.id, {
      busId: bus.id,
      heureDepart: new Date("2027-01-05T07:30:00.000Z"),
    });

    const afrimove = await t.compte("afrimove");
    const patron = await t.compte("patron", { compagnieId: agence.id, gareId: null });
    const compte = await t
      .http()
      .put(`/paiements/comptes-reversement/${agence.id}`)
      .set(entetePg(afrimove.jeton))
      .send({ compteId: "compte-alpha" });
    expect(compte.status, JSON.stringify(compte.body)).toBeLessThan(300);

    // L'agrément crée le compte du vendeur (rôle vendeur, PIN par SMS), sa fiche et son numéro.
    const telephone = "+237677100200";
    const agrement = await t
      .http()
      .post("/agence/vendeurs")
      .set(entetePg(patron.jeton))
      .send({
        nom: "Nadège Fouda",
        telephone,
        quartier: "Ndokoti",
        ville: "Douala",
        momo: { telephone, operateur: "mtn" },
      });
    expect(agrement.status, JSON.stringify(agrement.body)).toBe(201);
    const vendeurId = agrement.body.vendeurId as string;
    expect(agrement.body.numero).toMatch(/^V-\d{4,}$/);
    const compteVendeur = await t.prisma.personne.findUniqueOrThrow({ where: { id: vendeurId } });
    expect(compteVendeur.roles).toEqual(["vendeur"]);
    expect(compteVendeur.pinHache).not.toBeNull();
    const ligneVendeur = await t.prisma.vendeur.findUniqueOrThrow({ where: { id: vendeurId } });
    expect(ligneVendeur.nomChiffre).not.toContain("Nadège");
    const deux = await t
      .http()
      .post("/agence/vendeurs")
      .set(entetePg(patron.jeton))
      .send({ nom: "Nadège Fouda", telephone, quartier: "Ndokoti", ville: "Douala" });
    expect(deux.status).toBe(409);

    const jeton = await t.jetonPour(vendeurId, "vendeur");
    const espace = await t.http().get("/vendeurs/moi").set(entetePg(jeton));
    expect(espace.status, JSON.stringify(espace.body)).toBe(200);

    // La vente : le voisin reçoit un billet, l'agence est payée, la commission est créditée.
    const vente = {
      departId: depart.id,
      voisin: { nom: "Mme Ebogo", telephone: "+237699456789" },
      reglementAgence: "mtn_momo",
    };
    const rep = await t.http().post("/vendeurs/moi/ventes").set(entetePg(jeton)).send(vente);
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(rep.body).toMatchObject({ prix: 8000, commission: 100 });
    const rejeu = await t.http().post("/vendeurs/moi/ventes").set(entetePg(jeton)).send(vente);
    expect(rejeu.status, JSON.stringify(rejeu.body)).toBe(201);
    expect(rejeu.body.billetId).toBe(rep.body.billetId);
    expect(await t.prisma.billet.count({ where: { departId: depart.id } })).toBe(1);
    expect(await t.prisma.venteVendeur.count({ where: { vendeurId } })).toBe(1);
    expect(await t.resoudre(CommissionsVendeurs).solde(vendeurId)).toBe(100);
    const enBase = await t.prisma.venteVendeur.findFirstOrThrow({ where: { vendeurId } });
    expect(enBase).toMatchObject({ etat: "terminee", prix: 8000, commission: 100 });
    expect(enBase.voisinTelephoneChiffre).not.toContain("456789");

    // Le même voisin n'a pas un second billet sur ce départ.
    const doublon = await t
      .http()
      .post("/vendeurs/moi/ventes")
      .set(entetePg(jeton))
      .send({ ...vente, voisin: { nom: "Mme Ebogo", telephone: "+237699456789" } });
    expect(doublon.status).toBe(201);
    expect(await t.prisma.billet.count({ where: { departId: depart.id } })).toBe(1);

    // Redémarrage : une autre instance de l'API sur la même base.
    await t.fermer();
    t = await montage();
    expect(await t.resoudre(CommissionsVendeurs).solde(vendeurId)).toBe(100);
    const apres = await t.http().get("/vendeurs/moi").set(entetePg(jeton));
    expect(apres.status, JSON.stringify(apres.body)).toBe(200);
    const clients = await t.http().get("/vendeurs/moi/clients").set(entetePg(jeton));
    expect(clients.status, JSON.stringify(clients.body)).toBe(200);
    expect(JSON.stringify(clients.body)).toContain("Ebogo");
  }, 60_000);
});
