import { describe, expect, it } from "vitest";
import { ClotureMemoire } from "./memoire";
import type { Cloture } from "./modele";
import { Exclusion, VerrouillageMois } from "./verrouillage.service";

const C = "agence";

function cloture(mois: string, compagnieId = C): Cloture {
  return { compagnieId, mois } as unknown as Cloture;
}

async function verrou(...mois: string[]) {
  const clotures = new ClotureMemoire();
  for (const m of mois) await clotures.verrouiller(cloture(m));
  return new VerrouillageMois(clotures);
}

describe("verrouillage des mois clôturés", () => {
  it("un mois clôturé est verrouillé, pour son agence seulement", async () => {
    const v = await verrou("2026-11");
    expect(await v.estVerrouille(C, "2026-11")).toBe(true);
    expect(await v.estVerrouille(C, "2026-12")).toBe(false);
    expect(await v.estVerrouille("autre", "2026-11")).toBe(false);
  });

  it("un instant est jugé à l'heure de Douala : le 30 novembre à 23:30 UTC est déjà décembre", async () => {
    const v = await verrou("2026-11");
    expect(await v.estVerrouille(C, new Date("2026-11-15T10:00:00Z"))).toBe(true);
    expect(await v.estVerrouille(C, new Date("2026-11-30T22:59:00Z"))).toBe(true);
    expect(await v.estVerrouille(C, new Date("2026-11-30T23:00:00Z"))).toBe(false);
  });

  it("exigerOuvert refuse un mois clos par 409 MOIS_VERROUILLE et laisse passer un mois ouvert", async () => {
    const v = await verrou("2026-11");
    await expect(v.exigerOuvert(C, "2026-11")).rejects.toMatchObject({
      status: 409,
      response: { code: "MOIS_VERROUILLE", message: expect.stringContaining("Novembre 2026") },
    });
    await expect(v.exigerOuvert(C, "2026-12")).resolves.toBeUndefined();
  });

  it("une écriture tardive s'inscrit au début du premier mois ouvert qui suit", async () => {
    const v = await verrou("2026-11", "2026-12");
    const ouvert = new Date("2027-01-04T09:00:00Z");
    expect(await v.premierInstantOuvert(C, ouvert)).toBe(ouvert.toISOString());
    // Douala est en avance d'une heure : minuit à Douala, c'est 23:00 UTC la veille.
    expect(await v.premierInstantOuvert(C, new Date("2026-11-20T10:00:00Z"))).toBe(
      "2026-12-31T23:00:00.000Z",
    );
    expect(await v.premierInstantOuvert(C, new Date("2026-12-31T10:00:00Z"))).toBe(
      "2026-12-31T23:00:00.000Z",
    );
  });
});

describe("Exclusion : une file par clé", () => {
  it("deux travaux de la même clé s'exécutent l'un après l'autre, même si le premier échoue", async () => {
    const e = new Exclusion();
    const journal: string[] = [];
    const lent = e.executer("k", async () => {
      journal.push("début 1");
      await new Promise((r) => setTimeout(r, 20));
      journal.push("fin 1");
      throw new Error("échec");
    });
    const suivant = e.executer("k", async () => {
      journal.push("début 2");
      return "ok";
    });
    await expect(lent).rejects.toThrow("échec");
    await expect(suivant).resolves.toBe("ok");
    expect(journal).toEqual(["début 1", "fin 1", "début 2"]);
  });

  it("des clés différentes ne s'attendent pas", async () => {
    const e = new Exclusion();
    const journal: string[] = [];
    const a = e.executer("a", async () => {
      await new Promise((r) => setTimeout(r, 20));
      journal.push("a");
    });
    const b = e.executer("b", async () => {
      journal.push("b");
    });
    await Promise.all([a, b]);
    expect(journal).toEqual(["b", "a"]);
  });
});
