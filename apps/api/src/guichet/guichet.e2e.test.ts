import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART,
  DEPART_2,
  DEPART_AUTRE,
  DEPART_NUIT,
  GARE_DOUALA,
  GUICHET_1,
  GUICHET_2,
  avec,
  creerAppBilletterieTest,
  departType,
  especes,
  evenement,
  heure,
  type AppBilletterieTest,
  type OptionsAppBilletterieTest,
} from "../billetterie/testing/app-billetterie-test";
import { MouvementsMemoire, SessionsMemoire } from "../caisse/memoire";
import { MouvementsCaisse, SessionsCaisse, type SessionStockee } from "../caisse/ports";
import { ColisRepository } from "../colis/ports";
import { unColis, type ContexteColis } from "../colis/testing/contrat-ports";
import { ImpressionsMemoire } from "./memoire";
import { ImpressionsAgence } from "./ports";

/**
 * Accueil du guichet, mode cadence, quai de la cadence et impressions, de bout en bout : HTTP, gardes, rôles,
 * événements idempotents. Chaque réponse est relue avec le schéma zod de `@afrimove/contrats`. Chaque groupe de
 * tests démarre sa propre application (ses compteurs et ses numéros de plage repartent de zéro).
 */

let t: AppBilletterieTest;
let jeton: string;
let agentId: string;
let numeroPlage = 0;
let code = 3000;
let impressions: ImpressionsMemoire;
let sessions: SessionsMemoire;
let mouvements: MouvementsMemoire;

/** Une application neuve pour le groupe de tests qui l'appelle, avec un guichetier au guichet 1. */
function appFraiche(options: OptionsAppBilletterieTest = {}): void {
  beforeAll(async () => {
    t = await creerAppBilletterieTest(options);
    const g = await t.guichetier();
    jeton = g.jeton;
    agentId = g.id;
    numeroPlage = 0;
    impressions = t.app.get(ImpressionsAgence) as ImpressionsMemoire;
    sessions = t.app.get(SessionsCaisse) as SessionsMemoire;
    mouvements = t.app.get(MouvementsCaisse) as MouvementsMemoire;
  });
  afterAll(async () => t.fermer());
}

const prochainCode = (): string => String(++code);
const prochainePlage = (): number => ++numeroPlage;

const lire = (chemin: string, j = jeton) => t.http().get(chemin).set(avec(j));
const poster = (chemin: string, corps: unknown, j = jeton) =>
  t
    .http()
    .post(chemin)
    .set(avec(j))
    .send(corps as object);

/** Une vente au guichet (`billet.vendu`) ; `at` change l'heure de l'événement. */
async function vendre(
  o: { siege: number; at?: string; auteur?: string; jeton?: string; numero?: number } = {
    siege: 1,
  },
) {
  const evt = evenement(
    agence.EVENEMENT_BILLET_VENDU,
    o.auteur ?? agentId,
    o.at ?? t.maintenant(),
    {
      billetId: randomUUID(),
      departId: DEPART,
      siege: o.siege,
      classe: "classique",
      prix: 4000,
      bagage: 0,
      passager: { nom: "Aminatou Fotso", telephone: "+237691221008", pieceQuatreDerniers: "4821" },
      paiement: especes(4000),
      codeBillet: prochainCode(),
      sms: true,
    },
    { numeroPlage: o.numero ?? prochainePlage() },
  );
  const r = await poster("/agence/billets", evt, o.jeton ?? jeton);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agence.SchemaResultatVente.parse(r.body);
}

/** Une vente de cadence (`billet.vendu_cadence`), sans nom. */
async function vendreCadence(siege: number, o: { at?: string; numero?: number } = {}) {
  const evt = evenement(
    agence.EVENEMENT_BILLET_VENDU_CADENCE,
    agentId,
    o.at ?? t.maintenant(),
    {
      billetId: randomUUID(),
      departId: DEPART,
      siege,
      prix: 4000,
      paiement: especes(4000),
      codeBillet: prochainCode(),
      telephone: null,
    },
    { numeroPlage: o.numero ?? prochainePlage() },
  );
  const r = await poster("/agence/cadence/billets", evt);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agence.SchemaResultatCadence.parse(r.body);
}

