import { agence as c } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "../socle/auth/roles";
import {
  AUTRE_COMPAGNIE,
  AUTRE_GARE,
  COMPAGNIE,
  GARE,
  GUICHET_2,
  DEBUT,
  GUICHET_3,
  creerAppAgenceTest,
  uuid,
  type AppAgenceTest,
} from "./testing/app-agence-test";
import { cloture, comptage, envoyer, lire, ouverture } from "./testing/outils";
import { MS_PAR_HEURE, MS_PAR_JOUR, versIsoDouala } from "./temps";

let t: AppAgenceTest;

beforeAll(async () => {
  t = await creerAppAgenceTest();
});
afterAll(() => t.fermer());

/** Un guichetier tout neuf, avec sa caisse ouverte au guichet 2 ou 3 selon `rang`. */
async function guichetierAvecCaisse(rang: 2 | 3 = 2, fond = 25_000) {
  const g = await t.compte("guichetier", { nom: `Agent ${rang}-${uuid().slice(-4)}` });
  const sessionId = uuid();
  const rep = await envoyer(
    t,
    "/agence/caisse/ouverture",
    g.jeton,
    ouverture(t, g.id, { sessionId, rang, guichetId: rang === 2 ? GUICHET_2 : GUICHET_3, fond }),
  );
  expect(rep.status, JSON.stringify(rep.body)).toBe(200);
  return { ...g, sessionId };
}

/**
 * Repart d'une caisse vide à 09:00 (Douala) : les tests partagent la même application, donc les
 * sessions, les mouvements et l'horloge sont remis à zéro entre deux tests.
 */
function viderSessions() {
  t.sessions.lignes.clear();
  t.mouvements.vider();
  t.horloge.avancer(DEBUT.getTime() - t.horloge.maintenant().getTime());
}

describe("accès aux routes de la caisse", () => {
  it("sans jeton : 401", async () => {
    expect((await t.http().get("/agence/caisse/session")).status).toBe(401);
    expect((await t.http().post("/agence/caisse/ouverture").send({})).status).toBe(401);
  });

  it("seul un guichetier écrit ; patron, comptable, AfriMove, voyageur et superviseur : 403", async () => {
    const roles: Role[] = [
      "patron",
      "comptable",
      "afrimove",
      "voyageur",
      "superviseur",
      "convoyeur",
    ];
    for (const role of roles) {
      const { jeton } = await t.compte(role, role === "patron" ? { gareId: null } : {});
      for (const chemin of ["ouverture", "comptage", "cloture"]) {
        const rep = await envoyer(t, `/agence/caisse/${chemin}`, jeton, {});
        expect(rep.status, `${role} ${chemin}`).toBe(403);
      }
    }
  });

  it("la lecture est ouverte au guichetier et au superviseur, pas au patron", async () => {
    const patron = await t.compte("patron", { gareId: null });
    expect((await lire(t, "/agence/caisse/session", patron.jeton)).status).toBe(403);
    const g = await t.compte("guichetier");
    const rep = await lire(t, "/agence/caisse/session", g.jeton);
    expect(rep.status).toBe(404);
    expect(rep.body.code).toBe("SESSION_INCONNUE");
  });
});

