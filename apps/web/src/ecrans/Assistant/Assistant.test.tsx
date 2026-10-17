import {
  ErreurHttp,
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ConceptionProvider } from "@afrimove/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { AssistantVue, type EtatAssistant } from "./assistant-vue";
import { destinationAction } from "./destinations";
import { barres, gainMensuel } from "./formats";
import fr from "./i18n.fr.json";
import type { Insights } from "./types";

/** Ce que l'API renvoie pour la planche (mêmes valeurs que `planches.test.tsx` de l'api-client). */
const INSIGHTS: Insights = {
  fuites: [
    {
      id: "fuite-guichet-2",
      periodeJours: 10,
      constat: "Guichet 2 d'Akwa : 3 écarts négatifs, toujours le mardi, toujours Joseph.",
      explication:
        "Total − 4 500. Petit, mais régulier. Les mardis, le 05:30 Yaoundé est en mode cadence et 11 billets ont été vendus sans numéro de téléphone.",
      montantTotal: -4500,
      joursConcernes: [2, 8, 10],
      actions: [
        {
          id: "controle-inopine-mardi",
          libelle: "Contrôle inopiné mardi",
          type: "controle_inopine",
        },
        {
          id: "cadence-numero-obligatoire",
          libelle: "Numéro obligatoire en cadence",
          type: "regle_cadence_numero",
        },
      ],
    },
  ],
  gains: [
    {
      id: "gain-decaler-1000",
      constat: "Oméga te prend 40 clients par jour sur le 09:30. Décale ton 10:00 à 09:15.",
      simulation: {
        scenarios: [
          { libelle: "aujourd'hui", remplis: 24, capacite: 40 },
          { libelle: "à 09:15", remplis: 37, capacite: 40 },
        ],
        gainMensuel: 1_500_000,
      },
      base: "Basé sur 30 jours de ventes des deux compagnies, en données anonymes du réseau. Tes voyageurs partent plus tôt le matin.",
      action: {
        id: "decaler-1000-0915",
        libelle: "Décaler le 10:00 à 09:15 dès lundi",
        type: "decaler_depart",
      },
    },
  ],
  questionsSuggerees: [
    "Pourquoi Bafoussam baisse ?",
    "Quel bus coûte le plus ?",
    "Prévision de samedi",
  ],
};

type Impl = Scenario["operations"][number];

interface Journal {
  insights: number;
  questions: string[];
  propositions: number;
}

/** Client mock dont l'assistant répond comme demandé ; le journal compte les appels (lectures et écritures). */
function clientAssistant(
  options: {
    insights?: Insights | ((appel: number) => Insights);
    question?: (question: string) => void;
  } = {},
  journal: Journal = { insights: 0, questions: [], propositions: 0 },
): ClientApi {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      const impls: Impl[] = [
        implementer(patron.OP_INSIGHTS, () => {
          journal.insights += 1;
          const i = options.insights ?? INSIGHTS;
          return typeof i === "function" ? i(journal.insights) : i;
        }),
        implementer(patron.OP_QUESTION_ASSISTANT, ({ question }) => {
          journal.questions.push(question);
          options.question?.(question);
          return {
            question,
            repondueA: "2027-01-05T07:38:00.000+01:00",
            dureeSecondes: 3,
            resume: "Réponse de test.",
            points: [],
            actions: [],
            sources: null,
            simulation: null,
          };
        }),
        implementer(patron.OP_APPLIQUER_PROPOSITION, () => {
          journal.propositions += 1;
          throw new Error("Une action de l'assistant ne doit jamais appliquer un réglage");
        }),
      ];
      return { ...scenario, operations: [...impls, ...scenario.operations] };
    },
  };
  return creerClientMock({ source, scenario: "Assistant", latenceMs: 0 });
}

