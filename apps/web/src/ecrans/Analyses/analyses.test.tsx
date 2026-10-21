import {
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ALPHA_DLA_BAF, ALPHA_DLA_YDE, ALPHA_YDE_BAF, BUS_LT207, ecrans } from "@afrimove/fixtures";
import { ConceptionProvider } from "@afrimove/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { AnalysesVue } from "./analyses-vue";
import { colisEtRecette, groupes, millions, net, taux, variation } from "./formats";
import fr from "./i18n.fr.json";
import { barresRecette, tonIncident, tonNet } from "./tons";
import type { Analyses, EtatBloc, Periode } from "./types";

const planche = ecrans.Analyses.donnees;

function rendre(clientApi?: ReturnType<typeof creerClientMock>) {
  return rendreApp({
    fixtures: true,
    scenario: "Analyses",
    url: "/analyses",
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("28,4 M");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function listes(): { lignes: HTMLElement; bus: HTMLElement } {
  const regions = screen.getAllByRole("region", { name: /liste qui défile/ });
  return { lignes: regions[0] as HTMLElement, bus: regions[1] as HTMLElement };
}

type Impl = Scenario["operations"][number];

/** Un client de démonstration dont on change le scénario (une lecture qui échoue, des chiffres autres). */
function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "Analyses", latenceMs: 0 });
}

function remplacer(scenario: Scenario, nom: string, fabrique: (impl: Impl) => Impl): Scenario {
  return {
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom ? fabrique(impl) : impl,
    ),
  };
}

async function lireSemaine(impl: Impl, params: unknown, ctx: unknown): Promise<Analyses> {
  return (await (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx)) as Analyses;
}

/** Une autre période : tous les chiffres changent, pour vérifier que chaque bloc est relu. */
function moisDe(semaine: Analyses): Analyses {
  return {
    ...semaine,
    periode: "mois",
    libelle: "Décembre 2026",
    nbGares: 2,
    recette: {
      total: 110_500_000,
      variationPct: -3,
      serie: [
        { libelle: "S49", recette: 25_000_000 },
        { libelle: "S50", recette: 27_000_000 },
        { libelle: "S51", recette: 30_000_000 },
        { libelle: "S52", recette: 28_500_000 },
      ],
      lecture: "La semaine de Noël est la plus forte du mois.",
    },
    lignes: [{ ligneId: "ligne-x", nom: "Douala → Kribi", remplissagePct: 55, recette: 9_000_000 }],
    colis: { nombre: 8000, recette: 7_500_000 },
    bus: [
      {
        busId: "bus-x",
        immatriculation: "LT 001 AB",
        chauffeur: "Ekani",
        trajets: 1,
        net: -300_000,
        incident: "1 panne",
      },
    ],
  };
}

function clientAvecMois(
  mois: (semaine: Analyses) => Analyses | Promise<Analyses> = moisDe,
): ReturnType<typeof creerClientMock> {
  return clientAvec((scenario) =>
    remplacer(scenario, patron.OP_ANALYSES.nom, (impl) =>
      implementer(patron.OP_ANALYSES, async (params, ctx) => {
        const semaine = await lireSemaine(impl, { periode: "semaine" }, ctx);
        return params.periode === "semaine" ? semaine : mois(semaine);
      }),
    ),
  );
}

