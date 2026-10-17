import { ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RAFRAICHISSEMENT_MS } from "./EcranArret";
import { DELAI_POSITION_MS } from "./lieu";
import {
  avecOffres,
  busQuiPasse,
  clientArret,
  rendreAppArret,
  sourceModifiee,
} from "./test-outils";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "geolocation");
});

/** Attend que les bus soient affichés. */
async function attendreEcran() {
  return screen.findByText("Bêta Express VIP");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** La carte (lien) de la zone principale qui commence par cette heure. */
function carte(heure: string): HTMLAnchorElement {
  const lien = within(principal())
    .getAllByRole("link")
    .find((a) => a.textContent?.startsWith(heure));
  if (!lien) throw new Error(`Pas de carte « ${heure} »`);
  return lien as HTMLAnchorElement;
}

const barre = () => screen.getByRole("navigation", { name: "Navigation" });
const href = (el: HTMLElement) => el.getAttribute("href");

describe("Arret · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, titre, position du voyageur et pastille GPS qui pulse", async () => {
    rendreAppArret();
    await attendreEcran();

    expect(screen.getByText("Monter en route")).toBeInTheDocument();
    expect(screen.getByText("Tu es à Pouma · bus qui passent avec des places")).toBeInTheDocument();
    const gps = screen.getByText("GPS");
    expect(gps.querySelector("[data-pulse='true']")).not.toBeNull();
    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Monter en route · arrêts");
  });

  it("dessine la ligne : étiquette, sens, cinq arrêts dont « Pouma · toi », point de montée", async () => {
    rendreAppArret();
    await attendreEcran();

    expect(screen.getByText("Ligne Douala → Yaoundé")).toBeInTheDocument();
    expect(screen.getByText("vers Yaoundé")).toBeInTheDocument();
    const arrets = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(arrets.map((a) => a.textContent)).toEqual([
      "Douala",
      "Edéa",
      "Pouma · toi",
      "Boumnyebel",
      "Yaoundé",
    ]);
    // Douala et Edéa sont derrière lui, Pouma est là, Boumnyebel et Yaoundé devant.
    expect(arrets.map((a) => a.getAttribute("data-etat"))).toEqual([
      "passe",
      "passe",
      "ici",
      "a-venir",
      "a-venir",
    ]);
    expect(arrets[2]).toHaveAttribute("aria-current", "location");
    expect(
      screen.getByText(
        "Point de montée : station Total Pouma, côté droit. Le convoyeur te scanne à la montée.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche les trois bus avec heure, délai, compagnie, places, parti de, arrivée et prix au prorata", async () => {
    rendreAppArret();
    await attendreEcran();

    expect(carte("10:05")).toHaveTextContent(
      "10:05dans 14 minBêta Express VIP · 3 placesparti de Douala 08:04 · arrive Yaoundé 11:35" +
        "4 500prorata",
    );
    expect(carte("10:40")).toHaveTextContent(
      "10:40dans 49 minAlpha Voyages · 7 placesclassique · arrive Yaoundé 12:20" + "2 500prorata",
    );
    expect(carte("11:10")).toHaveTextContent(
      "11:10dans 1 h 19Oméga Transports · 1 placeclassique · arrive Yaoundé 12:50" + "2 400prorata",
    );
  });

  it("entoure le bus le plus proche d'ambre, grise l'heure du bus lointain et rougit « 1 place »", async () => {
    rendreAppArret();
    await attendreEcran();

    expect(carte("10:05")).toHaveAttribute("data-premier", "true");
    expect(carte("10:40")).toHaveAttribute("data-premier", "false");
    expect(carte("11:10")).toHaveAttribute("data-premier", "false");

    const passage = (heure: string) =>
      within(carte(heure)).getByText(heure).getAttribute("data-passage");
    expect(passage("10:05")).toBe("proche");
    expect(passage("10:40")).toBe("proche");
    expect(passage("11:10")).toBe("lointain");

    const places = (texte: string) => screen.getByText(texte).getAttribute("data-places");
    expect(places("· 3 places")).toBe("assez");
    expect(places("· 7 places")).toBe("assez");
    expect(places("· 1 place")).toBe("rares");
  });

  it("affiche la note : payer bloque la place, le bus s'arrête, prix au prorata", async () => {
    rendreAppArret();
    await attendreEcran();
    expect(
      screen.getByText(
        "Tu paies maintenant, la place est bloquée. Le bus s'arrête parce qu'il sait que tu es là. " +
          "Prix au prorata de la distance, fixé par la compagnie.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Arret · ce que le serveur décide", () => {
  it("montre le prix, les places et les heures renvoyés par le serveur (le prix vient du réglage de la ligne)", async () => {
    const { source } = avecOffres((reponse) => ({
      ...reponse,
      bus: [
        busQuiPasse({
          departId: "dep-a",
          compagnie: { id: "cie-a", nom: "Alpha Voyages" },
          classe: "classique",
          passeA: "2027-01-05T10:20:00.000+01:00",
          passeDansMinutes: 29,
          placesLibres: 12,
          arriveeDestination: "2027-01-05T12:00:00.000+01:00",
          prix: 3150,
        }),
      ],
    }));
    rendreAppArret({ client: clientArret(source) });
    await screen.findByText("Alpha Voyages");

    expect(carte("10:20")).toHaveTextContent(
      "10:20dans 29 minAlpha Voyages · 12 placesparti de Douala 08:04 · arrive Yaoundé 12:00" +
        "3 150prorata",
    );
  });

  it("n'écrit pas « prorata » sous un prix qui n'est pas au prorata", async () => {
    const { source } = avecOffres((reponse) => ({
      ...reponse,
      bus: [busQuiPasse({ prorata: false, prix: 5000 })],
    }));
    rendreAppArret({ client: clientArret(source) });
    await attendreEcran();
    expect(carte("10:05")).toHaveTextContent(/5 000$/);
    expect(screen.queryByText("prorata")).not.toBeInTheDocument();
  });

  it("annonce la place au singulier, le délai en heures, et la classe quand le bus n'a pas de départ connu", async () => {
    const { source } = avecOffres((reponse) => {
      const { partiA: _partiA, ...sansDepart } = busQuiPasse();
      return {
        ...reponse,
        bus: [
          {
            ...sansDepart,
            departId: "dep-vip",
            compagnie: { id: "cie-v", nom: "Bêta Express VIP" },
            passeDansMinutes: 125,
            placesLibres: 1,
          },
        ],
      };
    });
    rendreAppArret({ client: clientArret(source) });
    await screen.findByText("Bêta Express VIP");
    expect(carte("10:05")).toHaveTextContent(
      "10:05dans 2 h 05Bêta Express VIP · 1 placeVIP · arrive Yaoundé 11:35",
    );
  });

  it("range les bus du plus proche au plus lointain, quel que soit l'ordre de la réponse", async () => {
    const { source } = avecOffres((reponse) => ({ ...reponse, bus: [...reponse.bus].reverse() }));
    rendreAppArret({ client: clientArret(source) });
    await attendreEcran();
    const heures = within(principal())
      .getAllByRole("link")
      .map((a) => a.textContent?.slice(0, 5));
    expect(heures).toEqual(["10:05", "10:40", "11:10"]);
    expect(carte("10:05")).toHaveAttribute("data-premier", "true");
  });

  it("n'affiche pas la pastille GPS quand le lieu vient de l'arrêt choisi, pas du GPS", async () => {
    const { source } = avecOffres((reponse) => ({
      ...reponse,
      arret: { ...reponse.arret, gps: false },
    }));
    rendreAppArret({ client: clientArret(source) });
    await attendreEcran();
    expect(screen.queryByText("GPS")).not.toBeInTheDocument();
  });
});

describe("Arret · navigation", () => {
  it("« Retour » mène à l'accueil du voyageur", async () => {
    const { routeur } = rendreAppArret();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(href(retour)).toBe("/voyager");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it("la barre d'onglets éclaire Voyager et mène à Colis, Covoit et Moi", async () => {
    rendreAppArret();
    await attendreEcran();
    const onglets = within(barre());
    expect(onglets.getByRole("link", { name: "Voyager" })).toHaveAttribute("aria-current", "page");
    expect(href(onglets.getByRole("link", { name: "Voyager" }))).toBe("/voyager");
    expect(href(onglets.getByRole("link", { name: "Colis" }))).toBe("/colis");
    expect(href(onglets.getByRole("link", { name: "Covoit" }))).toBe("/covoit");
    expect(href(onglets.getByRole("link", { name: "Moi" }))).toBe("/moi");
  });

  it("chaque bus mène au siège et au paiement de son départ, avec l'arrêt de montée", async () => {
    const { routeur } = rendreAppArret();
    await attendreEcran();

    for (const heure of ["10:05", "10:40", "11:10"]) {
      const lien = href(carte(heure)) ?? "";
      expect(lien).toMatch(/^\/depart\/dep-route-[a-z0-9-]+\?arretId=pouma$/);
    }
    // Trois départs, trois adresses différentes.
    const adresses = ["10:05", "10:40", "11:10"].map((h) => href(carte(h)));
    expect(new Set(adresses).size).toBe(3);

    const premier = carte("10:05").getAttribute("data-depart") ?? "";
    await userEvent.click(carte("10:05"));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(`/depart/${premier}`));
    expect(routeur.state.location.search).toBe("?arretId=pouma");
  });
});

describe("Arret · le lieu du voyageur", () => {
  it("dans la démonstration, interroge le serveur tout de suite, sans demander la position", async () => {
    const lire = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: lire },
      configurable: true,
    });
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source) });
    await attendreEcran();
    expect(appels).toEqual([{}]);
    expect(lire).not.toHaveBeenCalled();
  });

  it("l'arrêt de l'adresse passe tel quel au serveur", async () => {
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source), url: "/monter-en-route?arretId=pouma" });
    await attendreEcran();
    expect(appels).toEqual([{ arretId: "pouma" }]);
  });

  it("des coordonnées dans l'adresse passent aussi, et une valeur qui n'est pas un nombre est ignorée", async () => {
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source), url: "/monter-en-route?lat=3.84&lng=10.4" });
    await attendreEcran();
    expect(appels).toEqual([{ latitude: 3.84, longitude: 10.4 }]);

    const autre = avecOffres();
    rendreAppArret({
      client: clientArret(autre.source),
      url: "/monter-en-route?lat=abc&lng=10.4",
      scenario: null,
    });
    await waitFor(() => expect(autre.appels).toEqual([{}]));
  });

  it("hors démonstration, utilise la position GPS du téléphone", async () => {
    const lire = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 3.9, longitude: 10.4 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: lire },
      configurable: true,
    });
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source), scenario: null });
    await attendreEcran();
    expect(appels).toEqual([{ latitude: 3.9, longitude: 10.4 }]);
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("si la position est refusée, la demande part quand même, sans lieu", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_ok: PositionCallback, ko: PositionErrorCallback) =>
          ko({} as GeolocationPositionError),
      },
      configurable: true,
    });
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source), scenario: null });
    await attendreEcran();
    expect(appels).toEqual([{}]);
  });

  it("sans GPS dans le navigateur, la demande part sans lieu", async () => {
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source), scenario: null });
    await attendreEcran();
    expect(appels).toEqual([{}]);
  });

  it("tant que la permission n'est pas donnée, attend ; passé le délai, laisse le serveur décider ; une position tardive relance", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let donner: PositionCallback | undefined;
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (ok: PositionCallback) => (donner = ok) },
      configurable: true,
    });
    const { source, appels } = avecOffres();
    rendreAppArret({ client: clientArret(source), scenario: null });

    // La position est attendue : squelettes, aucune demande.
    expect(
      await screen.findByRole("status", { name: "Chargement des bus qui passent" }),
    ).toBeInTheDocument();
    expect(appels).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_POSITION_MS + 100);
    });
    await attendreEcran();
    expect(appels).toEqual([{}]);

    // L'utilisateur finit par accepter : la demande repart avec sa position.
    await act(async () => {
      donner?.({ coords: { latitude: 3.9, longitude: 10.4 } } as GeolocationPosition);
    });
    await waitFor(() => expect(appels).toContainEqual({ latitude: 3.9, longitude: 10.4 }));
  });
});

