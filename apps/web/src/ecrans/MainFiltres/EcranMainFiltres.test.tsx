import { ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { cleMemoire } from "./filtres";
import {
  COMPAGNIE,
  avecNDeparts,
  avecOperations,
  clientFiltres,
  espionner,
  rendreAppFiltres,
  sourceModifiee,
} from "./test-outils";

/** Attend que le panneau ait ses options (la ligne de Bêta Express est la première). */
async function attendreEcran() {
  return screen.findByRole("checkbox", { name: "Bêta Express" });
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function caseCompagnie(nom: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name: nom });
}

/** La ligne (case, libellé, nombre de départs, étoile) d'une compagnie. */
function ligne(nom: string): HTMLElement {
  return caseCompagnie(nom).closest("label")!.parentElement!;
}

function etoile(nom: string): HTMLElement {
  return within(ligne(nom)).getByRole("button", { name: /préférées/ });
}

function voir(): HTMLElement {
  return within(principal()).getByRole("link", { name: /^(Voir|Aucun)/ });
}

function classe(nom: string): HTMLElement {
  return within(screen.getByRole("group", { name: "Classe" })).getByRole("button", { name: nom });
}

function chip(nom: RegExp | string): HTMLElement {
  return within(principal()).getByRole("button", { name: nom });
}

