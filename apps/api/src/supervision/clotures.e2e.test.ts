import { agence as c } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTRE_GARE, GARE, GUICHET_2, GUICHET_3, uuid } from "../caisse/testing/app-agence-test";
import { cloture, comptage, envoyer, lire, ouverture } from "../caisse/testing/outils";
import { MS_PAR_HEURE, MS_PAR_MINUTE } from "../caisse/temps";
import { idDemandeCloture } from "./supervision.service";
import {
  creerAppSupervisionTest,
  type AppSupervisionTest,
  type CompteTest,
  type SuperviseurTest,
} from "./testing/app-supervision-test";

let t: AppSupervisionTest;
let sup: SuperviseurTest;

beforeAll(async () => {
  t = await creerAppSupervisionTest();
});
afterAll(() => t.fermer());

beforeEach(async () => {
  t.reinitialiser();
  sup = await t.superviseur();
});

const VALIDER = "/agence/superviseur/validations";
const REFUSER = "/agence/superviseur/refus";

/** Un guichetier qui ouvre sa caisse (fond 25 000), la compte et la clôture avec l'écart donné. */
async function caisseCloturee(o: { ecart?: number; rang?: 2 | 3; clore?: boolean } = {}) {
  const rang = o.rang ?? 2;
  const g = await t.compte("guichetier", {
    nom: rang === 2 ? "Joseph Mbarga" : "Pauline Atangana",
  });
  const sessionId = uuid();
  await envoyer(
    t,
    "/agence/caisse/ouverture",
    g.jeton,
    ouverture(t, g.id, {
      sessionId,
      rang,
      guichetId: rang === 2 ? GUICHET_2 : GUICHET_3,
      fond: 25_000,
    }),
  );
  const compte = 25_000 + (o.ecart ?? 0);
  await envoyer(
    t,
    "/agence/caisse/comptage",
    g.jeton,
    comptage(g.id, sessionId, {}, compte, { at: t.iso() }),
  );
  if (o.clore !== false) {
    const rep = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, sessionId, compte, 25_000, { at: t.iso(60_000) }),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
  }
  return { g, sessionId, ecart: o.ecart ?? 0 };
}

const validation = (sessionId: string, ecart: number, commentaire: string | null = null) =>
  t.evenementSuperviseur("caisse.validee", sup, { sessionId, ecart, commentaire });
const refus = (sessionId: string, motif: string | null = null) =>
  t.evenementSuperviseur("caisse.refusee", sup, { sessionId, motif });

