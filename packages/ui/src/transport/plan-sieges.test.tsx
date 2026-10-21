import "./soutien-tests";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanSieges } from "./plan-sieges";

const PRIS = [1, 2, 5, 9, 10, 14, 15];

describe("PlanSieges · choix", () => {
  it("nomme chaque siège avec son état, comme dans la maquette", () => {
    render(<PlanSieges nombre={16} pris={PRIS} />);
    expect(screen.getByRole("button", { name: "Siège 7, libre" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Siège 1, pris" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siège 16, libre" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Plan des sièges" })).getAllByRole("button"),
    ).toHaveLength(16);
  });

  it("choisit un siège au toucher", async () => {
    const changement = vi.fn();
    render(<PlanSieges nombre={16} pris={PRIS} onSelectionChange={changement} />);
    await userEvent.click(screen.getByRole("button", { name: "Siège 7, libre" }));
    const choisi = screen.getByRole("button", { name: "Siège 7, choisi" });
    expect(choisi).toHaveAttribute("aria-pressed", "true");
    expect(changement).toHaveBeenLastCalledWith([7]);
  });

  it("remplace le siège choisi quand le maximum est 1", async () => {
    render(<PlanSieges nombre={16} pris={PRIS} selectionInitiale={[7]} />);
    await userEvent.click(screen.getByRole("button", { name: "Siège 8, libre" }));
    expect(screen.getByRole("button", { name: "Siège 8, choisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siège 7, libre" })).toBeInTheDocument();
  });

  it("permet plusieurs sièges avec max et libère un siège touché de nouveau", async () => {
    const changement = vi.fn();
    render(<PlanSieges nombre={16} max={2} onSelectionChange={changement} />);
    await userEvent.click(screen.getByRole("button", { name: "Siège 3, libre" }));
    await userEvent.click(screen.getByRole("button", { name: "Siège 4, libre" }));
    expect(changement).toHaveBeenLastCalledWith([3, 4]);
    await userEvent.click(screen.getByRole("button", { name: "Siège 3, choisi" }));
    expect(changement).toHaveBeenLastCalledWith([4]);
  });

  it("ne sélectionne pas un siège pris", async () => {
    const changement = vi.fn();
    render(<PlanSieges nombre={16} pris={PRIS} onSelectionChange={changement} />);
    await userEvent.click(screen.getByRole("button", { name: "Siège 1, pris" }));
    expect(changement).not.toHaveBeenCalled();
  });

  it("suit une sélection pilotée de l'extérieur", async () => {
    const { rerender } = render(<PlanSieges nombre={16} selection={[3]} />);
    expect(screen.getByRole("button", { name: "Siège 3, choisi" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Siège 4, libre" }));
    // Piloté : sans nouvelle propriété, rien ne change.
    expect(screen.getByRole("button", { name: "Siège 4, libre" })).toBeInTheDocument();
    rerender(<PlanSieges nombre={16} selection={[4]} />);
    expect(screen.getByRole("button", { name: "Siège 4, choisi" })).toBeInTheDocument();
  });

  it("marque le siège du voyageur et le bloque", () => {
    render(<PlanSieges nombre={16} toi={7} />);
    expect(screen.getByRole("button", { name: "Siège 7, à toi" })).toBeDisabled();
  });

  it("gère 16 et 40 sièges", () => {
    const { rerender } = render(<PlanSieges nombre={16} />);
    expect(screen.getAllByRole("button")).toHaveLength(16);
    rerender(<PlanSieges nombre={40} />);
    expect(screen.getAllByRole("button")).toHaveLength(40);
    expect(screen.getByRole("button", { name: "Siège 40, libre" })).toBeInTheDocument();
  });

  it("place l'allée au milieu d'une rangée 2 + 2 et accepte une autre disposition", () => {
    const { rerender } = render(<PlanSieges nombre={16} />);
    const grille = screen.getByRole("group", { name: "Plan des sièges" });
    expect(grille).toHaveStyle({ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" });
    expect(grille.children).toHaveLength(20);
    // Sièges 1 et 2, allée, sièges 3 et 4.
    expect(grille.children[2]).toHaveAttribute("aria-hidden", "true");

    rerender(<PlanSieges nombre={15} disposition={{ gauche: 2, droite: 1 }} />);
    expect(screen.getByRole("group", { name: "Plan des sièges" })).toHaveStyle({
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    });
  });

  it("affiche le repère du chauffeur, le titre, la légende et le pied", () => {
    const { rerender } = render(
      <PlanSieges nombre={16} titre="Choisis ta place" pied={<span>9 places libres</span>} />,
    );
    expect(screen.getByText("chauffeur")).toBeInTheDocument();
    expect(screen.getByText("Choisis ta place")).toBeInTheDocument();
    expect(screen.getByText(/prise/)).toBeInTheDocument();
    expect(screen.getByText("9 places libres")).toBeInTheDocument();
    rerender(<PlanSieges nombre={16} chauffeur={false} />);
    expect(screen.queryByText("chauffeur")).not.toBeInTheDocument();
  });
});

describe("PlanSieges · contrôle", () => {
  it("distingue scanné, occupé sans billet et libre", () => {
    render(<PlanSieges mode="controle" nombre={36} scannes={[1, 2, 3]} sansBillet={[7]} />);
    expect(screen.getByRole("img", { name: "Siège 1, billet scanné" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Siège 7, occupé sans billet" })).toHaveAttribute(
      "data-etat",
      "sans-billet",
    );
    expect(screen.getByRole("img", { name: "Siège 30, libre" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Plan de contrôle des sièges" })).toHaveStyle({
      gridTemplateColumns: "repeat(9, minmax(0, 1fr))",
    });
  });

  it("rend les sièges touchables pour vérifier", async () => {
    const verifier = vi.fn();
    render(<PlanSieges mode="controle" nombre={36} sansBillet={[7]} onSiege={verifier} />);
    await userEvent.click(screen.getByRole("button", { name: "Siège 7, occupé sans billet" }));
    expect(verifier).toHaveBeenCalledWith(7, "sans-billet");
  });

  it("affiche la légende de contrôle", () => {
    render(<PlanSieges mode="controle" nombre={36} />);
    expect(screen.getByText(/billet scanné/)).toBeInTheDocument();
    expect(screen.getByText(/occupé sans billet/)).toBeInTheDocument();
  });
});
