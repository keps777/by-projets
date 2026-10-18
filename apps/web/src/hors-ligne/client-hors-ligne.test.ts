import {
  ErreurHttp,
  ErreurReseau,
  agence,
  horlogeGelee,
  type ClientApi,
  type Operation,
} from "@afrimove/api-client";
import { agence as contrats } from "@afrimove/contrats";
import { plageGuichet, versIsoDouala } from "@afrimove/domain";
import { MoteurSync, reseauManuel, type ReseauManuel } from "@afrimove/sync";
import { HorlogeManuelle, ServeurFactice, indexedDbFactice } from "@afrimove/sync/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheMemoire } from "./cache";
import { creerClientHorsLigne } from "./client-hors-ligne";

/**
 * Le client d'API de l'application avec le moteur hors ligne (vrai moteur, IndexedDB factice, faux serveur de
 * synchronisation) : une vente sans réseau est mise en file, imprimable tout de suite, rejouée au retour du réseau ;
 * les lectures hors ligne viennent de la dernière lecture réussie, corrigée de ce que l'appareil sait.
 */

const DEBUT = Date.parse("2027-01-05T07:00:00+01:00");
const DEPART = "depart-1";
const DEPART_2 = "depart-2";
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const contexte: contrats.VenteContexte = {
  guichet: { id: "g2", rang: 2 },
  prochainNumero: { sequence: 1001, numero: "ALP-DLA-270105-1001" },
  departs: [
    {
      departId: DEPART,
      heureDepart: "2027-01-05T08:00:00+01:00",
      destination: "Yaoundé",
      placesLibres: 38,
    },
    {
      departId: DEPART_2,
      heureDepart: "2027-01-05T09:00:00+01:00",
      destination: "Bafoussam",
      placesLibres: 40,
    },
  ],
  autresDeparts: 0,
  departChoisiId: DEPART,
  siege: {
    propose: 1,
    libres: 38,
    plan: {
      colonnes: 4,
      cases: Array.from({ length: 40 }, (_, i) => ({
        numero: i + 1,
        etat:
          i === 0
            ? ("attribue" as const)
            : i === 1 || i === 2
              ? ("pris" as const)
              : ("libre" as const),
      })),
    },
  },
  tarifs: { classique: 4000, vip: 6000, bagage: 500 },
  brouillon: null,
};

const accueil: contrats.GuichetAccueil = {
  agence: { compagnie: "Alpha Voyages", gare: "Akwa" },
  guichet: {
    id: "g2",
    rang: 2,
    agent: { id: "pers-joseph", nom: "Joseph M." },
    caisseOuverteA: "2027-01-05T06:00:00+01:00",
  },
  synchro: { etat: "sync", derniereSyncA: "2027-01-05T06:55:00+01:00", evenementsEnAttente: 0 },
  compteurs: { billets: 10, colis: 1, colisACharger: 0, enCaisse: 50000, ecart: 0 },
  quai: {
    departId: DEPART,
    heureDepart: "2027-01-05T08:00:00+01:00",
    destination: "Yaoundé",
    scannes: 0,
    capacite: 40,
  },
  cadence: { fileAttente: 0 },
  prochainDepart: {
    departId: DEPART,
    heureDepart: "2027-01-05T08:00:00+01:00",
    destination: "Yaoundé",
    placesLibres: 38,
    dansMinutes: 60,
  },
  prochaineOuverture: null,
};

const donneesVente = (billetId: string, siege: number | null, departId = DEPART) => ({
  billetId,
  departId,
  siege,
  classe: "classique" as const,
  prix: 4000,
  bagage: 500,
  passager: { nom: "Tchoumi Paul", telephone: "+237677301145", pieceQuatreDerniers: "4821" },
  paiement: { mode: "cash" as const, recu: 5000, rendu: 500, reference: null },
  codeBillet: "6204",
  sms: true,
});

interface Banc {
  horloge: HorlogeManuelle;
  reseau: ReseauManuel;
  serveur: ServeurFactice;
  moteur: MoteurSync;
  /** Ce que le « vrai » serveur répond, par opération ; absent = panne réseau. */
  reponses: Map<string, unknown>;
  appels: string[];
  client: ClientApi;
}

let banc: Banc;
let compteurId = 0;

