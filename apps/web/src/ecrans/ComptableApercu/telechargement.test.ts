import { afterEach, describe, expect, it, vi } from "vitest";
import { remettreLeFichier } from "./telechargement";

describe("remettreLeFichier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const OCTETS = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80]);

  function espionner() {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    const liens: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      liens.push(this);
      expect(document.body.contains(this)).toBe(true);
    });
    return { blobs, liens };
  }

  it("clique un lien temporaire portant le nom du fichier, puis le retire et libère l'adresse", async () => {
    vi.useFakeTimers();
    const { blobs, liens } = espionner();

    remettreLeFichier({
      nom: "journal-ventes-2026-12.xlsx",
      typeMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      octets: OCTETS,
    });

    expect(liens).toHaveLength(1);
    expect(liens[0]?.download).toBe("journal-ventes-2026-12.xlsx");
    expect(liens[0]?.getAttribute("href")).toBe("blob:test");
    expect(document.body.contains(liens[0] as HTMLAnchorElement)).toBe(false);
    expect(blobs[0]?.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("remet les octets tels quels : ni octet d'ordre ajouté, ni réencodage", async () => {
    const { blobs } = espionner();
    remettreLeFichier({ nom: "f.bin", typeMime: "application/octet-stream", octets: OCTETS });
    const lus = await new Promise<ArrayBuffer>((resolve) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(lecteur.result as ArrayBuffer);
      lecteur.readAsArrayBuffer(blobs[0] as Blob);
    });
    expect([...new Uint8Array(lus)]).toEqual([...OCTETS]);
  });
});
