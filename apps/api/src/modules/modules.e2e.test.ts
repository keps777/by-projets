import { patron } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ESSAIS_PIN_MAX } from "../socle/auth/auth.service";
import { ROLES, type Role } from "../socle/auth/roles";
import { CODES_MODULES } from "./catalogue";
import {
  AGENCE,
  AUTRE_AGENCE,
  BAFOUSSAM,
  DOUALA_AKWA,
  DOUALA_BONANJO,
  GARE_AUTRE_AGENCE,
  YAOUNDE_MVAN,
  creerAppModulesTest,
  type AppModulesTest,
} from "./testing/app-modules-test";

/**
 * Le moteur des modules en HTTP : gardes d'accès, signature PIN, règles métier (agence, gare, ville,
 * socle), trace d'audit, et effet sur les autres routes de l'API.
 */

let t: AppModulesTest;
let patronJeton: string;
let patronId: string;
let guichetierAkwa: string;
let guichetierYaounde: string;
let voyageurJeton: string;

/** Tout le journal d'audit en texte (les numéros d'ordre sont des BigInt). */
const journalEnTexte = () =>
  JSON.stringify(t.auditRepo.lignes, (_cle, valeur: unknown) =>
    typeof valeur === "bigint" ? valeur.toString() : valeur,
  );

const auth = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });

beforeAll(async () => {
  t = await creerAppModulesTest();
  const p = await t.compte("patron", { gareId: null });
  patronJeton = p.jeton;
  patronId = p.id;
  guichetierAkwa = (await t.compte("guichetier", { gareId: DOUALA_AKWA })).jeton;
  guichetierYaounde = (await t.compte("guichetier", { gareId: YAOUNDE_MVAN })).jeton;
  voyageurJeton = (await t.compte("voyageur", { compagnieId: null, gareId: null })).jeton;
});

afterAll(async () => {
  await t.fermer();
});

beforeEach(() => {
  // État neuf : les réglages repartent de l'état par défaut et le journal d'audit est vidé.
  (t.reglages as unknown as { parAgence: Map<string, unknown> }).parAgence.clear();
  t.auditRepo.lignes.length = 0;
});

async function changer(
  code: string,
  actif: boolean,
  portee: Record<string, unknown> = { type: "agence" },
  jeton = patronJeton,
) {
  return t
    .http()
    .put(`/patron/modules/${code}`)
    .set(auth(jeton))
    .send(t.corps(code, actif, portee));
}

async function actifs(jeton: string, requete = "") {
  const r = await t.http().get(`/modules/actifs${requete}`).set(auth(jeton));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const parCode = new Map(
    (r.body.modules as { code: string; actif: boolean }[]).map((m) => [m.code, m.actif]),
  );
  return { corps: r.body as Record<string, unknown>, visible: (code: string) => parCode.get(code) };
}

describe("accès", () => {
  it("refuse sans jeton", async () => {
    expect((await t.http().get("/patron/modules")).status).toBe(401);
    expect((await t.http().put("/patron/modules/colis").send({})).status).toBe(401);
    expect((await t.http().get("/modules/actifs")).status).toBe(401);
  });

  it("réserve le réglage au patron : aucun autre rôle ne le lit ni ne le modifie", async () => {
    for (const role of ROLES.filter((r) => r !== "patron")) {
      const { jeton } = await t.compte(role as Role);
      const lecture = await t.http().get("/patron/modules").set(auth(jeton));
      const ecriture = await changer("colis", false, { type: "agence" }, jeton);
      expect(lecture.status, `lecture ${role}`).toBe(403);
      expect(ecriture.status, `écriture ${role}`).toBe(403);
    }
    // Aucune trace de modification : rien n'a bougé.
    expect((await actifs(patronJeton)).visible("colis")).toBe(true);
  });

  it("laisse tout compte connecté lire les modules visibles", async () => {
    for (const role of ["guichetier", "convoyeur", "comptable", "superviseur", "patron"] as const) {
      const { jeton } = await t.compte(role);
      expect((await t.http().get("/modules/actifs").set(auth(jeton))).status, role).toBe(200);
    }
  });
});

