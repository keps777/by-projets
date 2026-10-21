import "./testing";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CaseACocher, LigneCochable } from "./CaseACocher";
import { DemoFormulaires } from "./demo";
import { Interrupteur, LigneInterrupteur } from "./Interrupteur";
import { Stepper } from "./Stepper";
import { empreinteDisponible, verifierEmpreinte } from "./webauthn";

describe("CaseACocher", () => {
  it("se coche en touchant le texte ou au clavier", async () => {
    const onChange = vi.fn();
    render(<CaseACocher label="Alpha Voyages" onChange={onChange} />);
    const case_ = screen.getByRole("checkbox", { name: "Alpha Voyages" });
    await userEvent.click(screen.getByText("Alpha Voyages"));
    expect(case_).toBeChecked();
    case_.focus();
    await userEvent.keyboard(" ");
    expect(case_).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("peut être dans l'état partiel", () => {
    render(<CaseACocher label="Toutes" indeterminee />);
    expect(screen.getByRole("checkbox")).toBePartiallyChecked();
  });
});

describe("LigneCochable", () => {
  it("nomme la case par le libellé de la ligne et affiche le détail", async () => {
    render(<LigneCochable libelle="Bêta Express" detail="4 départs" defaultChecked separateur />);
    const case_ = screen.getByRole("checkbox", { name: /Bêta Express/ });
    expect(case_).toBeChecked();
    expect(screen.getByText("4 départs")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Bêta Express"));
    expect(case_).not.toBeChecked();
  });

  it("garde l'action à droite hors de la zone cochable", async () => {
    const onAction = vi.fn();
    render(
      <LigneCochable
        libelle="Oméga Transports"
        defaultChecked
        action={
          <button type="button" aria-label="Ajouter aux préférées" onClick={onAction}>
            ☆
          </button>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ajouter aux préférées" }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("grise une ligne désactivée", () => {
    render(<LigneCochable libelle="Complet" disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

describe("Interrupteur", () => {
  it("est un switch nommé qui bascule à la souris et au clavier", async () => {
    const onChange = vi.fn();
    render(<Interrupteur aria-label="Mode cadence" onChange={onChange} />);
    const bouton = screen.getByRole("switch", { name: "Mode cadence" });
    expect(bouton).toHaveAttribute("aria-checked", "false");
    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard(" ");
    expect(bouton).toHaveAttribute("aria-checked", "false");
    await userEvent.keyboard("{Enter}");
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("suit la valeur de l'appelant quand il le pilote", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Interrupteur aria-label="Modules" checked={false} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    rerender(<Interrupteur aria-label="Modules" checked onChange={onChange} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("ne bascule pas quand il est désactivé", async () => {
    const onChange = vi.fn();
    render(<Interrupteur aria-label="Modules" disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("LigneInterrupteur", () => {
  it("prend le libellé comme nom et bascule en touchant le texte", async () => {
    const onChange = vi.fn();
    render(
      <LigneInterrupteur
        libelle="Voir la caisse des autres guichets"
        separateur
        onChange={onChange}
      />,
    );
    const bouton = screen.getByRole("switch", { name: "Voir la caisse des autres guichets" });
    await userEvent.click(screen.getByText("Voir la caisse des autres guichets"));
    expect(bouton).toHaveAttribute("aria-checked", "true");
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Stepper", () => {
  it("monte et descend avec les boutons − et +", async () => {
    const onChange = vi.fn();
    render(
      <Stepper
        label="Nombre de voyageurs"
        labelMoins="Moins de voyageurs"
        labelPlus="Plus de voyageurs"
        defaultValue={6}
        legende="voyageurs"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Nombre de voyageurs" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("6");
    await userEvent.click(screen.getByRole("button", { name: "Plus de voyageurs" }));
    await userEvent.click(screen.getByRole("button", { name: "Plus de voyageurs" }));
    await userEvent.click(screen.getByRole("button", { name: "Moins de voyageurs" }));
    expect(screen.getByRole("status")).toHaveTextContent("7");
    expect(onChange.mock.calls).toEqual([[7], [8], [7]]);
  });

  it("respecte le minimum et le maximum en désactivant le bouton", async () => {
    render(<Stepper label="Places" defaultValue={1} min={1} max={2} />);
    expect(screen.getByRole("button", { name: "Moins" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Plus" }));
    expect(screen.getByRole("status")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Plus" })).toBeDisabled();
  });

  it("applique un pas et se pilote de l'extérieur", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper label="Colis" value={10} pas={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Plus" }));
    expect(onChange).toHaveBeenCalledWith(15);
    expect(screen.getByRole("status")).toHaveTextContent("10");
    rerender(<Stepper label="Colis" value={15} pas={5} onChange={onChange} />);
    expect(screen.getByRole("status")).toHaveTextContent("15");
  });
});

describe("WebAuthn", () => {
  it("renvoie faux quand le navigateur ne propose rien", async () => {
    await expect(empreinteDisponible()).resolves.toBe(false);
    await expect(verifierEmpreinte({ challenge: new Uint8Array(4) })).resolves.toBeNull();
  });
});

describe("DemoFormulaires", () => {
  it("rend les cinq planches avec des champs tous nommés", () => {
    render(<DemoFormulaires />);
    expect(screen.getAllByRole("region").length).toBeGreaterThanOrEqual(5);
    for (const champ of [...screen.getAllByRole("textbox"), ...screen.getAllByRole("combobox")]) {
      expect(champ).toHaveAccessibleName();
    }
    for (const bouton of screen.getAllByRole("button")) {
      expect(bouton).toHaveAccessibleName();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(5);
    expect(screen.getByRole("textbox", { name: "Total compté" })).toHaveValue("694 500");
  });
});
