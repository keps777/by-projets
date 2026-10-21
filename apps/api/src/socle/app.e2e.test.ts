import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documentOpenApi } from "./configurer-app";
import {
  EvenementInvalide,
  EvenementsService,
  type EvenementMetier,
} from "./evenements/evenements.service";
import { creerAppTest, type AppTest } from "./testing/app-test";
import { jetonPour } from "./testing/jetons";

describe("santé", () => {
  let t: AppTest;
  beforeAll(async () => {
    t = await creerAppTest();
  });
  afterAll(() => t.fermer());

  it("GET /health répond 200 sans authentification quand la base répond", async () => {
    const rep = await t.http().get("/health");
    expect(rep.status).toBe(200);
    expect(rep.body).toMatchObject({ statut: "ok", base: "ok" });
  });

  it("GET /health répond 503 quand la base ne répond pas", async () => {
    t.baseJoignable.valeur = false;
    const rep = await t.http().get("/health");
    t.baseJoignable.valeur = true;
    expect(rep.status).toBe(503);
    expect(rep.body).toMatchObject({ statut: "degrade", base: "indisponible" });
  });

  it("ne révèle ni la pile technologique ni de détail d'erreur", async () => {
    const rep = await t.http().get("/health");
    expect(rep.headers["x-powered-by"]).toBeUndefined();
    expect(rep.headers["x-content-type-options"]).toBe("nosniff");
    const inconnue = await t.http().get("/route-inexistante");
    expect(inconnue.status).toBe(404);
    expect(JSON.stringify(inconnue.body)).not.toMatch(/node_modules|\.ts:/);
  });
});

describe("OpenAPI", () => {
  let t: AppTest;
  beforeAll(async () => {
    t = await creerAppTest();
  });
  afterAll(() => t.fermer());

  it("décrit toutes les routes du socle, leur sécurité et leurs schémas", () => {
    const doc = documentOpenApi(t.app);
    // `AppModule` monte aussi les modules métier (leurs routes ont leurs propres tests) : on
    // vérifie ici que toutes les routes du socle sont décrites.
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/me",
        "/voyageur/connexion/code",
        "/voyageur/connexion/verification",
        "/auth/guichet/connexion",
        "/auth/direction/connexion",
        "/auth/direction/verification",
        "/patron/journal-audit",
        "/afrimove/journal-audit/verification",
      ]),
    );
    // La connexion du voyageur n'existe qu'une fois : celle de `src/auth-voyageur` (4 chiffres, WebOTP).
    expect(Object.keys(doc.paths)).not.toContain("/auth/voyageur/code");
    expect(Object.keys(doc.paths)).not.toContain("/auth/voyageur/verification");
    expect(doc.components?.securitySchemes).toHaveProperty("bearer");
    // Les routes protégées déclarent le jeton ; les routes publiques non.
    expect(doc.paths["/patron/journal-audit"]?.get?.security).toEqual([{ bearer: [] }]);
    expect(doc.paths["/health"]?.get?.security).toBeUndefined();
    expect(doc.paths["/auth/guichet/connexion"]?.post?.security).toBeUndefined();
    expect(doc.components?.schemas).toHaveProperty("ConnexionPinDto");
    expect(doc.components?.schemas).toHaveProperty("JetonReponse");
  });

  it("sert /openapi.json et l'interface /docs", async () => {
    const json = await t.http().get("/openapi.json");
    expect(json.status).toBe(200);
    expect(json.body.openapi).toMatch(/^3\./);
    expect((await t.http().get("/docs")).status).toBe(200);
  });

  it("peut être désactivée par OPENAPI_ENABLED=false", async () => {
    const sans = await creerAppTest({ config: { OPENAPI_ENABLED: "false" } });
    try {
      expect((await sans.http().get("/openapi.json")).status).toBe(404);
    } finally {
      await sans.fermer();
    }
  });
});