/** Un événement tel que `AppareilAgence.creerEvenement` l'a fabriqué. */
function evenementVente(siege: number | null, numeroPlage: number, departId = DEPART) {
  const billetId = UUID(900 + numeroPlage);
  return {
    id: UUID(++compteurId),
    type: "billet.vendu",
    at: versIsoDouala(banc.horloge.maintenant()),
    appareilId: "appareil-g2",
    auteurId: "pers-joseph",
    cible: { type: "billet", id: billetId },
    numeroPlage,
    donnees: donneesVente(billetId, siege, departId),
  } as never;
}

beforeEach(async () => {
  const horloge = new HorlogeManuelle(DEBUT);
  const reseau = reseauManuel(true);
  const serveur = new ServeurFactice({ horloge });
  serveur.parts = { [DEPART]: [3, 4, 5, 6, 7], [DEPART_2]: [11, 12] };
  const moteur = await MoteurSync.ouvrir({
    appareilId: "appareil-g2",
    auteurId: "pers-joseph",
    agence: "ALP",
    gare: "DLA",
    plage: plageGuichet(2),
    transport: serveur,
    horloge,
    reseau,
    dexie: indexedDbFactice(),
    synchroAutomatique: false,
  });
  await moteur.synchroniser(); // reçoit la part de sièges
  const reponses = new Map<string, unknown>();
  const appels: string[] = [];
  const base: ClientApi = {
    mode: "http",
    horloge: horlogeGelee(versIsoDouala(DEBUT)),
    souscrire: () => () => undefined,
    async executer<P, R>(operation: Operation<P, R>): Promise<R> {
      appels.push(operation.nom);
      if (!reponses.has(operation.nom)) throw new ErreurReseau("injoignable");
      const r = reponses.get(operation.nom);
      if (r instanceof Error) throw r;
      return r as R;
    },
  };
  const client = creerClientHorsLigne(base, {
    moteur,
    cache: cacheMemoire(),
    identite: { compagnie: "ALP", gare: "DLA" },
  });
  banc = { horloge, reseau, serveur, moteur, reponses, appels, client };
});

afterEach(async () => {
  await banc.moteur.arreter().catch(() => undefined);
});

const vendre = (evenement: never) =>
  banc.client.executer(agence.ECRITURES.billetVendu.operation, evenement);

