import {
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
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
import { EXEMPLES_PARAMS, urlExemple, urlPlanche } from "@/coquille/planches";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { BusVue } from "./bus-vue";
import { etatDe } from "./etat";
import {
  duree,
  groupes,
  millions,
  millionsSansUnite,
  net,
  netTrajet,
  taux,
  variation,
} from "./formats";
import fr from "./i18n.fr.json";
import {
  barresNet,
  nombrePannes,
  separerAvis,
  suiteDesPassagers,
  tonNetBus,
  tonNetTrajet,
  tonTendance,
} from "./tons";
import { detailTrajet, quandTrajet } from "./trajets";
import type { AnalyseBus, EtatBus, TrajetBus } from "./types";

const planche = ecrans.AnalysesBus.donnees;
const URL_BUS = `/analyses/bus/${BUS_LT207.id}`;

type Impl = Scenario["operations"][number];

function rendre(clientApi?: ReturnType<typeof creerClientMock>, url = URL_BUS) {
  return rendreApp({
    fixtures: true,
    scenario: "AnalysesBus",
    url,
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("LT 207 AB · Nana");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Un client de démonstration dont on change le scénario (une lecture qui échoue, un autre bus). */
function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "AnalysesBus", latenceMs: 0 });
}

function remplacer(scenario: Scenario, nom: string, fabrique: (impl: Impl) => Impl): Scenario {
  return {
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom ? fabrique(impl) : impl,
    ),
  };
}

async function lireBus(impl: Impl, params: unknown, ctx: unknown): Promise<AnalyseBus> {
  return (await (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx)) as AnalyseBus;
}

/** Un client dont l'analyse du bus est celle de la démonstration, transformée. */
function clientAvecBus(transformer: (bus: AnalyseBus) => AnalyseBus) {
  return clientAvec((scenario) =>
    remplacer(scenario, patron.OP_ANALYSE_BUS.nom, (impl) =>
      implementer(patron.OP_ANALYSE_BUS, async (params, ctx) =>
        transformer(await lireBus(impl, params, ctx)),
      ),
    ),
  );
}

async function busDeDemo(): Promise<AnalyseBus> {
  const client = creerClientMock({ source: sourceScenariosFixtures(), scenario: "AnalysesBus" });
  return client.executer(patron.OP_ANALYSE_BUS, { busId: BUS_LT207.id });
}

function rendreVue(etat: EtatBus, bus?: AnalyseBus, reessayer?: () => void) {
  render(
    <I18nextProvider i18n={creerI18n("fr")}>
      <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
        <ConceptionProvider actif={false}>
          <BusVue etat={etat} bus={bus} {...(reessayer ? { onReessayer: reessayer } : {})} />
        </ConceptionProvider>
      </FournisseurApi>
    </I18nextProvider>,
  );
}

function rangees(): HTMLElement[] {
  const liste = screen.getByRole("region", { name: "Cette semaine · trajet par trajet" });
  return within(liste).getAllByRole("listitem");
}