describe("l'accueil de la gare", () => {
  it("répond comme le contrat : demandes de clôture, guichets, départs de l'après-midi", async () => {
    const { g, sessionId } = await caisseCloturee({ ecart: -500 });
    const ouvert = await t.compte("guichetier", { nom: "Pauline Atangana" });
    await envoyer(
      t,
      "/agence/caisse/ouverture",
      ouvert.jeton,
      ouverture(t, ouvert.id, { rang: 3, guichetId: GUICHET_3 }),
    );

    const rep = await lire(t, "/agence/superviseur/gare", sup.jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const gare = c.SchemaSuperviseurGare.parse(rep.body);
    expect(gare.gare).toEqual({ id: GARE, nom: "Gare de Douala" });
    expect(gare.superviseur).toEqual({ id: sup.id, nom: "Marie Ngo Bayiha" });
    expect(gare.at).toBe(t.iso());
    expect(gare.demandes).toEqual([
      {
        genre: "cloture",
        demandeId: idDemandeCloture(sessionId),
        sessionId,
        guichetRang: 2,
        agent: { id: g.id, nom: "Joseph Mbarga" },
        compte: 24_500,
        ecart: -500,
      },
    ]);
    expect(gare.guichets).toEqual([
      { rang: 1, billets: 3, ecart: 0, etat: "ferme", ouvertA: null },
      { rang: 2, billets: 41, ecart: -500, etat: "a_valider", ouvertA: expect.any(String) },
      { rang: 3, billets: 5, ecart: 0, etat: "ouvert", ouvertA: expect.any(String) },
    ]);
    expect(gare.apresMidi).toHaveLength(1);
    expect(gare.quais).toBe(4);
  });

  it("un guichet ouvert et compté montre son écart en cours ; une caisse validée n'est plus à valider", async () => {
    const { sessionId } = await caisseCloturee({ ecart: 2_000 });
    const compte = await caisseCloturee({ ecart: -3_000, rang: 3, clore: false });
    let gare = c.SchemaSuperviseurGare.parse(
      (await lire(t, "/agence/superviseur/gare", sup.jeton)).body,
    );
    expect(gare.guichets.find((x) => x.rang === 3)).toMatchObject({
      etat: "ouvert",
      ecart: -3_000,
    });
    expect(compte.g.id).toBeTruthy();

    const evt = await t.signer(sup, validation(sessionId, 2_000));
    expect((await envoyer(t, VALIDER, sup.jeton, evt)).status).toBe(200);
    gare = c.SchemaSuperviseurGare.parse(
      (await lire(t, "/agence/superviseur/gare", sup.jeton)).body,
    );
    expect(gare.demandes).toEqual([]);
    expect(gare.guichets.find((x) => x.rang === 2)).toMatchObject({ etat: "ferme" });
  });

  it("un superviseur d'une autre gare ne voit pas cette gare ; un guichetier non plus", async () => {
    await caisseCloturee();
    const ailleurs = await t.superviseur({ gareId: AUTRE_GARE });
    const rep = await lire(t, "/agence/superviseur/gare", ailleurs.jeton);
    expect(rep.status).toBe(404);
    expect(rep.body.code).toBe("GARE_INCONNUE");
    const g = await t.compte("guichetier");
    expect((await lire(t, "/agence/superviseur/gare", g.jeton)).status).toBe(403);
  });
});

describe("lecture d'une clôture à valider", () => {
  it("répond comme le contrat (SchemaSuperviseurCloture) avec le bilan, les contrôles et le PIN", async () => {
    const { g, sessionId } = await caisseCloturee({ ecart: -500 });
    const rep = await lire(t, `/agence/superviseur/clotures/${sessionId}`, sup.jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaSuperviseurCloture.parse(rep.body);
    expect(lu).toMatchObject({
      sessionId,
      guichetRang: 2,
      agent: { id: g.id, nom: "Joseph Mbarga" },
      bilan: { attendu: 25_000, compte: 24_500, ecart: -500, statut: "dans_tolerance" },
      resume: { billetsCash: 0, colis: 0, annulationsValidees: 0 },
      controles: {
        tolerance: { montant: 1_000, dansLaLimite: true },
        historiqueAgent: { jours: 10, ecartsNegatifs: 1, total: -500 },
        cadenceSansNom: 0,
      },
      commentaire: null,
      pin: {
        superviseur: { id: sup.id, nom: "Marie Ngo Bayiha" },
        longueur: 6,
        empreinteDisponible: false,
        essaisMax: 3,
        blocageMinutes: 15,
      },
    });
    expect(lu.periode.fin).toBe(lu.clotureeA);
  });

  it("un écart au-delà de la tolérance sort de la limite ; la cadence sans nom vient de la source", async () => {
    t.source.definirCadenceSansNom(GARE, 4);
    const { sessionId } = await caisseCloturee({ ecart: -1_001 });
    const lu = c.SchemaSuperviseurCloture.parse(
      (await lire(t, `/agence/superviseur/clotures/${sessionId}`, sup.jeton)).body,
    );
    expect(lu.bilan).toMatchObject({ ecart: -1_001, statut: "hors_tolerance" });
    expect(lu.controles.tolerance.dansLaLimite).toBe(false);
    expect(lu.controles.cadenceSansNom).toBe(4);
  });

  it("l'historique de l'agent compte ses écarts négatifs des 10 derniers jours", async () => {
    const { g, sessionId } = await caisseCloturee({ ecart: -200 });
    // Trois caisses d'avant : -300 (il y a 2 jours), +100 (il y a 4 jours), -900 (il y a 12 jours, hors période).
    const base = t.sessions.lignes.get(sessionId)!;
    for (const [i, [jours, ecart]] of [
      [2, -300],
      [4, 100],
      [12, -900],
    ].entries()) {
      const at = t.iso(-jours! * 24 * MS_PAR_HEURE);
      t.sessions.lignes.set(`old-${i}`, {
        ...structuredClone(base),
        id: `old-${i}`,
        numero: `K-old-${i}`,
        guichetId: GUICHET_3,
        ouverteA: at,
        etat: "validee",
        cloture: { ...base.cloture!, at, ecart: ecart!, cashCompte: 0, cashAttendu: 0 },
      });
    }
    const lu = c.SchemaSuperviseurCloture.parse(
      (await lire(t, `/agence/superviseur/clotures/${sessionId}`, sup.jeton)).body,
    );
    expect(lu.controles.historiqueAgent).toEqual({
      jours: 10,
      ecartsNegatifs: 2,
      total: -200 - 300 + 100,
    });
    expect(g.id).toBeTruthy();
  });

  it("le commentaire proposé signale la clôture automatique et l'écart de l'appareil", async () => {
    const { sessionId } = await caisseCloturee({ clore: false });
    t.horloge.avancer(16 * MS_PAR_HEURE);
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(1);
    const lu = c.SchemaSuperviseurCloture.parse(
      (await lire(t, `/agence/superviseur/clotures/${sessionId}`, sup.jeton)).body,
    );
    expect(lu.commentaire).toContain("Clôture automatique de minuit");
  });

  it("une caisse encore ouverte : 409 ; une session d'une autre gare ou inconnue : 404", async () => {
    const { sessionId } = await caisseCloturee({ clore: false });
    const ouverte = await lire(t, `/agence/superviseur/clotures/${sessionId}`, sup.jeton);
    expect(ouverte.status).toBe(409);
    expect(ouverte.body.code).toBe("SESSION_NON_CLOTUREE");
    expect((await lire(t, "/agence/superviseur/clotures/inconnue", sup.jeton)).status).toBe(404);
    const ailleurs = await t.superviseur({ gareId: AUTRE_GARE });
    expect(
      (await lire(t, `/agence/superviseur/clotures/${sessionId}`, ailleurs.jeton)).status,
    ).toBe(404);
  });
});

describe("Valider · écart signé", () => {
  it("valide la clôture avec le PIN, répond comme le contrat et journalise l'écart signé", async () => {
    const { sessionId } = await caisseCloturee({ ecart: -500 });
    const evt = await t.signer(sup, validation(sessionId, -500, "Billet de 500 F déchiré"));
    const rep = await envoyer(t, VALIDER, sup.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatValidationCaisse.parse(rep.body);
    expect(lu.session).toEqual({ sessionId, etat: "validee", ecart: -500 });
    expect(t.sessions.lignes.get(sessionId)).toMatchObject({
      etat: "validee",
      validation: {
        superviseurId: sup.id,
        superviseurNom: "Marie Ngo Bayiha",
        ecart: -500,
        commentaire: "Billet de 500 F déchiré",
        evenementId: evt.id,
      },
    });
    const entree = t.journalRepo.lignes.find((l) => l.type === "caisse.validee")!;
    expect(entree.resume).toBe(
      "Validation de la caisse du guichet 2 · écart − 500 F signé par Marie Ngo Bayiha",
    );
    expect(entree.validePar).toMatchObject({ superviseurId: sup.id, methode: "pin" });
    // Dans la tolérance : le patron n'est pas alerté.
    expect(t.alertes.lignes).toEqual([]);
  });

  it("sans la preuve du PIN : refusé, la caisse reste à valider", async () => {
    const { sessionId } = await caisseCloturee({ ecart: 0 });
    const faux = t.avecPreuve(validation(sessionId, 0), "e".repeat(72));
    const rep = await envoyer(t, VALIDER, sup.jeton, faux);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("PREUVE_PIN_INVALIDE");
    expect(t.sessions.lignes.get(sessionId)!.etat).toBe("cloturee");

    // Signée pour un écart de 0, envoyée pour un écart de -500 : refusée.
    const signee = await t.signer(sup, validation(sessionId, 0));
    const falsifie = { ...signee, donnees: { ...signee.donnees, ecart: -500 } };
    expect((await envoyer(t, VALIDER, sup.jeton, falsifie)).status).toBe(403);
    expect(t.sessions.lignes.get(sessionId)!.etat).toBe("cloturee");
  });

  it("l'écart signé doit être celui de la clôture", async () => {
    const { sessionId } = await caisseCloturee({ ecart: -500 });
    const evt = await t.signer(sup, validation(sessionId, 0));
    const rep = await envoyer(t, VALIDER, sup.jeton, evt);
    expect(rep.status).toBe(422);
    expect(rep.body).toMatchObject({
      code: "ECART_DIFFERENT",
      details: { cloture: -500, signe: 0 },
    });
    expect(t.sessions.lignes.get(sessionId)!.etat).toBe("cloturee");
  });

  it("un écart hors tolérance validé alerte le patron", async () => {
    const { sessionId } = await caisseCloturee({ ecart: -2_500 });
    const evt = await t.signer(sup, validation(sessionId, -2_500));
    expect((await envoyer(t, VALIDER, sup.jeton, evt)).status).toBe(200);
    expect(t.alertes.lignes).toHaveLength(1);
    expect(t.alertes.lignes[0]).toMatchObject({ type: "ecart_hors_tolerance", gareId: GARE });
    expect(t.alertes.lignes[0]!.message).toContain("guichet 2");
  });

  it("rejouer répond deja_recu sans doubler l'alerte ; une deuxième validation d'une autre main : 409", async () => {
    const { sessionId } = await caisseCloturee({ ecart: -2_500 });
    const evt = await t.signer(sup, validation(sessionId, -2_500));
    await envoyer(t, VALIDER, sup.jeton, evt);
    const rejeu = await envoyer(t, VALIDER, sup.jeton, evt);
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(t.alertes.lignes).toHaveLength(1);
    expect(t.journalRepo.lignes.filter((l) => l.type === "caisse.validee")).toHaveLength(1);

    const autre = await t.superviseur({ nom: "Autre Superviseur" });
    const second = await t.signer(
      autre,
      t.evenementSuperviseur("caisse.validee", autre, {
        sessionId,
        ecart: -2_500,
        commentaire: null,
      }),
    );
    const rep = await envoyer(t, VALIDER, autre.jeton, second);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("TRANSITION_INTERDITE");
    expect(t.sessions.lignes.get(sessionId)!.validation!.superviseurId).toBe(sup.id);
  });

  it("on ne valide pas une caisse encore ouverte, ni la sienne, ni celle d'une autre gare", async () => {
    const ouverte = await caisseCloturee({ clore: false });
    const tropTot = await t.signer(sup, validation(ouverte.sessionId, 0));
    const rep = await envoyer(t, VALIDER, sup.jeton, tropTot);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("TRANSITION_INTERDITE");

    const { sessionId } = await caisseCloturee({ rang: 3 });
    t.sessions.lignes.get(sessionId)!.agentId = sup.id;
    const sienne = await envoyer(
      t,
      VALIDER,
      sup.jeton,
      await t.signer(sup, validation(sessionId, 0)),
    );
    expect(sienne.status).toBe(403);
    expect(sienne.body.code).toBe("AUTO_VALIDATION");

    t.sessions.lignes.get(sessionId)!.agentId = "quelquun";
    const ailleurs = await t.superviseur({ gareId: AUTRE_GARE });
    const evt = await t.signer(
      ailleurs,
      t.evenementSuperviseur("caisse.validee", ailleurs, {
        sessionId,
        ecart: 0,
        commentaire: null,
      }),
    );
    expect((await envoyer(t, VALIDER, ailleurs.jeton, evt)).status).toBe(404);
  });

  it("le guichetier ne valide pas sa propre caisse", async () => {
    const { g, sessionId } = await caisseCloturee();
    const evt = await t.signer(sup, validation(sessionId, 0));
    expect((await envoyer(t, VALIDER, g.jeton, evt)).status).toBe(403);
  });
});

describe("Refuser · recompter", () => {
  it("rouvre la caisse : le guichetier recompte et la clôture de nouveau, à son tour à valider", async () => {
    const { g, sessionId } = await caisseCloturee({ ecart: -3_000 });
    const evt = await t.signer(sup, refus(sessionId, "Recomptez les billets de 5 000"));
    const rep = await envoyer(t, REFUSER, sup.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatValidationCaisse.parse(rep.body);
    expect(lu.session).toMatchObject({ sessionId, etat: "ouverte" });

    const s = t.sessions.lignes.get(sessionId)!;
    expect(s).toMatchObject({ etat: "ouverte", cloture: null, reouverteA: evt.at });
    expect(s.refus).toEqual([
      {
        at: evt.at,
        superviseurId: sup.id,
        motif: "Recomptez les billets de 5 000",
        ecart: -3_000,
        evenementId: evt.id,
      },
    ]);
    expect(t.journalRepo.lignes.find((l) => l.type === "caisse.refusee")!.resume).toBe(
      "Recomptage demandé pour la caisse du guichet 2 (écart − 3 000 F) · « Recomptez les billets de 5 000 »",
    );

    // Le guichetier peut de nouveau compter, puis clôturer.
    const recompte = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, sessionId, {}, 25_000, { at: t.iso(5 * MS_PAR_MINUTE) }),
    );
    expect(recompte.status).toBe(200);
    const clore = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, sessionId, 25_000, 25_000, { at: t.iso(6 * MS_PAR_MINUTE) }),
    );
    expect(clore.status, JSON.stringify(clore.body)).toBe(200);
    const apres = c.SchemaSuperviseurCloture.parse(
      (await lire(t, `/agence/superviseur/clotures/${sessionId}`, sup.jeton)).body,
    );
    expect(apres.bilan.ecart).toBe(0);
    expect(apres.commentaire).toBe("Recomptée 1 fois après refus.");
  });

  it("sans preuve du PIN : refusé ; une caisse non clôturée : 409 ; rejouer : deja_recu", async () => {
    const { sessionId } = await caisseCloturee({ ecart: -3_000 });
    const faux = t.avecPreuve(refus(sessionId), "f".repeat(72));
    expect((await envoyer(t, REFUSER, sup.jeton, faux)).status).toBe(403);
    expect(t.sessions.lignes.get(sessionId)!.etat).toBe("cloturee");

    const evt = await t.signer(sup, refus(sessionId));
    const premier = await envoyer(t, REFUSER, sup.jeton, evt);
    const rejeu = await envoyer(t, REFUSER, sup.jeton, evt);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(rejeu.body.session).toEqual(premier.body.session);
    expect(t.sessions.lignes.get(sessionId)!.refus).toHaveLength(1);

    const encoreOuverte = await t.signer(sup, refus(sessionId, "encore"));
    const rep = await envoyer(t, REFUSER, sup.jeton, encoreOuverte);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("TRANSITION_INTERDITE");
  });

  it("une caisse rouverte est de nouveau fermée à minuit", async () => {
    const { sessionId } = await caisseCloturee({ ecart: -3_000 });
    await envoyer(t, REFUSER, sup.jeton, await t.signer(sup, refus(sessionId)));
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(0);
    t.horloge.avancer(16 * MS_PAR_HEURE);
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(1);
    expect(t.sessions.lignes.get(sessionId)).toMatchObject({ etat: "cloturee" });
    expect(t.sessions.lignes.get(sessionId)!.cloture!.auto).toBe(true);
  });
});

describe("séparation des gares", () => {
  it("le journal de la gare montre les validations du superviseur et leur preuve", async () => {
    const { sessionId } = await caisseCloturee({ ecart: 0 });
    await envoyer(t, VALIDER, sup.jeton, await t.signer(sup, validation(sessionId, 0)));
    const journal = c.SchemaJournal.parse(
      (await lire(t, `/agence/journal?sessionId=${sessionId}`, sup.jeton)).body,
    );
    expect(journal.chaineValide).toBe(true);
    expect(journal.entrees[0]).toMatchObject({
      type: "caisse.validee",
      auteur: { id: sup.id },
      validePar: { superviseurId: sup.id, methode: "pin" },
    });
    expect(journal.entrees.map((e) => e.type)).toEqual([
      "caisse.validee",
      "caisse.cloturee",
      "caisse.comptee",
      "caisse.ouverte",
    ]);
    const autre: CompteTest = await t.superviseur({ gareId: AUTRE_GARE });
    expect(
      c.SchemaJournal.parse(
        (await lire(t, `/agence/journal?sessionId=${sessionId}`, autre.jeton)).body,
      ).entrees,
    ).toEqual([]);
  });
});
