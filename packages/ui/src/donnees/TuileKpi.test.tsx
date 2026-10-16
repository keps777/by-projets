import "./configuration-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChiffreCle, TuileKpi } from "./TuileKpi";

describe("TuileKpi", () => {
  it("affiche étiquette, valeur, sous-ligne et tendance", () => {
    render(
      <TuileKpi
        taille="large"
        etiquette="Recette du jour"
        valeur="2,61 M"
        tendance="+ 8 %"
        sousLigne="vs mardi dernier"
      />,
    );
    const tuile = screen.getByRole("group", {
      name: "Recette du jour 2,61 M + 8 % vs mardi dernier",
    });
    expect(tuile).toHaveAttribute("data-taille", "large");
    expect(screen.getByText("2,61 M")).toBeInTheDocument();
    expect(screen.getByText("+ 8 %")).toHaveAttribute("data-etat", "vert");
    expect(screen.getByText("vs mardi dernier")).toBeInTheDocument();
  });

  it("porte la couleur d'état et la teinte d'alerte", () => {
    render(<TuileKpi etiquette="Écarts de caisse" valeur="− 1 000" etat="ambre" teinte="ambre" />);
    const tuile = screen.getByRole("group", { name: /Écarts de caisse/ });
    expect(tuile).toHaveAttribute("data-etat", "ambre");
    expect(tuile).toHaveAttribute("data-teinte", "ambre");
    expect(tuile).toHaveAttribute("data-etiquette-ambre", "oui");
  });

  it("garde l'étiquette grise par défaut et accepte un libellé d'accessibilité", () => {
    render(<TuileKpi etiquette="Net" valeur="+ 0,6 M" ariaLabel="Net de la semaine" />);
    const tuile = screen.getByRole("group", { name: "Net de la semaine" });
    expect(tuile).toHaveAttribute("data-taille", "compacte");
    expect(tuile).not.toHaveAttribute("data-etiquette-ambre");
  });

  it("affiche la note et les enfants de la grande carte", () => {
    render(
      <TuileKpi
        taille="affiche"
        etiquette="Aujourd'hui · en direct"
        note="vs mardi dernier"
        valeur="2,61 M"
      >
        <ChiffreCle valeur="612" libelle="billets" />
        <ChiffreCle valeur="− 1 000" libelle="écart total" etat="ambre" />
      </TuileKpi>,
    );
    expect(screen.getByText("vs mardi dernier")).toBeInTheDocument();
    expect(screen.getByText("billets")).toBeInTheDocument();
    expect(screen.getByText("− 1 000").parentElement).toHaveAttribute("data-etat", "ambre");
  });
});