describe("ouverture de la caisse", () => {
  it("ouvre la session et répond comme le contrat (SchemaResultatCaisse)", async () => {
    viderSessions();
    const g = await t.compte("guichetier", { nom: "Joseph Mbarga" });
    const evt = ouverture(t, g.id, { fond: 25_000 });
    const rep = await envoyer(t, "/agence/caisse/ouverture", g.jeton, evt);
    expect(rep.status).toBe(200);
    const lu = c.SchemaResultatCaisse.parse(rep.body);
    expect(lu.accuse).toMatchObject({ evenementId: evt.id, statut: "accepte" });
    expect(lu.session).toMatchObject({
      sessionId: evt.donnees["sessionId"],
      numero: evt.donnees["numero"],
      etat: "ouverte",
      fondDeCaisse: 25_000,
      guichetRang: 2,
      cashAttendu: 25_000,
      agent: { id: g.id, nom: "Joseph Mbarga" },
    });
    expect(lu.session.comptage.coupures.map((x) => x.valeur)).toEqual([
      10_000, 5_000, 2_000, 1_000, 500,
    ]);
  });

  it("rejouer le même événement ne crée rien de plus et répond deja_recu", async () => {
    viderSessions();
    const g = await t.compte("guichetier");
    const evt = ouverture(t, g.id);
    const premier = await envoyer(t, "/agence/caisse/ouverture", g.jeton, evt);
    const lignesAvant = t.journalRepo.lignes.length;
    const second = await envoyer(t, "/agence/caisse/ouverture", g.jeton, evt);
    expect(second.status).toBe(200);
    expect(second.body.accuse.statut).toBe("deja_recu");
    expect(second.body.accuse.recuA).toBe(premier.body.accuse.recuA);
    expect(second.body.session).toEqual(premier.body.session);
    expect(t.sessions.lignes.size).toBe(1);
    expect(t.journalRepo.lignes.length).toBe(lignesAvant);
  });

  it("une seule caisse ouverte par agent, et par guichet", async () => {
    viderSessions();
    const g = await t.compte("guichetier");
    const premiere = ouverture(t, g.id);
    expect((await envoyer(t, "/agence/caisse/ouverture", g.jeton, premiere)).status).toBe(200);

    const doublon = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, { rang: 3, guichetId: GUICHET_3 }),
    );
    expect(doublon.status).toBe(409);
    expect(doublon.body.code).toBe("SESSION_DEJA_OUVERTE");
    expect(doublon.body.details.sessionId).toBe(premiere.donnees["sessionId"]);

    const autre = await t.compte("guichetier");
    const occupe = await envoyer(
      t,
      "/agence/caisse/ouverture",
      autre.jeton,
      ouverture(t, autre.id, { ordre: 2 }),
    );
    expect(occupe.status).toBe(409);
    expect(occupe.body.code).toBe("GUICHET_OCCUPE");
  });

  it("refuse le guichet d'une autre gare, un guichet inconnu, un numéro incohérent, l'auteur d'un autre", async () => {
    viderSessions();
    t.guichets.declarer({
      id: "guichet-ailleurs",
      rang: 1,
      gareId: AUTRE_GARE,
      gareCode: "YDE",
      compagnieId: COMPAGNIE,
    });
    const g = await t.compte("guichetier");
    const ailleurs = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, { guichetId: "guichet-ailleurs", rang: 1 }),
    );
    expect(ailleurs.status).toBe(403);
    expect(ailleurs.body.code).toBe("GUICHET_AUTRE_GARE");

    const inconnu = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, { guichetId: "nulle-part" }),
    );
    expect(inconnu.status).toBe(404);

    for (const numero of [
      "K-DLA-270101-2-1",
      "K-YDE-261102-2-1",
      "K-DLA-261102-3-1",
      "n'importe quoi",
    ]) {
      const rep = await envoyer(
        t,
        "/agence/caisse/ouverture",
        g.jeton,
        ouverture(t, g.id, { numero }),
      );
      expect(rep.status, numero).toBe(422);
      expect(rep.body.code).toBe("NUMERO_SESSION_INCOHERENT");
    }

    const autre = await t.compte("guichetier");
    const usurpation = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, autre.id),
    );
    expect(usurpation.status).toBe(403);
    expect(usurpation.body.code).toBe("AUTEUR_INCOHERENT");
    expect(t.sessions.lignes.size).toBe(0);
  });

  it("un événement mal formé est refusé en 422 avec la liste des problèmes", async () => {
    const g = await t.compte("guichetier");
    const evt = ouverture(t, g.id);
    const abime = {
      ...evt,
      id: "pas-un-uuid",
      at: "2026-11-02 09:00",
      donnees: { ...evt.donnees, fondDeCaisse: -5 },
    };
    const rep = await envoyer(t, "/agence/caisse/ouverture", g.jeton, abime);
    expect(rep.status).toBe(422);
    expect(rep.body.code).toBe("EVENEMENT_INVALIDE");
    const chemins = (rep.body.details as { chemin: string }[]).map((p) => p.chemin);
    expect(chemins).toEqual(expect.arrayContaining(["id", "at", "donnees.fondDeCaisse"]));
    // Un type qui n'est pas celui de la route est refusé aussi.
    const autreType = await envoyer(t, "/agence/caisse/ouverture", g.jeton, {
      ...evt,
      type: "caisse.comptee",
    });
    expect(autreType.status).toBe(422);
  });
});

