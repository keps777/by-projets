import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Billet, Bus, Compagnie, Depart, Gare, Ligne } from "../billetterie/modeles";
import { BilletsMemoire, CatalogueMemoire, ColisMemoire } from "../billetterie/memoire";
import { SessionsMemoire } from "../caisse/memoire";
import type { SessionStockee } from "../caisse/ports";
import {
  COMPAGNIE as COMPAGNIE_NUM,
  GARE as GARE_NUM,
  monterNumerotation,
  uuid,
} from "../numerotation/testing/montage";
import {
  CaissesDuJourSessions,
  DepartsDuJourBilletterie,
  TrousNumerotationControle,
} from "./ponts";
import { ReferentielMemoire } from "./memoire";
import { AKWA, AUTRE_COMPAGNIE, COMPAGNIE, GARES, GARE_AUTRE, JOUR, MVAN } from "./testing/montage";
import { monterRapport, instant, VINGT_ET_UNE_HEURES } from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

const referentiel = () =>
  new ReferentielMemoire()
    .ajouter({ id: COMPAGNIE, nom: "Oméga" }, GARES)
    .ajouter({ id: AUTRE_COMPAGNIE, nom: "Beta Express" }, [{ id: GARE_AUTRE, nom: "Bonabéri" }]);

/* ------------------------------------------------------------------ caisses */

function session(partiel: Partial<SessionStockee> = {}): SessionStockee {
  const n = Math.random().toString(36).slice(2, 8);
  return {
    id: `s-${n}`,
    numero: `K-DLA-270105-1-${n}`,
    guichetId: `g-${n}`,
    guichetRang: 1,
    gareId: AKWA,
    compagnieId: COMPAGNIE,
    agentId: `a-${n}`,
    fondDeCaisse: 20_000,
    tolerance: 1_000,
    ouverteA: instant("07:00"),
    reouverteA: null,
    etat: "ouverte",
    comptage: null,
    cloture: null,
    validation: null,
    refus: [],
    evenementOuvertureId: `e-${n}`,
    ...partiel,
  };
}

const cloture = (ecart: number, extra: Partial<NonNullable<SessionStockee["cloture"]>> = {}) => ({
  at: instant("18:00"),
  auto: false,
  cashCompte: 0,
  cashAttendu: 0,
  ecart,
  divergenceAppareil: 0,
  comptageAbsent: false,
  decompte: {
    billetsCash: { nombre: 0, montant: 0 },
    colisCash: { nombre: 0, montant: 0 },
    annulationsValidees: { nombre: 0, montant: 0 },
    momo: { ventes: 0, montant: 0 },
  },
  evenementId: "ev",
  ...extra,
});

