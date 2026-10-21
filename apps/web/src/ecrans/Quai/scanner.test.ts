import { afterEach, describe, expect, it, vi } from "vitest";
import { creerScannerFactice, creerScanner, installerScanner, scannerNavigateur } from "./scanner";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  installerScanner();
});

describe("scanner factice", () => {
  it("transmet les QR émis tant qu'il est démarré", async () => {
    const scanner = creerScannerFactice();
    const lus: string[] = [];
    expect(scanner.demarre).toBe(false);
    await scanner.demarrer(document.createElement("video"), (qr) => lus.push(qr));
    expect(scanner.demarre).toBe(true);
    scanner.emettre("AM1:A:1234");
    scanner.arreter();
    expect(scanner.demarre).toBe(false);
    expect(lus).toEqual(["AM1:A:1234"]);
    expect(() => scanner.emettre("AM1:B:0000")).toThrow();
  });

  it("peut refuser la caméra", async () => {
    await expect(
      creerScannerFactice({ refuse: true }).demarrer(document.createElement("video"), () => {}),
    ).rejects.toThrow();
  });

  it("remplace, puis retrouve, le scanner de l'application", () => {
    const factice = creerScannerFactice();
    installerScanner(() => factice);
    expect(creerScanner()).toBe(factice);
    installerScanner();
    expect(creerScanner()).toBeNull(); // jsdom n'a ni BarcodeDetector ni caméra
  });
});

describe("scanner du navigateur", () => {
  it("n'existe pas sans BarcodeDetector ni caméra", () => {
    expect(scannerNavigateur()).toBeNull();
    vi.stubGlobal("BarcodeDetector", class {});
    expect(scannerNavigateur()).toBeNull();
  });

  it("lit les QR de la caméra arrière et n'annonce qu'une fois un code gardé devant l'objectif", async () => {
    vi.useFakeTimers();
    const piste = { stop: vi.fn() };
    const flux = { getTracks: () => [piste] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(flux);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const formats: string[][] = [];
    vi.stubGlobal(
      "BarcodeDetector",
      class {
        constructor(options: { formats: string[] }) {
          formats.push(options.formats);
        }
        detect() {
          return Promise.resolve([{ rawValue: "AM1:A:1234" }]);
        }
      },
    );

    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 4 });
    video.play = vi.fn().mockResolvedValue(undefined);

    const scanner = scannerNavigateur();
    expect(scanner).not.toBeNull();
    const lus: string[] = [];
    await scanner!.demarrer(video, (qr) => lus.push(qr));

    expect(formats).toEqual([["qr_code"]]);
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { facingMode: { ideal: "environment" } } }),
    );
    expect(video.srcObject).toBe(flux);

    await vi.advanceTimersByTimeAsync(1000);
    expect(lus).toEqual(["AM1:A:1234"]);

    scanner!.arreter();
    expect(piste.stop).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(lus).toHaveLength(1);
  });
});
