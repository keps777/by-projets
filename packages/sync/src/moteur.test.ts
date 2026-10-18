import { agence as c } from "@afrimove/contrats";
import { analyserSequences, plageGuichet, versIsoDouala } from "@afrimove/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppareilBloque,
  DonneesInvalides,
  MoteurSync,
  PinBloque,
  PinInvalide,
  SuperviseurInconnu,
} from "./moteur";
import type { OptionsMoteur } from "./moteur";
import { SiegeDejaVendu, SiegeHorsPart, PartInconnue } from "./sieges";
import { reseauManuel } from "./reseau";
import type { ReseauManuel } from "./reseau";
import { creerVerificateurPin } from "./signature";
import {
  CADENCE,
  DEBUT_TEST,
  HEURE,
  HorlogeManuelle,
  MINUTE,
  ServeurFactice,
  VENTE,
  donneesCadence,
  donneesVente,
  indexedDbFactice,
} from "./testing";

interface Banc {
  horloge: HorlogeManuelle;
  reseau: ReseauManuel;
  serveur: ServeurFactice;
  dexie: ReturnType<typeof indexedDbFactice>;
  moteurs: MoteurSync[];
  ouvrir(surcharge?: Partial<OptionsMoteur>): Promise<MoteurSync>;
}

function creerBanc(): Banc {
  const horloge = new HorlogeManuelle(DEBUT_TEST);
  const reseau = reseauManuel(true);
  const serveur = new ServeurFactice({ horloge });
  const dexie = indexedDbFactice();
  const moteurs: MoteurSync[] = [];
  let compteurUuid = 0;
  return {
    horloge,
    reseau,
    serveur,
    dexie,
    moteurs,
    async ouvrir(surcharge = {}) {
      const moteur = await MoteurSync.ouvrir({
        appareilId: "appareil-g2",
        auteurId: "pers-joseph",
        agence: "ALP",
        gare: "DLA",
        plage: plageGuichet(2),
        transport: serveur,
        horloge,
        reseau,
        dexie,
        genererUuid: () => `00000000-0000-4000-8000-${String(++compteurUuid).padStart(12, "0")}`,
        synchroAutomatique: false,
        ...surcharge,
      });
      if ((await moteur.siegesVendablesHorsLigne("d1")) === null) {
        await moteur.definirPartsHorsLigne({ d1: Array.from({ length: 60 }, (_, i) => i + 1) });
      }
      moteurs.push(moteur);
      return moteur;
    },
  };
}

let banc: Banc;
beforeEach(() => {
  banc = creerBanc();
});
afterEach(async () => {
  for (const m of banc.moteurs) await m.arreter().catch(() => undefined);
});

/** Hors ligne pour de bon : réseau coupé, aucune synchronisation automatique. */
const horsLigne = () => banc.reseau.definir(false);

