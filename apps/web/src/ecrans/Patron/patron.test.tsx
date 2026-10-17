import {
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
  simulerFlux,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { BUS_LT207, ecrans } from "@afrimove/fixtures";
import { ConceptionProvider } from "@afrimove/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { AccueilVue, type EtatBloc } from "./accueil-vue";
import { destinationAlerte, TON_ALERTE } from "./destinations";
import {
  DIRECT_VIDE,
  alertesAvecDirect,
  recevoir,
  tableauAvecDirect,
  type Alerte,
  type TableauDuJour,
} from "./direct";
import { ecart, heureDouala, quandAlerte, recetteCourte, taux, variation } from "./formats";
import fr from "./i18n.fr.json";

const donneesPlanche = ecrans.Patron.donnees;

function rendre(
  options: { masques?: string[]; clientApi?: ReturnType<typeof creerClientMock> } = {},
) {
  return rendreApp({
    fixtures: true,
    scenario: "Patron",
    url: "/aujourdhui",
    ...(options.masques ? { masques: options.masques } : {}),
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Alpha Voyages");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien de la zone principale dont le texte commence par celui-ci (les tuiles ont un titre et un détail). */
function lien(texte: string | RegExp): HTMLElement {
  const trouve = within(principal())
    .getAllByRole("link")
    .find((a) =>
      typeof texte === "string"
        ? (a.textContent ?? "").startsWith(texte)
        : texte.test(a.textContent ?? ""),
    );
  if (!trouve) throw new Error(`Pas de lien « ${String(texte)} »`);
  return trouve;
}

function lignesAlertes(): HTMLElement[] {
  const liste = screen.getByRole("region", { name: /liste qui défile/ });
  return within(liste)
    .getAllByRole("link")
    .map((a) => a as HTMLElement);
}

type Impl = Scenario["operations"][number];
function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "Patron", latenceMs: 0 });
}

function remplacer(
  scenario: Scenario,
  nom: string,
  fabrique: (impl: Impl) => Impl,
  flux: Scenario["flux"] = [],
): Scenario {
  return {
    ...scenario,
    flux,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom ? fabrique(impl) : impl,
    ),
  };
}

