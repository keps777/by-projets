import "./configuration-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarreRemplissage, couleurRemplissage, SEUILS_REMPLISSAGE } from "./BarreRemplissage";

describe("couleurRemplissage", () => {
  it("reproduit les couleurs de la planche Analyses", () => {
    const attendu: Array<[number, string]> = [
      [91, "vert"],
      [88, "vert"],
      [84, "vert"],
      [83, "vert"],
      [78, "ambre"],
      [74, "ambre"],
      [61, "rouge"],
    ];
    for (const [valeur, couleur] of attendu) {
      expect(couleurRemplissage(valeur)).toBe(couleur);
    }
  });

  it("respecte des seuils personnalisés", () => {
    expect(couleurRemplissage(70, { vert: 90, ambre: 75 })).toBe("rouge");
    expect(SEUILS_REMPLISSAGE).toEqual({ vert: 80, ambre: 65 });
  });
});

describe("BarreRemplissage", () => {
  it("expose une barre de progression nommée", () => {
    render(<BarreRemplissage valeur={78} libelle="Remplissage Douala → Bafoussam" />);
    const barre = screen.getByRole("progressbar", { name: "Remplissage Douala → Bafoussam" });
    expect(barre).toHaveAttribute("aria-valuenow", "78");
    expect(barre).toHaveAttribute("aria-valuetext", "78 %");
    expect(barre).toHaveAttribute("data-couleur", "ambre");
  });

  it("dessine le trait en SVG à la bonne largeur", () => {
    const { container } = render(<BarreRemplissage valeur={61} libelle="x" />);
    expect(container.querySelector("svg rect")).toHaveAttribute("width", "61");
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-couleur", "rouge");
  });

  it("borne les valeurs hors limites", () => {
    const { container, rerender } = render(<BarreRemplissage valeur={140} libelle="x" />);
    expect(container.querySelector("rect")).toHaveAttribute("width", "100");
    rerender(<BarreRemplissage valeur={-5} libelle="x" />);
    expect(container.querySelector("rect")).toHaveAttribute("width", "0");
    rerender(<BarreRemplissage valeur={Number.NaN} libelle="x" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
