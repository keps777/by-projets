import "./setup-test";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CarteAction } from "./carte-action";
import carteStyles from "./carte-action.module.css";
import { IconeColis } from "./icones";
import { Puce } from "./puce";
import puceStyles from "./puce.module.css";
import puceCss from "./puce.module.css?raw";

describe("CarteAction", () => {
  it("rend un lien avec titre et description", () => {
    render(
      <CarteAction
        href="#colis"
        titre="Enregistrer un colis"
        description="photo, étiquette, SMS"
        icone={<IconeColis />}
      />,
    );
    const carte = screen.getByRole("link", { name: /Enregistrer un colis/ });
    expect(carte).toHaveAttribute("href", "#colis");
    expect(carte).toHaveClass(carteStyles.carte!);
    expect(screen.getByText("photo, étiquette, SMS")).toBeInTheDocument();
  });

  it("rend un bouton sans href et déclenche onClick", () => {
    const onClick = vi.fn();
    render(<CarteAction titre="Ma caisse" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Ma caisse" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applique les variantes compacte et principale", () => {
    render(
      <>
        <CarteAction variante="compacte" href="#a" titre="Compacte" />
        <CarteAction variante="principale" href="#b" titre="Principale" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Compacte" })).toHaveClass(carteStyles.compacte!);
    expect(screen.getByRole("link", { name: "Principale" })).toHaveClass(carteStyles.principale!);
  });
});

describe("Puce", () => {
  it("reflète la sélection dans aria-pressed", () => {
    render(
      <>
        <Puce selectionnee>Tout</Puce>
        <Puce>Bus</Puce>
      </>,
    );
    expect(screen.getByRole("button", { name: "Tout" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tout" })).toHaveClass(puceStyles.selectionnee!);
    expect(screen.getByRole("button", { name: "Bus" })).toHaveAttribute("aria-pressed", "false");
  });

  it("appelle onClick", () => {
    const onClick = vi.fn();
    render(<Puce onClick={onClick}>Covoit</Puce>);
    fireEvent.click(screen.getByRole("button", { name: "Covoit" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("colore en vert la puce Covoit quand elle n'est pas choisie", () => {
    render(<Puce ton="vert">Covoit</Puce>);
    expect(screen.getByRole("button")).toHaveClass(puceStyles.vert!);
  });

  it("étend la zone tactile des petites puces à 44 px", () => {
    expect(puceCss).toMatch(/\.taille-s::after\s*\{\s*inset:\s*-8px/);
    expect(puceCss).toMatch(/\.taille-m::after\s*\{\s*inset:\s*-6px/);
    expect(puceCss).toMatch(/\.taille-l\s*\{\s*min-height:\s*44px/);
  });
});