describe("AnalysesBus · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : Retour, bus et chauffeur, modèle, année, trajets et pastille À SURVEILLER", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Coaster 30 places · 2019 · 5 trajets cette semaine")).toBeVisible();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Analyses · un bus en détail",
    );
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByText("À SURVEILLER")).toBeInTheDocument();
  });

  it("affiche les trois chiffres : recette, dépenses en rouge, net en rouge, avec leurs détails", async () => {
    rendre();
    await attendreEcran();
    const [recette, depenses, netTuile] = ["Recette", "Dépenses", "Net"].map((nom) =>
      screen.getByRole("group", { name: new RegExp(`^${nom}`) }),
    ) as [HTMLElement, HTMLElement, HTMLElement];
    expect(recette).toHaveTextContent("Recette3,1 M5 trajets · 71 %");
    expect(recette).toHaveAttribute("data-etat", "neutre");
    expect(depenses).toHaveTextContent("Dépenses2,5 Mcarburant 1,6 · pannes 0,7");
    expect(depenses).toHaveAttribute("data-etat", "rouge");
    expect(netTuile).toHaveTextContent("Net+ 0,6 Mflotte : + 2,1 M en moyenne");
    expect(netTuile).toHaveAttribute("data-etat", "rouge");
  });

  it("affiche le net par semaine : huit barres, S46 et S48 en rouge, S47 en ambre, la tendance en rouge", async () => {
    rendre();
    await attendreEcran();
    const carte = screen.getByRole("region", { name: "Net par semaine · 8 semaines" });
    const tendance = within(carte).getByText("− 62 % depuis la panne du 12 nov.");
    expect(tendance).toHaveAttribute("data-ton", "rouge");
    const barres = Array.from(carte.querySelectorAll("path[data-barre]"));
    expect(barres).toHaveLength(8);
    expect(barres.map((b) => b.getAttribute("data-accent"))).toEqual([
      null,
      null,
      null,
      null,
      null,
      "rouge",
      "ambre",
      "rouge",
    ]);
    expect(Array.from(carte.querySelectorAll("svg text")).map((t) => t.textContent)).toEqual(
      planche.netParSemaine.semaines,
    );
  });

  it("affiche les cinq trajets : quand, détail, net ; les pannes en rouge", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Cette semaine · trajet par trajet")).toBeInTheDocument();
    expect(screen.getByText("5 · 2 pannes")).toBeInTheDocument();
    const lignes = rangees();
    expect(lignes.map((l) => l.textContent)).toEqual(
      planche.trajets.liste.map((t) => `${t.quand}${t.detail}${t.net}`),
    );
    const etats = lignes.map((l) => [
      l.querySelector("[class*='detail']")?.getAttribute("data-incident"),
      l.querySelector("[class*='netTrajet']")?.getAttribute("data-ton"),
    ]);
    expect(etats).toEqual([
      [null, "vert"],
      ["oui", "rouge"],
      [null, "vert"],
      [null, "vert"],
      ["oui", "rouge"],
    ]);
  });

  it("affiche l'avis de l'assistant : la recommandation en gras", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
    const gras = screen.getByText(/^Je mettrais LT 207 au garage lundi/, { selector: "strong" });
    expect(gras).toHaveTextContent(
      "Je mettrais LT 207 au garage lundi et je passerais Nana sur LT 330 (8 trajets, 0 incident).",
    );
    const bloc = gras.parentElement as HTMLElement;
    expect(bloc).toHaveTextContent(planche.assistant.texte);
    expect(bloc.textContent?.replace(gras.textContent ?? "", "")).toMatch(
      /^Deux pannes en 10 jours .* chaque panne t'a coûté plus\. $/,
    );
  });

  it("affiche les deux actions du pied avec le texte de la planche", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Toute la flotte" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Demander à l'assistant révision lundi · qui remplace ?" }),
    ).toBeInTheDocument();
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
    expect(
      screen
        .getByRole("link", { name: /Demander à l'assistant/ })
        .querySelector("svg[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("garde des cibles tactiles d'au moins 44 px : retour et pied", async () => {
    rendre();
    await attendreEcran();
    const cibles = [
      screen.getByRole("link", { name: "Retour" }),
      screen.getByRole("link", { name: "Toute la flotte" }),
      screen.getByRole("link", { name: /Demander à l'assistant/ }),
    ];
    for (const cible of cibles) {
      const style = getComputedStyle(cible);
      const minimum = parseFloat(style.minHeight) || parseFloat(style.height);
      expect(minimum, `${cible.className} ${cible.textContent ?? ""}`).toBeGreaterThanOrEqual(44);
    }
  });

  it("le pied n'a pas de barre d'onglets et aucun lien vide", async () => {
    rendre();
    await attendreEcran();
    expect(screen.queryByRole("navigation", { name: "Navigation patron" })).not.toBeInTheDocument();
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^\/[a-z]/);
    }
  });
});

describe("AnalysesBus · navigation identique à la maquette", () => {
  it("« Retour » mène à Analyses", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/analyses");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/analyses"));
  });

  it("« Toute la flotte » mène à Analyses", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: "Toute la flotte" });
    expect(lien).toHaveAttribute("href", "/analyses");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/analyses"));
  });

  it("« Demander à l'assistant » mène à l'assistant", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: /Demander à l'assistant/ });
    expect(lien).toHaveAttribute("href", "/assistant");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant"));
  });

  it("l'écran Analyses mène à ce détail : la route est celle de la liste « Par bus »", () => {
    expect(urlPlanche("AnalysesBus", { busId: BUS_LT207.id })).toBe(URL_BUS);
  });

  it("l'identifiant d'exemple de la route est un bus des données de démonstration", async () => {
    expect(EXEMPLES_PARAMS["busId"]).toBe(BUS_LT207.id);
    expect(urlExemple("AnalysesBus")).toBe(URL_BUS);
    // et la démonstration le connaît : l'écran se remplit avec cet identifiant
    rendre(undefined, urlExemple("AnalysesBus"));
    expect(await attendreEcran()).toBeInTheDocument();
  });
});

