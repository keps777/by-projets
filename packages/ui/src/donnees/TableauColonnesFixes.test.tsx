import "./configuration-tests";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TableauColonnesFixes } from "./TableauColonnesFixes";
import type { ColonneTableau } from "./TableauColonnesFixes";

interface Vente {
  date: string;
  prix: string;
  mode: string;
}

const COLONNES: ColonneTableau<Vente>[] = [
  { cle: "date", titre: "date", fixe: true },
  { cle: "prix", titre: "prix", align: "droite", mono: true },
  { cle: "mode", titre: "mode", etat: (v) => (v.mode === "CASH" ? "vert" : "ambre") },
];

const LIGNES: Vente[] = [
  { date: "01/12", prix: "5 000", mode: "CASH" },
  { date: "01/12", prix: "7 500", mode: "MOMO" },
];

describe("TableauColonnesFixes", () => {
  it("rend les colonnes dans l'ordre et une ligne par enregistrement", () => {
    render(
      <TableauColonnesFixes
        ariaLabel="Journal des ventes"
        colonnes={COLONNES}
        lignes={LIGNES}
        cleLigne={(_, i) => String(i)}
      />,
    );
    const tableau = screen.getByRole("table", { name: "Journal des ventes" });
    const entetes = within(tableau).getAllByRole("columnheader");
    expect(entetes.map((e) => e.textContent)).toEqual(["date", "prix", "mode"]);
    expect(within(tableau).getAllByRole("row")).toHaveLength(3);
    expect(within(tableau).getByText("7 500")).toHaveAttribute("data-align", "droite");
  });

  it("colore les cellules par état et colle la première colonne", () => {
    render(
      <TableauColonnesFixes
        ariaLabel="t"
        colonnes={COLONNES}
        lignes={LIGNES}
        cleLigne={(_, i) => String(i)}
      />,
    );
    expect(screen.getByText("CASH")).toHaveAttribute("data-etat", "vert");
    expect(screen.getByText("MOMO")).toHaveAttribute("data-etat", "ambre");
    expect(screen.getAllByText("01/12")[0]).toHaveAttribute("data-fixe", "oui");
    expect(screen.getByRole("columnheader", { name: "date" })).toHaveAttribute("data-fixe", "oui");
  });

  it("alterne deux fonds de ligne et accepte un rendu de cellule", () => {
    render(
      <TableauColonnesFixes
        ariaLabel="t"
        colonnes={[{ cle: "x", titre: "X", rendu: (v: Vente) => <b>{v.prix} F</b> }]}
        lignes={LIGNES}
        cleLigne={(_, i) => String(i)}
      />,
    );
    const lignes = screen.getAllByRole("row").slice(1);
    expect(lignes[0]).toHaveAttribute("data-zebra", "0");
    expect(lignes[1]).toHaveAttribute("data-zebra", "1");
    expect(screen.getByText("5 000 F").tagName).toBe("B");
  });

  it("affiche le pied, la largeur minimale et la variante large", () => {
    render(
      <TableauColonnesFixes
        ariaLabel="Gares"
        variante="large"
        largeurMin={640}
        colonnes={COLONNES}
        lignes={LIGNES}
        cleLigne={(_, i) => String(i)}
        pied={<span>Lignes 1 – 2 sur 2</span>}
      />,
    );
    expect(screen.getByText("Lignes 1 – 2 sur 2")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Gares" })).toHaveStyle({ minWidth: "640px" });
    expect(
      screen.getByRole("region", { name: /défile à l'horizontale/ }).parentElement,
    ).toHaveAttribute("data-variante", "large");
  });

  it("laisse une cellule vide quand la valeur manque", () => {
    render(
      <TableauColonnesFixes
        ariaLabel="t"
        colonnes={[{ cle: "absent", titre: "Absent" }]}
        lignes={[{}]}
        cleLigne={(_, i) => String(i)}
      />,
    );
    expect(screen.getAllByRole("cell")[0]).toHaveTextContent("");
  });
});
