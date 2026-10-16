import { describe, expect, it, vi } from "vitest";
import { analyserHorloge, creerClient, lireConfig, lireParametresUrl } from "./config";
import { ErreurConfiguration, ErreurScenarioInconnu } from "./erreurs";
import { DEPARTS_DEMO, OP_DEPARTS, sourceDemo } from "./exemples";

describe("sélection de l'adaptateur et du scénario", () => {
  it("lit scenario et horloge dans l'URL", () => {
    expect(lireParametresUrl("?scenario=depart-0530&horloge=2026-10-16T05:30:00%2B01:00")).toEqual({
      scenario: "depart-0530",
      horloge: "2026-10-16T05:30:00+01:00",
    });
    expect(lireParametresUrl("")).toEqual({});
  });

  it("choisit mock par défaut et http via VITE_API_MODE", () => {
    expect(lireConfig({}).mode).toBe("mock");
    expect(lireConfig({ VITE_API_MODE: "http", VITE_API_URL: "https://x.test" })).toMatchObject({
      mode: "http",
      urlBase: "https://x.test",
    });
    expect(() => lireConfig({ VITE_API_MODE: "ftp" })).toThrow(ErreurConfiguration);
  });

  it("donne priorité au paramètre d'URL sur VITE_API_SCENARIO", () => {
    expect(lireConfig({ VITE_API_SCENARIO: "a" }).scenario).toBe("a");
    expect(lireConfig({ VITE_API_SCENARIO: "a" }, "?scenario=b").scenario).toBe("b");
    expect(lireConfig({}).scenario).toBe("defaut");
  });

  it("analyse le paramètre horloge : courante ou gelée", async () => {
    const gelee = analyserHorloge("gelee:2026-10-16T05:30:00+01:00");
    expect(gelee.iso()).toBe("2026-10-16T05:30:00.000+01:00");
    const courante = analyserHorloge("2026-10-16T05:30:00+01:00");
    expect(courante.iso().startsWith("2026-10-16T05:30:")).toBe(true);
    expect(() => analyserHorloge("hier")).toThrow(ErreurConfiguration);
  });

  it("crée un client mock avec le scénario et l'horloge de l'URL", async () => {
    const config = lireConfig({}, "?scenario=vide&horloge=gelee:2027-01-05T08:00:00%2B01:00");
    const client = creerClient(config, { source: sourceDemo(), latenceMs: 0 });
    expect(client.mode).toBe("mock");
    expect(client.horloge.iso()).toBe("2027-01-05T08:00:00.000+01:00");
    await expect(client.executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual([]);
  });

  it("refuse un scénario inconnu", () => {
    expect(() => creerClient(lireConfig({}, "?scenario=zzz"), { source: sourceDemo() })).toThrow(
      ErreurScenarioInconnu,
    );
  });

  it("crée un client HTTP qui n'utilise pas le scénario", async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(DEPARTS_DEMO)));
    const client = creerClient(
      lireConfig({ VITE_API_MODE: "http", VITE_API_URL: "https://x.test" }, "?scenario=vide"),
      {
        fetch: f,
      },
    );
    expect(client.mode).toBe("http");
    await expect(client.executer(OP_DEPARTS, { gare: "DLA" })).resolves.toEqual(DEPARTS_DEMO);
    expect(f.mock.calls[0]![0]).toBe("https://x.test/departs?gare=DLA");
  });
});
