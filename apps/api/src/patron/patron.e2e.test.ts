import { patron } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ROLES, type Role } from "../socle/auth/roles";
import type { SessionStockee } from "../caisse/ports";
import type { BilletVendu, ColisEnregistre } from "../rapport/modele";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  ERIC,
  GARE_AKWA,
  GARE_AUTRE,
  GARE_MVAN,
  GUICHET_AKWA_2,
  LIGNE_DLA_YDE,
  MARIE_AUTRE,
  PAUL,
  PIN_PATRON,
  SAMUEL,
  creerAppPatronTest,
  type AppPatronTest,
} from "./testing/app-patron-test";

/**
 * L'espace patron en HTTP sur l'API complète (adaptateurs en mémoire) : accès par rôle, formes des
 * réponses (schémas des contrats), chiffres du jour, cloisonnement des compagnies, et chaque écriture de
 * réglage : signature PIN, effet, trace d'audit, aucun secret dans les réponses ni le journal.
 */

let t: AppPatronTest;
let jeton: string;
let patronId: string;

const auth = (j: string) => ({ Authorization: `Bearer ${j}` });
const jourDuTest = "2026-11-02";

const billet = (i: number, montant: number, extra: Partial<BilletVendu> = {}): BilletVendu => ({
  id: `b${i}`,
  numero: `ALP-DLA-261102-${String(i).padStart(4, "0")}`,
  gareId: GARE_AKWA,
  canal: "guichet",
  mode: "cash",
  montant,
  venduA: `${jourDuTest}T07:${String(10 + i).padStart(2, "0")}:00.000+01:00`,
  etat: "paye",
  reporteDe: null,
  aCompleterAuQuai: false,
  sansNom: false,
  embarque: false,
  departParti: false,
  ...extra,
});

const colis = (i: number, montant: number): ColisEnregistre => ({
  id: `c${i}`,
  numero: `C-DLA-261102-${String(i).padStart(4, "0")}`,
  gareId: GARE_AKWA,
  montant,
  mode: "cash",
  creeA: `${jourDuTest}T08:00:00.000+01:00`,
});

const sessionCloturee = (): SessionStockee => ({
  id: "00000000-0000-4000-8000-0000000000a5",
  numero: "K-DLA-261102-2-1",
  guichetId: GUICHET_AKWA_2,
  guichetRang: 2,
  gareId: GARE_AKWA,
  compagnieId: COMPAGNIE,
  agentId: ERIC,
  fondDeCaisse: 0,
  tolerance: 1000,
  ouverteA: "2026-11-02T06:30:00.000+01:00",
  reouverteA: null,
  etat: "cloturee",
  comptage: null,
  cloture: {
    at: "2026-11-02T08:30:00.000+01:00",
    auto: false,
    cashCompte: 8500,
    cashAttendu: 10000,
    ecart: -1500,
    divergenceAppareil: 0,
    comptageAbsent: false,
    decompte: {
      billetsCash: { nombre: 0, montant: 0 },
      colisCash: { nombre: 0, montant: 0 },
      annulationsValidees: { nombre: 0, montant: 0 },
      momo: { ventes: 0, montant: 0 },
    },
    evenementId: "00000000-0000-4000-8000-0000000000a6",
  },
  validation: null,
  refus: [],
  evenementOuvertureId: "00000000-0000-4000-8000-0000000000a7",
});

