import "./soutien-tests";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formaterMontant, initialesDe } from "./format";
import { DemoTransport } from "./demo";
import * as transport from "./index";

describe("DemoTransport", () => {
  it("rassemble tous les composants avec les valeurs des maquettes", () => {
    render(<DemoTransport />);
    expect(screen.getByRole("button", { name: "Siège 7, choisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siège 7, occupé sans billet" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Arrêts du trajet" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Suivi du colis" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code du billet" })).toBeInTheDocument();
    expect(screen.getByText("482 913")).toBeInTheDocument();
    expect(screen.getByText("plus que 3")).toBeInTheDocument();
  });

  it("inverse les volets au toucher", async () => {
    render(<DemoTransport />);
    await userEvent.click(screen.getByRole("button", { name: "Inverser le sens" }));
    expect(screen.getByRole("img", { name: "Douala" })).toHaveTextContent("YDE");
    expect(screen.getByRole("img", { name: "Yaoundé" })).toHaveTextContent("DLA");
  });
});

describe("index du kit transport", () => {
  it("exporte les composants et la démo", () => {
    for (const nom of [
      "LigneDepart",
      "VoletsDestination",
      "PlanSieges",
      "FriseArrets",
      "FriseColis",
      "CartePersonne",
      "CodeQr",
      "GrosCode",
      "CarteBillet",
      "DemoTransport",
    ]) {
      expect(transport).toHaveProperty(nom);
    }
  });
});

describe("format", () => {
  it("groupe les milliers", () => {
    expect(formaterMontant(7500)).toBe("7 500");
    expect(formaterMontant(25000)).toBe("25 000");
    expect(formaterMontant(950)).toBe("950");
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });

  it("déduit les initiales", () => {
    expect(initialesDe("Samuel E.")).toBe("SE");
    expect(initialesDe("Aïcha Ngo")).toBe("AN");
    expect(initialesDe("Jean")).toBe("JE");
  });
});
