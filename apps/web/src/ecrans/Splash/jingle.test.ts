import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DUREE_JINGLE_S,
  ErreurSonIndisponible,
  PARTITION,
  creerJingleWebAudio,
  frequenceMidi,
} from "./jingle";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Jingle · partition", () => {
  it("tient dans les 10 secondes et se termine à la dixième", () => {
    expect(DUREE_JINGLE_S).toBe(10);
    for (const n of PARTITION) {
      expect(n.debut).toBeGreaterThanOrEqual(0);
      expect(n.duree).toBeGreaterThan(0);
      expect(n.debut + n.duree).toBeLessThanOrEqual(DUREE_JINGLE_S + 1e-9);
      expect(n.volume).toBeGreaterThan(0);
      expect(n.volume).toBeLessThanOrEqual(1);
    }
    const fin = Math.max(...PARTITION.map((n) => n.debut + n.duree));
    expect(fin).toBeCloseTo(DUREE_JINGLE_S, 6);
  });

  it("commence à la première seconde et finit sur un accord d'au moins trois notes", () => {
    expect(Math.min(...PARTITION.map((n) => n.debut))).toBe(0);
    const dernierDebut = Math.max(...PARTITION.map((n) => n.debut));
    expect(PARTITION.filter((n) => n.debut === dernierDebut).length).toBeGreaterThanOrEqual(3);
  });

  it("convertit les numéros MIDI en fréquences", () => {
    expect(frequenceMidi(69)).toBeCloseTo(440, 6);
    expect(frequenceMidi(81)).toBeCloseTo(880, 6);
    expect(frequenceMidi(57)).toBeCloseTo(220, 6);
  });
});

/** Faux contexte audio qui enregistre ce que le jingle programme. */
function fauxContexte() {
  const oscillateurs: Array<{
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  const parametre = () => ({
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const general = { gain: parametre(), connect: vi.fn() };
  let premier = true;
  const contexte = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const o = {
        type: "sine",
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      };
      oscillateurs.push(o);
      return o;
    }),
    createGain: vi.fn(() => {
      if (premier) {
        premier = false;
        return general;
      }
      return { gain: parametre(), connect: vi.fn() };
    }),
  };
  return { contexte: contexte as unknown as AudioContext, brut: contexte, oscillateurs, general };
}