describe("lecture du patron", () => {
  it("renvoie les 12 modules au format des contrats, 10 actifs par défaut", async () => {
    const r = await t.http().get("/patron/modules").set(auth(patronJeton));
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const lu = patron.ModulesAgenceSchema.parse(r.body);
    expect(lu.total).toBe(12);
    expect(lu.actifs).toBe(10);
    expect(lu.modules.map((m) => m.code)).toEqual([...CODES_MODULES]);
    const inactifs = lu.modules.filter((m) => !m.actif).map((m) => m.code);
    expect(inactifs).toEqual(["covoit_vendeurs", "financement"]);
    const socle = lu.modules.find((m) => m.code === "guichet_caisse");
    expect(socle).toMatchObject({ socle: true, actif: true, detail: "socle · toujours actif" });
    expect(lu.modules.filter((m) => m.socle)).toHaveLength(1);
  });
});

describe("masquer un module", () => {
  it("le retire pour toute l'agence : guichet, voyageur et patron le voient au prochain rafraîchissement", async () => {
    const avant = await actifs(guichetierAkwa);
    expect(avant.visible("colis")).toBe(true);

    const r = await changer("colis", false);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const accuse = patron.ModuleChangeSchema.parse(r.body);
    expect(accuse.module).toMatchObject({ code: "colis", actif: false, exceptions: [] });
    expect(accuse.signePar).toBe(patronId);

    // Guichet, autre gare, voyageur (qui nomme l'agence) : le module a disparu partout.
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(false);
    expect((await actifs(guichetierYaounde)).visible("colis")).toBe(false);
    expect((await actifs(voyageurJeton, `?agence=${AGENCE}`)).visible("colis")).toBe(false);
    expect((await actifs(patronJeton)).visible("colis")).toBe(false);
    // Les autres modules ne bougent pas.
    expect((await actifs(guichetierAkwa)).visible("relais")).toBe(true);
    // Le patron lit 9 actifs sur 12.
    const liste = patron.ModulesAgenceSchema.parse(
      (await t.http().get("/patron/modules").set(auth(patronJeton))).body,
    );
    expect(liste.actifs).toBe(9);
  });

  it("ne touche pas une autre agence", async () => {
    await changer("colis", false);
    const autrePatron = await t.compte("patron", { compagnieId: AUTRE_AGENCE, gareId: null });
    const liste = patron.ModulesAgenceSchema.parse(
      (await t.http().get("/patron/modules").set(auth(autrePatron.jeton))).body,
    );
    expect(liste.modules.find((m) => m.code === "colis")?.actif).toBe(true);
    // Le patron de l'autre agence agit sur la sienne seulement.
    const r = await changer("relais", false, { type: "agence" }, autrePatron.jeton);
    expect(r.status).toBe(200);
    expect((await actifs(patronJeton)).visible("relais")).toBe(true);
  });

  it("est sans perte : le rallumer rend le module tel quel, avec ses exceptions remises à plat", async () => {
    await changer("relais", false);
    expect((await actifs(guichetierAkwa)).visible("relais")).toBe(false);
    await changer("relais", true);
    expect((await actifs(guichetierAkwa)).visible("relais")).toBe(true);
  });

  it("est idempotent : refaire le même changement donne le même état", async () => {
    await changer("ussd", false);
    const r = await changer("ussd", false);
    expect(r.status).toBe(200);
    expect(r.body.module).toMatchObject({ code: "ussd", actif: false, exceptions: [] });
  });
});

describe("le socle « Guichet et caisse » ne se masque pas", () => {
  it.each([
    ["agence", { type: "agence" }],
    ["gare", { type: "gare", id: DOUALA_AKWA }],
    ["ville", { type: "ville", nom: "Douala" }],
  ])("refuse 409 MODULE_SOCLE à la portée %s", async (_nom, portee) => {
    const r = await changer("guichet_caisse", false, portee);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("MODULE_SOCLE");
    expect((await actifs(guichetierAkwa)).visible("guichet_caisse")).toBe(true);
    const liste = patron.ModulesAgenceSchema.parse(
      (await t.http().get("/patron/modules").set(auth(patronJeton))).body,
    );
    expect(liste.modules.find((m) => m.code === "guichet_caisse")).toMatchObject({
      actif: true,
      exceptions: [],
    });
    // Le refus est tracé.
    const refus = t.auditRepo.lignes.filter(
      (l) => l.action === "module.changer" && l.resultat === "refus",
    );
    expect(refus).toHaveLength(1);
    expect(refus[0]?.details).toMatchObject({ module: "guichet_caisse", cause: "MODULE_SOCLE" });
  });

  it("accepte de le « rallumer » sans rien enregistrer", async () => {
    const r = await changer("guichet_caisse", true, { type: "gare", id: DOUALA_AKWA });
    expect(r.status).toBe(200);
    expect(r.body.module.exceptions).toEqual([]);
  });

  it("reste visible même si l'état stocké dit le contraire", async () => {
    await t.reglages.definirAgence(AGENCE, "guichet_caisse", false);
    expect((await actifs(guichetierAkwa)).visible("guichet_caisse")).toBe(true);
    expect(await t.modules.estActif(AGENCE, "guichet_caisse")).toBe(true);
  });
});

