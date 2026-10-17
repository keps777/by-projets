import { ErreurReseau, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CLE_DERNIERE_VILLE, remplacerFournisseurPosition } from "@/ecrans/MainVille/position";
import {
  avecRecherche,
  avecReponse,
  clientCovoitVille,
  espionnerRecherches,
  rendreAppCovoitVille,
} from "./test-outils";

/** Attend que la liste soit affichée (Clarisse est la première). */
async function attendreEcran() {
  return screen.findByText(/Clarisse/);
}

const principal = (): HTMLElement => document.querySelector("main") as HTMLElement;

/** Le lien de la zone principale qui porte ce texte. */
function lien(texte: string | RegExp): HTMLAnchorElement {
  const trouve = within(principal())
    .getAllByText(texte)
    .map((el) => el.closest("a"))
    .find((a): a is HTMLAnchorElement => a !== null);
  if (!trouve) throw new Error(`Pas de lien pour « ${String(texte)} »`);
  return trouve;
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

const restaurations: Array<() => void> = [];
afterEach(() => {
  while (restaurations.length > 0) restaurations.pop()?.();
  localStorage.removeItem(CLE_DERNIERE_VILLE);
});

/** Fait répondre le fournisseur de position (null : permission refusée). */
function positionDe(position: { latitude: number; longitude: number } | null) {
  restaurations.push(remplacerFournisseurPosition({ position: () => Promise.resolve(position) }));
}

const YAOUNDE = { latitude: 3.866, longitude: 11.52 };

describe("CovoitVille · rendu de la planche (scénario de démo)", () => {
  it("affiche le titre, la ville détectée, les deux sélecteurs et leur mention", async () => {
    rendreAppCovoitVille();
    await attendreEcran();

    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Covoiturage · en ville · passager",
    );
    expect(screen.getByText("Covoiturage")).toBeInTheDocument();
    const entete = document.querySelector("header") as HTMLElement;
    expect(within(entete).getByRole("button", { name: "Douala · détectée ▾" })).toBeInTheDocument();

    const mode = screen.getByRole("group", { name: "Type de trajet" });
    expect(within(mode).getByRole("button", { name: "Entre villes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(mode).getByRole("button", { name: "En ville · Douala" })).toHaveAttribute(
      "aria-pressed",
      "true",
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
  });

  it("affiche le départ (ma position) et l'arrivée proposés, avec la distance", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    expect(screen.getByLabelText("Départ")).toHaveValue("Akwa, marché central · ma position");
    expect(screen.getByLabelText("Arrivée")).toHaveValue("Bonabéri, Ancien Dalip");
    expect(screen.getByText("9 km · maintenant")).toBeInTheDocument();
  });

  it("affiche « Partent maintenant · 3 » et les trois offres de la planche", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    expect(screen.getByText("Partent maintenant · 3")).toBeInTheDocument();
    expect(screen.getByText("dans ta direction")).toBeInTheDocument();

    const clarisse = lien(/Clarisse/);
    expect(clarisse).toHaveTextContent("CL");
    expect(clarisse).toHaveTextContent("Clarisse · dans 3 min · vérifiée · 4,9 ★");
    expect(clarisse).toHaveTextContent("Hyundai · 3 places · passe par Bonanjo · 25 min");
    expect(clarisse).toHaveTextContent("700");

    const jeanMarc = lien(/Jean-Marc/);
    expect(jeanMarc).toHaveTextContent("JM");
    expect(jeanMarc).toHaveTextContent("Jean-Marc · 08:00 · régulier · 4,8 ★");
    expect(jeanMarc).toHaveTextContent("chaque matin · Toyota · 2 places · dépose au pont");
    expect(jeanMarc).toHaveTextContent("600");

    const paul = lien(/Paul/);
    expect(paul).toHaveTextContent("PA");
    expect(paul).toHaveTextContent("Paul · moto-taxi · 5 min");
    expect(paul).toHaveTextContent("vient te chercher · 18 min · bagage à main seulement");
    expect(paul).toHaveTextContent("500");
  });

  it("colore les pastilles : vert, bleu, ambre", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    const ton = (nom: RegExp) => lien(nom).querySelector("[data-ton]")?.getAttribute("data-ton");
    expect([ton(/Clarisse/), ton(/Jean-Marc/), ton(/Paul/)]).toEqual(["vert", "bleu", "ambre"]);
  });

  it("affiche le trajet du matin, activé, et les mentions de confiance", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    expect(screen.getByText("Mon trajet du matin · Akwa → Bonabéri · 07:00")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Chaque jour ouvré, l'app te propose à 06:40 les voitures qui partent. Jean-Marc t'a déjà pris 12 fois.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Mon trajet du matin · Akwa → Bonabéri · 07:00" }),
    ).toBeChecked();
    expect(
      screen.getByText(
        "Prix fixés à l'avance, jamais négociés dans la voiture. Position partagée avec un proche pendant le trajet.",
      ),
    ).toBeInTheDocument();
  });

  it("garde la barre d'onglets voyageur, Covoit courant", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: "Covoit" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("n'affiche aucun bouton grisé ni mention « bientôt »", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.queryByText(/bientôt/i)).not.toBeInTheDocument();
  });

  it("n'accorde « vérifiée » qu'à la conductrice de la démonstration", async () => {
    rendreAppCovoitVille({ demonstration: false });
    await attendreEcran();
    expect(lien(/Clarisse/)).toHaveTextContent("· vérifié · 4,9 ★");
    expect(lien(/Clarisse/)).not.toHaveTextContent("vérifiée");
  });

  it("garde des cibles tactiles d'au moins 44 px", async () => {
    rendreAppCovoitVille();
    await attendreEcran();
    const hauteurMin = (el: HTMLElement) => parseFloat(getComputedStyle(el).minHeight);
    for (const texte of [/Clarisse/, /Jean-Marc/, /Paul/]) {
      expect(hauteurMin(lien(texte)), String(texte)).toBeGreaterThanOrEqual(44);
    }
    expect(hauteurMin(screen.getByLabelText("Départ"))).toBeGreaterThanOrEqual(36);
  });
});

