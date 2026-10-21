import {
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import {
  B_NGO,
  C_EBOLO,
  D_TCHINDA,
  JOSEPH_M,
  L_FOUDA,
  MARIE_T,
  PAULINE_N,
  S_ATANGANA,
  T_KAMGA,
  ecrans,
} from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";
import { filtrerPersonnes, resumer } from "./filtre";
import fr from "./i18n.fr.json";
import type { ListeEquipe, Personne } from "./types";

const popup = ecrans.ConfigEquipeListe.donnees.popup;
const URL_EQUIPE = "/reglages/equipe";

function rendre(options: { clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    scenario: "ConfigEquipeListe",
    url: URL_EQUIPE,
    ...(options.clientApi ? { clientApi: options.clientApi } : { fixtures: true }),
  });
}

async function attendreEcran() {
  return screen.findByText("Joseph M.", { exact: false });
}

function feuille(): HTMLElement {
  return screen.getByRole("dialog");
}

/** Les lignes de la liste des personnes (la région qui défile). */
function lignes(): HTMLElement[] {
  const zone = screen.getByRole("region", { name: "Personnes de l’équipe (liste qui défile)" });
  return within(zone).queryAllByRole("link");
}

/** Le bouton de filtre dont le texte commence par celui-ci (« 9 guichetiers »). */
function filtre(texte: string): HTMLElement {
  const groupe = screen.getByRole("group", { name: "Filtrer l’équipe par rôle" });
  const trouve = within(groupe)
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").endsWith(texte));
  if (!trouve) throw new Error(`Pas de filtre « ${texte} »`);
  return trouve;
}

const champRecherche = () => screen.getByRole("searchbox", { name: popup.recherche });

/* ------------------------------------------------------------------------ données contrôlées */

const personne = (extra: Partial<Personne> & Pick<Personne, "id" | "nom" | "role">): Personne => ({
  initiales: extra.nom.slice(0, 2).toUpperCase(),
  lieu: "",
  indicateur: "0 écart",
  etat: "en_service",
  ...extra,
});

const EQUIPE: Personne[] = [
  personne({ id: "p-1", nom: "Aïcha K.", role: "guichetier", lieu: "Akwa · guichet 1" }),
  personne({ id: "p-2", nom: "Bruno E.", role: "guichetier", lieu: "Mvan · guichet 2" }),
  personne({
    id: "p-3",
    nom: "Carine T.",
    role: "guichetier",
    lieu: "Akwa · nuit",
    etat: "bloquee",
    indicateur: "bloquée · 3 PIN faux",
  }),
  personne({ id: "p-4", nom: "Élodie M.", role: "superviseur", lieu: "Akwa" }),
  personne({ id: "p-5", nom: "Fabrice N.", role: "superviseur", lieu: "Mvan", etat: "repos" }),
  personne({ id: "p-6", nom: "Gilbert A.", role: "convoyeur", lieu: "LT 412 AB", etat: "a_bord" }),
];

function equipe(personnes: Personne[]): ListeEquipe {
  const roles = (["guichetier", "superviseur", "convoyeur", "chauffeur"] as const).map((role) => ({
    role,
    nombre: personnes.filter((p) => p.role === role).length,
  }));
  return {
    total: personnes.length,
    roles,
    personnes,
    resume: { role: null, total: personnes.length, enService: 0, bloquees: 0 },
  };
}

type Implementation = Scenario["operations"][number];

/** Un client mock des scénarios de fixtures dont la lecture de l'équipe est remplacée. */
function clientAvecEquipe(
  fabrique: (originale: Implementation) => Implementation,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((impl) =>
          impl.operation.nom === patron.OP_EQUIPE.nom ? fabrique(impl) : impl,
        ),
      };
    },
  };
  return creerClientMock({ source, scenario: "ConfigEquipeListe", latenceMs: 0 });
}

const avecPersonnes = (personnes: Personne[]) =>
  clientAvecEquipe(() => implementer(patron.OP_EQUIPE, () => equipe(personnes)));

/* ------------------------------------------------------------------------ rendu de la planche */