describe("par gare et par ville", () => {
  it("allume un module éteint pour une ville seulement", async () => {
    const r = await changer("covoit_vendeurs", true, { type: "ville", nom: "Douala" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const module = patron.ModuleChangeSchema.parse(r.body).module;
    expect(module.actif).toBe(false); // la règle de l'agence ne change pas
    expect(module.exceptions).toEqual([{ portee: { type: "ville", nom: "Douala" }, actif: true }]);

    expect((await actifs(guichetierAkwa)).visible("covoit_vendeurs")).toBe(true);
    expect((await actifs(guichetierYaounde)).visible("covoit_vendeurs")).toBe(false);
    // Un voyageur qui parcourt les départs de Douala, sans gare.
    expect(
      (await actifs(voyageurJeton, `?agence=${AGENCE}&ville=Douala`)).visible("covoit_vendeurs"),
    ).toBe(true);
    expect(
      (await actifs(voyageurJeton, `?agence=${AGENCE}&ville=Yaoundé`)).visible("covoit_vendeurs"),
    ).toBe(false);
    expect((await actifs(voyageurJeton, `?agence=${AGENCE}`)).visible("covoit_vendeurs")).toBe(
      false,
    );
  });

  it("masque un module dans une seule gare", async () => {
    await changer("colis", false, { type: "gare", id: DOUALA_BONANJO });
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
    expect((await actifs(guichetierYaounde)).visible("colis")).toBe(true);
    const bonanjo = await t.compte("guichetier", { gareId: DOUALA_BONANJO });
    expect((await actifs(bonanjo.jeton)).visible("colis")).toBe(false);
    // Le patron peut aussi regarder à travers une gare.
    expect((await actifs(patronJeton, `?gare=${DOUALA_BONANJO}`)).visible("colis")).toBe(false);
    expect((await actifs(patronJeton, `?gare=${DOUALA_AKWA}`)).visible("colis")).toBe(true);
  });

  it("la gare l'emporte sur la ville, la ville sur l'agence", async () => {
    await changer("colis", false, { type: "ville", nom: "Douala" });
    await changer("colis", true, { type: "gare", id: DOUALA_BONANJO });
    const bonanjo = await t.compte("guichetier", { gareId: DOUALA_BONANJO });
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(false); // ville éteinte
    expect((await actifs(bonanjo.jeton)).visible("colis")).toBe(true); // gare rallumée
    expect((await actifs(guichetierYaounde)).visible("colis")).toBe(true); // agence
  });

  it("une exception égale à la règle dont elle hérite disparaît", async () => {
    await changer("colis", false, { type: "ville", nom: "Douala" });
    // Akwa suit déjà Douala (éteint) : demander « éteint » ne crée rien.
    let r = await changer("colis", false, { type: "gare", id: DOUALA_AKWA });
    expect(r.body.module.exceptions).toEqual([
      { portee: { type: "ville", nom: "Douala" }, actif: false },
    ]);
    // Rallumer la ville à la valeur de l'agence retire son exception.
    r = await changer("colis", true, { type: "ville", nom: "Douala" });
    expect(r.body.module.exceptions).toEqual([]);
  });

  it("« toute l'agence » remet tout à plat", async () => {
    await changer("colis", false, { type: "ville", nom: "Douala" });
    await changer("colis", false, { type: "gare", id: YAOUNDE_MVAN });
    const r = await changer("colis", true);
    expect(r.body.module).toMatchObject({ actif: true, exceptions: [] });
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
    expect((await actifs(guichetierYaounde)).visible("colis")).toBe(true);
  });

  it("reconnaît la ville sans tenir compte des accents ni de la casse et la renvoie à l'officielle", async () => {
    const r = await changer("financement", true, { type: "ville", nom: "  yaounde " });
    expect(r.status).toBe(200);
    expect(r.body.module.exceptions).toEqual([
      { portee: { type: "ville", nom: "Yaoundé" }, actif: true },
    ]);
    expect((await actifs(guichetierYaounde)).visible("financement")).toBe(true);
    expect(
      (await actifs(voyageurJeton, `?agence=${AGENCE}&ville=YAOUNDE`)).visible("financement"),
    ).toBe(true);
  });

  it("refuse une gare d'une autre agence et une ville sans gare", async () => {
    let r = await changer("colis", false, { type: "gare", id: GARE_AUTRE_AGENCE });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("GARE_INCONNUE");
    r = await changer("colis", false, { type: "ville", nom: "Garoua" });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("VILLE_INCONNUE");
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
  });

  it("deux réglages simultanés de deux gares se cumulent sans s'écraser", async () => {
    const [a, b] = await Promise.all([
      changer("colis", false, { type: "gare", id: DOUALA_AKWA }),
      changer("colis", false, { type: "gare", id: BAFOUSSAM }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const liste = patron.ModulesAgenceSchema.parse(
      (await t.http().get("/patron/modules").set(auth(patronJeton))).body,
    );
    const gares = liste.modules
      .find((m) => m.code === "colis")
      ?.exceptions.map((e) => (e.portee.type === "gare" ? e.portee.id : ""))
      .sort();
    expect(gares).toEqual([BAFOUSSAM, DOUALA_AKWA].sort());
  });
});

describe("lecture des modules visibles", () => {
  it("un compte d'agence lit sa propre agence et sa gare ; il ne peut pas lire une autre agence", async () => {
    const { corps } = await actifs(guichetierAkwa);
    expect(corps).toMatchObject({ agenceId: AGENCE, gareId: DOUALA_AKWA, ville: "Douala" });
    expect((corps.modules as unknown[]).length).toBe(12);
    const autre = await t
      .http()
      .get(`/modules/actifs?agence=${AUTRE_AGENCE}`)
      .set(auth(guichetierAkwa));
    expect(autre.status).toBe(403);
    expect(autre.body.code).toBe("AGENCE_INTERDITE");
    // Nommer sa propre agence est permis.
    expect(
      (await t.http().get(`/modules/actifs?agence=${AGENCE}`).set(auth(guichetierAkwa))).status,
    ).toBe(200);
  });

  it("un voyageur doit nommer une agence connue", async () => {
    const sans = await t.http().get("/modules/actifs").set(auth(voyageurJeton));
    expect(sans.status).toBe(400);
    expect(sans.body.code).toBe("AGENCE_REQUISE");
    const inconnue = await t.http().get("/modules/actifs?agence=inconnue").set(auth(voyageurJeton));
    expect(inconnue.status).toBe(404);
    expect(inconnue.body.code).toBe("AGENCE_INCONNUE");
  });

  it("refuse une gare inconnue de l'agence", async () => {
    const r = await t
      .http()
      .get(`/modules/actifs?gare=${GARE_AUTRE_AGENCE}`)
      .set(auth(patronJeton));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("GARE_INCONNUE");
  });

  it("ne se met pas en cache : le prochain rafraîchissement voit le changement", async () => {
    const r = await t.http().get("/modules/actifs").set(auth(guichetierAkwa));
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("répond au format que le client attend", async () => {
    const { ModulesActifsSchema } = await import(
      "../../../../packages/api-client/src/modules/contrat"
    );
    const r = await t.http().get("/modules/actifs").set(auth(guichetierAkwa));
    const lu = ModulesActifsSchema.parse(r.body);
    expect(lu.modules.map((m) => m.code)).toEqual([...CODES_MODULES]);
  });
});

describe("signature PIN", () => {
  it("exige une signature : sans elle, 401 PIN_REQUIS et rien ne change", async () => {
    const sansSignature = { code: "colis", actif: false, portee: { type: "agence" } };
    const r = await t
      .http()
      .put("/patron/modules/colis")
      .set(auth(patronJeton))
      .send(sansSignature);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("PIN_REQUIS");
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
  });

  it("refuse un PIN faux (403) sans rien changer, et le trace sans jamais écrire le PIN", async () => {
    const r = await t
      .http()
      .put("/patron/modules/colis")
      .set(auth(patronJeton))
      .send(t.corps("colis", false, { type: "agence" }, "135792"));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("PIN_INCORRECT");
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
    const refus = t.auditRepo.lignes.filter((l) => l.action === "module.changer");
    expect(refus).toHaveLength(1);
    expect(refus[0]).toMatchObject({ resultat: "refus", acteurId: patronId });
    expect(journalEnTexte()).not.toContain("135792");
  });

  it("bloque après trois PIN faux, même ensuite avec le bon, jusqu'à l'expiration du blocage", async () => {
    const compte = await t.compte("patron", { gareId: null });
    for (let i = 0; i < ESSAIS_PIN_MAX; i++) {
      const r = await t
        .http()
        .put("/patron/modules/ussd")
        .set(auth(compte.jeton))
        .send(t.corps("ussd", false, { type: "agence" }, "999111"));
      expect(r.status).toBe(403);
    }
    const bloque = await changer("ussd", false, { type: "agence" }, compte.jeton);
    expect(bloque.status).toBe(423);
    expect(bloque.body.code).toBe("PIN_BLOQUE");
    expect((await actifs(guichetierAkwa)).visible("ussd")).toBe(true);

    t.horloge.avancer(16 * 60_000);
    const apres = await changer("ussd", false, { type: "agence" }, compte.jeton);
    expect(apres.status, JSON.stringify(apres.body)).toBe(200);
    expect((await actifs(guichetierAkwa)).visible("ussd")).toBe(false);
  });

  it("un PIN juste remet le compteur d'échecs à zéro", async () => {
    const compte = await t.compte("patron", { gareId: null });
    for (let i = 0; i < ESSAIS_PIN_MAX - 1; i++) {
      await t
        .http()
        .put("/patron/modules/ussd")
        .set(auth(compte.jeton))
        .send(t.corps("ussd", false, { type: "agence" }, "999111"));
    }
    expect((await changer("ussd", false, { type: "agence" }, compte.jeton)).status).toBe(200);
    for (let i = 0; i < ESSAIS_PIN_MAX - 1; i++) {
      const r = await t
        .http()
        .put("/patron/modules/ussd")
        .set(auth(compte.jeton))
        .send(t.corps("ussd", true, { type: "agence" }, "999111"));
      expect(r.status).toBe(403);
    }
    expect((await changer("ussd", true, { type: "agence" }, compte.jeton)).status).toBe(200);
  });

  it("refuse une signature datée trop loin de l'heure du serveur (rejeu)", async () => {
    const corps = t.corps("colis", false);
    corps.signature.signeA = t.iso(-30 * 60_000);
    const r = await t.http().put("/patron/modules/colis").set(auth(patronJeton)).send(corps);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("SIGNATURE_PERIMEE");
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
  });

  it("refuse un compte patron qui n'a pas de PIN", async () => {
    const sansPin = await t.compte("patron", { gareId: null });
    t.personnes.modifier(sansPin.id, { pinHache: null });
    const r = await changer("colis", false, { type: "agence" }, sansPin.jeton);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PIN_NON_DEFINI");
  });

  it("accepte la confirmation par empreinte, qui porte aussi le PIN", async () => {
    const corps = t.corps("colis", false);
    corps.signature.methode = "empreinte";
    const r = await t.http().put("/patron/modules/colis").set(auth(patronJeton)).send(corps);
    expect(r.status).toBe(200);
    const ligne = t.auditRepo.lignes.find((l) => l.action === "module.changer");
    expect(ligne?.details).toMatchObject({ signature: "empreinte" });
  });
});

describe("corps de la commande", () => {
  it("rejette un corps mal formé (422 COMMANDE_INVALIDE)", async () => {
    const base = t.corps("colis", false);
    const cas: [string, unknown][] = [
      ["actif absent", { ...base, actif: "non" }],
      ["portée absente", { ...base, portee: undefined }],
      ["portée gare sans id", { ...base, portee: { type: "gare" } }],
      ["portée ville vide", { ...base, portee: { type: "ville", nom: " " } }],
      ["portée inconnue", { ...base, portee: { type: "pays" } }],
      ["champ en trop", { ...base, extra: 1 }],
    ];
    for (const [nom, corps] of cas) {
      const r = await t
        .http()
        .put("/patron/modules/colis")
        .set(auth(patronJeton))
        .send(corps as object);
      expect(r.status, nom).toBe(422);
      expect(r.body.code, nom).toBe("COMMANDE_INVALIDE");
    }
    expect((await actifs(guichetierAkwa)).visible("colis")).toBe(true);
  });

  it("rejette un code d'URL différent de celui du corps", async () => {
    const r = await t
      .http()
      .put("/patron/modules/relais")
      .set(auth(patronJeton))
      .send(t.corps("colis", false));
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("COMMANDE_INVALIDE");
  });

  it("rejette un module inconnu (404 MODULE_INCONNU)", async () => {
    const r = await changer("teleportation", false);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("MODULE_INCONNU");
  });

  it("refuse un patron sans agence", async () => {
    const orphelin = await t.compte("patron", { compagnieId: null, gareId: null });
    const r = await changer("colis", false, { type: "agence" }, orphelin.jeton);
    expect(r.status).toBe(403);
  });
});

describe("chaque changement est tracé", () => {
  it("écrit une ligne d'audit par changement, liée à l'accusé, sans casser la chaîne", async () => {
    const r1 = await changer("colis", false);
    const r2 = await changer("covoit_vendeurs", true, { type: "ville", nom: "Douala" });
    const lignes = t.auditRepo.lignes.filter((l) => l.action === "module.changer");
    expect(lignes).toHaveLength(2);
    expect(lignes.map((l) => l.id)).toEqual([r1.body.journalId, r2.body.journalId]);
    expect(lignes[0]).toMatchObject({
      resultat: "succes",
      acteurId: patronId,
      acteurRole: "patron",
      compagnieId: AGENCE,
      cibleType: "module",
      cibleId: "colis",
    });
    expect(lignes[0]?.details).toMatchObject({
      module: "colis",
      demande: false,
      portee: { type: "agence" },
      avant: true,
      apres: false,
    });
    expect(lignes[1]?.details).toMatchObject({
      module: "covoit_vendeurs",
      portee: { type: "ville", nom: "Douala" },
      avant: false,
      apres: true,
      exceptionsAvant: 0,
      exceptionsApres: 1,
    });
    expect((await t.audit.verifierChaine()).valide).toBe(true);
    // Le PIN ne figure nulle part dans le journal.
    expect(journalEnTexte()).not.toContain("482915");
  });

  it("date l'accusé avec l'heure du serveur, pas celle de l'appareil", async () => {
    const r = await changer("colis", false);
    expect(r.body.signeA).toBe(t.iso());
  });

  it("le patron relit l'historique de ses changements par le journal d'audit de sa compagnie", async () => {
    await changer("colis", false);
    await changer("financement", true, { type: "gare", id: BAFOUSSAM });
    const r = await t.http().get("/patron/journal-audit").set(auth(patronJeton));
    expect(r.status).toBe(200);
    const modules = (r.body as { action: string; cibleId: string; resultat: string }[])
      .filter((l) => l.action === "module.changer")
      .map((l) => [l.cibleId, l.resultat]);
    expect(modules).toEqual([
      ["financement", "succes"],
      ["colis", "succes"],
    ]);
  });
});

describe("@ModuleRequis : un module masqué disparaît des autres routes de l'API", () => {
  it("laisse passer tant que le module est actif", async () => {
    expect((await t.http().get("/colis-test/liste").set(auth(guichetierAkwa))).status).toBe(200);
  });

  it("répond 404 MODULE_MASQUE quand l'agence masque le module, sans toucher aux données", async () => {
    await changer("colis", false);
    const r = await t.http().get("/colis-test/liste").set(auth(guichetierAkwa));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("MODULE_MASQUE");
    await changer("colis", true);
    expect((await t.http().get("/colis-test/liste").set(auth(guichetierAkwa))).status).toBe(200);
  });

  it("ne masque que la ville ou la gare réglée", async () => {
    await changer("colis", false, { type: "ville", nom: "Yaoundé" });
    expect((await t.http().get("/colis-test/liste").set(auth(guichetierAkwa))).status).toBe(200);
    expect((await t.http().get("/colis-test/liste").set(auth(guichetierYaounde))).status).toBe(404);
  });

  it("ne masque jamais le socle", async () => {
    await changer("guichet_caisse", false);
    expect((await t.http().get("/colis-test/caisse").set(auth(guichetierAkwa))).status).toBe(200);
  });
});