describe("CovoitVille · navigation identique à la maquette", () => {
  const offres: ReadonlyArray<readonly [RegExp, string]> = [
    [/Clarisse/, "/paiement/offre-ville-1-clarisse"],
    [/Jean-Marc/, "/paiement/offre-ville-2-jean-marc"],
    [/Paul/, "/paiement/offre-ville-3-paul"],
  ];

  it.each(offres)("l'offre %s mène au paiement %s", async (texte, chemin) => {
    const { routeur } = rendreAppCovoitVille();
    await attendreEcran();
    expect(lien(texte)).toHaveAttribute("href", chemin);
    await userEvent.click(lien(texte));
    await waitFor(() => expect(pathname(routeur)).toBe(chemin));
  });

  it("« Entre villes » mène à Covoit", async () => {
    const { routeur } = rendreAppCovoitVille();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Entre villes" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
  });

  it("« Je conduis » mène à CovoitConducteur", async () => {
    const { routeur } = rendreAppCovoitVille();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Je conduis" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit/conducteur"));
  });

  it.each([
    ["Voyager", "/voyager"],
    ["Colis", "/colis"],
    ["Covoit", "/covoit"],
    ["Moi", "/moi"],
  ])("l'onglet « %s » mène à %s", async (nom, chemin) => {
    const { routeur } = rendreAppCovoitVille();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: nom })).toHaveAttribute("href", chemin);
    await userEvent.click(within(barre).getByRole("link", { name: nom }));
    await waitFor(() => expect(pathname(routeur)).toBe(chemin));
  });
});

