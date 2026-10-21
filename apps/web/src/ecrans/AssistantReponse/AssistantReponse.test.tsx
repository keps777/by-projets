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
import { destinationAction, ligneConcernee } from "./destinations";
import { gainSimule, numeroter } from "./formats";
import fr from "./i18n.fr.json";
import { ReponseVue, type EtatReponse } from "./reponse-vue";
import type { Conversation, Echange } from "./types";

/** Ce que l'API renvoie pour la planche (mêmes valeurs que `planches.test.tsx` de l'api-client). */
const DIAGNOSTIC: Echange = {
  question: "Pourquoi Bafoussam baisse ?",
  repondueA: "2027-01-05T07:38:00.000+01:00",
  dureeSecondes: 4,
  resume:
    "Bafoussam fait − 14 % sur deux semaines. Ce n'est pas la demande, c'est le mercredi et le 10:00.",
  points: [
    "1. Les deux mercredis sont à 42 % de remplissage : le marché de Bafoussam a changé de jour, les commerçantes montent le mardi soir maintenant.",
    "2. Le 10:00 Douala → Bafoussam part à 55 % depuis qu'Oméga a mis un 09:30 à 3 500 (500 de moins).",
    "3. Les colis, eux, montent : + 9 %. La ligne n'est pas malade, l'horaire l'est.",
  ],
  actions: [
    {
      id: "ajouter-depart-mardi-1700",
      libelle: "Ajouter un départ mardi 17:00",
      type: "ajouter_depart",
    },
    { id: "voir-ligne-dla-baf", libelle: "Voir la ligne en détail", type: "voir_ligne" },
  ],
  sources:
    "Sources : tes ventes, les scans au quai, les prix publics des autres compagnies sur AfriMove. Jamais leurs chiffres.",
  simulation: null,
};

const SIMULEE: Echange = {
  question: "Et si je baisse à 3 500 moi aussi ?",
  repondueA: "2027-01-05T07:38:00.000+01:00",
  dureeSecondes: 4,
  resume:
    "À 3 500, il te faut 6 passagers de plus par départ pour gagner la même chose. Sur 30 jours, tu les as eus seulement les vendredis et samedis. Je ne baisserais pas le prix : je déplacerais le 10:00 à 09:15, c'est le créneau vide, et je garderais 4 000.",
  points: [],
  actions: [],
  sources: null,
  simulation: {
    options: [
      { libelle: "09:15", gainMensuel: 1_500_000 },
      { libelle: "3 500", gainMensuel: -400_000 },
    ],
  },
};

const CONVERSATION: Conversation = {
  id: "conversation-1",
  baseJours: 30,
  echanges: [DIAGNOSTIC, SIMULEE],
};

type Impl = Scenario["operations"][number];

interface Journal {
  conversations: number;
  questions: string[];
  propositions: number;
}

interface OptionsClient {
  conversation?: (appel: number) => Conversation;
  /** Répond à une question posée ; lève pour simuler une panne ; une promesse fait attendre la réponse. */
  question?: (question: string, echanges: Echange[]) => Echange | Promise<Echange> | undefined;
}

/**
 * Client mock dont l'assistant répond comme demandé : la conversation grandit à chaque question posée, le journal
 * compte les appels (lectures et écritures).
 */
function clientAssistant(
  options: OptionsClient = {},
  journal: Journal = { conversations: 0, questions: [], propositions: 0 },
): ClientApi {
  const echanges: Echange[] = [...CONVERSATION.echanges];
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      const impls: Impl[] = [
        implementer(patron.OP_CONVERSATION, (): Conversation => {
          journal.conversations += 1;
          return options.conversation
            ? options.conversation(journal.conversations)
            : { ...CONVERSATION, echanges: [...echanges] };
        }),
        implementer(patron.OP_QUESTION_ASSISTANT, async ({ question }) => {
          journal.questions.push(question);
          const reponse = (await options.question?.(question, echanges)) ?? {
            ...SIMULEE,
            question,
            resume: "Réponse de test.",
            simulation: null,
          };
          echanges.push(reponse);
          return reponse;
        }),
        implementer(patron.OP_APPLIQUER_PROPOSITION, () => {
          journal.propositions += 1;
          throw new Error("Une action de l'assistant ne doit jamais appliquer un réglage");
        }),
      ];
      return { ...scenario, operations: [...impls, ...scenario.operations] };
    },
  };
  return creerClientMock({ source, scenario: "AssistantReponse", latenceMs: 0 });
}

