import { ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  COLIS_MAMAN,
  DEPART_ALPHA,
  DEPART_BETA,
  DEPART_OMEGA,
  avecPlansEnDirect,
  avecRecherche,
  clientMain,
  espionnerRecherches,
  rendreAppMain,
  sourceModifiee,
} from "./test-outils";

/** Attend que l'accueil ait ses départs (la ligne de Bêta Express est la première). */
async function attendreEcran() {
  return screen.findByText("Bêta Express");
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

/** La ligne (lien) de la liste des départs qui contient cette compagnie ou ce conducteur. */
function ligne(texte: string | RegExp): HTMLElement {
  return lien(texte);
}

const ISO = (heure: string, jour = "2027-01-05") => `${jour}T${heure}:00.000+01:00`;

describe("Main · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : marque, salutation du profil et pastille DIRECT qui pulse", async () => {
    rendreAppMain();
    await attendreEcran();
    expect(screen.getByText("AfriMove")).toBeInTheDocument();
    expect(screen.getByText("Bonjour Aïcha")).toBeInTheDocument();
    const direct = screen.getByText("DIRECT · 07:38");
    expect(direct.querySelector("[data-pulse='true']")).not.toBeNull();
    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accueil — départs en direct (1 touche vers tout)",
    );
  });

  it("affiche le sélecteur de mode, les volets DLA et YDE, la position, le jour et le résumé du filtre", async () => {
    rendreAppMain();
    await attendreEcran();
    const mode = screen.getByRole("group", { name: "Type de trajet" });
    expect(within(mode).getByRole("button", { name: "Entre villes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(mode).getByRole("button", { name: "Dans la même ville" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("Départ")).toBeInTheDocument();
    expect(screen.getByText("Arrivée")).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Changer la ville de départ : Douala" })).getByRole(
        "img",
        { name: "Douala" },
      ),
    ).toHaveTextContent("DLA");
    expect(
      within(
        screen.getByRole("button", { name: "Changer la ville d'arrivée : Yaoundé" }),
      ).getByRole("img", { name: "Yaoundé" }),
    ).toHaveTextContent("YDE");
    expect(screen.getByRole("button", { name: "Inverser le sens" })).toBeInTheDocument();
    expect(screen.getByText("Tu es à Douala · Akwa → Yaoundé Mvan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auj. ▾" })).toBeInTheDocument();
    expect(lien(/Toutes classes · 5 compagnies/)).toHaveTextContent("2 préférées");
  });

  it("affiche les départs à places réelles : trois bus puis le covoiturage, avec leurs prix", async () => {
    rendreAppMain();
    await attendreEcran();
    expect(screen.getByText("Départs · places réelles")).toBeInTheDocument();

    expect(ligne("Bêta Express")).toHaveTextContent("08:00Bêta Express VIP9 places7 500");
    expect(ligne("Alpha Voyages")).toHaveTextContent("08:30Alpha Voyages Classique18 places4 000");
    expect(ligne("Oméga Transports")).toHaveTextContent(
      "09:30Oméga Transports Classiqueplus que 33 800",
    );
    expect(ligne("Oméga Transports")).toHaveAttribute("data-urgent", "oui");
    expect(ligne("Bêta Express")).not.toHaveAttribute("data-urgent");
    expect(ligne(/Covoiturage/)).toHaveTextContent(
      "08:45Covoiturage Samuel · vérifiéBonapriso · 2 places · Toyota5 000",
    );
    expect(lien(/14 bus et 6 covoiturages aujourd'hui · voir tout/)).toBeInTheDocument();
  });

  it("affiche les six raccourcis et la notification du colis", async () => {
    rendreAppMain();
    await attendreEcran();
    for (const titre of [
      "Envoyer un colis",
      "Payer pour un proche",
      "Groupe · bus entier",
      "Moto vers la gare",
      "Monter en route",
      "Sans internet",
    ]) {
      expect(lien(titre)).toBeInTheDocument();
    }
    expect(lien(/Ton colis pour Maman est arrivé à Bafoussam/)).toHaveTextContent(
      "Code de retrait envoyé · voir la photo",
    );
  });

  it("garde la barre d'onglets voyageur, Voyager courant", async () => {
    rendreAppMain();
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
    rendreAppMain();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("garde des cibles tactiles d'au moins 44 px (lignes, cartes, raccourcis)", async () => {
    rendreAppMain();
    await attendreEcran();
    const hauteurMin = (el: HTMLElement) => parseFloat(getComputedStyle(el).minHeight);
    for (const texte of [
      "Bêta Express",
      "Alpha Voyages",
      "Oméga Transports",
      /Covoiturage/,
      "Envoyer un colis",
      "Moto vers la gare",
      /Ton colis pour Maman/,
      /voir tout/,
    ]) {
      expect(hauteurMin(lien(texte)), String(texte)).toBeGreaterThanOrEqual(44);
    }
    expect(
      parseFloat(getComputedStyle(screen.getByRole("button", { name: "Inverser le sens" })).height),
    ).toBeGreaterThanOrEqual(44);
    for (const bouton of [
      screen.getByRole("button", { name: "Changer la ville de départ : Douala" }),
      screen.getByRole("button", { name: "Changer la ville d'arrivée : Yaoundé" }),
    ]) {
      expect(hauteurMin(bouton)).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("Main · navigation identique à la maquette", () => {
  const liens: ReadonlyArray<readonly [string | RegExp, string]> = [
    ["Bêta Express", `/depart/${DEPART_BETA.id}`],
    ["Alpha Voyages", `/depart/${DEPART_ALPHA.id}`],
    ["Oméga Transports", `/depart/${DEPART_OMEGA.id}`],
    [/Covoiturage/, "/covoit"],
    [/14 bus et 6 covoiturages/, "/reseau"],
    ["Envoyer un colis", "/colis"],
    ["Payer pour un proche", "/proche"],
    ["Groupe · bus entier", "/groupe"],
    ["Moto vers la gare", "/course"],
    ["Monter en route", "/monter-en-route"],
    ["Sans internet", "/sans-internet"],
    [/Ton colis pour Maman/, `/colis/${COLIS_MAMAN}`],
    [/Toutes classes/, "/voyager/filtres"],
  ];

  it.each(liens)("« %s » mène à %s", async (texte, chemin) => {
    const { routeur } = rendreAppMain();
    await attendreEcran();
    expect(lien(texte)).toHaveAttribute("href", chemin);
    await userEvent.click(lien(texte));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("« Dans la même ville » ouvre MainVille", async () => {
    const { routeur } = rendreAppMain();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Dans la même ville" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager/ville"));
  });

  const onglets = [
    ["Colis", "/colis"],
    ["Covoit", "/covoit"],
    ["Moi", "/moi"],
  ] as const;

  it.each(onglets)("l'onglet « %s » mène à %s", async (libelle, chemin) => {
    const { routeur } = rendreAppMain();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    await userEvent.click(within(barre).getByRole("link", { name: libelle }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("l'onglet « Voyager » reste sur l'écran", async () => {
    const { routeur } = rendreAppMain();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    await userEvent.click(within(barre).getByRole("link", { name: "Voyager" }));
    expect(routeur.state.location.pathname).toBe("/voyager");
    expect(await attendreEcran()).toBeInTheDocument();
  });
});

describe("Main · inverser le sens et choisir les villes", () => {
  const volets = (cote: "départ" | "arrivée") =>
    screen.getByRole("button", {
      name: new RegExp(`Changer la ville d${cote === "départ" ? "e départ" : "'arrivée"} :`),
    });

  it("inverser échange départ et arrivée, relance la recherche et fait basculer les lames", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    expect(recherches.at(-1)).toEqual({ depart: "DLA", arrivee: "YDE" });
    // Premier affichage : les lames sont posées, sans animation.
    expect(document.querySelectorAll("[class*='lameAnimee']")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Inverser le sens" }));

    expect(volets("départ")).toHaveAccessibleName("Changer la ville de départ : Yaoundé");
    expect(volets("arrivée")).toHaveAccessibleName("Changer la ville d'arrivée : Douala");
    expect(within(volets("départ")).getByRole("img")).toHaveTextContent("YDE");
    expect(within(volets("arrivée")).getByRole("img")).toHaveTextContent("DLA");
    // Six lames ont changé de lettre : elles basculent l'une après l'autre.
    expect(document.querySelectorAll("[class*='lameAnimee']")).toHaveLength(6);
    await waitFor(() => expect(recherches.at(-1)).toEqual({ depart: "YDE", arrivee: "DLA" }));
    await attendreEcran();
  });

  it("inverser deux fois revient au trajet de départ", async () => {
    rendreAppMain();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Inverser le sens" }));
    await userEvent.click(screen.getByRole("button", { name: "Inverser le sens" }));
    expect(within(volets("départ")).getByRole("img")).toHaveTextContent("DLA");
    expect(within(volets("arrivée")).getByRole("img")).toHaveTextContent("YDE");
  });

  it("toucher la ville de départ ouvre le choix de ville ; choisir Bafoussam change le départ", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    await userEvent.click(volets("départ"));

    const feuille = await screen.findByRole("dialog", { name: "Ville de départ" });
    expect(await within(feuille).findByRole("button", { name: "Douala" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(feuille).getByRole("button", { name: "Kribi" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(within(feuille).getByRole("button", { name: "Bafoussam" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(volets("départ")).toHaveAccessibleName("Changer la ville de départ : Bafoussam");
    expect(within(volets("départ")).getByRole("img")).toHaveTextContent("BAF");
    expect(within(volets("arrivée")).getByRole("img")).toHaveTextContent("YDE");
    await waitFor(() => expect(recherches.at(-1)).toEqual({ depart: "BAF", arrivee: "YDE" }));
    await attendreEcran();
  });

  it("toucher la ville d'arrivée ouvre « Ville d'arrivée » ; choisir la ville de départ inverse le sens", async () => {
    rendreAppMain();
    await attendreEcran();
    await userEvent.click(volets("arrivée"));
    const feuille = await screen.findByRole("dialog", { name: "Ville d'arrivée" });
    await userEvent.click(await within(feuille).findByRole("button", { name: "Douala" }));
    expect(within(volets("départ")).getByRole("img")).toHaveTextContent("YDE");
    expect(within(volets("arrivée")).getByRole("img")).toHaveTextContent("DLA");
  });

  it("le choix de ville se ferme avec le bouton Fermer sans rien changer", async () => {
    rendreAppMain();
    await attendreEcran();
    await userEvent.click(volets("départ"));
    const feuille = await screen.findByRole("dialog", { name: "Ville de départ" });
    await userEvent.click(within(feuille).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(volets("départ")).getByRole("img")).toHaveTextContent("DLA");
  });

  it("affiche une erreur dans la feuille quand la liste des villes ne se charge pas, et permet de réessayer", async () => {
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
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    await userEvent.click(volets("départ"));
    const feuille = await screen.findByRole("dialog", { name: "Ville de départ" });
    expect(await within(feuille).findByRole("alert")).toHaveTextContent(
      "Les villes ne se sont pas chargées.",
    );
    await userEvent.click(within(feuille).getByRole("button", { name: "Réessayer" }));
    expect(await within(feuille).findByRole("button", { name: "Douala" })).toBeInTheDocument();
  });
});

describe("Main · choisir le jour", () => {
  it("« Auj. ▾ » ouvre le choix du jour ; « Demain » relance la recherche pour le lendemain", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Auj. ▾" }));

    const feuille = await screen.findByRole("dialog", { name: "Choisir le jour" });
    const boutons = within(feuille).getAllByRole("button", { name: /^(?!Fermer)/ });
    expect(boutons).toHaveLength(7);
    expect(within(feuille).getByRole("button", { name: "Aujourd'hui" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(boutons[2]).toHaveTextContent("jeudi 7 janvier");

    await userEvent.click(within(feuille).getByRole("button", { name: "Demain" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dem. ▾" })).toBeInTheDocument();
    await waitFor(() =>
      expect(recherches.at(-1)).toEqual({ depart: "DLA", arrivee: "YDE", jour: "2027-01-06" }),
    );
    await attendreEcran();
    // Un autre jour que le jour courant : le lien du réseau ne dit plus « aujourd'hui ».
    expect(lien(/voir tout/)).toHaveTextContent("14 bus et 6 covoiturages ce jour-là · voir tout");
  });

  it("choisir un jour plus lointain affiche le jour dans la puce, puis « Aujourd'hui » revient", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Auj. ▾" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "jeudi 7 janvier" }),
    );
    expect(screen.getByRole("button", { name: "jeu. 7 ▾" })).toBeInTheDocument();
    await waitFor(() => expect(recherches.at(-1)?.jour).toBe("2027-01-07"));

    await userEvent.click(screen.getByRole("button", { name: "jeu. 7 ▾" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Aujourd'hui" }),
    );
    expect(screen.getByRole("button", { name: "Auj. ▾" })).toBeInTheDocument();
    // Le trajet du jour est déjà en cache : la liste revient aussitôt.
    expect(await attendreEcran()).toBeInTheDocument();
    expect(recherches.map((r) => r.jour)).toEqual([undefined, "2027-01-07"]);
  });
});

describe("Main · onglets Tout, Bus, Covoit", () => {
  it("Bus retire le covoiturage, Covoit ne garde que lui, Tout les remet", async () => {
    rendreAppMain();
    await attendreEcran();
    const tout = screen.getByRole("button", { name: "Tout" });
    const bus = screen.getByRole("button", { name: "Bus" });
    const covoit = screen.getByRole("button", { name: "Covoit" });
    expect(tout).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(bus);
    expect(bus).toHaveAttribute("aria-pressed", "true");
    expect(tout).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Alpha Voyages")).toBeInTheDocument();
    expect(screen.queryByText(/Samuel/)).not.toBeInTheDocument();

    await userEvent.click(covoit);
    expect(covoit).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Alpha Voyages")).not.toBeInTheDocument();
    expect(screen.getByText(/Samuel/)).toBeInTheDocument();

    await userEvent.click(tout);
    expect(screen.getByText("Alpha Voyages")).toBeInTheDocument();
    expect(screen.getByText(/Samuel/)).toBeInTheDocument();
  });
});

describe("Main · places en temps réel", () => {
  it("met à jour les places et la jauge d'une ligne quand le plan de sièges change, sans recharger", async () => {
    const direct = avecPlansEnDirect({
      [DEPART_BETA.id]: 9,
      [DEPART_ALPHA.id]: 18,
      [DEPART_OMEGA.id]: 3,
    });
    rendreAppMain({ client: clientMain(direct.source) });
    await attendreEcran();
    await waitFor(() => expect(direct.abonnes()).toHaveLength(3));
    expect(ligne("Bêta Express")).toHaveTextContent("9 places");

    // Un autre voyageur prend le siège 4 du bus de 08:00.
    act(() => {
      direct.emettre({
        type: "siege",
        departId: DEPART_BETA.id,
        siege: 4,
        etat: "pris",
        versionPlan: 2,
      });
    });
    await waitFor(() => expect(ligne("Bêta Express")).toHaveTextContent("8 places"));
    // Capacité 30 : 22 places prises sur 30.
    const jauge = ligne("Bêta Express").querySelector("[class*='jaugePleine']") as HTMLElement;
    expect(jauge.style.width).toBe("73%");
    // Les autres lignes ne bougent pas.
    expect(ligne("Alpha Voyages")).toHaveTextContent("18 places");
    expect(ligne("Oméga Transports")).toHaveTextContent("plus que 3");
  });

  it("passe en rouge « plus que 3 » quand il ne reste que trois places, et « complet » à zéro", async () => {
    const direct = avecPlansEnDirect({ [DEPART_ALPHA.id]: 5 });
    rendreAppMain({ client: clientMain(direct.source) });
    await attendreEcran();
    await waitFor(() => expect(ligne("Alpha Voyages")).toHaveTextContent("5 places"));
    expect(ligne("Alpha Voyages")).not.toHaveAttribute("data-urgent");

    for (const [siege, version] of [
      [1, 2],
      [2, 3],
    ] as const) {
      act(() => {
        direct.emettre({
          type: "siege",
          departId: DEPART_ALPHA.id,
          siege,
          etat: "pris",
          versionPlan: version,
        });
      });
    }
    await waitFor(() => expect(ligne("Alpha Voyages")).toHaveTextContent("plus que 3"));
    expect(ligne("Alpha Voyages")).toHaveAttribute("data-urgent", "oui");

    for (const [siege, version] of [
      [3, 4],
      [4, 5],
      [5, 6],
    ] as const) {
      act(() => {
        direct.emettre({
          type: "siege",
          departId: DEPART_ALPHA.id,
          siege,
          etat: "pris",
          versionPlan: version,
        });
      });
    }
    await waitFor(() => expect(ligne("Alpha Voyages")).toHaveTextContent("complet"));
  });

  it("ignore le plan d'un autre départ : chaque ligne garde ses places", async () => {
    // Dans le scénario de démo, le mock du plan de sièges répond toujours avec le plan de Bêta Express.
    rendreAppMain();
    await attendreEcran();
    await waitFor(() => expect(ligne("Bêta Express")).toHaveTextContent("9 places"));
    // Laisse arriver les plans (requête et canal) : Alpha et Oméga ne prennent pas les 9 places de Bêta.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(ligne("Alpha Voyages")).toHaveTextContent("18 places");
    expect(ligne("Oméga Transports")).toHaveTextContent("plus que 3");
  });

  it("garde le nombre de places de la recherche quand le temps réel est en panne", async () => {
    const source = sourceModifiee((scenario) => ({
      ...scenario,
      operations: [
        implementer(voyageur.OP_PLAN_SIEGES, () => {
          throw new ErreurReseau();
        }),
        ...scenario.operations,
      ],
      flux: [],
    }));
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(ligne("Bêta Express")).toHaveTextContent("9 places");
    expect(ligne("Alpha Voyages")).toHaveTextContent("18 places");
  });
});

describe("Main · modules masqués", () => {
  it("colis masqué : plus de carte « Envoyer un colis », plus de notification, la rangée se referme", async () => {
    rendreAppMain({ masques: ["colis"] });
    await attendreEcran();
    expect(screen.queryByText("Envoyer un colis")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ton colis pour Maman/)).not.toBeInTheDocument();
    const rangee = lien("Payer pour un proche").parentElement as HTMLElement;
    expect(rangee.children).toHaveLength(2);
    expect(rangee.style.getPropertyValue("--colonnes")).toBe("2");
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).queryByRole("link", { name: "Colis" })).not.toBeInTheDocument();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
  });

  it("covoit masqué : plus de ligne de covoiturage, plus d'onglets, le total ne parle que des bus", async () => {
    rendreAppMain({ masques: ["covoit"] });
    await attendreEcran();
    expect(screen.queryByText(/Samuel/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Covoit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bus" })).not.toBeInTheDocument();
    expect(lien(/voir tout/)).toHaveTextContent("14 bus aujourd'hui · voir tout");
    expect(ligne("Alpha Voyages")).toBeInTheDocument();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).queryByRole("link", { name: "Covoit" })).not.toBeInTheDocument();
  });

  it("ussd masqué : plus de « Sans internet », la seconde rangée n'a plus que deux cartes", async () => {
    rendreAppMain({ masques: ["ussd"] });
    await attendreEcran();
    expect(screen.queryByText("Sans internet")).not.toBeInTheDocument();
    const rangee = lien("Moto vers la gare").parentElement as HTMLElement;
    expect(rangee.children).toHaveLength(2);
    expect(rangee.style.getPropertyValue("--colonnes")).toBe("2");
  });

  it("plusieurs modules masqués : l'écran reste complet, sans trou ni bouton grisé", async () => {
    rendreAppMain({ masques: ["colis", "covoit", "ussd"] });
    await attendreEcran();
    for (const titre of [
      "Payer pour un proche",
      "Groupe · bus entier",
      "Moto vers la gare",
      "Monter en route",
    ]) {
      expect(lien(titre)).toBeInTheDocument();
    }
    for (const absent of [/Envoyer un colis/, /Samuel/, /Sans internet/, /Ton colis/]) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
  });
});

describe("Main · états chargement, vide et erreur", () => {
  it("affiche un squelette de la liste pendant le chargement, sans casser la mise en page", async () => {
    rendreAppMain();
    // Avant la réponse : l'en-tête, le trajet et les raccourcis sont déjà là.
    expect(await screen.findByRole("status", { name: "Chargement des départs" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Inverser le sens" })).toBeInTheDocument();
    expect(lien("Payer pour un proche")).toBeInTheDocument();
    await attendreEcran();
    expect(
      screen.queryByRole("status", { name: "Chargement des départs" }),
    ).not.toBeInTheDocument();
  });

  it("affiche l'erreur de chargement dans la liste, garde les raccourcis, et réessaie", async () => {
    let appels = 0;
    const source = avecRecherche((reponse) => {
      appels += 1;
      if (appels === 1) throw new ErreurReseau();
      return reponse;
    });
    rendreAppMain({ client: clientMain(source) });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Les départs ne se sont pas chargés.");
    expect(lien("Payer pour un proche")).toBeInTheDocument();
    expect(lien("Moto vers la gare")).toBeInTheDocument();

    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("affiche « Aucun départ » quand le trajet n'a ni bus ni covoiturage", async () => {
    const source = avecRecherche((reponse) => ({
      ...reponse,
      departs: [],
      covoits: [],
      totaux: { bus: 0, covoiturages: 0 },
    }));
    rendreAppMain({ client: clientMain(source) });
    expect(await screen.findByText("Aucun départ pour ce trajet ce jour-là.")).toBeInTheDocument();
    expect(lien("Payer pour un proche")).toBeInTheDocument();
  });

  it("affiche « Aucun départ » dans l'onglet Covoit quand il n'y a que des bus", async () => {
    const source = avecRecherche((reponse) => ({ ...reponse, covoits: [] }));
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Covoit" }));
    expect(screen.getByText("Aucun départ pour ce trajet ce jour-là.")).toBeInTheDocument();
  });
});

describe("Main · textes du serveur", () => {
  it("suit le filtre, les totaux et la position renvoyés par le serveur", async () => {
    const source = avecRecherche((reponse) => ({
      ...reponse,
      maintenant: ISO("09:05"),
      filtres: { classe: "vip", compagnies: 1, preferees: 0 },
      totaux: { bus: 1, covoiturages: 1 },
      position: { ville: "Yaoundé", gareDepart: "Mvan", gareArrivee: "Akwa" },
    }));
    rendreAppMain({ client: clientMain(source) });
    await attendreEcran();
    expect(screen.getByText("DIRECT · 09:05")).toBeInTheDocument();
    expect(lien(/VIP · 1 compagnie/)).toBeInTheDocument();
    expect(lien(/VIP · 1 compagnie/)).not.toHaveTextContent("préférée");
    expect(screen.getByText("Tu es à Yaoundé · Mvan → Akwa")).toBeInTheDocument();
    expect(lien(/voir tout/)).toHaveTextContent("1 bus et 1 covoiturage aujourd'hui · voir tout");
  });

  it("affiche une compagnie VIP en bleu et le covoiturage sans avatar", async () => {
    rendreAppMain();
    await attendreEcran();
    const vip = within(ligne("Bêta Express")).getByText("VIP");
    expect(vip.className).toMatch(/premium/);
    expect(ligne(/Covoiturage/).querySelector("[class*='avatar']")).toBeNull();
  });
});
