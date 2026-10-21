import { HttpException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erreurApi } from "../analyses/erreurs";
import { AUTRE_COMPAGNIE, COMPAGNIE, DLA_BAF, depart, ecart } from "../analyses/testing/montage";
import { MS_PAR_JOUR } from "../rapport/temps";
import type { InsightsVue, ReponseVue } from "./modele";
import {
  ModeleScenario,
  PATRON,
  codeDe,
  dernierDepart,
  monterAssistant,
  peuplerBafoussam,
  signature,
  type MontageAssistant,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

function planche(opts: Parameters<typeof monterAssistant>[0] = {}): MontageAssistant {
  const m = monterAssistant(opts);
  peuplerBafoussam(m);
  m.caisse.ajouterEcart(
    COMPAGNIE,
    ecart({ jour: "2026-12-29" }),
    ecart({ jour: "2027-01-02" }),
    ecart({ jour: "2027-01-04" }),
  );
  return m;
}

const poser = (m: MontageAssistant, q: string, u = PATRON): Promise<ReponseVue> =>
  m.assistant.poserQuestion(u, u.compagnieId!, q);

const echec = async (p: Promise<unknown>) =>
  codeDe(
    await p.then(
      () => null,
      (e: unknown) => e,
    ),
  );

describe("poser une question", () => {
  it("répond à « Pourquoi Bafoussam baisse ? » avec résumé, points, actions, sources et durée", async () => {
    const m = planche();
    const r = await poser(m, "Pourquoi Bafoussam baisse ?");
    expect(r.question).toBe("Pourquoi Bafoussam baisse ?");
    expect(r.repondueA).toBe("2027-01-05T08:00:00.000+01:00");
    expect(r.dureeSecondes).toBe(1);
    expect(r.resume).toMatch(/^Douala → Bafoussam fait − /);
    expect(r.points).toHaveLength(4);
    expect(r.actions.map((a) => a.type)).toEqual([
      "ajouter_depart",
      "decaler_depart",
      "voir_ligne",
    ]);
    expect(r.sources).toMatch(/^Sources : .*Jamais les chiffres d'une autre compagnie\.$/);
    expect(r.simulation).toBeNull();
  });

  it("garde l'échange, et les actions montrées sont enregistrées comme propositions", async () => {
    const m = planche();
    const r = await poser(m, "Pourquoi Bafoussam baisse ?");
    expect(m.conversations.tous).toHaveLength(1);
    expect(m.conversations.tous[0]).toMatchObject({
      compagnieId: COMPAGNIE,
      utilisateurId: PATRON.id,
      intention: "pourquoi_ligne",
      redaction: "regles",
      contexte: { ligneId: DLA_BAF.id },
    });
    const ids = m.propositions.toutes().map((p) => p.action.id);
    for (const a of r.actions) expect(ids).toContain(a.id);
  });

  it("« et si… » comprend de quel départ on parlait grâce à la question d'avant", async () => {
    const m = planche();
    await poser(m, "Pourquoi Bafoussam baisse ?");
    const r = await poser(m, "Et si je baisse à 3 500 moi aussi ?");
    expect(r.resume).toContain("Le 10:00 de Douala → Bafoussam : à 3 500 F");
    expect(r.simulation?.options.map((o) => o.libelle)).toEqual(["09:15", "3 500 F"]);
    expect(r.actions.map((a) => a.type)).toEqual(["decaler_depart", "voir_ligne"]);
  });

  it("sans question d'avant, « et si… » demande de préciser plutôt que de deviner", async () => {
    const m = planche();
    const r = await poser(m, "Et si je baisse à 3 500 moi aussi ?");
    expect(r.resume).toMatch(/^De quel départ parles-tu/);
    expect(r.actions).toEqual([]);
    expect(r.sources).toBeNull();
  });

  it("la mémoire est celle de ce patron seulement", async () => {
    const m = planche();
    await poser(m, "Pourquoi Bafoussam baisse ?");
    const autre = { ...PATRON, id: "patron-autre" };
    const r = await poser(m, "Et si je baisse à 3 500 moi aussi ?", autre);
    expect(r.resume).toMatch(/^De quel départ parles-tu/);
  });

  it("la trace d'audit ne contient ni la question ni la réponse", async () => {
    const m = planche();
    await poser(m, "Pourquoi Bafoussam baisse ? Appelle Joseph au 655401234");
    expect(m.audit.lignes).toHaveLength(1);
    expect(m.audit.lignes[0]).toMatchObject({
      action: "assistant.question",
      resultat: "succes",
      details: { intention: "pourquoi_ligne", redaction: "regles", modele: "regles" },
    });
    const trace = JSON.stringify(m.audit.lignes);
    expect(trace).not.toMatch(/Bafoussam|Joseph|655401234/);
  });

  it("limite le nombre de questions par minute (le modèle est payant)", async () => {
    const m = planche({ env: { ASSISTANT_QUESTIONS_PAR_MINUTE: "3" } });
    for (let i = 0; i < 3; i++) await poser(m, "Quel bus coûte le plus ?");
    expect(await echec(poser(m, "Quel bus coûte le plus ?"))).toEqual({
      statut: 429,
      code: "TROP_DE_QUESTIONS",
    });
    // Un autre patron n'est pas gêné.
    await poser(m, "Quel bus coûte le plus ?", { ...PATRON, id: "patron-autre" });
    m.horloge.avancer(61_000);
    await expect(poser(m, "Quel bus coûte le plus ?")).resolves.toBeDefined();
  });

  it("si les propositions ne peuvent pas être notées, il ne répond pas (503) et ne garde rien", async () => {
    const m = planche();
    m.propositions.enPanne = true;
    expect(await echec(poser(m, "Pourquoi Bafoussam baisse ?"))).toEqual({
      statut: 503,
      code: "SOURCE_INDISPONIBLE",
    });
    expect(m.conversations.tous).toHaveLength(0);
  });

  it("si la conversation ou le journal sont en panne, la réponse part quand même", async () => {
    const m = planche();
    m.conversations.enPanne = true;
    m.audit.enPanne = true;
    const r = await poser(m, "Pourquoi Bafoussam baisse ?");
    expect(r.resume).toMatch(/^Douala → Bafoussam/);
    // Mais la lecture de la conversation, elle, dit qu'elle est indisponible.
    expect(await echec(m.assistant.conversation(COMPAGNIE, PATRON.id))).toEqual({
      statut: 503,
      code: "SOURCE_INDISPONIBLE",
    });
  });

  it("sans les départs, c'est 503 : l'assistant n'invente aucun chiffre", async () => {
    const m = planche();
    m.departs.enPanne = true;
    expect(await echec(poser(m, "Pourquoi Bafoussam baisse ?"))).toEqual({
      statut: 503,
      code: "SOURCE_INDISPONIBLE",
    });
  });
});

describe("avec un modèle de langage", () => {
  /** Un modèle qui reprend les faits tels quels : sa réponse est donc sûre. */
  function fidele(modele: ModeleScenario) {
    modele.reponse = (d) => ({
      resume: d.faits[0]!,
      points: d.avecPoints ? d.faits.slice(1) : [],
    });
    return modele;
  }

  it("n'envoie que la question et les faits, sans nom d'agent ni de chauffeur, ni téléphone", async () => {
    const modele = fidele(new ModeleScenario());
    const m = planche({ modele });
    const r = await poser(m, "Où part mon argent ? Mon numéro : 655 40 12 34, appelle Joseph");
    const envoi = JSON.stringify(modele.demandes);
    expect(modele.demandes).toHaveLength(1);
    expect(envoi).not.toMatch(/Joseph|Essono|Nana|Essomba|Mbarga|655 40 12 34/);
    expect(envoi).toMatch(/Agent \d/);
    expect(modele.demandes[0]!.question).toContain("[numéro]");
    // La réponse rendue au patron a retrouvé le vrai nom.
    expect(JSON.stringify(r)).toContain("Joseph");
    expect(JSON.stringify(r)).not.toMatch(/Agent \d/);
  });

  it("garde le texte du modèle quand chaque nombre vient des faits, et le note", async () => {
    const modele = fidele(new ModeleScenario());
    const m = planche({ modele });
    const regles = await poser(planche(), "Pourquoi Bafoussam baisse ?");
    const r = await poser(m, "Pourquoi Bafoussam baisse ?");
    expect(r.resume).toBe(regles.resume);
    expect(m.conversations.tous[0]!.redaction).toBe("modele");
    expect(m.audit.lignes[0]!.details).toMatchObject({
      redaction: "modele",
      modele: "modele-de-test",
    });
  });

  it("un chiffre inventé fait retomber sur le texte des règles", async () => {
    const modele = new ModeleScenario();
    modele.reponse = (d) => ({
      resume: `${d.motsObligatoires[0]} fait − 99 % sur deux semaines.`,
      points: ["Le 10:00 part à 12 %."],
    });
    const m = planche({ modele });
    const regles = await poser(planche(), "Pourquoi Bafoussam baisse ?");
    const r = await poser(m, "Pourquoi Bafoussam baisse ?");
    expect(r.resume).toBe(regles.resume);
    expect(r.points).toEqual(regles.points);
    expect(m.conversations.tous[0]!.redaction).toBe("regles");
  });

  it("une panne, un refus ou une lenteur du modèle ne se voient pas : les règles répondent dans le délai", async () => {
    const regles = await poser(planche(), "Pourquoi Bafoussam baisse ?");
    const panne = new ModeleScenario();
    panne.erreur = new Error("503 du fournisseur");
    expect((await poser(planche({ modele: panne }), "Pourquoi Bafoussam baisse ?")).resume).toBe(
      regles.resume,
    );

    const refus = new ModeleScenario();
    refus.reponse = null;
    expect((await poser(planche({ modele: refus }), "Pourquoi Bafoussam baisse ?")).resume).toBe(
      regles.resume,
    );

    const lent = fidele(new ModeleScenario());
    lent.attenteMs = 2_000;
    const m = planche({ modele: lent, env: { ASSISTANT_DELAI_MS: "500" } });
    const t0 = performance.now();
    const r = await poser(m, "Pourquoi Bafoussam baisse ?");
    expect(performance.now() - t0).toBeLessThan(1_500);
    expect(r.resume).toBe(regles.resume);
  });

  it("une réponse figée (question ambiguë, inconnue, pas assez de données) n'est jamais confiée au modèle", async () => {
    const modele = fidele(new ModeleScenario());
    const m = planche({ modele });
    await poser(m, "Et si je baisse à 3 500 ?");
    await poser(m, "Pourquoi Douala baisse ?");
    expect(modele.demandes).toEqual([]);
  });

  it("aucune donnée d'une autre compagnie dans ce qui part vers le modèle", async () => {
    const modele = fidele(new ModeleScenario());
    const m = planche({ modele });
    m.departs.ajouter(
      AUTRE_COMPAGNIE,
      depart({ ligneId: DLA_BAF.id, jour: "2027-01-03", billets: 777, recetteBillets: 7_770_777 }),
    );
    for (const q of [
      "Pourquoi Bafoussam baisse ?",
      "Quel bus coûte le plus ?",
      "Prévision de samedi",
      "Où part mon argent ?",
    ]) {
      await poser(m, q);
    }
    const envoi = JSON.stringify(modele.demandes);
    expect(modele.demandes.length).toBeGreaterThanOrEqual(4);
    expect(envoi).not.toContain("7770777");
    expect(envoi).not.toContain("777");
    expect(envoi).not.toContain(AUTRE_COMPAGNIE);
  });

  it("une question inconnue des règles peut être rangée par le modèle, puis revérifiée", async () => {
    const modele = new ModeleScenario();
    modele.choix = {
      intention: "prevision_jour",
      ligne: null,
      heure: null,
      jourSemaine: 6,
      prix: null,
    };
    const m = planche({ modele });
    const r = await poser(
      m,
      "Je vais encaisser combien à la fin de la semaine, appelle le 655401234 ?",
    );
    expect(modele.interpretations).toHaveLength(1);
    expect(modele.interpretations[0]!.question).toContain("[numéro]");
    expect(modele.interpretations[0]!.lignes).toEqual(["Douala → Bafoussam", "Douala → Yaoundé"]);
    expect(r.resume).toMatch(/^Samedi 9 janv\./);
  });

  it("un rangement absurde du modèle (ligne inconnue, jour 12) reste une question inconnue", async () => {
    const modele = new ModeleScenario();
    modele.choix = {
      intention: "prevision_jour",
      ligne: null,
      heure: null,
      jourSemaine: 12,
      prix: null,
    };
    const m = planche({ modele });
    const r = await poser(m, "Raconte-moi une blague");
    expect(r.resume).toMatch(/^Je ne sais pas répondre/);
    modele.erreur = new Error("hors service");
    expect((await poser(m, "Raconte-moi une autre blague")).resume).toMatch(
      /^Je ne sais pas répondre/,
    );
  });
});

describe("insights", () => {
  it("rend les fuites, les gains et les questions suggérées, et enregistre chaque action", async () => {
    const m = planche();
    const i: InsightsVue = await m.assistant.insights(COMPAGNIE);
    expect(i.fuites.map((f) => f.id)).toEqual(["fuite:ecarts:agent-joseph"]);
    expect(i.fuites[0]).toMatchObject({ periodeJours: 10, montantTotal: -4_500 });
    expect(i.gains).toHaveLength(1);
    expect(i.gains[0]!.action.type).toBe("decaler_depart");
    expect(i.gains[0]!.simulation.scenarios).toHaveLength(2);
    expect(Object.keys(i.gains[0]!.simulation).sort()).toEqual(["gainMensuel", "scenarios"]);
    expect(i.questionsSuggerees).toEqual([
      "Pourquoi Bafoussam baisse ?",
      "Quel bus coûte le plus ?",
      "Prévision de mardi",
    ]);
    const enregistrees = m.propositions.toutes().map((p) => p.action.id);
    expect(enregistrees).toContain(i.gains[0]!.action.id);
    for (const a of i.fuites.flatMap((f) => f.actions)) expect(enregistrees).toContain(a.id);
  });

  it("503 si les propositions ne peuvent être notées ou si les départs manquent", async () => {
    const m = planche();
    m.propositions.enPanne = true;
    expect((await echec(m.assistant.insights(COMPAGNIE)))?.statut).toBe(503);
    const n = planche();
    n.departs.enPanne = true;
    expect((await echec(n.assistant.insights(COMPAGNIE)))?.statut).toBe(503);
  });

  it("une compagnie sans rien à signaler reçoit des listes vides, pas une erreur", async () => {
    const m = monterAssistant();
    expect(await m.assistant.insights(COMPAGNIE)).toEqual({
      fuites: [],
      gains: [],
      questionsSuggerees: [],
    });
  });
});

describe("conversation", () => {
  it("rend les échanges de ce patron dans l'ordre, avec la base de 30 jours", async () => {
    const m = planche({ env: { ASSISTANT_ECHANGES_GARDES: "2" } });
    expect(await m.assistant.conversation(COMPAGNIE, PATRON.id)).toEqual({
      id: `conversation-${PATRON.id}`,
      baseJours: 30,
      echanges: [],
    });
    await poser(m, "Quel bus coûte le plus ?");
    await poser(m, "Prévision de samedi");
    await poser(m, "Pourquoi Bafoussam baisse ?");
    const c = await m.assistant.conversation(COMPAGNIE, PATRON.id);
    expect(c.echanges.map((e) => e.question)).toEqual([
      "Prévision de samedi",
      "Pourquoi Bafoussam baisse ?",
    ]);
    expect((await m.assistant.conversation(COMPAGNIE, "patron-autre")).echanges).toEqual([]);
    expect((await m.assistant.conversation(AUTRE_COMPAGNIE, PATRON.id)).echanges).toEqual([]);
  });
});

describe("simuler", () => {
  it("rend la simulation du contrat, sans les champs internes", async () => {
    const m = planche();
    const departId = await dernierDepart(m, "10:00");
    const r = await m.assistant.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 3_500 });
    expect(r.demande).toEqual({ type: "prix", departId, nouveauPrix: 3_500 });
    expect(Object.keys(r.simulation).sort()).toEqual(["gainMensuel", "scenarios"]);
    expect(r.base).toContain("hypothèse");
    const h = await m.assistant.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    expect(h.simulation.gainMensuel).toBeGreaterThan(0);
  });

  it("404 pour un départ d'une autre compagnie, 422 pour un horaire en conflit", async () => {
    const m = planche();
    const departId = await dernierDepart(m, "10:00");
    expect(
      await echec(
        m.assistant.simuler(AUTRE_COMPAGNIE, { type: "prix", departId, nouveauPrix: 3_500 }),
      ),
    ).toEqual({ statut: 404, code: "DEPART_INTROUVABLE" });
    expect(
      await echec(
        m.assistant.simuler(COMPAGNIE, { type: "horaire", departId, nouvelleHeure: "08:30" }),
      ),
    ).toEqual({ statut: 422, code: "HORAIRE_EN_CONFLIT" });
  });
});