function rendre(clientApi?: ClientApi) {
  return rendreApp({
    fixtures: true,
    scenario: "AssistantReponse",
    url: "/assistant/reponse",
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByRole("heading", {
    level: 2,
    name: new RegExp(`^${DIAGNOSTIC.resume.slice(0, 20)}`),
  });
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Les réponses de l'assistant (les cartes à gauche), dans l'ordre. */
function reponses(): HTMLElement[] {
  return [...principal().querySelectorAll<HTMLElement>("[data-reponse]")];
}

const PLACEHOLDER = fr.saisie.placeholder;

describe("AssistantReponse · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, « L'assistant », la durée et la base de la réponse, l'étincelle", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /L.assistant répond · pourquoi Bafoussam baisse/,
    );
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
    expect(
      screen.getByText("Réponse en 4 s · sur tes chiffres des 30 derniers jours"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("affiche les deux questions du patron, chacune suivie de la réponse de l'assistant", async () => {
    rendre();
    await attendreEcran();
    expect(principal().children).toHaveLength(4);
    expect([...principal().children].map((c) => c.getAttribute("data-reponse"))).toEqual([
      null,
      "detaillee",
      null,
      "courte",
    ]);
    expect(principal().children[0]).toHaveTextContent("Pourquoi Bafoussam baisse ?");
    expect(principal().children[2]).toHaveTextContent("Et si je baisse à 3 500 moi aussi ?");
  });

  it("réponse 1 : le résumé en titre, trois points numérotés, deux actions", async () => {
    rendre();
    const titre = await attendreEcran();
    expect(titre).toHaveTextContent(DIAGNOSTIC.resume);
    const c = within(reponses()[0]!);
    const points = c.getAllByRole("listitem");
    expect(points).toHaveLength(3);
    expect(points[0]).toHaveTextContent(/^1\. Les deux mercredis sont à 42 % de remplissage/);
    expect(points[1]).toHaveTextContent(
      "2. Le 10:00 Douala → Bafoussam part à 55 % depuis qu'Oméga a mis un 09:30 à 3 500 (500 de moins).",
    );
    expect(points[2]).toHaveTextContent(
      "3. Les colis, eux, montent : + 9 %. La ligne n'est pas malade, l'horaire l'est.",
    );
    // le numéro est mis en avant, le texte reste à côté
    expect(within(points[0]!).getByText("1.").tagName).toBe("STRONG");
    expect(c.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Ajouter un départ mardi 17:00",
      "Voir la ligne en détail",
    ]);
  });

  it("réponse 1 : 14 barres, les deux mercredis (3e et 10e jour) en rouge", async () => {
    rendre();
    await attendreEcran();
    const barres = [...reponses()[0]!.querySelectorAll<HTMLElement>("[data-ecart]")];
    expect(barres).toHaveLength(14);
    expect(
      barres.flatMap((b, i) => (b.getAttribute("data-ecart") === "true" ? [i + 1] : [])),
    ).toEqual([3, 10]);
    expect(barres.map((b) => b.style.height)).toEqual(
      [80, 78, 42, 74, 90, 100, 70, 76, 72, 38, 70, 86, 96, 66].map((h) => `${h}%`),
    );
  });

  it("les sources sont citées en bas de la réponse, après les actions", async () => {
    rendre();
    await attendreEcran();
    const carte = reponses()[0]!;
    expect(carte.lastElementChild).toHaveTextContent(DIAGNOSTIC.sources!);
    expect(carte.lastElementChild?.previousElementSibling).toContainElement(
      within(carte).getByRole("link", { name: "Voir la ligne en détail" }),
    );
  });

  it("réponse 2 : le texte, puis la simulation en deux options (en millions, vrai signe moins)", async () => {
    rendre();
    await attendreEcran();
    const carte = reponses()[1]!;
    expect(carte).toHaveTextContent(/^À 3 500, il te faut 6 passagers de plus par départ/);
    expect(carte).toHaveTextContent("et je garderais 4 000.");
    expect(carte.lastElementChild).toHaveTextContent(
      "simulation : + 1,5 M / mois à 09:15 · − 0,4 M / mois à 3 500",
    );
    // pas d'action ni de source sur cette réponse : l'API n'en donne pas
    expect(within(carte).queryByRole("link")).not.toBeInTheDocument();
    expect(carte).not.toHaveTextContent("Sources");
  });

  it("propose la zone pour une autre question, texte ou vocal, sans bouton grisé", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("textbox", { name: "Autre question…" })).toHaveAttribute(
      "placeholder",
      "Autre question…",
    );
    expect(screen.getByRole("button", { name: "Parler" })).toBeEnabled();
    for (const bouton of screen.queryAllByRole("button")) expect(bouton).toBeEnabled();
  });
});

