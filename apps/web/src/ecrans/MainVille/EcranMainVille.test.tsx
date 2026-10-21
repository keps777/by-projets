import { ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CLE_DERNIERE_VILLE, remplacerFournisseurPosition } from "./position";
import {
  avecRecherche,
  clientMainVille,
  espionnerRecherches,
  rendreAppMainVille,
  sourceModifiee,
} from "./test-outils";

/** Attend que l'accueil ait ses offres (la ligne de Clarisse est la première). */
async function attendreEcran() {
  return screen.findByText(/Clarisse/);
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien de la zone principale qui porte ce texte. */
function lien(texte: string | RegExp): HTMLElement {
  const trouve = within(principal())
    .getAllByText(texte)
    .map((el) => el.closest("a"))
    .find((a): a is HTMLAnchorElement => a !== null);
  if (!trouve) throw new Error(`Pas de lien pour « ${String(texte)} »`);
  return trouve;
}

const champ = (nom: "Départ" | "Arrivée") => screen.getByLabelText(nom) as HTMLInputElement;

const restaurations: Array<() => void> = [];
afterEach(() => {
  while (restaurations.length > 0) restaurations.pop()?.();
});

/** Fait répondre le fournisseur de position (null : permission refusée). */
function positionDe(position: { latitude: number; longitude: number } | null) {
  restaurations.push(remplacerFournisseurPosition({ position: () => Promise.resolve(position) }));
}

const DOUALA = { latitude: 4.0483, longitude: 9.7043 };
const YAOUNDE = { latitude: 3.866, longitude: 11.52 };

describe("MainVille · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : marque, salutation du profil et pastille DIRECT qui pulse", async () => {
    rendreAppMainVille();
    await attendreEcran();
    expect(screen.getByText("AfriMove")).toBeInTheDocument();
    expect(screen.getByText("Bonjour Aïcha")).toBeInTheDocument();
    const direct = screen.getByText("DIRECT · 07:38");
    expect(direct.querySelector("[data-pulse='true']")).not.toBeNull();
    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accueil · mode « dans la même ville » (ville détectée, départ, arrivée)",
    );
  });

  it("affiche le mode « Dans la même ville » choisi, la ville détectée et « Changer de ville »", async () => {
    rendreAppMainVille();
    await attendreEcran();
    const mode = screen.getByRole("group", { name: "Type de trajet" });
    expect(within(mode).getByRole("button", { name: "Dans la même ville" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(mode).getByRole("button", { name: "Entre villes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("Douala")).toBeInTheDocument();
    expect(screen.getByText("· détectée par ta position")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Changer de ville ▾" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
  });

  it("affiche les champs Départ (ma position) et Arrivée, et le bouton pour inverser", async () => {
    rendreAppMainVille();
    await attendreEcran();
    expect(champ("Départ")).toHaveValue("Akwa, marché central · ma position");
    expect(champ("Arrivée")).toHaveValue("Bonabéri, carrefour Ancien Dalip");
    expect(screen.getByRole("button", { name: "Inverser le sens" })).toBeInTheDocument();
  });

  it("affiche les trois moments, Maintenant choisi", async () => {
    rendreAppMainVille();
    await attendreEcran();
    const moments = screen.getByRole("group", { name: "Quand partir" });
    expect(
      within(moments)
        .getAllByRole("button")
        .map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
    ).toEqual([
      ["Maintenant", "true"],
      ["Dans 1 h", "false"],
      ["Chaque matin 07:00", "false"],
    ]);
  });

  it("affiche le résumé du trajet et les filtres Tout · Moto · Covoit · Bus", async () => {
    rendreAppMainVille();
    await attendreEcran();
    expect(screen.getByText("Akwa → Bonabéri · 9 km")).toBeInTheDocument();
    const filtres = screen.getByRole("group", { name: "Types de trajet" });
    expect(
      within(filtres)
        .getAllByRole("button")
        .map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
    ).toEqual([
      ["Tout", "true"],
      ["Moto", "false"],
      ["Covoit", "false"],
      ["Bus", "false"],
    ]);
  });

  it("affiche les quatre offres mélangées avec leur délai, leur détail et leur prix", async () => {
    rendreAppMainVille();
    await attendreEcran();
    expect(lien(/Clarisse/)).toHaveTextContent(
      "3 minCovoiturage Clarisse · vérifiéeHyundai · 3 places · passe par Bonanjo · 25 min700",
    );
    expect(lien(/Paul/)).toHaveTextContent(
      "5 minMoto-taxi Paul · casque fournivient te chercher · 18 min de trajet500",
    );
    expect(lien(/Socatur/)).toHaveTextContent(
      "07:50Bus de ville ligne 3 · Socaturarrêt Marché central · 40 min · 12 places250",
    );
    expect(lien(/Jean-Marc/)).toHaveTextContent(
      "08:00Covoiturage Jean-Marc · régulierchaque matin · Toyota · 2 places · 4,8 ★600",
    );
  });

  it("affiche les cartes « Colis en ville » et « Je conduis »", async () => {
    rendreAppMainVille();
    await attendreEcran();
    expect(lien("Colis en ville")).toHaveTextContent("Colis en villemoto · dès 1 000 F");
    expect(lien("Je conduis")).toHaveTextContent("Je conduisproposer mon trajet");
  });

  it("garde la barre d'onglets voyageur, Voyager courant", async () => {
    rendreAppMainVille();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(
      within(barre)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Voyager", "Colis", "Covoit", "Moi"]);
    expect(within(barre).getByRole("link", { name: "Voyager" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt »", async () => {
    rendreAppMainVille();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    // La note « 4,8 ★ » est du texte de la maquette, pas un emoji : on l'écarte avant de chercher les pictogrammes.
    expect(document.body.textContent?.replaceAll("★", "")).not.toMatch(
      /\p{Extended_Pictographic}/u,
    );
  });

  it("garde des cibles tactiles d'au moins 44 px (offres, cartes, inverser)", async () => {
    rendreAppMainVille();
    await attendreEcran();
    const hauteurMin = (el: HTMLElement) => parseFloat(getComputedStyle(el).minHeight);
    for (const texte of [
      /Clarisse/,
      /Paul/,
      /Socatur/,
      /Jean-Marc/,
      "Colis en ville",
      "Je conduis",
    ]) {
      expect(hauteurMin(lien(texte)), String(texte)).toBeGreaterThanOrEqual(44);
    }
    expect(
      parseFloat(getComputedStyle(screen.getByRole("button", { name: "Inverser le sens" })).height),
    ).toBeGreaterThanOrEqual(44);
    expect(hauteurMin(champ("Départ"))).toBeGreaterThanOrEqual(42);
  });
});

describe("MainVille · navigation identique à la maquette", () => {
  const liens: ReadonlyArray<readonly [string | RegExp, string]> = [
    [/Clarisse/, "/paiement/offre-ville-1-clarisse-verifiee"],
    [/Paul/, "/paiement/offre-ville-2-paul-casque-fourni"],
    [/Socatur/, "/paiement/offre-ville-3-ligne-3-socatur"],
    [/Jean-Marc/, "/paiement/offre-ville-4-jean-marc-regulier"],
    ["Colis en ville", "/colis"],
    ["Je conduis", "/covoit/conducteur"],
  ];

  it.each(liens)("« %s » mène à %s", async (texte, chemin) => {
    const { routeur } = rendreAppMainVille();
    await attendreEcran();
    expect(lien(texte)).toHaveAttribute("href", chemin);
    await userEvent.click(lien(texte));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("« Entre villes » ramène à l'accueil entre villes", async () => {
    const { routeur } = rendreAppMainVille();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Entre villes" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it.each([
    ["Colis", "/colis"],
    ["Covoit", "/covoit"],
    ["Moi", "/moi"],
    ["Voyager", "/voyager"],
  ])("l'onglet « %s » mène à %s", async (nom, chemin) => {
    const { routeur } = rendreAppMainVille();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: nom })).toHaveAttribute("href", chemin);
    await userEvent.click(within(barre).getByRole("link", { name: nom }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });
});

describe("MainVille · filtres de la liste", () => {
  it.each([
    ["Moto", ["moto_taxi"], [/Paul/]],
    ["Covoit", ["covoiturage"], [/Clarisse/, /Jean-Marc/]],
    ["Bus", ["bus_ville"], [/Socatur/]],
  ] as const)(
    "« %s » demande les offres %j et ne garde que celles-là",
    async (nom, types, restantes) => {
      const { source, recherches } = espionnerRecherches();
      rendreAppMainVille({ client: clientMainVille(source) });
      await attendreEcran();
      expect(recherches.at(-1)?.types).toBeUndefined();

      await userEvent.click(screen.getByRole("button", { name: nom }));
      await waitFor(() => expect(recherches.at(-1)?.types).toEqual(types));
      expect(screen.getByRole("button", { name: nom })).toHaveAttribute("aria-pressed", "true");
      await waitFor(() =>
        expect(principal().querySelectorAll("a[data-type]")).toHaveLength(restantes.length),
      );
      for (const texte of restantes) expect(lien(texte)).toBeInTheDocument();
      // Le résumé reste affiché pendant que la liste se filtre.
      expect(screen.getByText("Akwa → Bonabéri · 9 km")).toBeInTheDocument();
    },
  );

  it("« Tout » les remet toutes", async () => {
    rendreAppMainVille();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Moto" }));
    await waitFor(() => expect(principal().querySelectorAll("a[data-type]")).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Tout" }));
    await waitFor(() => expect(principal().querySelectorAll("a[data-type]")).toHaveLength(4));
  });
});

describe("MainVille · départ, arrivée et sens", () => {
  it("inverser échange les deux champs et relance la recherche dans l'autre sens", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(recherches.at(-1)?.depart).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Inverser le sens" }));
    expect(champ("Départ")).toHaveValue("Bonabéri, carrefour Ancien Dalip");
    expect(champ("Arrivée")).toHaveValue("Akwa, marché central");
    await waitFor(() =>
      expect(recherches.at(-1)).toMatchObject({
        depart: "Bonabéri, carrefour Ancien Dalip",
        arrivee: "Akwa, marché central",
      }),
    );
    // Les offres ne disparaissent pas pendant la recherche.
    expect(lien(/Clarisse/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Inverser le sens" }));
    expect(champ("Départ")).toHaveValue("Akwa, marché central");
    expect(champ("Arrivée")).toHaveValue("Bonabéri, carrefour Ancien Dalip");
  });

  it("saisir une arrivée lance la recherche quand on valide, pas à chaque lettre", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    const avant = recherches.length;

    await userEvent.clear(champ("Arrivée"));
    await userEvent.type(champ("Arrivée"), "Bonamoussadi");
    expect(champ("Arrivée")).toHaveValue("Bonamoussadi");
    expect(recherches).toHaveLength(avant);

    await userEvent.type(champ("Arrivée"), "{Enter}");
    await waitFor(() =>
      expect(recherches.at(-1)).toMatchObject({
        depart: "Akwa, marché central",
        arrivee: "Bonamoussadi",
      }),
    );
    expect(champ("Arrivée")).toHaveValue("Bonamoussadi");
    // Le départ reste sur la position du voyageur.
    expect(champ("Départ")).toHaveValue("Akwa, marché central · ma position");
  });

  it("changer le départ à la main retire la mention « ma position »", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();

    await userEvent.clear(champ("Départ"));
    await userEvent.type(champ("Départ"), "Bonanjo{Enter}");
    await waitFor(() => expect(recherches.at(-1)?.depart).toBe("Bonanjo"));
    expect(champ("Départ")).toHaveValue("Bonanjo");
  });

  it("un champ vidé ne lance pas de recherche : le lieu précédent revient", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    const avant = recherches.length;
    await userEvent.clear(champ("Arrivée"));
    await userEvent.tab();
    expect(champ("Arrivée")).toHaveValue("Bonabéri, carrefour Ancien Dalip");
    expect(recherches).toHaveLength(avant);
  });
});

describe("MainVille · ville détectée par la position", () => {
  it("cherche dans la ville où se trouve le voyageur et l'affiche comme détectée", async () => {
    positionDe(YAOUNDE);
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await waitFor(() => expect(recherches.at(-1)?.ville).toBe("Yaoundé"));
    await waitFor(() => expect(screen.getByText("Yaoundé")).toBeInTheDocument());
    expect(screen.getByText("· détectée par ta position")).toBeInTheDocument();
    expect(localStorage.getItem(CLE_DERNIERE_VILLE)).toBe("Yaoundé");
  });

  it("reste sur Douala quand la position est à Douala", async () => {
    positionDe(DOUALA);
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(recherches.every((r) => r.ville === "Douala")).toBe(true);
    expect(screen.getByText("· détectée par ta position")).toBeInTheDocument();
  });

  it("permission refusée : repli sur la dernière ville mémorisée, sans prétendre l'avoir détectée", async () => {
    localStorage.setItem(CLE_DERNIERE_VILLE, "Bafoussam");
    positionDe(null);
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(recherches.every((r) => r.ville === "Bafoussam")).toBe(true);
    expect(screen.getByText("Bafoussam")).toBeInTheDocument();
    expect(screen.queryByText("· détectée par ta position")).not.toBeInTheDocument();
    // Le refus n'écrase pas la mémoire.
    expect(localStorage.getItem(CLE_DERNIERE_VILLE)).toBe("Bafoussam");
  });

  it("permission refusée et rien de mémorisé : on cherche à Douala", async () => {
    positionDe(null);
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(recherches.every((r) => r.ville === "Douala")).toBe(true);
  });

  it("position hors des villes desservies : repli sur la ville mémorisée", async () => {
    localStorage.setItem(CLE_DERNIERE_VILLE, "Kribi");
    positionDe({ latitude: 0, longitude: 0 });
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(recherches.every((r) => r.ville === "Kribi")).toBe(true);
    expect(screen.queryByText("· détectée par ta position")).not.toBeInTheDocument();
  });

  it("« Changer de ville » propose les villes du réseau, mémorise le choix et n'écrase pas par la position", async () => {
    // La position arrive après le choix du voyageur : le choix garde le dernier mot.
    let donnerPosition: (p: { latitude: number; longitude: number }) => void = () => undefined;
    restaurations.push(
      remplacerFournisseurPosition({
        position: () => new Promise((resolve) => (donnerPosition = resolve)),
      }),
    );
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();

    await userEvent.click(screen.getByRole("button", { name: "Changer de ville ▾" }));
    const feuille = await screen.findByRole("dialog");
    expect(within(feuille).getByRole("button", { name: "Douala" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(await within(feuille).findByRole("button", { name: "Bamenda" }));

    await waitFor(() => expect(recherches.at(-1)?.ville).toBe("Bamenda"));
    expect(screen.getByText("Bamenda")).toBeInTheDocument();
    expect(screen.queryByText("· détectée par ta position")).not.toBeInTheDocument();
    expect(localStorage.getItem(CLE_DERNIERE_VILLE)).toBe("Bamenda");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => donnerPosition(YAOUNDE));
    expect(recherches.at(-1)?.ville).toBe("Bamenda");
    expect(screen.getByText("Bamenda")).toBeInTheDocument();
  });

  it("la feuille des villes dit quand elle ne se charge pas, et réessaie", async () => {
    let appels = 0;
    const source = sourceModifiee((scenario) => ({
      ...scenario,
      operations: [
        implementer(voyageur.OP_RESEAU, async (_p, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau();
          const origine = scenario.operations.find(
            (o) => o.operation.nom === voyageur.OP_RESEAU.nom,
          )!;
          return (await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            {},
            ctx,
          )) as c.ApercuReseau;
        }),
        ...scenario.operations,
      ],
    }));
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Changer de ville ▾" }));
    const feuille = await screen.findByRole("dialog");
    expect(await within(feuille).findByRole("alert")).toHaveTextContent(
      "Les villes ne se sont pas chargées.",
    );
    await userEvent.click(within(feuille).getByRole("button", { name: "Réessayer" }));
    expect(await within(feuille).findByRole("button", { name: "Yaoundé" })).toBeInTheDocument();
  });
});

describe("MainVille · moments et trajet régulier du matin", () => {
  it("« Dans 1 h » relance la recherche pour le moment choisi", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(recherches.at(-1)?.quand).toBe("maintenant");

    await userEvent.click(screen.getByRole("button", { name: "Dans 1 h" }));
    await waitFor(() => expect(recherches.at(-1)?.quand).toBe("dans_1h"));
    expect(screen.getByRole("button", { name: "Dans 1 h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Maintenant" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("« Chaque matin 07:00 » enregistre le trajet régulier et affiche l'explication du serveur (06:40, jours ouvrés)", async () => {
    const enregistrements: c.DefinirTrajetRegulier[] = [];
    const source = sourceModifiee((scenario) => ({
      ...scenario,
      operations: [
        implementer(voyageur.OP_DEFINIR_TRAJET_REGULIER, (p) => {
          enregistrements.push(p);
          return {
            libelle: "Mon trajet du matin · Akwa → Bonabéri · 07:00",
            departA: "07:00",
            actif: p.actif,
            explication: "Chaque jour ouvré, l'app te propose à 06:40 les voitures qui partent.",
          };
        }),
        ...scenario.operations,
      ],
    }));
    const { source: espion, recherches } = espionnerRecherches(source);
    rendreAppMainVille({ client: clientMainVille(espion) });
    await attendreEcran();
    expect(enregistrements).toHaveLength(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Chaque matin 07:00" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Chaque jour ouvré, l'app te propose à 06:40 les voitures qui partent.",
    );
    expect(enregistrements).toEqual([{ actif: true }]);
    expect(screen.getByRole("button", { name: "Chaque matin 07:00" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(recherches.at(-1)?.quand).toBe("chaque_matin"));
  });

  it("avec le mock de la planche CovoitVille, l'explication parle de 06:40 les jours ouvrés", async () => {
    rendreAppMainVille();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Chaque matin 07:00" }));
    const message = await screen.findByRole("status");
    expect(message).toHaveTextContent(/Chaque jour ouvré/);
    expect(message).toHaveTextContent(/06:40/);
  });

  it("quand l'enregistrement échoue, le moment précédent revient et l'erreur est dite", async () => {
    const source = sourceModifiee((scenario) => ({
      ...scenario,
      operations: [
        implementer(voyageur.OP_DEFINIR_TRAJET_REGULIER, () => {
          throw new ErreurReseau();
        }),
        ...scenario.operations,
      ],
    }));
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Chaque matin 07:00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le trajet du matin n'a pas pu être enregistré. Réessaie.",
    );
    expect(screen.getByRole("button", { name: "Maintenant" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Chaque matin 07:00" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // L'écran reste utilisable.
    expect(lien(/Clarisse/)).toBeInTheDocument();
  });

  it("quitter « Chaque matin » efface le message du trajet du matin", async () => {
    rendreAppMainVille();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Chaque matin 07:00" }));
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Maintenant" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});

describe("MainVille · chargement, vide et erreur", () => {
  it("montre des lignes grises pendant le chargement, sans casser la mise en page", async () => {
    const source = avecRecherche(() => new Promise<c.ResultatRechercheVille>(() => undefined));
    rendreAppMainVille({ client: clientMainVille(source) });
    const etat = await screen.findByRole("status", { name: "Chargement des offres" });
    expect(etat).toHaveAttribute("aria-busy", "true");
    expect(principal()).toHaveAttribute("data-etat", "chargement");
    // Les cartes et la barre d'onglets restent.
    expect(lien("Colis en ville")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inverser le sens" })).toBeInTheDocument();
  });

  it("dit qu'il n'y a aucune offre quand la liste est vide", async () => {
    const source = avecRecherche((reponse) => ({ ...reponse, offres: [] }));
    rendreAppMainVille({ client: clientMainVille(source) });
    const vide = await screen.findByText("Aucune offre pour ce trajet pour le moment.");
    expect(vide).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    // Le résumé et les filtres restent.
    expect(screen.getByText("Akwa → Bonabéri · 9 km")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Moto" })).toBeInTheDocument();
  });

  it("dit l'erreur, garde le reste de l'écran et réessaie", async () => {
    let appels = 0;
    const source = avecRecherche((reponse) => {
      appels += 1;
      if (appels === 1) throw new ErreurReseau();
      return reponse;
    });
    rendreAppMainVille({ client: clientMainVille(source) });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Les offres ne se sont pas chargées.");
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(lien("Colis en ville")).toBeInTheDocument();
    expect(lien("Je conduis")).toBeInTheDocument();

    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "pret");
  });

  it("la salutation se contente de « Bonjour » si le profil n'a pas de prénom", async () => {
    const source = sourceModifiee((scenario) => ({
      ...scenario,
      operations: [
        implementer(voyageur.OP_PROFIL, async (_p, ctx) => {
          const origine = scenario.operations.find(
            (o) => o.operation.nom === voyageur.OP_PROFIL.nom,
          )!;
          const profil = (await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            undefined,
            ctx,
          )) as c.Profil;
          return { ...profil, prenom: "" };
        }),
        ...scenario.operations,
      ],
    }));
    rendreAppMainVille({ client: clientMainVille(source) });
    await attendreEcran();
    expect(screen.getByText("Bonjour")).toBeInTheDocument();
  });
});