describe("Analyses · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : Retour, titre, semaine et gares, sélecteur de période", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Semaine du 29 déc. au 4 janv. · 3 gares")).toBeInTheDocument();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Analyses · semaine · lignes · bus",
    );
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    const periode = screen.getByRole("combobox", { name: "Période" });
    expect(periode).toHaveValue("semaine");
    expect(within(periode).getAllByRole("option")).toHaveLength(4);
    expect(
      within(periode)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(planche.periodes);
  });

  it("affiche la recette par jour : total, variation, sept barres dont vendredi et samedi en ambre, commentaire", async () => {
    rendre();
    await attendreEcran();
    const carte = screen.getByRole("region", { name: "Recette par jour" });
    expect(within(carte).getByText("Recette par jour")).toBeInTheDocument();
    expect(within(carte).getByText("28,4 M")).toBeInTheDocument();
    const tendance = within(carte).getByText("+ 5 %");
    expect(tendance).toHaveAttribute("data-etat", "vert");
    expect(within(carte).getByText(planche.recetteParJour.lecture)).toBeInTheDocument();

    const barres = Array.from(carte.querySelectorAll("path[data-barre]"));
    expect(barres).toHaveLength(7);
    expect(barres.map((b) => b.getAttribute("data-accent"))).toEqual([
      null,
      null,
      null,
      null,
      "ambre",
      "ambre",
      null,
    ]);
    const etiquettes = Array.from(carte.querySelectorAll("svg text")).map((t) => t.textContent);
    expect(etiquettes).toEqual(planche.recetteParJour.jours);
  });

  it("affiche les sept lignes (six lignes et les colis) avec leur remplissage et leur recette", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Par ligne · remplissage")).toBeInTheDocument();
    expect(screen.getByText("7 lignes · glisser")).toBeInTheDocument();
    const rangees = within(listes().lignes).getAllByRole("link");
    expect(rangees.map((a) => a.textContent)).toEqual([
      "Douala → Yaoundé91 % · 14,2 M",
      "Douala → Bafoussam78 % · 8,1 M",
      "Yaoundé → Bafoussam61 % · 4,0 M",
      "Douala → Bamenda83 % · 3,6 M",
      "Yaoundé → Douala88 % · 12,9 M",
      "Bafoussam → Douala74 % · 6,2 M",
      "Colis · toutes lignes2 104 · 2,1 M",
    ]);
    // Barre verte, ambre ou rouge selon le remplissage (91, 78, 61, 83, 88, 74).
    const barres = within(listes().lignes).getAllByRole("progressbar");
    expect(
      barres.map((b) => [b.getAttribute("aria-valuenow"), b.getAttribute("data-couleur")]),
    ).toEqual([
      ["91", "vert"],
      ["78", "ambre"],
      ["61", "rouge"],
      ["83", "vert"],
      ["88", "vert"],
      ["74", "ambre"],
    ]);
  });

  it("affiche les sept bus avec trajets, net et incident, leur couleur suivant la gravité", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Par bus · net")).toBeInTheDocument();
    // La flotte compte 14 bus (tableau du jour) : la liste annonce 14, même si elle n'en montre que sept.
    expect(await screen.findByText("14 bus · glisser")).toBeInTheDocument();
    const rangees = within(listes().bus).getAllByRole("link");
    expect(rangees.map((a) => a.textContent)).toEqual([
      "LT 412 AB · Mbarga9 trajets+ 2,8 M0 incident",
      "LT 118 AB · Fotso8 trajets+ 2,1 Mcarburant + 12 %",
      "LT 207 AB · Nana5 trajets+ 0,6 M2 pannes",
      "LT 330 AB · Essomba8 trajets+ 1,9 M0 incident",
      "LT 095 AB · Tchinda7 trajets+ 1,7 Mpneus à changer",
      "LT 261 AB · Abena6 trajets+ 1,2 M1 retard > 30 min",
      "LT 148 AB · Mballa4 trajets+ 0,4 Mvisite technique",
    ]);
    const attendu = [
      ["vert", "neutre"],
      ["vert", "ambre"],
      ["rouge", "rouge"],
      ["vert", "neutre"],
      ["vert", "ambre"],
      ["vert", "ambre"],
      ["rouge", "rouge"],
    ];
    rangees.forEach((rangee, i) => {
      expect(rangee.querySelector("[class*='net']")).toHaveAttribute("data-etat", attendu[i]![0]);
      expect(rangee.querySelector("[class*='incident']")).toHaveAttribute(
        "data-etat",
        attendu[i]![1],
      );
    });
  });

  it("affiche les deux actions du pied : Exporter Excel et Demander à l'assistant", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Exporter Excel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Demander à l'assistant" })).toBeInTheDocument();
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt », et dessine des icônes SVG", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(
      screen.getByRole("link", { name: "Retour" }).querySelector("svg[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("garde des cibles tactiles d'au moins 44 px : lignes, bus, retour, période et pied", async () => {
    rendre();
    await attendreEcran();
    const cibles = [
      ...within(listes().lignes).getAllByRole("link"),
      ...within(listes().bus).getAllByRole("link"),
      screen.getByRole("link", { name: "Retour" }),
      screen.getByRole("combobox", { name: "Période" }).parentElement as HTMLElement,
      screen.getByRole("link", { name: "Exporter Excel" }),
      screen.getByRole("link", { name: "Demander à l'assistant" }),
    ];
    expect(cibles).toHaveLength(7 + 7 + 4);
    for (const cible of cibles) {
      // le bouton rond du retour a une hauteur fixe de 44 px, les autres une hauteur minimale
      const style = getComputedStyle(cible);
      const minimum = parseFloat(style.minHeight) || parseFloat(style.height);
      expect(
        minimum,
        `${cible.tagName} ${cible.className} ${cible.textContent ?? ""}`,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("Analyses · navigation identique à la maquette", () => {
  const lignes = [
    ["Douala → Yaoundé", `/analyses/ligne/${ALPHA_DLA_YDE.id}`],
    ["Douala → Bafoussam", `/analyses/ligne/${ALPHA_DLA_BAF.id}`],
    ["Yaoundé → Bafoussam", `/analyses/ligne/${ALPHA_YDE_BAF.id}`],
    ["Douala → Bamenda", null],
    ["Yaoundé → Douala", null],
    ["Bafoussam → Douala", null],
    ["Colis · toutes lignes", "/analyses/ligne/colis"],
  ] as const;

  it.each(lignes)("la ligne « %s » ouvre son détail", async (nom, chemin) => {
    const { routeur } = rendre();
    await attendreEcran();
    const rangee = within(listes().lignes)
      .getAllByRole("link")
      .find((a) => (a.textContent ?? "").startsWith(nom))!;
    // Les lignes que le monde commun ne modélise pas (Bamenda, retours) ont un identifiant dérivé de leur nom.
    const attendu = chemin ?? rangee.getAttribute("href")!;
    expect(attendu).toMatch(/^\/analyses\/ligne\/[^/]+$/);
    expect(rangee).toHaveAttribute("href", attendu);
    await userEvent.click(rangee);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(attendu));
  });

  it("chaque ligne a son propre identifiant, celui que l'API a donné", async () => {
    rendre();
    await attendreEcran();
    const hrefs = within(listes().lignes)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(7);
  });

  it("les sept bus ouvrent leur détail : /analyses/bus/<identifiant du bus>", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const rangees = within(listes().bus).getAllByRole("link");
    const hrefs = rangees.map((a) => a.getAttribute("href"));
    for (const href of hrefs) expect(href).toMatch(/^\/analyses\/bus\/[^/]+$/);
    expect(new Set(hrefs).size).toBe(7);
    // LT 207 AB : le bus que le détail de démonstration (AnalysesBus) sait afficher.
    expect(hrefs[2]).toBe(`/analyses/bus/${BUS_LT207.id}`);
    await userEvent.click(rangees[2]!);
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe(`/analyses/bus/${BUS_LT207.id}`),
    );
  });

  it("« Retour » mène au Patron", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/aujourdhui");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
  });

  it("« Exporter Excel » mène à Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: "Exporter Excel" });
    expect(lien).toHaveAttribute("href", "/comptable");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("« Demander à l'assistant » mène à l'assistant", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: "Demander à l'assistant" });
    expect(lien).toHaveAttribute("href", "/assistant");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant"));
  });

  it("n'a pas de barre d'onglets (la planche n'en montre pas) et aucun lien vide", async () => {
    rendre();
    await attendreEcran();
    expect(screen.queryByRole("navigation", { name: "Navigation patron" })).not.toBeInTheDocument();
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^\/[a-z]/);
    }
  });
});