describe("enregistrer", () => {
  it("crée l'événement sur l'appareil : UUID, heure de Douala, numéro de la plage, signature", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    const { evenement, numero } = await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 7));
    expect(evenement).toMatchObject({
      type: "billet.vendu",
      appareilId: "appareil-g2",
      auteurId: "pers-joseph",
      numeroPlage: 1001,
      cible: { type: "billet", id: "b1" },
      at: versIsoDouala(DEBUT_TEST),
    });
    expect(evenement.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(numero).toBe("ALP-DLA-270105-1001");
    expect(moteur.numeroDe(evenement)).toBe(numero);
    const [entree] = await moteur.lireFile();
    expect(entree).toMatchObject({ id: evenement.id, statut: "en_attente", ordre: 1 });
    expect(entree!.signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it("valide les données avant d'écrire quoi que ce soit, sans consommer de numéro", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    await expect(
      moteur.enregistrer(VENTE, { ...donneesVente("b1", "d1", 7), prix: -5 }),
    ).rejects.toBeInstanceOf(DonneesInvalides);
    expect(await moteur.lireFile()).toHaveLength(0);
    const { evenement } = await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 7));
    expect(evenement.numeroPlage).toBe(1001);
  });

  it("numérote sans trou ni doublon, et reprend après un redémarrage", async () => {
    let moteur = await banc.ouvrir();
    horsLigne();
    for (let i = 0; i < 25; i++)
      await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    await moteur.arreter();
    moteur = await banc.ouvrir();
    horsLigne();
    for (let i = 25; i < 40; i++)
      await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    const numeros = (await moteur.lireFile()).map((e) => e.evenement.numeroPlage!);
    expect(numeros).toEqual(Array.from({ length: 40 }, (_, i) => 1001 + i));
    expect(analyserSequences(numeros, plageGuichet(2))).toEqual({
      trous: [],
      doublons: [],
      horsPlage: [],
    });
  });

  it("si l'état des compteurs est perdu, la file suffit à ne reprendre aucun numéro", async () => {
    let moteur = await banc.ouvrir();
    horsLigne();
    for (let i = 0; i < 5; i++) await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    await moteur.base.meta.delete("generateur");
    await moteur.arreter();
    moteur = await banc.ouvrir();
    horsLigne();
    const { evenement } = await moteur.enregistrer(VENTE, donneesVente("b5", "d1", 6));
    expect(evenement.numeroPlage).toBe(1006);
  });

  it("une écriture qui échoue ne consomme aucun numéro (une seule transaction)", async () => {
    // Un UUID déjà pris fait échouer l'ajout dans la file, après le calcul du numéro.
    const moteur = await banc.ouvrir({ genererUuid: () => "00000000-0000-4000-8000-0000000000aa" });
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await expect(moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2))).rejects.toBeDefined();
    await expect(moteur.enregistrer(VENTE, donneesVente("b3", "d1", 3))).rejects.toBeDefined();
    expect(await moteur.lireFile()).toHaveLength(1);
    expect(await moteur.billetsRestants()).toBe(999 - 1);
    await moteur.arreter();
    const apres = await banc.ouvrir();
    expect(await apres.billetsRestants()).toBe(999 - 1);
  });

  it("deux types numérotés (billet, cadence) partagent le compteur des billets ; les colis ont le leur", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    const a = await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    const b = await moteur.enregistrer(CADENCE, donneesCadence("b2", "d1", 2));
    const colis = await moteur.enregistrer(c.EVENEMENT_COLIS_ENREGISTRE, {
      colisId: "col1",
      departId: "d1",
      expediteur: { nom: "A", telephone: "+237677301145" },
      destinataire: { nom: "B", telephone: "+237691221008" },
      contenu: "sac",
      poidsKg: 3,
      valeurDeclaree: 0,
      assure: false,
      photoRef: "p1",
      paiement: { mode: "cash", montant: 1500 },
    });
    expect([a.evenement.numeroPlage, b.evenement.numeroPlage]).toEqual([1001, 1002]);
    expect(colis.evenement.numeroPlage).toBe(1001);
    expect(colis.numero).toBe("C-DLA-270105-1001");
  });

  it("un événement non numéroté porte numeroPlage null et ne consomme rien", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    const { evenement, numero } = await moteur.enregistrer(c.EVENEMENT_QUAI_SCANNE, {
      departId: "d1",
      qr: "QR1",
    });
    expect(evenement.numeroPlage).toBeNull();
    expect(numero).toBeNull();
    expect(
      (await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1))).evenement.numeroPlage,
    ).toBe(1001);
  });

  it("numéro de session de caisse", async () => {
    const moteur = await banc.ouvrir();
    expect(await moteur.prochaineSession(2)).toBe("K-DLA-270105-2-1");
    expect(await moteur.prochaineSession(2)).toBe("K-DLA-270105-2-2");
  });
});