describe("comptage", () => {
  it("enregistre les coupures, le total est celui des coupures et des pièces", async () => {
    viderSessions();
    const g = await guichetierAvecCaisse();
    const rep = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 10_000: 2, 5_000: 1, 1_000: 3 }, 750, { at: t.iso() }),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatCaisse.parse(rep.body);
    expect(lu.session.comptage.total).toBe(28_750);
    expect(lu.session.comptage.pieces).toBe(750);
    expect(lu.session.comptage.coupures).toEqual([
      { valeur: 10_000, nombre: 2 },
      { valeur: 5_000, nombre: 1 },
      { valeur: 2_000, nombre: 0 },
      { valeur: 1_000, nombre: 3 },
      { valeur: 500, nombre: 0 },
    ]);
    // Le comptage est relu par la lecture de la session.
    const session = c.SchemaCaisseSession.parse(
      (await lire(t, "/agence/caisse/session", g.jeton)).body,
    );
    expect(session.comptage.total).toBe(28_750);
  });

  it("refuse un total faux, une coupure inconnue, une coupure répétée", async () => {
    viderSessions();
    const g = await guichetierAvecCaisse();
    const faux = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 10_000: 2 }, 0, { at: t.iso(), total: 20_001 }),
    );
    expect(faux.status).toBe(422);
    expect(faux.body.code).toBe("COMPTAGE");
    expect(faux.body.details).toEqual({ totalCalcule: 20_000, totalRecu: 20_001 });

    const inconnue = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 20_000: 1 }, 0, { at: t.iso() }),
    );
    expect(inconnue.status).toBe(422);

    const repetee = await envoyer(t, "/agence/caisse/comptage", g.jeton, {
      ...comptage(g.id, g.sessionId, { 10_000: 1 }, 0, { at: t.iso() }),
      donnees: {
        sessionId: g.sessionId,
        coupures: [
          { valeur: 10_000, nombre: 1 },
          { valeur: 10_000, nombre: 1 },
        ],
        pieces: 0,
        total: 20_000,
      },
    });
    expect(repetee.status).toBe(422);
  });

  it("ne compte pas la caisse d'un autre agent ni une caisse déjà clôturée", async () => {
    viderSessions();
    const g = await guichetierAvecCaisse();
    const voleur = await t.compte("guichetier");
    const rep = await envoyer(
      t,
      "/agence/caisse/comptage",
      voleur.jeton,
      comptage(voleur.id, g.sessionId, { 500: 1 }, 0, { at: t.iso() }),
    );
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("SESSION_D_UN_AUTRE");

    const inconnue = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, "session-fantome", { 500: 1 }, 0, { at: t.iso() }),
    );
    expect(inconnue.status).toBe(404);

    expect(
      (
        await envoyer(
          t,
          "/agence/caisse/cloture",
          g.jeton,
          cloture(g.id, g.sessionId, 25_000, 25_000, { at: t.iso() }),
        )
      ).status,
    ).toBe(200);
    const apres = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 500: 1 }, 0, { at: t.iso() }),
    );
    expect(apres.status).toBe(409);
    expect(apres.body.code).toBe("SESSION_NON_OUVERTE");
  });
});

