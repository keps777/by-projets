import { ErreurHttp, colis, implementer, simulerFlux } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  COLIS_ID,
  rendreLivraison,
  type Originale,
  type OptionsRenduLivraison,
} from "./rendre-livraison";

/** Attend que l'écran soit affiché (la livraison est lue). */
async function attendreEcran() {
  await screen.findByText("13:24");
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;
const iso = (heure: string) => `2027-01-05T${heure}:00.000+01:00`;
const carte = () => screen.getByRole("img", { name: /^Carte : / });

/** Réponse du scénario pour `OP_LIVRAISON_COLIS`, modifiée par `modifier`. */
function livraisonModifiee(
  modifier: (vue: contrats.LivraisonColis) => contrats.LivraisonColis,
): NonNullable<OptionsRenduLivraison["operations"]> {
  return (originale: Originale) => {
    const reponse = originale(colis.OP_LIVRAISON_COLIS.nom).repondre as (
      p: unknown,
      c: unknown,
    ) => contrats.LivraisonColis;
    return [
      implementer(colis.OP_LIVRAISON_COLIS, async (p, ctx) => modifier(await reponse(p, ctx))),
    ];
  };
}

/** Émetteur du canal de position : le test publie lui-même les messages. */
function fluxCommande() {
  const commande: { emettre?: (message: unknown) => void } = {};
  const flux: NonNullable<OptionsRenduLivraison["flux"]> = () => [
    simulerFlux(colis.CANAL_POSITION_LIVREUR, (_params, ctx) => {
      commande.emettre = ctx.emettre;
    }),
  ];
  return { commande, flux };
}

describe("Livraison · rendu de la planche", () => {
  it("affiche la carte, l'heure d'arrivée, le livreur, la règle de remise et le récapitulatif de la planche", async () => {
    rendreLivraison();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "Livraison moto en cours" }),
    ).toBeInTheDocument();
    expect(carte()).toHaveAccessibleName("Carte : le livreur est à 6 minutes de chez Maman");
    expect(within(carte()).getByText("Gare Alpha · retiré 13:05")).toBeInTheDocument();
    expect(within(carte()).getByText("Éric · 6 min")).toBeInTheDocument();
    expect(within(carte()).getByText("Chez Maman · Tamdja")).toBeInTheDocument();

    expect(screen.getByText("EN LIVRAISON")).toBeInTheDocument();
    expect(screen.getByText("Arrive chez Maman")).toBeInTheDocument();
    expect(screen.getByText("13:24")).toBeInTheDocument();
    expect(screen.getByText(/^colis C-…-0017/)).toHaveTextContent("colis C-…-00172 kg · assuré");

    expect(screen.getByText("ÉT")).toBeInTheDocument();
    expect(screen.getByText(/^Éric T\. · livreur moto/)).toHaveTextContent(
      "Éric T. · livreur moto vérifié · 4,9 ★ · 340 livraisons",
    );
    expect(screen.getByText("OU 517 MT · gilet AfriMove n° 23")).toBeInTheDocument();

    expect(screen.getByText("À la remise")).toBeInTheDocument();
    expect(screen.getByText("Maman a le code")).toBeInTheDocument();
    expect(screen.getByText("482 913")).toBeInTheDocument();
    expect(screen.getByText(/^Éric demande le code/)).toHaveTextContent(
      "Éric demande le code 482 913 et regarde la pièce. Il prend une photo du colis remis. Tu reçois la photo, Maman aussi. Si elle est absente, il attend 10 min puis dépose chez Mama Fotso.",
    );

    expect(screen.getByText("Tu as une moto ? Deviens livreur AfriMove")).toBeInTheDocument();
    expect(
      screen.getByText("700 F la course · tu choisis tes heures et ta zone · inscription 3 min"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Livraison 1 000 F · payée · 700 F pour Éric à la remise"),
    ).toBeInTheDocument();
    expect(screen.getByText("assuré")).toBeInTheDocument();
  });

  it("nomme les boutons comme la planche, sans aucun bouton grisé, et n'a pas de barre d'onglets", async () => {
    rendreLivraison();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appeler Éric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Partager le suivi à Maman" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Changer l'adresse" })).toBeInTheDocument();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("écrit « non assuré » et « à payer » quand le colis n'est pas assuré ni payé", async () => {
    rendreLivraison({
      operations: livraisonModifiee((v) => ({
        ...v,
        arrivee: { ...v.arrivee, assure: false },
        prix: { ...v.prix, payee: false },
      })),
    });
    await attendreEcran();
    expect(screen.getByText(/^colis C-…-0017/)).toHaveTextContent("2 kg · non assuré");
    expect(
      screen.getByText("Livraison 1 000 F · à payer · 700 F pour Éric à la remise"),
    ).toBeInTheDocument();
    expect(screen.getByText("non assuré")).toBeInTheDocument();
    expect(screen.queryByText("assuré", { exact: true })).not.toBeInTheDocument();
  });

  it("reprend l'attente et le relais de repli du serveur, et dit quand Maman n'a pas le code", async () => {
    rendreLivraison({
      operations: livraisonModifiee((v) => ({
        ...v,
        remise: {
          ...v.remise,
          destinataireALeCode: false,
          attenteAbsenceMinutes: 15,
          relaisDeRepli: "Boutique Njoya",
        },
      })),
    });
    await attendreEcran();
    expect(screen.getByText("Maman n'a pas encore le code")).toBeInTheDocument();
    expect(screen.getByText(/^Éric demande le code/)).toHaveTextContent(
      "il attend 15 min puis dépose chez Boutique Njoya.",
    );
  });

  it("n'affiche pas le badge de conception : l'écran n'en a pas", async () => {
    rendreLivraison({ conception: true });
    await attendreEcran();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
  });
});