describe("synchronisation", () => {
  it("envoie la file dans l'ordre, acquitte, et un second passage n'envoie rien de plus", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    for (let i = 0; i < 7; i++) await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    banc.reseau.definir(true);
    const bilan = await moteur.synchroniser();
    expect(bilan).toMatchObject({
      statut: "termine",
      envoyes: 7,
      acquittes: 7,
      rejetes: 0,
      restants: 0,
    });
    expect(banc.serveur.journal.map((e) => e.numeroPlage)).toEqual([
      1001, 1002, 1003, 1004, 1005, 1006, 1007,
    ]);
    expect(banc.serveur.lots[0]!.evenements.map((l) => l.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      (await moteur.lireFile()).every((e) => e.statut === "acquitte" && e.resultat === "accepte"),
    ).toBe(true);
    const encore = await moteur.synchroniser();
    expect(encore.envoyes).toBe(0);
    expect(banc.serveur.journal).toHaveLength(7);
  });

  it("envoie par lots et garde l'ordre", async () => {
    const moteur = await banc.ouvrir({ tailleLot: 3 });
    horsLigne();
    for (let i = 0; i < 8; i++) await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    banc.reseau.definir(true);
    await moteur.synchroniser();
    const lots = banc.serveur.lots.filter((l) => l.evenements.length > 0);
    expect(lots.map((l) => l.evenements.length)).toEqual([3, 3, 2]);
    expect(banc.serveur.journal.map((e) => e.numeroPlage)).toEqual(
      Array.from({ length: 8 }, (_, i) => 1001 + i),
    );
  });

  it("corps refusé pour sa taille (413) : lots réduits de moitié jusqu'à ce que ça passe, sans compter d'échec", async () => {
    const moteur = await banc.ouvrir({ tailleLot: 16 });
    horsLigne();
    for (let i = 0; i < 20; i++)
      await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    banc.serveur.tailleMax = 3;
    banc.reseau.definir(true);
    const r = await moteur.synchroniser();
    expect(r).toMatchObject({ statut: "termine", envoyes: 20, acquittes: 20, restants: 0 });
    expect(r.erreur).toBeUndefined();
    expect(
      banc.serveur.lots
        .filter((l) => l.evenements.length > 0)
        .every((l) => l.evenements.length <= 2),
    ).toBe(true);
    expect(banc.serveur.journal.map((e) => e.numeroPlage)).toEqual(
      Array.from({ length: 20 }, (_, i) => 1001 + i),
    );
    // la taille réduite est gardée pour les envois suivants
    banc.serveur.lots.length = 0;
    await moteur.enregistrer(VENTE, donneesVente("bx", "d1", 40));
    await moteur.enregistrer(VENTE, donneesVente("by", "d1", 41));
    await moteur.enregistrer(VENTE, donneesVente("bz", "d1", 42));
    await moteur.synchroniser();
    expect(banc.serveur.lots.map((l) => l.evenements.length)).toEqual([2, 1]);
  });

  it("une vente faite en ligne part tout de suite", async () => {
    const moteur = await banc.ouvrir({ synchroAutomatique: true });
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await vi_attendre(async () => banc.serveur.journal.length === 1);
  });

  it("le retour du réseau relance la synchronisation tout seul", async () => {
    const moteur = await banc.ouvrir({ synchroAutomatique: true });
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2));
    expect((await moteur.etat()).libelle).toBe("HORS LIGNE");
    banc.reseau.definir(true);
    await vi_attendre(async () => banc.serveur.journal.length === 2);
    expect((await moteur.etat()).etat).toBe("sync");
  });

  it("hors ligne : rien ne part, rien ne se perd", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    const bilan = await moteur.synchroniser();
    expect(bilan).toMatchObject({ statut: "hors_ligne", envoyes: 0, restants: 1 });
    expect(banc.serveur.appels).toBe(0);
  });

  describe("application tuée pendant l'envoi : aucune perte, aucun doublon", () => {
    it("la réponse se perd après traitement par le serveur : au redémarrage, deja_recu", async () => {
      let moteur = await banc.ouvrir();
      horsLigne();
      for (let i = 0; i < 5; i++)
        await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
      banc.reseau.definir(true);
      banc.serveur.perdreReponse = true;
      const bilan = await moteur.synchroniser();
      expect(bilan.statut).toBe("interrompu");
      expect(banc.serveur.journal).toHaveLength(5); // le serveur a tout reçu…
      expect((await moteur.lireFile({ statut: "en_attente" })).length).toBe(5); // …le client ne le sait pas
      await moteur.arreter();

      moteur = await banc.ouvrir(); // redémarrage
      const reprise = await moteur.synchroniser();
      expect(reprise).toMatchObject({ statut: "termine", acquittes: 5, restants: 0 });
      expect(banc.serveur.journal).toHaveLength(5); // pas de doublon
      const file = await moteur.lireFile();
      expect(file.every((e) => e.statut === "acquitte" && e.resultat === "deja_recu")).toBe(true);
    });

    it("la connexion tombe au milieu du lot : le reste part au prochain passage, dans l'ordre", async () => {
      const moteur = await banc.ouvrir();
      horsLigne();
      for (let i = 0; i < 6; i++)
        await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
      banc.reseau.definir(true);
      banc.serveur.panneApres = 2;
      const bilan = await moteur.synchroniser();
      expect(bilan.statut).toBe("interrompu");
      expect(banc.serveur.journal.map((e) => e.numeroPlage)).toEqual([1001, 1002]);
      await moteur.synchroniser();
      expect(banc.serveur.journal.map((e) => e.numeroPlage)).toEqual([
        1001, 1002, 1003, 1004, 1005, 1006,
      ]);
      expect(await moteur.lireFile({ statut: "en_attente" })).toHaveLength(0);
    });

    it("l'application est tuée avant même la signature : l'événement est durable et part signé", async () => {
      let moteur = await banc.ouvrir();
      horsLigne();
      const { evenement } = await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
      await moteur.base.file.update(1, { signature: null }); // tuée avant la signature
      await moteur.arreter();
      moteur = await banc.ouvrir();
      banc.reseau.definir(true);
      await moteur.synchroniser();
      expect(banc.serveur.lots.at(-1)!.evenements[0]!.signature).toMatch(/^[0-9a-f]{128}$/);
      expect(banc.serveur.journal[0]!.id).toBe(evenement.id);
    });
  });

  it("les pannes du serveur sont relancées avec un délai croissant ; l'authentification n'est pas relancée", async () => {
    const moteur = await banc.ouvrir({ relanceMs: 1000, synchroAutomatique: true });
    banc.serveur.horsService = true;
    banc.serveur.naturePanne = "serveur";
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await moteur.synchroniser(); // échec n° 1 → relance dans 1 000 ms
    const appels1 = banc.serveur.appels;
    banc.horloge.avancer(999);
    expect(banc.serveur.appels).toBe(appels1);
    banc.horloge.avancer(2);
    await vi_attendre(async () => banc.serveur.appels === appels1 + 1); // échec n° 2 → relance dans 2 000 ms
    await vi_attendre(
      async () =>
        moteur.instantane()!.derniereErreur !== null && banc.horloge.minuteriesEnAttente() > 0,
    );
    banc.horloge.avancer(1500);
    expect(banc.serveur.appels).toBe(appels1 + 1);
    banc.serveur.horsService = false;
    banc.horloge.avancer(600);
    await vi_attendre(async () => banc.serveur.journal.length === 1);
    expect((await moteur.etat()).derniereErreur).toBeNull();

    banc.serveur.horsService = true;
    banc.serveur.naturePanne = "authentification";
    await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2));
    await moteur.synchroniser();
    expect((await moteur.etat()).derniereErreur?.nature).toBe("authentification");
    const avant = banc.serveur.appels;
    banc.horloge.avancer(10 * HEURE);
    expect(banc.serveur.appels).toBe(avant);
  });

  it("un événement refusé par le serveur est marqué rejeté, signalé, jamais renvoyé ni purgé", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    const a = await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2));
    banc.serveur.rejeter.set(a.evenement.id, "donnees_invalides");
    banc.reseau.definir(true);
    const bilan = await moteur.synchroniser();
    expect(bilan).toMatchObject({ acquittes: 1, rejetes: 1, restants: 0 });
    const etat = await moteur.etat();
    expect(etat.evenementsRejetes).toBe(1);
    const avant = banc.serveur.appels;
    await moteur.synchroniser();
    expect(banc.serveur.lots.slice(avant).flatMap((l) => l.evenements)).toHaveLength(0);
    expect(await moteur.purger(Number.MAX_SAFE_INTEGER)).toBe(1); // seul l'acquitté
    expect((await moteur.lireFile())[0]).toMatchObject({
      statut: "rejete",
      erreur: { code: "donnees_invalides" },
    });
  });

  it("purger ne fait jamais reprendre un numéro", async () => {
    const moteur = await banc.ouvrir();
    for (let i = 0; i < 3; i++) await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    await moteur.synchroniser();
    expect(await moteur.purger(Number.MAX_SAFE_INTEGER)).toBe(3);
    expect(
      (await moteur.enregistrer(VENTE, donneesVente("b9", "d1", 9))).evenement.numeroPlage,
    ).toBe(1004);
  });

  it("reçoit une nouvelle plage du serveur, sauf si elle ne couvre pas les numéros déjà pris aujourd'hui", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    for (let i = 0; i < 3; i++) await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    banc.reseau.definir(true);
    banc.serveur.plage = { debut: 5001, fin: 5999 };
    await moteur.synchroniser();
    expect(await moteur.plage()).toEqual({ debut: 1001, fin: 1999 });
    expect((await moteur.etat()).derniereErreur?.code).toBe("plage_incompatible");

    banc.serveur.plage = { debut: 1001, fin: 2999 };
    await moteur.synchroniser();
    expect(await moteur.plage()).toEqual({ debut: 1001, fin: 2999 });
  });

  it("la plage épuisée refuse la vente suivante", async () => {
    const moteur = await banc.ouvrir({ plage: { debut: 1001, fin: 1002 } });
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2));
    await expect(moteur.enregistrer(VENTE, donneesVente("b3", "d1", 3))).rejects.toMatchObject({
      name: "PlageEpuisee",
    });
    expect(await moteur.lireFile()).toHaveLength(2);
    expect(await moteur.billetsRestants()).toBe(0);
  });
});