describe("AssistantReponse · navigation de la planche", () => {
  let annuler: (e: Event) => void;
  beforeEach(() => {
    // jsdom ne navigue pas : on retient le clic pour qu'il n'aille pas plus loin que le routeur.
    annuler = (e) => e.preventDefault();
    document.addEventListener("click", annuler);
  });
  afterEach(() => document.removeEventListener("click", annuler));

  it("suit les liens de la planche : retour, ajouter un départ, voir la ligne", async () => {
    rendre();
    await attendreEcran();
    const href = (nom: string) => screen.getByRole("link", { name: nom }).getAttribute("href");
    expect(href("Retour")).toBe("/assistant");
    // la ligne dont l'assistant parle (Douala → Bafoussam) est reconnue dans ses points
    expect(href("Ajouter un départ mardi 17:00")).toBe("/reglages/ligne/ligne-alp-dlabaf");
    expect(href("Voir la ligne en détail")).toBe("/analyses/ligne/ligne-alp-dlabaf");
    // trois liens, « Parler » est un bouton : rien n'est grisé ni « bientôt »
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("« Retour » ouvre l'Assistant", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/assistant"));
  });

  it("« Ajouter un départ mardi 17:00 » ouvre le réglage de la ligne, sans rien modifier", async () => {
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Ajouter un départ mardi 17:00" }));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/reglages/ligne/ligne-alp-dlabaf"),
    );
    expect(journal.propositions).toBe(0);
    expect(journal.questions).toEqual([]);
  });

  it("« Voir la ligne en détail » ouvre l'analyse de la ligne", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Voir la ligne en détail" }));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/analyses/ligne/ligne-alp-dlabaf"),
    );
  });

  it("« Parler » reste sur l'écran : le curseur passe dans le champ, rien n'est envoyé", async () => {
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Parler" }));
    expect(routeur.state.location.pathname).toBe("/assistant/reponse");
    expect(screen.getByRole("textbox", { name: PLACEHOLDER })).toHaveFocus();
    expect(journal.questions).toEqual([]);
  });
});