describe("pont caisse : les sessions du jour, telles que la caisse et la supervision les ont écrites", () => {
  async function monter() {
    const sessions = new SessionsMemoire();
    const pont = new CaissesDuJourSessions(sessions, referentiel());
    return { sessions, pont };
  }

  it("rend les sessions ouvertes ce jour-là dans les gares de la compagnie, avec écart et signature", async () => {
    const { sessions, pont } = await monter();
    await sessions.creer(
      session({
        id: "validee",
        guichetRang: 2,
        etat: "validee",
        cloture: cloture(-1_000),
        validation: {
          at: instant("19:30"),
          superviseurId: "sup-essono",
          superviseurNom: "Essono",
          ecart: -1_000,
          commentaire: null,
          evenementId: "ev-v",
        },
      }),
    );
    await sessions.creer(
      session({ id: "cloturee", guichetRang: 3, etat: "cloturee", cloture: cloture(-500) }),
    );
    await sessions.creer(session({ id: "ouverte", guichetRang: 1, etat: "ouverte" }));
    await sessions.creer(
      session({
        id: "auto",
        gareId: MVAN,
        guichetRang: 1,
        etat: "cloturee",
        cloture: cloture(-695_500, { auto: true, comptageAbsent: true }),
      }),
    );

    const caisses = await pont.duJour(COMPAGNIE, JOUR);
    const par = (id: string) => caisses.find((c) => c.sessionId === id)!;
    expect(caisses).toHaveLength(4);
    expect(par("validee")).toEqual({
      sessionId: "validee",
      numero: expect.any(String),
      gareId: AKWA,
      guichetRang: 2,
      etat: "validee",
      ecart: -1_000,
      comptageAbsent: false,
      validation: { superviseurId: "sup-essono", superviseurNom: "Essono", at: instant("19:30") },
    });
    expect(par("cloturee")).toMatchObject({ etat: "cloturee", ecart: -500, validation: null });
    expect(par("ouverte")).toMatchObject({ etat: "ouverte", ecart: null, validation: null });
    expect(par("auto")).toMatchObject({ gareId: MVAN, comptageAbsent: true, ecart: -695_500 });
  });

  it("ignore les sessions d'un autre jour et celles d'une gare d'une autre compagnie", async () => {
    const { sessions, pont } = await monter();
    await sessions.creer(session({ id: "hier", ouverteA: instant("07:00", "2027-01-04") }));
    await sessions.creer(session({ id: "demain", ouverteA: instant("07:00", "2027-01-06") }));
    await sessions.creer(
      session({ id: "ailleurs", gareId: GARE_AUTRE, compagnieId: AUTRE_COMPAGNIE }),
    );
    await sessions.creer(session({ id: "bonne" }));
    expect((await pont.duJour(COMPAGNIE, JOUR)).map((c) => c.sessionId)).toEqual(["bonne"]);
    expect((await pont.duJour(AUTRE_COMPAGNIE, JOUR)).map((c) => c.sessionId)).toEqual([
      "ailleurs",
    ]);
  });

  it("une caisse refusée puis rouverte est de nouveau ouverte : plus d'écart ni de signature", async () => {
    const { sessions, pont } = await monter();
    await sessions.creer(
      session({
        id: "rouverte",
        etat: "ouverte",
        reouverteA: instant("15:00"),
        cloture: cloture(-2_000),
        refus: [
          {
            at: instant("14:59"),
            superviseurId: "sup",
            motif: "recompter",
            ecart: -2_000,
            evenementId: "ev-r",
          },
        ],
      }),
    );
    expect((await pont.duJour(COMPAGNIE, JOUR))[0]).toMatchObject({
      etat: "ouverte",
      ecart: null,
      comptageAbsent: false,
      validation: null,
    });
  });

  it("alimente le rapport : l'écart d'Akwa et la signature d'Essono viennent de la caisse", async () => {
    const { sessions, pont } = await monter();
    await sessions.creer(
      session({
        etat: "validee",
        guichetRang: 2,
        cloture: cloture(-1_000),
        validation: {
          at: instant("19:30"),
          superviseurId: "sup-essono",
          superviseurNom: "Essono",
          ecart: -1_000,
          commentaire: null,
          evenementId: "ev",
        },
      }),
    );
    const m = monterRapport();
    const lire = pont.duJour.bind(pont);
    m.caisses.duJour = lire;
    m.allerA(VINGT_ET_UNE_HEURES);
    const r = (await m.service.generer(COMPAGNIE, JOUR)).rapport;
    expect(r.gares.find((g) => g.gareId === AKWA)).toMatchObject({
      ecart: -1_000,
      remarques: ["1 guichet clôturé", "guichet 2, validé par Essono"],
    });
    expect(r.signatures).toEqual([{ nom: "Essono", gare: "Akwa" }]);
  });
});

/* ------------------------------------------------------------------ départs */

const compagnie: Compagnie = { id: COMPAGNIE, code: "OME", nom: "Oméga" };
const autre: Compagnie = { id: AUTRE_COMPAGNIE, code: "BET", nom: "Beta Express" };
const gareDla: Gare = {
  id: AKWA,
  compagnieId: COMPAGNIE,
  code: "DLA",
  nom: "Akwa",
  ville: "Douala",
};
const gareYde: Gare = {
  id: MVAN,
  compagnieId: COMPAGNIE,
  code: "YDE",
  nom: "Mvan",
  ville: "Yaoundé",
};
const gareAutre: Gare = {
  id: GARE_AUTRE,
  compagnieId: AUTRE_COMPAGNIE,
  code: "DLA",
  nom: "Bonabéri",
  ville: "Douala",
};
const ligne = (id: string, c: Compagnie, o: Gare, d: Gare): Ligne => ({
  id,
  compagnieId: c.id,
  code: "DLAYDE",
  origineGareId: o.id,
  destinationGareId: d.id,
  tarifs: { classique: 3_500, vip: 6_000, bagage: 500 },
  dureeMinutes: 270,
  arrets: [],
});
const bus = (id: string, c: Compagnie, capacite: number, capaciteSoute: number): Bus => ({
  id,
  compagnieId: c.id,
  immatriculation: id,
  capacite,
  capaciteSoute,
  classe: "classique",
});
const departBilletterie = (id: string, hhmm: string, partiel: Partial<Depart> = {}): Depart => ({
  id,
  numero: `OME-DLAYDE-270105-${hhmm.replace(":", "")}`,
  ligneId: "ligne-a",
  busId: "bus-40",
  classe: "classique",
  heureDepart: instant(hhmm),
  etat: "parti",
  historique: [],
  fusionneDansId: null,
  quai: 1,
  chauffeur: null,
  convoyeur: null,
  ...partiel,
});
let compteurBillet = 0;
const billetBilletterie = (departId: string, etat: Billet["etat"]): Billet => ({
  id: `bil-${++compteurBillet}`,
  numero: `OME-DLA-270105-${String(compteurBillet).padStart(4, "0")}`,
  sequence: compteurBillet,
  compagnieId: COMPAGNIE,
  gareId: AKWA,
  departId,
  siege: compteurBillet,
  classe: "classique",
  prix: 3_500,
  bagage: 0,
  canal: "guichet",
  guichetId: null,
  acheteurId: null,
  commandeId: null,
  passagerChiffre: "",
  passagerTelephoneIndex: null,
  codeBillet: String(1000 + compteurBillet),
  qr: "",
  creeA: instant("07:00"),
  etat,
  historique: [],
  evenementId: null,
  appareilId: null,
  auteurId: null,
  paiement: { mode: "cash", reference: null },
  aCompleterAuQuai: false,
  smsEnvoye: false,
  retardPrevenu: false,
  embarqueA: null,
  reporteDe: null,
});