const journalEnTexte = () =>
  JSON.stringify(t.auditRepo.lignes, (_c, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v,
  );

beforeAll(async () => {
  t = await creerAppPatronTest();
  t.ventes.ajouter(
    COMPAGNIE,
    billet(1, 3500),
    billet(2, 5000),
    billet(3, 3500, { etat: "annule" }),
  );
  t.colis.ajouter(COMPAGNIE, colis(1, 1500));
  t.referentielRapport.ajouter({ id: COMPAGNIE, nom: "Alpha Voyages" }, [
    { id: GARE_AKWA, nom: "Akwa" },
    { id: GARE_MVAN, nom: "Mvan" },
  ]);
  const p = await t.compte("patron", { gareId: null });
  jeton = p.jeton;
  patronId = p.id;
});

afterAll(async () => {
  await t.fermer();
});

beforeEach(() => {
  t.semer();
  t.auditRepo.lignes.length = 0;
  t.sessions.lignes.clear();
  t.sessions.lignes.set("s1", sessionCloturee());
});

describe("accès", () => {
  const LECTURES = [
    "/patron/aujourdhui",
    "/patron/alertes",
    "/patron/gares",
    `/patron/gares/${GARE_AKWA}`,
    "/patron/equipe",
    `/patron/personnes/${ERIC}`,
    "/patron/controle",
    "/patron/reglages",
    `/patron/reglages/lignes/${LIGNE_DLA_YDE}`,
    `/patron/reglages/personnes/${ERIC}`,
    "/patron/reglages/regles",
  ];

  it("refuse sans jeton (401)", async () => {
    for (const url of LECTURES) expect((await t.http().get(url)).status, url).toBe(401);
    expect((await t.http().put("/patron/reglages/regles").send({})).status).toBe(401);
    expect((await t.http().post("/patron/reglages/personnes").send({})).status).toBe(401);
  });

  it("réserve tout au patron : aucun autre rôle ne lit ni n'écrit (403)", async () => {
    for (const role of ROLES.filter((r) => r !== "patron")) {
      const { jeton: j } = await t.compte(role as Role);
      for (const url of LECTURES) {
        expect((await t.http().get(url).set(auth(j))).status, `${role} ${url}`).toBe(403);
      }
      const ecriture = await t.http().put("/patron/reglages/regles").set(auth(j)).send({});
      expect(ecriture.status, `${role} écriture`).toBe(403);
    }
  });
});

describe("lectures", () => {
  it("le tableau du jour additionne billets vendus et colis, sans les billets annulés", async () => {
    const r = await t.http().get("/patron/aujourdhui").set(auth(jeton));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const lu = patron.TableauDuJourSchema.parse(r.body);
    expect(lu.compagnie).toBe("Alpha Voyages");
    expect(lu.jour.billets).toBe(2);
    expect(lu.jour.colis).toBe(1);
    expect(lu.jour.recette).toBe(3500 + 5000 + 1500);
    expect(lu.jour.ecartTotal).toBe(-1500);
    expect(lu.nbGares).toBe(2);
    expect(lu.nbBus).toBe(6);
    expect(lu.nbPersonnes).toBe(4);
  });

  it("les alertes réunissent celles de la caisse, un compte bloqué et un bus arrêté", async () => {
    t.alertes.ecrire(COMPAGNIE, {
      type: "ecart_hors_tolerance",
      gareId: GARE_AKWA,
      message: "Akwa guichet 2 · écart − 1 500 F au-delà de la tolérance",
      details: { sessionId: "s1" },
      creeA: new Date("2026-11-02T07:00:00.000Z"),
    });
    t.alertes.ecrire(AUTRE_COMPAGNIE, {
      type: "ecart_hors_tolerance",
      gareId: GARE_AUTRE,
      message: "Une alerte d'une autre compagnie",
      details: {},
      creeA: new Date("2026-11-02T07:00:00.000Z"),
    });
    const bloque = t.equipe.membres.get(ERIC)!;
    t.equipe.membres.set(ERIC, { ...bloque, bloqueJusqua: new Date("2026-11-02T08:10:00.000Z") });
    try {
      const r = await t.http().get("/patron/alertes").set(auth(jeton));
      expect(r.status).toBe(200);
      const lu = patron.ListeAlertesSchema.parse(r.body);
      const categories = lu.alertes.map((a) => a.categorie).sort();
      expect(categories).toEqual(["ecart_caisse", "pin_bloque"]);
      expect(JSON.stringify(lu)).not.toContain("autre compagnie");
      const tab = patron.TableauDuJourSchema.parse(
        (await t.http().get("/patron/aujourdhui").set(auth(jeton))).body,
      );
      expect(tab.nbAlertes).toBe(2);
    } finally {
      t.equipe.membres.set(ERIC, bloque);
    }
  });

  it("les gares, le détail d'une gare, l'équipe, la fiche et la salle de contrôle suivent les contrats", async () => {
    const gares = patron.VueGaresSchema.parse(
      (await t.http().get("/patron/gares").set(auth(jeton))).body,
    );
    expect(gares.gares).toHaveLength(2);
    expect(gares.nbPersonnes).toBe(4);
    expect(gares.nbBus).toBe(6);

    const rg = await t.http().get(`/patron/gares/${GARE_AKWA}`).set(auth(jeton));
    expect(rg.status, JSON.stringify(rg.body)).toBe(200);
    const gare = patron.DetailGareSchema.parse(rg.body);
    expect(gare.gare.nom).toBe("Akwa");
    expect(gare.nbQuais).toBe(3);

    const re = await t.http().get("/patron/equipe").set(auth(jeton));
    const equipe = patron.ListeEquipeSchema.parse(re.body);
    expect(equipe.total).toBe(4);
    expect(equipe.personnes.map((p) => p.nom)).toContain("Éric N.");

    const filtre = patron.ListeEquipeSchema.parse(
      (await t.http().get("/patron/equipe?role=chauffeur").set(auth(jeton))).body,
    );
    expect(filtre.personnes.map((p) => p.role)).toEqual(["chauffeur"]);
    const recherche = patron.ListeEquipeSchema.parse(
      (await t.http().get("/patron/equipe?recherche=eric").set(auth(jeton))).body,
    );
    expect(recherche.personnes).toHaveLength(1);
    expect((await t.http().get("/patron/equipe?inconnu=1").set(auth(jeton))).status).toBe(400);

    const rf = await t.http().get(`/patron/personnes/${ERIC}`).set(auth(jeton));
    expect(rf.status, JSON.stringify(rf.body)).toBe(200);
    const fiche = patron.FichePersonneSchema.parse(rf.body);
    expect(fiche.personne.telephoneMasque).toContain("••");

    const rc = await t.http().get("/patron/controle").set(auth(jeton));
    expect(rc.status, JSON.stringify(rc.body)).toBe(200);
    patron.SalleDeControleSchema.parse(rc.body);
  });

  it("une compagnie ne voit jamais les gares, les personnes ni les lignes d'une autre", async () => {
    expect((await t.http().get(`/patron/gares/${GARE_AUTRE}`).set(auth(jeton))).status).toBe(404);
    expect((await t.http().get(`/patron/personnes/${MARIE_AUTRE}`).set(auth(jeton))).status).toBe(
      404,
    );
    expect(
      (await t.http().get(`/patron/reglages/personnes/${MARIE_AUTRE}`).set(auth(jeton))).status,
    ).toBe(404);
    expect((await t.http().get("/patron/reglages/lignes/inconnue").set(auth(jeton))).status).toBe(
      404,
    );
    const equipe = patron.ListeEquipeSchema.parse(
      (await t.http().get("/patron/equipe").set(auth(jeton))).body,
    );
    expect(equipe.personnes.map((p) => p.id)).not.toContain(MARIE_AUTRE);
    // Le patron d'une compagnie sans rien : tableau vide, pas de fuite.
    const autre = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
    const tab = patron.TableauDuJourSchema.parse(
      (await t.http().get("/patron/aujourdhui").set(auth(autre.jeton))).body,
    );
    expect(tab.compagnie).toBe("Oméga");
    expect(tab.jour.recette).toBe(0);
    expect(tab.nbPersonnes).toBe(1);
  });

  it("une source en panne donne un 503 net, jamais des chiffres inventés", async () => {
    t.ventes.enPanne = true;
    try {
      const r = await t.http().get("/patron/aujourdhui").set(auth(jeton));
      expect(r.status).toBe(503);
      expect(r.body.code).toBe("SOURCE_INDISPONIBLE");
    } finally {
      t.ventes.enPanne = false;
    }
  });
});

describe("réglages · lecture", () => {
  it("l'accueil, une ligne, une personne et les règles suivent les contrats", async () => {
    const accueil = patron.ReglagesSchema.parse(
      (await t.http().get("/patron/reglages").set(auth(jeton))).body,
    );
    expect(accueil.lignes).toHaveLength(1);
    expect(accueil.lignes[0]).toMatchObject({
      nom: "Douala → Yaoundé",
      nbDeparts: 2,
      arrets: ["Édéa"],
    });
    expect(accueil.equipe.total).toBe(4);
    expect(accueil.regles.caisse.toleranceEcart).toBe(1000);

    const ligne = patron.LigneEditableSchema.parse(
      (await t.http().get(`/patron/reglages/lignes/${LIGNE_DLA_YDE}`).set(auth(jeton))).body,
    );
    expect(ligne.departs.map((d) => d.heure)).toEqual(["06:00", "10:00"]);
    expect(ligne.arrets[0]).toMatchObject({ nom: "Édéa", prorata: 900 });
    expect(ligne.plan).toMatchObject({ disposition: "2+2", capacite: 40 });

    const p = patron.PersonneEditableSchema.parse(
      (await t.http().get(`/patron/reglages/personnes/${ERIC}`).set(auth(jeton))).body,
    );
    expect(p).toMatchObject({
      nom: "Éric Ngono",
      guichet: "2",
      gareId: GARE_AKWA,
      role: "guichetier",
    });
    expect(p.telephone).toMatch(/^\+237/);

    patron.ReglesAgenceSchema.parse(
      (await t.http().get("/patron/reglages/regles").set(auth(jeton))).body,
    );
  });
});

describe("signature PIN", () => {
  const corps = (signature: unknown) => ({ regles: reglesValides(), signature });

  it("sans signature : 401 PIN_REQUIS et rien n'est écrit", async () => {
    const r = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send({ regles: reglesValides() });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("PIN_REQUIS");
    expect(await t.regles.lire(COMPAGNIE)).toBeNull();
  });

  it("PIN faux : 403 puis 423 au troisième, avec trace de chaque refus ; aucun PIN au journal", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await t
        .http()
        .put("/patron/reglages/regles")
        .set(auth(jeton))
        .send(corps(t.signature("111222")));
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("PIN_INCORRECT");
    }
    const r3 = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send(corps(t.signature("111222")));
    expect(r3.status).toBe(403);
    const bloque = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send(corps(t.signature()));
    expect(bloque.status).toBe(423);
    expect(bloque.body.code).toBe("PIN_BLOQUE");
    expect(await t.regles.lire(COMPAGNIE)).toBeNull();
    const journal = journalEnTexte();
    expect(journal).toContain("reglages.regles_modifiees");
    expect(journal).toContain('"refus"');
    expect(journal).not.toContain("111222");
    expect(journal).not.toContain(PIN_PATRON);
    t.personnes.modifier(patronId, { bloqueJusqua: null, echecsConnexion: 0 });
  });

  it("signature trop ancienne : 422 SIGNATURE_PERIMEE", async () => {
    const r = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send(corps(t.signature(PIN_PATRON, -3_600_000)));
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("SIGNATURE_PERIMEE");
  });

  it("un champ inconnu ou une valeur hors liste : 422 COMMANDE_INVALIDE", async () => {
    const inconnu = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send({ ...corps(t.signature()), surprise: 1 });
    expect(inconnu.status).toBe(422);
    expect(inconnu.body.code).toBe("COMMANDE_INVALIDE");
    const mauvaise = reglesValides();
    mauvaise.annulation.retenue = "beaucoup" as never;
    const r = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send({ regles: mauvaise, signature: t.signature() });
    expect(r.status).toBe(422);
  });
});

