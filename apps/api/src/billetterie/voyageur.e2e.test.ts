import { voyageur } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Refus } from "./erreurs";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART,
  DEPART_2,
  DEPART_AUTRE,
  DEPART_NUIT,
  DEPART_VIP,
  PETIT_BUS,
  avec,
  creerAppBilletterieTest,
  departType,
  heure,
  type AppBilletterieTest,
} from "./testing/app-billetterie-test";

let t: AppBilletterieTest;
let v1: { id: string; jeton: string };
let v2: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppBilletterieTest();
  v1 = await t.compte("voyageur", { nom: "Mireille Kamga" });
  v2 = await t.compte("voyageur", { nom: "Jean Atangana" });
});
afterAll(async () => t.fermer());

const get = (chemin: string, j = v1.jeton) => t.http().get(chemin).set(avec(j));
const post = (chemin: string, corps: object = {}, j = v1.jeton) =>
  t.http().post(chemin).set(avec(j)).send(corps);
const put = (chemin: string, corps: object, j = v1.jeton) =>
  t.http().put(chemin).set(avec(j)).send(corps);

const ids = (departs: { id: string }[]) => departs.map((d) => d.id);

/** Chaque test de commande prend ses propres sièges pour rester indépendant des autres. */
let prochainSiege = 10;
const siegeLibre = (): number => prochainSiege++;

async function commander(siege: number, j = v1.jeton, departId = DEPART, extra: object = {}) {
  return post("/voyageur/commandes", { departId, sieges: [siege], pour: "moi", ...extra }, j);
}

async function acheter(siege: number, j = v1, departId = DEPART) {
  const r = await commander(siege, j.jeton, departId);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const commande = voyageur.SchemaCommande.parse(r.body);
  const { billets } = await t.services.commandes.confirmerPaiement(commande.id, "mtn_momo");
  return { commande, billet: billets[0]! };
}