const scanner = async (qr: string, departId = DEPART) => {
  const r = await poster(
    "/agence/quai/scans",
    evenement(agence.EVENEMENT_QUAI_SCANNE, agentId, t.maintenant(), { departId, qr }),
  );
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agence.SchemaResultatScanQuai.parse(r.body);
};

const completer = (billetId: string, o: { nom: string; embarquer: boolean }) =>
  poster(
    "/agence/quai/completions",
    evenement(agence.EVENEMENT_BILLET_COMPLETE, agentId, t.maintenant(), {
      billetId,
      departId: DEPART,
      nom: o.nom,
      pieceQuatreDerniers: "7710",
      telephone: null,
      embarquer: o.embarquer,
    }),
  );

const evenementImpression = (
  donnees: { document: "billet" | "etiquette_colis" | "ticket_caisse"; documentId: string },
  o: { id?: string; copies?: number; reimpression?: boolean; auteur?: string } = {},
) =>
  evenement(
    agence.EVENEMENT_IMPRESSION_DEMANDEE,
    o.auteur ?? agentId,
    t.maintenant(),
    { ...donnees, copies: o.copies ?? 1, reimpression: o.reimpression ?? false },
    o.id ? { id: o.id } : {},
  );

const contexteColis = (compagnieId = COMPAGNIE): ContexteColis => ({
  compagnieId,
  origine: { id: GARE_DOUALA, code: "DLA", nom: "Akwa", ville: "Douala" },
  destination: {
    id: "00000000-0000-4000-8000-0000000000a2",
    code: "YDE",
    nom: "Mvan",
    ville: "Yaoundé",
  },
  expediteurId: randomUUID(),
  auteurId: agentId,
  departId: DEPART,
});

/** Un colis enregistré au guichet par `par` à l'instant `a`. */
async function deposerColis(par: string, a: string, etat: "enregistre" | "charge" = "enregistre") {
  const colis = unColis(contexteColis(), {
    canal: "agence",
    expediteurId: null,
    etat,
    creeA: a,
    depose: { a, poidsReleveKg: 2, photoRef: "photo-1", par },
  });
  expect(await t.app.get(ColisRepository).ajouter(colis)).toBe("ajoute");
  return colis;
}

const sessionOuverte = (surcharge: Partial<SessionStockee> = {}): SessionStockee => ({
  id: randomUUID(),
  numero: "K-DLA-261102-1-1",
  guichetId: GUICHET_1,
  guichetRang: 1,
  gareId: GARE_DOUALA,
  compagnieId: COMPAGNIE,
  agentId,
  fondDeCaisse: 20_000,
  tolerance: 500,
  ouverteA: t.maintenant(),
  reouverteA: null,
  etat: "ouverte",
  comptage: null,
  cloture: null,
  validation: null,
  refus: [],
  evenementOuvertureId: randomUUID(),
  ...surcharge,
});