function reglesValides() {
  return {
    annulation: {
      gratuiteJusqua: "2h_avant" as const,
      retenue: "selon_classe" as const,
      retenueParClassePct: { classique: 10, vip: 20 },
    },
    caisse: { toleranceEcart: 2000, auDela: "pin_superviseur" as const },
    cadence: { numeroObligatoire: true },
    fraisService: { montant: 300, priseEnChargeParAgence: true },
  };
}

describe("réglages · règles", () => {
  it("enregistre les règles, trace l'écriture, et la caisse applique la nouvelle tolérance", async () => {
    const r = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send({ regles: reglesValides(), signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const lu = patron.ReglesEnregistreesSchema.parse(r.body);
    expect(lu.signePar).toBe(patronId);
    expect(lu.regles.caisse.toleranceEcart).toBe(2000);
    expect(lu.regles.fraisService).toEqual({ montant: 300, priseEnChargeParAgence: true });
    expect(await t.reglesCaisse.tolerance(COMPAGNIE)).toBe(2000);
    const relu = patron.ReglesAgenceSchema.parse(
      (await t.http().get("/patron/reglages/regles").set(auth(jeton))).body,
    );
    expect(relu.cadence.numeroObligatoire).toBe(true);
    expect(journalEnTexte()).toContain("reglages.regles_modifiees");
    expect(journalEnTexte()).toContain(lu.journalId);
    t.reglesCaisse.definirTolerance(COMPAGNIE, 1000);
  });

  it("refuse une tolérance démesurée", async () => {
    const regles = reglesValides();
    regles.caisse.toleranceEcart = 5_000_000;
    const r = await t
      .http()
      .put("/patron/reglages/regles")
      .set(auth(jeton))
      .send({ regles, signature: t.signature() });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("TOLERANCE_HORS_LIMITES");
  });
});

describe("réglages · lignes", () => {
  const url = `/patron/reglages/lignes/${LIGNE_DLA_YDE}`;
  const depart = (id: string | null, heure: string, extra = {}) => ({
    id,
    heure,
    heureInitiale: null,
    classe: "classique" as const,
    prix: 3500,
    actif: true,
    note: null,
    jours: [] as string[],
    nouveau: id === null,
    ...extra,
  });

  it("publie tarifs, arrêts, départs, plan et options d'un coup", async () => {
    const r = await t
      .http()
      .put(url)
      .set(auth(jeton))
      .send({
        ligneId: LIGNE_DLA_YDE,
        tarifs: { classique: 4000, vip: 5500, bagage: 600 },
        arrets: [
          { nom: "Édéa", montee: true },
          { nom: "Makak", montee: false },
        ],
        departs: [
          depart("00000000-0000-4000-8000-0000000000b0", "06:00", { prix: 4000 }),
          depart("00000000-0000-4000-8000-0000000000b1", "09:15", {
            prix: 4000,
            note: "soute colis",
          }),
          depart(null, "17:00", { prix: 4000, jours: ["mar"], note: "marché" }),
        ],
        plan: { capacite: 40, disposition: "2+2", rangees: 11 },
        options: { venteEnLigne: true, fusionAuto: true },
        signature: t.signature(),
      });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const lu = patron.LignePublieeSchema.parse(r.body);
    expect(lu.ligne.tarifs.classique).toBe(4000);
    expect(lu.ligne.arrets.map((a) => a.nom)).toEqual(["Édéa", "Makak"]);
    expect(lu.ligne.departs.map((d) => d.heure)).toEqual(["06:00", "09:15", "17:00"]);
    expect(lu.ligne.options.fusionAuto).toBe(true);
    expect(lu.ligne.brouillon.modifications).toBe(0);
    // Ce que lit le client est ce qui a été publié.
    const relu = patron.LigneEditableSchema.parse((await t.http().get(url).set(auth(jeton))).body);
    expect(relu.departs).toHaveLength(3);
    expect(journalEnTexte()).toContain("reglages.ligne_modifiee");
  });

  it("refuse un départ d'une autre ligne, deux départs identiques et une commande vide", async () => {
    const inconnu = await t
      .http()
      .put(url)
      .set(auth(jeton))
      .send({
        ligneId: LIGNE_DLA_YDE,
        departs: [depart("00000000-0000-4000-8000-0000000000aa", "06:00")],
        signature: t.signature(),
      });
    expect(inconnu.status).toBe(422);
    expect(inconnu.body.code).toBe("DEPART_INCONNU");
    const double = await t
      .http()
      .put(url)
      .set(auth(jeton))
      .send({
        ligneId: LIGNE_DLA_YDE,
        departs: [depart(null, "08:00"), depart(null, "08:00")],
        signature: t.signature(),
      });
    expect(double.status).toBe(422);
    expect(double.body.code).toBe("DEPART_EN_DOUBLE");
    const vide = await t
      .http()
      .put(url)
      .set(auth(jeton))
      .send({ ligneId: LIGNE_DLA_YDE, signature: t.signature() });
    expect(vide.body.code).toBe("COMMANDE_VIDE");
    const autreLigne = await t
      .http()
      .put(url)
      .set(auth(jeton))
      .send({
        ligneId: "x",
        tarifs: { classique: 1, vip: 1, bagage: 1 },
        signature: t.signature(),
      });
    expect(autreLigne.status).toBe(422);
  });

  it("une modification « dès lundi » attend son jour, puis entre en vigueur", async () => {
    const lundi = "2026-11-09";
    const r = await t
      .http()
      .put(url)
      .set(auth(jeton))
      .send({
        ligneId: LIGNE_DLA_YDE,
        tarifs: { classique: 3000, vip: 4500, bagage: 500 },
        effetDu: lundi,
        signature: t.signature(),
      });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const lu = patron.LignePublieeSchema.parse(r.body);
    expect(lu.ligne.tarifs.classique).toBe(3500);
    expect(lu.ligne.brouillon).toMatchObject({ modifications: 1 });
    expect(lu.ligne.brouillon.publicationA).toMatch(/^2026-11-09T00:00:00/);

    t.horloge.avancer(7 * 24 * 3_600_000);
    const apres = patron.LigneEditableSchema.parse((await t.http().get(url).set(auth(jeton))).body);
    expect(apres.tarifs.classique).toBe(3000);
    expect(apres.brouillon.modifications).toBe(0);
    t.horloge.avancer(-7 * 24 * 3_600_000);
  });

  it("crée une ligne entre deux gares, une seule fois", async () => {
    // Le couple Mvan → Akwa n'existe pas encore.
    const corps = {
      origineGareId: GARE_MVAN,
      destinationGareId: GARE_AKWA,
      tarifs: { classique: 3500, vip: 5000, bagage: 500 },
      arrets: ["Édéa"],
      capacite: 40,
      signature: t.signature(),
    };
    const r = await t.http().post("/patron/reglages/lignes").set(auth(jeton)).send(corps);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const lu = patron.LignePublieeSchema.parse(r.body);
    expect(lu.ligne.nom).toBe("Yaoundé → Douala");
    expect(lu.ligne.arrets[0]?.nom).toBe("Édéa");
    const doublon = await t
      .http()
      .post("/patron/reglages/lignes")
      .set(auth(jeton))
      .send({ ...corps, signature: t.signature() });
    expect(doublon.status).toBe(409);
    expect(doublon.body.code).toBe("LIGNE_EXISTANTE");
    const gareAutre = await t
      .http()
      .post("/patron/reglages/lignes")
      .set(auth(jeton))
      .send({ ...corps, origineGareId: GARE_AUTRE, signature: t.signature() });
    expect(gareAutre.status).toBe(404);
  });
});

describe("réglages · équipe", () => {
  const champs = (extra = {}) => ({
    nom: "Alice Nkeng",
    telephone: "+237677112233",
    operateur: "Orange" as const,
    role: "guichetier" as const,
    gareId: GARE_AKWA,
    guichet: "1",
    salaire: 85_000,
    droits: {
      vendreBilletsEtColis: true,
      annulerSansPinSuperviseur: false,
      modeCadence: false,
      voirCaissesDesAutres: false,
    },
    ...extra,
  });

  it("crée une personne : compte, réglages, PIN provisoire par SMS (jamais dans la réponse ni au journal)", async () => {
    const r = await t
      .http()
      .post("/patron/reglages/personnes")
      .set(auth(jeton))
      .send({ champs: champs(), signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const lu = patron.PersonneEnregistreeSchema.parse(r.body);
    expect(lu.pinProvisoireEnvoye).toBe(true);
    expect(lu.personne).toMatchObject({
      nom: "Alice Nkeng",
      telephone: "+237677112233",
      guichet: "1",
      operateur: "Orange",
    });
    const message = t.sms.dernier();
    expect(message?.telephone).toBe("+237677112233");
    const pin = /PIN provisoire est (\d{6})/.exec(message?.message ?? "")?.[1];
    expect(pin).toBeDefined();
    expect(JSON.stringify(r.body)).not.toContain(pin!);
    expect(journalEnTexte()).not.toContain(pin!);
    expect(journalEnTexte()).not.toContain("677112233");
    // Elle apparaît dans l'équipe.
    const equipe = patron.ListeEquipeSchema.parse(
      (await t.http().get("/patron/equipe").set(auth(jeton))).body,
    );
    expect(equipe.personnes.map((p) => p.nom)).toContain("Alice N.");
    // Le même numéro ne sert pas deux fois.
    const doublon = await t
      .http()
      .post("/patron/reglages/personnes")
      .set(auth(jeton))
      .send({ champs: champs(), signature: t.signature() });
    expect(doublon.status).toBe(409);
    expect(doublon.body.code).toBe("TELEPHONE_DEJA_UTILISE");
  });

  it("refuse un guichetier sans gare et un guichet hors guichetier", async () => {
    const sansGare = await t
      .http()
      .post("/patron/reglages/personnes")
      .set(auth(jeton))
      .send({
        champs: champs({ gareId: null, guichet: null, telephone: "+237677445566" }),
        signature: t.signature(),
      });
    expect(sansGare.body.code).toBe("GARE_REQUISE");
    const chauffeurGuichet = await t
      .http()
      .post("/patron/reglages/personnes")
      .set(auth(jeton))
      .send({
        champs: champs({ role: "chauffeur", telephone: "+237677445567" }),
        signature: t.signature(),
      });
    expect(chauffeurGuichet.body.code).toBe("GUICHET_REFUSE");
  });

  it("modifie une personne ; une caisse ouverte ne change pas d'affectation", async () => {
    const r = await t
      .http()
      .put(`/patron/reglages/personnes/${PAUL}`)
      .set(auth(jeton))
      .send({
        personneId: PAUL,
        champs: { salaire: 120_000, operateur: "Orange" },
        signature: t.signature(),
      });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const lu = patron.PersonneEnregistreeSchema.parse(r.body);
    expect(lu.personne.salaire).toBe(120_000);
    expect(lu.pinProvisoireEnvoye).toBe(false);

    const enService = await t
      .http()
      .put(`/patron/reglages/personnes/${ERIC}`)
      .set(auth(jeton))
      .send({
        personneId: ERIC,
        champs: { gareId: GARE_MVAN, guichet: "1" },
        signature: t.signature(),
      });
    expect(enService.status).toBe(409);
    expect(enService.body.code).toBe("PERSONNE_EN_SERVICE");
    const mauvaiseUrl = await t
      .http()
      .put(`/patron/reglages/personnes/${PAUL}`)
      .set(auth(jeton))
      .send({ personneId: ERIC, champs: { salaire: 1 }, signature: t.signature() });
    expect(mauvaiseUrl.status).toBe(422);
  });

  it("envoie un PIN provisoire par SMS", async () => {
    const compte = await t.compte("guichetier", { gareId: GARE_AKWA });
    t.equipe.ajouter(COMPAGNIE, {
      ...t.equipe.membres.get(ERIC)!,
      id: compte.id,
      nom: "Compte Test",
      situation: "repos",
    });
    const r = await t
      .http()
      .post(`/patron/reglages/personnes/${compte.id}/pin-provisoire`)
      .set(auth(jeton))
      .send({ personneId: compte.id, signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const lu = patron.PinProvisoireEnvoyeSchema.parse(r.body);
    expect(lu.personneId).toBe(compte.id);
    expect(t.sms.dernier()?.message).toMatch(/PIN provisoire est \d{6}/);
    expect(JSON.stringify(r.body)).not.toMatch(/\b\d{6}\b/);
  });

  it("désactive un compte : immédiat, son jeton ne passe plus ; on ne se désactive pas soi-même", async () => {
    const cible = await t.compte("guichetier", { gareId: GARE_AKWA });
    t.equipe.ajouter(COMPAGNIE, {
      ...t.equipe.membres.get(JOSEPH_OU_ERIC())!,
      id: cible.id,
      nom: "À Retirer",
      situation: "repos",
    });
    const avant = await t.http().get("/patron/aujourdhui").set(auth(cible.jeton));
    expect(avant.status).toBe(403); // rôle guichetier : mais le jeton est valable
    const r = await t
      .http()
      .post(`/patron/reglages/personnes/${cible.id}/desactivation`)
      .set(auth(jeton))
      .send({ personneId: cible.id, signature: t.signature() });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    patron.PersonneDesactiveeSchema.parse(r.body);
    expect((await t.http().get("/patron/aujourdhui").set(auth(cible.jeton))).status).toBe(401);
    const encore = await t
      .http()
      .post(`/patron/reglages/personnes/${cible.id}/desactivation`)
      .set(auth(jeton))
      .send({ personneId: cible.id, signature: t.signature() });
    expect(encore.status).toBe(409);
    const soi = await t
      .http()
      .post(`/patron/reglages/personnes/${patronId}/desactivation`)
      .set(auth(jeton))
      .send({ personneId: patronId, signature: t.signature() });
    expect(soi.status).toBe(403);
    expect(soi.body.code).toBe("AUTO_DESACTIVATION");
  });
});

function JOSEPH_OU_ERIC(): string {
  return ERIC;
}

describe("réglages · comptes mobile money", () => {
  const confirmation = (extra = {}) => ({
    operateur: "mtn" as const,
    nouveauNumero: "+237677998877",
    signature: t.signature(),
    ...extra,
  });

  it("deux temps : un code sur l'ancien numéro, puis le changement ; l'ancien tient jusqu'à minuit", async () => {
    t.regles.definirCompte(
      COMPAGNIE,
      "mtn",
      t.chiffrement.chiffrer("+237677000111", "patron.momo.telephone"),
    );
    const r1 = await t
      .http()
      .post("/patron/reglages/comptes-momo/confirmation")
      .set(auth(jeton))
      .send(confirmation());
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    const envoye = patron.ConfirmationCompteMomoEnvoyeeSchema.parse(r1.body);
    expect(envoye.envoyeA).toContain("••");
    const sms = t.sms.dernier();
    expect(sms?.telephone).toBe("+237677000111");
    const code = /code (\d{6})/.exec(sms?.message ?? "")?.[1];
    expect(code).toBeDefined();
    expect(JSON.stringify(r1.body)).not.toContain(code!);

    // Une deuxième demande tout de suite est refusée.
    const trop = await t
      .http()
      .post("/patron/reglages/comptes-momo/confirmation")
      .set(auth(jeton))
      .send(confirmation({ signature: t.signature() }));
    expect(trop.status).toBe(429);

    // Un mauvais code compte un essai.
    const faux = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({
        ...confirmation({ signature: t.signature() }),
        codeSms: code === "000000" ? "111111" : "000000",
      });
    expect(faux.status).toBe(403);
    expect(faux.body.code).toBe("CODE_SMS_INCORRECT");

    // Un code pour un autre numéro ne passe pas non plus.
    const autreNumero = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({
        ...confirmation({ nouveauNumero: "+237677555444", signature: t.signature() }),
        codeSms: code,
      });
    expect(autreNumero.status).toBe(403);

    const bon = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({ ...confirmation({ signature: t.signature() }), codeSms: code });
    expect(bon.status, JSON.stringify(bon.body)).toBe(200);
    patron.CompteMomoChangeSchema.parse(bon.body);

    // Trois codes faux bloquent la demande, même suivis du bon.
    t.horloge.avancer(120_000);
    await t
      .http()
      .post("/patron/reglages/comptes-momo/confirmation")
      .set(auth(jeton))
      .send(confirmation({ nouveauNumero: "+237677333222", signature: t.signature() }));
    const code2 = /code (\d{6})/.exec(t.sms.dernier()?.message ?? "")?.[1];
    for (let i = 0; i < 3; i++) {
      const raté = await t
        .http()
        .put("/patron/reglages/comptes-momo")
        .set(auth(jeton))
        .send({
          ...confirmation({ nouveauNumero: "+237677333222", signature: t.signature() }),
          codeSms: code2 === "123456" ? "654321" : "123456",
        });
      expect(raté.status).toBe(403);
    }
    const bloque = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({
        ...confirmation({ nouveauNumero: "+237677333222", signature: t.signature() }),
        codeSms: code2,
      });
    expect(bloque.status).toBe(423);
    expect(bloque.body.code).toBe("CONFIRMATION_BLOQUEE");
  });

  it("un bon code change le compte, le numéro n'apparaît que masqué", async () => {
    t.horloge.avancer(120_000);
    const r1 = await t
      .http()
      .post("/patron/reglages/comptes-momo/confirmation")
      .set(auth(jeton))
      .send(confirmation({ operateur: "orange", signature: t.signature() }));
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    const code = /code (\d{6})/.exec(t.sms.dernier()?.message ?? "")?.[1];
    const r2 = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({ ...confirmation({ operateur: "orange", signature: t.signature() }), codeSms: code });
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    const lu = patron.CompteMomoChangeSchema.parse(r2.body);
    expect(lu.operateur).toBe("orange");
    expect(lu.numeroMasque).toBe("6 77 •• •• 77");
    expect(lu.effetA).toMatch(/T00:00:00/);
    const regles = patron.ReglesAgenceSchema.parse(
      (await t.http().get("/patron/reglages/regles").set(auth(jeton))).body,
    );
    expect(regles.comptesMomo.orange.numeroMasque).toBe("6 77 •• •• 77");
    expect(journalEnTexte()).not.toContain("677998877");
    expect(journalEnTexte()).not.toContain(code!);
    // Le code ne sert qu'une fois.
    const rejeu = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({ ...confirmation({ operateur: "orange", signature: t.signature() }), codeSms: code });
    expect(rejeu.status).toBe(409);
    expect(rejeu.body.code).toBe("CONFIRMATION_ABSENTE");
  });

  it("un code expiré est refusé", async () => {
    t.horloge.avancer(120_000);
    await t
      .http()
      .post("/patron/reglages/comptes-momo/confirmation")
      .set(auth(jeton))
      .send(
        confirmation({
          operateur: "orange",
          nouveauNumero: "+237677121212",
          signature: t.signature(),
        }),
      );
    const code = /code (\d{6})/.exec(t.sms.dernier()?.message ?? "")?.[1];
    t.horloge.avancer(11 * 60_000);
    const r = await t
      .http()
      .put("/patron/reglages/comptes-momo")
      .set(auth(jeton))
      .send({
        ...confirmation({
          operateur: "orange",
          nouveauNumero: "+237677121212",
          signature: t.signature(),
        }),
        codeSms: code,
      });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("CONFIRMATION_EXPIREE");
  });
});

void SAMUEL;
