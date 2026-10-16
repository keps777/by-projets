import "./configuration-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Histogramme, cheminBarre } from "./Histogramme";
import type { BarreHistogramme } from "./Histogramme";

const JOURS: BarreHistogramme[] = [
  { etiquette: "L", valeur: 62 },
  { etiquette: "M", valeur: 58 },
  { etiquette: "M", valeur: 55 },
  { etiquette: "J", valeur: 60 },
  { etiquette: "V", valeur: 88, accent: "ambre" },
  { etiquette: "S", valeur: 100, accent: "ambre" },
  { etiquette: "D", valeur: 70 },
];

describe("Histogramme", () => {
  it("dessine une barre par valeur dans un SVG nommé", () => {
    const { container } = render(<Histogramme barres={JOURS} ariaLabel="Recette par jour" />);
    const svg = screen.getByRole("img", { name: "Recette par jour" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(container.querySelectorAll("path[data-barre]")).toHaveLength(7);
    expect(container.querySelectorAll("text")).toHaveLength(7);
  });

  it("donne un libellé par défaut qui liste les valeurs", () => {
    render(<Histogramme barres={JOURS} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /^Histogramme : L : 62, M : 58/,
    );
  });

  it("met en avant les barres ambre ou rouge et colore leur étiquette", () => {
    const { container } = render(
      <Histogramme
        barres={[
          { etiquette: "a", valeur: 1, accent: "rouge" },
          { etiquette: "b", valeur: 2 },
        ]}
      />,
    );
    const barres = container.querySelectorAll("path[data-barre]");
    expect(barres[0]).toHaveAttribute("data-accent", "rouge");
    expect(barres[1]).not.toHaveAttribute("data-accent");
    const textes = container.querySelectorAll("text");
    expect(textes[0]).toHaveAttribute("data-accent", "rouge");
    expect(textes[1]).not.toHaveAttribute("data-accent");
  });

  it("n'accentue pas les étiquettes du format semaines", () => {
    const { container } = render(
      <Histogramme format="semaines" barres={[{ etiquette: "S46", valeur: 3, accent: "rouge" }]} />,
    );
    expect(container.querySelector("text")).not.toHaveAttribute("data-accent");
    expect(screen.getByRole("img")).toHaveAttribute("data-format", "semaines");
  });

  it("garde la plus haute barre à toute la zone et proportionne les autres", () => {
    const { container } = render(
      <Histogramme
        barres={[
          { etiquette: "a", valeur: 50 },
          { etiquette: "b", valeur: 100 },
        ]}
      />,
    );
    const [a, b] = Array.from(container.querySelectorAll("path[data-barre]"));
    const hauteur = (chemin: Element | undefined) => {
      const d = chemin?.getAttribute("d") ?? "";
      const y0 = Number(/^M[\d.]+ ([\d.]+)/.exec(d)?.[1]);
      return y0;
    };
    // Plus la barre est haute, plus son point de départ est proche du haut du dessin.
    expect(hauteur(b)).toBeLessThan(hauteur(a));
  });

  it("dessine les barres prévues en pointillé et les repères de l'axe", () => {
    const { container } = render(
      <Histogramme
        format="heures"
        barres={[
          { etiquette: "05 h", valeur: 70 },
          { etiquette: "14 h", valeur: 30, prevue: true },
        ]}
        reperes={["05 h", "09 h", "17 h · prévu"]}
      />,
    );
    expect(container.querySelectorAll("path[data-prevue='oui']")).toHaveLength(1);
    expect(container.querySelectorAll("text")).toHaveLength(3);
    expect(screen.getByText("17 h · prévu")).toHaveAttribute("text-anchor", "end");
  });

  it("agrandit le dessin en variante large", () => {
    const { rerender } = render(<Histogramme barres={JOURS} />);
    const largeurMobile = Number(screen.getByRole("img").getAttribute("viewBox")?.split(" ")[2]);
    rerender(<Histogramme barres={JOURS} variante="large" />);
    const largeurLarge = Number(screen.getByRole("img").getAttribute("viewBox")?.split(" ")[2]);
    expect(largeurLarge).toBeGreaterThan(largeurMobile);
  });

  it("ne plante pas sans barre ou avec des valeurs nulles", () => {
    const { container } = render(<Histogramme barres={[{ etiquette: "a", valeur: 0 }]} />);
    expect(container.querySelectorAll("path[data-barre]")).toHaveLength(1);
    expect(cheminBarre(0, 0, 10, 0, 6, 2)).toContain("M");
  });
});
