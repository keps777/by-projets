import {
  ErreurHttp,
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const URL_PERSONNE = "/personnes/pers-joseph";

type Implementation = Scenario["operations"][number];
type Modifier = (operations: readonly Implementation[]) => readonly Implementation[];

/** Un client mock des scénarios de fixtures, dont on peut remplacer des opérations (pour faire échouer ou changer la fiche). */
function clientAvec(modifier: Modifier) {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: modifier(scenario.operations) };
    },
  };
  return creerClientMock({ source, scenario: "PatronPersonne", latenceMs: 0 });
}

function remplacer(nom: string, fabrique: (originale: Implementation) => Implementation): Modifier {
  return (operations) =>
    operations.map((impl) => (impl.operation.nom === nom ? fabrique(impl) : impl));
}

/** La fiche de la planche, modifiée par `changer`. */
function ficheModifiee(
  changer: (fiche: contrats.FichePersonne) => contrats.FichePersonne,
): Modifier {
  return remplacer(patron.OP_FICHE_PERSONNE.nom, (impl) =>
    implementer(impl.operation, (params, ctx) =>
      changer((impl.repondre as (p: unknown, c: unknown) => contrats.FichePersonne)(params, ctx)),
    ),
  );
}

function rendre(options: { url?: string; modifier?: Modifier; masques?: string[] } = {}) {
  return rendreApp({
    scenario: "PatronPersonne",
    url: options.url ?? URL_PERSONNE,
    ...(options.masques ? { masques: options.masques } : {}),
    ...(options.modifier ? { clientApi: clientAvec(options.modifier) } : { fixtures: true }),
  });
}

async function attendreEcran() {
  return screen.findByRole("heading", { level: 1, name: "Joseph M." });
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

describe("PatronPersonne · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : le nom, le rôle, le lieu, l'ancienneté, le badge d'écarts et le retour à l'équipe", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText("Guichetier · Akwa guichet 2 · depuis le 5 janv. 2027"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 ÉCARTS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gares");
  });

  it("affiche la fiche : numéro masqué, salaire, superviseure et état en service", async () => {
    rendre();
    await attendreEcran();
    const fiche = within(principal()).getByRole("region", { name: "Joseph M." });
    expect(within(fiche).getByText("JM")).toBeInTheDocument();
    expect(within(fiche).getByText("6 77 •• •• 23 · MTN")).toBeInTheDocument();
    expect(within(fiche).getByText("Salaire 95 000 · payé le 30 par MoMo")).toBeInTheDocument();
    expect(within(fiche).getByText("Superviseure : Mme Essono")).toBeInTheDocument();
    expect(within(fiche).getByText("en service")).toBeInTheDocument();
    expect(within(fiche).getByText("depuis 05:30")).toBeInTheDocument();
  });

  it("affiche les quatre tuiles avec leurs valeurs et leurs détails", async () => {
    rendre();
    await attendreEcran();
    const tuile = (libelle: string) =>
      within(principal()).getByRole("group", { name: new RegExp(`^${libelle}`) });
    expect(tuile("Billets")).toHaveTextContent("Billets1 20490 jours");
    expect(tuile("Colis")).toHaveTextContent("Colis3120 litige");
    expect(tuile("Annul\\.")).toHaveTextContent("Annul.90,7 % · normal");
    expect(tuile("Écarts")).toHaveTextContent("Écarts310 jours · − 3 500");
  });

  it("affiche le graphique : dix jours, trois barres ambre aux jours 8, 12 et 15, la tolérance et l'analyse", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 2, name: "Écart de caisse · 10 derniers jours" }),
    ).toBeInTheDocument();
    expect(screen.getByText("tolérance ± 500")).toBeInTheDocument();
    const graphique = screen.getByRole("img", {
      name: "Écart de caisse par jour : le 8 : − 1 000, le 12 : − 1 500, le 15 : − 1 000",
    });
    const jours = Array.from(graphique.children) as HTMLElement[];
    expect(jours.map((j) => j.lastElementChild!.textContent)).toEqual([
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ]);
    const ambre = jours
      .filter((j) => (j.firstElementChild as HTMLElement).dataset.accent === "ambre")
      .map((j) => j.lastElementChild!.textContent);
    expect(ambre).toEqual(["8", "12", "15"]);
    // La barre du 12 (− 1 500, le plus gros écart) est la plus haute ; les jours sans écart restent bas.
    const hauteur = (i: number) =>
      parseFloat((jours[i]!.firstElementChild as HTMLElement).style.height);
    expect(hauteur(6)).toBe(100);
    expect(hauteur(2)).toBeLessThan(hauteur(6));
    expect(hauteur(0)).toBeLessThan(hauteur(2));
    expect(
      screen.getByText("Ce n'est pas le tiroir, c'est la monnaie rendue sur les derniers billets.")
        .tagName,
    ).toBe("STRONG");
    expect(screen.getByText(/Toujours en négatif, toujours en fin de journée/)).toBeInTheDocument();
  });

  it("affiche le journal des trois derniers écarts, validés par Essono", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 2, name: "Journal · 3 derniers écarts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("validés Essono")).toBeInTheDocument();
    const lignes = [
      ["15 déc. 14:00", "compté 694 500 · attendu 695 500", "− 1 000"],
      ["12 déc. 13:45", "compté 581 000 · attendu 582 500", "− 1 500"],
      ["8 déc. 14:10", "compté 612 500 · attendu 613 500", "− 1 000"],
    ];
    for (const [quand, detail, montant] of lignes) {
      const ligne = screen.getByText(quand!).closest("div") as HTMLElement;
      expect(ligne).toHaveTextContent(`${quand} · ${detail}`);
      expect(within(ligne).getByText(montant!)).toBeInTheDocument();
    }
  });
});