describe("AnalysesBus · états chargement, vide, introuvable et erreur", () => {
  it("chargement : mêmes blocs et mêmes titres, aucune donnée, retour et pied utilisables", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(principal()).toHaveAccessibleName("Chargement de l’analyse du bus");
    expect(screen.getByText("Recette")).toBeInTheDocument();
    expect(screen.getByText("Net par semaine · 8 semaines")).toBeInTheDocument();
    expect(screen.getByText("Cette semaine · trajet par trajet")).toBeInTheDocument();
    expect(screen.queryByText("3,1 M")).not.toBeInTheDocument();
    expect(screen.queryByText("À SURVEILLER")).not.toBeInTheDocument();
    expect(screen.queryByText("L'assistant")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/analyses");
    expect(screen.getByRole("link", { name: "Toute la flotte" })).toHaveAttribute(
      "href",
      "/analyses",
    );
    // le détail de l'assistant dépend du bus : sans lui, on ne promet pas « révision lundi »
    expect(screen.getByRole("link", { name: "Demander à l'assistant" })).toBeInTheDocument();
  });

  it("chargement dans l'application : la lecture n'a pas répondu, les squelettes sont là", async () => {
    let debloquer: () => void = () => {};
    const attente = new Promise<void>((resolve) => {
      debloquer = resolve;
    });
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ANALYSE_BUS.nom, (impl) =>
        implementer(patron.OP_ANALYSE_BUS, async (params, ctx) => {
          await attente;
          return lireBus(impl, params, ctx);
        }),
      ),
    );
    rendre(client);
    await waitFor(() => expect(principal()).toHaveAttribute("aria-busy", "true"));
    expect(screen.queryByText("LT 207 AB · Nana")).not.toBeInTheDocument();
    debloquer();
    expect(await attendreEcran()).toBeInTheDocument();
    expect(principal()).toHaveAttribute("aria-busy", "false");
  });

  it("bus inconnu : « introuvable », sans bouton Réessayer, en-tête et pied intacts", async () => {
    rendre(undefined, "/analyses/bus/bus-inconnu");
    await screen.findByText("Ce bus est introuvable.");
    expect(within(principal()).getByRole("status")).toHaveTextContent("Ce bus est introuvable.");
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Net par semaine · 8 semaines")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Toute la flotte" })).toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis l'écran quand la lecture réussit", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      remplacer(scenario, patron.OP_ANALYSE_BUS.nom, (impl) =>
        implementer(patron.OP_ANALYSE_BUS, async (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return lireBus(impl, params, ctx);
        }),
      ),
    );
    rendre(client);
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("L’analyse du bus ne s’est pas chargée.");
    expect(screen.queryByText("Net par semaine · 8 semaines")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Toute la flotte" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("5 · 2 pannes")).toBeInTheDocument();
  });

  it("erreur : le bouton Réessayer relance la lecture (vue seule)", async () => {
    let relances = 0;
    rendreVue("erreur", undefined, () => {
      relances += 1;
    });
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(relances).toBe(1);
  });

  it("vide : un bus qui n'a pas roulé garde son en-tête et dit pourquoi, sans bloc de chiffres", async () => {
    const calme = clientAvecBus((bus) => ({
      ...bus,
      statut: "ok",
      trajetsSemaine: 0,
      recette: { total: 0, trajets: 0, remplissagePct: 0 },
      depenses: { total: 0, carburant: 0, pannes: 0 },
      net: 0,
      trajets: [],
    }));
    rendre(calme);
    await screen.findByText("Ce bus n’a pas roulé cette semaine.");
    expect(within(principal()).getByRole("status")).toHaveTextContent(
      "Ce bus n’a pas roulé cette semaine.",
    );
    expect(screen.getByText("LT 207 AB · Nana")).toBeInTheDocument();
    expect(
      screen.getByText("Coaster 30 places · 2019 · 0 trajet cette semaine"),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    expect(screen.queryByText("Cette semaine · trajet par trajet")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Toute la flotte" })).toBeInTheDocument();
  });

  it("un bus sans trajet mais avec de la recette le dit dans la liste, le reste reste affiché", async () => {
    const bus: AnalyseBus = { ...(await busDeDemo()), trajets: [] };
    rendreVue("pret", bus);
    expect(screen.getByText("3,1 M")).toBeInTheDocument();
    expect(screen.getByText("Aucun trajet cette semaine.")).toBeInTheDocument();
    expect(screen.getByText("0 · 0 panne")).toBeInTheDocument();
  });

  it("l'état dépend de la lecture : donnée, 404, autre erreur, attente", async () => {
    const bus = await busDeDemo();
    const base = { data: undefined, error: null, isError: false, isPending: false };
    expect(etatDe({ ...base, data: bus })).toBe("pret");
    expect(
      etatDe({ ...base, data: { ...bus, trajets: [], recette: { ...bus.recette, total: 0 } } }),
    ).toBe("vide");
    expect(etatDe({ ...base, isPending: true })).toBe("chargement");
    expect(etatDe({ ...base, isError: true, error: new ErreurReseau("coupure") })).toBe("erreur");
    const { ErreurHttp } = await import("@afrimove/api-client");
    expect(
      etatDe({ ...base, isError: true, error: new ErreurHttp(404, "inconnu", "BUS_INCONNU") }),
    ).toBe("introuvable");
    expect(etatDe(base)).toBe("introuvable");
  });
});

