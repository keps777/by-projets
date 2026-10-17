import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mediane, percentile } from "./statistiques.service";
import { TYPES_SMS } from "./types";
import { monterSms, VARIABLES_BILLET, type MontageSms } from "./testing/montage";

afterEach(() => vi.restoreAllMocks());

describe("mediane et percentile", () => {
  it("médiane", () => {
    expect(mediane([])).toBeNull();
    expect(mediane([5])).toBe(5);
    expect(mediane([9, 1, 5])).toBe(5);
    expect(mediane([4, 1, 3, 2])).toBe(3); // (2 + 3) / 2 arrondi
  });

  it("95e centile par rang", () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        0.95,
      ),
    ).toBe(95);
    expect(percentile([7], 0.95)).toBe(7);
  });
});

const tel = (i: number) => `+2376550${String(i).padStart(5, "0")}`;

async function remplir(m: MontageSms) {
  // 3 billets à 1 morceau pour c1, 1 billet de 2 morceaux pour c2
  for (let i = 1; i <= 3; i++) {
    await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: tel(i),
      compagnieId: "c1",
    });
  }
  await m.passerelle.envoyer({
    type: "billet",
    variables: {
      ...VARIABLES_BILLET,
      compagnie: "C".repeat(30),
      origine: "O".repeat(24),
      destination: "D".repeat(24),
      lien: `https://afrimove.app/${"x".repeat(50)}`,
    },
    destinataire: tel(4),
    compagnieId: "c2",
  });
  await m.passerelle.envoyer({
    type: "pin_provisoire",
    variables: { pin: "482915", lien: "https://afrimove.app/app" },
    destinataire: tel(5),
    compagnieId: "c1",
  });
  await m.passerelle.envoyer({
    type: "retard",
    variables: {
      compagnie: "Alpha",
      origine: "Douala",
      destination: "Yaoundé",
      departA: new Date(),
      minutes: 20,
    },
    destinataire: tel(6),
    compagnieId: "c1",
  });
  await m.vider();
}

describe("coût par type de SMS", () => {
  it("morceaux × 12 F, par type, avec les totaux", async () => {
    const m = monterSms();
    await remplir(m);
    const r = await m.statistiques.couts();
    expect(r.coutParSegmentFcfa).toBe(12);
    expect(r.parType.map((l) => l.type)).toEqual([...TYPES_SMS]);
    const ligne = (t: string) => r.parType.find((l) => l.type === t)!;
    expect(ligne("billet")).toMatchObject({
      libelle: "Billet (QR, lien et code)",
      messages: 4,
      envoyes: 4,
      segments: 5,
      coutFcfa: 60,
    });
    expect(ligne("pin_provisoire")).toMatchObject({ messages: 1, segments: 1, coutFcfa: 12 });
    expect(ligne("retard")).toMatchObject({ messages: 1, coutFcfa: 12 });
    expect(ligne("code_retrait")).toMatchObject({ messages: 0, coutFcfa: 0, delaiMedianMs: null });
    expect(r.total).toMatchObject({ messages: 6, envoyes: 6, segments: 7, coutFcfa: 84 });
    expect(r.total.coutFcfa).toBe(r.parType.reduce((n, l) => n + l.coutFcfa, 0));
  });

  it("un message perdu ne coûte rien et est compté à part", async () => {
    const m = monterSms();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    m.principal.programmer({ type: "definitif" });
    await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: tel(1),
    });
    await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: tel(2),
    });
    await m.vider();
    expect((await m.statistiques.couts()).total).toMatchObject({
      messages: 2,
      envoyes: 1,
      perdus: 1,
      coutFcfa: 12,
    });
  });

  it("les messages en attente ne sont pas encore facturés", async () => {
    const m = monterSms();
    await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: tel(1),
    });
    expect((await m.statistiques.couts()).total).toMatchObject({
      enAttente: 1,
      coutFcfa: 0,
      segments: 0,
    });
  });

  it("filtre par compagnie et par période", async () => {
    const m = monterSms();
    await remplir(m);
    expect((await m.statistiques.couts({ compagnieId: "c1" })).total).toMatchObject({
      messages: 5,
      coutFcfa: 60,
    });
    expect((await m.statistiques.couts({ compagnieId: "c2" })).total).toMatchObject({
      messages: 1,
      coutFcfa: 24,
    });
    expect((await m.statistiques.couts({ compagnieId: "inconnue" })).total.messages).toBe(0);

    const maintenant = m.horloge.maintenant();
    expect(
      (await m.statistiques.couts({ du: new Date(maintenant.getTime() + 1) })).total.messages,
    ).toBe(0);
    expect(
      (await m.statistiques.couts({ au: new Date(maintenant.getTime() - 1) })).total.messages,
    ).toBe(0);
  });

  it("délai médian et objectif de 5 s", async () => {
    const m = monterSms({ latenceMs: 6000 });
    await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: tel(1),
    });
    await m.vider();
    const lent = await m.statistiques.couts();
    expect(lent.total.delaiMedianMs).toBe(6000);
    expect(lent.objectifAtteint).toBe(false);

    const rapide = monterSms({ latenceMs: 900 });
    expect((await rapide.statistiques.couts()).objectifAtteint).toBeNull(); // rien d'envoyé
    await rapide.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: tel(1),
    });
    await rapide.vider();
    const ok = await rapide.statistiques.couts();
    expect(ok).toMatchObject({
      objectifAtteint: true,
      objectifDelaiMedianMs: 5000,
      delaiP95Ms: 900,
    });
    expect(ok.parType.find((l) => l.type === "billet")?.delaiMedianMs).toBe(900);
  });
});