function rendre(clientApi?: ClientApi) {
  return rendreApp({
    fixtures: true,
    scenario: "Assistant",
    url: "/assistant",
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText(INSIGHTS.fuites[0]!.constat);
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** La carte « Argent qui fuit » ou « Argent à gagner ». */
function carte(nom: "fuite" | "gain"): HTMLElement {
  return principal().querySelector(`[data-carte="${nom}"]`) as HTMLElement;
}

describe("Assistant · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, « L'assistant » et sa phrase, l'étincelle", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("L'assistant du patron");
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
    expect(
      screen.getByText("Il lit tes chiffres, il explique, il propose. Tu décides."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("carte 1 « Argent qui fuit » : période, constat, explication et deux actions", async () => {
    rendre();
    await attendreEcran();
    const c = within(carte("fuite"));
    expect(c.getByText("1 · Argent qui fuit")).toBeInTheDocument();
    expect(c.getByText("10 derniers jours")).toBeInTheDocument();
    expect(c.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Guichet 2 d'Akwa : 3 écarts négatifs, toujours le mardi, toujours Joseph.",
    );
    expect(
      c.getByText(/^Total − 4 500\. Petit, mais régulier\. Les mardis, le 05:30 Yaoundé/),
    ).toHaveTextContent("11 billets ont été vendus sans numéro de téléphone.");
    expect(c.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Contrôle inopiné mardi",
      "Numéro obligatoire en cadence",
    ]);
  });

  it("une barre par jour de la période : les jours 2, 8 et 10 (écarts négatifs) sont en ambre", async () => {
    rendre();
    await attendreEcran();
    const lesBarres = [...carte("fuite").querySelectorAll("[data-concerne]")];
    expect(lesBarres).toHaveLength(10);
    expect(
      lesBarres.flatMap((b, i) => (b.getAttribute("data-concerne") === "true" ? [i + 1] : [])),
    ).toEqual([2, 8, 10]);
  });

  it("carte 2 « Argent à gagner » : simulation avant / après, gain par mois, base et action", async () => {
    rendre();
    await attendreEcran();
    const c = within(carte("gain"));
    expect(c.getByText("2 · Argent à gagner")).toBeInTheDocument();
    expect(c.getByText("simulation")).toBeInTheDocument();
    expect(c.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Oméga te prend 40 clients par jour sur le 09:30. Décale ton 10:00 à 09:15.",
    );
    for (const [libelle, valeur, ton] of [
      ["aujourd'hui", "24/40", "neutre"],
      ["à 09:15", "37/40", "vert"],
      ["par mois", "+ 1,5 M", "neutre"],
    ] as const) {
      const tuile = c.getByText(libelle).parentElement as HTMLElement;
      expect(tuile).toHaveAttribute("data-ton", ton);
      expect(tuile).toHaveTextContent(`${libelle}${valeur}`);
    }
    expect(c.getByText(/^Basé sur 30 jours de ventes des deux compagnies/)).toHaveTextContent(
      "Tes voyageurs partent plus tôt le matin.",
    );
    expect(c.getByRole("link")).toHaveTextContent("Décaler le 10:00 à 09:15 dès lundi");
  });

  it("propose les trois questions suggérées et la zone de saisie texte / vocal", async () => {
    rendre();
    await attendreEcran();
    for (const question of [
      "Pourquoi Bafoussam baisse ?",
      "Quel bus coûte le plus ?",
      "Prévision de samedi",
    ]) {
      expect(screen.getByRole("link", { name: question })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("textbox", { name: "Demande en français, en vocal aussi…" }),
    ).toHaveAttribute("placeholder", "Demande en français, en vocal aussi…");
    expect(screen.getByRole("link", { name: "Parler" })).toBeInTheDocument();
  });

  it("suit la navigation de la planche, lien par lien", async () => {
    rendre();
    await attendreEcran();
    const href = (nom: string) => screen.getByRole("link", { name: nom }).getAttribute("href");
    expect(href("Retour")).toBe("/aujourdhui");
    expect(href("Contrôle inopiné mardi")).toBe("/inopine");
    expect(href("Numéro obligatoire en cadence")).toBe("/reglages");
    expect(href("Décaler le 10:00 à 09:15 dès lundi")).toBe("/reglages");
    expect(href("Pourquoi Bafoussam baisse ?")).toBe("/assistant/reponse");
    expect(href("Quel bus coûte le plus ?")).toBe("/assistant/reponse");
    expect(href("Prévision de samedi")).toBe("/assistant/reponse");
    expect(href("Parler")).toBe("/assistant/reponse");
    // huit liens, aucun bouton : rien n'est grisé ni « bientôt »
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Assistant · les actions ouvrent un réglage, elles n'en modifient jamais un", () => {
  let annuler: (e: Event) => void;
  beforeEach(() => {
    // jsdom ne navigue pas : on retient le clic pour qu'il n'aille pas plus loin que le lien.
    annuler = (e) => e.preventDefault();
    document.addEventListener("click", annuler);
  });
  afterEach(() => document.removeEventListener("click", annuler));

  it("toucher les trois actions n'appelle ni la proposition ni la question", async () => {
    const journal: Journal = { insights: 0, questions: [], propositions: 0 };
    rendre(clientAssistant({}, journal));
    await attendreEcran();
    for (const nom of [
      "Contrôle inopiné mardi",
      "Numéro obligatoire en cadence",
      "Décaler le 10:00 à 09:15 dès lundi",
    ]) {
      await userEvent.click(screen.getByRole("link", { name: nom }));
    }
    expect(journal.propositions).toBe(0);
    expect(journal.questions).toEqual([]);
    expect(journal.insights).toBe(1);
  });

  it("chaque type d'action mène à son écran de réglage", () => {
    expect(destinationAction("controle_inopine")).toBe("/inopine");
    expect(destinationAction("regle_cadence_numero")).toBe("/reglages");
    expect(destinationAction("decaler_depart")).toBe("/reglages");
    expect(destinationAction("ajouter_depart")).toBe("/reglages");
    expect(destinationAction("voir_ligne")).toBe("/analyses");
  });
});

describe("Assistant · poser une question", () => {
  it("une question suggérée est posée à l'assistant, puis la réponse s'ouvre", async () => {
    const journal: Journal = { insights: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Quel bus coûte le plus ?" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant/reponse"));
    expect(journal.questions).toEqual(["Quel bus coûte le plus ?"]);
    expect(journal.propositions).toBe(0);
  });

  it("la saisie : la question écrite est envoyée (sans espaces autour), puis la réponse s'ouvre", async () => {
    const journal: Journal = { insights: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Demande en français, en vocal aussi…" }),
      "  Combien ce mois ?  {Enter}",
    );
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant/reponse"));
    expect(journal.questions).toEqual(["Combien ce mois ?"]);
  });

  it("une saisie vide ou faite d'espaces n'envoie rien et reste sur l'écran", async () => {
    const journal: Journal = { insights: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    const champ = screen.getByRole("textbox", { name: "Demande en français, en vocal aussi…" });
    await userEvent.type(champ, "{Enter}");
    await userEvent.type(champ, "   {Enter}");
    expect(journal.questions).toEqual([]);
    expect(routeur.state.location.pathname).toBe("/assistant");
  });

  it("la question n'est pas partie : le dit, reste sur l'écran, puis repart au second essai", async () => {
    let essais = 0;
    const journal: Journal = { insights: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(
      clientAssistant(
        {
          question: () => {
            essais += 1;
            if (essais === 1) throw new ErreurReseau("coupure");
          },
        },
        journal,
      ),
    );
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Prévision de samedi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(fr.etats.envoi);
    expect(routeur.state.location.pathname).toBe("/assistant");
    // les cartes restent là
    expect(screen.getByText(INSIGHTS.fuites[0]!.constat)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Prévision de samedi" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant/reponse"));
    expect(journal.questions).toEqual(["Prévision de samedi", "Prévision de samedi"]);
  });

  it("« Parler » ouvre l'écran de réponse sans rien envoyer", async () => {
    const journal: Journal = { insights: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Parler" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant/reponse"));
    expect(journal.questions).toEqual([]);
  });
});

describe("Assistant · ce que dit l'API, rien de plus", () => {
  const AUTRE: Insights = {
    fuites: [
      {
        id: "f1",
        periodeJours: 1,
        constat: "Guichet 1 de Mvan : un écart.",
        explication: "Total − 500.",
        montantTotal: -500,
        joursConcernes: [1],
        actions: [{ id: "a1", libelle: "Voir la ligne en détail", type: "voir_ligne" }],
      },
      {
        id: "f2",
        periodeJours: 7,
        constat: "Quai de Bafoussam : retards.",
        explication: "Trois retards.",
        montantTotal: null,
        joursConcernes: [],
        actions: [],
      },
    ],
    gains: [
      {
        id: "g1",
        constat: "Ajoute un départ le mardi.",
        simulation: { scenarios: [], gainMensuel: -310_000 },
        base: "Basé sur 15 jours.",
        action: { id: "a2", libelle: "Ajouter un départ mardi 17:00", type: "ajouter_depart" },
      },
    ],
    questionsSuggerees: [],
  };

  it("autres cartes, autres chiffres : numérotées dans l'ordre, une seule action sans souci", async () => {
    rendre(clientAssistant({ insights: AUTRE }));
    await screen.findByText("Guichet 1 de Mvan : un écart.");
    expect(screen.getByText("1 · Argent qui fuit")).toBeInTheDocument();
    expect(screen.getByText("2 · Argent qui fuit")).toBeInTheDocument();
    expect(screen.getByText("3 · Argent à gagner")).toBeInTheDocument();
    expect(screen.getByText("1 dernier jour")).toBeInTheDocument();
    expect(screen.getByText("7 derniers jours")).toBeInTheDocument();
    // l'ancienne carte n'est plus là
    expect(screen.queryByText(/Akwa/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la ligne en détail" })).toHaveAttribute(
      "href",
      "/analyses",
    );
    expect(screen.getByRole("link", { name: "Ajouter un départ mardi 17:00" })).toHaveAttribute(
      "href",
      "/reglages",
    );
    // une fuite sans action : pas de rangée d'actions ; sans question suggérée : pas de questions
    const cartes = [...principal().querySelectorAll('[data-carte="fuite"]')];
    expect(within(cartes[1] as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Pourquoi Bafoussam baisse ?" }),
    ).not.toBeInTheDocument();
    // la simulation sans scénario ne montre que le gain par mois, ici une perte
    const mois = within(carte("gain")).getByText("− 310 k");
    expect(mois).toHaveAttribute("data-signe", "perte");
    expect(within(carte("gain")).queryByText("aujourd'hui")).not.toBeInTheDocument();
    // le jour 1 de la période de 1 jour est ambre, les 7 jours sans jour concerné sont gris
    expect(cartes[0]!.querySelectorAll('[data-concerne="true"]')).toHaveLength(1);
    expect(cartes[1]!.querySelectorAll('[data-concerne="false"]')).toHaveLength(7);
    expect(cartes[1]!.querySelectorAll('[data-concerne="true"]')).toHaveLength(0);
  });

  it("ne montre que les champs d'affichage : le montant total reste dans le texte de l'API", async () => {
    rendre(clientAssistant({ insights: AUTRE }));
    await screen.findByText("Guichet 1 de Mvan : un écart.");
    // `montantTotal` n'est pas écrit par l'écran (ce serait un second « Total ») : seul l'explication de l'API est lue
    expect(screen.getAllByText(/Total/)).toHaveLength(1);
  });
});

describe("Assistant · états chargement, vide et erreur", () => {
  function rendreVue(
    etat: EtatAssistant,
    extra: { insights?: Insights; reessayer?: () => void } = {},
  ) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <MemoryRouter>
              <AssistantVue
                etat={etat}
                insights={extra.insights}
                {...(extra.reessayer ? { onReessayer: extra.reessayer } : {})}
              />
            </MemoryRouter>
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  it("chargement : la mise en page est là, aucun texte de donnée", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Chargement de l'assistant")).toBeInTheDocument();
    expect(screen.queryByText(/Argent/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    // l'en-tête et la zone de saisie restent
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parler" })).toBeInTheDocument();
  });

  it("vide : un message dans le style nuit, les questions suggérées restent", () => {
    rendreVue("vide", {
      insights: { fuites: [], gains: [], questionsSuggerees: ["Prévision de samedi"] },
    });
    expect(screen.getByRole("status")).toHaveTextContent(fr.etats.vide);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prévision de samedi" })).toBeInTheDocument();
  });

  it("vide : sans constat ni simulation côté API, l'écran le dit", async () => {
    rendre(clientAssistant({ insights: { fuites: [], gains: [], questionsSuggerees: [] } }));
    expect(await screen.findByText(fr.etats.vide)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis les cartes", async () => {
    rendre(
      clientAssistant({
        insights: (appel) => {
          if (appel === 1) throw new ErreurHttp(500, "panne", "PANNE");
          return INSIGHTS;
        },
      }),
    );
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(fr.etats.erreur);
    expect(screen.queryByText(INSIGHTS.fuites[0]!.constat)).not.toBeInTheDocument();
    // la navigation reste utilisable
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("erreur en vue seule : le bouton Réessayer appelle onReessayer", async () => {
    let relances = 0;
    rendreVue("erreur", { reessayer: () => (relances += 1) });
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(relances).toBe(1);
  });
});

describe("Assistant · formats", () => {
  it("gain par mois : millions, milliers ou francs, avec le vrai signe moins", () => {
    expect(gainMensuel(1_500_000)).toBe("+ 1,5 M");
    expect(gainMensuel(2_610_000)).toBe("+ 2,61 M");
    expect(gainMensuel(131_000)).toBe("+ 131 k");
    expect(gainMensuel(612_500)).toBe("+ 612,5 k");
    expect(gainMensuel(-310_000)).toBe("− 310 k");
    expect(gainMensuel(950)).toBe("+ 950 F");
    expect(gainMensuel(0)).toBe("0 F");
  });

  it("barres : une par jour, celles des jours concernés (1 = le plus ancien) en ambre", () => {
    expect(barres(5, [1, 5]).map((b) => b.concerne)).toEqual([true, false, false, false, true]);
    expect(barres(3, [9, 0])).toEqual([
      { concerne: false },
      { concerne: false },
      { concerne: false },
    ]);
    expect(barres(0, [1])).toEqual([]);
  });
});
