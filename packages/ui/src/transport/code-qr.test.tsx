import "./soutien-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeQr, cheminModules } from "./code-qr";

describe("CodeQr", () => {
  it("rend un SVG nommé avec le libellé", () => {
    render(<CodeQr valeur="BEX-DLA-270105-0142" libelle="QR code du billet" />);
    const qr = screen.getByRole("img", { name: "QR code du billet" });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(qr).toHaveAttribute("width", "132");
    expect(qr).toHaveAttribute("height", "132");
  });

  it("dessine une grille carrée avec un chemin non vide", () => {
    const { container } = render(<CodeQr valeur="BEX-DLA-270105-0142" marge={2} />);
    const svg = container.querySelector("svg");
    const [, , largeur, hauteur] = (svg?.getAttribute("viewBox") ?? "").split(" ");
    expect(largeur).toBe(hauteur);
    // Version 1 = 21 modules, plus 2 de marge de chaque côté, au minimum.
    expect(Number(largeur)).toBeGreaterThanOrEqual(25);
    expect(container.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(50);
  });

  it("produit le même dessin pour la même valeur et un autre pour une autre valeur", () => {
    const a = render(<CodeQr valeur="AAA" />).container.innerHTML;
    const b = render(<CodeQr valeur="AAA" />).container.innerHTML;
    const c = render(<CodeQr valeur="BBB" />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("respecte la taille demandée", () => {
    render(<CodeQr valeur="X" taille={200} />);
    expect(screen.getByRole("img", { name: "QR code" })).toHaveAttribute("width", "200");
  });

  it("refuse une valeur vide", () => {
    expect(() => render(<CodeQr valeur="" />)).toThrow();
  });
});

describe("cheminModules", () => {
  it("regroupe les modules voisins d'une même ligne", () => {
    // Ligne 0 : modules 0, 1, 2 sombres ; ligne 1 : module 1 sombre.
    const grille = [
      [1, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const chemin = cheminModules(3, (l, c) => grille[l]?.[c] === 1, 1);
    expect(chemin).toBe("M1 1h3v1h-3zM2 2h1v1h-1z");
  });
});
