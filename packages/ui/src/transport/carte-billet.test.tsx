import "./soutien-tests";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarteBillet } from "./carte-billet";

const billet = (
  <CarteBillet
    compagnie="Bêta Express"
    reference="BEX-DLA-270105-0142"
    depart={{ code: "DLA", ville: "Douala Akwa" }}
    arrivee={{ code: "YDE", ville: "Yaoundé Mvan" }}
    duree="3 h 30"
    heure="08:00"
    date="05.01"
    siege="7"
    classe="VIP"
    qr="BEX-DLA-270105-0142"
    code="7341"
    passager="Aïcha Ngo · CNI ··· 4471"
    consigne="Au quai 20 min avant, avec ta pièce."
  />
);

describe("CarteBillet", () => {
  it("affiche la souche DLA vers YDE avec la durée", () => {
    render(billet);
    const carte = screen.getByRole("article", {
      name: "Billet Bêta Express, Douala Akwa vers Yaoundé Mvan",
    });
    expect(within(carte).getByText("DLA")).toBeInTheDocument();
    expect(within(carte).getByText("Douala Akwa")).toBeInTheDocument();
    expect(within(carte).getByText("YDE")).toBeInTheDocument();
    expect(within(carte).getByText("Yaoundé Mvan")).toBeInTheDocument();
    expect(within(carte).getByText("3 h 30")).toBeInTheDocument();
  });

  it("affiche départ, date, siège et classe", () => {
    render(billet);
    for (const [nom, valeur] of [
      ["Départ", "08:00"],
      ["Date", "05.01"],
      ["Siège", "7"],
      ["Classe", "VIP"],
    ] as const) {
      const terme = screen.getByText(nom, { selector: "dt" });
      expect(terme.nextElementSibling).toHaveTextContent(valeur);
    }
  });

  it("affiche la référence, le QR code, le code à 4 chiffres et les consignes", () => {
    render(billet);
    expect(screen.getByText("BEX-DLA-270105-0142")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code du billet" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Code du billet : 7 3 4 1" })).toHaveTextContent("7341");
    expect(screen.getByText("Code sans scanner")).toBeInTheDocument();
    expect(screen.getByText(/Aïcha Ngo · CNI ··· 4471/)).toBeInTheDocument();
    expect(screen.getByText(/Au quai 20 min avant/)).toBeInTheDocument();
  });
});
