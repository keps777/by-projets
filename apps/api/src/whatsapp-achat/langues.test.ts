import { describe, expect, it } from "vitest";
import { choixDeLangue, detecterLangue, estLangue, normaliser } from "./langues";

describe("normaliser", () => {
  it("minuscules, sans accent, ponctuation en espaces", () => {
    expect(normaliser("  Après-DEMAIN, à Yaoundé ! ")).toBe("apres demain a yaounde");
    expect(normaliser("cœur")).toBe("coeur");
  });
});

describe("detecterLangue", () => {
  it.each([
    ["Billet Douala Yaoundé demain matin", "fr"],
    ["Je voudrais un billet pour demain", "fr"],
    ["Bonjour", "fr"],
    ["ticket Douala Yaoundé tomorrow morning", "en"],
    ["I want to go to Douala", "en"],
    ["Hello", "en"],
    ["I wan go Yaounde tumara", "pcm"],
    ["abeg bilet fo Bafoussam", "pcm"],
    ["wetin dey", "pcm"],
    ["how far", "pcm"],
    ["tomoro", "pcm"],
  ])("« %s » → %s", (texte, langue) => {
    expect(detecterLangue(texte)).toBe(langue);
  });

  it.each(["2", "ok", "Douala", "", "   ", "😀"])("« %s » : aucun indice", (texte) => {
    expect(detecterLangue(texte)).toBeNull();
  });

  it("français et anglais à égalité : aucun indice", () => {
    expect(detecterLangue("oui yes")).toBeNull();
  });

  it("un mot propre au pidgin l'emporte sur le reste", () => {
    expect(detecterLangue("I want to go tumara")).toBe("pcm");
  });
});

describe("choixDeLangue", () => {
  it.each([
    ["français", "fr"],
    ["Francais", "fr"],
    ["French", "fr"],
    ["english", "en"],
    ["Anglais", "en"],
    ["pidgin", "pcm"],
    ["Pidgin English", "pcm"],
    ["pcm", "pcm"],
    ["kamtok", "pcm"],
  ])("« %s » → %s", (texte, langue) => {
    expect(choixDeLangue(texte)).toBe(langue);
  });
  it("une phrase n'est pas un choix de langue", () => {
    expect(choixDeLangue("billet en français")).toBeNull();
    expect(choixDeLangue("2")).toBeNull();
  });
});

describe("estLangue", () => {
  it("fr, en et pcm seulement", () => {
    expect(["fr", "en", "pcm"].every(estLangue)).toBe(true);
    expect(estLangue("de")).toBe(false);
    expect(estLangue(null)).toBe(false);
  });
});