describe("une vente", () => {
  it("en ligne, part au serveur comme avant : rien n'est mis en file", async () => {
    const reponse = {
      accuse: { evenementId: UUID(1), statut: "accepte", recuA: versIsoDouala(DEBUT) },
      billet: {
        billetId: "b",
        numero: "ALP-DLA-270105-1005",
        sequence: 1005,
        compagnie: "Alpha",
        trajet: { origine: "Akwa", destination: "Yaoundé" },
        heureDepart: "2027-01-05T08:00:00+01:00",
        siege: 5,
        classe: "classique",
        passager: { nom: "x", pieceQuatreDerniers: null },
        codeBillet: "6204",
        qr: "AM1:signe",
        prix: 4000,
        aCompleterAuQuai: false,
      },
    };
    banc.reponses.set(agence.ECRITURES.billetVendu.operation.nom, reponse);
    const r = await vendre(evenementVente(5, 1005));
    expect(r.billet.qr).toBe("AM1:signe");
    expect(await banc.moteur.lireFile({ statut: "en_attente" })).toHaveLength(0);
  });

  it("sans réseau : mise en file, billet à imprimer tout de suite avec son numéro et son siège, indicateur HORS LIGNE", async () => {
    banc.reseau.definir(false);
    const r = await vendre(evenementVente(5, 1005));
    expect(banc.appels).toEqual([]); // pas d'attente du réseau
    expect(r.accuse.statut).toBe("accepte");
    expect(r.billet).toMatchObject({
      numero: "ALP-DLA-270105-1005",
      sequence: 1005,
      siege: 5,
      codeBillet: "6204",
      prix: 4000,
      aCompleterAuQuai: false,
      passager: { nom: "Tchoumi Paul", pieceQuatreDerniers: "4821" },
    });
    // Pas de QR signé sans le serveur : un contenu non signé, qui ne prétend pas l'être.
    expect(r.billet.qr).toBe("AM0:ALP-DLA-270105-1005:6204:depart-1");
    const etat = await banc.moteur.etat();
    expect(etat).toMatchObject({ libelle: "HORS LIGNE", evenementsEnAttente: 1 });
  });

  it("le billet local connaît le trajet et l'heure d'après la dernière lecture de la vente et de l'accueil", async () => {
    banc.reponses.set(agence.OP_VENTE_CONTEXTE.nom, contexte);
    banc.reponses.set(agence.OP_GUICHET_ACCUEIL.nom, accueil);
    await banc.client.executer(agence.OP_VENTE_CONTEXTE, {});
    await banc.client.executer(agence.OP_GUICHET_ACCUEIL, undefined);
    banc.reseau.definir(false);
    const r = await vendre(evenementVente(5, 1005));
    expect(r.billet).toMatchObject({
      compagnie: "Alpha Voyages",
      trajet: { origine: "Akwa", destination: "Yaoundé" },
      heureDepart: "2027-01-05T08:00:00+01:00",
    });
  });

  it("le serveur qui ne répond pas (réseau) : mise en file aussi, et le moteur apprend la panne", async () => {
    const r = await vendre(evenementVente(5, 1005)); // aucune réponse programmée : ErreurReseau
    expect(r.billet.numero).toBe("ALP-DLA-270105-1005");
    expect(banc.appels).toEqual([agence.ECRITURES.billetVendu.operation.nom]);
    expect(await banc.moteur.lireFile({ statut: "en_attente" })).toHaveLength(1);
  });

  it("un refus du serveur (422, 409) n'est jamais mis en file : l'écran le reçoit tel quel", async () => {
    banc.reponses.set(
      agence.ECRITURES.billetVendu.operation.nom,
      new ErreurHttp(409, "Siège déjà vendu", "SIEGE_PRIS"),
    );
    await expect(vendre(evenementVente(5, 1005))).rejects.toMatchObject({ code: "SIEGE_PRIS" });
    expect(await banc.moteur.lireFile()).toHaveLength(0);
  });

  it("une passerelle en panne (503) vaut absence de réseau", async () => {
    banc.reponses.set(
      agence.ECRITURES.billetVendu.operation.nom,
      new ErreurHttp(503, "Service indisponible"),
    );
    const r = await vendre(evenementVente(5, 1005));
    expect(r.billet.siege).toBe(5);
    expect(await banc.moteur.lireFile({ statut: "en_attente" })).toHaveLength(1);
  });

  it("hors ligne, un siège hors de la part est refusé comme « siège pris » et ne consomme rien dans la file", async () => {
    banc.reseau.definir(false);
    await expect(vendre(evenementVente(20, 1005))).rejects.toMatchObject({
      statut: 409,
      code: "SIEGE_PRIS",
    });
    await vendre(evenementVente(5, 1006));
    await expect(vendre(evenementVente(5, 1007))).rejects.toMatchObject({ code: "SIEGE_PRIS" });
    expect(await banc.moteur.lireFile()).toHaveLength(1);
  });

  it("au retour du réseau, la file part dans l'ordre et l'indicateur repasse à SYNC", async () => {
    banc.reseau.definir(false);
    const a = evenementVente(5, 1005);
    const b = evenementVente(6, 1006);
    await vendre(a);
    await vendre(b);
    banc.reseau.definir(true);
    const bilan = await banc.moteur.synchroniser();
    expect(bilan).toMatchObject({ statut: "termine", acquittes: 2, restants: 0 });
    expect(banc.serveur.journal.map((e) => e.numeroPlage)).toEqual([1005, 1006]);
    expect(await banc.moteur.etat()).toMatchObject({ libelle: "SYNC", evenementsEnAttente: 0 });
  });

  it("une vente de cadence en file : billet « à compléter au quai » et places restantes", async () => {
    banc.reseau.definir(false);
    const billetId = UUID(777);
    const evenement = {
      id: UUID(++compteurId),
      type: "billet.vendu_cadence",
      at: versIsoDouala(DEBUT),
      appareilId: "appareil-g2",
      auteurId: "pers-joseph",
      cible: { type: "billet", id: billetId },
      numeroPlage: 1010,
      donnees: {
        billetId,
        departId: DEPART,
        siege: 6,
        prix: 4000,
        paiement: { mode: "cash", recu: 4000, rendu: 0, reference: null },
        codeBillet: "1234",
        telephone: null,
      },
    } as never;
    const r = await banc.client.executer(agence.ECRITURES.billetVenduCadence.operation, evenement);
    expect(r.billet).toMatchObject({ siege: 6, aCompleterAuQuai: true, sequence: 1010 });
    const local = await banc.client.executer(agence.OP_CADENCE_BILLET, { billetId });
    expect(local.recapitulatif).toMatchObject({
      synchro: "au_retour_du_reseau",
      siegeBloque: 6,
      sms: "pas_de_numero",
      caisseCash: 4000,
    });
  });
});