describe("recherche multi-compagnies : GET /voyageur/departs", () => {
  it("liste les départs de toutes les compagnies, par heure, sans ceux qui n'ont pas de bus", async () => {
    const r = await get("/voyageur/departs?depart=DLA&arrivee=YDE");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = voyageur.SchemaResultatRechercheDeparts.parse(r.body);
    expect(res.depart).toEqual({ code: "DLA", nom: "Douala" });
    expect(res.arrivee).toEqual({ code: "YDE", nom: "Yaoundé" });
    expect(res.jour).toBe("2026-11-02");
    expect(ids(res.departs)).toEqual([DEPART, DEPART_VIP, DEPART_AUTRE, DEPART_2]);
    expect(ids(res.departs)).not.toContain(DEPART_NUIT);
    expect(new Set(res.departs.map((d) => d.compagnie.id))).toEqual(
      new Set([COMPAGNIE, AUTRE_COMPAGNIE]),
    );
    expect(res.totaux).toEqual({ bus: 4, covoiturages: 0 });
    const classique = res.departs.find((d) => d.id === DEPART)!;
    expect(classique.prix).toBe(4000);
    expect(classique.placesLibres).toBe(40);
    expect(res.departs.find((d) => d.id === DEPART_AUTRE)!.prix).toBe(5000);
    expect(res.departs.find((d) => d.id === DEPART_AUTRE)!.placesLibres).toBe(50);
  });

  it("n'affiche que les départs à venir : un départ déjà parti n'est pas proposé", async () => {
    const id = "00000000-0000-4000-8000-00000000d0c1";
    t.catalogue.ajouterDepart(departType(id, { heureDepart: heure("08:00") }));
    const res = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE")).body,
    );
    expect(ids(res.departs)).not.toContain(id);
  });

  it("filtre par classe, compagnie, prix maximum et matin", async () => {
    const lire = async (q: string) =>
      voyageur.SchemaResultatRechercheDeparts.parse(
        (await get(`/voyageur/departs?depart=DLA&arrivee=YDE&${q}`)).body,
      );
    expect(ids((await lire("classe=vip")).departs)).toEqual([DEPART_VIP]);
    expect(ids((await lire("classe=classique")).departs)).toEqual([DEPART, DEPART_AUTRE, DEPART_2]);
    expect(ids((await lire(`compagnies=${AUTRE_COMPAGNIE}`)).departs)).toEqual([DEPART_AUTRE]);
    expect(ids((await lire("prixMax=4000")).departs)).toEqual([DEPART, DEPART_2]);
    expect((await lire("matin=true")).departs).toEqual([]);
    const res = await lire(`compagnies=${AUTRE_COMPAGNIE}`);
    expect(res.filtres.compagnies).toBe(1);
  });

  it("filtre « places côte à côte » : un bus sans deux places voisines libres est écarté", async () => {
    const id = "00000000-0000-4000-8000-00000000d0c2";
    t.catalogue.ajouterDepart(
      departType(id, {
        busId: PETIT_BUS,
        heureDepart: heure("18:00"),
        numero: "ALP-DLAYDE-261102-1800",
      }),
    );
    // 4 places : 1 et 3 prises, il reste 2 et 4, qui ne sont pas voisines.
    for (const siege of [1, 3]) {
      await t.inventaire.occuper({
        departId: id,
        siege,
        billetId: `b-${siege}`,
        par: null,
        maintenant: t.maintenant(),
      });
    }
    const sans = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE")).body,
    );
    expect(ids(sans.departs)).toContain(id);
    const avecFiltre = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE&coteACote=true")).body,
    );
    expect(ids(avecFiltre.departs)).not.toContain(id);
    expect(ids(avecFiltre.departs)).toContain(DEPART);
  });

  it("compagnie préférée : elle passe en tête, et le filtre « préférées » écarte les autres", async () => {
    const r = await put(
      `/voyageur/compagnies/${AUTRE_COMPAGNIE}/preferee`,
      { preferee: true },
      v2.jeton,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ compagnieId: AUTRE_COMPAGNIE, preferee: true });
    const res = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE", v2.jeton)).body,
    );
    expect(ids(res.departs)[0]).toBe(DEPART_AUTRE);
    expect(res.filtres.preferees).toBe(1);
    const seules = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE&preferees=true", v2.jeton)).body,
    );
    expect(ids(seules.departs)).toEqual([DEPART_AUTRE]);
    // Les préférences sont personnelles : l'autre voyageur ne voit rien de tel.
    const autre = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE")).body,
    );
    expect(ids(autre.departs)[0]).toBe(DEPART);
    expect((await put("/voyageur/compagnies/inconnue/preferee", { preferee: true })).status).toBe(
      404,
    );
  });

  it("mémorise les filtres d'un trajet et les reprend sans paramètre", async () => {
    const r = await put("/voyageur/departs/filtres", {
      depart: "DLA",
      arrivee: "YDE",
      filtres: { classe: "vip" },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ enregistre: true });
    const res = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE")).body,
    );
    expect(ids(res.departs)).toEqual([DEPART_VIP]);
    expect(res.filtres.classe).toBe("vip");
    // Les filtres de l'URL passent avant les filtres mémorisés.
    const url = voyageur.SchemaResultatRechercheDeparts.parse(
      (await get("/voyageur/departs?depart=DLA&arrivee=YDE&classe=toutes")).body,
    );
    expect(url.departs.length).toBeGreaterThan(1);
    await put("/voyageur/departs/filtres", { depart: "DLA", arrivee: "YDE", filtres: {} });
  });

  it("GET /voyageur/departs/filtres : compagnies du trajet, classes, options", async () => {
    const r = await get("/voyageur/departs/filtres?depart=DLA&arrivee=YDE");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const o = voyageur.SchemaOptionsFiltres.parse(r.body);
    expect(o.compagnies.map((c) => c.id).sort()).toEqual([AUTRE_COMPAGNIE, COMPAGNIE].sort());
    expect(o.compagnies.every((c) => c.coche)).toBe(true);
    expect(o.classes.map((c) => c.valeur)).toEqual(["toutes", "vip", "classique"]);
    expect(o.aussi.map((a) => a.code)).toEqual([
      "covoiturage",
      "matin-seulement",
      "places-cote-a-cote",
      "5-000-f",
    ]);
    expect(o.totalDeparts).toBeGreaterThanOrEqual(4);
  });

  it("refuse une ville inconnue (404), des paramètres manquants ou invalides (400)", async () => {
    expect((await get("/voyageur/departs?depart=XXX&arrivee=YDE")).status).toBe(404);
    expect((await get("/voyageur/departs?depart=DLA")).status).toBe(400);
    expect((await get("/voyageur/departs?depart=DLA&arrivee=YDE&jour=demain")).status).toBe(400);
    expect((await get("/voyageur/departs?depart=DLA&arrivee=YDE&prixMax=abc")).status).toBe(400);
    expect((await get("/voyageur/departs?depart=DLA&arrivee=YDE&classe=luxe")).status).toBe(400);
  });

  it("est réservé aux voyageurs connectés", async () => {
    expect((await t.http().get("/voyageur/departs?depart=DLA&arrivee=YDE")).status).toBe(401);
    const g = await t.guichetier();
    expect((await get("/voyageur/departs?depart=DLA&arrivee=YDE", g.jeton)).status).toBe(403);
  });
});

