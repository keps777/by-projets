import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanalMemoire, type CanalCommandes, type CommandeAppareil } from "./canal";
import type { EnvEffacement } from "./effacement";
import { CLE_EFFACE, CLE_KIOSQUE, ecrireRepere, leverVerrouEffacement, lireRepere } from "./etat";
import { INTERVALLE_PAR_DEFAUT_MS, SurveillantKiosque } from "./surveillant";

const ORDRE: CommandeAppareil = {
  id: "cmd-1",
  type: "effacer",
  emiseA: "2026-10-20T08:00:00Z",
  secretAcquittement: "secret",
};

/** Navigateur factice : le vrai localStorage de jsdom, le reste enregistré. */
function env(options: { echecIndexedDb?: boolean } = {}) {
  const appels: string[] = [];
  const e: EnvEffacement = {
    localStorage: globalThis.localStorage,
    sessionStorage: { clear: () => void appels.push("session") },
    indexedDB: {
      databases: async () => [{ name: "sync-guichet" }],
      deleteDatabase: () => {
        const requete = {
          onsuccess: null as ((e: unknown) => void) | null,
          onerror: null as ((e: unknown) => void) | null,
          onblocked: null as ((e: unknown) => void) | null,
          error: new Error("refus"),
        };
        queueMicrotask(() => {
          appels.push("idb");
          if (options.echecIndexedDb) requete.onerror?.({});
          else requete.onsuccess?.({});
        });
        return requete;
      },
    },
    delaiBaseMs: 100,
  };
  return { env: e, appels };
}

function planificateurManuel() {
  let tic: (() => void) | null = null;
  let arrete = false;
  return {
    planifier: (f: () => void) => {
      tic = f;
      return () => {
        arrete = true;
      };
    },
    tic: () => tic?.(),
    estArrete: () => arrete,
  };
}

beforeEach(() => {
  localStorage.setItem("afrimove.session", '{"role":"guichet"}');
  localStorage.setItem("afrimove.langue", "en");
  localStorage.setItem(CLE_KIOSQUE, "1");
  localStorage.setItem("autre", "donnée de vente");
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("SurveillantKiosque : appareil sans ordre", () => {
  it("ne touche à rien tant que le serveur n'envoie pas d'ordre", async () => {
    const canal = new CanalMemoire();
    const { env: e, appels } = env();
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: e });
    await s.verifier();
    expect(s.etat()).toEqual({ phase: "libre" });
    expect(appels).toEqual([]);
    expect(localStorage.getItem("afrimove.session")).not.toBeNull();
    expect(canal.consultations).toBe(1);
  });

  it("reste libre et ne lève rien quand le serveur est injoignable (téléphone hors ligne)", async () => {
    const canal = new CanalMemoire();
    canal.horsLigne = true;
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: env().env });
    await expect(s.verifier()).resolves.toBeUndefined();
    expect(s.etat()).toEqual({ phase: "libre" });
    expect(localStorage.getItem("autre")).not.toBeNull();
  });

  it("consulte tout de suite au démarrage puis à chaque intervalle, et s'arrête à l'arrêt", async () => {
    const canal = new CanalMemoire();
    const plan = planificateurManuel();
    const s = new SurveillantKiosque({ appareilId: "a1", canal, planifier: plan.planifier });
    s.demarrer();
    s.demarrer(); // sans effet : un seul planificateur
    await vi.waitFor(() => expect(canal.consultations).toBe(1));
    plan.tic();
    await vi.waitFor(() => expect(canal.consultations).toBe(2));
    s.arreter();
    expect(plan.estArrete()).toBe(true);
  });

  it("consulte au moins deux fois par minute : un ordre part en moins de 10 minutes même avec quelques consultations ratées", () => {
    expect(INTERVALLE_PAR_DEFAUT_MS).toBeLessThanOrEqual(60_000);
  });
});

