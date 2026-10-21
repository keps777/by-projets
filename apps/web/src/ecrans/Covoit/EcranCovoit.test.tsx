import { ErreurHttp, ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreCovoit, surveiller } from "./rendre-covoit";

/** Attend que la liste des conducteurs soit affichée (Samuel E. est le premier). */
async function attendreEcran() {
  await screen.findByRole("button", { name: /Samuel E\./ });
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** La carte (bouton) d'un conducteur, retrouvée par son nom. */
const carte = (nom: string) => screen.getByRole("button", { name: new RegExp(nom) });

const puce = (nom: string) =>
  within(screen.getByRole("group", { name: "Filtres" })).getByRole("button", { name: nom });

describe("Covoit · rendu de la planche (scénario de démo)", () => {
  it("affiche le titre, la ville, les deux sélecteurs et le trajet de la planche", async () => {
    rendreCovoit();
    await attendreEcran();

    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Covoiturage · interurbain et en ville",
    );
    expect(screen.getByText("Covoiturage")).toBeInTheDocument();
    const entete = document.querySelector("header") as HTMLElement;
    expect(within(entete).getByText("Douala")).toBeInTheDocument();

    const mode = screen.getByRole("group", { name: "Type de trajet" });
    expect(within(mode).getByRole("button", { name: "Entre villes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(mode).getByRole("button", { name: "En ville · Douala" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("glisse pour changer")).toBeInTheDocument();

    const role = screen.getByRole("group", { name: "Mon rôle" });
    expect(within(role).getByRole("button", { name: "Je suis passager" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(role).getByRole("button", { name: "Je conduis" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    expect(document.querySelector("main")).toHaveTextContent("Douala → Kribi");
    expect(screen.getByText("Ce matin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inverser" })).toBeInTheDocument();
  });

  it("affiche les cinq filtres, « Tous » étant choisi", async () => {
    rendreCovoit();
    await attendreEcran();
    expect(puce("Tous")).toHaveAttribute("aria-pressed", "true");
    for (const nom of ["Clim", "Femmes", "Grand bagage", "≤ 4 000"]) {
      expect(puce(nom)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("affiche la carte détaillée du premier conducteur", async () => {
    rendreCovoit();
    await attendreEcran();
    const samuel = carte("Samuel E\\.");
    expect(samuel).toHaveTextContent("SA");
    expect(samuel).toHaveTextContent("Samuel E. · vérifié · 4,9 ★ · 112 trajets");
    expect(samuel).toHaveTextContent("Toyota Corolla grise · LT 882 CE · clim · 2 places");
    expect(samuel).toHaveTextContent("4 000");
    expect(samuel).toHaveTextContent("08:30");
    expect(samuel).toHaveTextContent("Départ Bonapriso, pharmacie du Rond-point · 2 h 30");
    expect(samuel).toHaveTextContent("Arrivée Kribi centre vers 11:00 · 2 arrêts possibles");
    expect(samuel).toHaveTextContent("Payé dans l'app · remboursé si Samuel annule");
    expect(samuel).toHaveTextContent("Réserver");
  });

  it("affiche les cartes compactes des conducteurs suivants, avec « vérifiée » pour Marthe en démo", async () => {
    rendreCovoit();
    await attendreEcran();
    const marthe = carte("Marthe N\\.");
    expect(marthe).toHaveTextContent("MN");
    expect(marthe).toHaveTextContent("Marthe N. · vérifiée · 4,7 ★");
    expect(marthe).toHaveTextContent("10:00 · Akwa · Hyundai · 3 places · femmes bienvenues");
    expect(marthe).toHaveTextContent("3 500");
    // Les cartes compactes n'ont ni le détail du trajet ni le bouton.
    expect(marthe).not.toHaveTextContent("Réserver");
    expect(marthe).not.toHaveTextContent("Départ");

    const didier = carte("Didier K\\.");
    expect(didier).toHaveTextContent("DK");
    expect(didier).toHaveTextContent("Didier K. · vérifié · 4,6 ★");
    expect(didier).toHaveTextContent("14:00 · Bonamoussadi · pick-up · 4 places · grand bagage OK");
    expect(didier).toHaveTextContent("3 000");
  });

  it("garde « vérifié » au masculin hors démo : le contrat ne dit pas le genre du conducteur", async () => {
    rendreCovoit({ demonstration: false });
    await attendreEcran();
    expect(carte("Marthe N\\.")).toHaveTextContent("Marthe N. · vérifié · 4,7 ★");
  });

  it("affiche les mentions de confiance et aucun bouton « Proposer mon trajet »", async () => {
    rendreCovoit();
    await attendreEcran();
    expect(
      screen.getByText(
        "Conducteurs vérifiés (pièce, permis, voiture). Trajet partagé avec un proche en 1 touche. Argent libéré au conducteur à l'arrivée. Aucun bus avant 14 h sur Kribi : le covoit comble le trou.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Proposer mon trajet/)).not.toBeInTheDocument();
  });

  it("n'écrit pas « touche 2 » sur le bouton sans le flag conception", async () => {
    rendreCovoit();
    await attendreEcran();
    expect(carte("Samuel E\\.")).not.toHaveTextContent("touche 2");
  });

  it("écrit « Réserver · touche 2 » avec le flag conception", async () => {
    rendreCovoit({ conception: true });
    await attendreEcran();
    expect(carte("Samuel E\\.")).toHaveTextContent("Réserver · touche 2");
  });

  it("garde des cibles tactiles utilisables : cartes, filtres et sélecteurs sont des boutons nommés", async () => {
    rendreCovoit();
    await attendreEcran();
    const main = document.querySelector("main") as HTMLElement;
    // Trois cartes, cinq filtres et le bouton qui inverse : tout ce qui se touche est un vrai bouton.
    expect(within(main).getAllByRole("button")).toHaveLength(3 + 5 + 1);
    for (const bouton of within(main).getAllByRole("button")) {
      expect(bouton).toHaveAccessibleName();
    }
  });
});

describe("Covoit · navigation", () => {
  it("« En ville · Douala » ouvre CovoitVille", async () => {
    const { routeur } = rendreCovoit();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "En ville · Douala" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit/ville"));
  });

  it("« Je conduis » ouvre CovoitConducteur", async () => {
    const { routeur } = rendreCovoit();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Je conduis" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit/conducteur"));
  });

  it("« Entre villes » et « Je suis passager » (déjà choisis) laissent sur l'écran", async () => {
    const { routeur } = rendreCovoit();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Entre villes" }));
    await userEvent.click(screen.getByRole("button", { name: "Je suis passager" }));
    expect(pathname(routeur)).toBe("/covoit");
  });

  it("la barre du bas mène à Voyager, Colis et Moi ; Covoit reste sur l'écran", async () => {
    const { routeur } = rendreCovoit();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: /./ });
    expect(within(barre).getByRole("link", { name: "Covoit" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(barre).getByRole("link", { name: "Voyager" })).toHaveAttribute(
      "href",
      "/voyager",
    );
    expect(within(barre).getByRole("link", { name: "Colis" })).toHaveAttribute("href", "/colis");
    expect(within(barre).getByRole("link", { name: "Moi" })).toHaveAttribute("href", "/moi");
    await userEvent.click(within(barre).getByRole("link", { name: "Covoit" }));
    expect(pathname(routeur)).toBe("/covoit");
  });
});

describe("Covoit · trajet et filtres", () => {
  it("cherche d'abord Douala → Kribi sans filtre", async () => {
    const recherches: c.RechercheCovoit[] = [];
    rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_COVOIT, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    expect(recherches).toEqual([{ depart: "Douala", arrivee: "Kribi" }]);
  });

  it("« Inverser » échange le départ et l'arrivée et relance la recherche", async () => {
    const recherches: c.RechercheCovoit[] = [];
    rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_COVOIT, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Inverser" }));
    await waitFor(() => expect(document.querySelector("main")).toHaveTextContent("Kribi → Douala"));
    await waitFor(() => expect(recherches.at(-1)).toEqual({ depart: "Kribi", arrivee: "Douala" }));
    await userEvent.click(screen.getByRole("button", { name: "Inverser" }));
    await waitFor(() => expect(document.querySelector("main")).toHaveTextContent("Douala → Kribi"));
  });

  it("« Clim » filtre la recherche : seul Samuel a la clim, « Tous » remet tout", async () => {
    const recherches: c.RechercheCovoit[] = [];
    rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_COVOIT, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(puce("Clim"));
    expect(puce("Clim")).toHaveAttribute("aria-pressed", "true");
    expect(puce("Tous")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Marthe N\./ })).toBeNull());
    expect(carte("Samuel E\\.")).toBeInTheDocument();
    expect(recherches.at(-1)).toEqual({ depart: "Douala", arrivee: "Kribi", filtres: ["clim"] });

    await userEvent.click(puce("Tous"));
    expect(puce("Tous")).toHaveAttribute("aria-pressed", "true");
    expect(puce("Clim")).toHaveAttribute("aria-pressed", "false");
    await screen.findByRole("button", { name: /Marthe N\./ });
    expect(carte("Didier K\\.")).toBeInTheDocument();
  });

  it("« Femmes » ne garde que Marthe, qui devient la carte détaillée", async () => {
    rendreCovoit();
    await attendreEcran();
    await userEvent.click(puce("Femmes"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Samuel E\./ })).toBeNull());
    expect(carte("Marthe N\\.")).toHaveTextContent("Réserver");
    expect(screen.queryByRole("button", { name: /Didier K\./ })).toBeNull();
  });

  it("« Grand bagage » ne garde que Didier", async () => {
    rendreCovoit();
    await attendreEcran();
    await userEvent.click(puce("Grand bagage"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Samuel E\./ })).toBeNull());
    expect(carte("Didier K\\.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marthe N\./ })).toBeNull();
  });

  it("« ≤ 4 000 » envoie le filtre de prix et le plafond de 4 000 F", async () => {
    const recherches: c.RechercheCovoit[] = [];
    rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_COVOIT, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(puce("≤ 4 000"));
    await waitFor(() => expect(recherches.length).toBe(2));
    expect(recherches[1]).toEqual({
      depart: "Douala",
      arrivee: "Kribi",
      filtres: ["prix_max"],
      prixMax: 4000,
    });
    // Samuel (4 000), Marthe (3 500) et Didier (3 000) sont tous à 4 000 F ou moins : la liste ne change pas.
    expect(carte("Samuel E\\.")).toBeInTheDocument();
  });

  it("cumule les filtres et les retire un à un", async () => {
    const recherches: c.RechercheCovoit[] = [];
    rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_COVOIT, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(puce("Clim"));
    await userEvent.click(puce("Grand bagage"));
    await waitFor(() =>
      expect(recherches.at(-1)).toEqual({
        depart: "Douala",
        arrivee: "Kribi",
        filtres: ["clim", "grand_bagage"],
      }),
    );
    await userEvent.click(puce("Clim"));
    await waitFor(() =>
      expect(recherches.at(-1)).toEqual({
        depart: "Douala",
        arrivee: "Kribi",
        filtres: ["grand_bagage"],
      }),
    );
    expect(puce("Grand bagage")).toHaveAttribute("aria-pressed", "true");
    expect(puce("Clim")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Covoit · réserver et payer", () => {
  it("toucher le premier conducteur réserve une place et ouvre le paiement de la commande", async () => {
    const reservations: c.ReserverCovoit[] = [];
    const { routeur } = rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RESERVER_COVOIT, originale, (p) => reservations.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(carte("Samuel E\\."));
    await waitFor(() => expect(pathname(routeur)).toBe("/paiement/cmd-covoit-1"));
    expect(reservations).toEqual([{ offreId: "covoit-samuel-e-0830", places: 1 }]);
  });

  it("toucher Marthe ou Didier réserve leur offre, pas celle de Samuel", async () => {
    const reservations: c.ReserverCovoit[] = [];
    const { routeur } = rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RESERVER_COVOIT, originale, (p) => reservations.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(carte("Marthe N\\."));
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/paiement\/cmd-covoit-/));
    expect(reservations).toEqual([{ offreId: "covoit-marthe-n-1000", places: 1 }]);
  });

  it("ne réserve qu'une fois quand on touche deux fois de suite", async () => {
    const reservations: c.ReserverCovoit[] = [];
    rendreCovoit({
      operations: (originale) => [
        implementer(voyageur.OP_RESERVER_COVOIT, async (p, ctx) => {
          reservations.push(p);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (
            originale(voyageur.OP_RESERVER_COVOIT.nom).repondre as (
              p: c.ReserverCovoit,
              ctx: unknown,
            ) => c.Commande
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    const samuel = carte("Samuel E\\.");
    await userEvent.dblClick(samuel);
    await waitFor(() => expect(reservations).toHaveLength(1));
  });

  it("affiche un message et recharge la liste quand l'offre n'est plus disponible (409)", async () => {
    let recherches = 0;
    const { routeur } = rendreCovoit({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_COVOIT, originale, () => (recherches += 1)),
        implementer(voyageur.OP_RESERVER_COVOIT, () => {
          throw new ErreurHttp(409, "Pas assez de places", "PLUS_ASSEZ_DE_PLACES");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(carte("Samuel E\\."));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cette offre n'est plus disponible. Choisis un autre conducteur.",
    );
    expect(pathname(routeur)).toBe("/covoit");
    await waitFor(() => expect(recherches).toBeGreaterThanOrEqual(2));
  });

  it("affiche un message d'échec pour une autre erreur, et le retire au toucher suivant", async () => {
    let essais = 0;
    const { routeur } = rendreCovoit({
      operations: (originale) => [
        implementer(voyageur.OP_RESERVER_COVOIT, (p, ctx) => {
          essais += 1;
          if (essais === 1) throw new ErreurReseau();
          return (
            originale(voyageur.OP_RESERVER_COVOIT.nom).repondre as (
              p: c.ReserverCovoit,
              ctx: unknown,
            ) => c.Commande
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(carte("Samuel E\\."));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La réservation n'a pas abouti. Réessaie.",
    );
    await userEvent.click(carte("Samuel E\\."));
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/paiement\//));
  });
});

describe("Covoit · états", () => {
  it("affiche le chargement en gardant l'en-tête, le trajet et les filtres", async () => {
    rendreCovoit({ latenceMs: 300 });
    const chargement = await screen.findByRole("status", { name: "Chargement des covoiturages" });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Inverser" })).toBeInTheDocument();
    expect(puce("Tous")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Type de trajet" })).toBeInTheDocument();
    await attendreEcran();
    expect(screen.queryByRole("status", { name: "Chargement des covoiturages" })).toBeNull();
  });

  it("affiche l'état vide quand aucun conducteur ne part, sans casser les filtres", async () => {
    rendreCovoit({
      operations: (originale) => [
        implementer(voyageur.OP_RECHERCHER_COVOIT, async (p, ctx) => ({
          ...(await (
            originale(voyageur.OP_RECHERCHER_COVOIT.nom).repondre as (
              p: c.RechercheCovoit,
              ctx: unknown,
            ) => Promise<c.ResultatRechercheCovoit>
          )(p, ctx)),
          offres: [],
        })),
      ],
    });
    expect(await screen.findByText("Aucun conducteur pour ce trajet")).toBeInTheDocument();
    expect(screen.getByText("Change de filtre ou reviens un peu plus tard.")).toBeInTheDocument();
    expect(puce("Clim")).toBeInTheDocument();
    expect(screen.queryByText(/Conducteurs vérifiés/)).toBeNull();
  });

  it("affiche l'erreur de chargement et recharge au toucher de « Réessayer »", async () => {
    let enPanne = true;
    rendreCovoit({
      operations: (originale) => [
        implementer(voyageur.OP_RECHERCHER_COVOIT, (p, ctx) => {
          if (enPanne) throw new ErreurReseau();
          return (
            originale(voyageur.OP_RECHERCHER_COVOIT.nom).repondre as (
              p: c.RechercheCovoit,
              ctx: unknown,
            ) => c.ResultatRechercheCovoit
          )(p, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alerte).toHaveTextContent("Impossible de charger les covoiturages");
    // L'en-tête et les filtres restent là.
    expect(puce("Tous")).toBeInTheDocument();
    enPanne = false;
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