describe("GET /agence/guichet/accueil", () => {
  appFraiche();

  it("sans caisse ouverte : les compteurs sont à zéro, le prochain départ et le quai sont ceux de la gare", async () => {
    const r = await lire("/agence/guichet/accueil");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const a = agence.SchemaGuichetAccueil.parse(r.body);
    expect(a.agence).toEqual({ compagnie: "Alpha Voyages", gare: "Akwa" });
    expect(a.guichet).toEqual({
      id: GUICHET_1,
      rang: 1,
      agent: { id: agentId, nom: "Test guichetier" },
      caisseOuverteA: null,
    });
    expect(a.synchro).toEqual({
      etat: "sync",
      derniereSyncA: t.maintenant(),
      evenementsEnAttente: 0,
    });
    expect(a.compteurs).toEqual({ billets: 0, colis: 0, colisACharger: 0, enCaisse: 0, ecart: 0 });
    expect(a.cadence.fileAttente).toBe(0);
    // 09:00 à Douala : le départ de 14:00 est le prochain, dans cinq heures, avec ses 40 places.
    expect(a.prochainDepart).toEqual({
      departId: DEPART,
      heureDepart: heure("14:00"),
      destination: "Yaoundé",
      placesLibres: 40,
      dansMinutes: 300,
    });
    expect(a.quai).toEqual({
      departId: DEPART,
      heureDepart: heure("14:00"),
      destination: "Yaoundé",
      scannes: 0,
      capacite: 40,
    });
    expect(a.prochaineOuverture).toBeNull();
  });

  it("le départ qui ouvre ensuite à la vente est le premier départ « programmé » de la gare", async () => {
    t.catalogue.ajouterDepart(
      departType("00000000-0000-4000-8000-00000000d0a1", {
        etat: "programme",
        heureDepart: heure("19:00"),
      }),
    );
    t.catalogue.ajouterDepart(
      departType("00000000-0000-4000-8000-00000000d0a2", {
        etat: "programme",
        heureDepart: heure("18:00"),
      }),
    );
    const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    expect(a.prochaineOuverture).toEqual({
      departId: "00000000-0000-4000-8000-00000000d0a2",
      heureDepart: heure("18:00"),
      destination: "Yaoundé",
    });
  });

  it("compte les billets que l'agent a vendus, pas ceux d'un autre guichet, ni les annulés", async () => {
    const autre = await t.guichetier(GUICHET_2, { nom: "Autre guichetier" });
    await vendre({ siege: 1 });
    await vendre({ siege: 2 });
    await vendre({ siege: 3, auteur: autre.id, jeton: autre.jeton, numero: 1001 });
    const annule = await vendre({ siege: 4 });
    await t.billets.transitionner(annule.billet.billetId, ["paye"], { etat: "annule" });

    const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    expect(a.compteurs.billets).toBe(2);
    const celuiDeLAutre = agence.SchemaGuichetAccueil.parse(
      (await lire("/agence/guichet/accueil", autre.jeton)).body,
    );
    expect(celuiDeLAutre.guichet.rang).toBe(2);
    expect(celuiDeLAutre.compteurs.billets).toBe(1);
  });

  it("avec une caisse ouverte : seuls les billets et les colis d'après l'ouverture comptent, et le cash attendu suit", async () => {
    const avant = t.maintenant();
    const ouverteA = "2026-11-02T09:01:00.000+01:00";
    t.horloge.avancer(120_000);
    await deposerColis(agentId, avant);
    expect(await sessions.creer(sessionOuverte({ ouverteA }))).toBe("ok");

    const apres = t.maintenant();
    await vendre({ siege: 5, at: apres });
    await vendre({ siege: 6, at: apres });
    mouvements.venteCash({ agentId, guichetId: GUICHET_1, montant: 8000, at: apres });
    await deposerColis(agentId, apres);
    await deposerColis(agentId, apres, "charge");
    await deposerColis(randomUUID(), apres);

    const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    expect(a.guichet.caisseOuverteA).toBe(ouverteA);
    expect(a.compteurs.billets).toBe(2);
    expect(a.compteurs.colis).toBe(2);
    expect(a.compteurs.colisACharger).toBe(1);
    // Fond de caisse 20 000 + 8 000 de ventes en cash ; la caisse n'est pas encore comptée : écart nul.
    expect(a.compteurs.enCaisse).toBe(28_000);
    expect(a.compteurs.ecart).toBe(0);
  });

  it("l'écart est compté − attendu une fois la caisse comptée", async () => {
    const ouverte = await sessions.ouverteDeAgent(agentId);
    await sessions.transiter(ouverte!.id, "ouverte", {
      comptage: { coupures: [], pieces: 0, total: 27_500 },
    });
    const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    expect(a.compteurs.enCaisse).toBe(28_000);
    expect(a.compteurs.ecart).toBe(-500);
  });

  it("la file de cadence compte les billets de cadence encore sans nom", async () => {
    const avant = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    await vendreCadence(30);
    await vendreCadence(31);
    const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    expect(a.cadence.fileAttente).toBe(avant.cadence.fileAttente + 2);
  });

  it("le quai compte les voyageurs scannés sur la capacité du bus", async () => {
    const vente = await vendre({ siege: 12 });
    const scan = await scanner(vente.billet.qr);
    expect(scan.scan.resultat).toBe("monte");
    const a = agence.SchemaGuichetAccueil.parse((await lire("/agence/guichet/accueil")).body);
    // Le premier scan ouvre l'embarquement : le départ reste celui du quai.
    expect(a.quai).toMatchObject({ departId: DEPART, scannes: 1, capacite: 40 });
  });

  it("refuse sans jeton (401), aux autres rôles (403) et à un compte sans guichet (404)", async () => {
    expect((await t.http().get("/agence/guichet/accueil")).status).toBe(401);
    const voyageur = await t.compte("voyageur");
    expect((await lire("/agence/guichet/accueil", voyageur.jeton)).status).toBe(403);
    const superviseur = await t.compte("superviseur");
    expect((await lire("/agence/guichet/accueil", superviseur.jeton)).status).toBe(403);
    const sansGuichet = await t.compte("guichetier");
    const r = await lire("/agence/guichet/accueil", sansGuichet.jeton);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "GUICHET_INCONNU" });
  });
});

