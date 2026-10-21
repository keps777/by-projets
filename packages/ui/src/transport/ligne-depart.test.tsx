import "./soutien-tests";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LigneDepart } from "./ligne-depart";

describe("LigneDepart", () => {
  it("affiche heure, compagnie, classe, places et prix d'un départ bus", () => {
    render(
      <LigneDepart
        heure="08:00"
        compagnie="Bêta Express"
        classe="VIP"
        classePremium
        placesLibres={9}
        remplissage={0.7}
        prix={7500}
        href="#depart"
      />,
    );
    const lien = screen.getByRole("link");
    expect(lien).toHaveAttribute("href", "#depart");
    expect(lien).toHaveTextContent("08:00");
    expect(lien).toHaveTextContent("Bêta Express");
    expect(lien).toHaveTextContent("VIP");
    expect(screen.getByText("9 places")).toBeInTheDocument();
    expect(screen.getByText("7 500")).toBeInTheDocument();
    expect(lien).not.toHaveAttribute("data-urgent");
  });

  it("passe en rouge avec « plus que 3 » sous le seuil", () => {
    render(<LigneDepart heure="09:30" compagnie="Oméga Transports" placesLibres={3} prix={3800} />);
    expect(screen.getByText("plus que 3")).toBeInTheDocument();
    expect(screen.getByText("09:30").closest("[data-urgent]")).toHaveAttribute(
      "data-urgent",
      "oui",
    );
  });

  it("calcule la jauge depuis la capacité", () => {
    const { container } = render(
      <LigneDepart heure="08:30" compagnie="Alpha" placesLibres={15} capacite={50} prix={4000} />,
    );
    const pleine = container.querySelector("[style*='width']");
    expect(pleine).toHaveStyle({ width: "70%" });
  });

  it("annonce un bus complet", () => {
    render(<LigneDepart heure="10:00" compagnie="Alpha" placesLibres={0} prix={4000} />);
    expect(screen.getByText("complet")).toBeInTheDocument();
  });

  it("affiche la variante covoiturage avec avatar, conducteur vérifié et détail", () => {
    render(
      <LigneDepart
        variante="covoiturage"
        heure="08:45"
        conducteur={{ nom: "Samuel", verifie: true }}
        detail="Bonapriso · 2 places · Toyota"
        prix={5000}
      />,
    );
    expect(screen.getByText(/Covoiturage/)).toBeInTheDocument();
    expect(screen.getByText("Samuel · vérifié")).toBeInTheDocument();
    expect(screen.getByText("Bonapriso · 2 places · Toyota")).toBeInTheDocument();
    expect(screen.getByText("5 000")).toBeInTheDocument();
    expect(screen.getByText("SA")).toBeInTheDocument();
  });

  it("peut masquer l'avatar du covoiturage", () => {
    render(
      <LigneDepart
        variante="covoiturage"
        heure="08:45"
        conducteur={{ nom: "Samuel" }}
        avatar={false}
        prix={5000}
      />,
    );
    expect(screen.queryByText("SA")).not.toBeInTheDocument();
  });

  it("devient un bouton quand on lui donne onSelect", async () => {
    const choisir = vi.fn();
    render(<LigneDepart heure="08:00" compagnie="Bêta Express" prix={7500} onSelect={choisir} />);
    await userEvent.click(screen.getByRole("button"));
    expect(choisir).toHaveBeenCalledTimes(1);
  });
});