describe("MainFiltres · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : marque, salutation du profil, pastille DIRECT qui pulse, titre pour les lecteurs d'écran", async () => {
    rendreAppFiltres();
    await attendreEcran();
    expect(screen.getByText("AfriMove")).toBeInTheDocument();
    expect(screen.getByText("Bonjour Aïcha")).toBeInTheDocument();
    const direct = screen.getByText("DIRECT · 07:38");
    expect(direct.querySelector("[data-pulse='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accueil · filtre déroulant : classe, compagnies (une, plusieurs, toutes), préférées",
    );
  });

  it("affiche le sélecteur de mode, le trajet Douala → Yaoundé et « Filtrer les départs » ouvert", async () => {
    rendreAppFiltres();
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
    expect(screen.getByText("Douala", { exact: false, selector: "span" })).toHaveTextContent(
      "Douala → Yaoundé",
    );
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(within(principal()).getByRole("link", { name: "Filtrer les départs" })).toHaveAttribute(
      "href",
      "/voyager",
    );
  });

  it("affiche les trois classes (Toutes active), les cinq compagnies avec leur nombre de départs et leurs étoiles", async () => {
    rendreAppFiltres();
    await attendreEcran();

    expect(classe("Toutes")).toHaveAttribute("aria-pressed", "true");
    expect(classe("VIP · clim")).toHaveAttribute("aria-pressed", "false");
    expect(classe("Classique")).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("Compagnies · une, plusieurs ou toutes")).toBeInTheDocument();
    expect(screen.getByText("★ = préférée")).toBeInTheDocument();

    const toutes = screen.getByRole("checkbox", { name: "Toutes les compagnies" });
    expect(toutes).toBeChecked();
    expect(toutes.closest("label")).toHaveTextContent("Toutes · 5 compagnies14 départs");

    const attendu: Array<[string, string, boolean]> = [
      ["Bêta Express", "Bêta Express VIP4 départs", true],
      ["Alpha Voyages", "Alpha Voyages5 départs", true],
      ["Oméga Transports", "Oméga Transports3 départs", false],
      ["Général Express", "Général Express nuit1 départ", false],
      ["Touristique Express", "Touristique Express1 départ", false],
    ];
    for (const [nom, texte, preferee] of attendu) {
      expect(caseCompagnie(nom)).toBeChecked();
      expect(caseCompagnie(nom).closest("label")).toHaveTextContent(texte);
      const e = etoile(nom);
      expect(e).toHaveAttribute("aria-pressed", String(preferee));
      expect(e).toHaveAccessibleName(preferee ? "Retirer des préférées" : "Ajouter aux préférées");
      expect(e).toHaveTextContent(preferee ? "★" : "☆");
    }
  });

  it("affiche les options « Aussi » (Covoiturage actif ✓), les actions, le compteur et la note", async () => {
    rendreAppFiltres();
    await attendreEcran();
    expect(screen.getByText("Aussi")).toBeInTheDocument();
    expect(chip("Covoiturage ✓")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Matin seulement")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Places côte à côte")).toHaveAttribute("aria-pressed", "false");
    expect(chip("≤ 5 000 F")).toHaveAttribute("aria-pressed", "false");
    expect(within(principal()).getByRole("button", { name: "Effacer" })).toBeInTheDocument();
    expect(voir()).toHaveTextContent("Voir les 14 départs");
    expect(
      screen.getByText(
        "Tes préférées s'affichent toujours en premier. Le filtre reste mémorisé pour ce trajet.",
      ),
    ).toBeInTheDocument();
  });

  it("garde la barre d'onglets du voyageur, avec Voyager actif", async () => {
    rendreAppFiltres();
    await attendreEcran();
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Voyager" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("MainFiltres · le compteur du bouton se recalcule à chaque changement", () => {
  it("retranche les départs d'une compagnie décochée, les rend quand on la recoche", async () => {
    const utilisateur = userEvent.setup();
    rendreAppFiltres();
    await attendreEcran();
    expect(voir()).toHaveTextContent("Voir les 14 départs");

    await utilisateur.click(caseCompagnie("Bêta Express"));
    expect(caseCompagnie("Bêta Express")).not.toBeChecked();
    expect(voir()).toHaveTextContent("Voir les 10 départs");

    await utilisateur.click(caseCompagnie("Alpha Voyages"));
    expect(voir()).toHaveTextContent("Voir les 5 départs");

    await utilisateur.click(caseCompagnie("Bêta Express"));
    expect(voir()).toHaveTextContent("Voir les 9 départs");
  });

  it("passe « Toutes les compagnies » en état partiel, et la recoche d'un geste", async () => {
    const utilisateur = userEvent.setup();
    rendreAppFiltres();
    await attendreEcran();
    const toutes = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Toutes les compagnies",
    });

    await utilisateur.click(caseCompagnie("Oméga Transports"));
    expect(toutes).not.toBeChecked();
    expect(toutes.indeterminate).toBe(true);
    // Le nombre de départs de la ligne « Toutes » est celui du trajet, pas celui du choix.
    expect(toutes.closest("label")).toHaveTextContent("Toutes · 5 compagnies14 départs");
    expect(voir()).toHaveTextContent("Voir les 11 départs");

    await utilisateur.click(toutes);
    expect(toutes).toBeChecked();
    expect(toutes.indeterminate).toBe(false);
    expect(caseCompagnie("Oméga Transports")).toBeChecked();
    expect(voir()).toHaveTextContent("Voir les 14 départs");
  });

  it("garde toujours au moins une compagnie cochée : la dernière ne se décoche pas", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner();
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    for (const nom of ["Bêta Express", "Alpha Voyages", "Oméga Transports", "Général Express"]) {
      await utilisateur.click(caseCompagnie(nom));
    }
    expect(voir()).toHaveTextContent("Voir le départ");
    const avant = appels.enregistrements.length;

    await utilisateur.click(caseCompagnie("Touristique Express"));
    expect(caseCompagnie("Touristique Express")).toBeChecked();
    expect(voir()).toHaveTextContent("Voir le départ");
    // Rien n'a changé : rien n'est enregistré.
    expect(appels.enregistrements).toHaveLength(avant);
  });

  it("demande le nombre au serveur quand la classe restreint les bus, puis revient au compte des compagnies", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner({ recherche: (_, base) => avecNDeparts(base, 6) });
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();
    // Sans restriction, la recherche n'est pas nécessaire : le compte vient des options.
    expect(appels.recherches).toHaveLength(0);

    await utilisateur.click(classe("VIP · clim"));
    expect(classe("VIP · clim")).toHaveAttribute("aria-pressed", "true");
    expect(classe("Toutes")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les 6 départs"));
    expect(appels.recherches.at(-1)?.filtres).toMatchObject({ classe: "vip" });

    await utilisateur.click(classe("Toutes"));
    expect(voir()).toHaveTextContent("Voir les 14 départs");
  });

  it("recalcule aussi avec « Matin seulement », « Places côte à côte » et « ≤ 5 000 F », pas avec « Covoiturage »", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner({
      recherche: (p, base) =>
        avecNDeparts(
          base,
          (p.filtres?.matinSeulement ? 8 : 0) +
            (p.filtres?.placesCoteACote ? 3 : 0) +
            (p.filtres?.prixMax ? 1 : 0),
        ),
    });
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    // Le covoiturage est une autre liste : le nombre de bus ne bouge pas, aucune recherche n'est lancée.
    await utilisateur.click(chip("Covoiturage ✓"));
    expect(chip("Covoiturage")).toHaveAttribute("aria-pressed", "false");
    expect(voir()).toHaveTextContent("Voir les 14 départs");
    expect(appels.recherches).toHaveLength(0);

    await utilisateur.click(chip("Matin seulement"));
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les 8 départs"));
    expect(appels.recherches.at(-1)?.filtres).toMatchObject({ matinSeulement: true });

    await utilisateur.click(chip("≤ 5 000 F"));
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les 9 départs"));
    expect(appels.recherches.at(-1)?.filtres).toMatchObject({
      matinSeulement: true,
      prixMax: 5000,
    });

    await utilisateur.click(chip("Places côte à côte"));
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les 12 départs"));
  });

  it("combine compagnies et restriction : la recherche reçoit la liste des compagnies cochées", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner({ recherche: (_, base) => avecNDeparts(base, 2) });
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(caseCompagnie("Bêta Express"));
    await utilisateur.click(classe("Classique"));
    await waitFor(() => expect(appels.recherches.length).toBeGreaterThan(0));
    expect(appels.recherches.at(-1)?.filtres?.classe).toBe("classique");
    expect(appels.recherches.at(-1)?.filtres?.compagnies).toEqual([
      COMPAGNIE.alpha,
      COMPAGNIE.omega,
      COMPAGNIE.general,
      COMPAGNIE.touristique,
    ]);
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les 2 départs"));
  });

  it("n'invente pas de nombre : « Aucun départ » à zéro, « Voir les départs » quand la recherche échoue", async () => {
    const utilisateur = userEvent.setup();
    let echec = false;
    const { source } = espionner({
      recherche: (_, base) => {
        if (echec) throw new ErreurReseau();
        return avecNDeparts(base, 0);
      },
    });
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(classe("VIP · clim"));
    await waitFor(() => expect(voir()).toHaveTextContent("Aucun départ avec ce filtre"));

    echec = true;
    await utilisateur.click(chip("Matin seulement"));
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les départs"));
    // Le bouton reste un lien actif vers l'accueil.
    expect(voir()).toHaveAttribute("href", "/voyager");
  });
});

