import { describe, expect, it, vi } from "vitest";
import { partagerLien } from "./partage";

const lien = {
  titre: "Payer mon voyage",
  texte: "Peux-tu payer ?",
  url: "https://afrimove.example/payer/x",
};

describe("partagerLien", () => {
  it("ouvre la feuille de partage avec le titre, le texte et l'adresse", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await partagerLien(lien, { share })).toBe("partage");
    expect(share).toHaveBeenCalledWith({
      title: lien.titre,
      text: lien.texte,
      url: lien.url,
    });
  });

  it("rend « annule » quand le voyageur ferme la feuille, sans copier", async () => {
    const writeText = vi.fn();
    const share = vi.fn().mockRejectedValue(new DOMException("annulé", "AbortError"));
    expect(await partagerLien(lien, { share, clipboard: { writeText } as never })).toBe("annule");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copie le texte et l'adresse quand il n'y a pas de feuille de partage", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await partagerLien(lien, { clipboard: { writeText } as never })).toBe("copie");
    expect(writeText).toHaveBeenCalledWith(`${lien.texte} ${lien.url}`);
  });

  it("copie aussi quand le partage échoue pour une autre raison", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new Error("panne"));
    expect(await partagerLien(lien, { share, clipboard: { writeText } as never })).toBe("copie");
  });

  it("rend « aucun » quand ni le partage ni la copie ne sont possibles", async () => {
    expect(await partagerLien(lien, {})).toBe("aucun");
    const writeText = vi.fn().mockRejectedValue(new Error("refusé"));
    expect(await partagerLien(lien, { clipboard: { writeText } as never })).toBe("aucun");
  });
});
