import { describe, expect, it, vi } from "vitest";
import {
  ErreurAgent,
  connecterParPin,
  demanderCodeDirection,
  enrolerAppareil,
  lireMoi,
  verifierCodeDirection,
  type Fetch,
} from "./api";

function reponse(statut: number, corps: unknown, entetes: Record<string, string> = {}): Response {
  return new Response(corps === undefined ? null : JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json", ...entetes },
  });
}

function faux(...reponses: (Response | Error)[]) {
  const appels: { url: string; init: RequestInit }[] = [];
  const file = [...reponses];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ url: String(url), init: init ?? {} });
    const suivante = file.shift();
    if (suivante === undefined) throw new Error("plus de réponse prévue");
    if (suivante instanceof Error) throw suivante;
    return suivante;
  }) as unknown as Fetch;
  return { f, appels };
}

const base = { urlBase: "http://api.test/" };

describe("connexion par PIN", () => {
  it("envoie téléphone, PIN et rôle à l'API et lit le jeton", async () => {
    const { f, appels } = faux(
      reponse(200, {
        accessToken: "jwt-1",
        tokenType: "Bearer",
        expiresIn: 3600,
        role: "guichetier",
      }),
    );
    const jeton = await connecterParPin(
      { ...base, fetch: f },
      { telephone: "+237655000002", pin: "482916", role: "guichetier" },
    );
    expect(jeton).toEqual({ accessToken: "jwt-1", expiresIn: 3600, role: "guichetier" });
    expect(appels[0]?.url).toBe("http://api.test/auth/guichet/connexion");
    expect(appels[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({
      telephone: "+237655000002",
      pin: "482916",
      role: "guichetier",
    });
  });

  it("refuse une réponse sans jeton", async () => {
    const { f } = faux(reponse(200, { tokenType: "Bearer" }));
    await expect(
      connecterParPin(
        { ...base, fetch: f },
        { telephone: "+237655000002", pin: "482916", role: "guichetier" },
      ),
    ).rejects.toMatchObject({ statut: 502 });
  });

  it("garde le statut, le code et le message de l'API", async () => {
    const { f } = faux(reponse(401, { statusCode: 401, message: "Identifiants incorrects" }));
    const echec = await connecterParPin(
      { ...base, fetch: f },
      { telephone: "+237655000002", pin: "000000", role: "guichetier" },
    ).catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ErreurAgent);
    expect(echec).toMatchObject({ statut: 401, message: "Identifiants incorrects" });
  });

  it("lit l'attente d'un compte bloqué (423) et d'une limitation de débit (429)", async () => {
    const dans5min = new Date(Date.now() + 300_000).toISOString();
    const { f } = faux(
      reponse(423, { message: "Compte bloqué", reessayerApres: dans5min }),
      reponse(429, { message: "Trop" }, { "Retry-After": "42" }),
    );
    const bloque = await connecterParPin(
      { ...base, fetch: f },
      { telephone: "+237655000002", pin: "000000", role: "guichetier" },
    ).catch((e: ErreurAgent) => e);
    expect(bloque).toMatchObject({ statut: 423 });
    expect((bloque as ErreurAgent).reessayerApresMs).toBeGreaterThan(290_000);
    const limite = await connecterParPin(
      { ...base, fetch: f },
      { telephone: "+237655000002", pin: "000000", role: "guichetier" },
    ).catch((e: ErreurAgent) => e);
    expect((limite as ErreurAgent).reessayerApresMs).toBe(42_000);
  });

  it("signale un réseau coupé par le statut 0", async () => {
    const { f } = faux(new TypeError("Failed to fetch"));
    await expect(
      connecterParPin(
        { ...base, fetch: f },
        { telephone: "+237655000002", pin: "482916", role: "guichetier" },
      ),
    ).rejects.toMatchObject({ statut: 0 });
  });
});

describe("connexion de la direction", () => {
  it("demande le code par mot de passe, puis le vérifie", async () => {
    const { f, appels } = faux(
      reponse(202, { defiId: "11111111-1111-4111-8111-111111111111", expireDans: 300 }),
      reponse(200, { accessToken: "jwt-2", tokenType: "Bearer", expiresIn: 1800, role: "patron" }),
    );
    const defi = await demanderCodeDirection(
      { ...base, fetch: f },
      { telephone: "+237655000004", motDePasse: "secret", role: "patron" },
    );
    expect(defi).toEqual({ defiId: "11111111-1111-4111-8111-111111111111", expireDans: 300 });
    expect(appels[0]?.url).toBe("http://api.test/auth/direction/connexion");
    const jeton = await verifierCodeDirection(
      { ...base, fetch: f },
      { defiId: defi.defiId, code: "123456" },
    );
    expect(jeton).toEqual({ accessToken: "jwt-2", expiresIn: 1800, role: "patron" });
    expect(appels[1]?.url).toBe("http://api.test/auth/direction/verification");
  });
});

describe("/me", () => {
  it("envoie le jeton en Bearer et lit le compte", async () => {
    const { f, appels } = faux(
      reponse(200, {
        id: "p-1",
        role: "guichetier",
        compagnieId: "c-1",
        gareId: null,
        peutVendre: true,
        accesPatron: false,
      }),
    );
    const moi = await lireMoi({ ...base, fetch: f }, "jwt-1");
    expect(moi).toEqual({
      id: "p-1",
      role: "guichetier",
      compagnieId: "c-1",
      gareId: null,
      peutVendre: true,
      accesPatron: false,
    });
    expect(appels[0]?.init.headers).toMatchObject({ Authorization: "Bearer jwt-1" });
  });
});

describe("enrôlement", () => {
  it("échange le code contre l'identité du téléphone", async () => {
    const { f, appels } = faux(
      reponse(200, {
        appareilId: "appareil-dla-g1-ab12cd34",
        secret: "apd_secret",
        compagnieId: "c-1",
        gareId: "g-1",
        libelle: "Guichet 1",
        agence: "DEM",
        gare: "DLA",
        genre: "guichet",
        rang: 1,
        plage: { debut: 1, fin: 999 },
      }),
    );
    const e = await enrolerAppareil({ ...base, fetch: f }, "ABCDE-FGHJK");
    expect(e).toMatchObject({
      appareilId: "appareil-dla-g1-ab12cd34",
      secret: "apd_secret",
      agence: "DEM",
      gare: "DLA",
      genre: "guichet",
      rang: 1,
      plage: { debut: 1, fin: 999 },
    });
    expect(appels[0]?.url).toBe("http://api.test/appareils/enrolement");
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({ code: "ABCDE-FGHJK" });
  });

  it("accepte un appareil sans plage (genre autre)", async () => {
    const { f } = faux(
      reponse(200, {
        appareilId: "a",
        secret: "apd_s",
        compagnieId: "c",
        gareId: null,
        libelle: null,
        agence: null,
        gare: null,
        genre: "autre",
        rang: null,
        plage: null,
      }),
    );
    expect(await enrolerAppareil({ ...base, fetch: f }, "ABCDE-FGHJK")).toMatchObject({
      genre: "autre",
      rang: null,
      plage: null,
      agence: null,
    });
  });
});