describe("MainFiltres · enregistrement du filtre et mémoire de l'appareil", () => {
  it("enregistre le filtre pour le trajet à chaque changement, au format de l'API", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner();
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(caseCompagnie("Général Express"));
    await waitFor(() => expect(appels.enregistrements).toHaveLength(1));
    expect(appels.enregistrements[0]).toEqual({
      depart: "DLA",
      arrivee: "YDE",
      filtres: {
        classe: "toutes",
        compagnies: [COMPAGNIE.beta, COMPAGNIE.alpha, COMPAGNIE.omega, COMPAGNIE.touristique],
        inclureCovoit: true,
        matinSeulement: false,
        placesCoteACote: false,
      },
    });

    await utilisateur.click(classe("VIP · clim"));
    await utilisateur.click(chip("≤ 5 000 F"));
    await waitFor(() => expect(appels.enregistrements).toHaveLength(3));
    expect(appels.enregistrements[2]?.filtres).toMatchObject({ classe: "vip", prixMax: 5000 });

    // Toutes les compagnies cochées : on n'envoie pas de liste (le serveur lit « vide » comme « toutes »).
    await utilisateur.click(screen.getByRole("checkbox", { name: "Toutes les compagnies" }));
    await waitFor(() => expect(appels.enregistrements).toHaveLength(4));
    expect(appels.enregistrements[3]?.filtres).not.toHaveProperty("compagnies");
  });

  it("garde le filtre sur l'appareil, par trajet, et le retrouve à la réouverture", async () => {
    const utilisateur = userEvent.setup();
    const premier = rendreAppFiltres();
    await attendreEcran();
    await utilisateur.click(caseCompagnie("Bêta Express"));
    await utilisateur.click(classe("Classique"));
    await utilisateur.click(chip("Matin seulement"));

    expect(JSON.parse(localStorage.getItem(cleMemoire("DLA", "YDE"))!)).toEqual({
      classe: "classique",
      decochees: [COMPAGNIE.beta],
      aussi: ["covoiturage", "matin-seulement"],
    });
    // Une clé par trajet : un autre trajet n'est pas touché.
    expect(localStorage.getItem(cleMemoire("DLA", "BAF"))).toBeNull();
    expect(cleMemoire("DLA", "YDE")).not.toBe(cleMemoire("YDE", "DLA"));

    // Retour à l'écran : le serveur de démonstration ne garde rien du filtre, c'est l'appareil qui s'en souvient.
    await act(async () => {
      await premier.routeur.navigate("/voyager/ville");
    });
    await act(async () => {
      await premier.routeur.navigate("/voyager/filtres");
    });
    await attendreEcran();
    expect(caseCompagnie("Bêta Express")).not.toBeChecked();
    expect(classe("Classique")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Matin seulement ✓")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Covoiturage ✓")).toHaveAttribute("aria-pressed", "true");
  });

  it("à l'ouverture, applique le filtre de l'appareil et le renvoie au serveur s'il diffère", async () => {
    localStorage.setItem(
      cleMemoire("DLA", "YDE"),
      JSON.stringify({ classe: "vip", decochees: [COMPAGNIE.omega], aussi: [] }),
    );
    const { source, appels } = espionner();
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    expect(classe("VIP · clim")).toHaveAttribute("aria-pressed", "true");
    expect(caseCompagnie("Oméga Transports")).not.toBeChecked();
    expect(chip("Covoiturage")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(appels.enregistrements).toHaveLength(1));
    expect(appels.enregistrements[0]?.filtres).toMatchObject({
      classe: "vip",
      inclureCovoit: false,
    });
    expect(appels.enregistrements[0]?.filtres.compagnies).toEqual([
      COMPAGNIE.beta,
      COMPAGNIE.alpha,
      COMPAGNIE.general,
      COMPAGNIE.touristique,
    ]);
  });

  it("ignore le filtre d'un autre trajet, un filtre illisible et les compagnies disparues", async () => {
    localStorage.setItem(
      cleMemoire("DLA", "BAF"),
      JSON.stringify({ classe: "vip", decochees: [], aussi: [] }),
    );
    localStorage.setItem(cleMemoire("DLA", "YDE"), "{pas du json");
    rendreAppFiltres();
    await attendreEcran();
    expect(classe("Toutes")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Covoiturage ✓")).toBeInTheDocument();
  });

  it("à l'ouverture, un filtre de l'appareil qui décocherait tout retombe sur toutes les compagnies", async () => {
    localStorage.setItem(
      cleMemoire("DLA", "YDE"),
      JSON.stringify({
        classe: "toutes",
        decochees: Object.values(COMPAGNIE),
        aussi: ["covoiturage"],
      }),
    );
    rendreAppFiltres();
    await attendreEcran();
    for (const nom of ["Bêta Express", "Alpha Voyages", "Touristique Express"]) {
      expect(caseCompagnie(nom)).toBeChecked();
    }
    expect(voir()).toHaveTextContent("Voir les 14 départs");
  });
});

