import "./setup-test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarreOnglets, type OngletBarre } from "./barre-onglets";
import styles from "./barre-onglets.module.css";
import { IconeBus, IconeColis, IconeMaison, IconePersonne, IconeCaisse } from "./icones";
import { Selecteur } from "./selecteur";
import selecteurStyles from "./selecteur.module.css";

const options = [
  { valeur: "entre", libelle: "Entre villes" },
  { valeur: "ville", libelle: "Dans la même ville" },
] as const;

describe("Selecteur", () => {
  it("expose deux boutons à bascule dans un groupe nommé", () => {
    render(
      <Selecteur
        aria-label="Type de trajet"
        options={options}
        valeur="entre"
        onChange={() => {}}
      />,
    );
    const groupe = screen.getByRole("group", { name: "Type de trajet" });
    const boutons = within(groupe).getAllByRole("button");
    expect(boutons).toHaveLength(2);
    expect(boutons[0]).toHaveAttribute("aria-pressed", "true");
    expect(boutons[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("change de segment au toucher, pas sur le segment déjà actif", () => {
    const onChange = vi.fn();
    render(<Selecteur aria-label="Trajet" options={options} valeur="entre" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Entre villes" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dans la même ville" }));
    expect(onChange).toHaveBeenCalledWith("ville");
  });

  it("change de segment en glissant vers la gauche puis vers la droite", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Selecteur aria-label="Trajet" options={options} valeur="entre" onChange={onChange} />,
    );
    const groupe = screen.getByRole("group");
    fireEvent.pointerDown(groupe, { clientX: 200 });
    fireEvent.pointerUp(groupe, { clientX: 100 });
    expect(onChange).toHaveBeenLastCalledWith("ville");

    rerender(
      <Selecteur aria-label="Trajet" options={options} valeur="ville" onChange={onChange} />,
    );
    fireEvent.pointerDown(groupe, { clientX: 100 });
    fireEvent.pointerUp(groupe, { clientX: 200 });
    expect(onChange).toHaveBeenLastCalledWith("entre");
  });

  it("ignore un glissement trop court", () => {
    const onChange = vi.fn();
    render(<Selecteur aria-label="Trajet" options={options} valeur="entre" onChange={onChange} />);
    const groupe = screen.getByRole("group");
    fireEvent.pointerDown(groupe, { clientX: 200 });
    fireEvent.pointerUp(groupe, { clientX: 190 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("n'affiche la mention « glisse pour changer » que sur demande", () => {
    const { rerender } = render(
      <Selecteur aria-label="Trajet" options={options} valeur="entre" onChange={() => {}} />,
    );
    expect(screen.queryByText("glisse pour changer")).not.toBeInTheDocument();
    rerender(
      <Selecteur
        aria-label="Trajet"
        options={options}
        valeur="entre"
        onChange={() => {}}
        mention
      />,
    );
    expect(screen.getByText("glisse pour changer")).toBeInTheDocument();
  });

  it("choisit la couleur du segment actif selon le ton", () => {
    render(
      <Selecteur
        aria-label="Trajet"
        ton="vert"
        options={options}
        valeur="entre"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("group")).toHaveClass(selecteurStyles["ton-vert"]!);
  });
});

const onglets: readonly [OngletBarre, OngletBarre, OngletBarre, OngletBarre, OngletBarre?] = [
  { cle: "guichet", libelle: "Guichet", icone: <IconeMaison />, href: "#guichet" },
  { cle: "vendre", libelle: "Vendre", icone: <IconeBus />, href: "#vendre" },
  { cle: "colis", libelle: "Colis", icone: <IconeColis />, href: "#colis" },
  { cle: "quai", libelle: "Quai", icone: <IconePersonne />, href: "#quai" },
  { cle: "caisse", libelle: "Caisse", icone: <IconeCaisse />, href: "#caisse" },
];

describe("BarreOnglets", () => {
  it("rend cinq onglets dans une navigation nommée et marque le courant", () => {
    render(<BarreOnglets aria-label="Navigation guichet" onglets={onglets} actif="guichet" />);
    const nav = screen.getByRole("navigation", { name: "Navigation guichet" });
    const liens = within(nav).getAllByRole("link");
    expect(liens).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Guichet" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Guichet" })).toHaveClass(styles.courant!);
    expect(screen.getByRole("link", { name: "Caisse" })).not.toHaveAttribute("aria-current");
  });

  it("accepte quatre onglets", () => {
    const quatre = [onglets[0], onglets[1], onglets[2], onglets[3]] as const;
    render(<BarreOnglets aria-label="Navigation" onglets={quatre} actif="quai" />);
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("rend des boutons et appelle onSelect quand il n'y a pas de href", () => {
    const onSelect = vi.fn();
    const sansLien = onglets.map((o) =>
      o ? { ...o, href: undefined } : o,
    ) as unknown as typeof onglets;
    render(
      <BarreOnglets
        aria-label="Navigation"
        onglets={sansLien}
        actif="guichet"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Vendre" }));
    expect(onSelect).toHaveBeenCalledWith("vendre");
    expect(screen.getByRole("button", { name: "Guichet" })).toHaveAttribute("aria-current", "page");
  });
});