describe("pont départs : le catalogue, les billets et la soute de la billetterie", () => {
  function monter() {
    const catalogue = new CatalogueMemoire();
    catalogue.ajouterCompagnie(compagnie);
    catalogue.ajouterCompagnie(autre);
    for (const g of [gareDla, gareYde, gareAutre]) catalogue.ajouterGare(g);
    catalogue.ajouterLigne(ligne("ligne-a", compagnie, gareDla, gareYde));
    catalogue.ajouterLigne(ligne("ligne-b", autre, gareAutre, gareAutre));
    catalogue.ajouterBus(bus("bus-40", compagnie, 40, 10));
    catalogue.ajouterBus(bus("bus-b", autre, 50, 10));
    const billets = new BilletsMemoire();
    const soute = new ColisMemoire();
    const pont = new DepartsDuJourBilletterie(catalogue, billets, soute);
    return { catalogue, billets, soute, pont };
  }

  it("compte les places prises, la capacité du bus, la fusion et la soute pleine", async () => {
    const { catalogue, billets, soute, pont } = monter();
    catalogue.ajouterDepart(departBilletterie("d-0930", "09:30"));
    catalogue.ajouterDepart(
      departBilletterie("d-1600", "16:00", { etat: "fusionne", fusionneDansId: "d-1630" }),
    );
    catalogue.ajouterDepart(departBilletterie("d-1630", "16:30"));
    catalogue.ajouterDepart(departBilletterie("d-1000", "10:00", { etat: "arrive" }));

    // 09:30 : 22 places prises (payé, embarqué, voyagé, non présenté) ; annulé, réservé et reporté ne comptent pas
    for (const etat of ["paye", "embarque", "voyage", "non_presente"] as const) {
      for (
        let i = 0;
        i < (etat === "paye" ? 10 : etat === "embarque" ? 8 : etat === "voyage" ? 3 : 1);
        i++
      ) {
        await billets.ajouter(billetBilletterie("d-0930", etat));
      }
    }
    for (const etat of ["annule", "annule", "reserve", "reporte"] as const) {
      await billets.ajouter(billetBilletterie("d-0930", etat));
    }
    soute.definir("d-1000", { charges: 10, colisACharger: 0 }); // 10 colis chargés pour 10 places de soute
    soute.definir("d-0930", { charges: 9, colisACharger: 3 });

    const departs = await pont.duJour(COMPAGNIE, JOUR);
    const par = (heure: string) => departs.find((d) => d.heure === heure)!;
    expect(departs.map((d) => d.heure)).toEqual(["09:30", "10:00", "16:00", "16:30"]);
    expect(par("09:30")).toEqual({
      departId: "d-0930",
      gareId: AKWA,
      heure: "09:30",
      etat: "parti",
      capacite: 40,
      vendus: 22,
      fusionneAvec: null,
      soutePleine: false,
    });
    expect(par("10:00")).toMatchObject({ etat: "arrive", vendus: 0, soutePleine: true });
    expect(par("16:00")).toMatchObject({ etat: "fusionne", fusionneAvec: "16:30" });
    expect(par("16:30")).toMatchObject({ fusionneAvec: null });
  });

  it("ne lit que les départs du jour et de la compagnie", async () => {
    const { catalogue, pont } = monter();
    catalogue.ajouterDepart(
      departBilletterie("d-hier", "09:30", { heureDepart: instant("23:59", "2027-01-04") }),
    );
    catalogue.ajouterDepart(
      departBilletterie("d-demain", "09:30", { heureDepart: instant("00:00", "2027-01-06") }),
    );
    catalogue.ajouterDepart(departBilletterie("d-minuit", "00:00"));
    catalogue.ajouterDepart(
      departBilletterie("d-autre", "11:00", { ligneId: "ligne-b", busId: "bus-b" }),
    );
    expect((await pont.duJour(COMPAGNIE, JOUR)).map((d) => d.departId)).toEqual(["d-minuit"]);
    expect((await pont.duJour(AUTRE_COMPAGNIE, JOUR)).map((d) => d.departId)).toEqual(["d-autre"]);
  });

  it("un départ sans bus affecté n'a ni capacité ni soute", async () => {
    const { catalogue, pont } = monter();
    catalogue.ajouterDepart(departBilletterie("d-sans-bus", "12:00", { busId: null }));
    expect((await pont.duJour(COMPAGNIE, JOUR))[0]).toMatchObject({
      capacite: 0,
      soutePleine: false,
    });
  });

  it("alimente le rapport : le 09:30 à 55 % est signalé, la fusion et la soute écrites", async () => {
    const { catalogue, billets, soute, pont } = monter();
    catalogue.ajouterDepart(departBilletterie("d-0930", "09:30"));
    catalogue.ajouterDepart(
      departBilletterie("d-1600", "16:00", { etat: "fusionne", fusionneDansId: "d-1630" }),
    );
    catalogue.ajouterDepart(departBilletterie("d-1630", "16:30"));
    for (let i = 0; i < 22; i++) await billets.ajouter(billetBilletterie("d-0930", "paye"));
    for (let i = 0; i < 38; i++) await billets.ajouter(billetBilletterie("d-1630", "embarque"));
    soute.definir("d-0930", { charges: 10, colisACharger: 0 });

    const m = monterRapport();
    m.departs.duJour = pont.duJour.bind(pont);
    m.allerA(VINGT_ET_UNE_HEURES);
    const r = (await m.service.generer(COMPAGNIE, JOUR)).rapport;
    expect(r.remplissage).toEqual({ moyenPct: 75, remarque: "le 09:30 Oméga part à 55 %" }); // 60 / 80
    // les départs de la ligne partent tous d'Akwa : fusion et soute sont dans ses remarques
    expect(r.gares.find((g) => g.gareId === AKWA)!.remarques).toEqual([
      "1 départ fusionné (16:00 + 16:30)",
      "soute pleine à 09:30",
    ]);
  });
});