describe("Analyses · changer la période recalcule tous les blocs", () => {
  it("le mois remplace l'en-tête, la recette, les barres, les lignes, les colis et les bus", async () => {
    rendre(clientAvecMois());
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Période" }), "mois");

    expect(await screen.findByText("110,5 M")).toBeInTheDocument();
    expect(screen.queryByText("28,4 M")).not.toBeInTheDocument();
    expect(screen.getByText("Décembre 2026 · 2 gares")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Période" })).toHaveValue("mois");

    const carte = screen.getByRole("region", { name: "Recette par semaine" });
    expect(within(carte).getByText("− 3 %")).toHaveAttribute("data-etat", "rouge");
    expect(
      within(carte).getByText("La semaine de Noël est la plus forte du mois."),
    ).toBeInTheDocument();
    const barres = Array.from(carte.querySelectorAll("path[data-barre]"));
    expect(barres.map((b) => b.getAttribute("data-accent"))).toEqual([
      null,
      null,
      "ambre",
      "ambre",
    ]);
    expect(Array.from(carte.querySelectorAll("svg text")).map((t) => t.textContent)).toEqual([
      "S49",
      "S50",
      "S51",
      "S52",
    ]);

    expect(screen.getByText("2 lignes · glisser")).toBeInTheDocument();
    expect(
      within(listes().lignes)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Douala → Kribi55 % · 9,0 M", "Colis · toutes lignes8 000 · 7,5 M"]);
    expect(
      within(listes().bus)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["LT 001 AB · Ekani1 trajet− 0,3 M1 panne"]);
    expect(screen.queryByText("Douala → Yaoundé")).not.toBeInTheDocument();
  });

  it("pendant la lecture de la période, les blocs gardent leur place et montrent leur chargement", async () => {
    let debloquer: () => void = () => {};
    const attente = new Promise<void>((resolve) => {
      debloquer = resolve;
    });
    rendre(
      clientAvecMois(async (semaine) => {
        await attente;
        return moisDe(semaine);
      }),
    );
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Période" }), "trimestre");

    await waitFor(() => expect(principal()).toHaveAttribute("aria-busy", "true"));
    expect(screen.queryByText("28,4 M")).not.toBeInTheDocument();
    expect(screen.getByText("Par ligne · remplissage")).toBeInTheDocument();
    expect(screen.getByText("Par bus · net")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recette par semaine" })).toBeInTheDocument();
    // le sélecteur et le pied restent utilisables
    expect(screen.getByRole("combobox", { name: "Période" })).toHaveValue("trimestre");
    expect(screen.getByRole("link", { name: "Exporter Excel" })).toBeInTheDocument();

    debloquer();
    expect(await screen.findByText("110,5 M")).toBeInTheDocument();
    expect(principal()).toHaveAttribute("aria-busy", "false");
  });

  it("revenir à la semaine remet les chiffres de la semaine", async () => {
    rendre(clientAvecMois());
    await attendreEcran();
    const selecteur = screen.getByRole("combobox", { name: "Période" });
    await userEvent.selectOptions(selecteur, "mois");
    await screen.findByText("110,5 M");
    await userEvent.selectOptions(selecteur, "semaine");
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByText("110,5 M")).not.toBeInTheDocument();
    expect(screen.getByText("Semaine du 29 déc. au 4 janv. · 3 gares")).toBeInTheDocument();
    expect(screen.getByText("7 lignes · glisser")).toBeInTheDocument();
  });

  it("une période que l'API n'a pas : message dans le style nuit, sélecteur et pied intacts", async () => {
    // Le mock de démonstration ne contient que la semaine : « mois » répond 404.
    rendre();
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Période" }), "mois");
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Les analyses ne se sont pas chargées.");
    expect(screen.queryByText("28,4 M")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Période" })).toHaveValue("mois");
    expect(screen.getByRole("link", { name: "Demander à l'assistant" })).toBeInTheDocument();
  });
});

describe("Analyses · états chargement, vide et erreur", () => {
  function rendreVue(
    etat: EtatBloc,
    options: { analyses?: Analyses; reessayer?: () => void; periode?: Periode } = {},
  ) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <AnalysesVue
              periode={options.periode ?? "semaine"}
              onPeriode={() => {}}
              etat={etat}
              analyses={options.analyses}
              {...(options.reessayer ? { onReessayer: options.reessayer } : {})}
            />
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  async function semaine(): Promise<Analyses> {
    const client = creerClientMock({ source: sourceScenariosFixtures(), scenario: "Analyses" });
    return client.executer(patron.OP_ANALYSES, { periode: "semaine" });
  }

  it("chargement : mêmes blocs et mêmes titres, aucune donnée, retour et pied utilisables", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Recette par jour")).toBeInTheDocument();
    expect(screen.getByText("Par ligne · remplissage")).toBeInTheDocument();
    expect(screen.getByText("Par bus · net")).toBeInTheDocument();
    expect(screen.queryByText(/glisser/)).not.toBeInTheDocument();
    expect(screen.queryByText("28,4 M")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    expect(screen.getByRole("link", { name: "Exporter Excel" })).toHaveAttribute(
      "href",
      "/comptable",
    );
  });

  it("vide (lecture sans donnée) : message dans le style nuit, pas de bloc de chiffres", () => {
    rendreVue("vide");
    expect(screen.getByRole("status")).toHaveTextContent("Aucune information pour cette période.");
    expect(screen.queryByText("Par ligne · remplissage")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Demander à l'assistant" })).toBeInTheDocument();
  });

  it("vide (période sans activité) : même message, même mise en page", async () => {
    const calme: Analyses = {
      ...(await semaine()),
      recette: { total: 0, variationPct: 0, serie: [], lecture: "" },
      lignes: [],
      bus: [],
      colis: { nombre: 0, recette: 0 },
    };
    rendreVue("pret", { analyses: calme });
    expect(screen.getByRole("status")).toHaveTextContent("Aucune information pour cette période.");
    expect(screen.queryByText("Par bus · net")).not.toBeInTheDocument();
  });

  it("une liste sans ligne ou sans bus le dit, le reste reste affiché", async () => {
    const donnees: Analyses = {
      ...(await semaine()),
      lignes: [],
      colis: { nombre: 0, recette: 0 },
      bus: [],
    };
    rendreVue("pret", { analyses: donnees });
    expect(screen.getByText("28,4 M")).toBeInTheDocument();
    expect(screen.getByText("Aucune ligne sur cette période.")).toBeInTheDocument();
    expect(screen.getByText("Aucun bus sur cette période.")).toBeInTheDocument();
    expect(screen.getByText("0 ligne · glisser")).toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, en-tête et pied intacts", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ANALYSES.nom, (impl) =>
        implementer(patron.OP_ANALYSES, async (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return lireSemaine(impl, params, ctx);
        }),
      ),
    );
    rendre(client);
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Les analyses ne se sont pas chargées.");
    expect(screen.queryByText("Par ligne · remplissage")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Période" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exporter Excel" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("7 lignes · glisser")).toBeInTheDocument();
  });

  it("le nombre de bus de la flotte manque : la liste annonce ceux qu'elle montre", async () => {
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_TABLEAU_DU_JOUR.nom, () =>
        implementer(patron.OP_TABLEAU_DU_JOUR, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    );
    rendre(client);
    await attendreEcran();
    expect(await screen.findByText("7 bus · glisser")).toBeInTheDocument();
  });

  it("une seule ligne et un seul trajet : le texte passe au singulier", async () => {
    const donnees: Analyses = {
      ...(await semaine()),
      lignes: [
        { ligneId: "ligne-x", nom: "Douala → Kribi", remplissagePct: 55, recette: 9_000_000 },
      ],
      colis: { nombre: 0, recette: 0 },
      bus: [
        {
          busId: "bus-x",
          immatriculation: "LT 001 AB",
          chauffeur: "Ekani",
          trajets: 1,
          net: 1_000_000,
          incident: "0 incident",
        },
      ],
    };
    rendreVue("pret", { analyses: donnees });
    expect(screen.getByText("1 ligne · glisser")).toBeInTheDocument();
    expect(screen.queryByText("Colis · toutes lignes")).not.toBeInTheDocument();
    expect(screen.getByText("1 trajet")).toBeInTheDocument();
    expect(screen.getByText("+ 1,0 M")).toBeInTheDocument();
  });

  it("un remplissage des colis fourni par l'API dessine la barre de la ligne Colis", async () => {
    const donnees = await semaine();
    const avec = { ...donnees, colis: { ...donnees.colis, remplissagePct: 84 } } as Analyses;
    rendreVue("pret", { analyses: avec });
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.getByRole("progressbar", { name: "Colis · toutes lignes" })).toHaveAttribute(
      "aria-valuenow",
      "84",
    );
  });
});

describe("Analyses · textes", () => {
  it("les trois langues ont les mêmes clés ; le français est rempli", async () => {
    function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
      return Object.entries(objet).flatMap(([cle, valeur]) =>
        typeof valeur === "object" && valeur !== null
          ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
          : [`${prefixe}${cle}`],
      );
    }
    const vides = (objet: Record<string, unknown>): string[] =>
      Object.values(objet).flatMap((v) =>
        typeof v === "object" && v !== null ? vides(v as Record<string, unknown>) : [String(v)],
      );
    const en = (await import("./i18n.en.json")).default;
    const pcm = (await import("./i18n.pcm.json")).default;
    expect(vides(fr).filter((v) => v.trim() === "")).toEqual([]);
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});

describe("Analyses · fonctions pures", () => {
  it("écrit les montants en millions avec une décimale, zéro compris, comme la planche", () => {
    expect(millions(14_200_000)).toBe("14,2 M");
    expect(millions(4_000_000)).toBe("4,0 M");
    expect(millions(2_104_000)).toBe("2,1 M");
    expect(millions(28_400_000)).toBe("28,4 M");
    expect(millions(600_000)).toBe("0,6 M");
    expect(millions(-300_000)).toBe("− 0,3 M");
    // en dessous de 100 000, on passe aux milliers plutôt que d'écrire « 0,0 M »
    expect(millions(61_000)).toBe("61 k");
    expect(millions(950)).toBe("950");
  });

  it("écrit le net avec son signe, la variation avec un vrai signe moins", () => {
    expect(net(2_800_000)).toBe("+ 2,8 M");
    expect(net(-300_000)).toBe("− 0,3 M");
    expect(net(0)).toBe("0");
    expect(variation(5)).toBe("+ 5 %");
    expect(variation(-3)).toBe("− 3 %");
    expect(variation(0.5)).toBe("+ 0,5 %");
    expect(variation(0)).toBe("0 %");
    expect(taux(91)).toBe("91 %");
    expect(taux(87.5)).toBe("87,5 %");
  });

  it("groupe les milliers par une espace, comme « 2 104 · 2,1 M »", () => {
    expect(groupes(2104)).toBe("2 104");
    expect(groupes(950)).toBe("950");
    expect(groupes(1_250_000)).toBe("1 250 000");
    expect(colisEtRecette({ nombre: 2104, recette: 2_100_000 })).toBe("2 104 · 2,1 M");
  });

  it("colore l'incident : gris sans incident, rouge pour une panne ou la visite technique, ambre sinon", () => {
    expect(tonIncident("0 incident")).toBe("neutre");
    expect(tonIncident("2 pannes")).toBe("rouge");
    expect(tonIncident("visite technique")).toBe("rouge");
    expect(tonIncident("carburant + 12 %")).toBe("ambre");
    expect(tonIncident("pneus à changer")).toBe("ambre");
    expect(tonIncident("1 retard > 30 min")).toBe("ambre");
    expect(tonNet({ incident: "2 pannes" })).toBe("rouge");
    expect(tonNet({ incident: "pneus à changer" })).toBe("vert");
    expect(tonNet({ incident: "0 incident" })).toBe("vert");
  });

  it("met en avant les deux plus fortes recettes, et rien avec moins de trois barres", () => {
    const serie = [10, 20, 30, 25, 5].map((recette, i) => ({ libelle: `S${i}`, recette }));
    expect(barresRecette(serie).map((b) => b.accent)).toEqual([
      undefined,
      undefined,
      "ambre",
      "ambre",
      undefined,
    ]);
    expect(barresRecette(serie.slice(0, 2)).map((b) => b.accent)).toEqual([undefined, undefined]);
    expect(barresRecette([])).toEqual([]);
    // à égalité, la plus à gauche l'emporte : le résultat ne dépend pas de l'ordre de tri du navigateur
    const egales = [1, 1, 1].map((recette, i) => ({ libelle: `S${i}`, recette }));
    expect(barresRecette(egales).map((b) => b.accent)).toEqual(["ambre", "ambre", undefined]);
    expect(barresRecette(serie)[2]).toMatchObject({
      etiquette: "S2",
      valeur: 30,
      valeurAffichee: "30",
    });
  });
});
