import {
  agence,
  creerClientMock,
  ErreurReseau,
  implementer,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { AccueilVue } from "./accueil-vue";
import { EcranGuichet } from "./index";
import { ecartCaisse, heureDouala, montantCourt } from "./formats";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import {
  avecAccueil,
  clientGuichet,
  rendreAppGuichet,
  rendreIsole,
  sourceModifiee,
} from "./test-outils";

afterEach(() => {
  vi.restoreAllMocks();
});

async function attendreEcran() {
  return screen.findByText("Alpha Voyages · Akwa");
}

/** Le lien (ou le bouton) qui porte ce texte dans la zone principale. */
function carte(titre: string): HTMLElement {
  const lien = screen.getByText(titre).closest("a");
  if (!lien) throw new Error(`Pas de lien pour « ${titre} »`);
  return lien;
}

describe("Guichet · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête de l'agence, la pastille et les trois compteurs", async () => {
    rendreAppGuichet();
    await attendreEcran();
    expect(screen.getByText("Guichet 2 · Joseph M. · caisse ouverte 05:02")).toBeInTheDocument();
    expect(screen.getByText("SYNC")).toBeInTheDocument();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Guichet — accueil de l'agent (tout à 1 touche)",
    );

    for (const [etiquette, valeur, detail] of [
      ["Billets", "184", "ce matin"],
      ["Colis", "41", "dont 3 à charger"],
      ["En caisse", "612 k", "écart 0"],
    ] as const) {
      const principal = document.querySelector("main") as HTMLElement;
      const tuile = within(principal).getByText(etiquette).parentElement as HTMLElement;
      expect(within(tuile).getByText(valeur)).toBeInTheDocument();
      expect(within(tuile).getByText(detail)).toBeInTheDocument();
    }
  });

  it("affiche chaque action avec ses textes, le compteur du quai et la file de la cadence", async () => {
    rendreAppGuichet();
    await attendreEcran();
    expect(carte("Vendre un billet")).toHaveTextContent(
      "départ · siège · nom · encaisser · imprimer : 3 touches",
    );
    expect(carte("Enregistrer un colis")).toHaveTextContent("photo, étiquette, SMS");
    expect(carte("Dépôt prépayé")).toHaveTextContent("scanner le code du client");
    expect(carte("Quai · embarquer")).toHaveTextContent("08:30 Yaoundé · 31/40 scannés");
    expect(carte("Ma caisse")).toHaveTextContent("fermer, compter, écart");
    expect(carte("Mode cadence · file de 40")).toBeInTheDocument();
    expect(carte("Appeler le superviseur")).toBeInTheDocument();
  });

  it("annonce le prochain départ et l'ouverture suivante dans une seule phrase", async () => {
    rendreAppGuichet();
    await attendreEcran();
    expect(
      screen.getByText(
        "Prochain départ dans 12 min : 08:30 Yaoundé, 9 places. Le 09:00 Bafoussam ouvre à la vente.",
      ),
    ).toBeInTheDocument();
  });

  it("garde la barre d'onglets du guichet, Guichet courant", async () => {
    rendreAppGuichet();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation guichet" });
    const liens = within(barre).getAllByRole("link");
    expect(liens.map((l) => l.textContent)).toEqual([
      "Guichet",
      "Vendre",
      "Colis",
      "Quai",
      "Caisse",
    ]);
    expect(within(barre).getByRole("link", { name: "Guichet" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt »", async () => {
    const container = document.body;
    rendreAppGuichet();
    await attendreEcran();
    expect(container.querySelectorAll(":disabled")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/bient[ôo]t/i);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("garde des cibles tactiles d'au moins 44 px (hauteur minimale des liens)", async () => {
    rendreAppGuichet();
    await attendreEcran();
    const principal = document.querySelector("main") as HTMLElement;
    const liens = within(principal).getAllByRole("link");
    expect(liens).toHaveLength(7);
    for (const lien of liens) {
      const minimum = parseFloat(getComputedStyle(lien).minHeight);
      expect(minimum, lien.textContent ?? "").toBeGreaterThanOrEqual(44);
    }
  });
});

describe("Guichet · navigation identique à la maquette", () => {
  const cartes = [
    ["Vendre un billet", "/guichet/vendre"],
    ["Enregistrer un colis", "/guichet/colis"],
    ["Dépôt prépayé", "/guichet/depot"],
    ["Quai · embarquer", "/embarquement"],
    ["Ma caisse", "/guichet/caisse"],
    ["Mode cadence · file de 40", "/guichet/cadence"],
    ["Appeler le superviseur", "/gare"],
  ] as const;

  it.each(cartes)("« %s » mène à %s", async (titre, chemin) => {
    const { routeur } = rendreAppGuichet();
    await attendreEcran();
    expect(carte(titre)).toHaveAttribute("href", chemin);
    await userEvent.click(carte(titre));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  const onglets = [
    ["Vendre", "/guichet/vendre"],
    ["Colis", "/guichet/colis"],
    ["Quai", "/embarquement"],
    ["Caisse", "/guichet/caisse"],
  ] as const;

  it.each(onglets)("l'onglet « %s » mène à %s", async (libelle, chemin) => {
    const { routeur } = rendreAppGuichet();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation guichet" });
    await userEvent.click(within(barre).getByRole("link", { name: libelle }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("l'onglet « Guichet » reste sur l'écran", async () => {
    const { routeur } = rendreAppGuichet();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation guichet" });
    await userEvent.click(within(barre).getByRole("link", { name: "Guichet" }));
    expect(routeur.state.location.pathname).toBe("/guichet/accueil");
    expect(await attendreEcran()).toBeInTheDocument();
  });
});

describe("Guichet · pastille de synchronisation", () => {
  it("passe de SYNC à HORS LIGNE quand le navigateur perd le réseau, puis revient", async () => {
    const enLigne = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    rendreAppGuichet();
    await attendreEcran();
    expect(screen.getByText("SYNC")).toBeInTheDocument();
    expect(screen.getByText("SYNC").querySelector("[data-pulse='true']")).not.toBeNull();

    enLigne.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("HORS LIGNE")).toBeInTheDocument();
    expect(screen.queryByText("SYNC")).not.toBeInTheDocument();
    expect(screen.getByText("HORS LIGNE")).toHaveAttribute("data-ton", "neutre");
    expect(screen.getByText("HORS LIGNE").querySelector("[class*='point-ambre']")).not.toBeNull();

    enLigne.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByText("SYNC")).toBeInTheDocument();
  });

  it("suit l'état du moteur de synchronisation (synchro.etat) quand l'API le dit hors ligne", async () => {
    const client = clientGuichet({
      source: avecAccueil((a) => ({
        ...a,
        synchro: { ...a.synchro, etat: "hors_ligne" },
      })),
    });
    rendreAppGuichet({ client });
    await attendreEcran();
    expect(screen.getByText("HORS LIGNE")).toBeInTheDocument();
  });

  it("garde SYNC quand des événements attendent d'être envoyés mais que le réseau est là", async () => {
    const client = clientGuichet({
      source: avecAccueil((a) => ({
        ...a,
        synchro: { ...a.synchro, etat: "en_attente", evenementsEnAttente: 3 },
      })),
    });
    rendreAppGuichet({ client });
    await attendreEcran();
    expect(screen.getByText("SYNC")).toBeInTheDocument();
  });
});

describe("Guichet · les tuiles suivent chaque vente, même hors ligne", () => {
  /** Un scénario dont l'accueil compte les billets vendus par l'écriture `billet.vendu` du mock de la vente. */
  function sourceAvecVentes(horsLigne: boolean): SourceScenarios {
    const base = sourceScenariosFixtures();
    let vendus = 0;
    return {
      ...base,
      charger: async (nom) => {
        const guichet = await base.charger("Guichet");
        const vente = await base.charger("Vente");
        const ecrireVente = vente.operations.find(
          (o) => o.operation.nom === agence.ECRITURES.billetVendu.operation.nom,
        )!;
        const lectureAccueil = guichet.operations.find(
          (o) => o.operation.nom === agence.OP_GUICHET_ACCUEIL.nom,
        )!;
        const operations: Scenario["operations"] = [
          // le scénario contient aussi les opérations de repli des autres planches : on retire
          // toutes les implémentations remplacées, pas seulement la première
          ...guichet.operations.filter(
            (o) =>
              o.operation.nom !== agence.OP_GUICHET_ACCUEIL.nom &&
              o.operation.nom !== agence.ECRITURES.billetVendu.operation.nom,
          ),
          implementer(agence.OP_GUICHET_ACCUEIL, async (params, ctx) => {
            const a = (await (lectureAccueil.repondre as (p: unknown, c: unknown) => unknown)(
              params,
              ctx,
            )) as Awaited<ReturnType<typeof agence.OP_GUICHET_ACCUEIL.reponse.parse>>;
            return {
              ...a,
              synchro: { ...a.synchro, etat: horsLigne ? "hors_ligne" : "sync" },
              compteurs: {
                ...a.compteurs,
                billets: a.compteurs.billets + vendus,
                enCaisse: a.compteurs.enCaisse + 4000 * vendus,
              },
            };
          }),
          implementer(agence.ECRITURES.billetVendu.operation, async (params, ctx) => {
            const reponse = await (ecrireVente.repondre as (p: unknown, c: unknown) => unknown)(
              params,
              ctx,
            );
            vendus += 1;
            return reponse as never;
          }),
        ];
        return { ...guichet, nom, operations };
      },
    };
  }

  function BoutonVente() {
    const vendre = agence.useVendreBillet();
    return (
      <button
        type="button"
        onClick={() =>
          vendre.mutate({
            billetId: "billet-test-1",
            departId: ecrans.Vente.entites.departs![0]!.id,
            siege: 24,
            classe: "classique",
            prix: 4000,
            bagage: 0,
            passager: {
              nom: "Tchoumi Paul",
              telephone: "+237677301145",
              pieceQuatreDerniers: "8820",
            },
            paiement: { mode: "cash", recu: 5000, rendu: 1000, reference: null },
            codeBillet: "6204",
            sms: true,
          })
        }
      >
        Vendre (test)
      </button>
    );
  }

  it.each([
    ["en ligne", false, "SYNC"],
    ["hors ligne", true, "HORS LIGNE"],
  ] as const)("compteurs mis à jour à chaque vente, %s", async (_nom, horsLigne, pastille) => {
    const client = creerClientMock({
      source: sourceAvecVentes(horsLigne),
      scenario: "Guichet",
      latenceMs: 0,
    });
    rendreIsole(
      client,
      <>
        <EcranGuichet />
        <BoutonVente />
      </>,
    );
    expect(await screen.findByText("184")).toBeInTheDocument();
    expect(screen.getByText("612 k")).toBeInTheDocument();
    expect(screen.getByText(pastille)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vendre (test)" }));
    expect(await screen.findByText("185")).toBeInTheDocument();
    expect(screen.getByText("616 k")).toBeInTheDocument();
    expect(screen.getByText(pastille)).toBeInTheDocument();
  });
});

describe("Guichet · états chargement, vide et erreur", () => {
  const pastille = "sync" as const;

  it("chargement : même structure, actions utilisables, aucun texte de donnée", () => {
    rendreIsole(clientGuichet(), <AccueilVue etat="chargement" pastille={pastille} />);
    const principal = document.querySelector("main") as HTMLElement;
    expect(principal).toHaveAttribute("aria-busy", "true");
    expect(within(principal).getAllByRole("link")).toHaveLength(7);
    expect(screen.queryByText("184")).not.toBeInTheDocument();
    expect(screen.queryByText(/Prochain départ/)).not.toBeInTheDocument();
    // Sans la file ni le compteur du quai, les libellés restent ceux de la planche.
    expect(carte("Mode cadence")).toBeInTheDocument();
    expect(carte("Quai · embarquer")).not.toHaveTextContent("scannés");
  });

  it("vide : message dans le style nuit, actions toujours là", () => {
    rendreIsole(clientGuichet(), <AccueilVue etat="vide" pastille={pastille} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aucune information pour ce guichet pour le moment.",
    );
    expect(carte("Vendre un billet")).toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, et la vente reste accessible", async () => {
    const appels = vi.fn();
    const source = sourceModifiee((operations) =>
      operations.map((impl) =>
        impl.operation.nom === agence.OP_GUICHET_ACCUEIL.nom
          ? implementer(agence.OP_GUICHET_ACCUEIL, (params, ctx) => {
              appels();
              if (appels.mock.calls.length === 1) throw new ErreurReseau("coupure");
              return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
            })
          : impl,
      ),
    );
    rendreAppGuichet({ client: clientGuichet({ source }) });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("L'accueil du guichet ne s'est pas chargé.");
    expect(carte("Vendre un billet")).toHaveAttribute("href", "/guichet/vendre");
    expect(screen.queryByText("184")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.getByText("184")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Guichet · valeurs affichées", () => {
  it("écart non nul : en ambre, avec le signe de la planche Caisse", async () => {
    const client = clientGuichet({
      source: avecAccueil((a) => ({
        ...a,
        compteurs: { ...a.compteurs, enCaisse: 612_500, ecart: -1000 },
      })),
    });
    rendreAppGuichet({ client });
    await attendreEcran();
    expect(screen.getByText("612,5 k")).toBeInTheDocument();
    const ecart = screen.getByText("écart − 1 000");
    expect(ecart).toHaveAttribute("data-ton", "ambre");
  });

  it("écart nul : en vert", async () => {
    rendreAppGuichet();
    await attendreEcran();
    expect(screen.getByText("écart 0")).toHaveAttribute("data-ton", "vert");
  });

  it("une seule place : singulier ; pas d'ouverture suivante : une seule phrase", async () => {
    const client = clientGuichet({
      source: avecAccueil((a) => ({
        ...a,
        prochainDepart: { ...a.prochainDepart, placesLibres: 1 },
        prochaineOuverture: null,
      })),
    });
    rendreAppGuichet({ client });
    await attendreEcran();
    expect(
      screen.getByText("Prochain départ dans 12 min : 08:30 Yaoundé, 1 place."),
    ).toBeInTheDocument();
  });

  it("formats", () => {
    expect(heureDouala("2027-01-05T08:30:00.000+01:00")).toBe("08:30");
    expect(montantCourt(612_000)).toBe("612 k");
    expect(montantCourt(612_500)).toBe("612,5 k");
    expect(montantCourt(850)).toBe("850");
    expect(ecartCaisse(0)).toBe("0");
    expect(ecartCaisse(-1000)).toBe("− 1 000");
    expect(ecartCaisse(500)).toBe("+ 500");
  });
});

describe("Guichet · textes", () => {
  function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
    return Object.entries(objet).flatMap(([cle, valeur]) =>
      typeof valeur === "object" && valeur !== null
        ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
        : [`${prefixe}${cle}`],
    );
  }

  it("a les mêmes clés en français, anglais et pidgin, le français rempli", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
    const vides = cles(fr).filter((cle) => {
      const valeur = cle
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], fr);
      return String(valeur).trim() === "";
    });
    expect(vides).toEqual([]);
  });

  it("se replie sur le français quand l'anglais est vide", () => {
    const i18n = creerI18n("en");
    expect(i18n.t("Guichet:actions.vendre.titre")).toBe("Vendre un billet");
    expect(
      i18n.t("Guichet:prochain.depart", {
        count: 2,
        minutes: 5,
        heure: "08:30",
        destination: "Yaoundé",
      }),
    ).toBe("Prochain départ dans 5 min : 08:30 Yaoundé, 2 places.");
  });
});