describe("CovoitVille · recherche et trajet", () => {
  it("demande les voitures et motos qui partent maintenant dans la ville", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();
    expect(recherches[0]).toEqual({
      ville: "Douala",
      quand: "maintenant",
      types: ["covoiturage", "moto_taxi"],
    });
  });

  it("n'affiche que ce que renvoie la recherche : une moto de moins, un conducteur de moins", async () => {
    const source = avecRecherche((reponse) => ({
      ...reponse,
      offres: reponse.offres.filter((o) => o.type === "covoiturage"),
    }));
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();
    expect(screen.getByText("Partent maintenant · 2")).toBeInTheDocument();
    expect(screen.queryByText(/Paul/)).not.toBeInTheDocument();
  });

  it("relance la recherche avec l'arrivée saisie, départ conservé", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();

    const arrivee = screen.getByLabelText("Arrivée");
    await userEvent.clear(arrivee);
    await userEvent.type(arrivee, "Bonanjo{Enter}");

    await waitFor(() =>
      expect(recherches.at(-1)).toMatchObject({
        depart: "Akwa, marché central",
        arrivee: "Bonanjo",
        quand: "maintenant",
      }),
    );
    expect(screen.getByLabelText("Arrivée")).toHaveValue("Bonanjo");
    // Le départ garde la mention de la position.
    expect(screen.getByLabelText("Départ")).toHaveValue("Akwa, marché central · ma position");
  });

  it("ne lance pas de recherche quand un champ est vidé", async () => {
    const { source, recherches } = espionnerRecherches();
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();
    const avant = recherches.length;

    const arrivee = screen.getByLabelText("Arrivée");
    await userEvent.clear(arrivee);
    await userEvent.tab();

    expect(recherches).toHaveLength(avant);
    expect(screen.getByLabelText("Arrivée")).toHaveValue("Bonabéri, Ancien Dalip");
  });
});

