import { ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RAFRAICHISSEMENT_MS } from "./EcranReseau";
import {
  avecApercu,
  avecRecherche,
  clientReseau,
  departBus,
  rendreAppReseau,
  sourceModifiee,
} from "./test-outils";

afterEach(() => {
  vi.useRealTimers();
});

/** Attend que les lignes du réseau soient affichées. */
async function attendreEcran() {
  return screen.findByText("Douala → Yaoundé");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** La ligne (lien) de la zone principale qui commence par ce trajet. */
function ligne(trajet: string): HTMLAnchorElement {
  const lien = within(principal())
    .getAllByRole("link")
    .find((a) => a.textContent?.startsWith(trajet));
  if (!lien) throw new Error(`Pas de ligne « ${trajet} »`);
  return lien as HTMLAnchorElement;
}

const barre = () => screen.getByRole("navigation", { name: "Navigation" });
const href = (el: HTMLElement) => el.getAttribute("href");

describe("Reseau · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, titre, résumé du réseau et pastille horaire qui pulse", async () => {
    rendreAppReseau();
    await attendreEcran();

    expect(screen.getByText("Le réseau en direct")).toBeInTheDocument();
    expect(
      screen.getByText("5 compagnies · 38 bus en route · 14 départs à venir"),
    ).toBeInTheDocument();
    const heure = screen.getByText("07:40");
    expect(heure.querySelector("[data-pulse='true']")).not.toBeNull();
    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Le réseau en direct · toutes les compagnies",
    );
  });

  it("affiche les six filtres, « Toutes » étant choisi", async () => {
    rendreAppReseau();
    await attendreEcran();
    const noms = ["Toutes", "Bêta", "Alpha", "Oméga", "VIP", "Nuit"];
    const boutons = noms.map((nom) => screen.getByRole("button", { name: nom }));
    expect(boutons.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
  });

  it("dessine la carte du réseau avec ses six villes et la légende des compagnies", async () => {
    rendreAppReseau();
    await attendreEcran();
    const carte = screen.getByRole("img", {
      name: "Carte du réseau : Douala, Yaoundé, Bafoussam, Bamenda, Kribi, Ngaoundéré",
    });
    for (const ville of ["Douala", "Yaoundé", "Bafoussam", "Bamenda", "Kribi", "Ngaoundéré"]) {
      expect(within(carte as unknown as HTMLElement).getByText(ville)).toBeInTheDocument();
    }
    expect(
      within(carte as unknown as HTMLElement).getByText(/● Bêta.*● Alpha.*● Oméga/),
    ).toBeInTheDocument();
  });

  it("affiche les quatre lignes avec leurs prochains départs et leurs prix « dès … »", async () => {
    rendreAppReseau();
    await attendreEcran();
    expect(screen.getByText("Lignes · prochain départ")).toBeInTheDocument();
    expect(screen.getByText("touche une ligne")).toBeInTheDocument();

    const dlaYde = ligne("Douala → Yaoundé");
    expect(dlaYde).toHaveTextContent("3 compagnies · 08:00 Bêta VIP · 08:30 Alpha · 09:30 Oméga");
    expect(dlaYde).toHaveTextContent("dès 3 800");

    const dlaBaf = ligne("Douala → Bafoussam");
    expect(dlaBaf).toHaveTextContent("2 compagnies · 08:15 Alpha · 10:00 Oméga");
    expect(dlaBaf).toHaveTextContent("dès 3 500");

    const ydeBam = ligne("Yaoundé → Bamenda");
    expect(within(ydeBam).getByText("via Bafoussam")).toBeInTheDocument();
    expect(ydeBam).toHaveTextContent("correspondance 25 min · un seul billet");
    expect(ydeBam).toHaveTextContent("dès 7 000");
  });

  it("montre la ligne sans bus comme un covoiturage : en pointillés, en vert, sans « dès »", async () => {
    rendreAppReseau();
    await attendreEcran();
    const kribi = ligne("Douala → Kribi");
    expect(kribi).toHaveAttribute("data-mode", "covoiturage");
    expect(within(kribi).getByText("covoiturage")).toBeInTheDocument();
    expect(kribi).toHaveTextContent("aucun bus avant 14 h · 2 voitures partent ce matin");
    expect(kribi).toHaveTextContent(/4 000$/);
    expect(kribi).not.toHaveTextContent("dès");
    // Les lignes de bus, elles, ne sont pas des covoiturages.
    expect(ligne("Douala → Yaoundé")).toHaveAttribute("data-mode", "bus");
  });
});