describe("GET /agence/guichet/accueil : plus de départ à venir", () => {
  // 23:30 à Douala : tous les départs du jour sont partis depuis plus de 30 minutes.
  appFraiche({ debut: new Date("2026-11-02T22:30:00.000Z") });

  it("répond sans quai ni prochain départ (null), les compteurs restent lisibles", async () => {
    const r = await lire("/agence/guichet/accueil");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const a = agence.SchemaGuichetAccueil.parse(r.body);
    expect(a.prochainDepart).toBeNull();
    expect(a.quai).toBeNull();
    expect(a.prochaineOuverture).toBeNull();
    expect(a.compteurs.billets).toBe(0);
  });
});

describe("GET /agence/cadence", () => {
  appFraiche();

  it("propose le départ ouvert, le prochain siège libre et le prix du tarif", async () => {
    const r = await lire("/agence/cadence");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const c = agence.SchemaCadenceEtat.parse(r.body);
    expect(c.depart).toMatchObject({ departId: DEPART, destination: "Yaoundé" });
    expect(c.depart.placesRestantes).toBe(c.depart.placesLibres);
    expect(c.prochain.prix).toBe(4000);
    expect(c.modesPaiement).toEqual(["cash", "momo"]);
    expect(c.dernierBillet).toBeNull();
    expect(c.vendusEnCadence).toBe(0);
    expect(c.annulations).toBe(0);
  });

  it("le dernier billet est celui de la dernière vente de cadence, sans nom tant qu'il n'est pas complété", async () => {
    const un = await vendreCadence(20);
    t.horloge.avancer(1000);
    const deux = await vendreCadence(21);
    // Une vente ordinaire n'est pas une vente de cadence.
    await vendre({ siege: 22 });
    const c = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
    expect(c.vendusEnCadence).toBe(2);
    expect(c.dernierBillet).toEqual({
      billetId: deux.billet.billetId,
      sequence: deux.billet.sequence,
      siege: 21,
      nom: null,
      venduA: expect.any(String),
    });
    expect(c.prochain.siege).not.toBe(20);
    expect(c.prochain.siege).not.toBe(21);

    // Annulé : plus compté parmi les ventes, compté parmi les annulations, plus « dernier billet ».
    await t.billets.transitionner(deux.billet.billetId, ["paye"], { etat: "annule" });
    const apres = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
    expect(apres.vendusEnCadence).toBe(1);
    expect(apres.annulations).toBe(1);
    expect(apres.dernierBillet?.billetId).toBe(un.billet.billetId);
  });

  it("le dernier billet porte le nom une fois complété au quai", async () => {
    const vente = await vendreCadence(23);
    t.horloge.avancer(1000);
    expect(
      (await completer(vente.billet.billetId, { nom: "Brice Nkoulou", embarquer: false })).status,
    ).toBe(200);
    const c = agence.SchemaCadenceEtat.parse((await lire("/agence/cadence")).body);
    expect(c.dernierBillet).toMatchObject({
      billetId: vente.billet.billetId,
      nom: "Brice Nkoulou",
    });
  });

  it("lit le départ demandé ; refuse celui d'une autre compagnie (404)", async () => {
    const c = agence.SchemaCadenceEtat.parse(
      (await lire(`/agence/cadence?departId=${DEPART_2}`)).body,
    );
    expect(c.depart.departId).toBe(DEPART_2);
    expect(c.depart.placesRestantes).toBe(40);
    const autre = await lire(`/agence/cadence?departId=${DEPART_AUTRE}`);
    expect(autre.status).toBe(404);
    expect(autre.body).toMatchObject({ code: "DEPART_INCONNU" });
  });

  it("refuse sans jeton (401) et aux autres rôles (403)", async () => {
    expect((await t.http().get("/agence/cadence")).status).toBe(401);
    const convoyeur = await t.compte("convoyeur");
    expect((await lire("/agence/cadence", convoyeur.jeton)).status).toBe(403);
  });
});