describe("les lectures", () => {
  it("la vente sans réseau : la dernière lecture, limitée à la part de sièges de l'appareil et sans les sièges déjà vendus", async () => {
    banc.reponses.set(agence.OP_VENTE_CONTEXTE.nom, contexte);
    const enLigne = await banc.client.executer(agence.OP_VENTE_CONTEXTE, {});
    expect(enLigne.siege.libres).toBe(38);

    banc.reseau.definir(false);
    await vendre(evenementVente(3, 1005));
    const ctx = await banc.client.executer(agence.OP_VENTE_CONTEXTE, {});
    const etats = new Map(ctx.siege.plan.cases.map((c) => [c.numero, c.etat]));
    // La part est 3 à 7 ; le 3 est vendu ici ; le 1 (proposé) n'est pas à nous.
    expect([...etats].filter(([, e]) => e !== "pris").map(([n]) => n)).toEqual([4, 5, 6, 7]);
    expect(ctx.siege.propose).toBe(4);
    expect(etats.get(4)).toBe("attribue");
    expect(ctx.siege.libres).toBe(4);
    expect(ctx.prochainNumero).toEqual({ sequence: 1006, numero: "ALP-DLA-270105-1006" });
    // Le départ choisi compte ses places libres ; l'autre départ, la part (2) dont dispose l'appareil.
    expect(ctx.departs.map((d) => [d.departId, d.placesLibres])).toEqual([
      [DEPART, 4],
      [DEPART_2, 2],
    ]);
  });

  it("en ligne avec des ventes encore en file, les sièges déjà vendus ici ne sont pas reproposés", async () => {
    banc.reseau.definir(false);
    banc.reponses.set(agence.OP_VENTE_CONTEXTE.nom, contexte);
    await vendre(evenementVente(1, 1005)).catch(() => undefined); // hors part : refusé
    await banc.client.executer(agence.OP_VENTE_CONTEXTE, {}).catch(() => undefined);
    banc.reseau.definir(true);
    await banc.moteur.synchroniser();
    await vendre(evenementVente(3, 1005)).catch(() => undefined);
    const ctx = await banc.client.executer(agence.OP_VENTE_CONTEXTE, {});
    expect(ctx.siege.plan.cases.find((c) => c.numero === 3)?.etat).not.toBe("libre");
  });

  it("l'accueil : l'état de synchronisation est celui du moteur, et les ventes en file sont comptées", async () => {
    banc.reponses.set(agence.OP_GUICHET_ACCUEIL.nom, accueil);
    expect((await banc.client.executer(agence.OP_GUICHET_ACCUEIL, undefined)).synchro.etat).toBe(
      "sync",
    );
    banc.reseau.definir(false);
    await vendre(evenementVente(3, 1005)); // 4 000 + 500 de bagage, en espèces
    const a = await banc.client.executer(agence.OP_GUICHET_ACCUEIL, undefined);
    expect(a.synchro).toMatchObject({ etat: "hors_ligne", evenementsEnAttente: 1 });
    expect(a.compteurs).toMatchObject({ billets: 11, enCaisse: 54500 });
  });

  it("une lecture jamais faite, sans réseau, échoue comme avant (pas de réponse inventée)", async () => {
    banc.reseau.definir(false);
    await expect(banc.client.executer(agence.OP_GUICHET_ACCUEIL, undefined)).rejects.toBeInstanceOf(
      ErreurReseau,
    );
  });

  it("une erreur du serveur n'est jamais masquée par le cache", async () => {
    banc.reponses.set(agence.OP_GUICHET_ACCUEIL.nom, accueil);
    await banc.client.executer(agence.OP_GUICHET_ACCUEIL, undefined);
    banc.reponses.set(agence.OP_GUICHET_ACCUEIL.nom, new ErreurHttp(403, "Interdit", "INTERDIT"));
    await expect(banc.client.executer(agence.OP_GUICHET_ACCUEIL, undefined)).rejects.toMatchObject({
      statut: 403,
    });
  });

  it("les autres opérations passent sans changement", async () => {
    banc.reponses.set(agence.OP_IMPRESSION_ETAT.nom, { etat: "ok", nom: "Imprimante" });
    expect(await banc.client.executer(agence.OP_IMPRESSION_ETAT, undefined)).toEqual({
      etat: "ok",
      nom: "Imprimante",
    });
  });
});
