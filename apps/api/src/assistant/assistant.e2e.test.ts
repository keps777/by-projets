import type { AddressInfo } from "node:net";
import { patron } from "@afrimove/contrats";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { creerAppAnalysesTest, type AppAnalysesTest } from "../analyses/testing/app-analyses-test";
import { AUTRE_COMPAGNIE, COMPAGNIE, ecart } from "../analyses/testing/montage";
import { versIsoDouala } from "../rapport/temps";
import { AssistantModule } from "./assistant.module";
import { CONFIG_ASSISTANT, chargerConfigAssistant } from "./config";
import { AppliquerActionsMemoire } from "./memoire";
import { AppliquerActions, ModeleLangage } from "./ports";
import { dernierDepart, ModeleScenario, peuplerBafoussam } from "./testing/montage";

let t: AppAnalysesTest;
let modele: ModeleScenario;
let patronAlpha: { id: string; jeton: string; pin: string };
let patronBeta: { id: string; jeton: string };
let patronSansCompagnie: { id: string; jeton: string };
const autres: Record<string, { jeton: string }> = {};

beforeAll(async () => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
  modele = new ModeleScenario();
  t = await creerAppAnalysesTest({
    modules: [AssistantModule],
    remplacements: [
      [ModeleLangage, modele],
      [CONFIG_ASSISTANT, chargerConfigAssistant({})],
    ],
  });
  peuplerBafoussam(t.montage);
  t.montage.caisse.ajouterEcart(
    COMPAGNIE,
    ecart({ jour: "2026-12-29" }),
    ecart({ jour: "2027-01-02" }),
    ecart({ jour: "2027-01-04" }),
  );
  patronAlpha = await t.compte("patron");
  patronBeta = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE });
  patronSansCompagnie = await t.compte("patron", { compagnieId: null });
  for (const role of ["comptable", "superviseur", "guichetier", "voyageur", "afrimove"] as const) {
    autres[role] = await t.compte(role, {
      compagnieId: role === "voyageur" || role === "afrimove" ? null : COMPAGNIE,
    });
  }
});
afterAll(() => t.fermer());
beforeEach(() => {
  // La limite de questions se compte à la minute : chaque test repart d'une minute neuve.
  t.montage.horloge.avancer(2 * 60_000);
  modele.reponse = null;
  modele.erreur = null;
  t.montage.departs.enPanne = false;
});

const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
const get = (chemin: string, jeton = patronAlpha.jeton) => t.http().get(chemin).set(avec(jeton));
const post = (chemin: string, corps: unknown, jeton = patronAlpha.jeton) =>
  t
    .http()
    .post(chemin)
    .set(avec(jeton))
    .send(corps as object);
const signature = (pin = patronAlpha.pin) => ({
  pin,
  methode: "pin" as const,
  signeA: versIsoDouala(t.montage.horloge.maintenant()),
});

const ROUTES: Array<["get" | "post", string, unknown?]> = [
  ["get", "/patron/assistant/insights"],
  ["get", "/patron/assistant/conversation"],
  ["post", "/patron/assistant/questions", { question: "Pourquoi Bafoussam baisse ?" }],
  ["post", "/patron/assistant/simulations", { type: "prix", departId: "x", nouveauPrix: 3_500 }],
  ["post", "/patron/assistant/propositions", { actionId: "x", signature: {} }],
];

function appeler(route: (typeof ROUTES)[number], jeton?: string) {
  const [methode, chemin, corps] = route;
  const requete = t.http()[methode](chemin);
  const authentifiee = jeton ? requete.set(avec(jeton)) : requete;
  return methode === "post" ? authentifiee.send(corps as object) : authentifiee;
}

describe("accès", () => {
  it("exige un jeton", async () => {
    for (const route of ROUTES) await appeler(route).expect(401);
  });

  it("est réservé au patron : tous les autres rôles reçoivent 403, et le refus est tracé", async () => {
    for (const route of ROUTES) {
      for (const r of Object.values(autres)) await appeler(route, r.jeton).expect(403);
    }
    expect(
      t.auditRepo.lignes.filter((l) => l.action === "acces.refuse").length,
    ).toBeGreaterThanOrEqual(ROUTES.length * Object.keys(autres).length);
  });

  it("refuse un patron sans compagnie", async () => {
    for (const route of ROUTES) {
      const r = await appeler(route, patronSansCompagnie.jeton).expect(403);
      expect(r.body).toMatchObject({ code: "HORS_PERIMETRE" });
    }
  });
});