describe("CovoitVille · ville détectée", () => {
  it("prend la ville de la position et la mémorise", async () => {
    positionDe(YAOUNDE);
    const { source, recherches } = espionnerRecherches();
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();

    await waitFor(() => expect(recherches.at(-1)?.ville).toBe("Yaoundé"));
    expect(screen.getByRole("button", { name: "En ville · Yaoundé" })).toBeInTheDocument();
    expect(localStorage.getItem(CLE_DERNIERE_VILLE)).toBe("Yaoundé");
  });

  it("garde Douala quand la position est refusée", async () => {
    positionDe(null);
    const { source, recherches } = espionnerRecherches();
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();
    expect(recherches.every((r) => r.ville === "Douala")).toBe(true);
    expect(screen.getByRole("button", { name: "En ville · Douala" })).toBeInTheDocument();
  });

  it("« Douala · détectée ▾ » ouvre la liste des villes ; un choix a le dernier mot sur la position", async () => {
    let donnerPosition: (p: typeof YAOUNDE) => void = () => undefined;
    restaurations.push(
      remplacerFournisseurPosition({
        position: () => new Promise((resolve) => (donnerPosition = resolve)),
      }),
    );
    const base = espionnerRecherches();
    const source = avecReponse(
      voyageur.OP_RESEAU,
      (): c.ApercuReseau => ({
        maintenant: "2027-01-05T07:38:00.000+01:00",
        compagnies: 0,
        busEnRoute: 0,
        departsAVenir: 0,
        filtres: [],
        filtreActif: "",
        villes: ["Douala", "Bamenda"],
        lignes: [],
      }),
      base.source,
    );
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();

    await userEvent.click(screen.getByRole("button", { name: "Douala · détectée ▾" }));
    const feuille = await screen.findByRole("dialog");
    await userEvent.click(await within(feuille).findByRole("button", { name: "Bamenda" }));

    await waitFor(() => expect(base.recherches.at(-1)?.ville).toBe("Bamenda"));
    expect(screen.getByRole("button", { name: "En ville · Bamenda" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(CLE_DERNIERE_VILLE)).toBe("Bamenda");

    await act(async () => donnerPosition(YAOUNDE));
    expect(base.recherches.at(-1)?.ville).toBe("Bamenda");
  });
});

describe("CovoitVille · trajet du matin", () => {
  it("l'interrupteur coupe le trajet du matin, puis le rétablit", async () => {
    const demandes: boolean[] = [];
    const source = avecReponse(voyageur.OP_DEFINIR_TRAJET_REGULIER, (reponse, params) => {
      demandes.push(params.actif);
      return reponse;
    });
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();

    const interrupteur = screen.getByRole("switch");
    await userEvent.click(interrupteur);
    expect(interrupteur).not.toBeChecked();
    await waitFor(() => expect(demandes).toEqual([false]));
    // Le serveur a confirmé : la recherche relue montre le même état.
    await waitFor(() => expect(screen.getByRole("switch")).not.toBeChecked());

    await userEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(demandes).toEqual([false, true]));
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dit quand le trajet du matin n'a pas pu être enregistré et rend l'interrupteur", async () => {
    const source = avecReponse(voyageur.OP_DEFINIR_TRAJET_REGULIER, () => {
      throw new ErreurReseau();
    });
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();

    await userEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le trajet du matin n'a pas pu être enregistré. Réessaie.",
    );
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("n'affiche pas la carte quand le voyageur n'a pas de trajet régulier", async () => {
    const source = avecRecherche((reponse) => {
      const { trajetDuMatin: _, ...sans } = reponse;
      return sans;
    });
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/Mon trajet du matin/)).not.toBeInTheDocument();
    expect(screen.getByText(/Prix fixés à l'avance/)).toBeInTheDocument();
  });

  it("n'affiche « 0 km » nulle part : sans distance calculée, seul « maintenant » reste", async () => {
    const source = avecRecherche((reponse) => ({
      ...reponse,
      itineraire: { ...reponse.itineraire, distanceKm: 0 },
    }));
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    await attendreEcran();
    expect(screen.queryByText(/0 km/)).not.toBeInTheDocument();
    expect(screen.getByText("maintenant")).toBeInTheDocument();
  });
});

describe("CovoitVille · états chargement, vide et erreur", () => {
  it("chargement : des lignes qui pulsent, la mise en page tient", async () => {
    const source = avecRecherche(async (reponse) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return reponse;
    });
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    const chargement = await screen.findByRole("status", {
      name: "Chargement des covoiturages en ville",
    });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    // Le haut de l'écran et les mentions sont déjà là.
    expect(screen.getByRole("group", { name: "Type de trajet" })).toBeInTheDocument();
    expect(screen.getByText("Partent maintenant")).toBeInTheDocument();
    expect(screen.getByText(/Prix fixés à l'avance/)).toBeInTheDocument();
    await attendreEcran();
    expect(screen.queryByRole("status", { name: /Chargement/ })).not.toBeInTheDocument();
  });

  it("vide : dit qu'aucune voiture ne part, avec le compteur à zéro", async () => {
    const source = avecRecherche((reponse) => ({ ...reponse, offres: [] }));
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    expect(
      await screen.findByText("Aucune voiture ne part maintenant dans ta direction."),
    ).toBeInTheDocument();
    expect(screen.getByText("Partent maintenant · 0")).toBeInTheDocument();
    expect(screen.getByText(/Prix fixés à l'avance/)).toBeInTheDocument();
  });

  it("erreur : propose de réessayer, et la liste revient", async () => {
    let appels = 0;
    const source = avecRecherche((reponse) => {
      appels += 1;
      if (appels === 1) throw new ErreurReseau();
      return reponse;
    });
    rendreAppCovoitVille({ client: clientCovoitVille(source) });
    const alerte = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alerte).toHaveTextContent("Les offres ne se sont pas chargées.");
    expect(screen.getByRole("group", { name: "Type de trajet" })).toBeInTheDocument();

    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