describe("Patron · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : compagnie, patron, gares, bus et heure", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("M. Kamga · 3 gares · 14 bus")).toBeInTheDocument();
    expect(screen.getByText("14:05")).toBeInTheDocument();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Patron — accueil (tout à 1 touche)",
    );
  });

  it("affiche les chiffres du jour contre mardi dernier, l'écart total en ambre", async () => {
    rendre();
    await attendreEcran();
    const carte = screen.getByRole("group", { name: /Aujourd'hui · en direct/ });
    expect(within(carte).getByText("Aujourd'hui · en direct")).toBeInTheDocument();
    expect(within(carte).getByText("vs mardi dernier")).toBeInTheDocument();
    expect(within(carte).getByText("2,61 M")).toBeInTheDocument();
    expect(within(carte).getByText("+ 8 %")).toBeInTheDocument();
    for (const [valeur, libelle] of [
      ["612", "billets"],
      ["188", "colis"],
      ["86 %", "remplissage"],
      ["− 1 000", "écart total"],
    ] as const) {
      const chiffre = within(carte).getByText(libelle).parentElement as HTMLElement;
      expect(within(chiffre).getByText(valeur)).toBeInTheDocument();
    }
    const ecartTotal = within(carte).getByText("écart total").parentElement as HTMLElement;
    expect(ecartTotal).toHaveAttribute("data-etat", "ambre");
    const billets = within(carte).getByText("billets").parentElement as HTMLElement;
    expect(billets).toHaveAttribute("data-etat", "neutre");
  });

  it("affiche la carte de l'assistant avec ses deux aperçus", async () => {
    rendre();
    await attendreEcran();
    const assistant = lien("L'assistant a 2 choses à te dire");
    expect(assistant).toHaveTextContent(
      "L'assistant a 2 choses à te direLe 09:30 Oméga te prend 40 clients · Guichet 2 : 3 écarts en 10 jours",
    );
    expect(assistant).toHaveAttribute("href", "/assistant");
  });

  it("affiche les neuf tuiles avec leur titre et leur détail", async () => {
    rendre();
    await attendreEcran();
    const attendues = donneesPlanche.raccourcis.map((r) => `${r.titre} ${r.detail}`);
    const tuiles = Array.from(document.querySelectorAll("main a[class*='tuile']")).map(
      (a) => a.textContent,
    );
    expect(tuiles).toEqual(attendues);
    expect(tuiles).toHaveLength(9);
  });

  it("affiche les six alertes avec leur heure et la couleur de leur point", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Alertes · 6")).toBeInTheDocument();
    expect(screen.getByText("1 touche · glisser")).toBeInTheDocument();

    const lignes = lignesAlertes();
    expect(lignes).toHaveLength(6);
    const attendues = [
      ["Guichet 2 Akwa · écart − 1 000 · 3e en 10 jours", "14:00", "ambre"],
      ["6 colis Oméga en correspondance chez toi · à régler lundi", "12:30", "bleu"],
      ["Guichet 3 Akwa · Pauline N. bloquée · 3 PIN faux", "09:40", "rouge"],
      ["LT 207 AB · 2e panne en 10 jours · révision conseillée", "hier", "rouge"],
      ["4 transactions MoMo sans correspondance · 16 000", "hier", "ambre"],
      ["Avance 6 M · dossier AV-2027-0041 en analyse", "hier", "vert"],
    ] as const;
    attendues.forEach(([texte, heure, ton], i) => {
      const ligne = lignes[i]!;
      // Le texte masqué du niveau (« À surveiller : ») précède le texte de l'alerte.
      expect(ligne).toHaveTextContent(texte);
      expect(ligne).toHaveTextContent(new RegExp(`${heure}$`));
      expect(ligne.querySelector("[data-etat]")).toHaveAttribute("data-etat", ton);
    });
  });

  it("écrit les rangs en exposant comme la planche (3e, 2e)", async () => {
    rendre();
    await attendreEcran();
    const exposants = Array.from(document.querySelectorAll("main sup")).map((s) => s.textContent);
    expect(exposants).toEqual(["e", "e"]);
    expect(lignesAlertes()[0]!.querySelector("sup")!.previousSibling).toHaveTextContent("3");
  });

  it("garde la barre d'onglets du patron, Aujourd'hui courant", async () => {
    rendre();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation patron" });
    expect(
      within(barre)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Aujourd'hui", "Analyses", "Gares", "Réglages"]);
    expect(within(barre).getByRole("link", { name: "Aujourd'hui" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt », et dessine des icônes SVG", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const tuile of Array.from(document.querySelectorAll("main a[class*='tuile']"))) {
      expect(
        tuile.querySelector("svg[aria-hidden='true']"),
        tuile.textContent ?? "",
      ).not.toBeNull();
    }
  });

  it("garde des cibles tactiles d'au moins 44 px pour les tuiles, la carte et les alertes", async () => {
    rendre();
    await attendreEcran();
    const liens = within(principal()).getAllByRole("link");
    expect(liens).toHaveLength(1 + 9 + 6);
    for (const a of liens) {
      const minimum = parseFloat(getComputedStyle(a).minHeight);
      expect(minimum, a.textContent ?? "").toBeGreaterThanOrEqual(44);
    }
  });
});

describe("Patron · navigation identique à la maquette", () => {
  const idBus = BUS_LT207.id;

  const tuiles = [
    ["Analyses", "/analyses"],
    ["Mes gares, mes gens", "/gares"],
    ["Rapports", "/rapport"],
    ["Comptable", "/comptable"],
    ["Financement", "/financement"],
    ["Entre compagnies", "/inter-agences"],
    ["Réglages", "/reglages"],
    ["Modules", "/reglages/modules"],
    ["Salle de contrôle", "/controle"],
  ] as const;

  it.each(tuiles)("la tuile « %s » mène à %s", async (titre, chemin) => {
    const { routeur } = rendre();
    await attendreEcran();
    const cible = lien(titre);
    expect(cible).toHaveAttribute("href", chemin);
    await userEvent.click(cible);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("la carte de l'assistant mène à l'assistant", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(lien("L'assistant"));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant"));
  });

  const alertes = [
    [0, `/gares/gare-alp-dla`],
    [1, "/inter-agences"],
    [2, "/gares"],
    [3, `/analyses/bus/${idBus}`],
    [4, "/comptable"],
    [5, "/financement/demande/AV-2027-0041"],
  ] as const;

  it.each(alertes)("l'alerte n° %i mène à %s", async (rang, chemin) => {
    const { routeur } = rendre();
    await attendreEcran();
    // Les gares arrivent après la liste : l'adresse de la première alerte est celle de la gare d'Akwa.
    await waitFor(() => expect(lignesAlertes()[rang]).toHaveAttribute("href", chemin));
    await userEvent.click(lignesAlertes()[rang]!);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  const onglets = [
    ["Analyses", "/analyses"],
    ["Gares", "/gares"],
    ["Réglages", "/reglages"],
  ] as const;

  it.each(onglets)("l'onglet « %s » mène à %s", async (libelle, chemin) => {
    const { routeur } = rendre();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation patron" });
    await userEvent.click(within(barre).getByRole("link", { name: libelle }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("l'onglet « Aujourd'hui » reste sur l'écran", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation patron" });
    await userEvent.click(within(barre).getByRole("link", { name: "Aujourd'hui" }));
    expect(routeur.state.location.pathname).toBe("/aujourdhui");
    expect(await attendreEcran()).toBeInTheDocument();
  });

  it("chaque alerte et chaque tuile a une destination : aucun lien vide", async () => {
    rendre();
    await attendreEcran();
    await waitFor(() => expect(lignesAlertes()[0]).toHaveAttribute("href", "/gares/gare-alp-dla"));
    for (const a of within(principal()).getAllByRole("link")) {
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^\/[a-z]/);
    }
    expect(within(principal()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("sans la liste des gares, l'alerte d'écart ouvre « Mes gares, mes gens » plutôt que rien", async () => {
    const client = clientAvec((scenario) =>
      remplacer(
        scenario,
        patron.OP_GARES.nom,
        () =>
          implementer(patron.OP_GARES, () => {
            throw new ErreurReseau("coupure");
          }),
        scenario.flux,
      ),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    expect(lignesAlertes()[0]).toHaveAttribute("href", "/gares");
  });
});

describe("Patron · un module masqué retire sa tuile", () => {
  it("financement masqué : plus de tuile Financement, plus d'alerte d'avance, le compte baisse", async () => {
    rendre({ masques: ["financement"] });
    await attendreEcran();
    expect(within(principal()).queryByText("Financement")).not.toBeInTheDocument();
    expect(within(principal()).getAllByRole("link")).toHaveLength(1 + 8 + 5);
    expect(screen.queryByText(/dossier AV-2027-0041/)).not.toBeInTheDocument();
    expect(screen.getByText("Alertes · 5")).toBeInTheDocument();
  });

  it("inter-agences masqué : plus de tuile « Entre compagnies » ni d'alerte de colis en correspondance", async () => {
    rendre({ masques: ["inter-agences"] });
    await attendreEcran();
    expect(within(principal()).queryByText("Entre compagnies")).not.toBeInTheDocument();
    expect(screen.queryByText(/colis Oméga en correspondance/)).not.toBeInTheDocument();
    expect(screen.getByText("Alertes · 5")).toBeInTheDocument();
    expect(lien("Financement")).toBeInTheDocument();
  });

  it("supervision masquée : plus de tuile Rapports, plus de carte de l'assistant", async () => {
    rendre({ masques: ["supervision"] });
    await attendreEcran();
    expect(within(principal()).queryByText("Rapports")).not.toBeInTheDocument();
    expect(screen.queryByText(/L'assistant a/)).not.toBeInTheDocument();
    expect(within(principal()).getAllByRole("link")).toHaveLength(8 + 6);
  });

  it("aucun module masqué : les neuf tuiles et les six alertes", async () => {
    rendre({ masques: [] });
    await attendreEcran();
    expect(within(principal()).getAllByRole("link")).toHaveLength(1 + 9 + 6);
  });

  it("les tuiles du socle (Analyses, Gares, Comptable, Réglages, Modules, Salle de contrôle) ne disparaissent jamais", async () => {
    rendre({
      masques: ["financement", "inter-agences", "supervision", "colis", "quai", "covoit", "ussd"],
    });
    await attendreEcran();
    for (const titre of [
      "Analyses",
      "Mes gares, mes gens",
      "Comptable",
      "Réglages",
      "Modules",
      "Salle de contrôle",
    ]) {
      expect(lien(titre)).toBeInTheDocument();
    }
  });
});

describe("Patron · temps réel", () => {
  const jourDirect = {
    recette: 2_650_000,
    variationPct: 9,
    comparaison: "mardi dernier",
    billets: 613,
    colis: 188,
    remplissagePct: 86,
    ecartTotal: -1000,
  };
  const alerteDirecte = {
    id: "alerte-direct-1",
    categorie: "pin_bloque",
    texte: "Guichet 1 Akwa · Jean P. bloqué · 3 PIN faux",
    quand: "2027-01-05T14:06:00.000+01:00",
    cibleId: null,
  } as const;

  function clientDirect(messages: readonly unknown[]) {
    return clientAvec((scenario) => ({
      ...scenario,
      flux: [
        simulerFlux(patron.CANAL_DIRECT_JOUR, (_params, ctx) => {
          messages.forEach((message, i) => ctx.planifier(30 * (i + 1), () => ctx.emettre(message)));
        }),
      ],
    }));
  }

  it("les chiffres du direct remplacent ceux de la lecture, l'heure suit", async () => {
    rendre({
      clientApi: clientDirect([
        { type: "chiffres", instant: "2027-01-05T14:06:00.000+01:00", jour: jourDirect },
      ]),
    });
    await attendreEcran();
    expect(await screen.findByText("2,65 M")).toBeInTheDocument();
    expect(screen.queryByText("2,61 M")).not.toBeInTheDocument();
    expect(screen.getByText("+ 9 %")).toBeInTheDocument();
    expect(screen.getByText("613")).toBeInTheDocument();
    expect(screen.getByText("14:06")).toBeInTheDocument();
  });

  it("une nouvelle alerte s'ajoute en tête de liste et au compteur", async () => {
    rendre({ clientApi: clientDirect([{ type: "alerte", alerte: alerteDirecte }]) });
    await attendreEcran();
    expect(await screen.findByText("Alertes · 7")).toBeInTheDocument();
    const premiere = lignesAlertes()[0]!;
    expect(premiere).toHaveTextContent("Guichet 1 Akwa · Jean P. bloqué · 3 PIN faux");
    expect(premiere).toHaveTextContent(/14:06$/);
    expect(premiere).toHaveAttribute("href", "/gares");
  });

  it("publier de nouveau une alerte déjà affichée ne la double pas", async () => {
    rendre({
      clientApi: clientDirect([
        { type: "alerte", alerte: alerteDirecte },
        { type: "alerte", alerte: alerteDirecte },
      ]),
    });
    await attendreEcran();
    expect(await screen.findByText("Alertes · 7")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByText("Alertes · 7")).toBeInTheDocument();
    expect(lignesAlertes()).toHaveLength(7);
  });
});

describe("Patron · états chargement, vide et erreur", () => {
  function rendreVue(
    etat: EtatBloc,
    options: { etatAlertes?: EtatBloc; reessayer?: () => void } = {},
  ) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <AccueilVue
              etat={etat}
              etatAlertes={options.etatAlertes ?? etat}
              instant="2027-01-05T14:05:00.000+01:00"
              {...(options.reessayer ? { onReessayer: options.reessayer } : {})}
            />
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  it("chargement : mêmes blocs, aucun texte de donnée, tuiles utilisables", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("group", { name: "Chargement de l'accueil" })).toBeInTheDocument();
    expect(screen.queryByText("2,61 M")).not.toBeInTheDocument();
    expect(screen.queryByText(/L'assistant a/)).not.toBeInTheDocument();
    expect(screen.getByText("Alertes · 0")).toBeInTheDocument();
    // la carte de l'assistant n'est qu'un cadre vide : les neuf tuiles seules sont des liens
    expect(within(principal()).getAllByRole("link")).toHaveLength(9);
    expect(lien("Mes gares, mes gens")).toHaveTextContent("caisses · quais");
    expect(lien("Mes gares, mes gens")).not.toHaveTextContent("pers.");
  });

  it("vide : message dans le style nuit, tuiles toujours là", () => {
    rendreVue("vide");
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "Aucune information pour le moment.",
    );
    expect(lien("Réglages")).toHaveAttribute("href", "/reglages");
  });

  it("erreur : message, bouton Réessayer, et les tuiles restent accessibles", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_TABLEAU_DU_JOUR.nom, (impl) =>
        implementer(patron.OP_TABLEAU_DU_JOUR, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
        }),
      ),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("L'accueil ne s'est pas chargé.");
    expect(lien("Rapports")).toHaveAttribute("href", "/rapport");
    expect(screen.queryByText("2,61 M")).not.toBeInTheDocument();
    // les alertes ont leur propre lecture : elles s'affichent malgré tout
    expect(await screen.findByText("Alertes · 6")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.getByText("2,61 M")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("alertes en erreur : message dans la liste, le reste de l'écran est intact", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ALERTES.nom, (impl) =>
        implementer(patron.OP_ALERTES, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
        }),
      ),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Les alertes ne se sont pas chargées.");
    expect(screen.getByText("2,61 M")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Alertes · 6")).toBeInTheDocument();
    expect(lignesAlertes()).toHaveLength(6);
  });

  it("sans alerte : le compte est à zéro et un message le dit", async () => {
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ALERTES.nom, () =>
        implementer(patron.OP_ALERTES, () => ({ alertes: [] })),
      ),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    expect(await screen.findByText("Alertes · 0")).toBeInTheDocument();
    expect(screen.getByText("Aucune alerte pour le moment.")).toBeInTheDocument();
  });

  it("une seule chose à dire : le titre passe au singulier ; aucune : la carte disparaît", async () => {
    for (const [nbInsights, attendu] of [
      [1, "L'assistant a 1 chose à te dire"],
      [0, null],
    ] as const) {
      const client = clientAvec((scenario) =>
        remplacer(scenario, patron.OP_TABLEAU_DU_JOUR.nom, (impl) =>
          implementer(patron.OP_TABLEAU_DU_JOUR, async (params, ctx) => {
            const tableau = (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
              params,
              ctx,
            )) as TableauDuJour;
            return { ...tableau, assistant: { ...tableau.assistant, nbInsights } };
          }),
        ),
      );
      const { unmount } = renderEtNettoyer(client);
      await attendreEcran();
      if (attendu) expect(screen.getByText(attendu)).toBeInTheDocument();
      else expect(screen.queryByText(/L'assistant a/)).not.toBeInTheDocument();
      unmount();
    }
  });
});

/** Rend l'écran et rend la main pour démonter (les tests qui rendent plusieurs fois). */
function renderEtNettoyer(clientApi: ReturnType<typeof creerClientMock>) {
  rendre({ clientApi });
  return { unmount: () => document.body.replaceChildren() };
}

describe("Patron · textes", () => {
  it("les trois langues ont les mêmes clés ; le français est rempli", () => {
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
    expect(vides(fr).filter((v) => v.trim() === "")).toEqual([]);
    expect(cles(fr).length).toBeGreaterThan(30);
  });
});

describe("Patron · fonctions pures", () => {
  it("formate heures, recettes, variations, taux et écarts comme la planche", () => {
    expect(heureDouala("2027-01-05T14:05:00.000+01:00")).toBe("14:05");
    expect(recetteCourte(2_610_000)).toBe("2,61 M");
    expect(recetteCourte(2_600_000)).toBe("2,6 M");
    expect(recetteCourte(12_000_000)).toBe("12 M");
    expect(recetteCourte(612_000)).toBe("612 k");
    expect(recetteCourte(612_500)).toBe("612,5 k");
    expect(recetteCourte(950)).toBe("950");
    expect(variation(8)).toBe("+ 8 %");
    expect(variation(-14)).toBe("− 14 %");
    expect(variation(0.7)).toBe("+ 0,7 %");
    expect(variation(0)).toBe("0 %");
    expect(taux(86)).toBe("86 %");
    expect(ecart(-1000)).toBe("− 1 000");
    expect(ecart(1_250_000)).toBe("+ 1 250 000");
    expect(ecart(0)).toBe("0");
  });

  it("repère une alerte par son heure, « hier » ou sa date, sur le jour du tableau", () => {
    const maintenant = "2027-01-05T14:05:00.000+01:00";
    expect(quandAlerte("2027-01-05T14:00:00.000+01:00", maintenant)).toEqual({
      genre: "heure",
      heure: "14:00",
    });
    expect(quandAlerte("2027-01-04T18:00:00.000+01:00", maintenant)).toEqual({ genre: "hier" });
    expect(quandAlerte("2027-01-02T09:00:00.000+01:00", maintenant)).toEqual({
      genre: "date",
      date: "2 janv.",
    });
    // une alerte « du futur » (horloges décalées) reste affichée par son heure
    expect(quandAlerte("2027-01-05T14:30:00.000+01:00", "2027-01-05T14:05:00.000+01:00")).toEqual({
      genre: "heure",
      heure: "14:30",
    });
  });

  const alerte = (categorie: Alerte["categorie"], extra: Partial<Alerte> = {}): Alerte => ({
    id: "a",
    categorie,
    texte: "texte",
    quand: "2027-01-05T14:00:00.000+01:00",
    cibleId: null,
    ...extra,
  });

  it("choisit l'écran de chaque catégorie d'alerte", () => {
    const gares = [
      { id: "gare-mvan", nom: "Mvan" },
      { id: "gare-yde-mvan", nom: "Yaoundé Mvan" },
      { id: "gare-akwa", nom: "Akwa" },
    ];
    expect(
      destinationAlerte(alerte("ecart_caisse", { texte: "Guichet 2 Akwa · écart − 1 000" }), gares),
    ).toBe("/gares/gare-akwa");
    expect(
      destinationAlerte(alerte("ecart_caisse", { texte: "Guichet 1 Yaoundé Mvan · écart" }), gares),
    ).toBe("/gares/gare-yde-mvan");
    expect(destinationAlerte(alerte("ecart_caisse", { texte: "Guichet 2 Bonabéri" }), gares)).toBe(
      "/gares",
    );
    expect(destinationAlerte(alerte("ecart_caisse"), undefined)).toBe("/gares");
    expect(destinationAlerte(alerte("correspondance"), gares)).toBe("/inter-agences");
    expect(destinationAlerte(alerte("pin_bloque", { cibleId: "pers-1" }), gares)).toBe("/gares");
    expect(destinationAlerte(alerte("panne_bus", { cibleId: "bus-1" }), gares)).toBe(
      "/analyses/bus/bus-1",
    );
    expect(destinationAlerte(alerte("panne_bus"), gares)).toBe("/analyses");
    expect(destinationAlerte(alerte("momo_sans_correspondance"), gares)).toBe("/comptable");
    expect(destinationAlerte(alerte("financement", { cibleId: "AV-2027-0041" }), gares)).toBe(
      "/financement/demande/AV-2027-0041",
    );
    expect(destinationAlerte(alerte("financement"), gares)).toBe("/financement");
    expect(destinationAlerte(alerte("autre"), gares)).toBe("/assistant");
  });

  it("donne une couleur à chaque catégorie d'alerte", () => {
    expect(Object.keys(TON_ALERTE).sort()).toEqual([
      "autre",
      "correspondance",
      "ecart_caisse",
      "financement",
      "momo_sans_correspondance",
      "panne_bus",
      "pin_bloque",
    ]);
  });

  const tableau = {
    instant: "2027-01-05T14:05:00.000+01:00",
    jour: { recette: 2_610_000, billets: 612 },
  } as unknown as TableauDuJour;

  it("applique le direct : chiffres plus récents seulement, alertes une seule fois", () => {
    const plusRecent = {
      type: "chiffres",
      instant: "2027-01-05T14:06:00.000+01:00",
      jour: { recette: 2_650_000, billets: 613 },
    } as never;
    const plusAncien = {
      type: "chiffres",
      instant: "2027-01-05T14:04:00.000+01:00",
      jour: { recette: 1, billets: 1 },
    } as never;

    const avecRecent = recevoir(DIRECT_VIDE, plusRecent);
    expect(tableauAvecDirect(tableau, avecRecent).jour.recette).toBe(2_650_000);
    expect(tableauAvecDirect(tableau, avecRecent).instant).toBe("2027-01-05T14:06:00.000+01:00");
    expect(tableauAvecDirect(tableau, recevoir(DIRECT_VIDE, plusAncien))).toBe(tableau);

    const a1 = alerte("pin_bloque", { id: "nouvelle" });
    const connue = alerte("autre", { id: "connue" });
    let direct = recevoir(DIRECT_VIDE, { type: "alerte", alerte: a1 } as never);
    direct = recevoir(direct, { type: "alerte", alerte: a1 } as never);
    expect(direct.alertes).toHaveLength(1);
    direct = recevoir(direct, { type: "alerte", alerte: connue } as never);
    expect(alertesAvecDirect([connue], direct).map((a) => a.id)).toEqual(["nouvelle", "connue"]);
  });
});