describe("GET /patron/assistant/insights", () => {
  it("rend les fuites et les gains conformes au contrat, sans cache", async () => {
    const r = await get("/patron/assistant/insights").expect(200);
    const lu = patron.InsightsAssistantSchema.parse(r.body);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(lu.fuites.length).toBeGreaterThan(0);
    expect(lu.gains.length).toBeGreaterThan(0);
    expect(lu.questionsSuggerees.length).toBeGreaterThan(0);
  });

  it("une compagnie sans départ n'a rien à signaler (listes vides)", async () => {
    const r = await get("/patron/assistant/insights", patronBeta.jeton).expect(200);
    expect(patron.InsightsAssistantSchema.parse(r.body)).toMatchObject({ fuites: [], gains: [] });
  });

  it("503 SOURCE_INDISPONIBLE quand les départs ne se lisent pas", async () => {
    t.montage.departs.enPanne = true;
    const r = await get("/patron/assistant/insights").expect(503);
    expect(r.body).toMatchObject({ statusCode: 503, code: "SOURCE_INDISPONIBLE" });
  });
});

describe("POST /patron/assistant/questions et GET conversation", () => {
  it("répond aux règles sans modèle, conforme au contrat, et garde l'échange", async () => {
    const r = await post("/patron/assistant/questions", {
      question: "Pourquoi Bafoussam baisse ?",
    }).expect(200);
    const lue = patron.ReponseAssistantSchema.parse(r.body);
    expect(lue.resume).toContain("Douala → Bafoussam");
    expect(lue.sources).toContain("Jamais les chiffres d'une autre compagnie");
    expect(r.headers["cache-control"]).toBe("no-store");
    // Le graphique du diagnostic et la ligne des actions « Voir la ligne » / « Ajouter un départ ».
    expect(lue.graphique?.valeurs).toHaveLength(14);
    expect(lue.graphique?.joursEnEcart.length).toBeGreaterThan(0);
    const voir = lue.actions.find((a) => a.type === "voir_ligne");
    expect(voir?.ligneId).toBeTruthy();
    expect(lue.actions.find((a) => a.type === "decaler_depart")?.ligneId).toBeUndefined();

    const conv = await get("/patron/assistant/conversation").expect(200);
    const lue2 = patron.ConversationAssistantSchema.parse(conv.body);
    expect(lue2.baseJours).toBe(30);
    expect(lue2.echanges.at(-1)?.question).toBe("Pourquoi Bafoussam baisse ?");
  });

  it("chaque patron ne voit que sa propre conversation", async () => {
    await post("/patron/assistant/questions", { question: "Combien coûte mon bus 330 ?" }).expect(
      200,
    );
    const beta = await get("/patron/assistant/conversation", patronBeta.jeton).expect(200);
    expect(beta.body.echanges).toEqual([]);
  });

  it("le modèle reçoit la question et les faits, sans téléphone, et ne change pas la forme de la réponse", async () => {
    modele.reponse = null;
    const r = await post("/patron/assistant/questions", {
      question: "Pourquoi Bafoussam baisse ?",
    }).expect(200);
    patron.ReponseAssistantSchema.parse(r.body);
    expect(modele.demandes.length).toBeGreaterThan(0);
    const envoye = JSON.stringify(modele.demandes.at(-1));
    expect(envoye).not.toContain("+237");
  });

  it("un modèle en panne ne se voit pas", async () => {
    modele.erreur = new Error("503 du fournisseur");
    const r = await post("/patron/assistant/questions", {
      question: "Pourquoi Bafoussam baisse ?",
    }).expect(200);
    patron.ReponseAssistantSchema.parse(r.body);
  });

  it("refuse une question vide, trop longue ou un champ en trop (400), comme le schéma du contrat", async () => {
    for (const corps of [
      {},
      { question: "" },
      { question: "   " },
      { question: "a".repeat(501) },
      { question: "Pourquoi ?", compagnieId: COMPAGNIE },
      { question: 12 },
    ]) {
      expect(patron.QuestionAssistantSchema.safeParse(corps).success).toBe(false);
      const r = await post("/patron/assistant/questions", corps).expect(400);
      expect(r.body).toMatchObject({ code: "REQUETE_INVALIDE" });
    }
  });

  it("429 TROP_DE_QUESTIONS au-delà de la limite par minute", async () => {
    let dernier = 200;
    for (let i = 0; i < 11 && dernier === 200; i += 1) {
      const r = await post("/patron/assistant/questions", { question: "Où part mon argent ?" });
      dernier = r.status;
      if (dernier === 429) expect(r.body).toMatchObject({ code: "TROP_DE_QUESTIONS" });
    }
    expect(dernier).toBe(429);
  });
});

