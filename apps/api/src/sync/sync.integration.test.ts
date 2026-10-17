import { agence as c } from "@afrimove/contrats";
import { analyserSequences, plageGuichet } from "@afrimove/domain";
import {
  AppareilBloque,
  ErreurTransport,
  MoteurSync,
  SchemaReponseLot,
  reseauManuel,
  type ReseauManuel,
  type TransportSync,
} from "@afrimove/sync";
import {
  CADENCE,
  DEBUT_TEST,
  HEURE,
  HorlogeManuelle,
  MINUTE,
  VENTE,
  donneesCadence,
  donneesVente,
  indexedDbFactice,
} from "@afrimove/sync/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerAppSyncTest, type AppSyncTest } from "./testing/app-sync-test";

/**
 * Intégration de bout en bout : de vrais moteurs d'appareil (IndexedDB factice, signature réelle)
 * parlent à la vraie API Nest (gardes, rôles, signature, rejeu) par un transport qui passe par
 * HTTP. Seule la base PostgreSQL est remplacée par la mémoire.
 */

const DEPARTS = ["depart-A", "depart-B", "depart-C"] as const;

interface Appareil {
  id: string;
  rang: number;
  auteurId: string;
  jeton: string;
  moteur: MoteurSync;
  reseau: ReseauManuel;
  /** Nombre de réponses à perdre : le serveur traite, la connexion tombe avant le retour. */
  pannes: { perdreReponse: number };
  dexie: ReturnType<typeof indexedDbFactice>;
  evenements: string[];
  numeros: string[];
}

let t: AppSyncTest;
let horloge: HorlogeManuelle;
let appareils: Appareil[];

beforeEach(async () => {
  t = await creerAppSyncTest({ debut: new Date(DEBUT_TEST) });
  horloge = new HorlogeManuelle(DEBUT_TEST);
  appareils = [];
});

afterEach(async () => {
  for (const a of appareils) await a.moteur.arreter().catch(() => undefined);
  await t.fermer();
});

/** Le temps passe en même temps sur les appareils et sur le serveur. */
function avancer(ms: number): void {
  horloge.avancer(ms);
  t.horloge.avancer(ms);
}

function transportVers(jeton: string, pannes: { perdreReponse: number }): TransportSync {
  return {
    async envoyer(lot) {
      const rep = await t
        .http()
        .post("/sync/evenements")
        .set("Authorization", `Bearer ${jeton}`)
        .send(lot);
      if (pannes.perdreReponse > 0) {
        pannes.perdreReponse -= 1;
        throw new ErreurTransport("reseau", "Connexion perdue avant la réponse");
      }
      if (rep.status === 401) throw new ErreurTransport("authentification", "Jeton refusé", 401);
      if (rep.status >= 500) throw new ErreurTransport("serveur", `HTTP ${rep.status}`, rep.status);
      if (rep.status >= 400) {
        throw new ErreurTransport(
          "refus",
          `HTTP ${rep.status}`,
          rep.status,
          (rep.body as { code?: string }).code,
        );
      }
      return SchemaReponseLot.parse(rep.body);
    },
    async enroler(appareilId, cle) {
      const rep = await t
        .http()
        .put(`/sync/appareils/${appareilId}/cle`)
        .set("Authorization", `Bearer ${jeton}`)
        .send({ cle });
      if (rep.status !== 204) throw new ErreurTransport("refus", `HTTP ${rep.status}`, rep.status);
    },
  };
}

function ouvrir(
  a: Pick<Appareil, "id" | "rang" | "auteurId" | "jeton" | "reseau" | "pannes" | "dexie">,
) {
  return MoteurSync.ouvrir({
    appareilId: a.id,
    auteurId: a.auteurId,
    agence: "ALP",
    gare: "DLA",
    plage: plageGuichet(a.rang),
    transport: transportVers(a.jeton, a.pannes),
    horloge,
    reseau: a.reseau,
    dexie: a.dexie,
    synchroAutomatique: false,
    tailleLot: 10,
  });
}

