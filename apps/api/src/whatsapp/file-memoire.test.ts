import { describe, expect, it } from "vitest";
import { HorlogeFixe } from "../socle/testing/memoire";
import { ErreurNonRelancable, type OptionsTravail } from "./file";
import { FileEnvoiMemoire } from "./file-memoire";

const DONNEES = { messageId: "m", destinataireChiffre: "c", contenuChiffre: "t" };
const opts = (jobId: string, surcharge: Partial<OptionsTravail> = {}): OptionsTravail => ({
  jobId,
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  ...surcharge,
});

function monter() {
  const horloge = new HorlogeFixe(new Date("2027-01-05T07:00:00Z"));
  const file = new FileEnvoiMemoire(horloge, 0);
  const vus: Array<{ id: string; essai: number; a: number }> = [];
  return { horloge, file, vus };
}

describe("FileEnvoiMemoire (comportement BullMQ)", () => {
  it("un jobId déjà vu n'est pas ajouté deux fois", async () => {
    const { file, vus, horloge } = monter();
    expect(await file.ajouter("whatsapp", DONNEES, opts("a"))).toEqual({ id: "a", nouveau: true });
    expect(await file.ajouter("whatsapp", DONNEES, opts("a"))).toEqual({ id: "a", nouveau: false });
    file.traiter(async (t) => {
      vus.push({ id: t.id, essai: t.attemptsMade, a: horloge.maintenant().getTime() });
    });
    await file.traiterPrets();
    expect(vus).toHaveLength(1);
    // même après exécution, le jobId reste connu
    expect((await file.ajouter("whatsapp", DONNEES, opts("a"))).nouveau).toBe(false);
  });

  it("refuse un jobId avec « : » (comme BullMQ)", async () => {
    const { file } = monter();
    await expect(file.ajouter("whatsapp", DONNEES, opts("a:b"))).rejects.toThrow();
  });

  it("respecte le délai", async () => {
    const { file, horloge } = monter();
    let n = 0;
    file.traiter(async () => void n++);
    await file.ajouter("whatsapp", DONNEES, opts("a", { delay: 60_000 }));
    expect(await file.traiterPrets()).toBe(0);
    horloge.avancer(59_999);
    expect(await file.traiterPrets()).toBe(0);
    horloge.avancer(1);
    expect(await file.traiterPrets()).toBe(1);
    expect(n).toBe(1);
  });

  it("traite d'abord la priorité 1, puis l'ordre d'arrivée", async () => {
    const { file } = monter();
    const ordre: string[] = [];
    file.traiter(async (t) => void ordre.push(t.id), { concurrence: 1 });
    await file.ajouter("whatsapp", DONNEES, opts("alerte", { priority: 10 }));
    await file.ajouter("whatsapp", DONNEES, opts("autre", { priority: 10 }));
    await file.ajouter("whatsapp", DONNEES, opts("billet", { priority: 1 }));
    await file.traiterPrets();
    expect(ordre).toEqual(["billet", "alerte", "autre"]);
  });

  it("attente exponentielle entre les essais : 1 s, 2 s, puis échec", async () => {
    const { file, horloge, vus } = monter();
    const debut = horloge.maintenant().getTime();
    file.traiter(async (t) => {
      vus.push({ id: t.id, essai: t.attemptsMade, a: horloge.maintenant().getTime() - debut });
      throw new Error("panne");
    });
    await file.ajouter("whatsapp", DONNEES, opts("a", { attempts: 3 }));
    for (let i = 0; i < 10; i++) {
      await file.traiterPrets();
      const p = file.prochaineEcheance();
      if (!p) break;
      horloge.avancer(p.getTime() - horloge.maintenant().getTime());
    }
    expect(vus).toEqual([
      { id: "a", essai: 0, a: 0 },
      { id: "a", essai: 1, a: 1000 },
      { id: "a", essai: 2, a: 3000 },
    ]);
    expect(await file.compter()).toMatchObject({ attente: 0, echoues: 1 });
  });

  it("attente fixe", async () => {
    const { file, horloge, vus } = monter();
    const debut = horloge.maintenant().getTime();
    file.traiter(async (t) => {
      vus.push({ id: t.id, essai: t.attemptsMade, a: horloge.maintenant().getTime() - debut });
      throw new Error("panne");
    });
    await file.ajouter("whatsapp", DONNEES, opts("a", { backoff: { type: "fixed", delay: 500 } }));
    for (let i = 0; i < 10; i++) {
      await file.traiterPrets();
      const p = file.prochaineEcheance();
      if (!p) break;
      horloge.avancer(p.getTime() - horloge.maintenant().getTime());
    }
    expect(vus.map((v) => v.a)).toEqual([0, 500, 1000]);
  });

  it("ErreurNonRelancable arrête les essais tout de suite", async () => {
    const { file, horloge } = monter();
    let n = 0;
    file.traiter(async () => {
      n++;
      throw new ErreurNonRelancable("refus");
    });
    await file.ajouter("whatsapp", DONNEES, opts("a", { attempts: 5 }));
    await file.traiterPrets();
    horloge.avancer(3_600_000);
    await file.traiterPrets();
    expect(n).toBe(1);
    expect(await file.compter()).toMatchObject({ echoues: 1, attente: 0 });
  });

  it("une réussite au 2e essai termine le travail", async () => {
    const { file, horloge } = monter();
    let n = 0;
    file.traiter(async () => {
      if (++n === 1) throw new Error("une fois");
    });
    await file.ajouter("whatsapp", DONNEES, opts("a"));
    await file.traiterPrets();
    horloge.avancer(1000);
    await file.traiterPrets();
    expect(n).toBe(2);
    expect(await file.compter()).toMatchObject({ termines: 1, echoues: 0, attente: 0 });
  });

  it("limite la concurrence", async () => {
    const { file } = monter();
    let actifs = 0;
    let max = 0;
    file.traiter(
      async () => {
        actifs++;
        max = Math.max(max, actifs);
        await new Promise((r) => setTimeout(r, 5));
        actifs--;
      },
      { concurrence: 3 },
    );
    for (let i = 0; i < 10; i++) await file.ajouter("whatsapp", DONNEES, opts(`j${i}`));
    await file.traiterPrets();
    expect(max).toBe(3);
    expect((await file.compter()).termines).toBe(10);
  });

  it("retire un travail en attente, pas un travail terminé", async () => {
    const { file } = monter();
    file.traiter(async () => undefined);
    await file.ajouter("whatsapp", DONNEES, opts("a", { delay: 1000 }));
    await file.ajouter("whatsapp", DONNEES, opts("b"));
    expect(await file.retirer("a")).toBe(true);
    await file.traiterPrets();
    expect(await file.retirer("b")).toBe(false);
    expect(await file.retirer("zzz")).toBe(false);
    expect((await file.compter()).attente).toBe(0);
  });

  it("le processeur reçoit une copie : le modifier ne change pas la file", async () => {
    const { file } = monter();
    const entrees: string[] = [];
    file.traiter(async (t) => {
      entrees.push(t.data.contenuChiffre);
      t.data.contenuChiffre = "altéré";
      if (entrees.length === 1) throw new Error("encore");
    });
    await file.ajouter("whatsapp", DONNEES, opts("a", { backoff: { type: "fixed", delay: 0 } }));
    await file.traiterPrets();
    expect(entrees).toEqual(["t", "t"]);
  });

  it("un seul processeur", () => {
    const { file } = monter();
    file.traiter(async () => undefined);
    expect(() => file.traiter(async () => undefined)).toThrow();
  });
});