describe("ConfigEquipeListe · rendu de la planche (scénario de démo)", () => {
  it("affiche le fond assombri : « Configuration », le nombre de personnes et le retour", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Configuration" })).toBeInTheDocument();
    expect(screen.getByText(ecrans.ConfigEquipeListe.donnees.fond.detail)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("affiche le pop-up : titre, aide, croix, rôles, recherche, personnes, résumé et signature", async () => {
    rendre();
    await attendreEcran();
    const f = feuille();
    expect(within(f).getByText(popup.titre)).toBeInTheDocument();
    expect(within(f).getByText(popup.aide)).toBeInTheDocument();
    expect(within(f).getByRole("button", { name: "Fermer" })).toBeInTheDocument();
    expect(champRecherche()).toHaveAttribute("placeholder", popup.recherche);
    expect(within(f).getByText(popup.resume)).toBeInTheDocument();
    expect(within(f).getByText(popup.signature)).toBeInTheDocument();
    expect(lignes()).toHaveLength(9);
  });

  it("affiche les quatre rôles avec leurs effectifs, les guichetiers d'abord", async () => {
    rendre();
    await attendreEcran();
    const boutons = within(
      screen.getByRole("group", { name: "Filtrer l’équipe par rôle" }),
    ).getAllByRole("button");
    expect(boutons.map((b) => b.textContent)).toEqual([
      "9 guichetiers",
      "3 superviseurs",
      "7 convoyeurs",
      "4 chauffeurs",
    ]);
    expect(boutons.map((b) => b.getAttribute("aria-current"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  it("liste les neuf guichetiers comme la planche, avec leur synthèse en couleur", async () => {
    rendre();
    await attendreEcran();
    const rangees = lignes();
    popup.personnes.forEach((attendue, i) => {
      expect(rangees[i]).toHaveTextContent(
        `${attendue.initiales}${attendue.nom} · ${attendue.lieu}${attendue.detail}${attendue.action}`,
      );
    });
    const ton = (i: number, texte: string) =>
      within(rangees[i]!).getByText(texte).getAttribute("data-ton");
    expect(ton(0, "PIN à renouveler · 3 écarts")).toBe("ambre");
    expect(ton(1, "1 204 billets · 0 écart")).toBe("neutre");
    expect(ton(2, "bloquée · 3 PIN faux")).toBe("rouge");
    expect(ton(5, "hors ligne 40 min")).toBe("ambre");
    expect(ton(8, "3 jours ce mois")).toBe("neutre");
  });

  it("la liste est une région qui défile, atteignable au clavier", async () => {
    rendre();
    await attendreEcran();
    const zone = screen.getByRole("region", { name: "Personnes de l’équipe (liste qui défile)" });
    expect(zone).toHaveAttribute("tabindex", "0");
  });

  it("le résumé compte les guichetiers affichés : 9 · 8 en service · 1 bloquée", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("9 guichetiers · 8 en service · 1 bloquée")).toBeInTheDocument();
  });

  it("n'écrit rien et n'invente aucun bouton grisé : les actions du pied sont des liens", async () => {
    rendre();
    await attendreEcran();
    expect(document.querySelectorAll("button:disabled")).toHaveLength(0);
    const pied = within(feuille());
    expect(pied.getByRole("link", { name: "Fermer" })).toBeInTheDocument();
    expect(pied.getByRole("link", { name: "Ajouter une personne" })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ filtre et recherche */

describe("ConfigEquipeListe · filtre par rôle et recherche", () => {
  it("toucher un rôle filtre la liste sur place, sans changer d'écran", async () => {
    const { routeur } = rendre({ clientApi: avecPersonnes(EQUIPE) });
    await screen.findByText("Aïcha K.", { exact: false });
    expect(lignes().map((l) => l.textContent)).toEqual([
      expect.stringContaining("Aïcha K."),
      expect.stringContaining("Bruno E."),
      expect.stringContaining("Carine T."),
    ]);

    await userEvent.click(filtre("2 superviseurs"));
    expect(lignes().map((l) => l.textContent)).toEqual([
      expect.stringContaining("Élodie M."),
      expect.stringContaining("Fabrice N."),
    ]);
    expect(filtre("2 superviseurs")).toHaveAttribute("aria-current", "true");
    expect(filtre("3 guichetiers")).toHaveAttribute("aria-current", "false");
    expect(routeur.state.location.pathname).toBe(URL_EQUIPE);

    await userEvent.click(filtre("1 convoyeur"));
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toHaveTextContent("Gilbert A.");
  });

  it("le résumé suit le rôle : bloquées au pluriel, rien quand il n'y en a pas", async () => {
    rendre({ clientApi: avecPersonnes(EQUIPE) });
    await screen.findByText("Aïcha K.", { exact: false });
    expect(screen.getByText("3 guichetiers · 2 en service · 1 bloquée")).toBeInTheDocument();
    await userEvent.click(filtre("2 superviseurs"));
    // Fabrice est au repos : il n'est pas en service.
    expect(screen.getByText("2 superviseurs · 1 en service")).toBeInTheDocument();
    await userEvent.click(filtre("1 convoyeur"));
    // « à bord » compte comme en service.
    expect(screen.getByText("1 convoyeur · 1 en service")).toBeInTheDocument();
  });

  it("la recherche cherche dans le nom, la gare et le guichet, sans tenir compte des accents ni des majuscules", async () => {
    rendre({ clientApi: avecPersonnes(EQUIPE) });
    await screen.findByText("Aïcha K.", { exact: false });

    await userEvent.type(champRecherche(), "AKWA");
    expect(lignes().map((l) => l.textContent)).toEqual([
      expect.stringContaining("Aïcha K."),
      expect.stringContaining("Carine T."),
    ]);

    await userEvent.type(champRecherche(), " nuit");
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toHaveTextContent("Carine T.");

    await userEvent.clear(champRecherche());
    await userEvent.type(champRecherche(), "aicha");
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toHaveTextContent("Aïcha K.");
  });

  it("le filtre et la recherche se combinent, dans un sens comme dans l'autre", async () => {
    rendre({ clientApi: avecPersonnes(EQUIPE) });
    await screen.findByText("Aïcha K.", { exact: false });

    // Rôle puis recherche : Akwa chez les guichetiers, sans le superviseur d'Akwa.
    await userEvent.type(champRecherche(), "akwa");
    expect(lignes()).toHaveLength(2);

    // La recherche reste quand on change de rôle : Akwa chez les superviseurs.
    await userEvent.click(filtre("2 superviseurs"));
    expect(champRecherche()).toHaveValue("akwa");
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toHaveTextContent("Élodie M.");

    // Et le résumé compte ce qui est affiché.
    expect(screen.getByText("1 superviseur · 1 en service")).toBeInTheDocument();

    // On revient aux guichetiers : la recherche s'applique toujours.
    await userEvent.click(filtre("3 guichetiers"));
    expect(lignes()).toHaveLength(2);
    expect(screen.getByText("2 guichetiers · 1 en service · 1 bloquée")).toBeInTheDocument();
  });

  it("une recherche sans résultat le dit, et la liste revient quand on efface", async () => {
    rendre({ clientApi: avecPersonnes(EQUIPE) });
    await screen.findByText("Aïcha K.", { exact: false });
    await userEvent.type(champRecherche(), "zzz");
    expect(lignes()).toHaveLength(0);
    expect(screen.getByText("Aucune personne ne correspond.")).toBeInTheDocument();
    expect(screen.getByText("0 guichetier · 0 en service")).toBeInTheDocument();
    await userEvent.clear(champRecherche());
    expect(lignes()).toHaveLength(3);
    expect(screen.queryByText("Aucune personne ne correspond.")).not.toBeInTheDocument();
  });

  it("avec les données de la démo, chaque rôle montre ses personnes et pas celles des autres", async () => {
    rendre();
    await attendreEcran();
    await userEvent.type(champRecherche(), "guichet 3");
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toHaveTextContent("Pauline N.");
    await userEvent.click(filtre("3 superviseurs"));
    expect(screen.queryByText("Pauline N.", { exact: false })).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ navigation */

describe("ConfigEquipeListe · navigation identique à la maquette", () => {
  it("« Retour » mène aux réglages", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/reglages");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
  });

  it("« Fermer » (le lien du pied) mène aux réglages", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const fermer = within(feuille()).getByRole("link", { name: "Fermer" });
    expect(fermer).toHaveAttribute("href", "/reglages");
    await userEvent.click(fermer);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
  });

  it.each([
    ["la croix", () => userEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }))],
    ["Échap", () => userEvent.keyboard("{Escape}")],
    ["le voile", () => userEvent.click(screen.getByTestId("voile"))],
  ])("%s ferme le pop-up : retour aux réglages", async (_nom, fermer) => {
    const { routeur } = rendre();
    await attendreEcran();
    await fermer();
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
  });

  const guichetiers = [
    JOSEPH_M,
    MARIE_T,
    PAULINE_N,
    D_TCHINDA,
    S_ATANGANA,
    T_KAMGA,
    B_NGO,
    C_EBOLO,
    L_FOUDA,
  ];

  it.each(guichetiers.map((p, i) => [i, p.id] as const))(
    "la personne n° %i ouvre ConfigPersonne (%s)",
    async (rang, personneId) => {
      const { routeur } = rendre();
      await attendreEcran();
      const ligne = lignes()[rang]!;
      expect(ligne).toHaveAttribute("href", `/reglages/personne/${personneId}`);
      await userEvent.click(ligne);
      await waitFor(() =>
        expect(routeur.state.location.pathname).toBe(`/reglages/personne/${personneId}`),
      );
    },
  );

  it("« Ajouter une personne » ouvre ConfigPersonne en création", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const ajouter = within(feuille()).getByRole("link", { name: "Ajouter une personne" });
    expect(ajouter).toHaveAttribute("href", "/reglages/personne/nouvelle");
    await userEvent.click(ajouter);
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/reglages/personne/nouvelle"),
    );
  });

  it("les rôles ne sont pas des liens : ils filtrent sur place", async () => {
    rendre();
    await attendreEcran();
    const groupe = screen.getByRole("group", { name: "Filtrer l’équipe par rôle" });
    expect(within(groupe).queryAllByRole("link")).toHaveLength(0);
    expect(within(groupe).getAllByRole("button")).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------------ chargement, vide, erreur */

describe("ConfigEquipeListe · chargement, vide, erreur", () => {
  it("chargement : des repères qui pulsent, le pop-up, « Fermer » et « Ajouter » restent utilisables", async () => {
    const client = clientAvecEquipe(() =>
      implementer(patron.OP_EQUIPE, () => new Promise<never>(() => {})),
    );
    rendre({ clientApi: client });
    const statut = await screen.findByRole("status", { name: "Chargement de l’équipe" });
    expect(statut.querySelectorAll(".am-pulse").length).toBeGreaterThan(3);
    expect(feuille()).toHaveTextContent("Mon équipe");
    expect(screen.queryByRole("group", { name: "Filtrer l’équipe par rôle" })).toBeNull();
    expect(lignes()).toHaveLength(0);
    expect(within(feuille()).getByRole("link", { name: "Fermer" })).toHaveAttribute(
      "href",
      "/reglages",
    );
    expect(within(feuille()).getByRole("link", { name: "Ajouter une personne" })).toHaveAttribute(
      "href",
      "/reglages/personne/nouvelle",
    );
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("erreur : message, « Réessayer » qui relit, puis la liste complète", async () => {
    let appels = 0;
    const client = clientAvecEquipe((impl) =>
      implementer(patron.OP_EQUIPE, (params, ctx) => {
        appels += 1;
        if (appels === 1) throw new ErreurReseau("coupure");
        return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
      }),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("La liste ne s’est pas chargée.");
    expect(
      within(feuille()).getByRole("link", { name: "Ajouter une personne" }),
    ).toBeInTheDocument();
    expect(lignes()).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(lignes()).toHaveLength(9);
    expect(appels).toBe(2);
  });

  it("vide : une équipe sans personne, un message et l'ajout", async () => {
    rendre({ clientApi: avecPersonnes([]) });
    const message = await screen.findByText("Personne dans l’équipe pour le moment.");
    expect(message.closest("[role='status']")).not.toBeNull();
    expect(lignes()).toHaveLength(0);
    expect(
      within(feuille()).getByRole("link", { name: "Ajouter une personne" }),
    ).toBeInTheDocument();
  });

  it("un rôle sans personne : le message d'une recherche vide, les autres rôles restent atteignables", async () => {
    rendre({ clientApi: avecPersonnes(EQUIPE) });
    await screen.findByText("Aïcha K.", { exact: false });
    await userEvent.click(filtre("0 chauffeur"));
    expect(screen.getByText("Aucune personne ne correspond.")).toBeInTheDocument();
    await userEvent.click(filtre("3 guichetiers"));
    expect(lignes()).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------------ fonctions pures */

describe("ConfigEquipeListe · fonctions pures", () => {
  it("filtrerPersonnes : rôle, mots dans n'importe quel ordre, accents ignorés", () => {
    expect(filtrerPersonnes(EQUIPE, "guichetier", "").map((p) => p.id)).toEqual([
      "p-1",
      "p-2",
      "p-3",
    ]);
    expect(filtrerPersonnes(EQUIPE, null, "").map((p) => p.id)).toHaveLength(6);
    expect(filtrerPersonnes(EQUIPE, null, "nuit akwa").map((p) => p.id)).toEqual(["p-3"]);
    expect(filtrerPersonnes(EQUIPE, null, "ELODIE").map((p) => p.id)).toEqual(["p-4"]);
    expect(filtrerPersonnes(EQUIPE, "convoyeur", "akwa")).toEqual([]);
    expect(filtrerPersonnes(EQUIPE, "guichetier", "   ").map((p) => p.id)).toHaveLength(3);
  });

  it("filtrerPersonnes : ne cherche ni dans la synthèse ni dans l'état", () => {
    expect(filtrerPersonnes(EQUIPE, null, "PIN faux")).toEqual([]);
  });

  it("resumer : en service = en service, à bord ou en route ; bloquées à part", () => {
    expect(resumer(EQUIPE)).toEqual({ total: 6, enService: 4, bloquees: 1 });
    expect(resumer([])).toEqual({ total: 0, enService: 0, bloquees: 0 });
    expect(
      resumer([
        personne({ id: "a", nom: "A", role: "chauffeur", etat: "en_route" }),
        personne({ id: "b", nom: "B", role: "chauffeur", etat: "indisponible" }),
        personne({ id: "c", nom: "C", role: "chauffeur", etat: "hors_service" }),
      ]),
    ).toEqual({ total: 3, enService: 1, bloquees: 0 });
  });
});

/* ------------------------------------------------------------------------ textes */

describe("ConfigEquipeListe · textes", () => {
  it("les trois langues ont les mêmes clés ; le français est rempli", async () => {
    const en = (await import("./i18n.en.json")).default;
    const pcm = (await import("./i18n.pcm.json")).default;
    function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
      return Object.entries(objet).flatMap(([cle, valeur]) =>
        typeof valeur === "object" && valeur !== null
          ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
          : [`${prefixe}${cle}`],
      );
    }
    const valeurs = (objet: Record<string, unknown>): string[] =>
      Object.values(objet).flatMap((v) =>
        typeof v === "object" && v !== null ? valeurs(v as Record<string, unknown>) : [String(v)],
      );
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
    expect(valeurs(fr).filter((v) => v.trim() === "")).toEqual([]);
  });

  it("les textes de la planche sont ceux des fixtures", () => {
    expect(fr.popup.aide).toBe(popup.aide);
    expect(fr.recherche).toBe(popup.recherche);
    expect(fr.signature).toBe(popup.signature);
    expect(fr.actions.fermer).toBe(popup.actions[0]);
    expect(fr.actions.ajouter).toBe(popup.actions[1]);
  });
});