describe("SurveillantKiosque : ordre d'effacement", () => {
  it("efface les données, garde la langue et le drapeau kiosque, verrouille et accuse réception", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const { env: e, appels } = env();
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: e });
    await s.verifier();

    expect(appels).toEqual(["session", "idb"]);
    expect(localStorage.getItem("afrimove.session")).toBeNull();
    expect(localStorage.getItem("autre")).toBeNull();
    expect(localStorage.getItem("afrimove.langue")).toBe("en");
    expect(localStorage.getItem(CLE_KIOSQUE)).toBe("1");

    expect(s.etat()).toMatchObject({
      phase: "efface",
      termine: true,
      complet: true,
      acquitte: true,
    });
    expect(lireRepere()).toMatchObject({
      phase: "efface",
      acquitte: true,
      commande: { id: "cmd-1" },
    });
    expect(canal.acquittements).toHaveLength(1);
    expect(canal.acquittements[0]).toMatchObject({ appareilId: "a1", commandeId: "cmd-1" });
    expect(canal.acquittements[0]?.rapport.complet).toBe(true);
  });

  it("arrête la surveillance une fois effacé et confirmé", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const plan = planificateurManuel();
    const s = new SurveillantKiosque({
      appareilId: "a1",
      canal,
      env: env().env,
      planifier: plan.planifier,
    });
    s.demarrer();
    await vi.waitFor(() => expect(plan.estArrete()).toBe(true));
  });

  it("notifie ses abonnés : verrouillé avant la fin de l'effacement, puis terminé", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const etats: string[] = [];
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: env().env });
    s.abonner(() => {
      const e = s.etat();
      etats.push(
        e.phase === "efface" ? `efface/termine=${e.termine}/acquitte=${e.acquitte}` : e.phase,
      );
    });
    await s.verifier();
    expect(etats).toEqual([
      "efface/termine=false/acquitte=false",
      "efface/termine=true/acquitte=false",
      "efface/termine=true/acquitte=true",
    ]);
  });

  it("l'écrit sur l'appareil AVANT d'effacer : une application tuée en route reprend l'effacement", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    let repereVuPendantEffacement: unknown = null;
    const { env: e } = env();
    e.localStorage = {
      clear: () => {
        repereVuPendantEffacement = localStorage.getItem(CLE_EFFACE);
        localStorage.clear();
      },
    };
    await new SurveillantKiosque({ appareilId: "a1", canal, env: e }).verifier();
    expect(JSON.parse(String(repereVuPendantEffacement))).toMatchObject({ phase: "en_cours" });
  });

  it("achève au démarrage un effacement interrompu, sans consulter le serveur pour de nouveaux ordres", async () => {
    ecrireRepere({ phase: "en_cours", commande: ORDRE, acquitte: false });
    const canal = new CanalMemoire();
    const { env: e, appels } = env();
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: e });
    expect(s.etat()).toMatchObject({ phase: "efface", termine: false });
    await s.verifier();
    expect(appels).toContain("idb");
    expect(localStorage.getItem("autre")).toBeNull();
    expect(s.etat()).toMatchObject({ phase: "efface", termine: true, acquitte: true });
    expect(canal.consultations).toBe(0);
  });

  it("ignore un second ordre pendant qu'un effacement tourne", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const { env: e, appels } = env();
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: e });
    await Promise.all([s.verifier(), s.verifier()]);
    expect(appels.filter((a) => a === "idb")).toHaveLength(1);
  });
});

describe("SurveillantKiosque : accusé de réception", () => {
  function canalSansAccuse(): CanalCommandes & { accuses: number } {
    const base = new CanalMemoire();
    base.emettre(ORDRE);
    const canal = {
      accuses: 0,
      prochaineCommande: () => base.prochaineCommande(),
      acquitter: async () => {
        canal.accuses += 1;
        throw new Error("serveur injoignable");
      },
    };
    return canal;
  }

  it("reste verrouillé et non acquitté quand le serveur est injoignable, puis réessaie à la consultation suivante", async () => {
    const canal = canalSansAccuse();
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: env().env });
    await s.verifier();
    expect(s.etat()).toMatchObject({ phase: "efface", termine: true, acquitte: false });
    expect(canal.accuses).toBe(1);

    await s.verifier();
    expect(canal.accuses).toBe(2);
  });

  it("renvoie l'accusé après un redémarrage de l'application, avec l'ordre d'origine et sans reeffacer", async () => {
    const hors = canalSansAccuse();
    await new SurveillantKiosque({ appareilId: "a1", canal: hors, env: env().env }).verifier();

    const canal = new CanalMemoire();
    const { env: e, appels } = env();
    const redemarre = new SurveillantKiosque({ appareilId: "a1", canal, env: e });
    expect(redemarre.etat()).toMatchObject({ phase: "efface", acquitte: false });
    await redemarre.verifier();
    expect(canal.acquittements).toHaveLength(1);
    expect(canal.acquittements[0]?.commandeId).toBe("cmd-1");
    expect(appels).toEqual([]); // pas de second effacement
    expect(canal.consultations).toBe(0);
    expect(redemarre.etat()).toMatchObject({ acquitte: true });
  });
});