describe("GET /agence/cadence/billets/{billetId}", () => {
  appFraiche();

  it("relit la vente de cadence : billet à imprimer, paiement, récapitulatif, siège suivant", async () => {
    const vente = await vendreCadence(15);
    const id = vente.billet.billetId;
    const r = await lire(`/agence/cadence/billets/${id}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const b = agence.SchemaCadenceBillet.parse(r.body);
    expect(b.billet).toMatchObject({
      billetId: id,
      numero: vente.billet.numero,
      aCompleterAuQuai: true,
    });
    expect(b.billet.passager.nom).toBeNull();
    expect(b.vente.paiement).toMatchObject({ mode: "cash", recu: 4000, rendu: 0 });
    expect(b.vente.dureeMs).toBe(0);
    expect(b.recapitulatif).toMatchObject({
      plageSansTrou: true,
      siegeBloque: 15,
      imprime: false,
      caisseCash: 4000,
      sms: "pas_de_numero",
      synchro: "faite",
    });
    expect(b.suivant.prix).toBe(4000);
    expect(b.suivant.siege).not.toBe(15);

    // Une fois l'impression enregistrée, le récapitulatif le dit.
    const imp = await poster(
      "/agence/impressions",
      evenementImpression({ document: "billet", documentId: id }),
    );
    expect(imp.status).toBe(200);
    const apres = agence.SchemaCadenceBillet.parse(
      (await lire(`/agence/cadence/billets/${id}`)).body,
    );
    expect(apres.recapitulatif.imprime).toBe(true);
  });

  it("signale un trou dans la plage du guichet", async () => {
    const vente = await vendreCadence(16, { numero: 400 });
    const b = agence.SchemaCadenceBillet.parse(
      (await lire(`/agence/cadence/billets/${vente.billet.billetId}`)).body,
    );
    expect(b.recapitulatif.plageSansTrou).toBe(false);
  });

  it("refuse un billet qui n'est pas de cadence, inconnu, ou d'une autre compagnie (404)", async () => {
    const ordinaire = await vendre({ siege: 17 });
    const r = await lire(`/agence/cadence/billets/${ordinaire.billet.billetId}`);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "BILLET_INCONNU" });
    expect((await lire(`/agence/cadence/billets/${randomUUID()}`)).status).toBe(404);
    expect((await lire("/agence/cadence/billets/pas-un-billet")).status).toBe(404);

    const autre = await t.compte("guichetier", { compagnieId: AUTRE_COMPAGNIE });
    const cadence = await vendreCadence(18);
    const etranger = await lire(`/agence/cadence/billets/${cadence.billet.billetId}`, autre.jeton);
    expect(etranger.status).toBe(404);
  });
});

describe("GET /agence/quai/cadence", () => {
  appFraiche();

  it("404 tant qu'aucun billet de cadence sans nom n'a été scanné sur ce quai", async () => {
    const r = await lire("/agence/quai/cadence");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "AUCUN_BILLET_CADENCE" });
  });

  it("montre le billet de cadence scanné, l'embarquement et les billets sans nom", async () => {
    const nominatif = await vendre({ siege: 31 });
    expect((await scanner(nominatif.billet.qr)).scan.resultat).toBe("monte");
    const scanne = await vendreCadence(32);
    const attend = await vendreCadence(33);
    expect((await scanner(scanne.billet.qr)).scan.resultat).toBe("sans_nom");

    const r = await lire("/agence/quai/cadence");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const q = agence.SchemaQuaiCadence.parse(r.body);
    expect(q.quai).toBe(3);
    expect(q.depart).toMatchObject({ departId: DEPART, destination: "Yaoundé" });
    expect(q.convoyeur).toEqual({ id: "convoyeur-1", nom: "Joël Ndzana" });
    expect(q.scan).toMatchObject({
      billetId: scanne.billet.billetId,
      numero: scanne.billet.numero,
      siege: 32,
      guichetRang: 1,
      paiement: "cash",
      montant: 4000,
      validePourCeDepart: true,
    });
    expect(q.saisie).toEqual({ nom: "", pieceQuatreDerniers: "", telephone: null });
    expect(q.embarquement).toEqual({
      embarques: 1,
      capacite: 40,
      nominatifs: 1,
      cadenceCompletes: 0,
    });
    // Deux billets sans nom, le plus bas siège d'abord.
    expect(q.sansNom.total).toBe(2);
    expect(q.sansNom.liste.map((b) => [b.billetId, b.siege])).toEqual([
      [scanne.billet.billetId, 32],
      [attend.billet.billetId, 33],
    ]);
  });

  it("une fois le billet complété et embarqué, c'est le suivant à compléter qui est montré", async () => {
    const vente = await vendreCadence(34);
    t.horloge.avancer(1000);
    await scanner(vente.billet.qr);
    const avant = agence.SchemaQuaiCadence.parse((await lire("/agence/quai/cadence")).body);
    expect(avant.scan.billetId).toBe(vente.billet.billetId);
    expect(avant.sansNom.total).toBe(3);

    expect(
      (await completer(vente.billet.billetId, { nom: "Carine Eyenga", embarquer: true })).status,
    ).toBe(200);
    const apres = agence.SchemaQuaiCadence.parse((await lire("/agence/quai/cadence")).body);
    // Le billet 32, scanné plus tôt, attend toujours son nom.
    expect(apres.scan.siege).toBe(32);
    expect(apres.sansNom.total).toBe(2);
    expect(apres.embarquement).toMatchObject({ embarques: 2, nominatifs: 1, cadenceCompletes: 1 });
  });

  it("409 EQUIPAGE_INCOMPLET pour un départ sans bus, 404 pour un départ d'une autre compagnie", async () => {
    const r = await lire(`/agence/quai/cadence?departId=${DEPART_NUIT}`);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EQUIPAGE_INCOMPLET" });
    expect((await lire(`/agence/quai/cadence?departId=${DEPART_AUTRE}`)).status).toBe(404);
  });

  it("refuse sans jeton (401) et aux autres rôles (403)", async () => {
    expect((await t.http().get("/agence/quai/cadence")).status).toBe(401);
    const voyageur = await t.compte("voyageur");
    expect((await lire("/agence/quai/cadence", voyageur.jeton)).status).toBe(403);
  });
});

describe("GET /agence/impression et POST /agence/impressions", () => {
  appFraiche();

  it("l'état de l'imprimante est « ok » : c'est l'appareil qui connaît la sienne", async () => {
    const r = await lire("/agence/impression");
    expect(r.status).toBe(200);
    expect(agence.SchemaImpressionEtat.parse(r.body)).toEqual({
      imprimante: { etat: "ok", nom: null },
    });
  });

  it("enregistre l'impression d'un billet ; rejouer l'événement n'ajoute rien (deja_recu)", async () => {
    const vente = await vendre({ siege: 25 });
    const evt = evenementImpression({ document: "billet", documentId: vente.billet.billetId });
    const un = await poster("/agence/impressions", evt);
    expect(un.status, JSON.stringify(un.body)).toBe(200);
    const accuse = agence.SchemaResultatImpression.parse(un.body);
    expect(accuse.statut).toBe("imprime");
    expect(accuse.accuse).toMatchObject({ evenementId: evt["id"], statut: "accepte" });

    const deux = agence.SchemaResultatImpression.parse(
      (await poster("/agence/impressions", evt)).body,
    );
    expect(deux.accuse.statut).toBe("deja_recu");
    expect(await impressions.deDocument("billet", vente.billet.billetId)).toHaveLength(1);
  });

  it("une réimpression est un événement aussi : le journal compte les copies", async () => {
    const vente = await vendre({ siege: 26 });
    const id = vente.billet.billetId;
    await poster(
      "/agence/impressions",
      evenementImpression({ document: "billet", documentId: id }),
    );
    await poster(
      "/agence/impressions",
      evenementImpression(
        { document: "billet", documentId: id },
        { copies: 2, reimpression: true },
      ),
    );
    const copies = await impressions.copiesDe("billet", [id]);
    expect(copies.get(id)).toBe(3);
    const lignes = await impressions.deDocument("billet", id);
    expect(lignes.map((l) => l.reimpression)).toEqual([false, true]);
    expect(lignes[0]).toMatchObject({ auteurId: agentId, compagnieId: COMPAGNIE, copies: 1 });
  });

  it("imprime une étiquette de colis et un ticket de caisse", async () => {
    const colis = await deposerColis(agentId, t.maintenant());
    const etiquette = await poster(
      "/agence/impressions",
      evenementImpression({ document: "etiquette_colis", documentId: colis.id }),
    );
    expect(etiquette.status, JSON.stringify(etiquette.body)).toBe(200);

    // Une caisse de la même compagnie, ouverte par un autre agent au guichet 2 : son ticket s'imprime.
    const session = sessionOuverte({
      agentId: randomUUID(),
      guichetId: GUICHET_2,
      guichetRang: 2,
    });
    expect(await sessions.creer(session)).toBe("ok");
    const ticket = await poster(
      "/agence/impressions",
      evenementImpression({ document: "ticket_caisse", documentId: session.id }),
    );
    expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
    expect(await impressions.deDocument("ticket_caisse", session.id)).toHaveLength(1);
  });

  it("accepte un document que le serveur ne connaît pas encore (appareil hors ligne)", async () => {
    const r = await poster(
      "/agence/impressions",
      evenementImpression({ document: "billet", documentId: randomUUID() }),
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });

  it("refuse (404) le document d'une autre compagnie", async () => {
    const etranger = unColis(contexteColis(AUTRE_COMPAGNIE), { depose: null });
    await t.app.get(ColisRepository).ajouter(etranger);
    const r = await poster(
      "/agence/impressions",
      evenementImpression({ document: "etiquette_colis", documentId: etranger.id }),
    );
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "DOCUMENT_INCONNU" });
    expect(await impressions.deDocument("etiquette_colis", etranger.id)).toHaveLength(0);
  });

  it("refuse un événement signé par un autre compte (403), invalide (422), sans jeton (401) ou d'un autre rôle (403)", async () => {
    const vente = await vendre({ siege: 27 });
    const donnees = { document: "billet" as const, documentId: vente.billet.billetId };
    const etranger = await poster(
      "/agence/impressions",
      evenementImpression(donnees, { auteur: randomUUID() }),
    );
    expect(etranger.status).toBe(403);
    expect(etranger.body).toMatchObject({ code: "AUTEUR_INCOHERENT" });

    const abime = {
      ...evenementImpression(donnees),
      donnees: { ...donnees, copies: 6, reimpression: false },
    };
    const invalide = await poster("/agence/impressions", abime);
    expect(invalide.status).toBe(422);
    expect(invalide.body).toMatchObject({ code: "EVENEMENT_INVALIDE" });

    const sansJeton = await t.http().post("/agence/impressions").send(evenementImpression(donnees));
    expect(sansJeton.status).toBe(401);
    const voyageur = await t.compte("voyageur");
    const autreRole = await poster(
      "/agence/impressions",
      evenementImpression(donnees, { auteur: voyageur.id }),
      voyageur.jeton,
    );
    expect(autreRole.status).toBe(403);
  });
});
