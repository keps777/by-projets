import { afterEach, describe, expect, it, vi } from "vitest";
import { creerClient, lireConfig } from "./config";
import { OP_DEPARTS, DEPARTS_DEMO } from "./exemples";
import { CLE_JETON, jetonDepuisStockage } from "./jeton";

/** Un stockage local minimal, pour ne pas dépendre de jsdom. */
function stockage(valeurs: Record<string, string> = {}) {
  return { getItem: (k: string) => valeurs[k] ?? null };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("jeton de l'appareil (recette AM-181)", () => {
  it("lit le jeton déposé sous « afrimove.jeton »", () => {
    expect(CLE_JETON).toBe("afrimove.jeton");
    expect(jetonDepuisStockage(stockage({ [CLE_JETON]: "abc.def.ghi" }))).toBe("abc.def.ghi");
  });

  it("rend null sans jeton, avec un jeton vide ou quand le stockage lève une erreur", () => {
    expect(jetonDepuisStockage(stockage())).toBeNull();
    expect(jetonDepuisStockage(stockage({ [CLE_JETON]: "" }))).toBeNull();
    expect(
      jetonDepuisStockage({
        getItem: () => {
          throw new Error("SecurityError");
        },
      }),
    ).toBeNull();
  });

  it("le client HTTP de l'application envoie le jeton de l'appareil à chaque requête, y compris un jeton renouvelé", async () => {
    const valeurs: Record<string, string> = { [CLE_JETON]: "premier" };
    vi.stubGlobal("localStorage", stockage(valeurs));
    const entetes: Array<string | null> = [];
    const fetchFactice = vi.fn<typeof fetch>(async (_url, init) => {
      entetes.push(new Headers(init?.headers).get("Authorization"));
      return new Response(JSON.stringify(DEPARTS_DEMO), { status: 200 });
    });
    const client = creerClient(
      lireConfig({ VITE_API_MODE: "http", VITE_API_URL: "https://api.test" }),
      { fetch: fetchFactice },
    );
    await client.executer(OP_DEPARTS, { gare: "DLA" });
    valeurs[CLE_JETON] = "renouvele";
    await client.executer(OP_DEPARTS, { gare: "DLA" });
    expect(entetes).toEqual(["Bearer premier", "Bearer renouvele"]);
  });

  it("sans jeton sur l'appareil, aucune en-tête Authorization n'est envoyée", async () => {
    vi.stubGlobal("localStorage", stockage());
    const entetes: Array<string | null> = [];
    const fetchFactice = vi.fn<typeof fetch>(async (_url, init) => {
      entetes.push(new Headers(init?.headers).get("Authorization"));
      return new Response(JSON.stringify(DEPARTS_DEMO), { status: 200 });
    });
    const client = creerClient(
      lireConfig({ VITE_API_MODE: "http", VITE_API_URL: "https://api.test" }),
      { fetch: fetchFactice },
    );
    await client.executer(OP_DEPARTS, { gare: "DLA" });
    expect(entetes).toEqual([null]);
  });

  it("une source de jeton imposée par l'application l'emporte sur le stockage", async () => {
    vi.stubGlobal("localStorage", stockage({ [CLE_JETON]: "du-stockage" }));
    const entetes: Array<string | null> = [];
    const fetchFactice = vi.fn<typeof fetch>(async (_url, init) => {
      entetes.push(new Headers(init?.headers).get("Authorization"));
      return new Response(JSON.stringify(DEPARTS_DEMO), { status: 200 });
    });
    const client = creerClient(
      lireConfig({ VITE_API_MODE: "http", VITE_API_URL: "https://api.test" }),
      { fetch: fetchFactice, obtenirJeton: () => "impose" },
    );
    await client.executer(OP_DEPARTS, { gare: "DLA" });
    expect(entetes).toEqual(["Bearer impose"]);
  });
});