describe("indicateur SYNC / HORS LIGNE", () => {
  it("suit le réseau, la file et la dernière synchronisation", async () => {
    const moteur = await banc.ouvrir();
    const vus: string[] = [];
    moteur.abonner(() => vus.push(moteur.instantane()!.libelle));
    expect(moteur.instantane()).toMatchObject({
      etat: "sync",
      libelle: "SYNC",
      evenementsEnAttente: 0,
    });
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    expect(await moteur.etat()).toMatchObject({
      etat: "hors_ligne",
      libelle: "HORS LIGNE",
      evenementsEnAttente: 1,
      derniereSyncA: null,
    });
    banc.reseau.definir(true);
    await moteur.synchroniser();
    expect(await moteur.etat()).toMatchObject({
      etat: "sync",
      libelle: "SYNC",
      evenementsEnAttente: 0,
      derniereSyncA: versIsoDouala(DEBUT_TEST),
    });
    expect(vus).toContain("HORS LIGNE");
    expect(vus.at(-1)).toBe("SYNC");
  });

  it("serveur injoignable alors que le navigateur se croit en ligne : HORS LIGNE", async () => {
    const moteur = await banc.ouvrir();
    banc.serveur.horsService = true;
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    await moteur.synchroniser();
    expect(await moteur.etat()).toMatchObject({
      etat: "hors_ligne",
      enLigne: false,
      evenementsEnAttente: 1,
    });
  });

  it("n'avertit pas deux fois pour un état identique", async () => {
    const moteur = await banc.ouvrir();
    let appels = 0;
    moteur.abonner(() => appels++);
    await moteur.etat();
    await moteur.etat();
    expect(appels).toBe(0);
  });
});

