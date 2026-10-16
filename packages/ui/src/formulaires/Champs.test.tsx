import "./testing";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Champ } from "./Champ";
import { ChampRecherche } from "./ChampRecherche";
import { ChampTelephone } from "./ChampTelephone";
import { Selecteur } from "./Selecteur";

describe("Champ", () => {
  it("relie le libellé au champ (clavier physique, lecteur d'écran)", async () => {
    render(<Champ label="Nom du voyageur" defaultValue="Tchoumi Paul" />);
    const champ = screen.getByLabelText("Nom du voyageur");
    expect(champ).toHaveValue("Tchoumi Paul");
    await userEvent.tab();
    expect(champ).toHaveFocus();
    await userEvent.keyboard("Paul");
    expect(champ).toHaveValue("Paul");
  });

  it("garde l'identifiant fourni et sépare deux champs", () => {
    render(
      <>
        <Champ id="nom" label="Nom" />
        <Champ label="Téléphone" />
      </>,
    );
    expect(screen.getByLabelText("Nom")).toHaveAttribute("id", "nom");
    expect(screen.getByLabelText("Téléphone").id).not.toBe("nom");
  });

  it("transmet les attributs du champ (type, mode de saisie, onChange)", async () => {
    const onChange = vi.fn();
    render(<Champ label="Téléphone" type="tel" mono inputMode="tel" onChange={onChange} />);
    const champ = screen.getByLabelText("Téléphone");
    expect(champ).toHaveAttribute("type", "tel");
    await userEvent.type(champ, "6");
    expect(onChange).toHaveBeenCalled();
  });

  it("décrit l'aide et annonce l'erreur", () => {
    const { rerender } = render(<Champ label="Pièce" aide="4 derniers chiffres" />);
    expect(screen.getByLabelText("Pièce")).toHaveAccessibleDescription("4 derniers chiffres");
    rerender(<Champ label="Pièce" erreur="Champ obligatoire" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Champ obligatoire");
    expect(screen.getByLabelText("Pièce")).toBeInvalid();
    expect(screen.getByLabelText("Pièce")).toHaveAccessibleDescription("Champ obligatoire");
  });

  it("accepte la variante de réglages", () => {
    render(<Champ variante="config" label="Nom" defaultValue="Joseph Mbappé" />);
    expect(screen.getByLabelText("Nom")).toHaveValue("Joseph Mbappé");
  });
});

describe("ChampTelephone", () => {
  it("affiche +237, un clavier téléphone et la coche des numéros valides", () => {
    render(<ChampTelephone label="Numéro de téléphone" defaultValue="6 91 22 10 08" valide />);
    const champ = screen.getByLabelText("Numéro de téléphone");
    expect(champ).toHaveAttribute("type", "tel");
    expect(champ).toHaveAttribute("autocomplete", "tel-national");
    expect(champ).toHaveValue("6 91 22 10 08");
    expect(screen.getByText("+237")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Numéro valide" })).toBeInTheDocument();
  });

  it("n'affiche pas la coche par défaut et annonce l'erreur", () => {
    const { rerender } = render(<ChampTelephone label="Numéro" />);
    expect(screen.queryByRole("img", { name: "Numéro valide" })).toBeNull();
    rerender(<ChampTelephone label="Numéro" erreur="Numéro incomplet" />);
    expect(screen.getByLabelText("Numéro")).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent("Numéro incomplet");
  });
});

describe("Selecteur", () => {
  const options = [
    { valeur: "mtn", libelle: "MTN" },
    { valeur: "orange", libelle: "Orange" },
  ];

  it("a un libellé associé, la liste des options et notifie le changement", async () => {
    const onChange = vi.fn();
    render(
      <Selecteur label="Opérateur" options={options} defaultValue="mtn" onChange={onChange} />,
    );
    const liste = screen.getByLabelText("Opérateur");
    expect(liste).toHaveRole("combobox");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["MTN", "Orange"]);
    expect(liste).toHaveValue("mtn");
    await userEvent.selectOptions(liste, "Orange");
    expect(liste).toHaveValue("orange");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("se rejoint au clavier", async () => {
    render(<Selecteur label="Opérateur" options={options} defaultValue="mtn" />);
    await userEvent.tab();
    expect(screen.getByLabelText("Opérateur")).toHaveFocus();
    await userEvent.keyboard("O");
    expect(screen.getByLabelText("Opérateur")).toHaveFocus();
  });

  it("peut désactiver une option et montrer une erreur", () => {
    render(
      <Selecteur
        label="Gare"
        erreur="Choisissez une gare"
        options={[{ valeur: "a", libelle: "Akwa", desactive: true }]}
      />,
    );
    expect(screen.getByRole("option", { name: "Akwa" })).toBeDisabled();
    expect(screen.getByLabelText("Gare")).toBeInvalid();
  });
});

describe("ChampRecherche", () => {
  it("est une région de recherche avec un champ nommé", () => {
    render(<ChampRecherche placeholder="Ville, gare…" />);
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Rechercher" })).toHaveAttribute(
      "placeholder",
      "Ville, gare…",
    );
  });

  it("notifie la saisie et lance la recherche avec Entrée", async () => {
    const onChange = vi.fn();
    const onRecherche = vi.fn();
    render(<ChampRecherche onChange={onChange} onRecherche={onRecherche} />);
    await userEvent.type(screen.getByRole("searchbox"), "Bafoussam{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("Bafoussam");
    expect(onRecherche).toHaveBeenCalledWith("Bafoussam");
  });

  it("efface la saisie et rend le focus au champ", async () => {
    const onChange = vi.fn();
    render(<ChampRecherche defaultValue="Douala" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("button", { name: "Effacer la recherche" })).toBeNull();
  });
});