describe("départ, prix au prorata, plan des sièges", () => {
  it("GET /voyageur/departs/:id : détail avec le blocage de 15 minutes", async () => {
    const r = await get(`/voyageur/departs/${DEPART}`);
    expect(r.status).toBe(200);
    const d = voyageur.SchemaDetailDepart.parse(r.body);
    expect(d.blocageMinutes).toBe(15);
    expect(d.dureeMinutes).toBe(270);
    expect(d.origine.gare).toBe("Akwa");
    expect(d.destination.gare).toBe("Mvan");
    expect((await get("/voyageur/departs/inconnu")).status).toBe(404);
  });

  it("prix partiel au prorata des kilomètres, arrondi à 100 F", async () => {
    const lire = async (depuis: string, vers: string) =>
      get(`/voyageur/departs/${DEPART}/prix?depuis=${depuis}&vers=${vers}`);
    expect((await lire("arret-edea-a", "arret-yde-a")).body.prix).toBe(3000);
    expect((await lire("arret-dla-a", "arret-edea-a")).body.prix).toBe(1000);
    expect((await lire("arret-dla-a", "arret-yde-a")).body.prix).toBe(4000);
    expect((await lire("arret-yde-a", "arret-dla-a")).status).toBe(422);
    expect((await lire("arret-dla-a", "nulle-part")).status).toBe(422);
    expect((await get(`/voyageur/departs/${DEPART}/prix?depuis=arret-dla-a`)).status).toBe(400);
  });

  it("GET /voyageur/departs/:id/sieges : le plan, ses sièges libres et sa version", async () => {
    const r = await get(`/voyageur/departs/${DEPART_2}/sieges`);
    expect(r.status).toBe(200);
    const plan = voyageur.SchemaPlanSiegesVue.parse(r.body);
    expect(plan.capacite).toBe(40);
    expect(plan.sieges).toHaveLength(40);
    expect(plan.sieges.every((s) => s.etat === "libre")).toBe(true);
    expect(plan.libres).toBe(40);
    expect(plan.mon).toBeUndefined();
  });
});