describe("blocage après 12 h hors ligne", () => {
  async function bloquer(moteur: MoteurSync): Promise<void> {
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("avant", "d1", 1));
    banc.horloge.avancer(12 * HEURE + MINUTE);
  }

  it("à 12 h pile l'appareil vend encore ; une minute plus tard il est bloqué", async () => {
    const moteur = await banc.ouvrir();
    await moteur.synchroniser(); // dernière synchro = début du test
    horsLigne();
    banc.horloge.avancer(12 * HEURE);
    expect((await moteur.etat()).bloque).toBe(false);
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 1));
    banc.horloge.avancer(MINUTE);
    const etat = await moteur.etat();
    expect(etat).toMatchObject({ bloque: true, horsLigneMinutes: 12 * 60 + 1 });
    await expect(moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2))).rejects.toBeInstanceOf(
      AppareilBloque,
    );
  });

  it("un appareil neuf compte depuis son installation", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    banc.horloge.avancer(12 * HEURE + MINUTE);
    expect((await moteur.etat()).bloque).toBe(true);
  });

  it("le blocage s'affiche tout seul à l'heure dite (minuterie), sans action de l'agent", async () => {
    const moteur = await banc.ouvrir();
    await moteur.synchroniser();
    horsLigne();
    banc.horloge.avancer(11 * HEURE);
    expect(moteur.instantane()!.bloque).toBe(false);
    banc.horloge.avancer(HEURE + 10 * 1000);
    await vi_attendre(async () => moteur.instantane()!.bloque === true);
  });

  it("une synchronisation seule ne lève pas le blocage : il faut le PIN d'un superviseur", async () => {
    const moteur = await banc.ouvrir();
    await bloquer(moteur);
    expect((await moteur.etat()).bloque).toBe(true);
    banc.reseau.definir(true);
    const bilan = await moteur.synchroniser(); // la file part, mais l'appareil reste bloqué
    expect(bilan).toMatchObject({ statut: "termine", restants: 0 });
    expect(banc.serveur.journal).toHaveLength(1);
    expect(await moteur.etat()).toMatchObject({ bloque: true, horsLigneMinutes: 0 });
    await expect(moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2))).rejects.toBeInstanceOf(
      AppareilBloque,
    );
  });

  it("déblocage par le superviseur côté serveur (synchroniser) : la file part puis l'appareil repart", async () => {
    const moteur = await banc.ouvrir();
    await bloquer(moteur);
    banc.serveur.octroi = {
      option: "synchroniser",
      superviseurId: "pers-essomba",
      accordeA: versIsoDouala(banc.horloge.maintenant()),
      debloqueJusqua: null,
    };
    banc.reseau.definir(true);
    await moteur.synchroniser();
    expect((await moteur.etat()).bloque).toBe(false);
    await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2));
    // Le même octroi renvoyé ne rebloque pas et ne se réapplique pas.
    await moteur.synchroniser();
    expect((await moteur.etat()).bloque).toBe(false);
  });

  it("déblocage de 4 h reçu mais file pas vidée : on vend 4 h hors ligne, puis bloqué tant que la file n'est pas partie", async () => {
    const moteur = await banc.ouvrir({ tailleLot: 1 });
    horsLigne();
    for (let i = 0; i < 3; i++) await moteur.enregistrer(VENTE, donneesVente(`b${i}`, "d1", i + 1));
    banc.horloge.avancer(12 * HEURE + MINUTE);
    expect((await moteur.etat()).bloque).toBe(true);

    banc.reseau.definir(true);
    banc.serveur.octroi = {
      option: "debloquer_4h",
      superviseurId: "pers-essomba",
      accordeA: versIsoDouala(banc.horloge.maintenant()),
      debloqueJusqua: versIsoDouala(banc.horloge.maintenant() + 4 * HEURE),
    };
    banc.serveur.panneApres = 1; // 1er lot passe (octroi lu), le 2e coupe
    const bilan = await moteur.synchroniser();
    expect(bilan.statut).toBe("interrompu");
    expect(await moteur.etat()).toMatchObject({ bloque: false, evenementsEnAttente: 2 });
    horsLigne();
    await moteur.enregistrer(VENTE, donneesVente("b9", "d1", 9)); // 4 h de vente permises

    banc.horloge.avancer(4 * HEURE + MINUTE);
    expect((await moteur.etat()).bloque).toBe(true); // le délai de 4 h est passé

    banc.reseau.definir(true);
    banc.serveur.panneApres = null;
    await moteur.synchroniser(); // file vidée : le déblocage accordé est consommé
    expect((await moteur.etat()).bloque).toBe(false);
  });

  it("PIN superviseur sur place : bon PIN débloque 4 h, écrit l'événement signé, et tombe à la synchro", async () => {
    const moteur = await banc.ouvrir();
    await moteur.provisionnerVerificateurs([
      await creerVerificateurPin("pers-essomba", "482915", { iterations: 1000 }),
    ]);
    await bloquer(moteur);

    const { debloqueJusqua } = await moteur.debloquerAvecPin("pers-essomba", "482915");
    expect(debloqueJusqua).toBe(versIsoDouala(banc.horloge.maintenant() + 4 * HEURE));
    expect(await moteur.etat()).toMatchObject({ bloque: false, debloqueJusqua });
    await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2)); // vend de nouveau

    const file = await moteur.lireFile();
    const deblocage = file.find((e) => e.evenement.type === "appareil.debloque")!;
    expect(deblocage.evenement.donnees).toMatchObject({
      appareilId: "appareil-g2",
      option: "debloquer_4h",
      validePar: { superviseurId: "pers-essomba", methode: "pin" },
    });
    const brut = JSON.stringify(deblocage);
    expect(brut).not.toContain("482915");
    expect(c.lireEvenementAgence(deblocage.evenement)).toMatchObject({ ok: true });
    expect(deblocage.evenement.numeroPlage).toBeNull();

    // 4 h plus tard, hors ligne : bloqué de nouveau.
    banc.horloge.avancer(4 * HEURE + MINUTE);
    expect((await moteur.etat()).bloque).toBe(true);

    // De retour sur le réseau, la synchronisation complète clôt le blocage.
    banc.reseau.definir(true);
    await moteur.synchroniser();
    expect(await moteur.etat()).toMatchObject({ bloque: false, debloqueJusqua: null });
    expect(banc.serveur.journal.map((e) => e.type)).toContain("appareil.debloque");
  });

  it("mauvais PIN : 3 essais puis 15 minutes de blocage de la saisie", async () => {
    const moteur = await banc.ouvrir();
    await moteur.provisionnerVerificateurs([
      await creerVerificateurPin("pers-essomba", "482915", { iterations: 1000 }),
    ]);
    await bloquer(moteur);
    await expect(moteur.debloquerAvecPin("pers-essomba", "000000")).rejects.toMatchObject({
      essaisRestants: 2,
    });
    await expect(moteur.debloquerAvecPin("pers-essomba", "111111")).rejects.toBeInstanceOf(
      PinInvalide,
    );
    await expect(moteur.debloquerAvecPin("pers-essomba", "222222")).rejects.toBeInstanceOf(
      PinBloque,
    );
    // Même le bon PIN est refusé pendant le blocage.
    await expect(moteur.debloquerAvecPin("pers-essomba", "482915")).rejects.toBeInstanceOf(
      PinBloque,
    );
    expect((await moteur.etat()).bloque).toBe(true);
    banc.horloge.avancer(15 * MINUTE + 1000);
    await expect(moteur.debloquerAvecPin("pers-essomba", "482915")).resolves.toBeDefined();
    expect((await moteur.etat()).bloque).toBe(false);
  });

  it("superviseur inconnu de l'appareil", async () => {
    const moteur = await banc.ouvrir();
    await bloquer(moteur);
    await expect(moteur.debloquerAvecPin("inconnu", "482915")).rejects.toBeInstanceOf(
      SuperviseurInconnu,
    );
  });

  it("téléphone de secours : l'ancien appareil ne vend plus jamais, même avec un PIN", async () => {
    const moteur = await banc.ouvrir();
    await moteur.provisionnerVerificateurs([
      await creerVerificateurPin("pers-essomba", "482915", { iterations: 1000 }),
    ]);
    await bloquer(moteur);
    banc.reseau.definir(true);
    banc.serveur.octroi = {
      option: "telephone_secours",
      superviseurId: "pers-essomba",
      accordeA: versIsoDouala(banc.horloge.maintenant()),
      debloqueJusqua: null,
    };
    await moteur.synchroniser();
    expect(await moteur.etat()).toMatchObject({ bloque: true, retire: true });
    await expect(moteur.debloquerAvecPin("pers-essomba", "482915")).rejects.toBeInstanceOf(
      AppareilBloque,
    );
    await expect(moteur.enregistrer(VENTE, donneesVente("b2", "d1", 2))).rejects.toMatchObject({
      retire: true,
    });
  });

  it("le blocage survit à un redémarrage", async () => {
    let moteur = await banc.ouvrir();
    await bloquer(moteur);
    expect((await moteur.etat()).bloque).toBe(true);
    await moteur.arreter();
    moteur = await banc.ouvrir();
    expect((await moteur.etat()).bloque).toBe(true);
  });
});