describe("Arret · en direct", () => {
  it("relit les bus toutes les 30 secondes : délais et places à jour", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { source } = avecOffres((reponse, _params, appel) =>
      appel === 1
        ? reponse
        : {
            ...reponse,
            maintenant: "2027-01-05T09:52:00.000+01:00",
            bus: reponse.bus.map((b, i) =>
              i === 0 ? { ...b, passeDansMinutes: 13, placesLibres: 1 } : b,
            ),
          },
    );
    rendreAppArret({ client: clientArret(source) });
    await attendreEcran();
    expect(carte("10:05")).toHaveTextContent("dans 14 min");
    expect(screen.getByText("· 3 places")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RAFRAICHISSEMENT_MS + 100);
    });

    await waitFor(() => expect(carte("10:05")).toHaveTextContent("dans 13 min"));
    expect(carte("10:05")).toHaveTextContent("· 1 place");
    expect(carte("10:05").querySelector("[data-places='rares']")).not.toBeNull();
  });
});

describe("Arret · chargement, vide, erreur", () => {
  it("pendant le chargement : squelettes dans le style nuit, retour, note et barre déjà là", async () => {
    const source = sourceModifiee((operations) => [
      implementer(
        voyageur.OP_OFFRES_MONTEE,
        () => new Promise<c.OffresMonteeEnRoute>(() => undefined),
      ),
      ...operations,
    ]);
    rendreAppArret({ client: clientArret(source) });

    expect(
      await screen.findByRole("status", { name: "Chargement des bus qui passent" }),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Monter en route")).toBeInTheDocument();
    expect(screen.getByText("Bus qui passent avec des places")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByText(/^Tu paies maintenant/)).toBeInTheDocument();
    expect(barre()).toBeInTheDocument();
    // Pas de faux bus : aucune carte cliquable tant que rien n'est arrivé.
    expect(within(principal()).queryAllByRole("link")).toHaveLength(0);
  });

  it("sans bus qui passe : la ligne et la note restent, un message le dit", async () => {
    const { source } = avecOffres((reponse) => ({ ...reponse, bus: [] }));
    rendreAppArret({ client: clientArret(source) });

    expect(
      await screen.findByText("Aucun bus avec des places ne passe ici dans les prochaines heures."),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    expect(screen.getByText("Ligne Douala → Yaoundé")).toBeInTheDocument();
    expect(screen.getByText("Pouma · toi")).toBeInTheDocument();
    expect(screen.getByText(/^Tu paies maintenant/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(within(principal()).queryAllByRole("link")).toHaveLength(0);
  });

  it("en cas d'erreur : message et « Réessayer » qui recharge les bus", async () => {
    const { source, appels } = avecOffres((reponse, _params, appel) => {
      if (appel === 1) throw new ErreurReseau();
      return reponse;
    });
    rendreAppArret({ client: clientArret(source) });

    expect(
      await screen.findByText("Les bus qui passent ne se sont pas chargés."),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(barre()).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(
      screen.queryByText("Les bus qui passent ne se sont pas chargés."),
    ).not.toBeInTheDocument();
    expect(appels).toHaveLength(2);
  });
});
