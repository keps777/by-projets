import { agence } from "@afrimove/api-client";
import { analyserSequences, plageGuichet, versIsoDouala } from "@afrimove/domain";
import { MoteurSync, creerTransportHttp, reseauManuel, type ReseauManuel } from "@afrimove/sync";
import { HorlogeManuelle, MINUTE, indexedDbFactice } from "@afrimove/sync/testing";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appeler, connecter, lire, pile, type Session } from "../support/api";
import { clientHttp, creerDepart, declarerAppareil, type DepartCree } from "../support/journee";

/**
 * Critère 2 : « quatre heures de vente hors ligne, puis synchronisation sans doublon ni trou ».
 *
 * Trois téléphones de guichet (le vrai moteur `@afrimove/sync`, IndexedDB factice, signature ECDSA réelle) vendent
 * pendant 4 h sans réseau, l'horloge de l'appareil étant simulée (la pendule du serveur, elle, est la vraie : le
 * temps simulé n'existe que sur les téléphones). À 4 h, le réseau revient : le moteur envoie sa file à la vraie API
 * (`POST /sync/evenements`, PostgreSQL). Un téléphone est tué et relancé à mi-parcours, un autre perd la réponse d'un
 * lot que le serveur a pourtant traité.
 *
 * Deux choses sont vérifiées, séparément, parce que la pile actuelle les sépare :
 *   1. le journal du serveur (la voie `/sync`) : tout est arrivé, une fois, dans l'ordre, sans trou de numéro ;
 *   2. les billets (la voie `/agence/billets`) : voir « anomalie A6 » plus bas.
 */

interface Guichet {
  rang: 1 | 2 | 3;
  session: Session;
  appareilId: string;
  moteur: MoteurSync;
  reseau: ReseauManuel;
  dexie: ReturnType<typeof indexedDbFactice>;
  /** Réponses à perdre : le serveur a traité, la connexion tombe avant le retour. */
  pannes: { perdreReponse: number };
  evenements: string[];
  numeros: string[];
  /** Ventes déjà faites par départ (pour donner à chaque vente un siège encore libre de la part du guichet). */
  ventesParDepart: number[];
}

const HEURE = 60 * MINUTE;
/** Il y a trois jours à 07 h 30 (Douala) : une journée close, sans autre vente. */
const jourSimule = (): number => {
  const local = new Date(Date.now() + HEURE);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 3) -
    HEURE +
    7.5 * HEURE
  );
};

