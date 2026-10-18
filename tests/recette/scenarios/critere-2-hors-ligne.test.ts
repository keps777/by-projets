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
 * Trois choses sont vérifiées :
 *   1. les parts de sièges : le serveur donne à chaque téléphone sa part du plan du bus (A7) ; un téléphone ne vend
 *      hors ligne que dans sa part, donc jamais le siège d'un autre ;
 *   2. le journal du serveur (la voie `/sync`) : tout est arrivé, une fois, dans l'ordre, sans trou de numéro ;
 *   3. les billets (A6) : la voie `/sync` crée les mêmes billets que `/agence/billets`, avec les numéros et les sièges
 *      imprimés sur les téléphones, une seule fois, et visibles au quai.
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
  /** Ce que le téléphone a vendu : le billet, son départ et son siège (pris dans la part donnée par le serveur). */
  ventes: { billetId: string; departId: string; siege: number }[];
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
  // Un départ au hasard où il reste un siège dans la part du guichet (la part, c'est le serveur qui l'a donnée) : le
  // siège est toujours le premier de ceux que le moteur autorise encore, jamais celui d'un autre téléphone.
  const premier = Math.floor(alea() * departs.length);
  let depart: DepartCree | undefined;
  let siege: number | undefined;
  for (let i = 0; i < departs.length && siege === undefined; i++) {
    depart = departs[(premier + i) % departs.length]!;
    siege = (await g.moteur.siegesVendablesHorsLigne(depart.id))?.[0];
  }
  if (!depart || siege === undefined) {
    throw new Error("La part de sièges du guichet est épuisée : le scénario doit vendre moins");
  }
  const mode = alea() < 0.7 ? "cash" : alea() < 0.5 ? "momo" : "orange_money";
  const bagage = alea() < 0.2 ? 500 : 0;
  const du = 8000 + bagage;
  const billetId = randomUUID();
  const r = await g.moteur.enregistrer(agence.ECRITURES.billetVendu.evenement, {
    billetId,
    departId: depart.id,
    siege,
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
  g.ventes.push({ billetId, departId: depart.id, siege });
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
      ventes: [],
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

  // A7 : le serveur donne à chaque téléphone sa part du plan de sièges de chaque départ ouvert de sa gare. Le bus compte
  // 70 places : 15 % (11) restent à la vente connectée, les 59 autres sont partagées entre les trois guichets en
  // blocs contigus (20, 20 et 19), sans recouvrement.
  it("A7 : après sa première synchronisation, chaque téléphone connaît sa part de sièges, et les trois parts ne se recouvrent pas", async () => {
    for (const d of departs) {
      const parts: number[][] = [];
      for (const g of guichets) {
        const part = await g.moteur.siegesVendablesHorsLigne(d.id);
        expect(part, `part du guichet ${g.rang}, départ ${d.numero}`).not.toBeNull();
        parts.push(part!);
      }
      expect(parts.map((p) => p.length)).toEqual([20, 20, 19]);
      const tous = parts.flat();
      expect(new Set(tous).size).toBe(tous.length);
      expect(Math.min(...tous)).toBe(1);
      expect(Math.max(...tous)).toBe(59);
      // Des blocs contigus, dans l'ordre des guichets.
      for (const part of parts) expect(part).toEqual(part.map((_, i) => part[0]! + i));
    }
  });

  it("un téléphone ne peut pas vendre hors ligne un siège qui n'est pas dans sa part", async () => {
    const g = guichets[0]!;
    g.reseau.definir(false);
    const siegeDUnAutre = (await guichets[1]!.moteur.siegesVendablesHorsLigne(departs[0]!.id))![0]!;
    const departId = departs[0]!.id;
    await expect(
      g.moteur.enregistrer(agence.ECRITURES.billetVendu.evenement, {
        billetId: randomUUID(),
        departId,
        siege: siegeDUnAutre,
        classe: "classique",
        prix: 8000,
        bagage: 0,
        passager: { nom: "Voyageur refusé", telephone: null, pieceQuatreDerniers: null },
        paiement: { mode: "cash", recu: 8000, rendu: 0, reference: null },
        codeBillet: "9999",
        sms: false,
      } as never),
    ).rejects.toMatchObject({ name: "SiegeHorsPart" });
    g.reseau.definir(true);
  });

  it("quatre heures sans réseau : les téléphones vendent, rien ne part, l'indicateur dit HORS LIGNE", async () => {
    const alea = aleatoire(181);
    for (const g of guichets) g.reseau.definir(false);
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

  // A6 : la voie `/sync` crée les billets, par la même création que `/agence/billets`.
  it("A6 : chaque vente synchronisée existe comme billet sur le serveur, avec son numéro et son siège, et se voit au quai", async () => {
    const total = guichets.reduce((somme, g) => somme + g.evenements.length, 0);
    const [n] = lire<{ n: number }>(
      `select count(*)::int as n from billet where "appareilId" like 'recette-hors-ligne-%'`,
    );
    expect(n?.n).toBe(total);

    for (const g of guichets) {
      const billets = lire<{
        id: string;
        numero: string;
        sequence: number;
        siege: number | null;
        departId: string;
        canal: string;
        etat: string;
        prix: number;
        rang: number | null;
      }>(
        `select b.id, b.numero, b.sequence, b.siege, b."departId", b.canal::text as canal, b.etat::text as etat,
                b.prix, gu.rang
         from billet b left join guichet gu on gu.id = b."guichetId"
         where b."appareilId" = '${g.appareilId}' order by b.sequence`,
      );
      // Les numéros imprimés sur le téléphone, dans l'ordre, sans trou.
      expect(billets.map((b) => b.numero)).toEqual(g.numeros);
      const plage = plageGuichet(g.rang);
      expect(billets.map((b) => b.sequence)).toEqual(billets.map((_, i) => plage.debut + i));
      // Le siège imprimé, le départ, le canal, le guichet de la caisse, le tarif.
      const attendus = new Map(g.ventes.map((v) => [v.billetId, v]));
      expect(new Set(billets.map((b) => b.id))).toEqual(new Set(attendus.keys()));
      for (const b of billets) {
        const vente = attendus.get(b.id)!;
        expect(b.siege, b.numero).toBe(vente.siege);
        expect(b.departId, b.numero).toBe(vente.departId);
        expect(b.canal).toBe("guichet");
        expect(b.etat).toBe("paye");
        expect(b.rang, `guichet du billet ${b.numero}`).toBe(g.rang);
        expect(b.prix).toBe(8000);
      }
    }

    // Les sièges sont tenus au plan des départs (un billet par siège), et le quai attend exactement les voyageurs vendus.
    const [occupes] = lire<{ n: number }>(
      `select count(*)::int as n from siege_depart s join billet b on b.id = s."billetId"
       where b."appareilId" like 'recette-hors-ligne-%'`,
    );
    expect(occupes?.n).toBe(total);
    const quai = clientHttp(guichets[0]!.session);
    for (const d of departs) {
      const vendus = guichets.flatMap((g) => g.ventes).filter((v) => v.departId === d.id).length;
      const ecran = await quai.executer(agence.OP_QUAI_EMBARQUEMENT, { departId: d.id });
      expect(ecran.embarquement.attendus, `voyageurs attendus au départ ${d.numero}`).toBe(vendus);
    }
  });

  it("la voie en ligne : la même file, envoyée à /agence/billets, répond « déjà reçu » pour chaque vente et ne crée aucun billet de plus", async () => {
    // Une vente rejouée par la synchronisation et la même vente envoyée par l'application connectée sont une seule
    // vente : la clé d'idempotence est l'identifiant de l'événement.
    const avant = lire<{ n: number }>(
      `select count(*)::int as n from billet where "appareilId" like 'recette-hors-ligne-%'`,
    )[0]!.n;
    let rejoues = 0;
    for (const g of guichets) {
      const client = clientHttp(g.session);
      const file = await g.moteur.lireFile();
      for (const entree of file) {
        const rejeu = await client.executer(
          agence.ECRITURES.billetVendu.operation,
          entree.evenement as never,
        );
        expect(rejeu.accuse.statut).toBe("deja_recu");
        // Le billet rendu est celui de la synchronisation : même numéro, même siège.
        expect(rejeu.billet.numero).toBe(g.numeros[file.indexOf(entree)]);
        rejoues += 1;
      }
    }
    expect(rejoues).toBeGreaterThan(45);
    const [apres] = lire<{ n: number }>(
      `select count(*)::int as n from billet where "appareilId" like 'recette-hors-ligne-%'`,
    );
    expect(apres?.n).toBe(avant);
  });
});
