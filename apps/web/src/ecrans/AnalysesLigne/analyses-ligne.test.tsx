import {
  ErreurHttp,
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ALPHA_DLA_BAF, ecrans } from "@afrimove/fixtures";
import { ConceptionProvider } from "@afrimove/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { EXEMPLES_PARAMS, urlExemple } from "@/coquille/planches";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { AnalyseLigneVue } from "./ligne-vue";
import fr from "./i18n.fr.json";
import { barresJours, tonRemplissage, tonVariation } from "./tons";
import type { AnalyseLigne, EtatLigne, Periode } from "./types";

const planche = ecrans.AnalysesLigne.donnees;
const LIGNE = ALPHA_DLA_BAF.id;
const IDS_DEPARTS = planche.departs.liste.map((d) => d._departId);

function rendre(options: { url?: string; clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "AnalysesLigne",
    url: options.url ?? `/analyses/ligne/${LIGNE}`,
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Semaine du 29 déc. au 4 janv. · 5 départs par jour");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function departs(): HTMLElement[] {
  return within(
    screen.getByRole("region", { name: "Par départ · remplissage moyen" }),
  ).getAllByRole("link");
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
  return creerClientMock({ source, scenario: "AnalysesLigne", latenceMs: 0 });
}

function remplacer(scenario: Scenario, nom: string, fabrique: (impl: Impl) => Impl): Scenario {
  return {
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom ? fabrique(impl) : impl,
    ),
  };
}

async function lireSemaine(impl: Impl, params: unknown, ctx: unknown): Promise<AnalyseLigne> {
  return (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
    params,
    ctx,
  )) as AnalyseLigne;
}

/** Le client de démonstration, avec ce que `modifier` change à l'analyse de la ligne de la semaine. */
function clientAnalyse(
  modifier: (
    semaine: AnalyseLigne,
    params: { periode?: Periode },
  ) => AnalyseLigne | Promise<AnalyseLigne>,
) {
  return clientAvec((scenario) =>
    remplacer(scenario, patron.OP_ANALYSE_LIGNE.nom, (impl) =>
      implementer(patron.OP_ANALYSE_LIGNE, async (params, ctx) => {
        const semaine = await lireSemaine(impl, { ligneId: params.ligneId }, ctx);
        return modifier(semaine, params);
      }),
    ),
  );
}