/* ------------------------------------------------------------------ numérotation */

describe("pont numérotation : les trous du contrôle de fin de journée", () => {
  async function monter() {
    const num = monterNumerotation();
    await num.plages.attribuer({
      appareilId: "g2",
      genre: "guichet",
      rang: 2,
      gareId: GARE_NUM,
      compagnieId: COMPAGNIE_NUM,
      titulaire: { id: "p-marie", nom: "Marie Ngono" },
    });
    const pont = new TrousNumerotationControle(num.controle);
    const vendre = async (numeros: number[]) => {
      for (const numeroPlage of numeros) {
        await num.controleNumeros.enregistrer({
          appareilId: "g2",
          jour: "270105",
          genre: "billet",
          numeroPlage,
          evenementId: uuid(),
          plage: null,
        });
      }
    };
    return { num, pont, vendre };
  }

  it("reprend la phrase nominative de l'alerte, avec la gare", async () => {
    const { pont, vendre } = await monter();
    await vendre([1001, 1002, 1005]);
    const trous = await pont.duJour(COMPAGNIE_NUM, JOUR);
    expect(trous).toEqual([
      {
        gareId: GARE_NUM,
        message: "Il manque les numéros 1003–1004 (billets) dans la plage 1001–1999 de Marie Ngono",
      },
    ]);
  });

  it("ne dit rien d'une plage sans trou, et referme l'alerte quand le trou est comblé", async () => {
    const { pont, vendre } = await monter();
    await vendre([1001, 1003]);
    expect(await pont.duJour(COMPAGNIE_NUM, JOUR)).toHaveLength(1);
    await vendre([1002]); // synchronisation tardive
    expect(await pont.duJour(COMPAGNIE_NUM, JOUR)).toEqual([]);
  });

  it("ne mélange pas les compagnies ni les jours", async () => {
    const { pont, vendre } = await monter();
    await vendre([1001, 1005]);
    expect(await pont.duJour("autre-compagnie", JOUR)).toEqual([]);
    expect(await pont.duJour(COMPAGNIE_NUM, "2027-01-06")).toEqual([]);
  });

  it("alimente le rapport : le trou apparaît dans la gare concernée", async () => {
    const { pont, vendre } = await monter();
    await vendre([1001, 1002, 1005]);
    const m = monterRapport();
    m.referentiel.ajouter({ id: COMPAGNIE_NUM, nom: "Alpha" }, [{ id: GARE_NUM, nom: "Akwa" }]);
    m.trous.duJour = pont.duJour.bind(pont);
    const r = (await m.service.generer(COMPAGNIE_NUM, JOUR)).rapport;
    expect(r.gares[0]!.remarques).toEqual([
      "Il manque les numéros 1003–1004 (billets) dans la plage 1001–1999 de Marie Ngono",
    ]);
  });
});