describe("POST /patron/assistant/simulations", () => {
  it("simule un prix et un horaire, conforme au contrat, sans rien changer", async () => {
    const departId = await dernierDepart(t.montage, "10:00");
    const avant = (t.app.get(AppliquerActions, { strict: false }) as AppliquerActionsMemoire)
      .appliquees.length;
    const prix = await post("/patron/assistant/simulations", {
      type: "prix",
      departId,
      nouveauPrix: 3_500,
    }).expect(200);
    patron.ResultatSimulationSchema.parse(prix.body);
    const horaire = await post("/patron/assistant/simulations", {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    }).expect(200);
    patron.ResultatSimulationSchema.parse(horaire.body);
    const apres = (t.app.get(AppliquerActions, { strict: false }) as AppliquerActionsMemoire)
      .appliquees.length;
    expect(apres).toBe(avant);
  });

  it("404 pour un départ inconnu ou d'une autre compagnie, 400 pour un corps invalide", async () => {
    const departId = await dernierDepart(t.montage, "10:00");
    await post("/patron/assistant/simulations", {
      type: "prix",
      departId: "inconnu",
      nouveauPrix: 3_500,
    }).expect(404);
    await post(
      "/patron/assistant/simulations",
      { type: "prix", departId, nouveauPrix: 3_500 },
      patronBeta.jeton,
    ).expect(404);
    for (const corps of [
      {},
      { type: "prix", departId },
      { type: "prix", departId, nouveauPrix: -5 },
      { type: "prix", departId, nouveauPrix: 3_500.5 },
      { type: "horaire", departId, nouvelleHeure: "9h15" },
      { type: "autre", departId },
    ]) {
      expect(patron.DemandeSimulationSchema.safeParse(corps).success).toBe(false);
      await post("/patron/assistant/simulations", corps).expect(400);
    }
  });
});