describe("Reseau · navigation", () => {
  it("« Retour à l'accueil » mène à l'accueil du voyageur", async () => {
    rendreAppReseau();
    await attendreEcran();
    expect(href(screen.getByRole("link", { name: "Retour à l'accueil" }))).toBe("/voyager");
  });

  it("la barre d'onglets éclaire Voyager et mène à Colis, Covoit et Moi", async () => {
    rendreAppReseau();
    await attendreEcran();
    const onglets = within(barre());
    expect(onglets.getByRole("link", { name: "Voyager" })).toHaveAttribute("aria-current", "page");
    expect(href(onglets.getByRole("link", { name: "Voyager" }))).toBe("/voyager");
    expect(href(onglets.getByRole("link", { name: "Colis" }))).toBe("/colis");
    expect(href(onglets.getByRole("link", { name: "Covoit" }))).toBe("/covoit");
    expect(href(onglets.getByRole("link", { name: "Moi" }))).toBe("/moi");
  });

  it("une ligne de bus ouvre le siège et le paiement du prochain départ de la ligne", async () => {
    const { source, recherches } = avecRecherche(({ depart, arrivee }) =>
      `${depart}-${arrivee}` === "DLA-YDE"
        ? [
            departBus("dep-bex-dla-yde-270105-0700", "07:00", "Bêta Express"),
            departBus("dep-bex-dla-yde-270105-0800", "08:00", "Bêta Express"),
            departBus("dep-alp-dla-yde-270105-0830", "08:30"),
          ]
        : [
            departBus("dep-alp-dla-baf-270105-0815", "08:15"),
            departBus("dep-omg-dla-baf-270105-1000", "10:00", "Oméga"),
          ],
    );
    const { routeur } = rendreAppReseau({ client: clientReseau(source) });
    await attendreEcran();

    // Douala → Yaoundé : le prochain départ est celui de 08:00 annoncé par le réseau (pas celui de 07:00, déjà parti).
    await waitFor(() =>
      expect(href(ligne("Douala → Yaoundé"))).toBe("/depart/dep-bex-dla-yde-270105-0800"),
    );
    await waitFor(() =>
      expect(href(ligne("Douala → Bafoussam"))).toBe("/depart/dep-alp-dla-baf-270105-0815"),
    );
    expect(recherches).toContainEqual({ depart: "DLA", arrivee: "YDE" });
    expect(recherches).toContainEqual({ depart: "DLA", arrivee: "BAF" });
    // Un covoiturage ne cherche pas de bus.
    expect(recherches.some((r) => r.arrivee === "KRI")).toBe(false);

    await userEvent.click(ligne("Douala → Yaoundé"));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/depart/dep-bex-dla-yde-270105-0800"),
    );
  });

  it("la correspondance « un seul billet » ouvre aussi le départ de sa ligne", async () => {
    const { source } = avecRecherche(({ depart, arrivee }) =>
      depart === "YDE" && arrivee === "BAM"
        ? [departBus("dep-alp-yde-bam-270105-0900", "09:00")]
        : [],
    );
    rendreAppReseau({ client: clientReseau(source) });
    await attendreEcran();
    // L'heure annoncée n'existe pas dans la recherche : on prend le premier départ qui n'est pas déjà parti.
    await waitFor(() =>
      expect(href(ligne("Yaoundé → Bamenda"))).toBe("/depart/dep-alp-yde-bam-270105-0900"),
    );
  });

  it("si la recherche de départs est en panne, la ligne mène quand même à l'écran du départ (sous l'identifiant de la ligne)", async () => {
    const source = sourceModifiee((operations) => [
      implementer(voyageur.OP_RECHERCHER_DEPARTS, () => {
        throw new ErreurReseau();
      }),
      ...operations,
    ]);
    const { routeur } = rendreAppReseau({ client: clientReseau(source) });
    await attendreEcran();
    expect(href(ligne("Douala → Bafoussam"))).toBe("/depart/ligne-douala-bafoussam");
    await userEvent.click(ligne("Douala → Bafoussam"));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/depart/ligne-douala-bafoussam"),
    );
  });

  it("ignore les départs d'un autre trajet que celui de la ligne", async () => {
    // Le serveur répond toujours Douala → Yaoundé : seule la ligne Douala → Yaoundé peut en prendre un départ.
    const { source, recherches } = avecRecherche(() => [
      departBus("dep-bex-dla-yde-270105-0800", "08:00"),
    ]);
    const toujoursDlaYde = sourceModifiee((operations) => {
      const origine = operations.find(
        (o) => o.operation.nom === voyageur.OP_RECHERCHER_DEPARTS.nom,
      )!;
      return [
        implementer(voyageur.OP_RECHERCHER_DEPARTS, async (params, ctx) => ({
          ...((await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as c.ResultatRechercheDeparts),
          depart: { code: "DLA", nom: "Douala" },
          arrivee: { code: "YDE", nom: "Yaoundé" },
        })),
        ...operations,
      ];
    }, source);
    rendreAppReseau({ client: clientReseau(toujoursDlaYde) });
    await attendreEcran();
    await waitFor(() =>
      expect(href(ligne("Douala → Yaoundé"))).toBe("/depart/dep-bex-dla-yde-270105-0800"),
    );
    // Les trois lignes de bus ont interrogé le serveur : les deux autres n'ont pas pris le départ reçu.
    await waitFor(() => expect(recherches).toHaveLength(3));
    await act(async () => undefined);
    expect(href(ligne("Douala → Bafoussam"))).toBe("/depart/ligne-douala-bafoussam");
    expect(href(ligne("Yaoundé → Bamenda"))).toBe("/depart/ligne-yaounde-bamenda");
  });

  it("la ligne en covoiturage ouvre le covoiturage", async () => {
    const { routeur } = rendreAppReseau();
    await attendreEcran();
    expect(href(ligne("Douala → Kribi"))).toBe("/covoit");
    await userEvent.click(ligne("Douala → Kribi"));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/covoit"));
  });

  it("« Retour à l'accueil » ramène à l'accueil du voyageur", async () => {
    const { routeur } = rendreAppReseau();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour à l'accueil" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });
});

describe("Reseau · filtres", () => {
  it("toucher un filtre le demande au serveur et ne garde que les lignes de cette compagnie", async () => {
    const demandes: c.DemandeReseau[] = [];
    const source = avecApercu((reponse, params) => {
      demandes.push(params);
      return reponse;
    });
    rendreAppReseau({ client: clientReseau(source) });
    await attendreEcran();
    expect(demandes).toEqual([{}]);

    await userEvent.click(screen.getByRole("button", { name: "Oméga" }));

    await waitFor(() => expect(demandes).toContainEqual({ filtre: "Oméga" }));
    await waitFor(() => expect(screen.queryByText("Douala → Kribi")).not.toBeInTheDocument());
    expect(ligne("Douala → Yaoundé")).toBeInTheDocument();
    expect(ligne("Douala → Bafoussam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oméga" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Toutes" })).toHaveAttribute("aria-pressed", "false");

    // Revenir à « Toutes » rend toutes les lignes.
    await userEvent.click(screen.getByRole("button", { name: "Toutes" }));
    expect(await screen.findByText("Douala → Kribi")).toBeInTheDocument();
  });

  it("un filtre sans aucune ligne affiche le message vide, sans casser la page", async () => {
    rendreAppReseau();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Nuit" }));
    expect(await screen.findByText("Aucune ligne pour ce filtre.")).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    // L'en-tête, les filtres, la carte et la barre restent.
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toutes" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Carte du réseau/ })).toBeInTheDocument();
    expect(barre()).toBeInTheDocument();
  });
});

describe("Reseau · en direct", () => {
  it("rafraîchit l'heure de la pastille et les lignes toutes les 30 secondes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let appels = 0;
    const source = avecApercu((reponse) => {
      appels += 1;
      return appels === 1
        ? reponse
        : {
            ...reponse,
            maintenant: "2027-01-05T07:41:00.000+01:00",
            busEnRoute: 39,
            lignes: reponse.lignes.map((l) =>
              l.arrivee === "Yaoundé" ? { ...l, resume: "3 compagnies · 08:30 Alpha" } : l,
            ),
          };
    });
    rendreAppReseau({ client: clientReseau(source) });
    await attendreEcran();
    expect(screen.getByText("07:40")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RAFRAICHISSEMENT_MS + 100);
    });

    expect(await screen.findByText("07:41")).toBeInTheDocument();
    expect(screen.queryByText("07:40")).not.toBeInTheDocument();
    expect(screen.getByText(/39 bus en route/)).toBeInTheDocument();
    expect(ligne("Douala → Yaoundé")).toHaveTextContent("3 compagnies · 08:30 Alpha");
  });
});

