import { ErreurHttp, ErreurReseau, voyageur } from "@afrimove/api-client";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rendreApp } from "@/test/rendre";
import {
  BILLET_ID,
  avecPanne,
  avecPositionEnDirect,
  avecSuivi,
  clientDirect,
  espionner,
  messagePosition,
  rendreDirect,
} from "./rendre-direct";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOM_CARTE = "Carte de la ligne Douala – Yaoundé, bus après Edéa";

async function attendreCarte() {
  return screen.findByRole("img", { name: /^Carte de la ligne/ });
}

const lien = (nom: string | RegExp) => screen.getByRole("link", { name: nom });
const arrets = () => within(screen.getByRole("list", { name: "Arrêts du trajet" }));

describe("Direct · rendu de la planche (scénario de démo)", () => {
  it("affiche la carte, la pastille, l'arrivée estimée, le bus et son siège comme la maquette", async () => {
    rendreDirect();
    const carte = await attendreCarte();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Mon bus en direct · prévenir un proche",
    );
    expect(carte).toHaveAccessibleName(NOM_CARTE);
    for (const texte of ["Douala", "Edéa", "Yaoundé", "84 km/h"]) {
      expect(within(carte).getByText(texte)).toBeInTheDocument();
    }
    expect(screen.getByText("EN DIRECT")).toBeInTheDocument();
    expect(screen.getByText("Arrivée estimée")).toBeInTheDocument();
    expect(screen.getByText("11:35")).toBeInTheDocument();
    expect(screen.getByText("prévu 11:30 · 5 min de retard")).toBeInTheDocument();
    expect(screen.getByText("Bêta Express · siège 7")).toBeInTheDocument();
    expect(screen.getByText("LT 412 AB")).toBeInTheDocument();
  });

  it("liste les arrêts : parti, arrêt, prochain arrêt (en cours) et montée en route avec les places", async () => {
    rendreDirect();
    await attendreCarte();

    const lignes = arrets().getAllByRole("listitem");
    expect(lignes.map((l) => l.textContent)).toEqual([
      "Passé : Douala Akwa · parti08:04",
      "Passé : Edéa · arrêt 10 min09:12",
      "En cours : Pouma · prochain arrêt10:05",
      "À venir : Boumnyebel · 4 places montent ici10:40",
    ]);
    expect(lignes[2]).toHaveAttribute("aria-current", "step");
  });

  it("garde chaque action à portée du pouce : ≥ 44 px de cible, icônes SVG, aucun bouton grisé", async () => {
    rendreDirect();
    await attendreCarte();

    for (const nom of ["Chauffeur", "Signaler"]) {
      const bouton = screen.getByRole("button", { name: nom });
      expect(bouton).toBeEnabled();
      expect(bouton.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
    expect(lien("Mon colis").querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("switch")).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/bientôt/i);
  });

  it("n'affiche pas de siège quand le billet n'en a pas, et dit « à l'heure » sans retard", async () => {
    rendreDirect({
      client: clientDirect(
        avecSuivi((suivi) => ({
          ...suivi,
          siege: null,
          arrivee: { ...suivi.arrivee, estimee: suivi.arrivee.prevue, retardMinutes: 0 },
        })),
      ),
    });
    await attendreCarte();

    expect(screen.getByText("Bêta Express")).toBeInTheDocument();
    expect(screen.getByText("prévu 11:30 · à l'heure")).toBeInTheDocument();
    expect(screen.getByText("11:30", { selector: "span" })).toBeInTheDocument();
  });

  it("montre « SANS SIGNAL » quand le bus n'est pas en direct", async () => {
    rendreDirect({
      client: clientDirect(avecSuivi((suivi) => ({ ...suivi, enDirect: false }))),
    });
    await attendreCarte();
    expect(screen.getByText("SANS SIGNAL")).toBeInTheDocument();
    expect(screen.queryByText("EN DIRECT")).toBeNull();
  });
});