describe("vente hors ligne : la part du plan de sièges", () => {
  it("refuse un siège hors de la part, un départ sans part connue, et un siège déjà vendu", async () => {
    const moteur = await banc.ouvrir();
    banc.serveur.parts = { d1: [11, 12, 13, 14] };
    await moteur.synchroniser();
    horsLigne();

    await expect(moteur.enregistrer(VENTE, donneesVente("b1", "d1", 3))).rejects.toBeInstanceOf(
      SiegeHorsPart,
    );
    await expect(
      moteur.enregistrer(VENTE, donneesVente("b1", "d-inconnu", 3)),
    ).rejects.toBeInstanceOf(PartInconnue);
    await moteur.enregistrer(VENTE, donneesVente("b1", "d1", 11));
    await expect(moteur.enregistrer(VENTE, donneesVente("b2", "d1", 11))).rejects.toBeInstanceOf(
      SiegeDejaVendu,
    );
    expect(await moteur.siegesVendablesHorsLigne("d1")).toEqual([12, 13, 14]);
    expect(await moteur.siegesVendablesHorsLigne("d-inconnu")).toBeNull();
    // Un siège libéré au quai redevient vendable.
    await moteur.enregistrer(c.EVENEMENT_QUAI_LIBERE, {
      departId: "d1",
      billetId: "b1",
      siege: 11,
      motif: "absent",
    });
    expect(await moteur.siegesVendablesHorsLigne("d1")).toEqual([11, 12, 13, 14]);
    // Une vente sans siège passe.
    await moteur.enregistrer(VENTE, donneesVente("b3", "d1", null));
    // La cadence et la vente en route suivent la même règle.
    await expect(
      moteur.enregistrer(CADENCE, donneesCadence("b4", "d1", 30)),
    ).rejects.toBeInstanceOf(SiegeHorsPart);
  });

  it("en ligne, le serveur arbitre : pas de contrôle de part", async () => {
    const moteur = await banc.ouvrir();
    await expect(moteur.enregistrer(VENTE, donneesVente("b1", "d1", 3))).resolves.toBeDefined();
  });

  it("la part reçue survit à un redémarrage", async () => {
    let moteur = await banc.ouvrir();
    banc.serveur.parts = { d1: [11, 12] };
    await moteur.synchroniser();
    await moteur.arreter();
    moteur = await banc.ouvrir();
    expect(await moteur.siegesVendablesHorsLigne("d1")).toEqual([11, 12]);
  });
});

