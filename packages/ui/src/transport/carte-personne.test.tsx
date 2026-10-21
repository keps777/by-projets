import "./soutien-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartePersonne } from "./carte-personne";

describe("CartePersonne", () => {
  it("affiche avatar, vérification, note et nombre de trajets", () => {
    render(
      <CartePersonne
        nom="Samuel E."
        note={4.9}
        trajets={112}
        detail="Toyota Corolla grise · LT 882 CE · clim · 2 places"
        droite="4 000"
      />,
    );
    expect(screen.getByText("SE")).toBeInTheDocument();
    expect(screen.getByText("· vérifié · 4,9 ★ · 112 trajets")).toBeInTheDocument();
    expect(
      screen.getByText("Toyota Corolla grise · LT 882 CE · clim · 2 places"),
    ).toBeInTheDocument();
    expect(screen.getByText("4 000")).toBeInTheDocument();
  });

  it("écrit le rôle avant la mention de vérification", () => {
    render(<CartePersonne nom="Jean K." role="moto-taxi" note={4.8} ton="vert" />);
    expect(screen.getByText(/Jean K\. · moto-taxi/)).toBeInTheDocument();
    expect(screen.getByText("vérifié · 4,8 ★")).toBeInTheDocument();
  });

  it("accorde l'unité au singulier et accepte des livraisons", () => {
    render(
      <CartePersonne
        nom="Éric T."
        trajets={1}
        unite={{ singulier: "livraison", pluriel: "livraisons" }}
      />,
    );
    expect(screen.getByText(/1 livraison$/)).toBeInTheDocument();
  });

  it("n'affiche pas « vérifié » pour une personne non vérifiée", () => {
    render(<CartePersonne nom="Marie A." verifie={false} note={4.1} />);
    expect(screen.queryByText(/vérifié/)).not.toBeInTheDocument();
    expect(screen.getByText(/4,1 ★/)).toBeInTheDocument();
  });

  it("devient un lien avec href", () => {
    render(<CartePersonne nom="Samuel E." href="#paiement" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "#paiement");
  });
});
