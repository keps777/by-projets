import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEPART_AUTRE_COMPAGNIE,
  DEPART_AUTRE_EQUIPAGE,
  DEPART_EMBARQUEMENT,
  DEPART_EN_VENTE,
  DEPART_ROUTE,
  avec,
  creerAppBordTest,
  especes,
  evenement,
  type AppBordTest,
} from "./testing/app-bord-test";

/**
 * La feuille du convoyeur, la vente en route et le scan à un arrêt, de bout en bout : HTTP, rôles, événements
 * idempotents. Chaque réponse est relue avec le schéma zod de `@afrimove/contrats`.
 */

let t: AppBordTest;
let jeton: string;
let convoyeurId: string;
let plage = 3000;
let code = 4000;

beforeAll(async () => {
  t = await creerAppBordTest();
  jeton = t.equipage.convoyeur.jeton;
  convoyeurId = t.equipage.convoyeur.id;
});
afterAll(async () => t.fermer());

const poster = (chemin: string, corps: unknown, j = jeton) =>
  t
    .http()
    .post(chemin)
    .set(avec(j))
    .send(corps as object);

const lire = (chemin: string, j = jeton) => t.http().get(chemin).set(avec(j));

function venteEvt(
  o: {
    departId?: string;
    siege?: number;
    prix?: number;
    montee?: string;
    descente?: string;
    id?: string;
    billetId?: string;
    numeroPlage?: number;
    telephone?: string | null;
    paiement?:
      | ReturnType<typeof especes>
      | { mode: "momo"; recu: number; rendu: number; reference: string };
    auteur?: string;
  } = {},
) {
  const prix = o.prix ?? 1000;
  return evenement(
    agence.EVENEMENT_ROUTE_BILLET_VENDU,
    o.auteur ?? convoyeurId,
    t.maintenant(),
    {
      billetId: o.billetId ?? randomUUID(),
      departId: o.departId ?? DEPART_ROUTE,
      arretMontee: o.montee ?? "Douala",
      arretDescente: o.descente ?? "Édéa",
      siege: o.siege ?? 20,
      prix,
      passager: {
        nom: "Mballa Jean",
        telephone: o.telephone === undefined ? "+237655123456" : o.telephone,
      },
      paiement: o.paiement ?? especes(prix),
      codeBillet: String(++code),
      gps: { latitude: 3.9, longitude: 10.1, precisionM: 12 },
    },
    { numeroPlage: o.numeroPlage ?? ++plage, appareilId: "appareil-bord-1" },
  );
}

const scanEvt = (qr: string, o: { departId?: string; arret?: string; auteur?: string } = {}) =>
  evenement(
    agence.EVENEMENT_ROUTE_SCANNE,
    o.auteur ?? convoyeurId,
    t.maintenant(),
    { departId: o.departId ?? DEPART_ROUTE, arret: o.arret ?? "Édéa", qr },
    { appareilId: "appareil-bord-1" },
  );