describe("conflits « à replacer »", () => {
  it("le serveur signale un billet perdu : gardé localement, compté tant qu'il n'est pas vu", async () => {
    const moteur = await banc.ouvrir();
    banc.serveur.conflits = [
      {
        evenementId: "e1",
        billetId: "b1",
        departId: "d1",
        siege: 7,
        gagnantBilletId: "b-gagnant",
        detecteA: versIsoDouala(DEBUT_TEST),
        motif: "siege_deja_pris",
      },
    ];
    await moteur.synchroniser();
    await moteur.synchroniser(); // renvoyé : pas de doublon
    expect(await moteur.conflits()).toHaveLength(1);
    expect((await moteur.etat()).conflitsNonVus).toBe(1);
    await moteur.marquerConflitsVus();
    expect((await moteur.etat()).conflitsNonVus).toBe(0);
    expect((await moteur.conflits())[0]!.vuA).toBe(DEBUT_TEST);
  });
});

describe("mettreEnFile : un événement déjà créé par l'application", () => {
  /** L'événement tel que `AppareilAgence.creerEvenement` de l'application l'a fabriqué. */
  function creeParLApplication(id: string, siege: number | null, numeroPlage: number) {
    return {
      id,
      type: "billet.vendu",
      at: versIsoDouala(DEBUT_TEST),
      appareilId: "appareil-g2",
      auteurId: "pers-joseph",
      cible: { type: "billet", id: `b-${id}` },
      numeroPlage,
      donnees: donneesVente(`b-${id}`, "d1", siege),
    } as never;
  }
  const UUID_A = "00000000-0000-4000-8000-00000000aaa1";
  const UUID_B = "00000000-0000-4000-8000-00000000aaa2";

  it("garde l'événement, son identifiant et son numéro tels quels, signe, et l'envoie à la synchronisation", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    const { evenement, numero } = await moteur.mettreEnFile(
      VENTE,
      creeParLApplication(UUID_A, 7, 1005),
    );
    expect(evenement).toMatchObject({ id: UUID_A, numeroPlage: 1005 });
    expect(numero).toBe("ALP-DLA-270105-1005");
    const [entree] = await moteur.lireFile();
    expect(entree).toMatchObject({ id: UUID_A, statut: "en_attente" });
    expect(entree!.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(await moteur.etat()).toMatchObject({ etat: "hors_ligne", evenementsEnAttente: 1 });

    banc.reseau.definir(true);
    expect(await moteur.synchroniser()).toMatchObject({ statut: "termine", acquittes: 1 });
    expect(banc.serveur.journal.map((e) => e.id)).toEqual([UUID_A]);
  });

  it("est idempotent : le même événement mis deux fois en file n'est écrit qu'une fois", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    await moteur.mettreEnFile(VENTE, creeParLApplication(UUID_A, 7, 1005));
    await moteur.mettreEnFile(VENTE, creeParLApplication(UUID_A, 7, 1005));
    expect(await moteur.lireFile()).toHaveLength(1);
  });

  it("remonte le compteur du moteur au-dessus du numéro déjà imprimé : jamais de numéro repris", async () => {
    let moteur = await banc.ouvrir();
    horsLigne();
    await moteur.mettreEnFile(VENTE, creeParLApplication(UUID_A, 7, 1010));
    const suivant = await moteur.enregistrer(VENTE, donneesVente("b2", "d1", 8));
    expect(suivant.evenement.numeroPlage).toBe(1011);
    await moteur.arreter();
    moteur = await banc.ouvrir();
    const apres = await moteur.enregistrer(VENTE, donneesVente("b3", "d1", 9));
    expect(apres.evenement.numeroPlage).toBe(1012);
  });

  it("hors ligne, refuse un siège hors de la part ou déjà vendu, sans rien écrire", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    await expect(
      moteur.mettreEnFile(VENTE, creeParLApplication(UUID_A, 99, 1005)),
    ).rejects.toBeInstanceOf(SiegeHorsPart);
    await moteur.mettreEnFile(VENTE, creeParLApplication(UUID_A, 7, 1005));
    await expect(
      moteur.mettreEnFile(VENTE, creeParLApplication(UUID_B, 7, 1006)),
    ).rejects.toBeInstanceOf(SiegeDejaVendu);
    expect(await moteur.lireFile()).toHaveLength(1);
  });

  it("refuse un événement d'un autre appareil ou de données invalides", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    const autre = { ...(creeParLApplication(UUID_A, 7, 1005) as object), appareilId: "autre" };
    await expect(moteur.mettreEnFile(VENTE, autre as never)).rejects.toBeInstanceOf(
      DonneesInvalides,
    );
    const invalide = creeParLApplication(UUID_A, 7, 1005) as unknown as {
      donnees: { prix: number };
    };
    invalide.donnees.prix = -1;
    await expect(moteur.mettreEnFile(VENTE, invalide as never)).rejects.toBeInstanceOf(
      DonneesInvalides,
    );
    expect(await moteur.lireFile()).toHaveLength(0);
  });

  it("appareil bloqué : refusé comme enregistrer", async () => {
    const moteur = await banc.ouvrir();
    horsLigne();
    banc.horloge.avancer(13 * HEURE);
    await expect(
      moteur.mettreEnFile(VENTE, creeParLApplication(UUID_A, 7, 1005)),
    ).rejects.toBeInstanceOf(AppareilBloque);
  });
});

/* ------------------------------------------------------------------ utilitaires de test */

async function vi_attendre(condition: () => Promise<boolean>, essais = 200): Promise<void> {
  for (let i = 0; i < essais; i++) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Condition jamais remplie");
}