describe("blocage d'un siège pendant 15 minutes", () => {
  it("bloque 15 minutes ; l'autre voyageur voit « bloqué », moi « à moi » ; le plan monte de version", async () => {
    const siege = siegeLibre();
    const avant = voyageur.SchemaPlanSiegesVue.parse(
      (await get(`/voyageur/departs/${DEPART}/sieges`)).body,
    );
    const r = await post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const blocage = voyageur.SchemaBlocageSiege.parse(r.body);
    expect(blocage.siege).toBe(siege);
    expect(Date.parse(blocage.jusqua) - t.horloge.maintenant().getTime()).toBe(15 * 60_000);

    const moi = voyageur.SchemaPlanSiegesVue.parse(
      (await get(`/voyageur/departs/${DEPART}/sieges`)).body,
    );
    const lui = voyageur.SchemaPlanSiegesVue.parse(
      (await get(`/voyageur/departs/${DEPART}/sieges`, v2.jeton)).body,
    );
    expect(moi.sieges.find((s) => s.numero === siege)?.etat).toBe("a_moi");
    expect(lui.sieges.find((s) => s.numero === siege)?.etat).toBe("bloque");
    expect(moi.mon).toEqual(blocage);
    expect(lui.mon).toBeUndefined();
    expect(moi.versionPlan).toBeGreaterThan(avant.versionPlan);
    // Le siège que j'ai bloqué reste « libre pour moi » dans mon compte de places.
    expect(moi.libres).toBe(lui.libres + 1);
  });

  it("un siège bloqué par un autre refuse : 409 SIEGE_PRIS", async () => {
    const siege = siegeLibre();
    expect((await post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`)).status).toBe(200);
    const r = await post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`, {}, v2.jeton);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("SIEGE_PRIS");
    // Le même voyageur peut redemander son propre siège : la durée repart.
    t.horloge.avancer(5 * 60_000);
    const encore = await post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`);
    expect(encore.status).toBe(200);
    t.horloge.avancer(-5 * 60_000);
  });

  it("choisir un autre siège libère le précédent", async () => {
    const a = siegeLibre();
    const b = siegeLibre();
    await post(`/voyageur/departs/${DEPART}/sieges/${a}/blocage`);
    await post(`/voyageur/departs/${DEPART}/sieges/${b}/blocage`);
    const plan = voyageur.SchemaPlanSiegesVue.parse(
      (await get(`/voyageur/departs/${DEPART}/sieges`, v2.jeton)).body,
    );
    expect(plan.sieges.find((s) => s.numero === a)?.etat).toBe("libre");
    expect(plan.sieges.find((s) => s.numero === b)?.etat).toBe("bloque");
    // Le siège libéré peut être pris par l'autre voyageur.
    expect(
      (await post(`/voyageur/departs/${DEPART}/sieges/${a}/blocage`, {}, v2.jeton)).status,
    ).toBe(200);
  });

  it("au bout de 15 minutes le siège repart à la vente", async () => {
    const siege = siegeLibre();
    await post(`/voyageur/departs/${DEPART_2}/sieges/${siege}/blocage`);
    expect(
      (await post(`/voyageur/departs/${DEPART_2}/sieges/${siege}/blocage`, {}, v2.jeton)).status,
    ).toBe(409);
    t.horloge.avancer(15 * 60_000 + 1000);
    expect(
      (await post(`/voyageur/departs/${DEPART_2}/sieges/${siege}/blocage`, {}, v2.jeton)).status,
    ).toBe(200);
    t.horloge.avancer(-(15 * 60_000 + 1000));
  });

  it("12 voyageurs bloquent le même siège en même temps : un seul l'obtient", async () => {
    const siege = siegeLibre();
    const foule = await Promise.all(
      Array.from({ length: 12 }, (_, i) => t.compte("voyageur", { nom: `Voyageur ${i}` })),
    );
    const reponses = await Promise.all(
      foule.map((v) => post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`, {}, v.jeton)),
    );
    expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 409)).toHaveLength(12 - 1);
  });

  it("un siège bloqué en ligne ne peut pas être vendu au guichet", async () => {
    const siege = siegeLibre();
    await post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`);
    const r = await t.services.billets
      .enregistrer(
        {
          ...(await modeleBillet(siege)),
        },
        null,
      )
      .then(
        () => "vendu",
        (e: unknown) => (e instanceof Refus ? e.code : "autre"),
      );
    expect(r).toBe("SIEGE_PRIS");
  });

  it("refuse un siège hors du bus, un numéro invalide et un départ fermé", async () => {
    expect((await post(`/voyageur/departs/${DEPART}/sieges/99/blocage`)).status).toBe(404);
    expect((await post(`/voyageur/departs/${DEPART}/sieges/abc/blocage`)).status).toBe(400);
    expect((await post(`/voyageur/departs/${DEPART}/sieges/0/blocage`)).status).toBe(400);
    expect((await post(`/voyageur/departs/${DEPART_NUIT}/sieges/1/blocage`)).status).toBe(409);
    expect((await post(`/voyageur/departs/inconnu/sieges/1/blocage`)).status).toBe(404);
  });
});

/** Un billet du guichet, pour tenter de vendre un siège déjà retenu. */
async function modeleBillet(siege: number) {
  const dc = (await t.catalogue.depart(DEPART))!;
  const passagers = t.services.billets["passagers"] as { chiffrer(p: unknown): string };
  return {
    id: crypto.randomUUID(),
    numero: `ALP-DLA-261102-${String(2000 + siege).padStart(4, "0")}`,
    sequence: 2000 + siege,
    compagnieId: dc.compagnie.id,
    gareId: dc.origine.id,
    departId: DEPART,
    siege,
    classe: "classique" as const,
    prix: 4000,
    bagage: 0,
    canal: "guichet" as const,
    guichetId: null,
    acheteurId: null,
    commandeId: null,
    passagerChiffre: passagers.chiffrer({
      nom: "Test",
      telephone: null,
      pieceQuatreDerniers: null,
    }),
    passagerTelephoneIndex: null,
    codeBillet: String(3000 + siege),
    qr: "",
    creeA: t.maintenant(),
    etat: "paye" as const,
    historique: [],
    evenementId: null,
    appareilId: null,
    auteurId: null,
    paiement: null,
    aCompleterAuQuai: false,
    smsEnvoye: false,
    retardPrevenu: false,
    embarqueA: null,
    reporteDe: null,
  };
}

describe("devis : GET /voyageur/commandes/devis", () => {
  it("billet + 250 F de frais de service par place", async () => {
    const r = await get(`/voyageur/commandes/devis?departId=${DEPART}`);
    expect(r.status).toBe(200);
    const d = voyageur.SchemaDevis.parse(r.body);
    expect(d.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["billet", 4000],
      ["frais_voyageur", 250],
    ]);
    expect(d.total).toBe(4250);
    const deux = voyageur.SchemaDevis.parse(
      (await get(`/voyageur/commandes/devis?departId=${DEPART}&places=2`)).body,
    );
    expect(deux.total).toBe(8500);
  });

  it("le code JOURJ offre les frais de service", async () => {
    const d = voyageur.SchemaDevis.parse(
      (await get(`/voyageur/commandes/devis?departId=${DEPART}&codePromo=JOURJ`)).body,
    );
    expect(d.total).toBe(4000);
    const frais = d.lignes.find((l) => l.code === "frais_voyageur")!;
    expect(frais.montant).toBe(0);
    expect(frais.montantBarre).toBe(250);
    expect(frais.offertAvec).toBe("JOURJ");
  });

  it("un code inconnu est refusé, et sans achat en ligne il n'y a pas de frais", async () => {
    const r = await get(`/voyageur/commandes/devis?departId=${DEPART}&codePromo=FAUX`);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("CODE_PROMO_INVALIDE");
    const guichet = voyageur.SchemaDevis.parse(
      (await get(`/voyageur/commandes/devis?departId=${DEPART}&enLigne=false`)).body,
    );
    expect(guichet.total).toBe(4000);
    expect((await get("/voyageur/commandes/devis")).status).toBe(400);
    expect((await get("/voyageur/commandes/devis?departId=inconnu")).status).toBe(404);
    expect((await get(`/voyageur/commandes/devis?departId=${DEPART}&places=99`)).status).toBe(422);
  });
});

describe("commande en ligne, paiement, billet nominatif", () => {
  it("la commande retient le siège 15 minutes ; une fois payée, le billet est nominatif avec QR signé", async () => {
    const siege = siegeLibre();
    const r = await commander(siege);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const c = voyageur.SchemaCommande.parse(r.body);
    expect(c.statut).toBe("en_attente_paiement");
    expect(c.total).toBe(4250);
    expect(c.billetIds).toEqual([]);
    expect(Date.parse(c.expireA) - Date.parse(c.creeeA)).toBe(15 * 60_000);

    // En attendant le paiement le siège est retenu : personne d'autre ne l'a.
    expect(
      (await post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`, {}, v2.jeton)).status,
    ).toBe(409);
    expect((await commander(siege, v2.jeton)).status).toBe(409);

    const { billets, commande } = await t.services.commandes.confirmerPaiement(c.id, "mtn_momo");
    expect(commande.statut).toBe("payee");
    expect(billets).toHaveLength(1);

    const lu = await get(`/voyageur/billets/${billets[0]!.id}`);
    expect(lu.status, JSON.stringify(lu.body)).toBe(200);
    const billet = voyageur.SchemaBilletVoyageur.parse(lu.body);
    expect(billet.etat).toBe("paye");
    expect(billet.siege).toBe(siege);
    expect(billet.passager.nom).toBe("Mireille Kamga");
    expect(billet.codeBillet).toMatch(/^\d{4}$/);
    expect(billet.compagnie.id).toBe(COMPAGNIE);
    // Les ventes en ligne sont numérotées par le serveur de 4001 à 9999.
    const sequence = Number(billet.numero.split("-")[3]);
    expect(sequence).toBeGreaterThanOrEqual(4001);
    expect(sequence).toBeLessThanOrEqual(9999);
    // Le QR se vérifie avec la clé publique seule.
    expect(await t.signataire.verifier(billet.qr)).toEqual({
      numero: billet.numero,
      code: billet.codeBillet,
      departId: DEPART,
    });
    expect((await t.inventaire.plan(DEPART)).occupes[siege]).toBe(billet.id);

    const relue = voyageur.SchemaCommande.parse((await get(`/voyageur/commandes/${c.id}`)).body);
    expect(relue.statut).toBe("payee");
    expect(relue.billetIds).toEqual([billet.id]);
  });

  it("confirmer le paiement plusieurs fois, même en parallèle, n'émet qu'un seul jeu de billets", async () => {
    const siege = siegeLibre();
    const c = voyageur.SchemaCommande.parse((await commander(siege)).body);
    const avant = t.billets.lignes.size;
    const resultats = await Promise.all(
      Array.from({ length: 5 }, () => t.services.commandes.confirmerPaiement(c.id, "mtn_momo")),
    );
    expect(new Set(resultats.map((r) => r.billets[0]!.id)).size).toBe(1);
    expect(t.billets.lignes.size).toBe(avant + 1);
  });

  it("8 voyageurs commandent le même siège en même temps : une seule commande aboutit", async () => {
    const siege = siegeLibre();
    const foule = await Promise.all(
      Array.from({ length: 8 }, (_, i) => t.compte("voyageur", { nom: `Acheteur ${i}` })),
    );
    const reponses = await Promise.all(foule.map((v) => commander(siege, v.jeton)));
    expect(reponses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 409)).toHaveLength(7);
    for (const r of reponses.filter((x) => x.status === 409))
      expect(r.body.code).toBe("SIEGE_PRIS");
  });

  it("une commande non payée expire au bout de 15 minutes et rend le siège", async () => {
    const siege = siegeLibre();
    const c = voyageur.SchemaCommande.parse((await commander(siege)).body);
    t.horloge.avancer(15 * 60_000 + 1000);
    const relue = voyageur.SchemaCommande.parse((await get(`/voyageur/commandes/${c.id}`)).body);
    expect(relue.statut).toBe("expiree");
    expect((await t.inventaire.plan(DEPART)).bloques[siege]).toBeUndefined();
    expect(t.avis.de("commande.expiree").some((a) => a.commandeId === c.id)).toBe(true);
    expect((await commander(siege, v2.jeton)).status).toBe(201);
    t.horloge.avancer(-(15 * 60_000 + 1000));
  });

  it("le balayage libère les sièges des commandes échues et des blocages échus", async () => {
    const s1 = siegeLibre();
    const s2 = siegeLibre();
    await commander(s1);
    await post(`/voyageur/departs/${DEPART}/sieges/${s2}/blocage`, {}, v2.jeton);
    const diffuses: unknown[] = [];
    t.diffusion.souscrire(`sieges:${DEPART}`, (m) => diffuses.push(m));
    t.horloge.avancer(16 * 60_000);
    const bilan = await t.services.balayage.balayer();
    expect(bilan.commandesExpirees).toBeGreaterThanOrEqual(1);
    expect(bilan.blocagesLeves).toBeGreaterThanOrEqual(1);
    const plan = await t.inventaire.plan(DEPART);
    expect(plan.bloques[s1]).toBeUndefined();
    expect(plan.bloques[s2]).toBeUndefined();
    const liberes = (diffuses as { siege: number; etat: string }[])
      .filter((m) => m.etat === "libre")
      .map((m) => m.siege);
    expect(liberes).toEqual(expect.arrayContaining([s1, s2]));
    t.horloge.avancer(-16 * 60_000);
  });

  it("un paiement qui arrive après l'expiration, siège revendu : pas de double vente, remboursement demandé", async () => {
    const siege = siegeLibre();
    const lente = voyageur.SchemaCommande.parse((await commander(siege)).body);
    t.horloge.avancer(16 * 60_000);
    await t.services.balayage.balayer();
    // Un autre voyageur obtient le siège et le paie.
    const rapide = voyageur.SchemaCommande.parse((await commander(siege, v2.jeton)).body);
    const { billets } = await t.services.commandes.confirmerPaiement(rapide.id, "orange_money");
    // Le paiement de la première arrive enfin.
    const erreur = await t.services.commandes.confirmerPaiement(lente.id, "mtn_momo").then(
      () => null,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(Refus);
    expect((erreur as Refus).code).toBe("SIEGES_PERDUS");
    const sur = [...t.billets.lignes.values()].filter(
      (b) => b.departId === DEPART && b.siege === siege && b.etat !== "annule",
    );
    expect(sur.map((b) => b.id)).toEqual([billets[0]!.id]);
    expect((await t.inventaire.plan(DEPART)).occupes[siege]).toBe(billets[0]!.id);
    t.horloge.avancer(-16 * 60_000);
  });

  it("commande pour un proche (devise du proche) et pour plusieurs passagers", async () => {
    t.proches.ajouter(v1.id, { id: "proche-1", nom: "Grâce Mballa", telephone: "+237677000111" });
    const siege = siegeLibre();
    const proche = await commander(siege, v1.jeton, DEPART, {
      pour: "proche",
      procheId: "proche-1",
      devise: "CAD",
    });
    expect(proche.status, JSON.stringify(proche.body)).toBe(201);
    const c = voyageur.SchemaCommande.parse(proche.body);
    expect(c.type).toBe("proche");
    expect(c.conversion?.devise).toBe("CAD");
    expect(c.conversion?.approximatif).toBe(true);
    expect(c.conversion?.montantMineur).toBeGreaterThan(0);
    const { billets } = await t.services.commandes.confirmerPaiement(c.id, "carte");
    const billet = voyageur.SchemaBilletVoyageur.parse(
      (await get(`/voyageur/billets/${billets[0]!.id}`)).body,
    );
    expect(billet.passager.nom).toBe("Grâce Mballa");

    const a = siegeLibre();
    const b = siegeLibre();
    const groupe = await post("/voyageur/commandes", {
      departId: DEPART,
      sieges: [a, b],
      pour: "plusieurs",
      passagers: [{ nom: "Mireille Kamga" }, { nom: "Paul Essomba", telephone: "+237699001122" }],
    });
    expect(groupe.status, JSON.stringify(groupe.body)).toBe(201);
    const cg = voyageur.SchemaCommande.parse(groupe.body);
    expect(cg.total).toBe(8500);
    const paye = await t.services.commandes.confirmerPaiement(cg.id, "mtn_momo");
    expect(paye.billets.map((x) => x.siege).sort()).toEqual([a, b].sort());
    expect(new Set(paye.billets.map((x) => x.numero)).size).toBe(2);
    expect(new Set(paye.billets.map((x) => x.codeBillet)).size).toBe(2);
  });

  it("refuse une commande invalide", async () => {
    expect(
      (await post("/voyageur/commandes", { departId: DEPART, sieges: [], pour: "moi" })).status,
    ).toBe(400);
    expect(
      (await post("/voyageur/commandes", { departId: DEPART, sieges: [5], pour: "tous" })).status,
    ).toBe(400);
    expect((await commander(99)).status).toBe(404);
    expect(
      (await post("/voyageur/commandes", { departId: DEPART, sieges: [30, 31], pour: "moi" }))
        .status,
    ).toBe(422);
    expect(
      (await post("/voyageur/commandes", { departId: DEPART, sieges: [30, 30], pour: "plusieurs" }))
        .status,
    ).toBe(422);
    expect((await commander(5, v1.jeton, DEPART, { codePromo: "FAUX" })).status).toBe(422);
    expect((await commander(5, v1.jeton, DEPART, { devise: "ZZZ" })).status).toBe(422);
    expect((await commander(5, v1.jeton, DEPART_NUIT)).status).toBe(409);
    expect((await commander(5, v1.jeton, DEPART, { procheId: "x", pour: "proche" })).status).toBe(
      404,
    );
  });

  it("une commande n'est visible que de son voyageur", async () => {
    const c = voyageur.SchemaCommande.parse((await commander(siegeLibre())).body);
    expect((await get(`/voyageur/commandes/${c.id}`, v2.jeton)).status).toBe(404);
    expect((await get("/voyageur/commandes/inconnue")).status).toBe(404);
  });
});