describe("PatronPersonne · navigation de la planche", () => {
  it("« Retour » et « Désactiver le compte » mènent à l'équipe", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gares");
    expect(screen.getByRole("link", { name: /^Désactiver le compte/ })).toHaveAttribute(
      "href",
      "/gares",
    );
  });

  it("« Changer de guichet / gare » ouvre la gare de la personne (Akwa), pas une gare au hasard", async () => {
    rendre();
    await attendreEcran();
    const lien = () => screen.getByRole("link", { name: /^Changer de guichet \/ gare/ });
    // Avant que la liste des gares arrive, le lien ouvre la liste ; ensuite, la gare de la personne.
    await waitFor(() => expect(lien()).toHaveAttribute("href", "/gares/gare-alp-dla"));
    expect(lien()).toHaveTextContent("dès demain · superviseure prévenue");
  });

  it("« Demander un nouveau PIN » mène à l'équipe du superviseur", async () => {
    rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: /^Demander un nouveau PIN/ });
    expect(lien).toHaveAttribute("href", "/equipe");
    expect(lien).toHaveTextContent("la superviseure l'envoie par SMS");
  });

  it("« En parler à l'assistant » mène à l'assistant et nomme la personne", async () => {
    rendre();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: /^En parler à l'assistant/ });
    expect(lien).toHaveAttribute("href", "/assistant");
    expect(lien).toHaveTextContent("que faire avec Joseph ?");
  });

  it("les cibles tactiles font au moins 44 px", async () => {
    rendre();
    await attendreEcran();
    // jsdom ne calcule pas la mise en page : on vérifie les hauteurs minimales posées par la feuille de style.
    const css = readFileSync(
      resolve(process.cwd(), "src/ecrans/PatronPersonne/patronpersonne.module.css"),
      "utf8",
    );
    for (const classe of ["action", "desactiver"]) {
      const bloc = new RegExp(`\\.${classe} \\{[^}]*min-height: (\\d+)px`).exec(css);
      expect(Number(bloc?.[1]), classe).toBeGreaterThanOrEqual(44);
    }
  });

  it("module « supervision » masqué : plus d'action vers le superviseur ni vers l'assistant, pas de bouton grisé", async () => {
    rendre({ masques: ["supervision"] });
    await attendreEcran();
    expect(
      screen.queryByRole("link", { name: /^Demander un nouveau PIN/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^En parler à l'assistant/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Changer de guichet \/ gare/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Désactiver le compte/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PIN|assistant/i })).not.toBeInTheDocument();
  });
});

describe("PatronPersonne · selon les données", () => {
  it("sans écart : pas de badge, tuile neutre, graphique tout gris, journal vide expliqué", async () => {
    rendre({
      modifier: ficheModifiee((f) => ({
        ...f,
        chiffres: { ...f.chiffres, ecarts: { nombre: 0, total: 0, sur: 10 } },
        ecarts: {
          ...f.ecarts,
          jours: f.ecarts.jours.map((j) => ({ ...j, ecart: 0 })),
          lecture: "Aucun écart sur les dix derniers jours.",
        },
        journal: [],
      })),
    });
    await attendreEcran();
    expect(screen.queryByText(/ÉCART/)).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^Écarts/ })).toHaveTextContent("Écarts010 jours · 0");
    expect(
      screen.getByRole("img", { name: "Écart de caisse par jour : aucun écart" }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-accent="ambre"]')).toBeNull();
    expect(screen.getByText("Aucun écart de caisse récent.")).toBeInTheDocument();
    expect(screen.getByText("Aucun écart sur les dix derniers jours.").tagName).toBe("STRONG");
  });

  it("un seul écart : le badge, le titre et « validé » s'accordent au singulier", async () => {
    rendre({
      modifier: ficheModifiee((f) => ({
        ...f,
        chiffres: { ...f.chiffres, ecarts: { nombre: 1, total: -1000, sur: 10 } },
        journal: f.journal.slice(0, 1),
      })),
    });
    await attendreEcran();
    expect(screen.getByText("1 ÉCART")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Journal · dernier écart" }),
    ).toBeInTheDocument();
    expect(screen.getByText("validé Essono")).toBeInTheDocument();
  });

  it("un superviseur homme, une personne bloquée : « Superviseur : », « compte bloqué » en rouge, pas d'heure de service", async () => {
    rendre({
      modifier: ficheModifiee((f) => ({
        ...f,
        personne: {
          ...f.personne,
          superviseur: "M. Tchinda",
          etat: "bloquee",
          enServiceDepuis: null,
        },
      })),
    });
    await attendreEcran();
    expect(screen.getByText("Superviseur : M. Tchinda")).toBeInTheDocument();
    expect(screen.getByText("compte bloqué")).toHaveAttribute("data-ton", "rouge");
    expect(screen.queryByText(/^depuis \d/)).not.toBeInTheDocument();
  });

  it("un taux d'annulation élevé n'est plus « normal »", async () => {
    rendre({
      modifier: ficheModifiee((f) => ({
        ...f,
        chiffres: { ...f.chiffres, annulations: 60, tauxAnnulationPct: 5 },
      })),
    });
    await attendreEcran();
    expect(screen.getByRole("group", { name: /^Annul\./ })).toHaveTextContent(
      "605 % · à surveiller",
    );
  });

  it("affiche la tolérance de la fiche, pas une valeur codée en dur", async () => {
    rendre({
      modifier: ficheModifiee((f) => ({ ...f, ecarts: { ...f.ecarts, tolerance: 1000 } })),
    });
    await attendreEcran();
    expect(screen.getByText("tolérance ± 1 000")).toBeInTheDocument();
  });

  it("sans gare connue pour la personne, « Changer de guichet / gare » ouvre la liste des gares", async () => {
    rendre({
      modifier: ficheModifiee((f) => ({ ...f, personne: { ...f.personne, lieu: "Ailleurs" } })),
    });
    await attendreEcran();
    expect(screen.getByRole("link", { name: /^Changer de guichet \/ gare/ })).toHaveAttribute(
      "href",
      "/gares",
    );
  });
});