describe("Jingle · Web Audio", () => {
  it("ne crée aucun contexte audio avant jouer() : rien ne sonne sans toucher", () => {
    const creerContexte = vi.fn();
    const jingle = creerJingleWebAudio({ creerContexte });
    expect(jingle.enLecture()).toBe(false);
    expect(jingle.position()).toBe(0);
    expect(creerContexte).not.toHaveBeenCalled();
  });

  it("programme une note par ligne de la partition, au bon moment et à la bonne hauteur", async () => {
    const faux = fauxContexte();
    faux.brut.currentTime = 5;
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    await jingle.jouer();

    expect(faux.brut.resume).toHaveBeenCalledOnce();
    expect(jingle.enLecture()).toBe(true);
    expect(faux.oscillateurs).toHaveLength(PARTITION.length);
    PARTITION.forEach((n, i) => {
      const o = faux.oscillateurs[i]!;
      expect(o.type).toBe(n.timbre);
      expect(o.frequency.value).toBeCloseTo(frequenceMidi(n.midi), 6);
      expect(o.start).toHaveBeenCalledWith(5 + n.debut);
      expect(o.stop.mock.calls[0]![0]).toBeGreaterThan(5 + n.debut + n.duree - 1e-9);
    });
  });

  it("suit la position de lecture et la plafonne à la durée", async () => {
    const faux = fauxContexte();
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    await jingle.jouer();
    faux.brut.currentTime = 3.5;
    expect(jingle.position()).toBeCloseTo(3.5, 6);
    faux.brut.currentTime = 99;
    expect(jingle.position()).toBe(DUREE_JINGLE_S);
  });

  it("arreter() coupe tout, ferme le contexte et prévient les abonnés", async () => {
    vi.useFakeTimers();
    const faux = fauxContexte();
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    const rappel = vi.fn();
    jingle.abonner(rappel);
    await jingle.jouer();
    rappel.mockClear();

    jingle.arreter();
    expect(jingle.enLecture()).toBe(false);
    expect(jingle.position()).toBe(0);
    expect(rappel).toHaveBeenCalledOnce();
    expect(faux.general.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      expect.any(Number),
    );
    for (const o of faux.oscillateurs) expect(o.stop.mock.calls.length).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(faux.brut.close).toHaveBeenCalledOnce();

    // Arrêter deux fois ne fait rien de plus.
    jingle.arreter();
    expect(rappel).toHaveBeenCalledOnce();
  });

  it("s'arrête seul au bout de 10 secondes", async () => {
    vi.useFakeTimers();
    const faux = fauxContexte();
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    const rappel = vi.fn();
    jingle.abonner(rappel);
    await jingle.jouer();
    rappel.mockClear();

    await vi.advanceTimersByTimeAsync(9_000);
    expect(jingle.enLecture()).toBe(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(jingle.enLecture()).toBe(false);
    expect(rappel).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(faux.brut.close).toHaveBeenCalledOnce();
  });

  it("ne rejoue pas pendant la lecture, et peut rejouer après l'arrêt", async () => {
    vi.useFakeTimers();
    const contextes = [fauxContexte(), fauxContexte()];
    const creerContexte = vi.fn(() => contextes[creerContexte.mock.calls.length - 1]!.contexte);
    const jingle = creerJingleWebAudio({ creerContexte });
    await jingle.jouer();
    await jingle.jouer();
    expect(creerContexte).toHaveBeenCalledTimes(1);
    jingle.arreter();
    await jingle.jouer();
    expect(creerContexte).toHaveBeenCalledTimes(2);
    expect(contextes[1]!.oscillateurs).toHaveLength(PARTITION.length);
  });

  it("un arrêt pendant la reprise du contexte n'envoie aucune note", async () => {
    vi.useFakeTimers();
    const faux = fauxContexte();
    let reprendre: () => void = () => undefined;
    faux.brut.resume = vi.fn(() => new Promise<void>((resolve) => (reprendre = resolve)));
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    const lecture = jingle.jouer();
    jingle.arreter();
    reprendre();
    await lecture;
    expect(faux.oscillateurs).toHaveLength(0);
    expect(jingle.enLecture()).toBe(false);
  });

  it("rejette avec ErreurSonIndisponible quand le navigateur n'a pas d'API audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const jingle = creerJingleWebAudio();
    await expect(jingle.jouer()).rejects.toBeInstanceOf(ErreurSonIndisponible);
    expect(jingle.enLecture()).toBe(false);
  });

  it("rejette et se remet à l'arrêt quand le navigateur refuse de démarrer le son", async () => {
    vi.useFakeTimers();
    const faux = fauxContexte();
    faux.brut.resume = vi.fn(() => Promise.reject(new Error("refusé")));
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    const rappel = vi.fn();
    jingle.abonner(rappel);
    await expect(jingle.jouer()).rejects.toBeInstanceOf(ErreurSonIndisponible);
    expect(jingle.enLecture()).toBe(false);
    expect(faux.oscillateurs).toHaveLength(0);
    // Il a prévenu au démarrage puis à l'échec : l'interface revient à « arrêté ».
    expect(rappel).toHaveBeenCalledTimes(2);
  });

  it("se désabonne", async () => {
    const faux = fauxContexte();
    const jingle = creerJingleWebAudio({ creerContexte: () => faux.contexte });
    const rappel = vi.fn();
    const quitter = jingle.abonner(rappel);
    quitter();
    await jingle.jouer();
    expect(rappel).not.toHaveBeenCalled();
  });
});