describe("AnalysesLigne · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, ligne, semaine et départs par jour, sélecteur de période", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Douala → Bafoussam")).toBeInTheDocument();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Analyses · une ligne en détail",
    );
    expect(screen.getByRole("link", { name: "Retour aux analyses" })).toBeInTheDocument();
    const periode = screen.getByRole("combobox", { name: "Période" });
    expect(periode).toHaveValue("semaine");
    expect(
      within(periode)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(planche.periodes);
  });

  it("affiche les quatre tuiles : recette, billets, remplissage face à la cible, colis", async () => {
    rendre();
    await attendreEcran();
    const tuile = (etiquette: string) =>
      screen.getByText(etiquette, { selector: "span" }).parentElement as HTMLElement;
    expect(tuile("Recette").textContent).toBe("Recette8,1 M− 14 %");
    expect(tuile("Billets").textContent).toBe("Billets2 10435 départs");
    expect(tuile("Rempl.").textContent).toBe("Rempl.78 %cible 85");
    expect(tuile("Colis").textContent).toBe("Colis612+ 9 %");
    // Recette en baisse : rouge ; colis en hausse : vert ; remplissage sous la cible : ambre.
    expect(within(tuile("Recette")).getByText("− 14 %")).toHaveAttribute("data-ton", "rouge");
    expect(within(tuile("Colis")).getByText("+ 9 %")).toHaveAttribute("data-ton", "vert");
    expect(within(tuile("Rempl.")).getByText("78 %")).toHaveAttribute("data-ton", "ambre");
    expect(within(tuile("Billets")).getByText("35 départs")).toHaveAttribute("data-ton", "neutre");
  });

  it("liste les cinq départs avec leur classe, prix, bus, note, concurrent et remplissage", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("touche pour modifier")).toBeInTheDocument();
    expect(departs().map((a) => a.textContent)).toEqual([
      "06:00classique · 3 500 · LT 118 AB94 %",
      "08:15classique · 3 500 · soute colis88 %",
      "10:00classique · 3 500 · Oméga 09:30 à 3 00055 %",
      "13:00classique · 3 50076 %",
      "16:30VIP · 5 000 · clim81 %",
    ]);
  });

  it("colore chaque départ selon son remplissage : barre verte, ambre ou rouge, ligne rouge sous 65 %", async () => {
    rendre();
    await attendreEcran();
    const lignes = departs();
    expect(lignes.map((a) => a.getAttribute("data-ton"))).toEqual([
      "vert",
      "vert",
      "rouge",
      "ambre",
      "vert",
    ]);
    const largeurs = lignes.map(
      (a) => (a.querySelector("[class*='trait']") as HTMLElement).style.width,
    );
    expect(largeurs).toEqual(["94%", "88%", "55%", "76%", "81%"]);
    // Le concurrent n'est cité que sur le départ de 10:00, en rouge.
    expect(screen.getAllByText(/Oméga/)).toHaveLength(1);
    expect(within(lignes[2]!).getByText("Oméga 09:30 à 3 000")).toBeInTheDocument();
  });

  it("dessine les sept jours : hauteur proportionnelle, le mardi en vert et le mercredi en rouge", async () => {
    rendre();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Par jour de la semaine" });
    const colonnes = Array.from(bloc.querySelector("[class*='jours']")!.children);
    expect(colonnes).toHaveLength(7);
    const lues = colonnes.map((c) => {
      const barre = c.querySelector("[class*='barre']") as HTMLElement;
      return [c.textContent, barre.getAttribute("data-ton"), parseFloat(barre.style.height)];
    });
    expect(lues.map((l) => l[0])).toEqual(planche.parJour.jours);
    expect(lues.map((l) => l[1])).toEqual([
      "neutre",
      "vert",
      "rouge",
      "neutre",
      "neutre",
      "neutre",
      "neutre",
    ]);
    // Hauteurs de la planche : 72, 88, 40, 66, 92, 100, 70 % (à 0,1 point près : la recette est répartie en francs).
    const attendu = [72, 88, 40, 66, 92, 100, 70];
    lues.forEach((l, i) => expect(l[2] as number).toBeCloseTo(attendu[i]!, 0));
    expect(within(bloc).getByText(planche.parJour.lecture)).toBeInTheDocument();
  });

  it("affiche les ventes en ligne et les billets en route", async () => {
    rendre();
    await attendreEcran();
    const enLigne = screen.getByText("Vendus en ligne").parentElement as HTMLElement;
    expect(enLigne.textContent).toBe("Vendus en ligne11 % · 231 billets · + 3 pts");
    expect(within(enLigne).getByText("11 %").tagName).toBe("STRONG");
    const enRoute = screen.getByText("En route (Bafang, Mbouda)").parentElement as HTMLElement;
    expect(enRoute.textContent).toBe("En route (Bafang, Mbouda)96 billets · tous enregistrés");
    expect(within(enRoute).getByText("96 billets").tagName).toBe("STRONG");
  });

  it("affiche les deux actions du pied : Pourquoi ça baisse ? et Modifier la ligne", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Pourquoi ça baisse ?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier la ligne" })).toBeInTheDocument();
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt », et dessine des icônes SVG", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(
      screen
        .getByRole("link", { name: "Retour aux analyses" })
        .querySelector("svg[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("garde des cibles tactiles d'au moins 44 px : retour, période, départs et pied", async () => {
    rendre();
    await attendreEcran();
    const cibles = [
      ...departs(),
      screen.getByRole("link", { name: "Retour aux analyses" }),
      screen.getByRole("combobox", { name: "Période" }).parentElement as HTMLElement,
      screen.getByRole("link", { name: "Pourquoi ça baisse ?" }),
      screen.getByRole("link", { name: "Modifier la ligne" }),
    ];
    expect(cibles).toHaveLength(5 + 4);
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

describe("AnalysesLigne · navigation identique à la maquette", () => {
  it("« Retour aux analyses » mène à Analyses", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: "Retour aux analyses" });
    expect(lien).toHaveAttribute("href", "/analyses");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/analyses"));
  });

  it.each([
    [0, "06:00 classique · 3 500 · LT 118 AB 94 %"],
    [1, "08:15 classique · 3 500 · soute colis 88 %"],
    [2, "10:00 classique · 3 500 · Oméga 09:30 à 3 000 55 %"],
    [3, "13:00 classique · 3 500 76 %"],
    [4, "16:30 VIP · 5 000 · clim 81 %"],
  ])("le départ n° %i « %s » ouvre le réglage de la ligne sur ce départ", async (rang, nom) => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: nom });
    expect(departs()[rang]).toBe(lien);
    const attendu = `/reglages/ligne/${LIGNE}`;
    expect(lien.getAttribute("href")).toBe(`${attendu}?depart=${IDS_DEPARTS[rang]}`);
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(attendu));
    expect(routeur.state.location.search).toBe(`?depart=${IDS_DEPARTS[rang]}`);
  });

  it("chaque départ a son propre identifiant, celui que l'API a donné", async () => {
    rendre();
    await attendreEcran();
    const hrefs = departs().map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(5);
    expect(hrefs.map((h) => new URLSearchParams(h!.split("?")[1]).get("depart"))).toEqual(
      IDS_DEPARTS,
    );
  });

  it("« Pourquoi ça baisse ? » mène à la réponse de l'assistant", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: "Pourquoi ça baisse ?" });
    expect(lien).toHaveAttribute("href", "/assistant/reponse");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant/reponse"));
  });

  it("« Modifier la ligne » mène au réglage de cette ligne", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: "Modifier la ligne" });
    expect(lien).toHaveAttribute("href", `/reglages/ligne/${LIGNE}`);
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(`/reglages/ligne/${LIGNE}`));
  });

  it("l'identifiant d'exemple de la route existe dans les données de démonstration", async () => {
    expect(EXEMPLES_PARAMS["ligneId"]).toBe(LIGNE);
    expect(urlExemple("AnalysesLigne")).toBe(`/analyses/ligne/${LIGNE}`);
    rendre({ url: urlExemple("AnalysesLigne") });
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AnalysesLigne · changer la période relit la ligne", () => {
  const mois = (semaine: AnalyseLigne): AnalyseLigne => ({
    ...semaine,
    periode: "mois",
    libelle: "Décembre 2026",
    departsParJour: 1,
    recette: { total: 31_200_000, variationPct: 4 },
    billets: { nombre: 1, departs: 1 },
    remplissage: { pct: 90, cible: 85 },
    colis: { nombre: 2500, variationPct: 0 },
    departs: [
      {
        departId: "dep-x",
        heure: "07:00",
        classe: "classique",
        prix: 3500,
        bus: null,
        note: null,
        remplissagePct: 90,
        concurrent: null,
      },
    ],
    parJour: { serie: [{ libelle: "S49", recette: 1 }], lecture: "Un seul point." },
    canaux: {
      enLigne: { partPct: 20, billets: 1, variationPts: -2 },
      enRoute: { billets: 0, arrets: [], tousEnregistres: false },
    },
  });

  it("le mois remplace l'en-tête, les tuiles, les départs, les jours et les canaux", async () => {
    const periodes: (string | undefined)[] = [];
    const client = clientAnalyse((semaine, params) => {
      periodes.push(params.periode);
      return params.periode === "mois" ? mois(semaine) : semaine;
    });
    rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Période" }), "mois");

    expect(await screen.findByText("Décembre 2026 · 1 départ par jour")).toBeInTheDocument();
    expect(periodes).toContain("mois");
    expect(screen.getByRole("combobox", { name: "Période" })).toHaveValue("mois");
    expect(screen.getByText("31,2 M")).toBeInTheDocument();
    expect(screen.getByText("+ 4 %")).toBeInTheDocument();
    expect(screen.getByText("90 %", { selector: "span[class*='valeur']" })).toHaveAttribute(
      "data-ton",
      "vert",
    );
    expect(screen.getByText("1 départ")).toBeInTheDocument();
    expect(screen.getByText("0 %")).toHaveAttribute("data-ton", "neutre");
    expect(departs().map((a) => a.textContent)).toEqual(["07:00classique · 3 50090 %"]);
    expect(screen.queryByText("06:00")).not.toBeInTheDocument();
    // un seul point, rien n'est mis en avant
    expect(screen.getByText("S49")).toHaveAttribute("data-ton", "neutre");
    expect(screen.getByText("Un seul point.")).toBeInTheDocument();
    expect(screen.getByText("En route").parentElement?.textContent).toBe(
      "En route0 billet · à enregistrer",
    );
    expect(screen.getByText("Vendus en ligne").parentElement?.textContent).toBe(
      "Vendus en ligne20 % · 1 billet · − 2 pts",
    );
  });

  it("pendant la lecture, les blocs gardent leur place et le sélecteur reste utilisable", async () => {
    let debloquer: () => void = () => {};
    const attente = new Promise<void>((resolve) => {
      debloquer = resolve;
    });
    const client = clientAnalyse(async (semaine, params) => {
      if (params.periode !== "trimestre") return semaine;
      await attente;
      return mois(semaine);
    });
    rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Période" }), "trimestre");

    await waitFor(() => expect(principal()).toHaveAttribute("aria-busy", "true"));
    expect(screen.queryByText("8,1 M")).not.toBeInTheDocument();
    expect(screen.getByText("Par départ · remplissage moyen")).toBeInTheDocument();
    expect(screen.getByText("Par jour de la semaine")).toBeInTheDocument();
    expect(screen.getByText("Recette")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Période" })).toHaveValue("trimestre");
    expect(screen.getByRole("link", { name: "Modifier la ligne" })).toBeInTheDocument();

    debloquer();
    expect(await screen.findByText("31,2 M")).toBeInTheDocument();
    expect(principal()).toHaveAttribute("aria-busy", "false");
  });

  it("une période que l'API n'a pas : message dans le style nuit, sélecteur et pied intacts", async () => {
    // Le mock de démonstration ne contient que la semaine : « mois » répond 404 PERIODE_INDISPONIBLE.
    rendre();
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Période" }), "mois");
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("L'analyse de la ligne ne s'est pas chargée.");
    expect(screen.queryByText("8,1 M")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Période" })).toHaveValue("mois");
    expect(screen.getByRole("link", { name: "Modifier la ligne" })).toBeInTheDocument();
  });
});

describe("AnalysesLigne · états chargement, vide, erreur et ligne introuvable", () => {
  function rendreVue(
    etat: EtatLigne,
    options: { analyse?: AnalyseLigne; reessayer?: () => void } = {},
  ) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <AnalyseLigneVue
              ligneId={LIGNE}
              periode="semaine"
              onPeriode={() => {}}
              etat={etat}
              analyse={options.analyse}
              {...(options.reessayer ? { onReessayer: options.reessayer } : {})}
            />
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  async function semaine(): Promise<AnalyseLigne> {
    const client = creerClientMock({
      source: sourceScenariosFixtures(),
      scenario: "AnalysesLigne",
    });
    return client.executer(patron.OP_ANALYSE_LIGNE, { ligneId: LIGNE });
  }

  it("chargement : mêmes blocs et mêmes titres, aucune donnée, retour et pied utilisables", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Par départ · remplissage moyen")).toBeInTheDocument();
    expect(screen.getByText("Par jour de la semaine")).toBeInTheDocument();
    expect(screen.queryByText("8,1 M")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /^\d\d:\d\d/ })).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Retour aux analyses" })).toHaveAttribute(
      "href",
      "/analyses",
    );
    expect(screen.getByRole("link", { name: "Modifier la ligne" })).toHaveAttribute(
      "href",
      `/reglages/ligne/${LIGNE}`,
    );
  });

  it("vide : une ligne sans départ le dit, les tuiles et le pied restent", async () => {
    const donnees: AnalyseLigne = {
      ...(await semaine()),
      departs: [],
      billets: { nombre: 0, departs: 0 },
    };
    rendreVue("pret", { analyse: donnees });
    expect(
      screen.getByText("Aucun départ sur cette ligne pour cette période."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 départ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pourquoi ça baisse ?" })).toBeInTheDocument();
  });

  it("des jours sans recette ne cassent pas les barres", async () => {
    const donnees: AnalyseLigne = {
      ...(await semaine()),
      parJour: {
        serie: planche.parJour.jours.map((libelle) => ({ libelle, recette: 0 })),
        lecture: "",
      },
    };
    rendreVue("pret", { analyse: donnees });
    const barres = Array.from(document.querySelectorAll<HTMLElement>("[class*='barre']"));
    expect(barres).toHaveLength(7);
    for (const barre of barres) expect(barre.style.height).toBe("0%");
  });

  it("erreur : message, bouton Réessayer qui relit, en-tête et pied intacts", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ANALYSE_LIGNE.nom, (impl) =>
        implementer(patron.OP_ANALYSE_LIGNE, async (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return lireSemaine(impl, params, ctx);
        }),
      ),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("L'analyse de la ligne ne s'est pas chargée.");
    expect(screen.queryByText("Par départ · remplissage moyen")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Période" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier la ligne" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(departs()).toHaveLength(5);
  });

  it("ligne introuvable (404) : le dit sans proposer de réessayer, ni de modifier la ligne", async () => {
    // Le lien « Colis · toutes lignes » de l'écran Analyses mène ici : ce n'est pas une ligne de transport.
    rendre({ url: "/analyses/ligne/colis" });
    const texte = await screen.findByText("Cette ligne n'existe pas ou n'est plus ouverte.");
    expect(texte.closest("[role='status']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifier la ligne" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux analyses" })).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "introuvable");
  });

  it("une panne du serveur (500) reste une erreur qu'on peut réessayer", async () => {
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ANALYSE_LIGNE.nom, () =>
        implementer(patron.OP_ANALYSE_LIGNE, () => {
          throw new ErreurHttp(500, "panne", "INTERNE");
        }),
      ),
    );
    rendre({ clientApi: client });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("n'appelle l'API que pour la ligne de l'adresse", async () => {
    const lire = vi.fn();
    const client = clientAnalyse((semaine, params) => {
      lire(params);
      return semaine;
    });
    rendre({ clientApi: client });
    await attendreEcran();
    expect(lire).toHaveBeenCalledWith({ ligneId: LIGNE, periode: "semaine" });
  });
});

describe("AnalysesLigne · textes", () => {
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

describe("AnalysesLigne · fonctions pures", () => {
  const serie = (valeurs: number[]) =>
    valeurs.map((recette, i) => ({ libelle: "LMMJVSD"[i] ?? `S${i}`, recette }));

  it("colore le remplissage face à la cible : atteinte vert, jusqu'à 20 points en dessous ambre, sinon rouge", () => {
    expect(tonRemplissage({ pct: 85, cible: 85 })).toBe("vert");
    expect(tonRemplissage({ pct: 90, cible: 85 })).toBe("vert");
    expect(tonRemplissage({ pct: 78, cible: 85 })).toBe("ambre");
    expect(tonRemplissage({ pct: 65, cible: 85 })).toBe("ambre");
    expect(tonRemplissage({ pct: 64, cible: 85 })).toBe("rouge");
  });

  it("colore une variation : rouge si elle baisse, vert si elle monte, neutre à zéro", () => {
    expect(tonVariation(-14)).toBe("rouge");
    expect(tonVariation(9)).toBe("vert");
    expect(tonVariation(0)).toBe("neutre");
  });

  it("met en couleur les jours que le commentaire cite : vert s'il monte face à la veille, rouge s'il baisse", () => {
    const barres = barresJours(
      serie([72, 88, 40, 66, 92, 100, 70]),
      "Le mardi monte, le mercredi s'effondre.",
    );
    expect(barres.map((b) => b.ton)).toEqual([
      "neutre",
      "vert",
      "rouge",
      "neutre",
      "neutre",
      "neutre",
      "neutre",
    ]);
    expect(barres.map((b) => b.hauteurPct)).toEqual([72, 88, 40, 66, 92, 100, 70]);
  });

  it("un autre commentaire, d'autres jours en couleur ; le lundi n'a pas de veille", () => {
    const valeurs = [10, 20, 30, 40, 20, 50, 5];
    expect(
      barresJours(serie(valeurs), "Le vendredi chute, le samedi repart.").map((b) => b.ton),
    ).toEqual(["neutre", "neutre", "neutre", "neutre", "rouge", "vert", "neutre"]);
    expect(barresJours(serie(valeurs), "Le lundi est calme.").map((b) => b.ton)).not.toContain(
      "vert",
    );
    // un jour cité dont la recette égale celle de la veille : rien à signaler
    expect(barresJours(serie([5, 5, 5, 5, 5, 5, 5]), "Le mardi monte.").map((b) => b.ton)).toEqual(
      Array(7).fill("neutre"),
    );
    // un mot qui contient un nom de jour n'est pas ce jour
    expect(barresJours(serie(valeurs), "Les mardistes montent.").map((b) => b.ton)).toEqual(
      Array(7).fill("neutre"),
    );
  });

  it("hors des sept jours (mois, trimestre), rien n'est mis en couleur ; une série vide ne casse rien", () => {
    expect(
      barresJours(serie([1, 2, 3, 4]), "Le mardi monte.").every((b) => b.ton === "neutre"),
    ).toBe(true);
    expect(barresJours([], "")).toEqual([]);
    expect(barresJours(serie([0, 0, 0]), "").map((b) => b.hauteurPct)).toEqual([0, 0, 0]);
  });
});