describe("AssistantReponse · les actions ouvrent un écran, elles n'appliquent jamais un réglage", () => {
  it("chaque type d'action mène à son écran", () => {
    expect(destinationAction("controle_inopine")).toBe("/inopine");
    expect(destinationAction("regle_cadence_numero")).toBe("/reglages");
    expect(destinationAction("decaler_depart")).toBe("/reglages");
    expect(destinationAction("ajouter_depart", "ligne-x")).toBe("/reglages/ligne/ligne-x");
    expect(destinationAction("voir_ligne", "ligne-x")).toBe("/analyses/ligne/ligne-x");
  });

  it("sans ligne reconnue, ajouter un départ ouvre les réglages et voir la ligne ouvre les analyses", () => {
    expect(destinationAction("ajouter_depart")).toBe("/reglages");
    expect(destinationAction("voir_ligne")).toBe("/analyses");
  });

  it("la ligne est reconnue par son nom écrit dans la question, le résumé ou un point (accents et flèche compris)", () => {
    const lignes = [
      { ligneId: "dla-yde", nom: "Douala → Yaoundé" },
      { ligneId: "dla-baf", nom: "Douala → Bafoussam" },
      { ligneId: "baf-dla", nom: "Bafoussam → Douala" },
    ];
    expect(ligneConcernee(DIAGNOSTIC, lignes)).toBe("dla-baf");
    expect(
      ligneConcernee(
        { question: "Et Yaounde ?", resume: "La ligne Douala -> Yaoundé va bien.", points: [] },
        lignes,
      ),
    ).toBe("dla-yde");
    expect(
      ligneConcernee({ question: "Bafoussam baisse ?", resume: "Oui.", points: [] }, lignes),
    ).toBeUndefined();
    // deux lignes nommées : on ne choisit pas
    expect(
      ligneConcernee(
        { question: "Douala → Yaoundé ou Douala → Bafoussam ?", resume: "", points: [] },
        lignes,
      ),
    ).toBeUndefined();
    expect(ligneConcernee(DIAGNOSTIC, [])).toBeUndefined();
  });
});

