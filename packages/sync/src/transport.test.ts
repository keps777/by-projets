import { describe, expect, it } from "vitest";
import { ErreurTransport, creerTransportHttp } from "./transport";

/** Un `fetch` qui note l'appel et rend la réponse voulue. */
function faux(reponse: Response) {
  const appels: Array<{ url: string; init: RequestInit }> = [];
  const fetchFaux = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init: init ?? {} });
    return reponse.clone();
  }) as typeof globalThis.fetch;
  return { appels, fetch: fetchFaux };
}

const CLE = { kty: "EC", crv: "P-256", x: "x", y: "y" } as never;

describe("transport HTTP vers /sync", () => {
  it("l'enrôlement d'un appareil réussit quand l'API répond 204 sans corps (constat de la recette, AM-181)", async () => {
    const { appels, fetch } = faux(new Response(null, { status: 204 }));
    const transport = creerTransportHttp({
      urlBase: "http://api.test/",
      fetch,
      obtenirJeton: () => "jeton-1",
    });
    await expect(transport.enroler!("guichet-1", CLE)).resolves.toBeUndefined();
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe("http://api.test/sync/appareils/guichet-1/cle");
    expect(appels[0]!.init.method).toBe("PUT");
    expect((appels[0]!.init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer jeton-1",
    );
    expect(JSON.parse(String(appels[0]!.init.body))).toEqual({ cle: CLE });
  });

  it("un 200 sans JSON reste une réponse illisible, à réessayer plus tard", async () => {
    const { fetch } = faux(new Response("<html>", { status: 200 }));
    const transport = creerTransportHttp({
      urlBase: "http://api.test",
      fetch,
      obtenirJeton: () => "j",
    });
    await expect(transport.enroler!("guichet-1", CLE)).rejects.toMatchObject({
      nature: "serveur",
      message: "Réponse illisible",
    });
  });

  it("un lot dont la réponse n'a pas la forme du protocole est une erreur serveur", async () => {
    const { fetch } = faux(Response.json({ nimporte: "quoi" }));
    const transport = creerTransportHttp({
      urlBase: "http://api.test",
      fetch,
      obtenirJeton: () => "j",
    });
    await expect(
      transport.envoyer({
        appareilId: "a",
        envoyeA: "2027-01-05T05:30:00.000+01:00",
        evenements: [],
      }),
    ).rejects.toMatchObject({ nature: "serveur" });
  });

  it("classe les refus : 401 = authentification, 5xx = serveur, autre 4xx = refus avec le code de l'API", async () => {
    const nature = async (statut: number, corps: unknown = {}) => {
      const { fetch } = faux(Response.json(corps, { status: statut }));
      const transport = creerTransportHttp({
        urlBase: "http://api.test",
        fetch,
        obtenirJeton: () => "j",
      });
      return transport.enroler!("guichet-1", CLE).catch((e: unknown) => e as ErreurTransport);
    };
    expect(await nature(401)).toMatchObject({ nature: "authentification", statut: 401 });
    expect(await nature(503)).toMatchObject({ nature: "serveur", statut: 503 });
    expect(await nature(409, { code: "CLE_DEJA_POSEE", message: "Clé déjà posée" })).toMatchObject({
      nature: "refus",
      statut: 409,
      code: "CLE_DEJA_POSEE",
      message: "Clé déjà posée",
    });
  });

  it("sans jeton, rien ne part : connexion requise", async () => {
    const { appels, fetch } = faux(new Response(null, { status: 204 }));
    const transport = creerTransportHttp({
      urlBase: "http://api.test",
      fetch,
      obtenirJeton: () => null,
    });
    await expect(transport.enroler!("guichet-1", CLE)).rejects.toMatchObject({
      nature: "authentification",
    });
    expect(appels).toHaveLength(0);
  });
});