describe("journal d'audit exposé au patron", () => {
  let t: AppTest;
  beforeAll(async () => {
    t = await creerAppTest();
  });
  afterAll(() => t.fermer());

  const COMPAGNIE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const COMPAGNIE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("le patron ne voit que le journal de sa compagnie", async () => {
    const a = await jetonPour(t, "patron", { compagnieId: COMPAGNIE_A });
    const b = await jetonPour(t, "patron", { compagnieId: COMPAGNIE_B });
    await t.audit.enregistrer({
      action: "test.a",
      resultat: "succes",
      acteur: { id: a.id, role: "patron", compagnieId: COMPAGNIE_A },
    });
    await t.audit.enregistrer({
      action: "test.b",
      resultat: "succes",
      acteur: { id: b.id, role: "patron", compagnieId: COMPAGNIE_B },
    });

    const rep = await t
      .http()
      .get("/patron/journal-audit?limite=100")
      .set("Authorization", `Bearer ${a.jeton}`);
    expect(rep.status).toBe(200);
    const actions = (rep.body as Array<{ action: string; acteurId: string }>).map((l) => l.action);
    expect(actions).toContain("test.a");
    expect(actions).not.toContain("test.b");
    for (const ligne of rep.body as Array<{ acteurId: string }>) expect(ligne.acteurId).toBe(a.id);
  });

  it("un patron sans compagnie rattachée n'obtient rien", async () => {
    const orphelin = await jetonPour(t, "patron", { compagnieId: null });
    const rep = await t
      .http()
      .get("/patron/journal-audit")
      .set("Authorization", `Bearer ${orphelin.jeton}`);
    expect(rep.status).toBe(403);
  });

  it("valide les paramètres de pagination", async () => {
    const a = await jetonPour(t, "patron", { compagnieId: COMPAGNIE_A });
    const get = (q: string) =>
      t.http().get(`/patron/journal-audit?${q}`).set("Authorization", `Bearer ${a.jeton}`);
    expect((await get("limite=0")).status).toBe(400);
    expect((await get("limite=1000")).status).toBe(400);
    expect((await get("avant=abc")).status).toBe(400);
    expect((await get("limite=2&avant=999999")).status).toBe(200);
  });

  it("il n'existe aucune route pour modifier ou effacer le journal", async () => {
    const a = await jetonPour(t, "patron", { compagnieId: COMPAGNIE_A });
    for (const methode of ["post", "put", "patch", "delete"] as const) {
      const rep = await t
        .http()
        [methode]("/patron/journal-audit")
        .set("Authorization", `Bearer ${a.jeton}`);
      expect(rep.status, methode).toBe(404);
    }
  });

  it("la vérification de la chaîne est réservée à AfriMove", async () => {
    const afrimove = await jetonPour(t, "afrimove");
    const patron = await jetonPour(t, "patron", { compagnieId: COMPAGNIE_A });
    expect(
      (
        await t
          .http()
          .get("/afrimove/journal-audit/verification")
          .set("Authorization", `Bearer ${patron.jeton}`)
      ).status,
    ).toBe(403);
    const rep = await t
      .http()
      .get("/afrimove/journal-audit/verification")
      .set("Authorization", `Bearer ${afrimove.jeton}`);
    expect(rep.status).toBe(200);
    expect(rep.body).toMatchObject({ valide: true });
  });
});

describe("journal d'événements", () => {
  const evenement = (surcharge: Partial<EvenementMetier> = {}): EvenementMetier => ({
    id: "11111111-1111-4111-8111-111111111111",
    type: "billet.annule",
    at: new Date("2026-11-02T08:00:00.000Z"),
    appareilId: null,
    auteurId: null,
    cible: { type: "billet", id: "22222222-2222-4222-8222-222222222222" },
    numeroPlage: 232,
    donnees: { motif: "client absent" },
    ...surcharge,
  });

  let t: AppTest;
  let service: EvenementsService;
  beforeAll(async () => {
    t = await creerAppTest();
    service = t.app.get(EvenementsService);
  });
  afterAll(() => t.fermer());

  it("ajoute un événement et ignore son rejeu", async () => {
    expect(await service.enregistrer(evenement())).toBe(true);
    expect(await service.enregistrer(evenement())).toBe(false);
    expect(await service.historique(evenement().cible)).toHaveLength(1);
  });

  it("refuse les événements mal formés", async () => {
    await expect(service.enregistrer(evenement({ id: "x" }))).rejects.toBeInstanceOf(
      EvenementInvalide,
    );
    await expect(service.enregistrer(evenement({ type: "Billet Annulé" }))).rejects.toBeInstanceOf(
      EvenementInvalide,
    );
    await expect(
      service.enregistrer(
        evenement({
          cible: { type: "avion" as never, id: "22222222-2222-4222-8222-222222222222" },
        }),
      ),
    ).rejects.toBeInstanceOf(EvenementInvalide);
    await expect(
      service.enregistrer(evenement({ at: new Date("n'importe quoi") })),
    ).rejects.toBeInstanceOf(EvenementInvalide);
  });

  it("n'expose ni modification ni suppression", () => {
    const methodes = Object.getOwnPropertyNames(EvenementsService.prototype);
    expect(methodes.sort()).toEqual(["constructor", "enregistrer", "historique"]);
  });
});
