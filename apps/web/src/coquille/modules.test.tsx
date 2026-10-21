import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import fr from "@/i18n/fr.json";
import { rendreApp } from "@/test/rendre";
import { MODULES, modulesMasquesValides, moduleDeLUrl } from "./modules";

describe("modules", () => {
  it("compte les 12 modules de la planche Modules", () => {
    expect(MODULES).toHaveLength(12);
  });

  it("ne masque jamais « Guichet et caisse » et ignore les modules inconnus", () => {
    expect(modulesMasquesValides(["guichet", "covoit", "inconnu"])).toEqual(["covoit"]);
  });

  it("rattache les routes à leur module", () => {
    expect(moduleDeLUrl("/covoit/ville")).toBe("covoit");
    expect(moduleDeLUrl("/vendeur/accueil")).toBe("covoit");
    expect(moduleDeLUrl("/colis/:colisId")).toBe("colis");
    expect(moduleDeLUrl("/colis/:colisId/relais")).toBe("relais");
    expect(moduleDeLUrl("/colis/:colisId/livraison")).toBe("livraison");
    expect(moduleDeLUrl("/guichet/depot")).toBe("colis");
    expect(moduleDeLUrl("/sans-internet")).toBe("ussd");
    expect(moduleDeLUrl("/financement/demande/:dossierId")).toBe("financement");
    expect(moduleDeLUrl("/embarquement")).toBe("quai");
    expect(moduleDeLUrl("/guichet/caisse")).toBeNull();
    expect(moduleDeLUrl("/voyager")).toBeNull();
  });
});

describe("un module masqué retire ses routes et ses entrées", () => {
  it("retire /covoit et l'onglet Covoit, le reste de l'app continue", async () => {
    rendreApp({ url: "/covoit", masques: ["covoit"] });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.coquille.introuvable.titre }),
    ).toBeInTheDocument();
  });

  it("retire l'onglet Covoit de la barre voyageur", async () => {
    rendreApp({ url: "/voyager", masques: ["covoit"] });
    const nav = await screen.findByRole("navigation", { name: "Navigation" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Voyager", "Colis", "Moi"]);
  });

  it("retire les entrées Colis et Quai du guichet mais garde Guichet, Vendre et Caisse", async () => {
    rendreApp({ url: "/guichet/accueil", masques: ["colis", "quai"] });
    const nav = await screen.findByRole("navigation", { name: "Navigation guichet" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Guichet", "Vendre", "Caisse"]);
  });

  it("ne retire pas le guichet même si on demande à le masquer", async () => {
    rendreApp({ url: "/guichet/accueil", masques: ["guichet"] });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.ecrans.Guichet.titre }),
    ).toBeInTheDocument();
  });

  it("retire les routes de livraison et de relais sans toucher au suivi du colis", async () => {
    const { routeur } = rendreApp({ url: "/colis/COL-0001", masques: ["relais", "livraison"] });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.ColisCode.titre });
    await routeur.navigate("/colis/COL-0001/relais");
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.coquille.introuvable.titre }),
    ).toBeInTheDocument();
    await routeur.navigate("/relais/accueil");
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.coquille.introuvable.titre }),
    ).toBeInTheDocument();
  });
});