describe("cash attendu et écart, au franc près", () => {
  /** Une session avec des ventes : 3 billets cash, 1 colis cash, 2 billets MoMo. */
  async function sessionAvecVentes() {
    viderSessions();
    const g = await guichetierAvecCaisse(2, 25_000);
    const guichetId = GUICHET_2;
    const ouverteA = t.horloge.maintenant().getTime();
    const apres = (ms: number) => versIsoDouala(ouverteA + ms);
    for (const [i, montant] of [4_000, 4_000, 7_500].entries()) {
      t.mouvements.venteCash({ agentId: g.id, guichetId, montant, at: apres((i + 1) * 60_000) });
    }
    t.mouvements.colisEnCash({ agentId: g.id, guichetId, montant: 2_500, at: apres(5 * 60_000) });
    t.mouvements.venteMomo({ agentId: g.id, guichetId, montant: 4_000, at: apres(6 * 60_000) });
    t.mouvements.venteMomo({ agentId: g.id, guichetId, montant: 4_000, at: apres(7 * 60_000) });
    // Les ventes d'un autre agent ou d'avant l'ouverture n'entrent pas dans cette caisse.
    t.mouvements.venteCash({ agentId: "autre", guichetId, montant: 99_000, at: apres(60_000) });
    t.mouvements.venteCash({ agentId: g.id, guichetId, montant: 88_000, at: apres(-3_600_000) });
    // Dix minutes plus tard : toutes ces ventes sont passées.
    t.horloge.avancer(10 * 60_000);
    return g;
  }

  it("fond + billets cash + colis cash − annulations ; le MoMo n'entre pas dans la caisse", async () => {
    const g = await sessionAvecVentes();
    const s = c.SchemaCaisseSession.parse((await lire(t, "/agence/caisse/session", g.jeton)).body);
    expect(s.decompte).toEqual({
      billetsCash: { nombre: 3, montant: 15_500 },
      colisCash: { nombre: 1, montant: 2_500 },
      annulationsValidees: { nombre: 0, montant: 0 },
      momo: { ventes: 2, montant: 8_000 },
    });
    expect(s.cashAttendu).toBe(25_000 + 15_500 + 2_500);
    await t.mouvements.enregistrerAnnulation({
      demandeId: "d1",
      sessionId: g.sessionId,
      montant: 4_000,
      at: t.iso(),
    });
    const apres = c.SchemaCaisseSession.parse(
      (await lire(t, "/agence/caisse/session", g.jeton)).body,
    );
    expect(apres.decompte.annulationsValidees).toEqual({ nombre: 1, montant: 4_000 });
    expect(apres.cashAttendu).toBe(39_000);
  });

  it("l'écart est compté − attendu au franc près, et sa couleur suit la tolérance (1 000 F)", async () => {
    const g = await sessionAvecVentes();
    const attendu = 43_000;
    const cas: [number, number, string][] = [
      [attendu, 0, "exact"],
      [attendu - 1, -1, "dans_tolerance"],
      [attendu + 1, 1, "dans_tolerance"],
      [attendu - 1_000, -1_000, "dans_tolerance"],
      [attendu - 1_001, -1_001, "hors_tolerance"],
      [attendu + 1_001, 1_001, "hors_tolerance"],
    ];
    for (const [compte, ecart, statut] of cas) {
      // Le total tapé est libre : on le place dans les pièces.
      const rep = await envoyer(
        t,
        "/agence/caisse/comptage",
        g.jeton,
        comptage(g.id, g.sessionId, {}, compte, { at: t.iso() }),
      );
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const s = c.SchemaCaisseSession.parse(rep.body.session);
      expect(s.ecart, `compté ${compte}`).toMatchObject({
        montant: ecart,
        statut,
        tolerance: 1_000,
      });
    }
  });

  it("la clôture fige le cash attendu du serveur ; une vente tardive ne change plus l'écart", async () => {
    const g = await sessionAvecVentes();
    await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 10_000: 4, 2_000: 1 }, 0, { at: t.iso() }),
    );
    const evt = cloture(g.id, g.sessionId, 42_000, 43_000, { at: t.iso(20 * 60_000) });
    const rep = await envoyer(t, "/agence/caisse/cloture", g.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatCaisse.parse(rep.body);
    expect(lu.session).toMatchObject({ etat: "cloturee", cashAttendu: 43_000 });
    expect(lu.session.ecart).toMatchObject({ montant: -1_000, statut: "dans_tolerance" });
    expect(lu.session.periode.fin).toBe(evt.at);

    t.mouvements.venteCash({
      agentId: g.id,
      guichetId: GUICHET_2,
      montant: 5_000,
      at: t.iso(15 * 60_000),
    });
    const relu = c.SchemaCaisseSession.parse(
      (await lire(t, "/agence/caisse/session", g.jeton)).body,
    );
    expect(relu.cashAttendu).toBe(43_000);
    expect(relu.ecart.montant).toBe(-1_000);
  });

  it("le serveur recalcule le cash attendu : la valeur de l'appareil n'est qu'un témoin tracé", async () => {
    const g = await sessionAvecVentes();
    // L'appareil croit qu'il attend 40 000 (une vente pas encore synchronisée) et a compté 43 000.
    const evt = cloture(g.id, g.sessionId, 43_000, 40_000, { at: t.iso(20 * 60_000) });
    const rep = await envoyer(t, "/agence/caisse/cloture", g.jeton, evt);
    expect(rep.status).toBe(200);
    expect(rep.body.session.cashAttendu).toBe(43_000);
    expect(rep.body.session.ecart.montant).toBe(0);
    const stockee = t.sessions.lignes.get(g.sessionId)!;
    expect(stockee.cloture).toMatchObject({
      cashAttendu: 43_000,
      ecart: 0,
      divergenceAppareil: -3_000,
    });
  });

  it("refuse un écart incohérent, un cash différent du comptage, la clôture automatique par un appareil", async () => {
    const g = await sessionAvecVentes();
    const incoherent = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, g.sessionId, 43_000, 43_000, { at: t.iso(), ecart: 5 }),
    );
    expect(incoherent.status).toBe(422);
    expect(incoherent.body.code).toBe("ECART_INCOHERENT");

    await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 10_000: 4 }, 0, { at: t.iso() }),
    );
    const autre = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, g.sessionId, 41_000, 43_000, { at: t.iso() }),
    );
    expect(autre.status).toBe(422);
    expect(autre.body.code).toBe("COMPTAGE_DIFFERENT");

    const auto = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, g.sessionId, 40_000, 43_000, { at: t.iso(), auto: true }),
    );
    expect(auto.status).toBe(422);
    expect(auto.body.code).toBe("CLOTURE_AUTO_RESERVEE");
    expect(t.sessions.lignes.get(g.sessionId)!.etat).toBe("ouverte");
  });

  it("on ne clôture qu'une fois ; rejouer le même événement répond deja_recu", async () => {
    const g = await sessionAvecVentes();
    const evt = cloture(g.id, g.sessionId, 43_000, 43_000, { at: t.iso() });
    const premier = await envoyer(t, "/agence/caisse/cloture", g.jeton, evt);
    expect(premier.status).toBe(200);
    const rejeu = await envoyer(t, "/agence/caisse/cloture", g.jeton, evt);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(rejeu.body.session).toEqual(premier.body.session);

    const seconde = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, g.sessionId, 43_000, 43_000, { at: t.iso() }),
    );
    expect(seconde.status).toBe(409);
    expect(seconde.body.code).toBe("SESSION_NON_OUVERTE");
  });

  it("deux requêtes simultanées du même événement : une seule est traitée", async () => {
    const g = await sessionAvecVentes();
    const evt = cloture(g.id, g.sessionId, 43_000, 43_000, { at: t.iso() });
    const reponses = await Promise.all([
      envoyer(t, "/agence/caisse/cloture", g.jeton, evt),
      envoyer(t, "/agence/caisse/cloture", g.jeton, evt),
    ]);
    const statuts = reponses.map((r) => r.status).sort();
    // L'autre reçoit soit le résultat rejoué (200), soit 425 « en cours » que le client relance.
    expect(statuts[0]).toBe(200);
    expect([200, 425]).toContain(statuts[1]);
    expect(t.sessions.lignes.get(g.sessionId)!.etat).toBe("cloturee");
    expect(t.journalRepo.lignes.filter((l) => l.evenementId === evt.id)).toHaveLength(1);
  });
});

