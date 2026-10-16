import "./configuration-tests";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LigneAlerte } from "./LigneAlerte";
import { LigneListe } from "./LigneListe";
import { ListeGlissable } from "./ListeGlissable";

describe("ListeGlissable", () => {
  it("affiche le titre, la mention « n · glisser » et les lignes", () => {
    render(
      <ListeGlissable titre="Par ligne · remplissage" nombre={7} hauteur={168}>
        <LigneListe>A</LigneListe>
        <LigneListe>B</LigneListe>
      </ListeGlissable>,
    );
    const carte = screen.getByRole("region", { name: "Par ligne · remplissage" });
    expect(within(carte).getByText("7 · glisser")).toBeInTheDocument();
    expect(within(carte).getAllByRole("listitem")).toHaveLength(2);
  });

  it("fixe la hauteur de la zone qui défile", () => {
    render(
      <ListeGlissable titre="Par bus" mention="14 bus · glisser" hauteur={168}>
        <LigneListe>A</LigneListe>
      </ListeGlissable>,
    );
    const defilement = screen.getByRole("region", { name: "Par bus (liste qui défile)" });
    expect(defilement.parentElement).toHaveStyle({ height: "168px" });
    expect(defilement).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("14 bus · glisser")).toBeInTheDocument();
  });

  it("accepte la hauteur libre et la hauteur auto", () => {
    const { rerender } = render(
      <ListeGlissable titre="Alertes · 6" hauteur="libre">
        <LigneListe>A</LigneListe>
      </ListeGlissable>,
    );
    expect(screen.getByRole("region", { name: "Alertes · 6" })).toHaveAttribute(
      "data-hauteur",
      "libre",
    );
    rerender(
      <ListeGlissable titre="Alertes · 6" hauteur="auto">
        <LigneListe>A</LigneListe>
      </ListeGlissable>,
    );
    expect(screen.getByRole("region", { name: "Alertes · 6" })).toHaveAttribute(
      "data-hauteur",
      "auto",
    );
  });

  it("ne montre pas de mention sans nombre ni texte", () => {
    render(
      <ListeGlissable titre="Alertes">
        <LigneListe>A</LigneListe>
      </ListeGlissable>,
    );
    expect(screen.queryByText(/glisser/)).toBeNull();
  });
});

describe("LigneAlerte", () => {
  it("lit le niveau avant le texte et affiche l'heure", () => {
    render(
      <ul>
        <LigneAlerte etat="rouge" texte="Guichet 3 Akwa · Pauline N. bloquée" heure="09:40" />
      </ul>,
    );
    expect(screen.getByText("Urgent :")).toBeInTheDocument();
    expect(screen.getByText("09:40")).toBeInTheDocument();
    expect(
      screen
        .getByText(/Guichet 3 Akwa · Pauline N. bloquée/)
        .closest("li")
        ?.querySelector("[data-etat]"),
    ).toHaveAttribute("data-etat", "rouge");
  });

  it("devient un lien avec href et un bouton avec onClick", async () => {
    const onClick = vi.fn();
    render(
      <ul>
        <LigneAlerte texte="Vers la gare" href="#gare" />
        <LigneAlerte texte="Ouvrir" onClick={onClick} />
        <LigneAlerte texte="Simple" />
      </ul>,
    );
    expect(screen.getByRole("link", { name: /Vers la gare/ })).toHaveAttribute("href", "#gare");
    await userEvent.click(screen.getByRole("button", { name: /Ouvrir/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("permet un niveau personnalisé et la variante large", () => {
    render(
      <ul>
        <LigneAlerte texte="x" niveau="Panne" variante="large" />
      </ul>,
    );
    expect(screen.getByText("Panne :")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveAttribute("data-variante", "large");
  });
});

describe("LigneListe", () => {
  it("applique les colonnes et la densité", () => {
    render(
      <ul>
        <LigneListe colonnes="1fr 64px auto" densite="serree" ariaLabel="Ligne test">
          <span>a</span>
        </LigneListe>
      </ul>,
    );
    expect(screen.getByLabelText("Ligne test")).toHaveStyle({
      gridTemplateColumns: "1fr 64px auto",
    });
    expect(screen.getByRole("listitem")).toHaveAttribute("data-densite", "serree");
  });

  it("réagit au clic quand elle est un bouton", async () => {
    const onClick = vi.fn();
    render(
      <ul>
        <LigneListe onClick={onClick}>Voir</LigneListe>
      </ul>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Voir" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
