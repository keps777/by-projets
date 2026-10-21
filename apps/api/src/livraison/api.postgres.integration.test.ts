import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { emettreCodeRetrait, poivreCodeRetrait } from "../colis/codes";
import { ColisRepository } from "../colis/ports";
import { unColis } from "../colis/testing/contrat-ports";
import { Portefeuille } from "../relais/ports";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { creerAppPg, entetePg, type AppPg } from "../socle/testing/app-pg";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { MissionsService } from "./missions.service";

const DEMANDE_MOTO = {
  deplacement: "moto",
  zone: "Bafoussam · Tamdja, Djeleng, centre",
  heures: "Soirs 17 h – 21 h",
  chargeMax: "10 kg · colis courants",
  momo: { telephone: "+237670000333", operateur: "mtn" },
  pieces: { permisRef: "photos/permis.jpg", assuranceRef: "photos/assurance.jpg" },
  reglesAcceptees: true,
};

const VERIFICATION = {
  identite: true,
  pieces: { permisValideJusqua: "2030-01-31", assuranceExpireLe: "2027-12-31" },
  formation: true,
};

/** 18 h 30 à Douala : dans les heures « soirs 17 h – 21 h ». */
const SOIR = new Date("2027-01-04T17:30:00.000Z");

/**
 * La livraison moto sur PostgreSQL, par l'API : demande, vérification et activation du livreur (le compte
 * reçoit le rôle `livreur`), mission proposée au seul livreur qui convient, acceptation, remise contre le
 * code du client, gain de 700 F crédité une seule fois, puis redémarrage de l'API : rien n'est perdu.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · livraison, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let t: AppPg;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await creerAppPg({ url: base.url, debut: SOIR });
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  it("de la demande du livreur à la livraison payée, puis après un redémarrage", async () => {
    const agent = await t.compte("afrimove");
    const candidat = await t.compte("voyageur", {
      nom: "Éric Tchoumi",
      telephone: "+237677000222",
    });

    // La demande et son activation.
    const depot = await t
      .http()
      .post("/partenaires/livreurs/demandes")
      .set(entetePg(candidat.jeton))
      .send(DEMANDE_MOTO);
    expect(depot.status, JSON.stringify(depot.body)).toBe(201);
    const dossier = depot.body.dossier as string;
    expect(dossier).toBe("L-BAF-0001");
    const seconde = await t
      .http()
      .post("/partenaires/livreurs/demandes")
      .set(entetePg(candidat.jeton))
      .send(DEMANDE_MOTO);
    expect(seconde.status).toBe(409);
    const verification = await t
      .http()
      .post(`/partenaires/livreurs/demandes/${dossier}/verification`)
      .set(entetePg(agent.jeton))
      .send(VERIFICATION);
    expect(verification.status, JSON.stringify(verification.body)).toBe(200);
    const activations = await Promise.all(
      [1, 2].map(() =>
        t
          .http()
          .post(`/partenaires/livreurs/demandes/${dossier}/activation`)
          .set(entetePg(agent.jeton))
          .send({ moto: "OU 517 MT" }),
      ),
    );
    expect(
      activations.map((r) => r.status),
      JSON.stringify(activations.map((r) => r.body)),
    ).toContain(200);
    expect(await t.prisma.livreur.count({ where: { personneId: candidat.id } })).toBe(1);
    const personne = await t.prisma.personne.findUniqueOrThrow({ where: { id: candidat.id } });
    expect(personne.roles.filter((r) => r === "livreur")).toHaveLength(1);
    const livreur = await t.prisma.livreur.findUniqueOrThrow({
      where: { personneId: candidat.id },
    });
    expect(livreur.momoTelephoneChiffre).not.toContain("670000333");

    const jeton = await t.jetonPour(candidat.id, "livreur");
    const enLigne = await t
      .http()
      .put("/livreurs/moi/disponibilite")
      .set(entetePg(jeton))
      .send({ disponible: true });
    expect(enLigne.status, JSON.stringify(enLigne.body)).toBe(200);

    // Un colis « moto » arrivé à la gare de Bafoussam, payé, avec un vrai code de retrait.
    const fx = new FixturesPg(t.prisma);
    const compagnie = await fx.compagnie();
    const origine = await fx.gare(compagnie.id, { ville: "Douala" });
    const destination = await fx.gare(compagnie.id, { ville: "Bafoussam" });
    const expediteur = await fx.personne({ roles: ["voyageur"] });
    const ligne = await fx.ligne(compagnie.id, origine.id, destination.id);
    const depart = await fx.depart(ligne.id);
    const ref = (g: typeof origine) => ({ id: g.id, code: g.code, nom: g.nom, ville: g.ville });
    const poivre = poivreCodeRetrait(t.app.get<AppConfig>(CONFIG).poivre);
    const emis = emettreCodeRetrait(poivre);
    const colis = unColis(
      {
        compagnieId: compagnie.id,
        origine: ref(origine),
        destination: ref(destination),
        expediteurId: expediteur.id,
        auteurId: expediteur.id,
        departId: depart.id,
      },
      {
        mode: "moto",
        etat: "disponible",
        adresseLivraison: "Tamdja, face au marché",
        disponibleDepuis: "2027-01-04T18:00:00.000+01:00",
        devis: [
          { code: "port", libelle: "Port", montant: 1500 },
          { code: "livraison", libelle: "Livraison moto", montant: 1000 },
        ],
        prixTotal: 2500,
        code: {
          hache: emis.hache,
          sel: emis.sel,
          chiffre: "enc:v1:k1:nonce:tag:chiffre",
          essais: 0,
          bloque: false,
          envoyeA: null,
          smsDestinataire: "au_retour_du_reseau",
        },
      },
    );
    expect(await t.resoudre(ColisRepository).ajouter(colis)).toBe("ajoute");

    // La mission n'est proposée qu'une fois, au livreur qui convient.
    const missions = t.resoudre(MissionsService);
    const mission = await missions.ouvrirPourColis(colis);
    expect(mission).toMatchObject({ etat: "proposee", livreurId: livreur.id, gain: 700 });
    expect(await missions.ouvrirPourColis(colis)).toBeNull();
    expect(await t.prisma.missionLivraison.count({ where: { colisId: colis.id } })).toBe(1);

    const espace = await t.http().get("/livreurs/moi").set(entetePg(jeton));
    expect(espace.status, JSON.stringify(espace.body)).toBe(200);
    const acceptations = await Promise.all(
      [1, 2].map(() =>
        t.http().post(`/livreurs/moi/missions/${mission!.id}/acceptation`).set(entetePg(jeton)),
      ),
    );
    expect(
      acceptations.map((r) => r.status),
      JSON.stringify(acceptations.map((r) => r.body)),
    ).toEqual([200, 200]);

    // Un mauvais code ne livre rien ; le bon livre et crédite 700 F, une seule fois.
    const mauvais = await t
      .http()
      .post(`/livreurs/moi/missions/${mission!.id}/remise`)
      .set(entetePg(jeton))
      .send({
        code: emis.code === "000000" ? "111111" : "000000",
        pieceVerifiee: true,
        photoRef: "photos/remise.jpg",
      });
    expect(mauvais.status, JSON.stringify(mauvais.body)).toBeGreaterThanOrEqual(400);
    const remise = await t
      .http()
      .post(`/livreurs/moi/missions/${mission!.id}/remise`)
      .set(entetePg(jeton))
      .send({ code: emis.code, pieceVerifiee: true, photoRef: "photos/remise.jpg" });
    expect(remise.status, JSON.stringify(remise.body)).toBe(200);
    expect(remise.body.gain).toBe(700);
    const rejeu = await t
      .http()
      .post(`/livreurs/moi/missions/${mission!.id}/remise`)
      .set(entetePg(jeton))
      .send({ code: emis.code, pieceVerifiee: true, photoRef: "photos/remise.jpg" });
    expect(rejeu.status).toBe(409);
    expect(await t.resoudre(Portefeuille).solde("livreur", livreur.id)).toBe(700);

    // Redémarrage : une autre instance de l'API sur la même base.
    await t.fermer();
    t = await creerAppPg({ url: base.url, debut: SOIR });
    expect(await t.resoudre(Portefeuille).solde("livreur", livreur.id)).toBe(700);
    const finale = await t.prisma.missionLivraison.findUniqueOrThrow({
      where: { id: mission!.id },
    });
    expect(finale.etat).toBe("livree");
    const apres = await t.http().get("/livreurs/moi").set(entetePg(jeton));
    expect(apres.status, JSON.stringify(apres.body)).toBe(200);
    const suivi = await t
      .http()
      .get("/partenaires/livreurs/demandes/moi")
      .set(entetePg(candidat.jeton));
    expect(suivi.body).toMatchObject({ statut: "active" });
  }, 60_000);
});