describe("MainFiltres · étoile des compagnies préférées", () => {
  it("ajoute une compagnie aux préférées : l'étoile change tout de suite et le serveur est prévenu", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner();
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(etoile("Oméga Transports"));
    expect(etoile("Oméga Transports")).toHaveAttribute("aria-pressed", "true");
    expect(etoile("Oméga Transports")).toHaveTextContent("★");
    expect(etoile("Oméga Transports")).toHaveAccessibleName("Retirer des préférées");
    await waitFor(() =>
      expect(appels.preferees).toEqual([{ compagnieId: COMPAGNIE.omega, preferee: true }]),
    );
    // L'étoile ne touche ni à la case ni au compteur.
    expect(caseCompagnie("Oméga Transports")).toBeChecked();
    expect(voir()).toHaveTextContent("Voir les 14 départs");
  });

  it("retire une compagnie des préférées", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner();
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(etoile("Bêta Express"));
    expect(etoile("Bêta Express")).toHaveAttribute("aria-pressed", "false");
    expect(etoile("Bêta Express")).toHaveTextContent("☆");
    await waitFor(() =>
      expect(appels.preferees).toEqual([{ compagnieId: COMPAGNIE.beta, preferee: false }]),
    );
  });

  it("garde l'étoile après la relecture des options, et la change encore", async () => {
    const utilisateur = userEvent.setup();
    rendreAppFiltres();
    await attendreEcran();
    await utilisateur.click(etoile("Général Express"));
    // Le mock mémorise l'étoile ; les options relues la confirment.
    await waitFor(() => expect(etoile("Général Express")).toHaveAttribute("aria-pressed", "true"));
    await utilisateur.click(etoile("Général Express"));
    await waitFor(() => expect(etoile("Général Express")).toHaveAttribute("aria-pressed", "false"));
  });

  it("annule l'étoile et prévient quand l'enregistrement échoue, puis efface le message à l'essai suivant", async () => {
    const utilisateur = userEvent.setup();
    let essais = 0;
    const { source } = espionner({
      definirPreferee: (p) => {
        essais += 1;
        if (essais === 1) throw new ErreurReseau();
        // Ensuite : la réponse du scénario, qui mémorise l'étoile.
        return undefined;
      },
    });
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(etoile("Oméga Transports"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La compagnie préférée n'a pas pu être enregistrée.",
    );
    expect(etoile("Oméga Transports")).toHaveAttribute("aria-pressed", "false");

    await utilisateur.click(etoile("Oméga Transports"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(essais).toBe(2));
    expect(etoile("Oméga Transports")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("MainFiltres · Effacer", () => {
  it("remet tout à zéro : classe Toutes, toutes les compagnies, aucune option « Aussi » ; les étoiles restent", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = espionner({ recherche: (_, base) => avecNDeparts(base, 3) });
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();

    await utilisateur.click(classe("Classique"));
    await utilisateur.click(caseCompagnie("Alpha Voyages"));
    await utilisateur.click(chip("Matin seulement"));
    await waitFor(() => expect(voir()).toHaveTextContent("Voir les 3 départs"));

    await utilisateur.click(within(principal()).getByRole("button", { name: "Effacer" }));

    expect(classe("Toutes")).toHaveAttribute("aria-pressed", "true");
    for (const nom of [
      "Bêta Express",
      "Alpha Voyages",
      "Oméga Transports",
      "Général Express",
      "Touristique Express",
    ]) {
      expect(caseCompagnie(nom)).toBeChecked();
    }
    for (const nom of ["Covoiturage", "Matin seulement", "Places côte à côte", "≤ 5 000 F"]) {
      expect(chip(nom)).toHaveAttribute("aria-pressed", "false");
    }
    expect(voir()).toHaveTextContent("Voir les 14 départs");
    expect(etoile("Bêta Express")).toHaveAttribute("aria-pressed", "true");
    expect(etoile("Oméga Transports")).toHaveAttribute("aria-pressed", "false");

    await waitFor(() => expect(appels.enregistrements.length).toBeGreaterThanOrEqual(4));
    expect(appels.enregistrements.at(-1)?.filtres).toEqual({
      classe: "toutes",
      inclureCovoit: false,
      matinSeulement: false,
      placesCoteACote: false,
    });
    expect(JSON.parse(localStorage.getItem(cleMemoire("DLA", "YDE"))!)).toEqual({
      classe: "toutes",
      decochees: [],
      aussi: [],
    });
  });
});

describe("MainFiltres · navigation de la maquette", () => {
  it("« Dans la même ville » ouvre MainVille", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendreAppFiltres();
    await attendreEcran();
    await utilisateur.click(screen.getByRole("button", { name: "Dans la même ville" }));
    expect(routeur.state.location.pathname).toBe("/voyager/ville");
  });

  it("« Filtrer les départs » ramène à l'accueil", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendreAppFiltres();
    await attendreEcran();
    await utilisateur.click(within(principal()).getByRole("link", { name: "Filtrer les départs" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it("« Voir les 14 départs » ramène à l'accueil", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendreAppFiltres();
    await attendreEcran();
    await utilisateur.click(voir());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it("la barre d'onglets mène à Voyager, Colis, Covoit et Moi", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendreAppFiltres();
    await attendreEcran();
    const nav = () => screen.getByRole("navigation");
    expect(within(nav()).getByRole("link", { name: "Voyager" })).toHaveAttribute(
      "href",
      "/voyager",
    );
    expect(within(nav()).getByRole("link", { name: "Colis" })).toHaveAttribute("href", "/colis");
    expect(within(nav()).getByRole("link", { name: "Covoit" })).toHaveAttribute("href", "/covoit");
    expect(within(nav()).getByRole("link", { name: "Moi" })).toHaveAttribute("href", "/moi");
    await utilisateur.click(within(nav()).getByRole("link", { name: "Covoit" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/covoit"));
  });
});

describe("MainFiltres · états chargement, vide et erreur", () => {
  it("affiche un squelette du panneau pendant le chargement, sans casser la mise en page", async () => {
    const source = avecOperations(
      implementer(voyageur.OP_OPTIONS_FILTRES, () => new Promise<never>(() => undefined)),
    );
    rendreAppFiltres({ client: clientFiltres(source) });
    expect(await screen.findByRole("status", { name: "Chargement des filtres" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    // L'en-tête, le trajet et « Filtrer les départs » restent en place.
    expect(screen.getByText("AfriMove")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Type de trajet" })).toBeInTheDocument();
    expect(
      within(principal()).getByRole("link", { name: "Filtrer les départs" }),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "chargement");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // La barre d'onglets reste utilisable.
    expect(within(screen.getByRole("navigation")).getByRole("link", { name: "Moi" })).toBeVisible();
  });

  it("affiche l'erreur dans le panneau, garde le reste de l'écran, et réessaie", async () => {
    const utilisateur = userEvent.setup();
    let appels = 0;
    const source = sourceModifiee((scenario) => {
      const origine = scenario.operations.find(
        (o) => o.operation.nom === voyageur.OP_OPTIONS_FILTRES.nom,
      )!;
      return {
        ...scenario,
        operations: [
          implementer(voyageur.OP_OPTIONS_FILTRES, (params, ctx) => {
            appels += 1;
            if (appels === 1) throw new ErreurReseau();
            return (origine.repondre as (p: unknown, c: unknown) => unknown)(
              params,
              ctx,
            ) as c.OptionsFiltres;
          }),
          ...scenario.operations,
        ],
      };
    });
    rendreAppFiltres({ client: clientFiltres(source) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les filtres ne se sont pas chargés.",
    );
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.getByText("Douala", { exact: false, selector: "span" })).toBeInTheDocument();
    expect(
      within(principal()).getByRole("link", { name: "Filtrer les départs" }),
    ).toBeInTheDocument();

    await utilisateur.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(voir()).toHaveTextContent("Voir les 14 départs");
  });

  it("affiche « aucune compagnie » quand le trajet n'en a pas, sans casser le panneau", async () => {
    const source = espionner({
      options: async (params) => {
        const base = clientFiltres();
        const options = await base.executer(voyageur.OP_OPTIONS_FILTRES, params);
        return { ...options, compagnies: [], totalDeparts: 0 };
      },
    }).source;
    rendreAppFiltres({ client: clientFiltres(source) });
    expect(
      await screen.findByText("Aucune compagnie ne dessert ce trajet aujourd'hui."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // Les classes, les options et les actions restent là.
    expect(classe("Toutes")).toBeInTheDocument();
    expect(within(principal()).getByRole("button", { name: "Effacer" })).toBeInTheDocument();
    expect(voir()).toHaveTextContent("Aucun départ avec ce filtre");
  });

  it("affiche « Bonjour » quand le profil ne se charge pas", async () => {
    const source = avecOperations(
      implementer(voyageur.OP_PROFIL, () => {
        throw new ErreurReseau();
      }),
    );
    rendreAppFiltres({ client: clientFiltres(source) });
    await attendreEcran();
    await waitFor(() => expect(screen.getByText("Bonjour")).toBeInTheDocument());
  });
});

describe("MainFiltres · accessibilité", () => {
  it("nomme chaque case et chaque étoile comme la maquette, et chaque cible tactile est un vrai bouton ou lien", async () => {
    rendreAppFiltres();
    await attendreEcran();
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.getAllByRole("button", { name: "Retirer des préférées" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Ajouter aux préférées" })).toHaveLength(3);
    // Aucun bouton grisé : tout est actif.
    for (const bouton of within(principal()).getAllByRole("button")) {
      expect(bouton).toBeEnabled();
    }
  });
});