describe("Direct · liens de la planche", () => {
  it("mène au billet, aux proches, à la montée en route et à mon colis", async () => {
    rendreDirect();
    await attendreCarte();

    expect(lien("Retour au billet")).toHaveAttribute("href", `/billet/${BILLET_ID}`);
    expect(lien(/^Prévenir Maman quand j'arrive/)).toHaveAttribute("href", "/moi");
    expect(lien(/Boumnyebel · 4 places montent ici/)).toHaveAttribute("href", "/monter-en-route");
    await waitFor(() =>
      expect(lien("Mon colis")).toHaveAttribute("href", "/colis/colis-c-dla-270105-0017"),
    );
  });

  it("envoie « Mon colis » vers l'envoi d'un colis quand le voyageur n'en a pas sur ce trajet", async () => {
    const { source } = avecPanne(voyageur.OP_COLIS_DU_BILLET.nom, () => new ErreurReseau());
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();
    expect(lien("Mon colis")).toHaveAttribute("href", "/colis");
  });

  it("dans l'application : barre du bas avec « Voyager » éclairé, retour au billet et prévenir → Moi", async () => {
    const { routeur } = rendreApp({
      url: `/billet/${BILLET_ID}/direct`,
      fixtures: true,
      scenario: "Direct",
    });
    await attendreCarte();

    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: "Voyager" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(barre).getByRole("link", { name: "Colis" })).toHaveAttribute("href", "/colis");
    expect(within(barre).getByRole("link", { name: "Covoit" })).toHaveAttribute("href", "/covoit");
    expect(within(barre).getByRole("link", { name: "Moi" })).toHaveAttribute("href", "/moi");

    await userEvent.click(lien(/Boumnyebel/));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/monter-en-route"));
  });

  it.each([
    ["Retour au billet", `/billet/${BILLET_ID}`],
    [/^Prévenir Maman quand j'arrive/, "/moi"],
  ])("dans l'application : « %s » ouvre %s", async (nom, chemin) => {
    const { routeur } = rendreApp({
      url: `/billet/${BILLET_ID}/direct`,
      fixtures: true,
      scenario: "Direct",
    });
    await attendreCarte();
    await userEvent.click(lien(nom));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });
});

describe("Direct · états chargement, vide et erreur", () => {
  it("montre un squelette sans casser la page pendant le chargement", async () => {
    rendreDirect();
    const chargement = screen.getByRole("status", { name: "Chargement du suivi du bus" });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(lien("Retour au billet")).toBeInTheDocument();
    await attendreCarte();
    expect(screen.queryByRole("status", { name: "Chargement du suivi du bus" })).toBeNull();
  });

  it("dit que le bus est introuvable quand le serveur ne connaît pas le billet", async () => {
    const { source } = avecPanne(
      voyageur.OP_SUIVI_BUS.nom,
      () => new ErreurHttp(404, "Introuvable", "INTROUVABLE"),
    );
    rendreDirect({ client: clientDirect(source) });
    expect(await screen.findByRole("heading", { name: "Bus introuvable" })).toBeInTheDocument();
    expect(screen.getByText("Ce billet n'existe plus ou n'est pas à ton nom.")).toBeInTheDocument();
    expect(lien("Retour au billet")).toBeInTheDocument();
  });

  it("propose de réessayer après une panne, puis affiche le suivi", async () => {
    const { source, appels } = avecPanne(voyageur.OP_SUIVI_BUS.nom, (n) =>
      n === 1 ? new ErreurHttp(500, "Panne", "PANNE") : undefined,
    );
    rendreDirect({ client: clientDirect(source) });
    const alerte = await screen.findByRole("alert", undefined, { timeout: 8000 });
    expect(within(alerte).getByText("Le suivi ne s'est pas chargé")).toBeInTheDocument();
    expect(lien("Retour au billet")).toBeInTheDocument();

    const avant = appels();
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreCarte();
    expect(appels()).toBeGreaterThan(avant);
  }, 15000);
});

describe("Direct · position et heure estimée en direct", () => {
  it("applique les messages de position : vitesse, heure estimée, retard et prochain arrêt", async () => {
    const { source, emettre, abonnes } = avecPositionEnDirect();
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();
    await waitFor(() => expect(abonnes()).toBe(1));

    act(() =>
      emettre(
        messagePosition({
          vitesseKmh: 72,
          arriveeEstimee: "2027-01-05T11:50:00.000+01:00",
          retardMinutes: 20,
          prochainArret: "Boumnyebel",
        }),
      ),
    );

    expect(await screen.findByText("11:50")).toBeInTheDocument();
    expect(screen.getByText("prévu 11:30 · 20 min de retard")).toBeInTheDocument();
    expect(screen.getByText("72 km/h")).toBeInTheDocument();
    expect(
      arrets()
        .getAllByRole("listitem")
        .map((l) => l.textContent),
    ).toEqual([
      "Passé : Douala Akwa · parti08:04",
      "Passé : Edéa · arrêt 10 min09:12",
      "Passé : Pouma · prochain arrêt10:05",
      "En cours : Boumnyebel · 4 places montent ici10:40",
    ]);
  });

  it("ignore un message d'un autre billet et coupe l'écoute en quittant l'écran", async () => {
    const { source, emettre, abonnes } = avecPositionEnDirect();
    const { unmount } = rendreDirect({ client: clientDirect(source) });
    await attendreCarte();
    await waitFor(() => expect(abonnes()).toBe(1));

    act(() => emettre(messagePosition({ billetId: "autre-billet", vitesseKmh: 10 })));
    expect(screen.getByText("84 km/h")).toBeInTheDocument();
    expect(screen.queryByText("10 km/h")).toBeNull();

    unmount();
    expect(abonnes()).toBe(0);
  });

  it("relit le suivi toutes les 30 s, et la lecture remplace les messages reçus entre-temps", async () => {
    vi.useFakeTimers();
    const { source, emettre } = avecPositionEnDirect(
      avecSuivi((suivi, appel) =>
        appel === 1
          ? suivi
          : {
              ...suivi,
              arrivee: {
                ...suivi.arrivee,
                estimee: "2027-01-05T11:45:00.000+01:00",
                retardMinutes: 15,
              },
            },
      ),
    );
    rendreDirect({ client: clientDirect(source) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("11:35")).toBeInTheDocument();

    // Un message de position arrive entre deux lectures : il s'affiche.
    act(() =>
      emettre(
        messagePosition({ arriveeEstimee: "2027-01-05T11:40:00.000+01:00", retardMinutes: 10 }),
      ),
    );
    expect(screen.getByText("11:40")).toBeInTheDocument();

    // Pas de relecture avant 30 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(screen.getByText("11:40")).toBeInTheDocument();

    // À 30 s, la lecture du serveur (11:45, 15 min de retard) passe devant le message.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(screen.getByText("11:45")).toBeInTheDocument();
    expect(screen.getByText("prévu 11:30 · 15 min de retard")).toBeInTheDocument();
  });
});

describe("Direct · prévenir un proche en une touche", () => {
  it("programme le SMS : un appel avec le proche, l'interrupteur s'allume et le serveur le confirme", async () => {
    const { source, appels } = espionner(voyageur.OP_PREVENIR_PROCHE.nom);
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();

    const interrupteur = screen.getByRole("switch", { name: "SMS d'arrivée pour Maman" });
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    await userEvent.click(interrupteur);

    expect(interrupteur).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(appels).toEqual([{ billetId: BILLET_ID, procheId: "maman" }]));
    expect(screen.getByText("Maman recevra un SMS 15 min avant l'arrivée")).toBeInTheDocument();
    // Le suivi relu confirme : l'interrupteur reste allumé.
    await waitFor(() => expect(interrupteur).toHaveAttribute("aria-checked", "true"));
  });

  it("annule le SMS en retouchant l'interrupteur (le suivi remet le proche à « inactif »)", async () => {
    const annuler = espionner(voyageur.OP_NE_PLUS_PREVENIR_PROCHE.nom);
    rendreDirect({ client: clientDirect(annuler.source) });
    await attendreCarte();

    const interrupteur = screen.getByRole("switch");
    await userEvent.click(interrupteur);
    await waitFor(() => expect(interrupteur).toHaveAttribute("aria-checked", "true"));
    await userEvent.click(interrupteur);
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    await waitFor(() =>
      expect(annuler.appels).toEqual([{ billetId: BILLET_ID, procheId: "maman" }]),
    );
    expect(screen.getByText("Maman ne recevra plus de SMS")).toBeInTheDocument();
  });

  it("revient à l'état du serveur et prévient quand la programmation échoue", async () => {
    const { source } = avecPanne(
      voyageur.OP_PREVENIR_PROCHE.nom,
      () => new ErreurHttp(409, "Départ non en route", "DEPART_NON_EN_ROUTE"),
    );
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();

    const interrupteur = screen.getByRole("switch");
    await userEvent.click(interrupteur);

    expect(await screen.findByText("Le SMS n'a pas pu être programmé. Réessaie.")).toBeVisible();
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
  });

  it("montre l'interrupteur allumé quand le proche est déjà prévenu", async () => {
    rendreDirect({
      client: clientDirect(
        avecSuivi((suivi) => ({
          ...suivi,
          prevenir: suivi.prevenir && { ...suivi.prevenir, actif: true },
        })),
      ),
    });
    await attendreCarte();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("annonce la minute et la gare du proche à prévenir (valeurs du serveur, pas du texte fixe)", async () => {
    rendreDirect({
      client: clientDirect(
        avecSuivi((suivi) => ({
          ...suivi,
          prevenir: {
            procheId: "papa",
            nom: "Papa",
            minutesAvantArrivee: 30,
            gareArrivee: "Akwa",
            actif: false,
          },
        })),
      ),
    });
    await attendreCarte();
    expect(screen.getByText("1 touche · elle reçoit un SMS 30 min avant Akwa")).toBeInTheDocument();
    expect(screen.getByText("Prévenir Papa quand j'arrive")).toBeInTheDocument();
  });

  it("sans proche à prévenir, la carte mène à « Moi » pour en ajouter un", async () => {
    rendreDirect({
      client: clientDirect(avecSuivi(({ prevenir: _prevenir, ...suivi }) => suivi)),
    });
    await attendreCarte();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(lien(/^Prévenir un proche quand j'arrive/)).toHaveAttribute("href", "/moi");
  });
});

describe("Direct · signaler", () => {
  it("ouvre la feuille, envoie le motif choisi en une touche et dit à quelle gare il est transmis", async () => {
    const { source, appels } = espionner(voyageur.OP_SIGNALER_TRAJET.nom);
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();

    await userEvent.click(screen.getByRole("button", { name: "Signaler" }));
    const feuille = await screen.findByRole("dialog", { name: "Signaler un problème" });
    for (const motif of ["Retard", "Conduite", "Incident"]) {
      expect(within(feuille).getByRole("button", { name: new RegExp(`^${motif}`) })).toBeEnabled();
    }

    await userEvent.click(within(feuille).getByRole("button", { name: /^Conduite/ }));

    expect(await within(feuille).findByRole("status")).toHaveTextContent(
      "Signalement transmis à la gare de Douala Akwa",
    );
    expect(appels).toEqual([{ billetId: BILLET_ID, motif: "conduite" }]);

    await userEvent.click(within(feuille).getByRole("button", { name: "Terminé" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("garde les motifs et prévient quand le signalement ne part pas", async () => {
    const { source, appels } = avecPanne(voyageur.OP_SIGNALER_TRAJET.nom, (n) =>
      n === 1 ? new ErreurReseau() : undefined,
    );
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();

    await userEvent.click(screen.getByRole("button", { name: "Signaler" }));
    const feuille = await screen.findByRole("dialog");
    await userEvent.click(within(feuille).getByRole("button", { name: /^Retard/ }));
    expect(await within(feuille).findByRole("alert")).toHaveTextContent(
      "Le signalement n'est pas parti. Réessaie.",
    );

    await userEvent.click(within(feuille).getByRole("button", { name: /^Retard/ }));
    expect(await within(feuille).findByRole("status")).toHaveTextContent(
      "Signalement transmis à la gare de Douala Akwa",
    );
    expect(appels()).toBe(2);
  });

  it("se ferme avec la croix et repart d'un état neuf à la réouverture", async () => {
    rendreDirect();
    await attendreCarte();

    await userEvent.click(screen.getByRole("button", { name: "Signaler" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Incident/ }));
    await screen.findByText("Signalement transmis à la gare de Douala Akwa");
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Signaler" }));
    expect(await screen.findByRole("button", { name: /^Incident/ })).toBeEnabled();
    expect(screen.queryByText(/Signalement transmis/)).toBeNull();
  });
});

describe("Direct · chauffeur", () => {
  it("propose d'appeler le chauffeur du bus en une touche", async () => {
    rendreDirect();
    await attendreCarte();

    await userEvent.click(screen.getByRole("button", { name: "Chauffeur" }));
    const feuille = await screen.findByRole("dialog", { name: "Appeler le chauffeur" });
    const appel = await within(feuille).findByRole("link", { name: /^Appeler Mbarga/ });
    expect(appel).toHaveAttribute("href", "tel:+237677000024");
    expect(appel).toHaveTextContent("+237 6 77 00 00 24");
  });

  it("dit quand le numéro ne se charge pas, avec de quoi réessayer", async () => {
    const { source } = avecPanne(voyageur.OP_CHAUFFEUR_BUS.nom, (n) =>
      n === 1 ? new ErreurHttp(500, "Panne", "PANNE") : undefined,
    );
    rendreDirect({ client: clientDirect(source) });
    await attendreCarte();

    await userEvent.click(screen.getByRole("button", { name: "Chauffeur" }));
    const feuille = await screen.findByRole("dialog");
    const alerte = await within(feuille).findByRole("alert", undefined, { timeout: 8000 });
    expect(alerte).toHaveTextContent("Le numéro du chauffeur ne s'est pas chargé.");
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await within(feuille).findByRole("link", { name: /^Appeler Mbarga/ })).toBeVisible();
  }, 15000);
});