describe("AssistantReponse · poser une autre question", () => {
  it("la question écrite est envoyée (sans espaces autour), sa réponse s'ajoute en bas, le champ est vidé", async () => {
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    const { routeur } = rendre(clientAssistant({}, journal));
    await attendreEcran();
    const champ = screen.getByRole("textbox", { name: PLACEHOLDER });
    await userEvent.type(champ, "  Combien ce mois ?  {Enter}");
    expect(await screen.findByText("Réponse de test.")).toBeInTheDocument();
    expect(journal.questions).toEqual(["Combien ce mois ?"]);
    expect(journal.propositions).toBe(0);
    expect(champ).toHaveValue("");
    // la conversation a gardé ses deux échanges et gagné le troisième ; on reste sur l'écran
    expect(reponses()).toHaveLength(3);
    expect(principal().children[4]).toHaveTextContent("Combien ce mois ?");
    expect(routeur.state.location.pathname).toBe("/assistant/reponse");
  });

  it("une saisie vide ou faite d'espaces n'envoie rien", async () => {
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    rendre(clientAssistant({}, journal));
    await attendreEcran();
    const champ = screen.getByRole("textbox", { name: PLACEHOLDER });
    await userEvent.type(champ, "{Enter}");
    await userEvent.type(champ, "   {Enter}");
    expect(journal.questions).toEqual([]);
    expect(reponses()).toHaveLength(2);
  });

  it("pendant que l'assistant répond : la question s'affiche, sa réponse attend, un second envoi est ignoré", async () => {
    let repondre: (e: Echange) => void = () => {};
    const attente = new Promise<Echange>((resolve) => (repondre = resolve));
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    rendre(clientAssistant({ question: () => attente }, journal));
    await attendreEcran();
    const champ = screen.getByRole("textbox", { name: PLACEHOLDER });
    await userEvent.type(champ, "Prévision de samedi{Enter}");

    const enAttente = await screen.findByLabelText("L'assistant prépare sa réponse");
    expect(enAttente).toHaveAttribute("aria-busy", "true");
    expect(principal().lastElementChild).toBe(enAttente);
    expect(principal().children[4]).toHaveTextContent("Prévision de samedi");
    await userEvent.type(champ, "{Enter}");
    expect(journal.questions).toEqual(["Prévision de samedi"]);

    repondre({
      ...SIMULEE,
      question: "Prévision de samedi",
      resume: "Samedi sera plein.",
      simulation: null,
    });
    expect(await screen.findByText("Samedi sera plein.")).toBeInTheDocument();
    expect(screen.queryByLabelText("L'assistant prépare sa réponse")).not.toBeInTheDocument();
  });

  it("la question n'est pas partie : le dit, garde le texte, puis repart au second essai", async () => {
    let essais = 0;
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    rendre(
      clientAssistant(
        {
          question: () => {
            essais += 1;
            if (essais === 1) throw new ErreurReseau("coupure");
            return undefined;
          },
        },
        journal,
      ),
    );
    await attendreEcran();
    const champ = screen.getByRole("textbox", { name: PLACEHOLDER });
    await userEvent.type(champ, "Prévision de samedi{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(fr.etats.envoi);
    expect(champ).toHaveValue("Prévision de samedi");
    // la conversation reste là
    expect(reponses()).toHaveLength(2);

    await userEvent.type(champ, "{Enter}");
    expect(await screen.findByText("Réponse de test.")).toBeInTheDocument();
    expect(journal.questions).toEqual(["Prévision de samedi", "Prévision de samedi"]);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(champ).toHaveValue("");
  });
});

describe("AssistantReponse · ce que dit l'API, rien de plus", () => {
  const AUTRE: Conversation = {
    id: "c2",
    baseJours: 7,
    echanges: [
      {
        question: "Un seul jour ?",
        repondueA: "2027-01-05T07:38:00.000+01:00",
        dureeSecondes: 2,
        resume: "Une réponse sans point, sans action, sans source.",
        points: [],
        actions: [],
        sources: null,
        simulation: null,
      },
    ],
  };

  it("autre conversation, autres chiffres : l'en-tête reprend la durée et la base de la dernière réponse", async () => {
    rendre(clientAssistant({ conversation: () => AUTRE }));
    await screen.findByText("Une réponse sans point, sans action, sans source.");
    expect(
      screen.getByText("Réponse en 2 s · sur tes chiffres des 7 derniers jours"),
    ).toBeInTheDocument();
    expect(reponses()).toHaveLength(1);
    expect(within(reponses()[0]!).queryByRole("link")).not.toBeInTheDocument();
    expect(reponses()[0]!.querySelector("[data-ecart]")).toBeNull();
    // aucun texte de la démo ne reste
    expect(within(principal()).queryByText(/Bafoussam/)).not.toBeInTheDocument();
  });

  it("une base d'un jour s'écrit « du dernier jour »", async () => {
    rendre(clientAssistant({ conversation: () => ({ ...AUTRE, baseJours: 1 }) }));
    await screen.findByText("Une réponse sans point, sans action, sans source.");
    expect(
      screen.getByText("Réponse en 2 s · sur tes chiffres du dernier jour"),
    ).toBeInTheDocument();
  });

  it("les sources de l'API sont reprises telles quelles, en dernier", async () => {
    const conversation: Conversation = {
      ...AUTRE,
      echanges: [{ ...AUTRE.echanges[0]!, sources: "Sources : tes ventes." }],
    };
    rendre(clientAssistant({ conversation: () => conversation }));
    await screen.findByText("Une réponse sans point, sans action, sans source.");
    expect(reponses()[0]!.lastElementChild).toHaveTextContent("Sources : tes ventes.");
  });
});

describe("AssistantReponse · le graphique et la ligne des actions viennent de la réponse", () => {
  function rendreVue(diagnostic: Echange = DIAGNOSTIC) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <MemoryRouter>
              <ReponseVue
                etat="pret"
                conversation={{ ...CONVERSATION, echanges: [diagnostic, SIMULEE] }}
              />
            </MemoryRouter>
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  it("sans graphique dans la réponse, rien n'est inventé", () => {
    rendreVue();
    expect(principal().querySelector("[data-ecart]")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("avec un graphique, une barre par jour : les jours en écart sont en rouge", () => {
    rendreVue({ ...DIAGNOSTIC, graphique: { valeurs: [50, 60, 10], joursEnEcart: [3] } });
    const barres = [...principal().querySelectorAll<HTMLElement>("[data-ecart]")];
    expect(barres.map((b) => b.getAttribute("data-ecart"))).toEqual(["false", "false", "true"]);
    expect(barres.map((b) => b.style.height)).toEqual(["50%", "60%", "10%"]);
  });

  it("le ligneId de l'action prime sur la ligne devinée dans le texte", () => {
    rendreVue({
      ...DIAGNOSTIC,
      actions: DIAGNOSTIC.actions.map((a) => ({ ...a, ligneId: "ligne-de-l-api" })),
    });
    expect(screen.getByRole("link", { name: "Ajouter un départ mardi 17:00" })).toHaveAttribute(
      "href",
      "/reglages/ligne/ligne-de-l-api",
    );
    expect(screen.getByRole("link", { name: "Voir la ligne en détail" })).toHaveAttribute(
      "href",
      "/analyses/ligne/ligne-de-l-api",
    );
  });

  it("chaque action garde sa ligne : une action sans ligneId retombe sur la ligne nommée dans le texte ou la liste", () => {
    rendreVue({
      ...DIAGNOSTIC,
      actions: [{ ...DIAGNOSTIC.actions[0]!, ligneId: "ligne-de-l-api" }, DIAGNOSTIC.actions[1]!],
    });
    expect(screen.getByRole("link", { name: "Ajouter un départ mardi 17:00" })).toHaveAttribute(
      "href",
      "/reglages/ligne/ligne-de-l-api",
    );
    // Pas de lignes du réseau connues dans cette vue : repli sur la liste des analyses.
    expect(screen.getByRole("link", { name: "Voir la ligne en détail" })).toHaveAttribute(
      "href",
      "/analyses",
    );
  });

  it("sans lignes connues, les actions ouvrent la liste des analyses et les réglages", () => {
    rendreVue();
    expect(screen.getByRole("link", { name: "Ajouter un départ mardi 17:00" })).toHaveAttribute(
      "href",
      "/reglages",
    );
    expect(screen.getByRole("link", { name: "Voir la ligne en détail" })).toHaveAttribute(
      "href",
      "/analyses",
    );
  });
});

describe("AssistantReponse · états chargement, vide et erreur", () => {
  function rendreVue(
    etat: EtatReponse,
    extra: { conversation?: Conversation; reessayer?: () => void } = {},
  ) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <MemoryRouter>
              <ReponseVue
                etat={etat}
                conversation={extra.conversation}
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
    expect(screen.getByLabelText("Chargement de la réponse de l'assistant")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Réponse en/)).not.toBeInTheDocument();
    // l'en-tête et la zone de saisie restent
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parler" })).toBeInTheDocument();
  });

  it("vide : un message dans le style nuit, la zone de saisie reste", async () => {
    rendre(clientAssistant({ conversation: () => ({ ...CONVERSATION, echanges: [] }) }));
    expect(await screen.findByText(fr.etats.vide)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: PLACEHOLDER })).toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis la conversation", async () => {
    const journal: Journal = { conversations: 0, questions: [], propositions: 0 };
    rendre(
      clientAssistant(
        {
          conversation: (appel) => {
            if (appel === 1) throw new ErreurHttp(500, "panne", "PANNE");
            return CONVERSATION;
          },
        },
        journal,
      ),
    );
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(fr.etats.erreur);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    // la navigation reste utilisable
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/assistant");

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

describe("AssistantReponse · formats", () => {
  it("gain par mois d'une option : millions dès 100 000, milliers, francs, vrai signe moins", () => {
    expect(gainSimule(1_500_000)).toBe("+ 1,5 M");
    expect(gainSimule(-400_000)).toBe("− 0,4 M");
    expect(gainSimule(2_610_000)).toBe("+ 2,61 M");
    expect(gainSimule(85_000)).toBe("+ 85 k");
    expect(gainSimule(-12_500)).toBe("− 12,5 k");
    expect(gainSimule(950)).toBe("+ 950 F");
    expect(gainSimule(0)).toBe("0 F");
  });

  it("points : le numéro écrit par l'API est repris, sinon le rang", () => {
    expect(numeroter(["1. Premier.", "2.Deuxième"])).toEqual([
      { numero: "1.", texte: "Premier." },
      { numero: "2.", texte: "Deuxième" },
    ]);
    expect(numeroter(["Sans numéro", "Autre"])).toEqual([
      { numero: "1.", texte: "Sans numéro" },
      { numero: "2.", texte: "Autre" },
    ]);
  });
});
