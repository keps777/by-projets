import "./setup-test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as kit from "./index";

const mots =
  /r[ée]volution|disruption|digitalis|plateforme|[ée]cosyst[eè]me|solution innovante|fini les arnaques/i;

describe("DemoKit", () => {
  it("montre chaque composant du kit", () => {
    const { container } = render(<kit.DemoKit />);
    for (const titre of [
      "Boutons",
      "Pastilles d'état",
      "Puces et sélecteurs",
      "Cartes d'action",
      "Écran complet",
    ]) {
      expect(screen.getByRole("region", { name: titre })).toBeInTheDocument();
    }
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bêta Express · VIP" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-statut]").length).toBeGreaterThanOrEqual(12);
  });

  it("n'utilise aucun mot interdit par la marque", () => {
    const { container } = render(<kit.DemoKit />);
    expect(container.textContent ?? "").not.toMatch(mots);
  });

  it("garde un aria-label sur chaque bouton qui n'a que son icône", () => {
    const { container } = render(<kit.DemoKit />);
    for (const bouton of container.querySelectorAll("button, a")) {
      if ((bouton.textContent ?? "").trim() === "") {
        expect(bouton.getAttribute("aria-label")).toBeTruthy();
      }
    }
  });

  it("change de filtre au toucher d'une puce", () => {
    render(<kit.DemoKit />);
    const section = screen.getByRole("region", { name: "Puces et sélecteurs" });
    fireEvent.click(within(section).getByRole("button", { name: "Bus" }));
    expect(within(section).getByRole("button", { name: "Bus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(section).getByRole("button", { name: "Tout" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("index du kit de base", () => {
  it("exporte les composants demandés par le ticket", () => {
    for (const nom of [
      "Ecran",
      "Entete",
      "Bouton",
      "BoutonIcone",
      "CarteAction",
      "Puce",
      "Selecteur",
      "BadgeTouche",
      "Pastille",
      "BarreOnglets",
      "Etiquette",
    ] as const) {
      expect(kit[nom], nom).toBeTypeOf("function");
    }
  });
});