describe("PatronPersonne · états", () => {
  it("chargement : l'en-tête et le retour sont là, le corps pulse dans le style nuit, pas de pied", async () => {
    rendre({
      modifier: remplacer(patron.OP_FICHE_PERSONNE.nom, (impl) =>
        implementer(impl.operation, () => new Promise<never>(() => {})),
      ),
    });
    expect(
      await screen.findByRole("status", { name: "Chargement de la fiche" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Patron · une personne de l’équipe",
    );
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gares");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("link", { name: /assistant/ })).not.toBeInTheDocument();
  });

  it("personne inconnue : message clair, retour possible", async () => {
    rendre({ url: "/personnes/pers-inconnue" });
    expect(
      await screen.findByText("Cette personne n'existe pas ou n'est plus dans l'équipe."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis la fiche s'affiche", async () => {
    let appels = 0;
    rendre({
      modifier: remplacer(patron.OP_FICHE_PERSONNE.nom, (impl) =>
        implementer(impl.operation, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
        }),
      ),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("La fiche ne s'est pas chargée.");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("une erreur autre que 404 n'est pas prise pour une personne inconnue", async () => {
    rendre({
      modifier: remplacer(patron.OP_FICHE_PERSONNE.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurHttp(500, "panne", "ERREUR");
        }),
      ),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("La fiche ne s'est pas chargée.");
    expect(screen.queryByText(/n'existe pas/)).not.toBeInTheDocument();
  });
});

describe("PatronPersonne · textes", () => {
  const cles = (objet: Record<string, unknown>, prefixe = ""): string[] =>
    Object.entries(objet).flatMap(([cle, valeur]) =>
      typeof valeur === "object" && valeur !== null
        ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
        : [`${prefixe}${cle}`],
    );

  it("l'anglais et le pidgin ont les mêmes clés que le français (textes à traduire, vides)", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });

  it("le français n'a aucune valeur vide", () => {
    const vides = cles(fr).filter((cle) => {
      const valeur = cle
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], fr);
      return String(valeur).trim() === "";
    });
    expect(vides).toEqual([]);
  });

  it("se lit en anglais et en pidgin, pluriels compris", () => {
    const en = creerI18n("en");
    expect(en.t("pied.desactiver.libelle", { ns: "PatronPersonne" })).toBe(
      "Deactivate the account",
    );
    expect(en.t("badge.ecarts", { ns: "PatronPersonne", count: 3 })).toBe("3 DISCREPANCIES");
    const pcm = creerI18n("pcm");
    expect(pcm.t("pied.desactiver.libelle", { ns: "PatronPersonne" })).toBe("Put di account off");
    expect(pcm.t("badge.ecarts", { ns: "PatronPersonne", count: 3 })).toBe("3 DIFFERENCE DEM");
  });
});
