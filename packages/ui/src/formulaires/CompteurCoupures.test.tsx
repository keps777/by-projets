import "./testing";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompteurCoupures, comptageVide, totalComptage } from "./CompteurCoupures";
import type { ComptageCoupures } from "./CompteurCoupures";
import { formaterMontant, lireEntier } from "./utils";

const CAISSE: ComptageCoupures = {
  quantites: { 10000: 48, 5000: 36, 2000: 14, 1000: 5, 500: 3 },
  pieces: 0,
  totalManuel: null,
};

const coupure = (valeur: string) =>
  screen.getByRole("button", { name: new RegExp(`^Billets de ${valeur} :`) });
const total = () => screen.getByRole("textbox", { name: "Total compté" });

describe("totalComptage", () => {
  it("retrouve le total de la planche Caisse : 694 500", () => {
    expect(totalComptage(CAISSE)).toBe(694_500);
  });
  it("ajoute les pièces et préfère un total tapé", () => {
    expect(totalComptage({ ...CAISSE, pieces: 250 })).toBe(694_750);
    expect(totalComptage({ ...CAISSE, totalManuel: 600_000 })).toBe(600_000);
    expect(totalComptage(comptageVide())).toBe(0);
  });
});

describe("formaterMontant / lireEntier", () => {
  it("groupe par trois avec une espace", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(500)).toBe("500");
    expect(formaterMontant(10000)).toBe("10 000");
    expect(formaterMontant(694500)).toBe("694 500");
    expect(formaterMontant(-1000)).toBe("− 1 000");
  });
  it("lit les chiffres d'une saisie libre", () => {
    expect(lireEntier("694 500")).toBe(694500);
    expect(lireEntier("")).toBe(0);
    expect(lireEntier("abc")).toBe(0);
  });
});

describe("CompteurCoupures", () => {
  it("affiche les coupures de la planche avec leurs quantités et le total", () => {
    render(<CompteurCoupures defaultValue={CAISSE} />);
    expect(coupure("10 000")).toHaveTextContent("10 000× 48");
    expect(coupure("5 000")).toHaveTextContent("5 000× 36");
    expect(coupure("2 000")).toHaveTextContent("2 000× 14");
    expect(coupure("1 000")).toHaveTextContent("1 000× 5");
    expect(coupure("500")).toHaveTextContent("500× 3");
    expect(screen.getByRole("textbox", { name: "Montant des pièces" })).toHaveValue("0");
    expect(total()).toHaveValue("694 500");
  });

  it("ajoute un billet à chaque touche et recalcule le total", async () => {
    const onChange = vi.fn();
    render(<CompteurCoupures onChange={onChange} />);
    expect(total()).toHaveValue("0");
    await userEvent.click(coupure("10 000"));
    await userEvent.click(coupure("10 000"));
    await userEvent.click(coupure("500"));
    expect(coupure("10 000")).toHaveTextContent("× 2");
    expect(total()).toHaveValue("20 500");
    expect(onChange).toHaveBeenLastCalledWith(
      { quantites: { 10000: 2, 500: 1 }, pieces: 0, totalManuel: null },
      20_500,
    );
  });

  it("retire un billet par appui long (menu contextuel) ou au clavier, sans passer sous zéro", async () => {
    render(<CompteurCoupures defaultValue={CAISSE} />);
    fireEvent.contextMenu(coupure("500"));
    expect(coupure("500")).toHaveTextContent("× 2");
    coupure("500").focus();
    await userEvent.keyboard("{Backspace}{ArrowDown}{ArrowDown}");
    expect(coupure("500")).toHaveTextContent("× 0");
    expect(total()).toHaveValue("693 000");
    await userEvent.keyboard("{ArrowUp}");
    expect(coupure("500")).toHaveTextContent("× 1");
  });

  it("ajoute le montant des pièces", async () => {
    render(<CompteurCoupures defaultValue={CAISSE} />);
    const pieces = screen.getByRole("textbox", { name: "Montant des pièces" });
    await userEvent.clear(pieces);
    await userEvent.type(pieces, "250");
    expect(total()).toHaveValue("694 750");
  });

  it("permet de taper le total, puis reprend le calcul quand on touche un billet", async () => {
    const onChange = vi.fn();
    render(<CompteurCoupures defaultValue={CAISSE} onChange={onChange} />);
    await userEvent.clear(total());
    await userEvent.type(total(), "600000");
    expect(total()).toHaveValue("600 000");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ totalManuel: 600_000 }),
      600_000,
    );
    await userEvent.click(coupure("1 000"));
    expect(total()).toHaveValue("695 500");
  });

  it("fonctionne piloté par l'appelant", async () => {
    const { rerender } = render(<CompteurCoupures value={comptageVide()} />);
    await userEvent.click(coupure("10 000"));
    expect(total()).toHaveValue("0");
    rerender(<CompteurCoupures value={CAISSE} />);
    expect(total()).toHaveValue("694 500");
  });

  it("accepte une liste de coupures personnalisée", () => {
    render(<CompteurCoupures coupures={[10000, 5000]} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("donne un nom accessible à chaque coupure", () => {
    render(<CompteurCoupures defaultValue={CAISSE} />);
    expect(coupure("10 000")).toHaveAccessibleName(
      "Billets de 10 000 : 48 comptés. Toucher pour en ajouter un, appui long pour en retirer un.",
    );
  });
});
