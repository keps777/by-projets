import "./soutien-tests";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrosCode, TAILLE_MIN_GROS_CODE } from "./gros-code";

describe("GrosCode", () => {
  it("affiche un code à 4 chiffres et le lit chiffre par chiffre", () => {
    render(<GrosCode code="7341" libelle="Code du billet" />);
    const code = screen.getByRole("img", { name: "Code du billet : 7 3 4 1" });
    expect(code).toHaveTextContent("7341");
  });

  it("groupe un code à 6 chiffres par trois", () => {
    render(<GrosCode code="482913" libelle="Code de retrait" />);
    expect(screen.getByText("482 913")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Code de retrait : 4 8 2 9 1 3" })).toBeInTheDocument();
  });

  it("accepte un code déjà groupé", () => {
    render(<GrosCode code="482 913" />);
    expect(screen.getByText("482 913")).toBeInTheDocument();
  });

  it("n'affiche jamais le code sous 28 px", () => {
    render(<GrosCode code="7341" taille={12} />);
    expect(screen.getByText("7341")).toHaveStyle({ fontSize: `${TAILLE_MIN_GROS_CODE}px` });
  });

  it("respecte une taille supérieure au minimum", () => {
    render(<GrosCode code="7341" taille={48} />);
    expect(screen.getByText("7341")).toHaveStyle({ fontSize: "48px" });
  });

  it("refuse un code qui n'a ni 4 ni 6 chiffres", () => {
    expect(() => render(<GrosCode code="12345" />)).toThrow(RangeError);
    expect(() => render(<GrosCode code="73a1" />)).toThrow(RangeError);
  });
});
