import "./configuration-tests";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as kit from "./index";

describe("exports du kit données", () => {
  it("exporte les composants et les démos", () => {
    for (const nom of [
      "TuileKpi",
      "ChiffreCle",
      "CarteDonnees",
      "Histogramme",
      "BarreRemplissage",
      "ListeGlissable",
      "LigneAlerte",
      "LigneListe",
      "BandeauAssistant",
      "TableauColonnesFixes",
      "FeuilleModale",
      "ApercuBilletThermique",
      "ApercuEtiquetteColis",
      "BulleWhatsApp",
      "ConversationWhatsApp",
      "EcranUssd",
      "DemoDonnees",
      "DemoPatron",
      "DemoAnalyses",
      "DemoAnalysesBus",
      "DemoComptableApercu",
      "DemoGuichetColis",
      "DemoBilletThermique",
      "DemoRapportSoir",
      "DemoUssd",
      "DemoControle",
    ]) {
      expect(kit, nom).toHaveProperty(nom);
    }
  });
});

describe("pages de démo", () => {
  it("Patron : carte du jour, assistant et alertes", () => {
    render(<kit.DemoPatron />);
    expect(
      screen.getByRole("group", { name: /Aujourd'hui · en direct 2,61 M/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /L'assistant a 2 choses/ })).toBeInTheDocument();
    const alertes = screen.getByRole("region", { name: "Alertes · 6" });
    expect(within(alertes).getByText("1 touche · glisser")).toBeInTheDocument();
    expect(within(alertes).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
  });

  it("Analyses : histogramme de 7 jours et lignes colorées selon le seuil", () => {
    render(<kit.DemoAnalyses />);
    expect(screen.getByRole("img", { name: /Recette par jour/ })).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Remplissage Douala → Yaoundé" }),
    ).toHaveAttribute("data-couleur", "vert");
    expect(
      screen.getByRole("progressbar", { name: "Remplissage Yaoundé → Bafoussam" }),
    ).toHaveAttribute("data-couleur", "rouge");
    expect(screen.getByText("14 bus · glisser")).toBeInTheDocument();
  });

  it("AnalysesBus : trois tuiles, 8 semaines et conseil de l'assistant", () => {
    const { container } = render(<kit.DemoAnalysesBus />);
    expect(screen.getAllByRole("group").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll("svg[data-format='semaines'] path[data-barre]")).toHaveLength(
      8,
    );
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
  });

  it("ComptableApercu : la feuille s'ouvre sur le tableau et se ferme", async () => {
    render(<kit.DemoComptableApercu />);
    expect(
      screen.getByRole("dialog", { name: "Journal des ventes · décembre" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("total 28 414 000")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Fermer" })[0]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Rouvrir l'aperçu" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("GuichetColis et billet thermique", () => {
    render(
      <>
        <kit.DemoGuichetColis />
        <kit.DemoBilletThermique />
      </>,
    );
    expect(screen.getByRole("img", { name: "Code-barres du colis" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Code-barres du billet" })).toBeInTheDocument();
  });

  it("RapportSoir : trois bulles", () => {
    render(<kit.DemoRapportSoir />);
    expect(screen.getAllByRole("group", { name: /Message de/ })).toHaveLength(3);
    expect(screen.getByText("Rapport du mardi 5 janvier · 3 gares")).toBeInTheDocument();
  });

  it("USSD : écran simulé et conversation WhatsApp", () => {
    render(<kit.DemoUssd />);
    expect(screen.getByRole("img", { name: /Écran USSD simulé/ })).toBeInTheDocument();
    const journal = screen.getByRole("log", { name: /achat d'un billet/ });
    expect(within(journal).getAllByRole("group")).toHaveLength(5);
  });

  it("Controle : mêmes composants en variante large", () => {
    const { container } = render(<kit.DemoControle />);
    expect(
      screen.getAllByRole("group", { name: /Recette du jour|Billets|Colis|Remplissage|Écarts/ }),
    ).toHaveLength(5);
    expect(screen.getByRole("table", { name: "Gares, maintenant" })).toBeInTheDocument();
    expect(container.querySelectorAll("svg[data-format='heures'] path[data-barre]")).toHaveLength(
      12,
    );
    expect(container.querySelectorAll("path[data-prevue='oui']")).toHaveLength(3);
    expect(screen.getByRole("region", { name: "À traiter · 4" })).toBeInTheDocument();
  });

  it("DemoDonnees assemble toutes les planches", () => {
    render(<kit.DemoDonnees />);
    expect(screen.getAllByRole("region", { name: /^Démo / }).length).toBe(9);
  });
});
