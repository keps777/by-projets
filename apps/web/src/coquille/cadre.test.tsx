import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { rendreApp } from "@/test/rendre";
import { Cadre } from "./cadre";

const routes: RouteObject[] = [
  {
    path: "/",
    element: (
      <Cadre>
        <a href="/reseau">Le réseau</a>
        <a href="https://exemple.org/aide">Aide</a>
        <a href="#haut">Haut</a>
      </Cadre>
    ),
  },
  { path: "/reseau", element: <p>page réseau</p> },
];

describe("cadre", () => {
  it("traite les liens internes comme des navigations (pas de rechargement, l'état de démarrage survit)", async () => {
    const { routeur } = rendreApp({ routes });
    await userEvent.click(screen.getByRole("link", { name: "Le réseau" }));
    expect(routeur.state.location.pathname).toBe("/reseau");
    expect(await screen.findByText("page réseau")).toBeInTheDocument();
  });

  it("laisse au navigateur les liens externes et les ancres", async () => {
    const { routeur } = rendreApp({ routes });
    const clic = (nom: string) => {
      const lien = screen.getByRole("link", { name: nom });
      let empeche = false;
      lien.addEventListener("click", (evenement) => {
        empeche = evenement.defaultPrevented;
        evenement.preventDefault(); // jsdom ne navigue pas ; on observe seulement
      });
      lien.click();
      return empeche;
    };
    expect(clic("Aide")).toBe(false);
    expect(clic("Haut")).toBe(false);
    expect(routeur.state.location.pathname).toBe("/");
  });

  it("range un écran d'espace dans la colonne de 390 px et la salle de contrôle hors de cette colonne", async () => {
    rendreApp({ url: "/voyager" });
    await screen.findByRole("heading", { level: 1 });
    expect(document.querySelector("[data-espace='voyageur']")).not.toBeNull();
  });
});
