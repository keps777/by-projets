import { describe, expect, it, vi } from "vitest";
import { ErreurAnnulee, ErreurDelai, ErreurHttp, ErreurReseau, ErreurValidation } from "./erreurs";
import { creerClientHttp } from "./http";
import type { OptionsHttp, SocketLike } from "./http";
import { CANAL_POSITION, DEPARTS_DEMO, OP_DEPARTS, OP_RESERVER } from "./exemples";

function json(corps: unknown, statut = 200, entetes: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json", ...entetes },
  });
}

function client(fetchFactice: typeof fetch, extra: Partial<OptionsHttp> = {}) {
  return creerClientHttp({
    urlBase: "https://api.afrimove.test/v1/",
    fetch: fetchFactice,
    relance: { max: 2, delaiMs: 1, delaiMaxMs: 2 },
    alea: () => 0.5,
    ...extra,
  });
}

describe("adaptateur HTTP", () => {
  it("appelle apps/api avec la bonne requête et valide la réponse", async () => {
    const f = vi.fn<typeof fetch>(async () => json(DEPARTS_DEMO));
    const c = client(f, { obtenirJeton: () => "jeton-123" });

    await expect(c.executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual(DEPARTS_DEMO);

    expect(c.mode).toBe("http");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.afrimove.test/v1/departs?gare=DLA");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer jeton-123",
    });
  });

  it("envoie le corps JSON d'un POST", async () => {
    const f = vi.fn<typeof fetch>(async () => json({ billetId: "b9" }, 201));
    const c = client(f);
    await expect(c.executer(OP_RESERVER, { departId: "d1", siege: 7 })).resolves.toEqual({
      billetId: "b9",
    });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.afrimove.test/v1/departs/d1/billets");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ siege: 7 }));
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("type les erreurs HTTP avec le code du serveur et ne relance pas un 4xx", async () => {
    const f = vi.fn<typeof fetch>(async () =>
      json(
        { code: "DEPART_INTROUVABLE", message: "Départ introuvable", details: { id: "d1" } },
        404,
      ),
    );
    const erreur = await client(f)
      .executer(OP_DEPARTS, { gare: "XXX" })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurHttp);
    expect(erreur).toMatchObject({
      genre: "http",
      statut: 404,
      code: "DEPART_INTROUVABLE",
      message: "Départ introuvable",
      details: { id: "d1" },
      retentable: false,
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("relance une opération idempotente sur 503 puis réussit", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ message: "indisponible" }, 503))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(DEPARTS_DEMO));
    await expect(client(f).executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual(DEPARTS_DEMO);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("abandonne après le nombre maximal de relances", async () => {
    const f = vi.fn<typeof fetch>(async () => json({}, 500));
    await expect(client(f).executer(OP_DEPARTS, { gare: "DLA" })).rejects.toMatchObject({
      statut: 500,
    });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("ne relance jamais un POST non idempotent", async () => {
    const f = vi.fn<typeof fetch>(async () => json({}, 503));
    await expect(
      client(f).executer(OP_RESERVER, { departId: "d1", siege: 1 }),
    ).rejects.toBeInstanceOf(ErreurHttp);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("respecte Retry-After (plafonné)", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { "Retry-After": "0" }))
      .mockResolvedValueOnce(json(DEPARTS_DEMO));
    await expect(client(f).executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual(DEPARTS_DEMO);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("type une panne réseau", async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const c = client(f, { relance: { max: 0 } });
    await expect(c.executer(OP_DEPARTS, { gare: "DLA" })).rejects.toBeInstanceOf(ErreurReseau);
  });

  it("type un dépassement de délai", async () => {
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_ok, ko) => {
          init?.signal?.addEventListener("abort", () =>
            ko(new DOMException("abort", "AbortError")),
          );
        }),
    );
    const c = client(f, { delaiMs: 5, relance: { max: 0 } });
    const erreur = await c.executer(OP_DEPARTS, { gare: "DLA" }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurDelai);
  });

  it("type une annulation par l'appelant", async () => {
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_ok, ko) => {
          init?.signal?.addEventListener("abort", () =>
            ko(new DOMException("abort", "AbortError")),
          );
        }),
    );
    const controleur = new AbortController();
    const promesse = client(f).executer(OP_DEPARTS, { gare: "DLA" }, { signal: controleur.signal });
    controleur.abort();
    await expect(promesse).rejects.toBeInstanceOf(ErreurAnnulee);
    expect(f.mock.calls.length).toBeLessThanOrEqual(1); // jamais relancée
  });

  it("rejette une réponse hors contrat avec ErreurValidation", async () => {
    const f = vi.fn<typeof fetch>(async () => json([{ id: "d1" }]));
    const erreur = await client(f)
      .executer(OP_DEPARTS, { gare: "DLA" })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurValidation);
    expect((erreur as ErreurValidation).issues.length).toBeGreaterThan(0);
  });

  describe("temps réel", () => {
    class SocketFausse implements SocketLike {
      onopen: ((ev: unknown) => void) | null = null;
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onclose: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      fermee = false;
      constructor(readonly url: string) {}
      close(): void {
        this.fermee = true;
      }
    }

    it("valide les messages reçus, se reconnecte, puis ferme au désabonnement", async () => {
      const sockets: SocketFausse[] = [];
      const c = client(vi.fn<typeof fetch>(), {
        creerWebSocket: (url) => {
          const s = new SocketFausse(url);
          sockets.push(s);
          return s;
        },
      });
      const recus: number[] = [];
      const erreurs: unknown[] = [];
      const etats: string[] = [];
      const stop = c.souscrire(CANAL_POSITION, { departId: "d1" }, (m) => recus.push(m.km), {
        surErreur: (e) => erreurs.push(e),
        surEtat: (e) => etats.push(e),
      });

      expect(sockets[0]!.url).toBe("wss://api.afrimove.test/v1/departs/d1/direct");
      sockets[0]!.onopen?.({});
      sockets[0]!.onmessage?.({ data: JSON.stringify({ km: 42 }) });
      sockets[0]!.onmessage?.({ data: JSON.stringify({ km: "beaucoup" }) });
      expect(recus).toEqual([42]);
      expect(erreurs[0]).toBeInstanceOf(ErreurValidation);

      sockets[0]!.onclose?.({});
      await vi.waitFor(() => expect(sockets).toHaveLength(2));
      sockets[1]!.onopen?.({});

      stop();
      expect(sockets[1]!.fermee).toBe(true);
      expect(etats).toEqual(["connexion", "ouvert", "reconnexion", "ouvert", "ferme"]);
    });
  });
});
