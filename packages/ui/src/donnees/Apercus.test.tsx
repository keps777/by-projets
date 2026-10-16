import "./configuration-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApercuBilletThermique } from "./ApercuBilletThermique";
import { ApercuEtiquetteColis } from "./ApercuEtiquetteColis";
import { largeursBarres } from "./internes/CodeBarres";

describe("ApercuEtiquetteColis", () => {
  const props = {
    trajet: "DLA → BAF",
    destinataire: "Ngo Thérèse · ···· 18 22",
    reference: "C-ALP-DLA-270105-0042",
    poids: "2 kg",
    heure: "08:15",
    mention: "Alpha Voyages · afrimove.cm · pas de code ici",
    statutImprimante: "imprimante OK",
  };

  it("reprend les mentions de l'étiquette 58 × 40 mm de la planche", () => {
    render(<ApercuEtiquetteColis {...props} />);
    const carte = screen.getByRole("region", {
      name: "Aperçu de l'étiquette colis C-ALP-DLA-270105-0042",
    });
    expect(carte).toHaveTextContent("Aperçu de l'étiquette · 58 × 40 mm");
    expect(carte).toHaveTextContent("imprimante OK");
    expect(screen.getByText("DLA → BAF")).toBeInTheDocument();
    expect(screen.getByText("Ngo Thérèse · ···· 18 22")).toBeInTheDocument();
    expect(screen.getByText("C-ALP-DLA-270105-0042 · 2 kg · 08:15")).toBeInTheDocument();
    expect(screen.getByText(/pas de code ici/)).toBeInTheDocument();
  });

  it("dessine un code-barres SVG nommé de 96 × 40", () => {
    render(<ApercuEtiquetteColis {...props} />);
    const barres = screen.getByRole("img", { name: "Code-barres du colis" });
    expect(barres).toHaveAttribute("width", "96");
    expect(barres).toHaveAttribute("height", "40");
    expect(barres.querySelectorAll("path").length).toBeGreaterThan(10);
  });

  it("n'affiche pas de code de retrait", () => {
    render(<ApercuEtiquetteColis {...props} />);
    expect(screen.queryByText(/retrait/i)).toBeNull();
  });
});

describe("ApercuBilletThermique", () => {
  const props = {
    compagnie: "Alpha Voyages",
    trajet: "DLA → YDE",
    depart: "Mar 5 janv. · 08:30",
    siege: "24",
    voyageur: "Tchoumi Paul",
    montant: "4 000 F",
    mode: "Cash",
    numero: "ALP-DLA-270105-0185",
    statutImprimante: "imprimante OK",
  };

  it("affiche le billet avec ses détails", () => {
    render(<ApercuBilletThermique {...props} />);
    const carte = screen.getByRole("region", { name: "Aperçu du billet ALP-DLA-270105-0185" });
    expect(carte).toHaveTextContent("Aperçu du billet · 58 mm");
    expect(screen.getByText("DLA → YDE")).toBeInTheDocument();
    expect(screen.getByText("Siège").nextElementSibling).toHaveTextContent("24");
    expect(screen.getByText("Cash").nextElementSibling).toHaveTextContent("4 000 F");
    expect(screen.getByText("ALP-DLA-270105-0185")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Code-barres du billet" })).toBeInTheDocument();
  });
});

describe("largeursBarres", () => {
  it("est stable pour un même texte et varie d'un texte à l'autre", () => {
    expect(largeursBarres("A")).toEqual(largeursBarres("A"));
    expect(largeursBarres("A")).not.toEqual(largeursBarres("B"));
    expect(largeursBarres("A").every((l) => l >= 1 && l <= 3)).toBe(true);
  });
});