describe("historique de l'agent : hier et la semaine", () => {
  it("hier = l'écart de sa caisse d'hier ; la semaine = la somme des 7 derniers jours", async () => {
    viderSessions();
    const g = await t.compte("guichetier");
    const jour = (n: number) => new Date(t.horloge.maintenant().getTime() - n * MS_PAR_JOUR);
    const journees: [number, number][] = [
      [1, -500], // hier
      [2, 1_500],
      [5, -2_000],
      [9, -7_000], // trop ancien pour la semaine
    ];
    for (const [i, [n, ecart]] of journees.entries()) {
      const at = versIsoDouala(jour(n));
      t.sessions.lignes.set(`h${i}`, {
        id: `h${i}`,
        numero: `K-DLA-hist-${i}`,
        guichetId: GUICHET_3,
        guichetRang: 3,
        gareId: GARE,
        compagnieId: COMPAGNIE,
        agentId: g.id,
        fondDeCaisse: 0,
        tolerance: 1_000,
        ouverteA: at,
        reouverteA: null,
        etat: "validee",
        comptage: null,
        cloture: {
          at,
          auto: false,
          cashCompte: 0,
          cashAttendu: -ecart,
          ecart,
          divergenceAppareil: 0,
          comptageAbsent: false,
          decompte: {
            billetsCash: { nombre: 0, montant: 0 },
            colisCash: { nombre: 0, montant: 0 },
            annulationsValidees: { nombre: 0, montant: 0 },
            momo: { ventes: 0, montant: 0 },
          },
          evenementId: uuid(),
        },
        validation: null,
        refus: [],
        evenementOuvertureId: uuid(),
      });
    }
    const evt = ouverture(t, g.id, { rang: 2 });
    const rep = await envoyer(t, "/agence/caisse/ouverture", g.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(rep.body.session.ecart).toMatchObject({ hier: -500, semaine: -500 + 1_500 - 2_000 });
  });
});

describe("clôture automatique à minuit", () => {
  /** Avance l'horloge de test de `h` heures. */
  const avancer = (h: number) => t.horloge.avancer(h * MS_PAR_HEURE);

  it("ferme à minuit (Douala) les caisses encore ouvertes, avec le dernier comptage, et alerte le patron", async () => {
    viderSessions();
    t.alertes.lignes.length = 0;
    const g = await guichetierAvecCaisse(2, 25_000);
    t.mouvements.venteCash({
      agentId: g.id,
      guichetId: GUICHET_2,
      montant: 6_000,
      at: t.iso(60_000),
    });
    await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 10_000: 3 }, 0, { at: t.iso() }),
    );

    // 09:00 → 23:59 : minuit n'est pas passé.
    avancer(14.9);
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(0);
    expect(t.sessions.lignes.get(g.sessionId)!.etat).toBe("ouverte");

    // 00:06 le lendemain.
    avancer(0.2);
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(1);
    const s = t.sessions.lignes.get(g.sessionId)!;
    expect(s.etat).toBe("cloturee");
    expect(s.cloture).toMatchObject({
      auto: true,
      at: "2026-11-03T00:00:00.000+01:00",
      cashCompte: 30_000,
      cashAttendu: 31_000,
      ecart: -1_000,
      comptageAbsent: false,
    });
    expect(t.alertes.lignes).toHaveLength(1);
    expect(t.alertes.lignes[0]).toMatchObject({
      type: "cloture_automatique",
      compagnieId: COMPAGNIE,
      gareId: GARE,
    });
    expect(t.alertes.lignes[0]!.message).toContain("guichet 2");

    // Rejouable : rien de plus la deuxième fois.
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(0);
    expect(t.alertes.lignes).toHaveLength(1);
    const entree = t.journalRepo.lignes.find(
      (l) => l.type === "caisse.cloturee" && l.auteur.id === "systeme",
    );
    expect(entree?.resume).toContain("Clôture automatique de minuit");
    expect(entree?.auteur).toEqual({ id: "systeme", nom: "Système" });
  });

  it("sans aucun comptage, le cash compté est 0 et la clôture le dit", async () => {
    viderSessions();
    t.alertes.lignes.length = 0;
    t.horloge.avancer(0);
    const g = await guichetierAvecCaisse(3, 10_000);
    avancer(16);
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(1);
    const s = t.sessions.lignes.get(g.sessionId)!;
    expect(s.cloture).toMatchObject({
      cashCompte: 0,
      cashAttendu: 10_000,
      ecart: -10_000,
      comptageAbsent: true,
    });
    const vue = c.SchemaCaisseSession.parse(
      (await lire(t, `/agence/caisse/session?sessionId=${g.sessionId}`, g.jeton)).body,
    );
    expect(vue.etat).toBe("cloturee");
    expect(vue.ecart.statut).toBe("hors_tolerance");
  });

  it("une caisse déjà clôturée ou ouverte aujourd'hui n'est pas touchée", async () => {
    viderSessions();
    const g = await guichetierAvecCaisse(2);
    await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, g.sessionId, 25_000, 25_000, { at: t.iso() }),
    );
    const h = await guichetierAvecCaisse(3);
    const avant = structuredClone(t.sessions.lignes.get(g.sessionId));
    // Le lendemain à 10:00 : la caisse d'hier de h (ouverte hier) est fermée, celle de g reste telle quelle.
    avancer(25);
    await t.caisse.cloturerLesSessionsDeMinuit();
    expect(t.sessions.lignes.get(g.sessionId)).toEqual(avant);
    expect(t.sessions.lignes.get(h.sessionId)!.cloture?.auto).toBe(true);
  });
});