describe("Livraison · navigation", () => {
  it("revient au colis avec « Retour »", async () => {
    const { routeur } = rendreLivraison();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", `/colis/${COLIS_ID}`);
    await userEvent.click(retour);
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}`));
  });

  it("mène à l'inscription des livreurs avec « Tu as une moto ? »", async () => {
    const { routeur } = rendreLivraison();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: /^Tu as une moto \?/ });
    expect(lien).toHaveAttribute("href", "/moi/devenir-livreur");
    await userEvent.click(lien);
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur"));
  });
});

describe("Livraison · position du livreur en direct", () => {
  it("met à jour les minutes, l'heure d'arrivée et la place du livreur à chaque message", async () => {
    const { commande, flux } = fluxCommande();
    rendreLivraison({ flux });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());
    const avant = within(carte()).getByText("Éric · 6 min").getAttribute("x");

    act(() =>
      commande.emettre?.({
        colisId: "colis-c-dla-270105-0017",
        minutesRestantes: 2,
        arriveeEstimee: iso("13:20"),
      }),
    );
    await waitFor(() => expect(within(carte()).getByText("Éric · 2 min")).toBeInTheDocument());
    expect(carte()).toHaveAccessibleName("Carte : le livreur est à 2 minutes de chez Maman");
    expect(screen.getByText("13:20")).toBeInTheDocument();
    expect(screen.queryByText("13:24")).not.toBeInTheDocument();
    // Il a avancé vers la maison de Maman, à gauche de la carte.
    const apres = within(carte()).getByText("Éric · 2 min").getAttribute("x");
    expect(Number(apres)).toBeLessThan(Number(avant));
  });

  it("dit « 1 minute » au singulier et ignore le message d'un autre colis", async () => {
    const { commande, flux } = fluxCommande();
    rendreLivraison({ flux });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());

    act(() =>
      commande.emettre?.({ colisId: "autre", minutesRestantes: 3, arriveeEstimee: iso("13:21") }),
    );
    act(() =>
      commande.emettre?.({
        colisId: "colis-c-dla-270105-0017",
        minutesRestantes: 1,
        arriveeEstimee: iso("13:19"),
      }),
    );
    await waitFor(() => expect(within(carte()).getByText("Éric · 1 min")).toBeInTheDocument());
    expect(carte()).toHaveAccessibleName("Carte : le livreur est à 1 minute de chez Maman");
    expect(screen.getByText("13:19")).toBeInTheDocument();
  });
});

describe("Livraison · actions", () => {
  it("l'appel dit que le numéro du livreur n'est pas communiqué", async () => {
    rendreLivraison();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Appeler Éric" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Le numéro de Éric n'est pas disponible pour le moment.",
    );
  });

  it("partage le suivi au numéro du destinataire, lu sur le colis", async () => {
    const appels: unknown[] = [];
    rendreLivraison({
      avecColis: true,
      operations: (originale) => {
        const reponse = originale(colis.OP_PARTAGER_SUIVI_LIVRAISON.nom).repondre as (
          p: unknown,
          c: unknown,
        ) => unknown;
        return [
          implementer(colis.OP_PARTAGER_SUIVI_LIVRAISON, (p, ctx) => {
            appels.push(p);
            return reponse(p, ctx) as never;
          }),
        ];
      },
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Partager le suivi à Maman" }));
    const champ = await screen.findByLabelText("Numéro de Maman");
    await waitFor(() => expect(champ).toHaveValue("699401822"));

    await userEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    expect(await screen.findByText(/Lien de suivi envoyé au/)).toBeInTheDocument();
    expect(appels).toEqual([{ colisId: COLIS_ID, destinataire: "+237699401822" }]);
  });

  it("demande le numéro quand le colis ne se lit pas, et refuse un numéro trop court", async () => {
    const appels: unknown[] = [];
    rendreLivraison({
      operations: () => [
        implementer(colis.OP_PARTAGER_SUIVI_LIVRAISON, (p) => {
          appels.push(p);
          return { colisId: COLIS_ID, lien: "/suivi/x", envoyeA: "6 99 …" };
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Partager le suivi à Maman" }));
    const champ = await screen.findByLabelText("Numéro de Maman");
    expect(champ).toHaveValue("");

    await userEvent.type(champ, "6994");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    expect(await screen.findByText("Entre un numéro à 9 chiffres.")).toBeInTheDocument();
    expect(appels).toEqual([]);

    await userEvent.type(champ, "01822");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    await screen.findByText("Lien de suivi envoyé au 6 99 ….");
    expect(appels).toEqual([{ colisId: COLIS_ID, destinataire: "+237699401822" }]);
  });

  it("dit que le suivi n'a pas pu partir quand le serveur refuse", async () => {
    rendreLivraison({
      operations: () => [
        implementer(colis.OP_PARTAGER_SUIVI_LIVRAISON, () => {
          throw new ErreurHttp(503, "envoi impossible", "envoi_impossible");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Partager le suivi à Maman" }));
    await userEvent.type(await screen.findByLabelText("Numéro de Maman"), "699401822");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le suivi n'a pas pu être envoyé. Réessaie.",
    );
  });

  it("change l'adresse : la nouvelle adresse part au serveur, la carte la relit", async () => {
    const appels: unknown[] = [];
    rendreLivraison({
      operations: (originale) => {
        const reponse = originale(colis.OP_CHANGER_ADRESSE_LIVRAISON.nom).repondre as (
          p: unknown,
          c: unknown,
        ) => unknown;
        return [
          implementer(colis.OP_CHANGER_ADRESSE_LIVRAISON, (p, ctx) => {
            appels.push(p);
            return reponse(p, ctx) as never;
          }),
        ];
      },
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Changer l'adresse" }));

    await userEvent.click(await screen.findByRole("button", { name: "Valider" }));
    expect(await screen.findByText("Écris la nouvelle adresse.")).toBeInTheDocument();
    expect(appels).toEqual([]);

    await userEvent.type(screen.getByLabelText("Nouvelle adresse"), "Marché A, Bafoussam");
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Adresse changée : Marché A, Bafoussam. Le livreur est prévenu.",
    );
    expect(appels).toEqual([{ colisId: COLIS_ID, adresse: "Marché A, Bafoussam" }]);

    const fermer = screen.getAllByRole("button", { name: "Fermer" });
    await userEvent.click(fermer[fermer.length - 1]!);
    await waitFor(() =>
      expect(screen.queryByLabelText("Nouvelle adresse")).not.toBeInTheDocument(),
    );
  });

  it("dit que l'adresse n'a pas pu changer quand le serveur refuse", async () => {
    rendreLivraison({
      operations: () => [
        implementer(colis.OP_CHANGER_ADRESSE_LIVRAISON, () => {
          throw new ErreurHttp(409, "adresse non modifiable", "adresse_non_modifiable");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Changer l'adresse" }));
    await userEvent.type(await screen.findByLabelText("Nouvelle adresse"), "Marché A");
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L'adresse n'a pas pu être changée. Réessaie.",
    );
  });
});

describe("Livraison · états", () => {
  it("montre le chargement dans le style nuit, avec « Retour »", async () => {
    rendreLivraison({ latenceMs: 50 });
    expect(
      await screen.findByRole("status", { name: "Chargement de la livraison" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      `/colis/${COLIS_ID}`,
    );
    await attendreEcran();
  });

  it.each([404, 403, 409])("montre l'état vide quand le serveur répond %i", async (statut) => {
    rendreLivraison({
      operations: () => [
        implementer(colis.OP_LIVRAISON_COLIS, () => {
          throw new ErreurHttp(statut, "non", "pas_en_livraison");
        }),
      ],
    });
    expect(await screen.findByText("Pas de livraison en cours")).toBeInTheDocument();
    expect(screen.queryByText(/482/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("montre l'erreur avec de quoi réessayer, puis la livraison", async () => {
    let appels = 0;
    rendreLivraison({
      operations: (originale) => {
        const reponse = originale(colis.OP_LIVRAISON_COLIS.nom).repondre as (
          p: unknown,
          c: unknown,
        ) => unknown;
        return [
          implementer(colis.OP_LIVRAISON_COLIS, (p, ctx) => {
            appels += 1;
            if (appels === 1) throw new ErreurHttp(500, "panne", "panne");
            return reponse(p, ctx) as never;
          }),
        ];
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de charger la livraison",
    );
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.getByText("482 913")).toBeInTheDocument();
  });

  it("montre l'état vide pour un colis qui n'est pas celui de la démonstration", async () => {
    rendreLivraison({ colisId: "colis-inconnu" });
    expect(await screen.findByText("Pas de livraison en cours")).toBeInTheDocument();
  });
});
