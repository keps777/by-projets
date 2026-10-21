import {
  ErreurHttp,
  ErreurReseau,
  colis,
  creerClientMock,
  implementer,
  type ClientApi,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const planche = ecrans.RelaisDevenir.donnees;

type Programme = contrats.ProgrammeRelais;

/** Source des scénarios de démo, avec `operations` placées devant celles de la planche (le client prend la première). */
function sourceAvec(...operations: ReturnType<typeof implementer>[]): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: [...operations, ...scenario.operations] };
    },
  };
}

function clientAvec(...operations: ReturnType<typeof implementer>[]): ClientApi {
  return creerClientMock({
    source: sourceAvec(...operations),
    scenario: "RelaisDevenir",
    latenceMs: 0,
  });
}

function rendre(options: { client?: ClientApi; langue?: "fr" | "en" | "pcm" } = {}) {
  return rendreApp({
    url: "/moi/devenir-relais",
    scenario: "RelaisDevenir",
    clientApi: options.client ?? clientAvec(),
    ...(options.langue ? { langue: options.langue } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText(planche.promesse.accroche);
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien qui porte `nom` (nom accessible complet). */
function lien(nom: string | RegExp): HTMLAnchorElement {
  return screen.getByRole("link", { name: nom }) as HTMLAnchorElement;
}

const chemin = (a: HTMLAnchorElement) => new URL(a.href, "http://localhost").pathname;

/** Réponse du programme : celle du scénario, modifiée par `modifier`. */
function programmeModifie(modifier: (base: Programme) => Programme) {
  return implementer(colis.OP_PROGRAMME_RELAIS, async (_p, ctx) => {
    const base = (await sourceScenariosFixtures().charger("RelaisDevenir")).operations.find(
      (o) => o.operation.nom === colis.OP_PROGRAMME_RELAIS.nom,
    )!;
    return modifier(
      (await (base.repondre as (p: unknown, c: unknown) => unknown)(undefined, ctx)) as Programme,
    );
  });
}

describe("RelaisDevenir · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, sous-titre et pastille « 200 F / COLIS »", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Deviens point de relais");
    expect(
      screen.getByText("Programme ouvert à toute boutique · Bafoussam et 11 villes"),
    ).toBeInTheDocument();
    expect(screen.getByText("200 F / COLIS")).toBeInTheDocument();
  });

  it("affiche la promesse et le déroulé", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText(planche.promesse.accroche)).toBeInTheDocument();
    expect(screen.getByText(planche.promesse.deroule)).toBeInTheDocument();
  });

  it("affiche les trois chiffres : 200 F par colis, 8 400 pour Mama Fotso, 214 relais actifs", async () => {
    rendre();
    await attendreEcran();
    const chiffres = principal().querySelectorAll("dl > div");
    expect(chiffres).toHaveLength(3);
    const texte = (i: number) => Array.from(chiffres[i]!.children).map((e) => e.textContent);
    expect(texte(0)).toEqual(["Par colis", "200 F", "remis · 100 F si repris"]);
    expect(texte(1)).toEqual(["Mama Fotso", "8 400", "la semaine dernière · 42 colis"]);
    expect(texte(2)).toEqual(["Relais actifs", "214", "dans 12 villes"]);
  });

  it("affiche « Il te faut » avec les six conditions", async () => {
    rendre();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Il te faut" });
    const lignes = within(bloc)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lignes).toEqual([
      "✓ Une boutique ouverte ≥ 6 j / 7",
      "✓ Ce téléphone (même app)",
      "✓ Ta CNI ou ton récépissé",
      "✓ Un numéro MoMo pour être payé",
      "✓ 1 m² à l'abri, fermé la nuit",
      "✓ 10 min de formation vidéo",
    ]);
  });

  it("affiche « Comment ça se passe » : trois étapes numérotées 1, 2, 3 aux couleurs ambre, bleu, vert", async () => {
    rendre();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Comment ça se passe" });
    const etapes = within(bloc).getAllByRole("listitem");
    expect(etapes).toHaveLength(3);
    expect(etapes[0]).toHaveTextContent(
      "1Tu remplis la fiche · 3 minnom, position, horaires, photo de la façade, pièce",
    );
    expect(etapes[1]).toHaveTextContent(
      "2Un agent AfriMove passe sous 72 hou appel vidéo · il vérifie et te forme en 10 min",
    );
    expect(etapes[2]).toHaveTextContent("3Tu reçois ton kit et ton premier colis");
    const tons = etapes.map((e) => e.querySelector("[data-ton]")?.getAttribute("data-ton"));
    expect(tons).toEqual(["ambre", "bleu", "vert"]);
  });

  it("affiche la mention sans exclusivité et n'invente aucun bouton grisé ni « bientôt »", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText(
        "Pas d'exclusivité, pas de caution. Tu peux faire une pause (vacances) ou arrêter quand tu veux depuis l'app.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bientôt/i)).not.toBeInTheDocument();
    for (const bouton of screen.queryAllByRole("button")) expect(bouton).toBeEnabled();
    // Aucun emoji : les icônes sont des SVG.
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("RelaisDevenir · navigation", () => {
  it("« Retour » (aria-label de la planche) et « Plus tard » mènent à Moi", async () => {
    rendre();
    await attendreEcran();
    expect(chemin(lien("Retour"))).toBe("/moi");
    expect(chemin(lien("Plus tard"))).toBe("/moi");
  });

  it("« Je m'inscris » mène à la fiche d'inscription", async () => {
    rendre();
    await attendreEcran();
    const inscrire = lien("Je m'inscris · 3 min fiche · agent sous 72 h · kit");
    expect(chemin(inscrire)).toBe("/moi/devenir-relais/fiche");
  });

  it("un clic sur « Je m'inscris » change l'adresse vers la fiche, « Plus tard » vers Moi", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendre();
    await attendreEcran();
    await utilisateur.click(lien(/Je m'inscris/));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/moi/devenir-relais/fiche"));

    await act(async () => {
      await routeur.navigate("/moi/devenir-relais");
    });
    await utilisateur.click(await screen.findByRole("link", { name: "Plus tard" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/moi"));
  });
});

describe("RelaisDevenir · les données viennent du serveur", () => {
  it("montants, nombre de villes et gains suivent la réponse de l'API", async () => {
    const client = clientAvec(
      programmeModifie((p) => ({
        ...p,
        partParColis: 250,
        partSiRepris: 125,
        relaisActifs: 1200,
        villes: 1,
        exemple: { nom: "Chez Awa", colis: 1, gain: 12500 },
      })),
    );
    rendre({ client });
    await attendreEcran();
    expect(screen.getByText("250 F / COLIS")).toBeInTheDocument();
    expect(screen.getByText("remis · 125 F si repris")).toBeInTheDocument();
    expect(screen.getByText("Chez Awa")).toBeInTheDocument();
    expect(screen.getByText("12 500")).toBeInTheDocument();
    expect(screen.getByText("la semaine dernière · 1 colis")).toBeInTheDocument();
    expect(screen.getByText("1 200")).toBeInTheDocument();
    expect(screen.getByText("dans 1 ville")).toBeInTheDocument();
    expect(screen.queryByText("200 F / COLIS")).not.toBeInTheDocument();
  });

  it("les étapes se lisent dans l'ordre de leur rang, quel que soit l'ordre reçu", async () => {
    const client = clientAvec(programmeModifie((p) => ({ ...p, etapes: [...p.etapes].reverse() })));
    rendre({ client });
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Comment ça se passe" });
    const titres = within(bloc)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(titres[0]).toContain("Tu remplis la fiche");
    expect(titres[2]).toContain("Tu reçois ton kit");
  });

  it("un programme sans condition ni étape n'affiche pas de bloc vide", async () => {
    const client = clientAvec(programmeModifie((p) => ({ ...p, prerequis: [], etapes: [] })));
    rendre({ client });
    await attendreEcran();
    expect(screen.queryByRole("region", { name: "Il te faut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Comment ça se passe" })).not.toBeInTheDocument();
    expect(lien(/Je m'inscris/)).toBeInTheDocument();
  });
});

describe("RelaisDevenir · chargement, vide, erreur", () => {
  it("pendant le chargement : le retour reste utilisable, aucun montant n'est inventé, pas d'inscription", async () => {
    const attente = implementer(colis.OP_PROGRAMME_RELAIS, () => new Promise<Programme>(() => {}));
    rendre({ client: clientAvec(attente) });
    const corps = await screen.findByRole("status", { name: "Chargement du programme" });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Deviens point de relais");
    expect(chemin(lien("Retour"))).toBe("/moi");
    expect(screen.queryByText(/COLIS$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Je m'inscris/ })).not.toBeInTheDocument();
  });

  it("programme introuvable (404) : message « fermé », sans bouton Réessayer, retour à Moi possible", async () => {
    const absent = implementer(colis.OP_PROGRAMME_RELAIS, () => {
      throw new ErreurHttp(404, "Pas de programme", "introuvable");
    });
    rendre({ client: clientAvec(absent) });
    expect(await screen.findByText("Programme fermé pour le moment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(chemin(lien("Retour"))).toBe("/moi");
  });

  it("erreur : annonce la panne, propose de réessayer puis affiche le programme", async () => {
    const utilisateur = userEvent.setup();
    let appels = 0;
    const base = (await sourceScenariosFixtures().charger("RelaisDevenir")).operations.find(
      (o) => o.operation.nom === colis.OP_PROGRAMME_RELAIS.nom,
    )!;
    const panne = implementer(colis.OP_PROGRAMME_RELAIS, (p, ctx) => {
      appels += 1;
      if (appels === 1) throw new ErreurReseau();
      return (base.repondre as (p: unknown, c: unknown) => Programme)(p, ctx);
    });
    rendre({ client: clientAvec(panne) });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Impossible de charger le programme")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Je m'inscris/ })).not.toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(appels).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("RelaisDevenir · langues", () => {
  it("s'affiche en anglais puis en pidgin", async () => {
    rendre({ langue: "en" });
    await attendreEcran();
    expect(screen.getByText("200 F / PARCEL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Later" })).toBeInTheDocument();
    cleanup();
    rendre({ langue: "pcm" });
    await attendreEcran();
    expect(screen.getByText("200 F / PARCEL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Later" })).toBeInTheDocument();
  });

  it("les trois langues ont les mêmes clés", () => {
    const cles = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? cles(v as Record<string, unknown>, `${p}${k}.`)
          : [`${p}${k}`],
      );
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