describe("AnalysesBus · autres bus que celui de la planche", () => {
  it("un bus sans alerte : pas de pastille, net en vert, pas de « révision lundi »", async () => {
    const bus: AnalyseBus = { ...(await busDeDemo()), statut: "ok", net: 2_800_000 };
    rendreVue("pret", bus);
    expect(screen.queryByText("À SURVEILLER")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^Net/ })).toHaveAttribute("data-etat", "vert");
    expect(screen.getByText("+ 2,8 M")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Demander à l'assistant" })).toBeInTheDocument();
    expect(screen.queryByText("révision lundi · qui remplace ?")).not.toBeInTheDocument();
  });

  it("un net négatif est en rouge avec un vrai signe moins", async () => {
    const bus: AnalyseBus = { ...(await busDeDemo()), statut: "ok", net: -300_000 };
    rendreVue("pret", bus);
    expect(screen.getByRole("group", { name: /^Net/ })).toHaveAttribute("data-etat", "rouge");
    expect(screen.getByText("− 0,3 M")).toBeInTheDocument();
  });

  it("une tendance à la hausse est en vert ; sans événement, la tendance est seule", async () => {
    const demo = await busDeDemo();
    const bus: AnalyseBus = {
      ...demo,
      netParSemaine: { ...demo.netParSemaine, variationPct: 12, depuis: null },
    };
    rendreVue("pret", bus);
    const tendance = screen.getByText("+ 12 %");
    expect(tendance).toHaveAttribute("data-ton", "vert");
    expect(screen.queryByText(/depuis la/)).not.toBeInTheDocument();
  });

  it("une série vide ne dessine pas de graphique mais garde la carte", async () => {
    const demo = await busDeDemo();
    const bus: AnalyseBus = { ...demo, netParSemaine: { ...demo.netParSemaine, serie: [] } };
    rendreVue("pret", bus);
    const carte = screen.getByRole("region", { name: "Net par semaine · 0 semaines" });
    expect(carte.querySelector("svg")).toBeNull();
  });

  it("un seul trajet et une seule panne : le texte passe au singulier", async () => {
    const demo = await busDeDemo();
    const bus: AnalyseBus = {
      ...demo,
      trajetsSemaine: 1,
      recette: { ...demo.recette, trajets: 1 },
      trajets: [demo.trajets[1]!],
    };
    rendreVue("pret", bus);
    expect(screen.getByText("1 · 1 panne")).toBeInTheDocument();
    expect(
      screen.getByText("Coaster 30 places · 2019 · 1 trajet cette semaine"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 trajet · 71 %")).toBeInTheDocument();
  });

  it("sans avis de l'assistant, le bloc n'est pas affiché", async () => {
    const bus: AnalyseBus = { ...(await busDeDemo()), avisAssistant: "  " };
    rendreVue("pret", bus);
    expect(screen.queryByText("L'assistant")).not.toBeInTheDocument();
  });

  it("un avis d'une seule phrase reste en texte normal", async () => {
    const bus: AnalyseBus = { ...(await busDeDemo()), avisAssistant: "Rien à signaler." };
    rendreVue("pret", bus);
    expect(screen.getByText("Rien à signaler.")).toBeInTheDocument();
    expect(document.querySelector("strong")).toBeNull();
  });
});

describe("AnalysesBus · textes", () => {
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

describe("AnalysesBus · fonctions pures", () => {
  it("écrit les montants comme la planche : millions, milliers, net signé", () => {
    expect(millions(3_100_000)).toBe("3,1 M");
    expect(millions(2_500_000)).toBe("2,5 M");
    expect(millions(61_000)).toBe("61 k");
    expect(millions(-300_000)).toBe("− 0,3 M");
    expect(millionsSansUnite(1_600_000)).toBe("1,6");
    expect(millionsSansUnite(700_000)).toBe("0,7");
    expect(net(600_000)).toBe("+ 0,6 M");
    expect(net(-300_000)).toBe("− 0,3 M");
    expect(net(0)).toBe("0");
    expect(netTrajet(61_000)).toBe("+ 61 k");
    expect(netTrajet(-310_000)).toBe("− 310 k");
    expect(netTrajet(-45_000)).toBe("− 45 k");
    expect(netTrajet(1_250_000)).toBe("+ 1,3 M");
    expect(netTrajet(0)).toBe("0");
    expect(netTrajet(-500)).toBe("− 500");
  });

  it("écrit la variation, le taux, les groupes de chiffres et les durées", () => {
    expect(variation(-62)).toBe("− 62 %");
    expect(variation(5)).toBe("+ 5 %");
    expect(variation(0.5)).toBe("+ 0,5 %");
    expect(variation(0)).toBe("0 %");
    expect(taux(71)).toBe("71");
    expect(taux(71.46)).toBe("71,5");
    expect(groupes(98_000)).toBe("98 000");
    expect(groupes(66_500)).toBe("66 500");
    expect(groupes(950)).toBe("950");
    expect(duree(130)).toBe("2 h 10");
    expect(duree(125)).toBe("2 h 05");
    expect(duree(120)).toBe("2 h");
    expect(duree(40)).toBe("40 min");
    expect(duree(25)).toBe("25 min");
    expect(duree(0)).toBe("0 min");
  });

  it("colore le net : rouge si le bus est à surveiller ou perd de l'argent, vert sinon", () => {
    expect(tonNetBus({ statut: "a_surveiller", net: 600_000 })).toBe("rouge");
    expect(tonNetBus({ statut: "ok", net: -1 })).toBe("rouge");
    expect(tonNetBus({ statut: "ok", net: 0 })).toBe("vert");
    expect(tonNetBus({ statut: "ok", net: 2_800_000 })).toBe("vert");
    expect(tonNetTrajet({ net: 22_000 })).toBe("vert");
    expect(tonNetTrajet({ net: -45_000 })).toBe("rouge");
    expect(tonNetTrajet({ net: 0 })).toBe("neutre");
    expect(tonTendance(-62)).toBe("rouge");
    expect(tonTendance(3)).toBe("vert");
    expect(tonTendance(0)).toBe("neutre");
  });

  it("colore les barres du net : rouge sous la moitié de la meilleure semaine, ambre sous les trois quarts", () => {
    const serie = [100, 90, 75, 74, 50, 49, 0].map((n, i) => ({ libelle: `S${i}`, net: n }));
    expect(barresNet(serie).map((b) => b.accent)).toEqual([
      undefined,
      undefined,
      undefined,
      "ambre",
      "ambre",
      "rouge",
      "rouge",
    ]);
    expect(barresNet(serie)[0]).toMatchObject({
      etiquette: "S0",
      valeur: 100,
      valeurAffichee: "+ 100",
    });
    // sans semaine positive, rien n'est comparable : aucune barre n'est mise en avant
    expect(barresNet([{ libelle: "S1", net: -10 }]).map((b) => b.accent)).toEqual([undefined]);
    expect(barresNet([])).toEqual([]);
  });

  it("déduit si les passagers sont replacés (panne en route) ou gardés (panne au départ)", () => {
    expect(suiteDesPassagers({ description: "panne embrayage à Mbouda" })).toBe("replaces");
    expect(suiteDesPassagers({ description: "panne batterie au départ" })).toBe("gardes");
    expect(suiteDesPassagers({ description: "crevaison avant le départ" })).toBe("gardes");
    expect(suiteDesPassagers({ description: "panne de freins" })).toBe("replaces");
  });

  it("sépare l'avis : la dernière phrase est la recommandation", () => {
    expect(separerAvis("Un. Deux. Trois.")).toEqual({
      debut: "Un. Deux. ",
      recommandation: "Trois.",
    });
    expect(separerAvis("Seule phrase.")).toEqual({ debut: "Seule phrase.", recommandation: "" });
    expect(separerAvis("  Un. Deux.  ")).toEqual({ debut: "Un. ", recommandation: "Deux." });
    expect(separerAvis("")).toEqual({ debut: "", recommandation: "" });
  });

  it("compte les pannes, pas les autres incidents", () => {
    const incident = (nature: "panne" | "autre") =>
      ({ nature, description: "x", dureeMinutes: null }) as const;
    expect(nombrePannes([{ incident: incident("panne") }, { incident: incident("autre") }])).toBe(
      1,
    );
    expect(nombrePannes([{ incident: null }])).toBe(0);
    expect(nombrePannes([])).toBe(0);
  });
});

describe("AnalysesBus · le détail d'un trajet", () => {
  const t = creerI18n("fr").getFixedT(null, "AnalysesBus");
  const trajet = (partiel: Partial<TrajetBus>): TrajetBus => ({
    jour: "lun",
    heure: "06:00",
    origine: "Douala",
    destination: "Bafoussam",
    passagers: { remplis: 28, capacite: 30 },
    recette: 98_000,
    retardMinutes: 0,
    incident: null,
    net: 61_000,
    ...partiel,
  });

  it("trajet sans incident : passagers, recette, ponctualité", () => {
    expect(detailTrajet(t, trajet({}))).toEqual({
      texte: "28 / 30 · 98 000 · à l’heure",
      incident: false,
    });
    expect(
      detailTrajet(
        t,
        trajet({ retardMinutes: 25, recette: 66_500, passagers: { remplis: 19, capacite: 30 } }),
      ),
    ).toEqual({ texte: "19 / 30 · 66 500 · retard 25 min", incident: false });
    expect(detailTrajet(t, trajet({ retardMinutes: 90 })).texte).toBe(
      "28 / 30 · 98 000 · retard 1 h 30",
    );
  });

  it("trajet avec incident : l'incident, sa durée, les passagers replacés ou gardés", () => {
    const panne = (description: string, dureeMinutes: number | null) => ({
      nature: "panne" as const,
      description,
      dureeMinutes,
    });
    expect(
      detailTrajet(
        t,
        trajet({
          incident: panne("panne embrayage à Mbouda", 130),
          passagers: { remplis: 30, capacite: 30 },
          recette: null,
          retardMinutes: null,
        }),
      ),
    ).toEqual({ texte: "panne embrayage à Mbouda · 2 h 10 · 30 replacés", incident: true });
    expect(
      detailTrajet(
        t,
        trajet({
          incident: panne("panne batterie au départ", 40),
          passagers: { remplis: 30, capacite: 30 },
        }),
      ).texte,
    ).toBe("panne batterie au départ · 40 min · 30 gardés");
  });

  it("un morceau que l'API ne donne pas est omis, sans double séparateur", () => {
    expect(
      detailTrajet(t, trajet({ passagers: null, recette: null, retardMinutes: null })).texte,
    ).toBe("");
    expect(detailTrajet(t, trajet({ recette: null, retardMinutes: null })).texte).toBe("28 / 30");
    expect(
      detailTrajet(
        t,
        trajet({
          incident: { nature: "autre", description: "pneu crevé", dureeMinutes: null },
          passagers: null,
        }),
      ).texte,
    ).toBe("pneu crevé");
  });

  it("« Lun 06:00 · Douala → Bafoussam »", () => {
    expect(quandTrajet(t, trajet({}))).toBe("Lun 06:00 · Douala → Bafoussam");
    expect(
      quandTrajet(t, trajet({ jour: "dim", heure: "14:00", origine: "A", destination: "B" })),
    ).toBe("Dim 14:00 · A → B");
  });
});
