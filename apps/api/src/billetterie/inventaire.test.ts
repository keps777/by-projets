import { describe, expect, it } from "vitest";
import { InventaireMemoire } from "./memoire";
import { Serialiseur } from "./serialiser";

const T0 = "2026-11-02T09:00:00+01:00";
const T15 = "2026-11-02T09:15:00+01:00";
const T16 = "2026-11-02T09:16:00+01:00";

const bloquer = (
  inv: InventaireMemoire,
  siege: number,
  par: string,
  commandeId: string | null = null,
) => inv.bloquer({ departId: "d1", siege, par, commandeId, jusqua: T15, maintenant: T0 });

describe("inventaire des sièges (adaptateur en mémoire, mêmes règles que la base)", () => {
  it("un siège occupé ne peut plus être occupé ni bloqué", async () => {
    const inv = new InventaireMemoire();
    expect(
      (await inv.occuper({ departId: "d1", siege: 1, billetId: "b1", par: null, maintenant: T0 }))
        .ok,
    ).toBe(true);
    const second = await inv.occuper({
      departId: "d1",
      siege: 1,
      billetId: "b2",
      par: null,
      maintenant: T0,
    });
    expect(second).toEqual({ ok: false, raison: "pris" });
    expect(await bloquer(inv, 1, "v1")).toEqual({ ok: false, raison: "pris" });
    // Un autre départ est indépendant.
    expect(
      (await inv.occuper({ departId: "d2", siege: 1, billetId: "b3", par: null, maintenant: T0 }))
        .ok,
    ).toBe(true);
  });

  it("un siège bloqué est refusé à un autre, jusqu'à l'expiration du blocage", async () => {
    const inv = new InventaireMemoire();
    expect((await bloquer(inv, 3, "v1")).ok).toBe(true);
    expect(await bloquer(inv, 3, "v2")).toEqual({ ok: false, raison: "bloque_par_autre" });
    const vente = await inv.occuper({
      departId: "d1",
      siege: 3,
      billetId: "b",
      par: null,
      maintenant: T0,
    });
    expect(vente.ok).toBe(false);
    // Après 15 minutes, le siège est libre pour tous.
    const apres = await inv.bloquer({
      departId: "d1",
      siege: 3,
      par: "v2",
      commandeId: null,
      jusqua: "2026-11-02T09:31:00+01:00",
      maintenant: T16,
    });
    expect(apres.ok).toBe(true);
  });

  it("le détenteur d'un blocage consomme son siège en l'achetant", async () => {
    const inv = new InventaireMemoire();
    await bloquer(inv, 4, "v1");
    expect(
      (await inv.occuper({ departId: "d1", siege: 4, billetId: "b1", par: "v2", maintenant: T0 }))
        .ok,
    ).toBe(false);
    expect(
      (await inv.occuper({ departId: "d1", siege: 4, billetId: "b1", par: "v1", maintenant: T0 }))
        .ok,
    ).toBe(true);
    const plan = await inv.plan("d1");
    expect(plan.occupes[4]).toBe("b1");
    expect(plan.bloques[4]).toBeUndefined();
  });

  it("la version du plan monte à chaque changement, jamais en arrière", async () => {
    const inv = new InventaireMemoire();
    const versions: number[] = [];
    const r1 = await bloquer(inv, 1, "v1");
    const r2 = await bloquer(inv, 2, "v1");
    const r3 = await inv.occuper({
      departId: "d1",
      siege: 5,
      billetId: "b",
      par: null,
      maintenant: T0,
    });
    for (const r of [r1, r2, r3]) if (r.ok) versions.push(r.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(3);
    const levees = await inv.leverBlocages("d1", "v1");
    expect(levees.map((l) => l.siege).sort()).toEqual([1, 2]);
    expect(Math.min(...levees.map((l) => l.version))).toBeGreaterThan(Math.max(...versions));
  });

  it("choisir un autre siège lève le précédent, mais pas ceux d'une commande", async () => {
    const inv = new InventaireMemoire();
    await bloquer(inv, 1, "v1");
    await bloquer(inv, 2, "v1", "commande-1");
    await bloquer(inv, 3, "v1");
    const levees = await inv.leverBlocages("d1", "v1", [3]);
    expect(levees.map((l) => l.siege)).toEqual([1]);
    const plan = await inv.plan("d1");
    expect(Object.keys(plan.bloques).map(Number).sort()).toEqual([2, 3]);
    expect((await inv.leverCommande("d1", "commande-1")).map((l) => l.siege)).toEqual([2]);
  });

  it("libérer ne rend le siège qu'à son billet", async () => {
    const inv = new InventaireMemoire();
    await inv.occuper({ departId: "d1", siege: 1, billetId: "b1", par: null, maintenant: T0 });
    expect(await inv.liberer("d1", 1, "autre-billet")).toBeNull();
    expect((await inv.plan("d1")).occupes[1]).toBe("b1");
    expect(await inv.liberer("d1", 1, "b1")).not.toBeNull();
    expect((await inv.plan("d1")).occupes[1]).toBeUndefined();
  });

  it("l'expiration supprime les blocages échus et dit lesquels", async () => {
    const inv = new InventaireMemoire();
    await bloquer(inv, 1, "v1");
    await bloquer(inv, 2, "v2", "c");
    expect(await inv.expirer(T0)).toEqual([]);
    const expires = await inv.expirer(T16);
    expect(expires.map((e) => e.siege).sort()).toEqual([1, 2]);
    expect(expires.find((e) => e.siege === 2)?.commandeId).toBe("c");
    expect((await inv.plan("d1")).bloques).toEqual({});
  });

  it("50 demandes concurrentes du même siège : une seule est servie", async () => {
    const inv = new InventaireMemoire();
    const r = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        i % 2 === 0
          ? bloquer(inv, 9, `v${i}`)
          : inv.occuper({ departId: "d1", siege: 9, billetId: `b${i}`, par: null, maintenant: T0 }),
      ),
    );
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });
});

describe("Serialiseur : une seule exécution à la fois par clé", () => {
  it("exécute dans l'ordre pour une même clé, en parallèle pour des clés différentes", async () => {
    const s = new Serialiseur();
    const journal: string[] = [];
    const tache = (nom: string, ms: number) => async () => {
      journal.push(`début ${nom}`);
      await new Promise((r) => setTimeout(r, ms));
      journal.push(`fin ${nom}`);
      return nom;
    };
    const [a, b, c] = await Promise.all([
      s.executer("k", tache("a", 20)),
      s.executer("k", tache("b", 1)),
      s.executer("autre", tache("c", 5)),
    ]);
    expect([a, b, c]).toEqual(["a", "b", "c"]);
    expect(journal.indexOf("fin a")).toBeLessThan(journal.indexOf("début b"));
    expect(journal.indexOf("début c")).toBeLessThan(journal.indexOf("fin a"));
  });

  it("une erreur ne bloque pas la file", async () => {
    const s = new Serialiseur();
    await expect(s.executer("k", async () => Promise.reject(new Error("boum")))).rejects.toThrow(
      "boum",
    );
    await expect(s.executer("k", async () => "ok")).resolves.toBe("ok");
  });
});