describe("SurveillantKiosque : effacement incomplet", () => {
  it("le dit au serveur (complet = faux), reste verrouillé, et retente une seule fois", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const { env: e, appels } = env({ echecIndexedDb: true });
    const s = new SurveillantKiosque({ appareilId: "a1", canal, env: e });
    await s.verifier();
    expect(s.etat()).toMatchObject({ phase: "efface", termine: true, complet: false });
    expect(canal.acquittements[0]?.rapport.complet).toBe(false);

    await s.verifier(); // reprise unique
    expect(appels.filter((a) => a === "idb")).toHaveLength(2);
    await s.verifier();
    await s.verifier();
    expect(appels.filter((a) => a === "idb")).toHaveLength(2);
    expect(s.etat()).toMatchObject({ phase: "efface", complet: false });
  });
});

describe("SurveillantKiosque : dernière chance avant l'effacement", () => {
  it("laisse le temps à la synchronisation de finir, puis efface", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const ordre: string[] = [];
    const { env: e } = env();
    const sessionClear = e.sessionStorage?.clear;
    e.sessionStorage = {
      clear: () => {
        ordre.push("efface");
        sessionClear?.();
      },
    };
    const s = new SurveillantKiosque({
      appareilId: "a1",
      canal,
      env: e,
      delaiAvantEffacementMs: 1000,
      avantEffacement: async () => {
        await new Promise((r) => setTimeout(r, 10));
        ordre.push("synchro");
      },
    });
    await s.verifier();
    expect(ordre).toEqual(["synchro", "efface"]);
  });

  it("n'attend pas plus que le délai fixé : un appareil volé ne doit pas rester utilisable", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const s = new SurveillantKiosque({
      appareilId: "a1",
      canal,
      env: env().env,
      delaiAvantEffacementMs: 20,
      avantEffacement: () => new Promise(() => undefined), // ne finit jamais
    });
    await s.verifier();
    expect(s.etat()).toMatchObject({ phase: "efface", termine: true });
    expect(localStorage.getItem("autre")).toBeNull();
  });

  it("efface quand même si la synchronisation échoue", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const s = new SurveillantKiosque({
      appareilId: "a1",
      canal,
      env: env().env,
      delaiAvantEffacementMs: 500,
      avantEffacement: async () => {
        throw new Error("réseau");
      },
    });
    await s.verifier();
    expect(localStorage.getItem("autre")).toBeNull();
  });
});

describe("repère d'effacement", () => {
  it("un appareil effacé le reste au démarrage suivant", () => {
    ecrireRepere({ phase: "efface", commande: ORDRE, acquitte: true });
    expect(
      new SurveillantKiosque({ appareilId: "a1", canal: new CanalMemoire() }).etat(),
    ).toMatchObject({
      phase: "efface",
      termine: true,
    });
  });

  it("un repère abîmé verrouille l'appareil au lieu de le rendre", () => {
    localStorage.setItem(CLE_EFFACE, "{pas du json");
    expect(
      new SurveillantKiosque({ appareilId: "a1", canal: new CanalMemoire() }).etat(),
    ).toMatchObject({
      phase: "efface",
    });
  });

  it("la remise en service par un superviseur lève le verrou", () => {
    ecrireRepere({ phase: "efface", commande: ORDRE, acquitte: true });
    leverVerrouEffacement();
    expect(new SurveillantKiosque({ appareilId: "a1", canal: new CanalMemoire() }).etat()).toEqual({
      phase: "libre",
    });
  });
});