function aleatoire(graine: number): () => number {
  let s = graine;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let horloge: HorlogeManuelle;
let departs: DepartCree[];
let guichets: Guichet[] = [];
let superviseur: Session;
let compteur = 0;

function transport(g: Pick<Guichet, "session" | "pannes">) {
  const vrai = globalThis.fetch;
  return creerTransportHttp({
    urlBase: pile().urlApi,
    obtenirJeton: () => g.session.jeton,
    fetch: (async (...args: Parameters<typeof fetch>) => {
      const reponse = await vrai(...args);
      await reponse.clone().arrayBuffer(); // le serveur a bien fini de traiter
      if (g.pannes.perdreReponse > 0 && String(args[0]).endsWith("/sync/evenements")) {
        g.pannes.perdreReponse -= 1;
        throw new TypeError("fetch failed");
      }
      return reponse;
    }) as typeof fetch,
  });
}

function ouvrirMoteur(
  g: Pick<Guichet, "rang" | "session" | "appareilId" | "reseau" | "dexie" | "pannes">,
) {
  return MoteurSync.ouvrir({
    appareilId: g.appareilId,
    auteurId: g.session.id,
    agence: "DEM",
    gare: "DLA",
    plage: plageGuichet(g.rang),
    transport: transport(g),
    horloge,
    reseau: g.reseau,
    dexie: g.dexie,
    synchroAutomatique: false,
    tailleLot: 10,
  });
}

async function vendreHorsLigne(g: Guichet, alea: () => number): Promise<void> {
  compteur += 1;
  const indexDepart = Math.floor(alea() * departs.length);
  const dejaVendus = g.ventesParDepart[indexDepart]!;
  if (dejaVendus >= 22)
    throw new Error("La part de sièges du guichet est épuisée : le scénario doit vendre moins");
  g.ventesParDepart[indexDepart] = dejaVendus + 1;
  const mode = alea() < 0.7 ? "cash" : alea() < 0.5 ? "momo" : "orange_money";
  const bagage = alea() < 0.2 ? 500 : 0;
  const du = 8000 + bagage;
  const r = await g.moteur.enregistrer(agence.ECRITURES.billetVendu.evenement, {
    billetId: randomUUID(),
    departId: departs[indexDepart]!.id,
    // Chaque guichet a son tiers de sièges : jamais deux appareils sur le même siège, même sans réseau.
    siege: (g.rang - 1) * 22 + dejaVendus + 1,
    classe: "classique",
    prix: 8000,
    bagage,
    passager: { nom: `Voyageur ${compteur}`, telephone: null, pieceQuatreDerniers: null },
    paiement: {
      mode,
      recu: mode === "cash" ? du + 500 : du,
      rendu: mode === "cash" ? 500 : 0,
      reference: mode === "orange_money" ? `OM-${compteur}` : null,
    },
    codeBillet: String(1000 + compteur).padStart(4, "0"),
    sms: false,
  } as never);
  g.evenements.push(r.evenement.id);
  if (r.numero) g.numeros.push(r.numero);
}

async function synchroniserJusquaLaFin(g: Guichet): Promise<string[]> {
  const statuts: string[] = [];
  for (let essai = 0; essai < 10; essai++) {
    const r = await g.moteur.synchroniser();
    statuts.push(r.statut);
    if (r.statut === "termine" && r.restants === 0) return statuts;
  }
  throw new Error(`${g.appareilId} : file jamais vidée (${statuts.join(", ")})`);
}

const journalDe = (appareilId: string) =>
  lire<{ id: string; type: string; at: string; numeroPlage: number | null; ordreAppareil: number }>(
    `select id, type, at, "numeroPlage", "ordreAppareil" from journal_evenement
     where "appareilId" = '${appareilId}' and origine = 'appareil' order by "ordreAppareil"`,
  );

beforeAll(async () => {
  const debut = jourSimule();
  horloge = new HorlogeManuelle(debut);
  superviseur = await connecter("superviseur");
  const minuit = debut - 7.5 * HEURE;
  departs = [8, 11, 15].map((h, i) =>
    creerDepart({ heureDepart: new Date(minuit + h * HEURE), bus: i }),
  );
  const comptes = ["guichetier", "guichetier2", "guichetier3"] as const;
  for (const [i, nom] of comptes.entries()) {
    const rang = (i + 1) as 1 | 2 | 3;
    const session = await connecter(nom);
    const appareilId = `recette-hors-ligne-${rang}`;
    declarerAppareil(appareilId, rang);
    const base = {
      rang,
      session,
      appareilId,
      reseau: reseauManuel(true),
      dexie: indexedDbFactice(),
      pannes: { perdreReponse: 0 },
    };
    const moteur = await ouvrirMoteur(base);
    await moteur.enroler();
    guichets.push({
      ...base,
      moteur,
      evenements: [],
      numeros: [],
      ventesParDepart: departs.map(() => 0),
    });
  }
});

afterAll(async () => {
  for (const g of guichets) await g.moteur.arreter().catch(() => undefined);
});

describe("critère 2 : 4 h de vente hors ligne, puis synchronisation", () => {
  it("l'installation (clé publique, première prise de nouvelles) passe par la vraie API", async () => {
    for (const g of guichets) {
      const premier = await g.moteur.synchroniser();
      expect(premier).toMatchObject({ statut: "termine", envoyes: 0, restants: 0 });
    }
    const cles = lire<{ n: number }>(
      `select count(*)::int as n from appareil_sync where id like 'recette-hors-ligne-%' and "clePublique" is not null`,
    );
    expect(cles[0]?.n).toBe(3);
  });

  // Anomalie A7 (procès-verbal) : sur PostgreSQL, `ProvisionnementSync` est `ProvisionnementVide` : le serveur ne donne à
  // aucun téléphone sa part de sièges. Sans part, la vente d'un siège hors ligne est refusée par le moteur
  // (`PartInconnue`). Quand le serveur fournira les parts, ce test passera au rouge : retirer `.fails`.
  it.fails(
    "ANOMALIE A7 : après sa première synchronisation, un téléphone connaît sa part de sièges hors ligne",
    async () => {
      for (const g of guichets) {
        const parts = await g.moteur.siegesVendablesHorsLigne(departs[0]!.id);
        expect(parts, `part du guichet ${g.rang}`).not.toBeNull();
        expect(parts!.length).toBeGreaterThan(0);
      }
    },
  );

  it("quatre heures sans réseau : les téléphones vendent, rien ne part, l'indicateur dit HORS LIGNE", async () => {
    const alea = aleatoire(181);
    // Faute de parts fournies par le serveur (A7), l'application les poserait elle-même depuis le plan de sièges :
    // ici, un tiers du bus (22 sièges) par guichet et par départ, jamais deux téléphones sur le même siège.
    for (const g of guichets) {
      const part = Array.from({ length: 22 }, (_, i) => (g.rang - 1) * 22 + i + 1);
      await g.moteur.definirPartsHorsLigne(Object.fromEntries(departs.map((d) => [d.id, part])));
      g.reseau.definir(false);
    }
    for (let pas = 0; pas < 48; pas++) {
      horloge.avancer(5 * MINUTE);
      for (const g of guichets) if (alea() < 0.7) await vendreHorsLigne(g, alea);
      if (pas === 23) {
        // À mi-parcours, le téléphone du guichet 2 est tué puis relancé : sa file et son compteur survivent.
        const g2 = guichets[1]!;
        await g2.moteur.arreter();
        g2.moteur = await ouvrirMoteur(g2);
      }
    }
    for (const g of guichets) {
      expect(g.evenements.length, `ventes du guichet ${g.rang}`).toBeGreaterThan(15);
      expect(await g.moteur.etat()).toMatchObject({
        etat: "hors_ligne",
        libelle: "HORS LIGNE",
        evenementsEnAttente: g.evenements.length,
        bloque: false,
      });
      // Quatre heures de ventes sur la pendule simulée du téléphone. (Les « minutes hors ligne » de l'indicateur se
      // mesurent contre l'heure de dernière synchronisation donnée par le serveur, qui est l'heure réelle : avec une
      // pendule de téléphone simulée dans le passé, elles restent à 0. Voir les limites dans le procès-verbal.)
      const file = await g.moteur.lireFile();
      const duree = Date.parse(file.at(-1)!.evenement.at) - Date.parse(file[0]!.evenement.at);
      expect(duree).toBeGreaterThan(3.5 * HEURE);
      expect(journalDe(g.appareilId)).toHaveLength(0);
    }
  });

  it("le réseau revient : tout arrive une fois, dans l'ordre, sans trou ni doublon de numéro, même avec une réponse perdue", async () => {
    for (const g of guichets) g.reseau.definir(true);
    guichets[0]!.pannes.perdreReponse = 2;
    horloge.avancer(MINUTE);
    const vagues = await Promise.all(guichets.map(synchroniserJusquaLaFin));
    expect(vagues[0]).toContain("interrompu");

    let total = 0;
    for (const g of guichets) {
      const lignes = journalDe(g.appareilId);
      total += lignes.length;
      expect(
        lignes.map((l) => l.id),
        `journal du guichet ${g.rang}`,
      ).toEqual(g.evenements);
      expect(lignes.map((l) => l.ordreAppareil)).toEqual(lignes.map((_, i) => i + 1));
      const heures = lignes.map((l) => Date.parse(l.at));
      expect(heures).toEqual([...heures].sort((a, b) => a - b));
      // Numéros : toute la plage du guichet depuis son premier numéro.
      const plage = plageGuichet(g.rang);
      const numeros = lignes.map((l) => l.numeroPlage!);
      expect(numeros).toEqual(numeros.map((_, i) => plage.debut + i));
      expect(analyserSequences(numeros, plage)).toEqual({ trous: [], doublons: [], horsPlage: [] });
      // Côté téléphone : tout acquitté, plus rien en attente.
      const file = await g.moteur.lireFile();
      expect(file).toHaveLength(g.evenements.length);
      expect(file.every((e) => e.statut === "acquitte")).toBe(true);
      expect(await g.moteur.etat()).toMatchObject({
        etat: "sync",
        libelle: "SYNC",
        evenementsEnAttente: 0,
        evenementsRejetes: 0,
        horsLigneMinutes: 0,
      });
    }
    const [dansLeJournal] = lire<{ n: number }>(
      `select count(*)::int as n from journal_evenement where "appareilId" like 'recette-hors-ligne-%' and origine = 'appareil'`,
    );
    expect(dansLeJournal?.n).toBe(total);
    // Les numéros du serveur sont ceux que les téléphones ont imprimés.
    const [vus] = lire<{ n: number }>(
      `select count(distinct numero)::int as n from numero_vu where "appareilId" like 'recette-hors-ligne-%'`,
    );
    expect(vus?.n).toBe(total);
    // Un siège n'est vendu qu'une fois ; aucune alerte (trou, doublon, hors plage, conflit, horloge).
    const doubles = lire<{ n: number }>(
      `select count(*)::int as n from (select donnees->>'departId' d, donnees->>'siege' s from journal_evenement
        where "appareilId" like 'recette-hors-ligne-%' and origine = 'appareil' and type = 'billet.vendu'
        group by 1, 2 having count(*) > 1) t`,
    );
    expect(doubles[0]?.n).toBe(0);
    const alertes = await appeler<unknown[]>("GET", "/sync/alertes", { jeton: superviseur.jeton });
    expect(alertes.statut).toBe(200);
    expect(alertes.corps).toEqual([]);
  });

  it("resynchroniser (ou rejouer la file entière) ne change rien : le serveur répond « déjà reçu »", async () => {
    const avant = lire<{ n: number }>(
      `select count(*)::int as n from journal_evenement where origine = 'appareil'`,
    )[0]!.n;
    for (const g of guichets) {
      expect(await g.moteur.synchroniser()).toMatchObject({ envoyes: 0, restants: 0 });
    }
    // Un appareil qui renverrait toute sa file (base locale restaurée) : chaque ligne est acquittée « deja_recu ».
    const g = guichets[2]!;
    const file = await g.moteur.lireFile();
    const reponse = await appeler<{ resultats: Array<{ statut: string }> }>(
      "POST",
      "/sync/evenements",
      {
        jeton: g.session.jeton,
        corps: {
          appareilId: g.appareilId,
          envoyeA: versIsoDouala(horloge.maintenant()),
          evenements: file
            .slice(0, 20)
            .map((e) => ({ ordre: e.ordre, evenement: e.evenement, signature: e.signature! })),
        },
      },
    );
    expect(reponse.statut).toBe(200);
    expect(reponse.corps.resultats.every((r) => r.statut === "deja_recu")).toBe(true);
    const apres = lire<{ n: number }>(
      `select count(*)::int as n from journal_evenement where origine = 'appareil'`,
    )[0]!.n;
    expect(apres).toBe(avant);
  });

  // Anomalie A6 (procès-verbal) : la voie `/sync` journalise l'événement, applique le numéro et le siège, mais ne crée
  // pas le billet. Tant que ce n'est pas branché, ce test « doit échouer » ; le jour où la synchronisation crée les
  // billets, il passera au rouge et il faudra retirer `.fails`.
  it.fails(
    "ANOMALIE A6 : chaque vente synchronisée existe comme billet sur le serveur (caisse, rapport, quai)",
    () => {
      const total = guichets.reduce((somme, g) => somme + g.evenements.length, 0);
      const [n] = lire<{ n: number }>(
        `select count(*)::int as n from billet where "appareilId" like 'recette-hors-ligne-%'`,
      );
      expect(n?.n).toBe(total);
    },
  );

  it("la voie des billets : la même file, rejouée sur /agence/billets, donne les mêmes numéros, sans doublon, et se rejoue sans effet", async () => {
    // Anomalie A6 (voir le procès-verbal) : la voie `/sync` journalise mais ne crée pas les billets. Le seul chemin qui
    // crée de vrais billets (caisse, rapport, quai) est `/agence/billets` : on y rejoue la file de chaque téléphone.
    let total = 0;
    for (const g of guichets) {
      const client = clientHttp(g.session);
      const file = await g.moteur.lireFile();
      for (const entree of file) {
        const r = await client.executer(
          agence.ECRITURES.billetVendu.operation,
          entree.evenement as never,
        );
        expect(r.accuse.statut).toBe("accepte");
        total += 1;
      }
      const billets = lire<{ numero: string; sequence: number }>(
        `select numero, sequence from billet where "appareilId" = '${g.appareilId}' order by sequence`,
      );
      expect(billets.map((b) => b.numero)).toEqual(g.numeros);
      const plage = plageGuichet(g.rang);
      expect(billets.map((b) => b.sequence)).toEqual(billets.map((_, i) => plage.debut + i));
      // Rejouer : « deja_recu », et pas un billet de plus.
      for (const entree of file.slice(0, 5)) {
        const rejeu = await client.executer(
          agence.ECRITURES.billetVendu.operation,
          entree.evenement as never,
        );
        expect(rejeu.accuse.statut).toBe("deja_recu");
      }
    }
    const [n] = lire<{ n: number }>(
      `select count(*)::int as n from billet where "appareilId" like 'recette-hors-ligne-%'`,
    );
    expect(n?.n).toBe(total);
  });
});
