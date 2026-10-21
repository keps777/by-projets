import { describe, expect, it, vi } from "vitest";
import { appliquerVerrouKiosque } from "./verrou";

function fauxDocument(pleinEcran: Element | null = null) {
  const doc = document.implementation.createHTMLDocument("kiosque");
  Object.defineProperty(doc, "fullscreenElement", { value: pleinEcran, configurable: true });
  const requestFullscreen = vi.fn().mockResolvedValue(undefined);
  doc.documentElement.requestFullscreen = requestFullscreen;
  return { doc, requestFullscreen };
}

describe("appliquerVerrouKiosque", () => {
  it("bloque le menu contextuel (appui long)", () => {
    const { doc } = fauxDocument();
    appliquerVerrouKiosque(doc);
    const e = new Event("contextmenu", { cancelable: true });
    doc.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("redemande le plein écran au toucher quand Chrome en est sorti", () => {
    const { doc, requestFullscreen } = fauxDocument();
    appliquerVerrouKiosque(doc);
    doc.dispatchEvent(new Event("pointerdown"));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("ne le redemande pas quand on y est déjà", () => {
    const { doc, requestFullscreen } = fauxDocument(document.body);
    appliquerVerrouKiosque(doc);
    doc.dispatchEvent(new Event("pointerdown"));
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("supporte un refus du navigateur sans erreur", async () => {
    const { doc, requestFullscreen } = fauxDocument();
    requestFullscreen.mockRejectedValue(new Error("geste requis"));
    appliquerVerrouKiosque(doc);
    doc.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it("défait tout avec la fonction renvoyée", () => {
    const { doc, requestFullscreen } = fauxDocument();
    const defaire = appliquerVerrouKiosque(doc);
    defaire();
    const e = new Event("contextmenu", { cancelable: true });
    doc.dispatchEvent(e);
    doc.dispatchEvent(new Event("pointerdown"));
    expect(e.defaultPrevented).toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