describe("journal signé", () => {
  it("chaque écriture laisse une entrée chaînée ; la chaîne est valide", async () => {
    viderSessions();
    t.journalRepo.lignes.length = 0;
    const g = await guichetierAvecCaisse(2, 20_000);
    await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 10_000: 2 }, 0, { at: t.iso() }),
    );
    await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, g.sessionId, 20_000, 20_000, { at: t.iso() }),
    );

    const lignes = t.journalRepo.lignes;
    expect(lignes.map((l) => l.type)).toEqual([
      "caisse.ouverte",
      "caisse.comptee",
      "caisse.cloturee",
    ]);
    expect(lignes[0]!.precedente).toBeNull();
    expect(lignes[1]!.precedente).toBe(lignes[0]!.empreinte);
    expect(lignes[2]!.precedente).toBe(lignes[1]!.empreinte);
    expect(lignes[0]!.resume).toBe("Ouverture de la caisse du guichet 2 · fond de caisse 20 000 F");
    expect(lignes[2]!.resume).toContain("écart nul");
    expect(await t.journal.verifier(COMPAGNIE)).toEqual({ valide: true, entreesVerifiees: 3 });
  });

  it("modifier, retirer ou réordonner une entrée casse la chaîne", async () => {
    viderSessions();
    t.journalRepo.lignes.length = 0;
    await guichetierAvecCaisse(2);
    const g2 = await guichetierAvecCaisse(3);
    await envoyer(
      t,
      "/agence/caisse/cloture",
      g2.jeton,
      cloture(g2.id, g2.sessionId, 25_000, 25_000, { at: t.iso() }),
    );
    expect((await t.journal.verifier(COMPAGNIE)).valide).toBe(true);
    const copie = structuredClone(t.journalRepo.lignes);

    t.journalRepo.lignes[1]!.resume = "Ouverture de la caisse du guichet 3 · fond de caisse 1 F";
    expect(await t.journal.verifier(COMPAGNIE)).toMatchObject({
      valide: false,
      premiereEnDefaut: copie[1]!.seq,
    });

    t.journalRepo.lignes.splice(0, t.journalRepo.lignes.length, ...structuredClone(copie));
    t.journalRepo.lignes.splice(1, 1); // une entrée retirée
    expect((await t.journal.verifier(COMPAGNIE)).valide).toBe(false);

    t.journalRepo.lignes.splice(0, t.journalRepo.lignes.length, ...structuredClone(copie));
    expect((await t.journal.verifier(COMPAGNIE)).valide).toBe(true);
  });

  it("GET /agence/journal : le superviseur lit sa gare, le patron sa compagnie, jamais une autre", async () => {
    viderSessions();
    t.journalRepo.lignes.length = 0;
    const g = await guichetierAvecCaisse(2);
    await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 500: 2 }, 0, { at: t.iso() }),
    );

    const sup = await t.compte("superviseur");
    const rep = await lire(t, "/agence/journal", sup.jeton);
    expect(rep.status).toBe(200);
    const journal = c.SchemaJournal.parse(rep.body);
    expect(journal.chaineValide).toBe(true);
    expect(journal.entrees.map((e) => e.type)).toEqual(["caisse.comptee", "caisse.ouverte"]);
    expect(journal.entrees[0]!.auteur.id).toBe(g.id);

    const patron = await t.compte("patron", { gareId: null });
    expect(
      c.SchemaJournal.parse((await lire(t, "/agence/journal", patron.jeton)).body).entrees,
    ).toHaveLength(2);

    const ailleurs = await t.compte("superviseur", { gareId: AUTRE_GARE });
    expect(
      c.SchemaJournal.parse((await lire(t, "/agence/journal", ailleurs.jeton)).body).entrees,
    ).toHaveLength(0);
    const autreCompagnie = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
    expect(
      c.SchemaJournal.parse((await lire(t, "/agence/journal", autreCompagnie.jeton)).body).entrees,
    ).toHaveLength(0);

    const guichetier = await t.compte("guichetier");
    expect((await lire(t, "/agence/journal", guichetier.jeton)).status).toBe(403);
  });

  it("filtres (session, personne, jour) et pagination par curseur, du plus récent au plus ancien", async () => {
    viderSessions();
    t.journalRepo.lignes.length = 0;
    const g = await guichetierAvecCaisse(2);
    for (let i = 1; i <= 4; i++) {
      await envoyer(
        t,
        "/agence/caisse/comptage",
        g.jeton,
        comptage(g.id, g.sessionId, { 500: i }, 0, { at: t.iso(i * 1000) }),
      );
    }
    const sup = await t.compte("superviseur");
    const page1 = c.SchemaJournal.parse(
      (await lire(t, `/agence/journal?sessionId=${g.sessionId}&limite=2`, sup.jeton)).body,
    );
    expect(page1.entrees).toHaveLength(2);
    expect(page1.suivant).not.toBeNull();
    const page2 = c.SchemaJournal.parse(
      (
        await lire(
          t,
          `/agence/journal?sessionId=${g.sessionId}&limite=2&apres=${page1.suivant}`,
          sup.jeton,
        )
      ).body,
    );
    expect(page2.entrees).toHaveLength(2);
    expect(page2.suivant).not.toBeNull();
    const page3 = c.SchemaJournal.parse(
      (
        await lire(
          t,
          `/agence/journal?sessionId=${g.sessionId}&limite=2&apres=${page2.suivant}`,
          sup.jeton,
        )
      ).body,
    );
    expect(page3.suivant).toBeNull();
    // Du plus récent au plus ancien : quatre comptages, puis l'ouverture ; aucune entrée en double.
    const toutes = [...page1.entrees, ...page2.entrees, ...page3.entrees];
    expect(toutes.map((e) => e.type)).toEqual([
      "caisse.comptee",
      "caisse.comptee",
      "caisse.comptee",
      "caisse.comptee",
      "caisse.ouverte",
    ]);
    expect(new Set(toutes.map((e) => e.evenementId)).size).toBe(5);

    const parPersonne = c.SchemaJournal.parse(
      (await lire(t, `/agence/journal?personneId=${g.id}&jour=2026-11-02`, sup.jeton)).body,
    );
    expect(parPersonne.entrees).toHaveLength(5);
    const autreJour = c.SchemaJournal.parse(
      (await lire(t, `/agence/journal?jour=2026-11-01`, sup.jeton)).body,
    );
    expect(autreJour.entrees).toHaveLength(0);

    for (const mauvais of ["limite=0", "limite=201", "limite=abc", "jour=hier", "apres=x"]) {
      const rep = await lire(t, `/agence/journal?${mauvais}`, sup.jeton);
      expect(rep.status, mauvais).toBe(400);
    }
  });

  it("un PIN, un code ou un secret n'entre jamais dans le journal ni dans l'audit", async () => {
    viderSessions();
    const g = await guichetierAvecCaisse(3);
    await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, g.sessionId, { 500: 1 }, 0, { at: t.iso() }),
    );
    const tout = JSON.stringify([t.journalRepo.lignes, t.auditRepo.lignes], (_cle, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(tout).not.toMatch(/482915/);
    expect(tout).not.toMatch(/Un-mot-de-passe-solide/);
    expect(tout).not.toMatch(/Bearer|pinHache|argon2/i);
    expect(t.journalRepo.lignes.length).toBeGreaterThan(0);
  });
});
