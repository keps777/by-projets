import { describe, expect, it, vi } from "vitest";
import { effacerDonneesLocales, type EnvEffacement } from "./effacement";

/** Faux navigateur : tout ce qui s'y trouve est listé, tout ce qui est effacé est noté. */
function fauxNavigateur(options: { basesQuiEchouent?: string[]; basesBloquees?: string[] } = {}) {
  const journal: string[] = [];
  const bases = ["sync-guichet", "cle-billets"];
  const env: EnvEffacement = {
    localStorage: { clear: () => void journal.push("localStorage") },
    sessionStorage: { clear: () => void journal.push("sessionStorage") },
    indexedDB: {
      databases: async () => bases.map((name) => ({ name })),
      deleteDatabase: (nom: string) => {
        const requete = {
          onsuccess: null as ((e: unknown) => void) | null,
          onerror: null as ((e: unknown) => void) | null,
          onblocked: null as ((e: unknown) => void) | null,
          error: undefined as unknown,
        };
        queueMicrotask(() => {
          if (options.basesBloquees?.includes(nom)) {
            requete.onblocked?.({});
            return; // ni succès ni erreur : la connexion ouverte ne se ferme pas
          }
          if (options.basesQuiEchouent?.includes(nom)) {
            requete.error = new Error(`refus sur ${nom}`);
            requete.onerror?.({});
            return;
          }
          journal.push(`idb:${nom}`);
          requete.onsuccess?.({});
        });
        return requete;
      },
    },
    caches: {
      keys: async () => ["precache-v1", "images"],
      delete: async (cle: string) => {
        journal.push(`cache:${cle}`);
        return true;
      },
    },
    serviceWorker: {
      getRegistrations: async () => [
        {
          unregister: async () => {
            journal.push("sw");
            return true;
          },
        },
      ],
    },
    document: { cookie: "session=abc; theme=sombre" },
    maintenant: () => new Date("2026-10-20T08:00:00Z"),
    delaiBaseMs: 50,
  };
  return { env, journal };
}

describe("effacerDonneesLocales", () => {
  it("efface le stockage, les bases hors ligne, les caches, le service worker et les cookies", async () => {
    const { env, journal } = fauxNavigateur();
    const rapport = await effacerDonneesLocales(env);
    expect(journal).toEqual([
      "localStorage",
      "sessionStorage",
      "idb:sync-guichet",
      "idb:cle-billets",
      "cache:precache-v1",
      "cache:images",
      "sw",
    ]);
    expect(rapport.complet).toBe(true);
    expect(rapport.effaceA).toBe("2026-10-20T08:00:00.000Z");
    expect(rapport.etapes.map((e) => e.nom)).toEqual([
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "caches",
      "serviceWorkers",
      "cookies",
    ]);
  });

  it("expire chaque cookie lisible", async () => {
    const ecritures: string[] = [];
    const doc = {
      get cookie() {
        return "session=abc; theme=sombre";
      },
      set cookie(valeur: string) {
        ecritures.push(valeur);
      },
    };
    await effacerDonneesLocales({ document: doc });
    expect(ecritures).toHaveLength(2);
    expect(ecritures[0]).toMatch(/^session=; expires=Thu, 01 Jan 1970/);
    expect(ecritures[1]).toMatch(/^theme=; expires=Thu, 01 Jan 1970/);
  });

  it("continue les autres étapes quand l'une échoue, et le dit dans le rapport", async () => {
    const { env, journal } = fauxNavigateur({ basesQuiEchouent: ["sync-guichet"] });
    const rapport = await effacerDonneesLocales(env);
    expect(rapport.complet).toBe(false);
    const idb = rapport.etapes.find((e) => e.nom === "indexedDB");
    expect(idb).toMatchObject({ ok: false });
    expect(idb?.detail).toContain("refus sur sync-guichet");
    // L'autre base, les caches et le service worker sont partis malgré l'échec.
    expect(journal).toContain("idb:cle-billets");
    expect(journal).toContain("cache:images");
    expect(journal).toContain("sw");
  });

  it("compte une base bloquée par une connexion ouverte comme un échec, sans attendre indéfiniment", async () => {
    const { env } = fauxNavigateur({ basesBloquees: ["cle-billets"] });
    const rapport = await effacerDonneesLocales(env);
    expect(rapport.complet).toBe(false);
    expect(rapport.etapes.find((e) => e.nom === "indexedDB")?.detail).toContain("bloquée");
  });

  it("signale un navigateur qui ne sait pas lister ses bases (impossible de prouver l'effacement)", async () => {
    const rapport = await effacerDonneesLocales({
      indexedDB: { deleteDatabase: vi.fn() as never },
    });
    expect(rapport.complet).toBe(false);
    expect(rapport.etapes.find((e) => e.nom === "indexedDB")?.detail).toContain("indisponible");
  });

  it("n'échoue pas sur un environnement sans aucune de ces API", async () => {
    const rapport = await effacerDonneesLocales({});
    expect(rapport.complet).toBe(true);
  });

  it("ne lève jamais, même si le stockage lève", async () => {
    const rapport = await effacerDonneesLocales({
      localStorage: {
        clear: () => {
          throw new Error("stockage bloqué");
        },
      },
    });
    expect(rapport.complet).toBe(false);
    expect(rapport.etapes[0]).toMatchObject({
      nom: "localStorage",
      ok: false,
      detail: "stockage bloqué",
    });
  });
});
