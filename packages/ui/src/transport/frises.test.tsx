import "./soutien-tests";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FriseArrets } from "./frise-arrets";
import { FriseColis } from "./frise-colis";
import { FriseEtapes } from "./frise-etapes";

const ARRETS = [
  { nom: "Douala Akwa", detail: "parti", heure: "08:04", etat: "passe" as const },
  { nom: "Edéa", detail: "arrêt 10 min", heure: "09:12", etat: "passe" as const },
  { nom: "Pouma", detail: "prochain arrêt", heure: "10:05", etat: "en-cours" as const },
  { nom: "Boumnyebel", montees: 4, heure: "10:40", etat: "prochain" as const, href: "#arret" },
];

describe("FriseArrets", () => {
  it("liste les arrêts avec leur heure et marque l'arrêt en cours", () => {
    render(<FriseArrets arrets={ARRETS} />);
    const liste = screen.getByRole("list", { name: "Arrêts du trajet" });
    const lignes = within(liste).getAllByRole("listitem");
    expect(lignes).toHaveLength(4);
    expect(lignes[0]).toHaveTextContent("Douala Akwa · parti");
    expect(lignes[0]).toHaveTextContent("08:04");
    expect(lignes[2]).toHaveTextContent("Pouma · prochain arrêt");
    expect(lignes[2]).toHaveAttribute("aria-current", "step");
    expect(lignes[0]).not.toHaveAttribute("aria-current");
  });

  it("donne un état lisible à chaque arrêt", () => {
    render(<FriseArrets arrets={ARRETS} />);
    expect(screen.getAllByText("Passé :", { exact: false })[0]).toBeInTheDocument();
    expect(screen.getAllByText("En cours :", { exact: false })[0]).toBeInTheDocument();
    expect(screen.getAllByText("À venir :", { exact: false })[0]).toBeInTheDocument();
  });

  it("transforme l'arrêt de montée en lien et accorde le pluriel", () => {
    render(<FriseArrets arrets={ARRETS} />);
    const lien = screen.getByRole("link", { name: /Boumnyebel · 4 places montent ici/ });
    expect(lien).toHaveAttribute("href", "#arret");
  });

  it("écrit « 1 place monte ici » au singulier", () => {
    render(
      <FriseArrets arrets={[{ nom: "Pouma", montees: 1, heure: "10:05", etat: "prochain" }]} />,
    );
    expect(screen.getByText(/1 place monte ici/)).toBeInTheDocument();
  });

  it("marque l'état de chaque pastille pour le style (l'arrêt en cours pulse)", () => {
    const { container } = render(<FriseArrets arrets={ARRETS} />);
    expect(container.querySelectorAll("[data-etat='en-cours']").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-etat='passe']").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-etat='a-venir']").length).toBeGreaterThan(0);
  });
});

describe("FriseEtapes", () => {
  it("rend une étape en bouton quand elle a onSelect", async () => {
    const choisir = vi.fn();
    render(
      <FriseEtapes
        libelle="Test"
        etapes={[{ id: "a", etat: "a-venir", contenu: "Étape A", onSelect: choisir }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Étape A/ }));
    expect(choisir).toHaveBeenCalledTimes(1);
  });
});

const DETAILS = [
  { detail: "gare Alpha Douala · étiquette imprimée", heure: "07:52" },
  { detail: "bus LT 118 AB · scanné par le convoyeur", heure: "08:10" },
  { detail: "après Bafang · arrivée vers 13:00", heure: "11:20" },
  { libelle: "Disponible à Bafoussam", detail: "SMS à Maman avec le lieu", heure: "~13:00" },
  { detail: "photo de la remise envoyée aux deux", heure: "—" },
];

describe("FriseColis", () => {
  it("affiche les 5 étapes du suivi", () => {
    render(<FriseColis etapeCourante={2} details={DETAILS} />);
    const lignes = within(screen.getByRole("list", { name: "Suivi du colis" })).getAllByRole(
      "listitem",
    );
    expect(lignes).toHaveLength(5);
    expect(lignes[0]).toHaveTextContent("Déposé · gare Alpha Douala");
    expect(lignes[2]).toHaveTextContent("En route · après Bafang · arrivée vers 13:00");
    expect(lignes[3]).toHaveTextContent("Disponible à Bafoussam · SMS à Maman avec le lieu");
    expect(lignes[4]).toHaveTextContent("Remis");
    expect(lignes[2]).toHaveAttribute("aria-current", "step");
  });

  it("met en gras les étapes faites et en cours seulement", () => {
    render(<FriseColis etapeCourante={2} details={DETAILS} />);
    expect(screen.getByText("Déposé").tagName).toBe("STRONG");
    expect(screen.getByText("En route").tagName).toBe("STRONG");
    expect(screen.queryByText("Remis")).not.toBeInTheDocument();
    expect(screen.queryByText("Disponible à Bafoussam", { selector: "strong" })).toBeNull();
  });

  it("termine toutes les étapes quand l'étape courante dépasse la dernière", () => {
    const { container } = render(<FriseColis etapeCourante={5} />);
    expect(container.querySelectorAll("[data-etat='passe']").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-etat='en-cours']")).toBeNull();
    expect(container.querySelector("[data-etat='a-venir']")).toBeNull();
  });
});