describe("POST /patron/assistant/propositions (signature PIN réelle)", () => {
  async function actionProposee(type: string) {
    const r = await get("/patron/assistant/insights").expect(200);
    const lu = patron.InsightsAssistantSchema.parse(r.body);
    const toutes = [...lu.fuites.flatMap((f) => f.actions), ...lu.gains.map((g) => g.action)];
    const action = toutes.find((a) => a.type === type);
    expect(action, `une action « ${type} » devrait être proposée`).toBeDefined();
    return action as { id: string; type: string };
  }

  it("refuse sans signature (401), avec un mauvais PIN (403), puis applique avec le bon PIN et trace", async () => {
    const action = await actionProposee("controle_inopine");
    const appliquees = () =>
      (t.app.get(AppliquerActions, { strict: false }) as AppliquerActionsMemoire).appliquees;
    const avant = appliquees().length;

    const sans = await post("/patron/assistant/propositions", { actionId: action.id }).expect(401);
    expect(sans.body).toMatchObject({ code: "PIN_REQUIS" });

    const mauvais = await post("/patron/assistant/propositions", {
      actionId: action.id,
      signature: signature("000000"),
    }).expect(403);
    expect(mauvais.body).toMatchObject({ code: "PIN_INCORRECT" });
    expect(appliquees().length).toBe(avant);

    const ok = await post("/patron/assistant/propositions", {
      actionId: action.id,
      signature: signature(),
    }).expect(200);
    const lue = patron.PropositionAppliqueeSchema.parse(ok.body);
    expect(lue.actionId).toBe(action.id);
    expect(appliquees().length).toBe(avant + 1);

    const ligne = t.auditRepo.lignes.find((l) => l.id === lue.journalId);
    expect(ligne?.action).toBe("assistant.proposition.appliquer");
    expect(JSON.stringify(ligne?.details ?? {})).not.toContain(patronAlpha.pin);

    const deux = await post("/patron/assistant/propositions", {
      actionId: action.id,
      signature: signature(),
    }).expect(409);
    expect(deux.body).toMatchObject({ code: "PROPOSITION_DEJA_APPLIQUEE" });
  });

  it("404 pour une proposition inconnue ou d'une autre compagnie", async () => {
    const action = await actionProposee("decaler_depart");
    await post("/patron/assistant/propositions", {
      actionId: "decaler_depart:inventee:0915",
      signature: signature(),
    }).expect(404);
    const autre = await post(
      "/patron/assistant/propositions",
      { actionId: action.id, signature: signature() },
      patronBeta.jeton,
    ).expect(404);
    expect(autre.body).toMatchObject({ code: "PROPOSITION_INCONNUE" });
  });

  it("refuse une signature périmée (422) et un corps invalide", async () => {
    const action = await actionProposee("decaler_depart");
    const vieille = {
      pin: patronAlpha.pin,
      methode: "pin",
      signeA: versIsoDouala(new Date(t.montage.horloge.maintenant().getTime() - 60 * 60_000)),
    };
    const r = await post("/patron/assistant/propositions", {
      actionId: action.id,
      signature: vieille,
    }).expect(422);
    expect(r.body).toMatchObject({ code: "SIGNATURE_PERIMEE" });
    for (const corps of [{}, { actionId: "a".repeat(300), signature: signature() }]) {
      await post("/patron/assistant/propositions", corps).expect((res) => {
        expect([401, 422]).toContain(res.status);
      });
    }
  });
});

describe("avec le client d'API en mode HTTP (@afrimove/api-client)", () => {
  it("les cinq opérations patron.assistant.* fonctionnent sur le serveur, réponses validées par le contrat", async () => {
    const ops = await import("../../../../packages/api-client/src/patron/operations");
    const { creerClientHttp } = await import("../../../../packages/api-client/src/infra/http");
    await t.app.listen(0, "127.0.0.1");
    const { port } = t.app.getHttpServer().address() as AddressInfo;
    const client = creerClientHttp({
      urlBase: `http://127.0.0.1:${port}`,
      obtenirJeton: () => patronAlpha.jeton,
      relance: { max: 0 },
    });

    const insights = await client.executer(ops.OP_INSIGHTS, undefined);
    expect(insights.fuites.length).toBeGreaterThan(0);

    const reponse = await client.executer(ops.OP_QUESTION_ASSISTANT, {
      question: "Quel jour je remplis le mieux ?",
    });
    expect(reponse.resume.length).toBeGreaterThan(0);

    const conversation = await client.executer(ops.OP_CONVERSATION, undefined);
    expect(conversation.echanges.length).toBeGreaterThan(0);

    const departId = await dernierDepart(t.montage, "10:00");
    const simulation = await client.executer(ops.OP_SIMULATION, {
      type: "prix",
      departId,
      nouveauPrix: 3_500,
    });
    expect(simulation.demande.type).toBe("prix");

    const action = [
      ...insights.fuites.flatMap((f) => f.actions),
      ...insights.gains.map((g) => g.action),
    ].find((a) => a.type === "decaler_depart");
    expect(action).toBeDefined();
    const appliquee = await client.executer(ops.OP_APPLIQUER_PROPOSITION, {
      actionId: action!.id,
      signature: signature(),
    });
    expect(appliquee.actionId).toBe(action!.id);
  });
});