describe("appliquer une proposition", () => {
  async function actionDe(m: MontageAssistant, type: string) {
    const i = await m.assistant.insights(COMPAGNIE);
    const toutes = [...i.fuites.flatMap((f) => f.actions), ...i.gains.map((g) => g.action)];
    return toutes.find((a) => a.type === type)!;
  }
  const corps = (actionId: string) => ({ actionId, signature: signature() });
  const appliquer = (m: MontageAssistant, c: unknown, u = PATRON) =>
    m.assistant.appliquer(u, u.compagnieId!, c);

  it("applique « décaler le 10:00 », prend effet lundi, et trace au journal d'audit", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    const r = await appliquer(m, corps(action.id));
    expect(r).toEqual({
      journalId: "audit-1",
      signeA: "2027-01-05T08:00:00.000+01:00",
      signePar: PATRON.id,
      actionId: action.id,
      effetA: "2027-01-11T00:00:00.000+01:00",
    });
    expect(m.pin.appels).toBe(1);
    expect(m.actions.appliquees).toHaveLength(1);
    expect(m.actions.appliquees[0]).toMatchObject({
      compagnieId: COMPAGNIE,
      par: { id: PATRON.id, role: "patron" },
      action: {
        id: action.id,
        type: "decaler_depart",
        parametres: { heure: "10:00", nouvelleHeure: "09:15" },
      },
    });
    expect(m.audit.lignes[0]).toMatchObject({
      action: "assistant.proposition.appliquer",
      resultat: "succes",
      cible: { type: "proposition", id: action.id },
      details: {
        action: "decaler_depart",
        effetA: "2027-01-11T00:00:00.000+01:00",
        signature: "pin",
      },
    });
    expect(JSON.stringify(m.audit.lignes)).not.toContain("482915");
    const stockee = m.propositions.toutes().find((p) => p.action.id === action.id)!;
    expect(stockee.application).toMatchObject({ par: PATRON.id, journalId: "audit-1" });
  });

  it("le contrôle inopiné prend effet tout de suite", async () => {
    const m = planche();
    const action = await actionDe(m, "controle_inopine");
    const r = await appliquer(m, corps(action.id));
    expect(r.effetA).toBe("2027-01-05T08:00:00.000+01:00");
  });

  it("une proposition ne s'applique qu'une fois (409), même si deux clics arrivent ensemble", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    const resultats = await Promise.allSettled([
      appliquer(m, corps(action.id)),
      appliquer(m, corps(action.id)),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refus = resultats.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(codeDe(refus.reason)).toEqual({ statut: 409, code: "PROPOSITION_DEJA_APPLIQUEE" });
    expect(m.actions.appliquees).toHaveLength(1);
    expect(await echec(appliquer(m, corps(action.id)))).toEqual({
      statut: 409,
      code: "PROPOSITION_DEJA_APPLIQUEE",
    });
  });

  it("sans signature : 401 PIN_REQUIS, le PIN n'est même pas vérifié, rien n'est appliqué", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    for (const c of [
      { actionId: action.id },
      { actionId: action.id, signature: { pin: "12" } },
      null,
    ]) {
      expect(await echec(appliquer(m, c))).toEqual({ statut: 401, code: "PIN_REQUIS" });
    }
    expect(m.pin.appels).toBe(0);
    expect(m.actions.appliquees).toEqual([]);
  });

  it("un mauvais PIN refuse (403), trace le refus sans le PIN, et la proposition reste applicable", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    m.pin.echec = erreurApi(403, "PIN_INCORRECT", "PIN incorrect");
    expect(await echec(appliquer(m, corps(action.id)))).toEqual({
      statut: 403,
      code: "PIN_INCORRECT",
    });
    expect(m.actions.appliquees).toEqual([]);
    expect(m.audit.lignes[0]).toMatchObject({
      resultat: "refus",
      cible: { id: action.id },
      details: { cause: "PIN_INCORRECT" },
    });
    expect(JSON.stringify(m.audit.lignes)).not.toContain("482915");
    m.pin.echec = null;
    await expect(appliquer(m, corps(action.id))).resolves.toBeDefined();
  });

  it("une proposition inconnue ou d'une autre compagnie : 404", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    expect(await echec(appliquer(m, corps("decaler_depart:inventee:0915")))).toEqual({
      statut: 404,
      code: "PROPOSITION_INCONNUE",
    });
    const autre = { ...PATRON, id: "patron-beta", compagnieId: AUTRE_COMPAGNIE };
    expect(await echec(appliquer(m, corps(action.id), autre))).toEqual({
      statut: 404,
      code: "PROPOSITION_INCONNUE",
    });
    expect(m.actions.appliquees).toEqual([]);
  });

  it("une proposition de plus de 7 jours est périmée (410), et redevient applicable quand l'assistant la repropose", async () => {
    const m = planche();
    const action = await actionDe(m, "controle_inopine");
    m.horloge.avancer(8 * MS_PAR_JOUR);
    expect(await echec(appliquer(m, corps(action.id)))).toEqual({
      statut: 410,
      code: "PROPOSITION_PERIMEE",
    });
    expect(m.actions.appliquees).toEqual([]);
  });

  it("appliquée puis reproposée tant qu'elle est valable, elle reste appliquée ; après la péremption, elle est neuve", async () => {
    const m = planche();
    const action = await actionDe(m, "controle_inopine");
    await appliquer(m, corps(action.id));
    await m.assistant.insights(COMPAGNIE);
    expect(await echec(appliquer(m, corps(action.id)))).toEqual({
      statut: 409,
      code: "PROPOSITION_DEJA_APPLIQUEE",
    });
    m.horloge.avancer(8 * MS_PAR_JOUR);
    // Passé le délai, la même action reproposée est une proposition neuve.
    const maintenant = m.horloge.maintenant();
    const stockee = m.propositions.toutes().find((p) => p.action.id === action.id)!;
    await m.propositions.proposer(
      COMPAGNIE,
      [stockee.action],
      maintenant,
      new Date(maintenant.getTime() + 7 * MS_PAR_JOUR),
    );
    const toutes = m.propositions.toutes().filter((p) => p.action.id === action.id);
    expect(toutes).toHaveLength(1);
    expect(toutes[0]!.application).toBeNull();
  });

  it("« voir la ligne » ouvre un écran : 422, et la proposition n'est pas consommée", async () => {
    const m = planche();
    await poser(m, "Pourquoi Bafoussam baisse ?");
    const voir = m.propositions.toutes().find((p) => p.action.type === "voir_ligne")!;
    expect(await echec(appliquer(m, corps(voir.action.id)))).toEqual({
      statut: 422,
      code: "ACTION_NON_APPLICABLE",
    });
    expect(
      m.propositions.toutes().find((p) => p.action.id === voir.action.id)!.application,
    ).toBeNull();
  });

  it("si le réglage échoue, rien n'est tracé comme réussi et le patron peut réessayer", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    m.actions.echec = new Error("planning injoignable");
    expect(await echec(appliquer(m, corps(action.id)))).toEqual({
      statut: 502,
      code: "APPLICATION_IMPOSSIBLE",
    });
    m.actions.echec = erreurApi(409, "DEPART_SUPPRIME", "Ce départ n'existe plus");
    expect(await echec(appliquer(m, corps(action.id)))).toEqual({
      statut: 409,
      code: "DEPART_SUPPRIME",
    });
    expect(
      m.audit.lignes.every(
        (l) =>
          l.resultat === "refus" ||
          l.action !== "assistant.proposition.appliquer" ||
          l.resultat !== "succes",
      ),
    ).toBe(true);
    expect(m.audit.lignes.some((l) => l.resultat === "succes")).toBe(false);
    m.actions.echec = null;
    await expect(appliquer(m, corps(action.id))).resolves.toBeDefined();
    expect(m.actions.appliquees).toHaveLength(1);
  });

  it("corps invalide : 422 COMMANDE_INVALIDE (champ en trop, identifiant absent ou trop long)", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    for (const c of [
      { actionId: action.id, signature: signature(), compagnieId: "autre" },
      { signature: signature() },
      { actionId: "x".repeat(201), signature: signature() },
      { actionId: 12, signature: signature() },
    ]) {
      expect(await echec(appliquer(m, c))).toEqual({ statut: 422, code: "COMMANDE_INVALIDE" });
    }
    expect(m.actions.appliquees).toEqual([]);
  });

  it("l'erreur du PIN est celle de la vérification (blocage, signature périmée)", async () => {
    const m = planche();
    const action = await actionDe(m, "decaler_depart");
    for (const [statut, code] of [
      [423, "PIN_BLOQUE"],
      [422, "SIGNATURE_PERIMEE"],
      [409, "PIN_NON_DEFINI"],
    ] as const) {
      m.pin.echec = new HttpException({ statusCode: statut, code, message: code }, statut);
      expect(await echec(appliquer(m, corps(action.id)))).toEqual({ statut, code });
    }
  });
});
