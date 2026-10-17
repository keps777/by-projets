import { describe, expect, it } from "vitest";
import { contexteDePortee, detailEnAttente, nomCourtAgence, porteeDepuisUrl } from "./regles";

describe("Modules · portée du changement", () => {
  it("vise toute l'agence sans paramètre", () => {
    expect(porteeDepuisUrl(new URLSearchParams())).toEqual({ type: "agence" });
    expect(contexteDePortee({ type: "agence" })).toEqual({});
  });

  it("vise une gare avec ?gare=", () => {
    const portee = porteeDepuisUrl(new URLSearchParams("gare=gare-alp-dla"));
    expect(portee).toEqual({ type: "gare", id: "gare-alp-dla" });
    expect(contexteDePortee(portee)).toEqual({ gare: "gare-alp-dla" });
  });

  it("vise une ville avec ?ville=, la gare l'emportant si les deux sont données", () => {
    const ville = porteeDepuisUrl(new URLSearchParams("ville=Douala"));
    expect(ville).toEqual({ type: "ville", nom: "Douala" });
    expect(contexteDePortee(ville)).toEqual({ ville: "Douala" });
    expect(porteeDepuisUrl(new URLSearchParams("ville=Douala&gare=g1"))).toEqual({
      type: "gare",
      id: "g1",
    });
  });

  it("ignore un paramètre vide", () => {
    expect(porteeDepuisUrl(new URLSearchParams("gare=%20&ville="))).toEqual({ type: "agence" });
  });
});

describe("Modules · phrases d'état", () => {
  it("reconnaît une condition qui attend quelqu'un", () => {
    expect(detailEnAttente("code court attribué par MTN · Orange en attente")).toBe(true);
    expect(detailEnAttente("partenaire financier en cours · simulation disponible")).toBe(true);
    expect(detailEnAttente("3 gares · assurance partenaire active")).toBe(false);
    expect(detailEnAttente("Douala actif · 18 livreurs · Bafoussam dès 15 livreurs")).toBe(false);
  });

  it("donne le nom court de l'agence", () => {
    expect(nomCourtAgence("Alpha Voyages")).toBe("Alpha");
    expect(nomCourtAgence("Oméga")).toBe("Oméga");
  });
});