/** Un guichet : compte, fiche appareil côté serveur, base locale, clé enrôlée, première synchronisation. */
async function nouveauGuichet(rang: number, parts: Record<string, number[]>): Promise<Appareil> {
  const compte = await t.compte("guichetier");
  const id = `guichet-${rang}`;
  await t.declarer({ id, genre: "guichet", rang });
  t.provisionnement.parts.set(id, parts);
  const base = {
    id,
    rang,
    auteurId: compte.id,
    jeton: compte.jeton,
    reseau: reseauManuel(true),
    pannes: { perdreReponse: 0 },
    dexie: indexedDbFactice(),
  };
  const moteur = await ouvrir(base);
  const appareil: Appareil = { ...base, moteur, evenements: [], numeros: [] };
  appareils.push(appareil);
  await moteur.enroler();
  const premier = await moteur.synchroniser();
  expect(premier.statut).toBe("termine");
  return appareil;
}

/** Les 20 sièges du guichet `rang` sur chacun des trois départs. */
const partsDuRang = (rang: number) =>
  Object.fromEntries(
    DEPARTS.map((d) => [d, Array.from({ length: 20 }, (_, i) => (rang - 1) * 20 + i + 1)]),
  );

/** Un résultat pseudo-aléatoire, mais toujours le même d'une exécution à l'autre. */
function aleatoire(graine: number): () => number {
  let s = graine;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let numeroBillet = 0;

/** Une vente hors ligne du guichet : avec siège de sa part (le plus souvent), en cadence ou debout. */
async function vendre(a: Appareil, alea: () => number): Promise<void> {
  numeroBillet += 1;
  const billetId = `billet-${a.rang}-${numeroBillet}`;
  const tirage = alea();
  const depart = DEPARTS[Math.floor(alea() * DEPARTS.length)]!;
  const libres = (await a.moteur.siegesVendablesHorsLigne(depart)) ?? [];
  const siege = libres[0];
  let resultat;
  if (tirage < 0.15 || siege === undefined) {
    resultat = await a.moteur.enregistrer(VENTE, donneesVente(billetId, depart, null));
  } else if (tirage < 0.3) {
    resultat = await a.moteur.enregistrer(CADENCE, donneesCadence(billetId, depart, siege));
  } else {
    resultat = await a.moteur.enregistrer(VENTE, donneesVente(billetId, depart, siege));
  }
  a.evenements.push(resultat.evenement.id);
  if (resultat.numero) a.numeros.push(resultat.numero);
}

async function synchroniserJusquaLaFin(a: Appareil): Promise<void> {
  for (let essai = 0; essai < 8; essai++) {
    const r = await a.moteur.synchroniser();
    if (r.statut === "termine" && r.restants === 0) return;
  }
  throw new Error(`${a.id} : file jamais vidée`);
}

const lignesDe = (id: string) =>
  t.journal.lignes.filter((l) => l.origine === "appareil" && l.evenement.appareilId === id);

describe("4 h hors ligne sur 3 appareils, puis synchronisation", () => {
  it("aucun doublon, aucun trou, chaque appareil dans sa plage, rien de perdu", async () => {
    const alea = aleatoire(160);
    const guichets = [
      await nouveauGuichet(1, partsDuRang(1)),
      await nouveauGuichet(2, partsDuRang(2)),
      await nouveauGuichet(3, partsDuRang(3)),
    ];
    for (const g of guichets) {
      expect(await g.moteur.siegesVendablesHorsLigne("depart-A")).toHaveLength(20);
    }

    // Plus de réseau pour personne.
    for (const g of guichets) g.reseau.definir(false);

    // 4 h par pas de 5 minutes ; à mi-parcours le téléphone du guichet 2 est tué puis relancé.
    for (let pas = 0; pas < 48; pas++) {
      avancer(5 * MINUTE);
      for (const g of guichets) if (alea() < 0.7) await vendre(g, alea);
      if (pas === 23) {
        const g2 = guichets[1]!;
        await g2.moteur.arreter();
        g2.moteur = await ouvrir(g2);
      }
    }

    const ventesParAppareil = guichets.map((g) => g.evenements.length);
    expect(Math.min(...ventesParAppareil)).toBeGreaterThan(15);
    for (const g of guichets) {
      const etat = await g.moteur.etat();
      expect(etat).toMatchObject({
        etat: "hors_ligne",
        libelle: "HORS LIGNE",
        evenementsEnAttente: g.evenements.length,
        bloque: false,
        horsLigneMinutes: 240,
      });
      // rien n'est parti, le serveur ne sait encore rien
      expect(lignesDe(g.id)).toHaveLength(0);
    }

    // Le réseau revient pour tous en même temps ; le téléphone 1 perd une réponse en route.
    for (const g of guichets) g.reseau.definir(true);
    guichets[0]!.pannes.perdreReponse = 1;
    avancer(MINUTE);
    const premiereVague = await Promise.all(guichets.map((g) => g.moteur.synchroniser()));
    expect(premiereVague[0]!.statut).toBe("interrompu");
    expect(premiereVague[1]!.statut).toBe("termine");
    expect(premiereVague[2]!.statut).toBe("termine");
    await Promise.all(guichets.map(synchroniserJusquaLaFin));

    const total = ventesParAppareil.reduce((a, b) => a + b, 0);
    let dansLeJournal = 0;
    for (const g of guichets) {
      const lignes = lignesDe(g.id);
      dansLeJournal += lignes.length;

      // Tout est arrivé, une seule fois, dans l'ordre de la file de l'appareil.
      expect(lignes.map((l) => l.evenement.id)).toEqual(g.evenements);
      expect(new Set(lignes.map((l) => l.evenement.id)).size).toBe(lignes.length);
      expect(lignes.map((l) => l.ordreAppareil)).toEqual(lignes.map((_, i) => i + 1));
      const heures = lignes.map((l) => Date.parse(l.evenement.at));
      expect(heures).toEqual([...heures].sort((a, b) => a - b));

      // Numéros : toute la plage du guichet, du début, sans trou ni doublon ni sortie de plage.
      const plage = plageGuichet(g.rang);
      const numeros = lignes.map((l) => l.evenement.numeroPlage!);
      expect(numeros).toEqual(numeros.map((_, i) => plage.debut + i));
      expect(analyserSequences(numeros, plage)).toEqual({ trous: [], doublons: [], horsPlage: [] });
      expect(await t.numeros.trous(g.id, "270105", "billet", plage)).toEqual([]);
      expect(g.numeros).toHaveLength(numeros.length);
      expect(new Set(g.numeros).size).toBe(g.numeros.length);

      // Côté appareil : tout acquitté, plus rien en attente, ni refus ni conflit.
      const file = await g.moteur.lireFile();
      expect(file.every((e) => e.statut === "acquitte")).toBe(true);
      expect(file).toHaveLength(g.evenements.length);
      expect(await g.moteur.etat()).toMatchObject({
        etat: "sync",
        libelle: "SYNC",
        evenementsEnAttente: 0,
        evenementsRejetes: 0,
        conflitsNonVus: 0,
        horsLigneMinutes: 0,
      });
    }
    expect(dansLeJournal).toBe(total);
    expect(t.journal.lignes).toHaveLength(total);

    // Un siège n'est vendu qu'une fois : les parts ne se recoupent pas.
    const sieges = new Map<string, number>();
    for (const l of t.journal.lignes) {
      const d = l.evenement.donnees as { departId: string; siege: number | null };
      if (d.siege !== null)
        sieges.set(`${d.departId}#${d.siege}`, (sieges.get(`${d.departId}#${d.siege}`) ?? 0) + 1);
    }
    expect([...sieges.values()].every((n) => n === 1)).toBe(true);
    expect(sieges.size).toBeGreaterThan(30);

    // Pas de conflit, pas d'alerte : tout est propre.
    expect(t.alertes.lignes).toEqual([]);
    expect(t.journal.lignes.some((l) => l.evenement.type === "billet.a_replacer")).toBe(false);

    // Resynchroniser ne change rien.
    for (const g of guichets) {
      const r = await g.moteur.synchroniser();
      expect(r).toMatchObject({ envoyes: 0, restants: 0 });
    }
    expect(t.journal.lignes).toHaveLength(total);
  });

  it("une réponse perdue puis tout renvoyé : le serveur répond deja_recu, sans doublon", async () => {
    const g = await nouveauGuichet(2, partsDuRang(2));
    g.reseau.definir(false);
    const alea = aleatoire(7);
    for (let i = 0; i < 25; i++) {
      avancer(3 * MINUTE);
      await vendre(g, alea);
    }
    g.reseau.definir(true);
    g.pannes.perdreReponse = 3; // trois lots de 10 traités par le serveur dont la réponse se perd
    const echecs: string[] = [];
    for (let essai = 0; essai < 6; essai++) {
      const r = await g.moteur.synchroniser();
      echecs.push(r.statut);
      if (r.statut === "termine" && r.restants === 0) break;
    }
    expect(echecs.at(-1)).toBe("termine");
    expect(echecs.filter((s) => s === "interrompu").length).toBeGreaterThanOrEqual(1);
    const lignes = lignesDe(g.id);
    expect(lignes.map((l) => l.evenement.id)).toEqual(g.evenements);
    expect(t.alertes.lignes).toEqual([]);
  });

  it("un siège vendu hors ligne par deux appareils : le premier horodatage gagne, l'autre billet est à replacer", async () => {
    // Part mal découpée : le siège 5 est dans la part des deux guichets.
    const g1 = await nouveauGuichet(1, { "depart-A": [4, 5, 6] });
    const g2 = await nouveauGuichet(2, { "depart-A": [5, 7, 8] });
    g1.reseau.definir(false);
    g2.reseau.definir(false);

    avancer(10 * MINUTE);
    const tot = await g2.moteur.enregistrer(VENTE, donneesVente("billet-g2-siege5", "depart-A", 5));
    avancer(20 * MINUTE);
    const tard = await g1.moteur.enregistrer(
      VENTE,
      donneesVente("billet-g1-siege5", "depart-A", 5),
    );
    // chacun a vendu aussi un siège qui n'est qu'à lui
    await g1.moteur.enregistrer(VENTE, donneesVente("billet-g1-siege4", "depart-A", 4));
    await g2.moteur.enregistrer(VENTE, donneesVente("billet-g2-siege7", "depart-A", 7));

    // Le guichet 1 se synchronise le premier : sa vente tardive tient le siège, pour l'instant.
    g1.reseau.definir(true);
    avancer(5 * MINUTE);
    await synchroniserJusquaLaFin(g1);
    expect(await g1.moteur.conflits()).toEqual([]);
    // Puis le guichet 2 arrive avec une vente plus ancienne : il gagne, c'est g1 qui doit replacer.
    g2.reseau.definir(true);
    await synchroniserJusquaLaFin(g2);
    expect(await g2.moteur.conflits()).toEqual([]);
    expect(await g1.moteur.etat()).toMatchObject({ conflitsNonVus: 0 });

    // g1 le saura à sa prochaine synchronisation (même sans rien à envoyer).
    avancer(MINUTE);
    await g1.moteur.synchroniser();
    const conflits = await g1.moteur.conflits();
    expect(conflits).toHaveLength(1);
    expect(conflits[0]).toMatchObject({
      evenementId: tard.evenement.id,
      billetId: "billet-g1-siege5",
      departId: "depart-A",
      siege: 5,
      gagnantBilletId: "billet-g2-siege5",
      motif: "siege_deja_pris",
      vuA: null,
    });
    expect(await g1.moteur.etat()).toMatchObject({ conflitsNonVus: 1 });
    await g1.moteur.marquerConflitsVus();
    expect(await g1.moteur.etat()).toMatchObject({ conflitsNonVus: 0 });

    // Le journal garde les deux ventes et leurs numéros : rien ne disparaît, aucun trou.
    expect(t.journal.lignes.filter((l) => l.origine === "appareil")).toHaveLength(4);
    const g1Numeros = lignesDe(g1.id).map((l) => l.evenement.numeroPlage!);
    expect(analyserSequences(g1Numeros, plageGuichet(1))).toEqual({
      trous: [],
      doublons: [],
      horsPlage: [],
    });
    expect(tot.numero).not.toBe(tard.numero);

    // L'alerte dit qui doit replacer quel billet.
    const [alerte] = t.alertes.lignes.filter((a) => a.type === "siege_en_conflit");
    expect(alerte).toMatchObject({ appareilId: g1.id, auteurId: g1.auteurId });
    expect(alerte!.details).toMatchObject({
      siege: 5,
      aReplacer: { billetId: "billet-g1-siege5", auteurId: g1.auteurId },
      gagnant: { billetId: "billet-g2-siege5", auteurId: g2.auteurId },
    });
    expect(t.journal.lignes.filter((l) => l.evenement.type === "billet.a_replacer")).toHaveLength(
      1,
    );
  });

  it("au-delà de 12 h : ventes bloquées, synchronisation permise, déblocage par un superviseur", async () => {
    const g = await nouveauGuichet(1, partsDuRang(1));
    g.reseau.definir(false);
    const alea = aleatoire(12);
    for (let i = 0; i < 5; i++) {
      avancer(10 * MINUTE);
      await vendre(g, alea);
    }
    avancer(13 * HEURE);
    await expect(vendre(g, alea)).rejects.toBeInstanceOf(AppareilBloque);
    expect(await g.moteur.etat()).toMatchObject({ bloque: true, etat: "hors_ligne" });

    // Le réseau revient : la file part, mais l'appareil reste bloqué tant qu'un superviseur ne l'a pas libéré.
    g.reseau.definir(true);
    await synchroniserJusquaLaFin(g);
    expect(lignesDe(g.id)).toHaveLength(5);
    expect(await g.moteur.etat()).toMatchObject({ bloque: true, evenementsEnAttente: 0 });
    await expect(vendre(g, alea)).rejects.toBeInstanceOf(AppareilBloque);

    // Le superviseur, sur son propre appareil, débloque le guichet 1.
    const compteSup = await t.compte("superviseur");
    await t.declarer({ id: "superviseur-1", genre: "autre" });
    const supPannes = { perdreReponse: 0 };
    const superviseur = await MoteurSync.ouvrir({
      appareilId: "superviseur-1",
      auteurId: compteSup.id,
      agence: "ALP",
      gare: "DLA",
      plage: plageGuichet(3),
      transport: transportVers(compteSup.jeton, supPannes),
      horloge,
      reseau: reseauManuel(true),
      dexie: indexedDbFactice(),
      synchroAutomatique: false,
    });
    appareils.push({ ...g, id: "superviseur-1", moteur: superviseur });
    await superviseur.enroler();
    await superviseur.enregistrer(c.EVENEMENT_APPAREIL_DEBLOQUE, {
      appareilId: g.id,
      option: "debloquer_4h",
      validePar: { superviseurId: compteSup.id, methode: "pin", signature: "ab".repeat(16) },
    });
    expect((await superviseur.synchroniser()).statut).toBe("termine");
    expect(t.journal.lignes.some((l) => l.evenement.type === "appareil.debloque")).toBe(true);

    // À sa prochaine synchronisation, le guichet reçoit l'octroi et repart.
    await g.moteur.synchroniser();
    expect(await g.moteur.etat()).toMatchObject({ bloque: false });
    await vendre(g, alea);
    await synchroniserJusquaLaFin(g);
    expect(lignesDe(g.id)).toHaveLength(6);
    const numeros = lignesDe(g.id).map((l) => l.evenement.numeroPlage!);
    expect(analyserSequences(numeros, plageGuichet(1))).toEqual({
      trous: [],
      doublons: [],
      horsPlage: [],
    });
  });
});
