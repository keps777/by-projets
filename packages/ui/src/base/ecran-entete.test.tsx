import "./setup-test";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Ecran, EcranCorps, EcranPied } from "./ecran";
import styles from "./ecran.module.css";
import { Entete } from "./entete";
import { Etiquette } from "./etiquette";
import etiquetteStyles from "./etiquette.module.css";

describe("Ecran", () => {
  it("assemble corps et pied dans une colonne sur fond nuit", () => {
    const { container } = render(
      <Ecran>
        <EcranCorps>corps</EcranCorps>
        <EcranPied>pied</EcranPied>
      </Ecran>,
    );
    expect(container.firstElementChild).toHaveClass(styles.ecran!, styles.fluide!);
    expect(screen.getByRole("main")).toHaveTextContent("corps");
    expect(screen.getByText("pied")).toHaveClass(styles.pied!);
  });

  it("prend le format 390 x 844 de la planche et le fond profond du mode cadence", () => {
    const { container } = render(<Ecran format="planche" fond="profond" />);
    expect(container.firstElementChild).toHaveClass(styles.planche!, styles.profond!);
  });
});

describe("Entete", () => {
  it("affiche titre, sous-titre et élément de droite", () => {
    render(
      <Entete
        titre="Bêta Express · VIP"
        sousTitre="Douala → Yaoundé"
        droite={<span>à droite</span>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Bêta Express · VIP" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Douala → Yaoundé")).toBeInTheDocument();
    expect(screen.getByText("à droite")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rend un retour lien nommé par son libellé", () => {
    render(<Entete titre="Titre" retour={{ libelle: "Retour aux départs", href: "#departs" }} />);
    const retour = screen.getByRole("link", { name: "Retour aux départs" });
    expect(retour).toHaveAttribute("href", "#departs");
  });

  it("rend un retour bouton qui appelle onClick", () => {
    const onClick = vi.fn();
    render(<Entete titre="Titre" retour={{ libelle: "Retour", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Etiquette", () => {
  it("est ambre par défaut et peut être grise", () => {
    render(
      <>
        <Etiquette>Départs</Etiquette>
        <Etiquette ton="gris">Billets</Etiquette>
      </>,
    );
    expect(screen.getByText("Départs")).toHaveClass(etiquetteStyles.ambre!);
    expect(screen.getByText("Billets")).toHaveClass(etiquetteStyles.gris!);
  });

  it("garde le texte tel quel, la majuscule vient du CSS", () => {
    render(<Etiquette>Départs · places réelles</Etiquette>);
    expect(screen.getByText("Départs · places réelles")).toBeInTheDocument();
  });
});