describe("Reseau · chargement, erreur", () => {
  it("pendant le chargement : squelettes dans le style nuit, retour, carte et barre déjà là", async () => {
    const source = sourceModifiee((operations) => [
      implementer(voyageur.OP_RESEAU, () => new Promise<c.ApercuReseau>(() => undefined)),
      ...operations,
    ]);
    rendreAppReseau({ client: clientReseau(source) });

    expect(
      await screen.findByRole("status", { name: "Chargement des lignes" }),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Le réseau en direct")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Carte du réseau/ })).toBeInTheDocument();
    expect(screen.getByText("Lignes · prochain départ")).toBeInTheDocument();
    expect(barre()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toutes" })).not.toBeInTheDocument();
  });

  it("en cas d'erreur : message et « Réessayer » qui recharge le réseau", async () => {
    let tentatives = 0;
    const source = sourceModifiee((operations) => {
      const origine = operations.find((o) => o.operation.nom === voyageur.OP_RESEAU.nom)!;
      return [
        implementer(voyageur.OP_RESEAU, async (params, ctx) => {
          tentatives += 1;
          if (tentatives === 1) throw new ErreurReseau();
          return (await (origine.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as c.ApercuReseau;
        }),
        ...operations,
      ];
    });
    rendreAppReseau({ client: clientReseau(source) });

    expect(await screen.findByText("Le réseau ne s'est pas chargé.")).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Douala → Yaoundé")).toBeInTheDocument();
    expect(screen.queryByText("Le réseau ne s'est pas chargé.")).not.toBeInTheDocument();
    expect(tentatives).toBe(2);
  });
});
