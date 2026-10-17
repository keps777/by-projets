import { describe, expect, it, vi } from "vitest";
import {
  creerCanalHttp,
  lireCommande,
  type CommandeAppareil,
  type RapportEffacement,
} from "./canal";

const COMMANDE: CommandeAppareil = {
  id: "cmd-1",
  type: "effacer",
  emiseA: "2026-10-20T08:00:00Z",
  secretAcquittement: "secret-a-usage-unique",
};
const RAPPORT: RapportEffacement = { effaceA: "2026-10-20T08:00:05Z", complet: true, etapes: [] };

const reponse = (status: number, corps?: unknown) =>
  new Response(corps === undefined ? null : JSON.stringify(corps), { status });

describe("lireCommande", () => {
  it("accepte un ordre d'effacement complet", () => {
    expect(lireCommande(COMMANDE)).toEqual(COMMANDE);
  });

  it.each([
    ["null", null],
    ["un texte", "effacer"],
    ["un type inconnu", { ...COMMANDE, type: "verrouiller" }],
    ["sans identifiant", { ...COMMANDE, id: "" }],
    ["sans secret", { ...COMMANDE, secretAcquittement: "" }],
    ["une date illisible", { ...COMMANDE, emiseA: "hier" }],
    ["un identifiant numérique", { ...COMMANDE, id: 12 }],
  ])("refuse un ordre mal formé : %s", (_nom, valeur) => {
    expect(lireCommande(valeur)).toBeNull();
  });
});

describe("canal HTTP", () => {
  it("consulte l'ordre de l'appareil avec ses en-têtes d'authentification", async () => {
    const fetchFaux = vi.fn().mockResolvedValue(reponse(200, { commande: COMMANDE }));
    const canal = creerCanalHttp({
      urlBase: "/api/",
      fetch: fetchFaux,
      entetes: () => ({ Authorization: "Bearer jeton-appareil" }),
    });
    expect(await canal.prochaineCommande("appareil 7")).toEqual(COMMANDE);
    const [url, init] = fetchFaux.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/appareils/appareil%207/commande");
    expect(init.headers).toMatchObject({ Authorization: "Bearer jeton-appareil" });
    expect(init.cache).toBe("no-store");
  });

  it.each([
    ["204 : rien en attente", reponse(204)],
    ["404 : appareil inconnu du serveur", reponse(404)],
    ["commande nulle", reponse(200, { commande: null })],
    ["type d'ordre inconnu", reponse(200, { commande: { ...COMMANDE, type: "autre" } })],
    ["corps inattendu", reponse(200, "texte")],
  ])("renvoie « aucun ordre » pour %s", async (_nom, r) => {
    const canal = creerCanalHttp({ urlBase: "/api", fetch: vi.fn().mockResolvedValue(r) });
    expect(await canal.prochaineCommande("a1")).toBeNull();
  });

  it("lève une erreur quand le serveur est en panne (l'appelant réessaiera)", async () => {
    const canal = creerCanalHttp({
      urlBase: "/api",
      fetch: vi.fn().mockResolvedValue(reponse(503)),
    });
    await expect(canal.prochaineCommande("a1")).rejects.toThrow("HTTP 503");
  });

  it("accuse réception avec le secret de l'ordre, pas avec une session", async () => {
    const fetchFaux = vi.fn().mockResolvedValue(reponse(204));
    const canal = creerCanalHttp({
      urlBase: "/api",
      fetch: fetchFaux,
      entetes: () => ({ Authorization: "Bearer session-effacee" }),
    });
    await canal.acquitter("a1", COMMANDE, RAPPORT);
    const [url, init] = fetchFaux.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/appareils/a1/commandes/cmd-1/acquittement");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-a-usage-unique" });
    expect(JSON.parse(String(init.body))).toEqual(RAPPORT);
  });

  it.each([200, 204, 409, 410])(
    "accepte la réponse %i à l'accusé (déjà enregistré compris)",
    async (statut) => {
      const canal = creerCanalHttp({
        urlBase: "/api",
        fetch: vi.fn().mockResolvedValue(reponse(statut)),
      });
      await expect(canal.acquitter("a1", COMMANDE, RAPPORT)).resolves.toBeUndefined();
    },
  );

  it.each([401, 500])("lève une erreur sur la réponse %i à l'accusé", async (statut) => {
    const canal = creerCanalHttp({
      urlBase: "/api",
      fetch: vi.fn().mockResolvedValue(reponse(statut)),
    });
    await expect(canal.acquitter("a1", COMMANDE, RAPPORT)).rejects.toThrow(`HTTP ${statut}`);
  });
});