describe("annulation et report", () => {
  it("annulation gratuite plus d'une heure avant le départ : remboursement intégral, siège rendu", async () => {
    const { billet } = await acheter(siegeLibre());
    const apercu = voyageur.SchemaApercuAnnulation.parse(
      (await get(`/voyageur/billets/${billet.id}/annulation`)).body,
    );
    expect(apercu).toMatchObject({
      autorise: true,
      gratuite: true,
      retenue: 0,
      remboursement: 4000,
    });
    expect(Date.parse(apercu.gratuiteJusqua)).toBe(Date.parse(heure("13:00")));

    const r = await post(`/voyageur/billets/${billet.id}/annulation`, {
      motif: "Changement de plan",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = voyageur.SchemaResultatAnnulation.parse(r.body);
    expect(res).toMatchObject({
      etat: "annule",
      retenue: 0,
      remboursement: 4000,
      rembourseSur: "mtn_momo",
    });
    expect(t.billets.lignes.get(billet.id)?.etat).toBe("annule");
    // Le numéro est conservé et le siège revient à la vente.
    expect(t.billets.lignes.get(billet.id)?.numero).toBe(billet.numero);
    expect((await t.inventaire.plan(DEPART)).occupes[billet.siege!]).toBeUndefined();
    expect(t.avis.de("billet.annule").some((a) => a.billetId === billet.id)).toBe(true);
    // Le voyageur lit son billet annulé.
    const lu = voyageur.SchemaBilletVoyageur.parse(
      (await get(`/voyageur/billets/${billet.id}`)).body,
    );
    expect(lu.etat).toBe("annule");
    // Une seconde annulation est refusée.
    const encore = await post(`/voyageur/billets/${billet.id}/annulation`);
    expect(encore.status).toBe(409);
    expect(encore.body.code).toBe("TRANSITION_INTERDITE");
  });

  it("annulation tardive : 25 % retenus sur un billet classique", async () => {
    const { billet } = await acheter(siegeLibre());
    t.horloge.avancer(4 * 3_600_000 + 30 * 60_000); // 13:30 : 30 minutes avant le départ
    const apercu = voyageur.SchemaApercuAnnulation.parse(
      (await get(`/voyageur/billets/${billet.id}/annulation`)).body,
    );
    expect(apercu).toMatchObject({
      autorise: true,
      gratuite: false,
      retenue: 1000,
      remboursement: 3000,
    });
    const res = voyageur.SchemaResultatAnnulation.parse(
      (await post(`/voyageur/billets/${billet.id}/annulation`)).body,
    );
    expect(res).toMatchObject({ retenue: 1000, remboursement: 3000 });
    t.horloge.avancer(-(4 * 3_600_000 + 30 * 60_000));
  });

  it("un billet embarqué ne s'annule plus", async () => {
    const { billet } = await acheter(siegeLibre());
    const stocke = (await t.billets.trouver(billet.id))!;
    await t.services.billets.embarquer(stocke, t.maintenant(), "agent");
    const apercu = voyageur.SchemaApercuAnnulation.parse(
      (await get(`/voyageur/billets/${billet.id}/annulation`)).body,
    );
    expect(apercu.autorise).toBe(false);
    const r = await post(`/voyageur/billets/${billet.id}/annulation`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("TRANSITION_INTERDITE");
    expect(t.billets.lignes.get(billet.id)?.etat).toBe("embarque");
  });

  it("un billet vendu au guichet ne s'annule pas depuis l'application, et celui d'un autre n'existe pas", async () => {
    const { billet } = await acheter(siegeLibre());
    expect((await get(`/voyageur/billets/${billet.id}`, v2.jeton)).status).toBe(404);
    expect((await post(`/voyageur/billets/${billet.id}/annulation`, {}, v2.jeton)).status).toBe(
      404,
    );
    expect((await get("/voyageur/billets/inconnu")).status).toBe(404);
    // Billet de guichet : jamais accessible à un voyageur (pas d'acheteur).
    const guichet = await modeleBillet(siegeLibre());
    t.billets.lignes.set(guichet.id, guichet);
    expect((await get(`/voyageur/billets/${guichet.id}`)).status).toBe(404);
  });

  it("report sur un autre départ de la même ligne : nouveau billet, même siège, sans frais", async () => {
    const siege = siegeLibre();
    const { billet } = await acheter(siege);
    const r = await post(`/voyageur/billets/${billet.id}/report`, { departCibleId: DEPART_2 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const res = voyageur.SchemaResultatReport.parse(r.body);
    expect(res.ancienBilletId).toBe(billet.id);
    expect(res.billet.id).not.toBe(billet.id);
    expect(res.billet.departId).toBe(DEPART_2);
    expect(res.billet.siege).toBe(siege);
    expect(res.billet.numero).not.toBe(billet.numero);
    expect(res.billet.etat).toBe("paye");
    expect(await t.signataire.verifier(res.billet.qr)).toMatchObject({ departId: DEPART_2 });
    // L'ancien billet est « reporté », garde son numéro, et son siège est rendu.
    const ancien = t.billets.lignes.get(billet.id)!;
    expect(ancien.etat).toBe("reporte");
    expect(ancien.numero).toBe(billet.numero);
    expect((await t.inventaire.plan(DEPART)).occupes[siege]).toBeUndefined();
    expect((await t.inventaire.plan(DEPART_2)).occupes[siege]).toBe(res.billet.id);
    // L'ancien QR ne fait plus embarquer personne.
    const ancienScan = await t.services.agence.scanner(
      { id: "agent", role: "guichetier", compagnieId: COMPAGNIE, gareId: null },
      {
        id: crypto.randomUUID(),
        type: "quai.scanne",
        at: t.maintenant(),
        appareilId: "a",
        auteurId: "agent",
        cible: { type: "depart", id: DEPART },
        numeroPlage: null,
        donnees: { departId: DEPART, qr: billet.qr },
      },
    );
    expect(ancienScan.scan.resultat).toBe("autre_depart");
  });

  it("refuse un report vers une autre compagnie, une autre classe, le même départ ou un départ inconnu", async () => {
    const { billet } = await acheter(siegeLibre());
    const rapporter = (departCibleId: string) =>
      post(`/voyageur/billets/${billet.id}/report`, { departCibleId });
    expect((await rapporter(DEPART_AUTRE)).status).toBe(404);
    expect((await rapporter(DEPART_VIP)).status).toBe(409);
    expect((await rapporter(DEPART)).status).toBe(409);
    expect((await rapporter("inconnu")).status).toBe(404);
    expect((await post(`/voyageur/billets/${billet.id}/report`, {})).status).toBe(400);
    expect(t.billets.lignes.get(billet.id)?.etat).toBe("paye");
  });
});
