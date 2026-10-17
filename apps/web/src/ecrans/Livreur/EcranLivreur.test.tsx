import { ErreurHttp, colis, implementer, simulerFlux } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COLIS_ID,
  HORLOGE_PLANCHE,
  rendreLivreur,
  type Originale,
  type OptionsRenduLivreur,
} from "./rendre-livreur";

const MISSION_ID = "mission-c-dla-270105-0017";

/** Attend que l'écran soit affiché (l'espace du livreur est lu). */
async function attendreEcran() {
  await screen.findByText("Nouvelle mission · 30 s pour accepter");
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

type Repondre = (
  p: unknown,
  c: unknown,
) => Promise<contrats.EspaceLivreur> | contrats.EspaceLivreur;

/** Réponse du scénario pour `OP_ESPACE_LIVREUR`, modifiée par `modifier`. */
function espaceModifie(
  modifier: (vue: contrats.EspaceLivreur) => contrats.EspaceLivreur,
): NonNullable<OptionsRenduLivreur["operations"]> {
  return (originale: Originale) => {
    const reponse = originale(colis.OP_ESPACE_LIVREUR.nom).repondre as Repondre;
    return [
      implementer(colis.OP_ESPACE_LIVREUR, async (p, ctx) => modifier(await reponse(p, ctx))),
    ];
  };
}

/** Émetteur du canal des missions : le test publie lui-même les messages. */
function fluxCommande() {
  const commande: { emettre?: (message: unknown) => void } = {};
  const flux: NonNullable<OptionsRenduLivreur["flux"]> = () => [
    simulerFlux(colis.CANAL_MISSIONS_LIVREUR, (_params, ctx) => {
      commande.emettre = ctx.emettre;
    }),
  ];
  return { commande, flux };
}

/** Compte les appels d'une opération reçus par le mock. */
function appels(client: { executer: unknown }, operation: { nom: string }) {
  const espion = vi.spyOn(client as { executer: (...a: unknown[]) => unknown }, "executer");
  return () => espion.mock.calls.filter(([op]) => (op as { nom: string }).nom === operation.nom);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Livreur · rendu de la planche", () => {
  it("affiche l'en-tête, la mission, les règles, le bilan, les pièces et le retrait de la planche", async () => {
    rendreLivreur();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "App du livreur moto" }),
    ).toBeInTheDocument();

    // En-tête
    expect(screen.getByText("ÉT")).toBeInTheDocument();
    expect(screen.getByText("Éric T.")).toBeInTheDocument();
    expect(screen.getByText("livreur n° 23 · Bafoussam · 4,9 ★")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disponible" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: "+ inviter un livreur" })).toHaveAttribute(
      "href",
      "/moi/devenir-livreur",
    );

    // Mission
    expect(screen.getByRole("timer")).toHaveTextContent("0:24");
    expect(screen.getByText("Gare Alpha → Tamdja, chez Ngo Thérèse")).toBeInTheDocument();
    expect(
      screen.getByText("colis 2 kg · 4,1 km · 14 min · remise contre code"),
    ).toBeInTheDocument();
    expect(screen.getByText("700")).toBeInTheDocument();
    expect(screen.getByText("pour toi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Passer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accepter · touche 1" })).toHaveAttribute(
      "href",
      `/colis/${COLIS_ID}/livraison`,
    );

    // Les 3 règles, numéros en clair
    expect(screen.getByRole("heading", { name: "Les 3 règles" })).toBeInTheDocument();
    const regles = screen.getByText(/Jamais de remise sans code/);
    expect(regles).toHaveTextContent(
      "1. Jamais de remise sans code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, jamais de la pièce. Absent : 10 min, puis relais le plus proche.",
    );
    expect(Array.from(regles.querySelectorAll("strong")).map((s) => s.textContent)).toEqual([
      "1.",
      "2.",
      "3.",
    ]);

    // Bilan
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("livraisons")).toBeInTheDocument();
    expect(screen.getByText("Gagné")).toBeInTheDocument();
    expect(screen.getByText("4 900")).toBeInTheDocument();
    expect(screen.getByText("MoMo ce soir")).toBeInTheDocument();
    expect(screen.getByText("Semaine")).toBeInTheDocument();
    expect(screen.getByText("31 k")).toBeInTheDocument();
    expect(screen.getByText("41 livraisons")).toBeInTheDocument();

    // Pièces
    expect(screen.getByRole("heading", { name: "Mes pièces" })).toBeInTheDocument();
    expect(screen.getByText("à jour")).toBeInTheDocument();
    const pieces = within(screen.getByRole("list"));
    expect(pieces.getByText("Permis")).toBeInTheDocument();
    expect(pieces.getByText("valide 2028")).toHaveAttribute("data-ton", "vert");
    expect(pieces.getByText("Assurance moto")).toBeInTheDocument();
    expect(pieces.getByText("expire 02/27")).toHaveAttribute("data-ton", "ambre");
    expect(pieces.getByText("Gilet · casque")).toBeInTheDocument();
    expect(pieces.getByText("n° 23")).toHaveAttribute("data-ton", "vert");

    // Retrait
    expect(screen.getByText("Retirer mes gains maintenant (dès 5 000 F)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer" })).toBeInTheDocument();
  });

  it("n'a aucun bouton grisé, aucun « bientôt » et pas de barre d'onglets", async () => {
    rendreLivreur();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.queryByText(/bientôt/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("écrit « 1 livraison » au singulier et garde l'ambre pour une pièce à vérifier", async () => {
    rendreLivreur({
      operations: espaceModifie((v) => ({
        ...v,
        bilan: {
          ...v.bilan,
          aujourdhui: { ...v.bilan.aujourdhui, livraisons: 1 },
          semaine: { gain: 800, livraisons: 1 },
        },
        pieces: { ...v.pieces, aJour: false },
      })),
    });
    await attendreEcran();
    expect(screen.getByText("livraison")).toBeInTheDocument();
    expect(screen.getByText("1 livraison")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
    expect(screen.getByText("à vérifier")).toHaveAttribute("data-ton", "ambre");
    expect(screen.queryByText("à jour")).not.toBeInTheDocument();
  });

  it("n'affiche aucun montant ni nom de code de retrait", async () => {
    rendreLivreur();
    await attendreEcran();
    expect(document.body.textContent).not.toMatch(/482\s?913/);
  });
});

describe("Livreur · états", () => {
  it("montre le chargement dans le style nuit, sans le contenu de la planche", async () => {
    rendreLivreur({ latenceMs: 300 });
    const chargement = await screen.findByRole("status", {
      name: "Chargement de l'app du livreur",
    });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("heading", { level: 1, name: "App du livreur moto" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Éric T.")).not.toBeInTheDocument();
    await attendreEcran();
    expect(screen.queryByRole("status", { name: "Chargement de l'app du livreur" })).toBeNull();
  });

  it("dit quand le compte n'est pas livreur et propose de le devenir", async () => {
    rendreLivreur({
      operations: () => [
        implementer(colis.OP_ESPACE_LIVREUR, () => {
          throw new ErreurHttp(404, "Pas livreur", "introuvable");
        }),
      ],
    });
    expect(
      await screen.findByRole("heading", { name: "Pas d'espace livreur" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devenir livreur" })).toHaveAttribute(
      "href",
      "/moi/devenir-livreur",
    );
  });

  it("montre l'erreur avec de quoi réessayer, puis l'écran quand la relecture réussit", async () => {
    let panne = true;
    rendreLivreur({
      operations: (originale) => {
        const reponse = originale(colis.OP_ESPACE_LIVREUR.nom).repondre as Repondre;
        return [
          implementer(colis.OP_ESPACE_LIVREUR, (p, ctx) => {
            if (panne) throw new ErreurHttp(500, "Panne", "PANNE");
            return reponse(p, ctx);
          }),
        ];
      },
    });
    const alerte = await screen.findByRole("alert", {}, { timeout: 8000 });
    expect(within(alerte).getByText("Impossible de charger l'app du livreur")).toBeInTheDocument();
    panne = false;
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 15_000);
});

describe("Livreur · disponibilité", () => {
  it("passe en indisponible, retire la mission, puis la rend en revenant disponible", async () => {
    const { client } = rendreLivreur();
    await attendreEcran();
    const ecritures = appels(client, colis.OP_DISPONIBILITE_LIVREUR);

    await userEvent.click(screen.getByRole("button", { name: "Disponible" }));
    const bouton = await screen.findByRole("button", { name: "Indisponible" });
    expect(bouton).toHaveAttribute("aria-pressed", "false");
    expect(ecritures().map(([, params]) => params)).toEqual([{ disponible: false }]);
    expect(await screen.findByText("Tu es indisponible")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Accepter · touche 1" })).not.toBeInTheDocument();
    // Le statut reste après la relecture de l'espace
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Indisponible" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Indisponible" }));
    expect(await screen.findByRole("button", { name: "Disponible" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(ecritures().map(([, params]) => params)).toEqual([
      { disponible: false },
      { disponible: true },
    ]);
    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });

  it("revient au statut du serveur et le dit quand le changement échoue", async () => {
    rendreLivreur({
      operations: () => [
        implementer(colis.OP_DISPONIBILITE_LIVREUR, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Disponible" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ton statut n'a pas pu être changé. Réessaie.",
    );
    expect(screen.getByRole("button", { name: "Disponible" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });
});

describe("Livreur · mission", () => {
  it("Passer envoie la mission au suivant et la retire de l'écran", async () => {
    const { client } = rendreLivreur();
    await attendreEcran();
    const ecritures = appels(client, colis.OP_PASSER_MISSION);

    await userEvent.click(screen.getByRole("button", { name: "Passer" }));
    expect(await screen.findByText("Pas de mission pour le moment")).toBeInTheDocument();
    expect(ecritures().map(([, params]) => params)).toEqual([{ missionId: MISSION_ID }]);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passer" })).not.toBeInTheDocument();
    // Le reste de l'écran est intact
    expect(screen.getByText("Les 3 règles")).toBeInTheDocument();
    expect(screen.getByText("4 900")).toBeInTheDocument();
  });

  it("Passer qui échoue garde la mission et le dit", async () => {
    rendreLivreur({
      operations: () => [
        implementer(colis.OP_PASSER_MISSION, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Passer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La mission n'a pas pu être passée. Réessaie.",
    );
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("Accepter · touche 1 accepte la mission puis ouvre la livraison du colis", async () => {
    const { client, routeur } = rendreLivreur();
    await attendreEcran();
    const ecritures = appels(client, colis.OP_ACCEPTER_MISSION);

    await userEvent.click(screen.getByRole("link", { name: "Accepter · touche 1" }));
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}/livraison`));
    expect(ecritures().map(([, params]) => params)).toEqual([{ missionId: MISSION_ID }]);
  });

  it("n'ouvre pas la livraison quand le serveur refuse : la mission est déjà passée au suivant", async () => {
    const { routeur } = rendreLivreur({
      operations: () => [
        implementer(colis.OP_ACCEPTER_MISSION, () => {
          throw new ErreurHttp(410, "Expirée", "mission_expiree");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Accepter · touche 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cette mission est passée au livreur suivant.",
    );
    expect(pathname(routeur)).toBe("/livreur/accueil");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("Pas de mission pour le moment")).toBeInTheDocument();
  });

  it("garde la mission et le dit quand l'acceptation échoue pour une autre raison", async () => {
    const { routeur } = rendreLivreur({
      operations: () => [
        implementer(colis.OP_ACCEPTER_MISSION, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Accepter · touche 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La mission n'a pas pu être acceptée. Réessaie.",
    );
    expect(pathname(routeur)).toBe("/livreur/accueil");
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("« + inviter un livreur » ouvre l'inscription des livreurs", async () => {
    const { routeur } = rendreLivreur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "+ inviter un livreur" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur"));
  });
});

describe("Livreur · compte à rebours de 30 s", () => {
  /** Horloge de l'application qui avance avec les minuteries simulées. */
  const horlogeVive = { maintenant: () => new Date() };

  async function ouvrirAvecDecompte(options: OptionsRenduLivreur = {}) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(HORLOGE_PLANCHE));
    // Un flux muet : seul le compte à rebours de l'écran peut retirer la mission.
    const muet = () => [simulerFlux(colis.CANAL_MISSIONS_LIVREUR, () => undefined)];
    rendreLivreur({ horloge: horlogeVive, flux: muet, ...options });
    await attendreEcran();
  }

  it("décompte chaque seconde depuis la durée restante donnée par le serveur", async () => {
    await ouvrirAvecDecompte();
    expect(screen.getByRole("timer")).toHaveTextContent("0:24");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:14");
    await act(() => vi.advanceTimersByTimeAsync(13_000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:01");
  });

  it("sans réponse au bout du délai, la mission passe au livreur suivant et ne revient pas", async () => {
    await ouvrirAvecDecompte();
    await act(() => vi.advanceTimersByTimeAsync(25_000));

    expect(await screen.findByText("Pas de mission pour le moment")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passer" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sans réponse en 30 s, la mission est passée au livreur suivant.",
    );

    // L'espace est relu : le serveur de démonstration propose encore la mission (son horloge est figée), mais
    // l'écran ne la remontre pas.
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("repart du délai complet quand l'horloge de l'appareil n'est pas celle du serveur", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2027-01-05T07:38:00+01:00"));
    rendreLivreur({
      horloge: horlogeVive,
      flux: () => [simulerFlux(colis.CANAL_MISSIONS_LIVREUR, () => undefined)],
    });
    await attendreEcran();
    expect(screen.getByRole("timer")).toHaveTextContent("0:30");
  });
});

describe("Livreur · missions en direct", () => {
  const sansMission = espaceModifie((v) => ({ ...v, mission: null }));

  function missionDirect(): contrats.MissionLivraison {
    return {
      id: "mission-direct-1",
      colis: {
        id: "colis-direct-1",
        numero: "C-DLA-270105-0099",
        etat: "en_livraison",
        mode: "moto",
        poidsKg: 3.5,
        assure: false,
        valeurAssuree: 0,
        expediteur: { nom: "Paul K." },
        destinataire: { nom: "Aïcha", telephoneMasque: "6•• ••• •12" },
        codeRequis: true,
        disponibleDepuis: null,
        limiteRetrait: null,
      },
      trajet: { depart: "Gare Beta", arrivee: "Bonamoussadi", destinataire: "Aïcha" },
      distanceM: 6500,
      dureeMinutes: 20,
      gain: 1050,
      delaiAcceptationSecondes: 30,
      expireA: "2027-01-05T13:06:24.000+01:00",
      remiseContreCode: true,
    } as unknown as contrats.MissionLivraison;
  }

  it("montre une mission proposée en direct, puis la retire à son expiration", async () => {
    const { commande, flux } = fluxCommande();
    rendreLivreur({ operations: sansMission, flux });
    expect(await screen.findByText("Pas de mission pour le moment")).toBeInTheDocument();
    await waitFor(() => expect(commande.emettre).toBeDefined());

    act(() => commande.emettre?.({ type: "proposee", mission: missionDirect() }));
    expect(await screen.findByText("Gare Beta → Bonamoussadi, chez Aïcha")).toBeInTheDocument();
    expect(
      screen.getByText("colis 3,5 kg · 6,5 km · 20 min · remise contre code"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 050")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accepter · touche 1" })).toHaveAttribute(
      "href",
      "/colis/colis-direct-1/livraison",
    );
    expect(screen.queryByText("Pas de mission pour le moment")).not.toBeInTheDocument();

    act(() => commande.emettre?.({ type: "expiree", missionId: "mission-direct-1" }));
    expect(await screen.findByText("Pas de mission pour le moment")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("ignore l'expiration d'une autre mission que celle affichée", async () => {
    const { commande, flux } = fluxCommande();
    rendreLivreur({ flux });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());

    act(() => commande.emettre?.({ type: "expiree", missionId: "mission-autre" }));
    // laisse passer les rendus et la relecture de l'espace
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText("Gare Alpha → Tamdja, chez Ngo Thérèse")).toBeInTheDocument();
  });

  it("n'écoute pas les missions tant que le livreur est indisponible", async () => {
    const { commande, flux } = fluxCommande();
    rendreLivreur({ flux });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Disponible" }));
    await screen.findByText("Tu es indisponible");

    act(() => commande.emettre?.({ type: "proposee", mission: missionDirect() }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByText("Gare Beta → Bonamoussadi, chez Aïcha")).not.toBeInTheDocument();
  });
});

describe("Livreur · retirer mes gains", () => {
  it("sous le seuil, dit ce qu'il manque sans appeler le serveur", async () => {
    const { client } = rendreLivreur();
    await attendreEcran();
    const ecritures = appels(client, colis.OP_RETIRER_GAINS_LIVREUR);

    await userEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le retrait est possible dès 5 000 F. Il te manque 100 F.",
    );
    expect(ecritures()).toHaveLength(0);
  });

  it("au-dessus du seuil, demande le retrait et confirme le montant et le moyen", async () => {
    const { client } = rendreLivreur({
      operations: (originale) => {
        const reponse = originale(colis.OP_ESPACE_LIVREUR.nom).repondre as Repondre;
        return [
          implementer(colis.OP_ESPACE_LIVREUR, async (p, ctx) => {
            const v = await reponse(p, ctx);
            return { ...v, retrait: { ...v.retrait, solde: 6200 } };
          }),
          implementer(colis.OP_RETIRER_GAINS_LIVREUR, (_p, ctx) => ({
            montant: 6200,
            moyen: "MoMo",
            demandeLe: ctx.horloge.iso(),
          })),
        ];
      },
    });
    await attendreEcran();
    const ecritures = appels(client, colis.OP_RETIRER_GAINS_LIVREUR);

    await userEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Retrait de 6 200 F demandé vers MoMo.",
    );
    expect(ecritures()).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dit le seuil quand le serveur refuse le retrait (422)", async () => {
    // L'espace affiche 6 200 F, mais le serveur de démonstration n'a que 4 900 F : il répond 422.
    rendreLivreur({
      operations: espaceModifie((v) => ({ ...v, retrait: { ...v.retrait, solde: 6200 } })),
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le retrait est possible dès 5 000 F.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Il te manque");
  });

  it("dit que le retrait a échoué pour toute autre panne", async () => {
    rendreLivreur({
      operations: (originale) => {
        const reponse = originale(colis.OP_ESPACE_LIVREUR.nom).repondre as Repondre;
        return [
          implementer(colis.OP_ESPACE_LIVREUR, async (p, ctx) => {
            const v = await reponse(p, ctx);
            return { ...v, retrait: { ...v.retrait, solde: 6200 } };
          }),
          implementer(colis.OP_RETIRER_GAINS_LIVREUR, () => {
            throw new ErreurHttp(500, "Panne", "PANNE");
          }),
        ];
      },
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le retrait n'a pas pu être fait. Réessaie.",
    );
  });
});