describe("GET /agence/bus/convoyeur", () => {
  it("rend la feuille du bus en route, conforme au contrat", async () => {
    const r = await lire("/agence/bus/convoyeur");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vue = agence.SchemaConvoyeurEtat.parse(r.body);
    expect(vue.departId).toBe(DEPART_ROUTE);
    expect(vue.convoyeur).toEqual({ id: convoyeurId, nom: "Joël Ndzana" });
    expect(vue.bus.immatriculation).toBe("LT 214 AB");
    expect(vue.trajet).toMatchObject({ origine: "Douala", destination: "Yaoundé" });
    expect(vue.compteurs.sieges.libres).toBe(40);
    expect(vue.compteurs.ventesEnRoute).toEqual({ nombre: 0, montant: 0 });
    // La vente proposée : on monte à Douala (le bus n'est arrivé nulle part), tarif du tronçon.
    expect(vue.vente.arretMontee).toBe("Douala");
    expect(vue.vente.destination).toBe("Yaoundé");
    expect(vue.vente.prix).toBe(4000);
    expect(vue.vente.siege).toBe(1);
  });

  it("choisit le départ demandé et compte les voyageurs à bord, la liste nominative et les colis", async () => {
    await t.billetPaye(DEPART_EMBARQUEMENT, 3, { nom: "Fotso Aminatou", aBord: true });
    await t.billetPaye(DEPART_EMBARQUEMENT, 4, { nom: null, aBord: true });
    await t.billetPaye(DEPART_EMBARQUEMENT, 5);
    t.colis.definir(DEPART_EMBARQUEMENT, { charges: 2, colisACharger: 0 });
    const r = await lire(`/agence/bus/convoyeur?departId=${DEPART_EMBARQUEMENT}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vue = agence.SchemaConvoyeurEtat.parse(r.body);
    expect(vue.departId).toBe(DEPART_EMBARQUEMENT);
    expect(vue.compteurs.scannesABord).toBe(2);
    expect(vue.compteurs.sieges.libres).toBe(37);
    expect(vue.listeNominative.aBord).toBe(1);
    expect(vue.colisADecharger).toBe(2);
  });

  it("propose le tronçon depuis l'arrêt où le bus est arrivé", async () => {
    const chauffeur = t.equipage.chauffeur;
    const arrivee = evenement(
      agence.EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET,
      chauffeur.id,
      t.maintenant(),
      { departId: DEPART_ROUTE, arret: "Édéa", gps: null },
    );
    expect((await poster("/agence/bus/arrivees", arrivee, chauffeur.jeton)).status).toBe(200);
    const vue = agence.SchemaConvoyeurEtat.parse((await lire("/agence/bus/convoyeur")).body);
    expect(vue.vente.arretMontee).toBe("Édéa");
    expect(vue.vente.prix).toBe(3000);
  });

  it("refuse un autre bus, un départ inconnu, un autre rôle et l'absence de jeton", async () => {
    const autre = await lire(`/agence/bus/convoyeur?departId=${DEPART_AUTRE_EQUIPAGE}`);
    expect(autre.status).toBe(403);
    expect(autre.body.code).toBe("AUTRE_EQUIPAGE");
    expect((await lire(`/agence/bus/convoyeur?departId=${DEPART_AUTRE_COMPAGNIE}`)).status).toBe(
      404,
    );
    expect((await lire("/agence/bus/convoyeur?departId=pas-un-depart")).status).toBe(404);
    expect((await lire("/agence/bus/convoyeur", t.equipage.chauffeur.jeton)).status).toBe(403);
    expect((await t.http().get("/agence/bus/convoyeur")).status).toBe(401);
  });

  it("répond 404 AUCUN_DEPART à un convoyeur sans bus à bord", async () => {
    const seul = await t.compte("convoyeur");
    const r = await lire("/agence/bus/convoyeur", seul.jeton);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("AUCUN_DEPART");
  });
});

describe("route.billet_vendu : POST /agence/bus/ventes", () => {
  it("vend une place : plage du bord, siège occupé, voyageur déjà à bord, SMS parti", async () => {
    const evt = venteEvt({ siege: 21, numeroPlage: 3500 });
    const r = await poster("/agence/bus/ventes", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vente = agence.SchemaResultatVenteRoute.parse(r.body);
    expect(vente.accuse.statut).toBe("accepte");
    expect(vente.billet).toMatchObject({ siege: 21, prix: 1000, smsEnvoye: true });
    expect(vente.billet.numero).toMatch(/^ALP-DLA-261102-3500$/);
    expect(vente.ventesEnRoute.nombre).toBeGreaterThanOrEqual(1);

    const stocke = t.billets.lignes.get(vente.billet.billetId);
    expect(stocke).toMatchObject({ etat: "embarque", canal: "convoyeur", sequence: 3500 });
    expect(stocke?.smsEnvoye).toBe(true);
    expect(t.messages.billets.at(-1)).toMatchObject({ telephone: "+237655123456", siege: 21 });
    const plan = await t.inventaire.plan(DEPART_ROUTE);
    expect(plan.occupes[21]).toBe(vente.billet.billetId);
    // Le détail de la vente en route est gardé.
    const lignes = await t.ventes.duDepart(DEPART_ROUTE);
    expect(lignes.find((v) => v.billetId === vente.billet.billetId)).toMatchObject({
      convoyeurId,
      arretMontee: "Douala",
      arretDescente: "Édéa",
      position: { latitude: 3.9, longitude: 10.1, precisionM: 12 },
    });
  });

  it("rejoue le même événement sans rien refaire : deja_recu, même billet, un seul SMS", async () => {
    const evt = venteEvt({ siege: 22, numeroPlage: 3501 });
    const avant = t.messages.billets.length;
    const premier = await poster("/agence/bus/ventes", evt);
    const second = await poster("/agence/bus/ventes", evt);
    expect(second.status).toBe(200);
    const a = agence.SchemaResultatVenteRoute.parse(premier.body);
    const b = agence.SchemaResultatVenteRoute.parse(second.body);
    expect(b.accuse.statut).toBe("deja_recu");
    expect(b.accuse.evenementId).toBe(a.accuse.evenementId);
    expect(b.billet).toEqual(a.billet);
    expect(t.messages.billets.length).toBe(avant + 1);
    expect(
      [...t.billets.lignes.values()].filter((x) => x.evenementId === a.accuse.evenementId),
    ).toHaveLength(1);
  });

  it("vend sans numéro de téléphone : pas de SMS", async () => {
    const r = await poster("/agence/bus/ventes", venteEvt({ siege: 23, telephone: null }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(agence.SchemaResultatVenteRoute.parse(r.body).billet.smsEnvoye).toBe(false);
  });

  it("garde la vente quand le SMS ne part pas", async () => {
    t.messages.echec = true;
    try {
      const r = await poster("/agence/bus/ventes", venteEvt({ siege: 24 }));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(agence.SchemaResultatVenteRoute.parse(r.body).billet.smsEnvoye).toBe(false);
    } finally {
      t.messages.echec = false;
    }
  });

  it("accepte un paiement mobile au montant exact", async () => {
    const r = await poster(
      "/agence/bus/ventes",
      venteEvt({
        siege: 25,
        paiement: { mode: "momo", recu: 0, rendu: 0, reference: "MP260000.0000.A00000" },
      }),
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });

  it("refuse un siège pris : 409 SIEGE_PRIS", async () => {
    const r = await poster("/agence/bus/ventes", venteEvt({ siege: 21 }));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("SIEGE_PRIS");
  });

  it("refuse un numéro hors de la plage du bord : 422 NUMERO_HORS_PLAGE", async () => {
    for (const numero of [1001, 3000, 4000]) {
      const r = await poster("/agence/bus/ventes", venteEvt({ siege: 26, numeroPlage: numero }));
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("NUMERO_HORS_PLAGE");
    }
  });

  it("refuse un prix qui n'est pas celui du tronçon : 422 PRIX_INCOHERENT", async () => {
    const r = await poster("/agence/bus/ventes", venteEvt({ siege: 26, prix: 900 }));
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("PRIX_INCOHERENT");
    expect(r.body.details.attendu.prix).toBe(1000);
  });

  it("refuse un paiement incohérent : 422 PAIEMENT_INVALIDE", async () => {
    const r = await poster(
      "/agence/bus/ventes",
      venteEvt({ siege: 26, paiement: { mode: "cash", recu: 1000, rendu: 500, reference: null } }),
    );
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("PAIEMENT_INVALIDE");
  });

  it("refuse des arrêts inconnus, à l'envers ou sans montée", async () => {
    const inconnu = await poster(
      "/agence/bus/ventes",
      venteEvt({ siege: 26, montee: "Bafoussam" }),
    );
    expect(inconnu.body.code).toBe("ARRET_INCONNU");
    const envers = await poster(
      "/agence/bus/ventes",
      venteEvt({ siege: 26, montee: "Édéa", descente: "Douala" }),
    );
    expect(envers.body.code).toBe("ARRETS_INVALIDES");
    const sansMontee = await poster(
      "/agence/bus/ventes",
      venteEvt({ siege: 26, montee: "Yaoundé", descente: "Yaoundé" }),
    );
    expect(sansMontee.status).toBe(422);
  });

  it("refuse un siège hors du bus, et un identifiant de billet qui n'est pas un UUID", async () => {
    const hors = await poster("/agence/bus/ventes", venteEvt({ siege: 41 }));
    expect(hors.status).toBe(404);
    const evt = venteEvt({ siege: 26 });
    (evt.donnees as { billetId: string }).billetId = "billet-1";
    const r = await poster("/agence/bus/ventes", evt);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("IDENTIFIANT_INVALIDE");
  });

  it("refuse le départ d'un autre équipage (403), d'une autre compagnie (404), non embarqué (409)", async () => {
    const autre = await poster("/agence/bus/ventes", venteEvt({ departId: DEPART_AUTRE_EQUIPAGE }));
    expect(autre.status).toBe(403);
    expect(autre.body.code).toBe("AUTRE_EQUIPAGE");
    const etranger = await poster(
      "/agence/bus/ventes",
      venteEvt({ departId: DEPART_AUTRE_COMPAGNIE }),
    );
    expect(etranger.status).toBe(404);
    const enVente = await poster("/agence/bus/ventes", venteEvt({ departId: DEPART_EN_VENTE }));
    expect(enVente.status).toBe(409);
    expect(enVente.body.code).toBe("DEPART_HORS_ROUTE");
  });

  it("refuse un événement signé par un autre compte et un corps mal formé", async () => {
    const usurpe = await poster(
      "/agence/bus/ventes",
      venteEvt({ siege: 27, auteur: t.equipage.chauffeur.id }),
    );
    expect(usurpe.status).toBe(403);
    expect(usurpe.body.code).toBe("AUTEUR_INCOHERENT");
    const vide = await poster("/agence/bus/ventes", {});
    expect(vide.status).toBe(400);
    expect(vide.body.code).toBe("REQUETE_INVALIDE");
  });

  it("n'est ouverte qu'aux rôles de vente", async () => {
    const evt = venteEvt({ siege: 27 });
    expect((await poster("/agence/bus/ventes", evt, t.equipage.chauffeur.jeton)).status).toBe(403);
    expect((await poster("/agence/bus/ventes", evt, t.equipage.controleur.jeton)).status).toBe(403);
    expect((await t.http().post("/agence/bus/ventes").send(evt)).status).toBe(401);
  });

  it("ne mémorise pas un événement refusé : il passe une fois corrigé", async () => {
    const id = randomUUID();
    const mauvais = await poster("/agence/bus/ventes", venteEvt({ id, siege: 28, prix: 500 }));
    expect(mauvais.status).toBe(422);
    const bon = await poster("/agence/bus/ventes", venteEvt({ id, siege: 28 }));
    expect(bon.status, JSON.stringify(bon.body)).toBe(200);
    expect(bon.body.accuse.statut).toBe("accepte");
  });
});

describe("route.scanne : POST /agence/bus/scans", () => {
  it("fait monter un voyageur à l'arrêt, puis le reconnaît déjà à bord", async () => {
    const billet = await t.billetPaye(DEPART_ROUTE, 10);
    const avant = await t.billets.trouver(billet.id);
    expect(avant?.etat).toBe("paye");

    const r = await poster("/agence/bus/scans", scanEvt(billet.qr));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const scan = agence.SchemaResultatScanRoute.parse(r.body);
    expect(scan.accuse.statut).toBe("accepte");
    expect(scan.scannesABord).toBeGreaterThanOrEqual(1);
    expect((await t.billets.trouver(billet.id))?.etat).toBe("embarque");

    const encore = await poster("/agence/bus/scans", scanEvt(billet.qr));
    expect(encore.status).toBe(200);
    expect(agence.SchemaResultatScanRoute.parse(encore.body).scannesABord).toBe(scan.scannesABord);
    const passages = await t.passages.duDepart(DEPART_ROUTE, "scan");
    expect(passages.map((p) => p.resultat)).toEqual(
      expect.arrayContaining(["monte", "deja_a_bord"]),
    );
  });

  it("rejoue le même scan : deja_recu", async () => {
    const billet = await t.billetPaye(DEPART_ROUTE, 11);
    const evt = scanEvt(billet.qr);
    const a = await poster("/agence/bus/scans", evt);
    const b = await poster("/agence/bus/scans", evt);
    expect(b.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(b.body.scannesABord).toBe(a.body.scannesABord);
  });

  it("refuse un QR falsifié ou inconnu : 404 BILLET_INCONNU", async () => {
    const billet = await t.billetPaye(DEPART_ROUTE, 12);
    const faux = billet.qr.slice(0, -2) + (billet.qr.endsWith("AA") ? "BB" : "AA");
    for (const qr of [faux, "n'importe quoi"]) {
      const r = await poster("/agence/bus/scans", scanEvt(qr));
      expect(r.status).toBe(404);
      expect(r.body.code).toBe("BILLET_INCONNU");
    }
    expect((await t.billets.trouver(billet.id))?.etat).toBe("paye");
  });

  it("refuse le billet d'un autre départ : 409 AUTRE_DEPART", async () => {
    const billet = await t.billetPaye(DEPART_EMBARQUEMENT, 30);
    const r = await poster("/agence/bus/scans", scanEvt(billet.qr));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("AUTRE_DEPART");
  });

  it("refuse un arrêt inconnu, le départ d'un autre équipage et un autre rôle", async () => {
    const billet = await t.billetPaye(DEPART_ROUTE, 13);
    const arret = await poster("/agence/bus/scans", scanEvt(billet.qr, { arret: "Kribi" }));
    expect(arret.status).toBe(422);
    expect(arret.body.code).toBe("ARRET_INCONNU");
    const autre = await poster(
      "/agence/bus/scans",
      scanEvt(billet.qr, { departId: DEPART_AUTRE_EQUIPAGE }),
    );
    expect(autre.status).toBe(403);
    const mauvaisRole = await poster(
      "/agence/bus/scans",
      scanEvt(billet.qr),
      t.equipage.chauffeur.jeton,
    );
    expect(mauvaisRole.status).toBe(403);
  });

  it("le billet vendu en route est déjà à bord : un scan le reconnaît", async () => {
    const vente = await poster("/agence/bus/ventes", venteEvt({ siege: 29 }));
    const billet = await t.billets.trouver(vente.body.billet.billetId);
    expect(billet).not.toBeNull();
    const r = await poster("/agence/bus/scans", scanEvt(billet!.qr));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const passages = await t.passages.duDepart(DEPART_ROUTE, "scan");
    expect(passages.at(-1)?.resultat).toBe("deja_a_bord");
  });
});
