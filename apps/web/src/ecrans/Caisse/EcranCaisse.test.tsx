import { agence } from "@afrimove/api-client";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { rendreCaisse } from "./rendre-caisse";

/** Attend que la session de caisse soit affichée (le titre est déjà là pendant le chargement). */
async function attendreSession() {
  await screen.findByText("Cash attendu");
}

const carteEcart = () => document.querySelector<HTMLElement>("section[data-statut]")!;
const total = () => screen.getByRole("textbox", { name: "Total compté" });

describe("Caisse · rendu de la planche", () => {
  it("affiche l'en-tête, ce que l'app a compté, ce que je compte et l'écart du scénario de démo", async () => {
    rendreCaisse();
    await attendreSession();

    expect(screen.getByRole("heading", { level: 1, name: "Fermer ma caisse" })).toBeInTheDocument();
    expect(
      screen.getByText("K-DLA-270105-2-1 · Joseph M. · ouverte 05:02 avec 20 000"),
    ).toBeInTheDocument();

    const app = screen.getByRole("region", { name: "Ce que l'app a compté" });
    expect(within(app).getByText("05:02 → 13:58")).toBeInTheDocument();
    const lignes: Array<[string, string]> = [
      ["Billets cash · 184", "612 000"],
      ["Colis cash · 41", "71 500"],
      ["Fond de caisse", "20 000"],
      ["Annulations validées (PIN sup.) · 2", "− 8 000"],
      ["MoMo · 63 ventes (pas en caisse)", "252 000"],
    ];
    for (const [libelle, montant] of lignes) {
      expect(within(app).getByText(libelle).nextElementSibling).toHaveTextContent(montant);
    }
    expect(within(app).getByText("Cash attendu").nextElementSibling).toHaveTextContent("695 500");

    expect(screen.getByText("Ce que je compte · touche les billets")).toBeInTheDocument();
    expect(screen.getByText("ou tape le total")).toBeInTheDocument();
    expect(total()).toHaveValue("694 500");
    for (const [valeur, nombre] of [
      ["10 000", 48],
      ["5 000", 36],
      ["2 000", 14],
      ["1 000", 5],
      ["500", 3],
    ] as const) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^Billets de ${valeur} : ${nombre} comptés`),
        }),
      ).toHaveTextContent(`× ${nombre}`);
    }
    expect(screen.getByRole("textbox", { name: "Montant des pièces" })).toHaveValue("0");

    expect(carteEcart()).toHaveTextContent("− 1 000");
    expect(carteEcart()).toHaveTextContent("Tolérance de l'agence : 1 000.");
    expect(carteEcart()).toHaveTextContent("Hier : 0 · cette semaine : − 1 000");
    expect(carteEcart()).toHaveAttribute("data-statut", "dans_tolerance");
  });

  it("n'affiche le badge « TOUCHE 2 » et « touche 3 · » que si le flag conception est actif", async () => {
    rendreCaisse();
    await attendreSession();
    expect(screen.queryByText("TOUCHE 2")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    ).toHaveTextContent("il met son PIN, l'écart est tracé, le rapport part à 21 h");
    expect(screen.queryByText(/touche 3/)).not.toBeInTheDocument();
  });

  it("affiche le badge « TOUCHE 2 » et « touche 3 · » avec le flag conception", async () => {
    rendreCaisse({ conception: true });
    await attendreSession();
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    ).toHaveTextContent("touche 3 · il met son PIN, l'écart est tracé, le rapport part à 21 h");
  });

  it("n'a aucun bouton grisé et nomme chaque bouton rond", async () => {
    rendreCaisse();
    await attendreSession();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });
});

describe("Caisse · écart en direct", () => {
  it("recalcule l'écart à chaque billet touché : rouge au-delà de la tolérance", async () => {
    rendreCaisse();
    await attendreSession();

    await userEvent.click(screen.getByRole("button", { name: /^Billets de 5 000/ }));
    expect(total()).toHaveValue("699 500");
    expect(carteEcart()).toHaveTextContent("+ 4 000");
    expect(carteEcart()).toHaveAttribute("data-statut", "hors_tolerance");

    // Appui long (menu contextuel) : on retire un billet.
    fireEvent.contextMenu(screen.getByRole("button", { name: /^Billets de 5 000/ }));
    expect(total()).toHaveValue("694 500");
    expect(carteEcart()).toHaveTextContent("− 1 000");
    expect(carteEcart()).toHaveAttribute("data-statut", "dans_tolerance");
  });

  it("se colore selon le total tapé : vert à zéro, ambre dans la tolérance, rouge au-delà", async () => {
    rendreCaisse();
    await attendreSession();

    fireEvent.change(total(), { target: { value: "695500" } });
    expect(carteEcart()).toHaveTextContent("0");
    expect(carteEcart()).toHaveAttribute("data-statut", "exact");

    fireEvent.change(total(), { target: { value: "694000" } });
    expect(carteEcart()).toHaveTextContent("− 1 500");
    expect(carteEcart()).toHaveAttribute("data-statut", "hors_tolerance");

    fireEvent.change(total(), { target: { value: "696000" } });
    expect(carteEcart()).toHaveTextContent("+ 500");
    expect(carteEcart()).toHaveAttribute("data-statut", "dans_tolerance");
  });

  it("compte les pièces dans le total", async () => {
    rendreCaisse();
    await attendreSession();
    fireEvent.change(screen.getByRole("textbox", { name: "Montant des pièces" }), {
      target: { value: "1000" },
    });
    expect(total()).toHaveValue("695 500");
    expect(carteEcart()).toHaveAttribute("data-statut", "exact");
  });
});

describe("Caisse · navigation", () => {
  it("« Retour au guichet » mène au Guichet (/guichet/accueil)", async () => {
    const { routeur } = rendreCaisse();
    await attendreSession();
    const retour = screen.getByRole("link", { name: "Retour au guichet" });
    expect(retour).toHaveAttribute("href", "/guichet/accueil");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
  });

  it("« Clôturer » envoie le comptage et la clôture, puis mène au Superviseur (/gare)", async () => {
    const { routeur, client } = rendreCaisse();
    await attendreSession();
    expect(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    ).toHaveAttribute("href", "/gare");

    await userEvent.click(screen.getByRole("button", { name: /^Billets de 500/ }));
    await userEvent.click(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    );

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    const session = await client.executer(agence.OP_CAISSE_SESSION, {});
    expect(session.etat).toBe("cloturee");
    expect(session.comptage.total).toBe(695_000);
    expect(session.ecart.montant).toBe(-500);
  });

  it("envoie un total tapé à la main comme un comptage cohérent", async () => {
    const { routeur, client } = rendreCaisse();
    await attendreSession();
    fireEvent.change(total(), { target: { value: "695500" } });
    await userEvent.click(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    );
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    const session = await client.executer(agence.OP_CAISSE_SESSION, {});
    expect(session.etat).toBe("cloturee");
    expect(session.comptage.total).toBe(695_500);
    expect(session.ecart.statut).toBe("exact");
  });

  it("reste sur la caisse avec une alerte si la clôture échoue", async () => {
    const { routeur, client } = rendreCaisse({ panne: "cloture" });
    await attendreSession();
    await userEvent.click(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("La clôture n'a pas été envoyée");
    expect(routeur.state.location.pathname).toBe("/guichet/caisse");
    expect((await client.executer(agence.OP_CAISSE_SESSION, {})).etat).toBe("ouverte");
  });
});

describe("Caisse · clôture automatique de minuit", () => {
  it("alerte après minuit sans clôturer depuis l'appareil (le serveur la ferme) et fige le comptage", async () => {
    const { client } = rendreCaisse({ horloge: "2027-01-06T00:05:00+01:00" });
    expect(await screen.findByRole("alert")).toHaveTextContent("s'est clôturée seule à minuit");
    await attendreSession();
    // L'appareil n'envoie ni comptage ni clôture (`auto: true` est réservé au système, 422 côté serveur).
    const session = await client.executer(agence.OP_CAISSE_SESSION, {});
    expect(session.etat).toBe("ouverte");
    expect(session.comptage.total).toBe(694_500);

    // Le comptage est figé : toucher un billet ne change rien.
    await userEvent.click(screen.getByRole("button", { name: /^Billets de 5 000/ }));
    expect(total()).toHaveValue("694 500");
    expect(carteEcart()).toHaveTextContent("− 1 000");
  });

  it("relit la session après minuit jusqu'à ce que le serveur l'ait fermée", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { client } = rendreCaisse({ horloge: "2027-01-06T00:05:00+01:00" });
      await screen.findByRole("alert");
      const lectures = vi.spyOn(client, "executer");
      await vi.advanceTimersByTimeAsync(31_000);
      const relectures = lectures.mock.calls.filter(([op]) => op === agence.OP_CAISSE_SESSION);
      expect(relectures.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ne touche pas à une session avant minuit", async () => {
    const { client } = rendreCaisse({ horloge: "2027-01-05T23:59:00+01:00" });
    await attendreSession();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect((await client.executer(agence.OP_CAISSE_SESSION, {})).etat).toBe("ouverte");
  });

  it("« Clôturer » après minuit n'envoie rien et mène au Superviseur", async () => {
    const { routeur, client } = rendreCaisse({ horloge: "2027-01-06T00:05:00+01:00" });
    await screen.findByRole("alert");
    await userEvent.click(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    );
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect((await client.executer(agence.OP_CAISSE_SESSION, {})).etat).toBe("ouverte");
  });
});

describe("Caisse · alignement sur le backend de la caisse", () => {
  it("envoie des événements `caisse.comptee` puis `caisse.cloturee` avec `auto: false` et un écart cohérent", async () => {
    const envoyes: Array<{ type: string; donnees: Record<string, unknown> }> = [];
    const { routeur } = rendreCaisse({ journal: (e) => envoyes.push(e) });
    await attendreSession();
    await userEvent.click(screen.getByRole("button", { name: /^Billets de 500/ }));
    await userEvent.click(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    );
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));

    expect(envoyes.map((e) => e.type)).toEqual(["caisse.comptee", "caisse.cloturee"]);
    const [comptage, cloture] = envoyes;
    expect(comptage?.donnees).toMatchObject({ pieces: 0, total: 695_000 });
    expect(cloture?.donnees).toMatchObject({
      cashCompte: 695_000,
      cashAttendu: 695_500,
      ecart: -500,
      auto: false,
    });
    // Le comptage envoyé avant la clôture porte le même total (le serveur refuse sinon COMPTAGE_DIFFERENT).
    expect(comptage?.donnees["total"]).toBe(cloture?.donnees["cashCompte"]);
  });

  it("relit la session sans afficher de panne quand le serveur répond que la caisse n'est plus ouverte", async () => {
    const { routeur } = rendreCaisse({ panne: "deja_fermee" });
    await attendreSession();
    await userEvent.click(
      screen.getByRole("link", { name: /^Clôturer · faire valider par le superviseur/ }),
    );
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(
      screen.queryByText("La clôture n'a pas été envoyée. Réessayez."),
    ).not.toBeInTheDocument();
  });

  it("montre en lecture seule une caisse déjà clôturée, avec le comptage enregistré", async () => {
    const { client } = rendreCaisse({ etat: "cloturee" });
    await attendreSession();
    expect(total()).toHaveValue("694 500");
    await userEvent.click(screen.getByRole("button", { name: /^Billets de 5 000/ }));
    expect(total()).toHaveValue("694 500");
    expect((await client.executer(agence.OP_CAISSE_SESSION, {})).etat).toBe("cloturee");
  });
});

describe("Caisse · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête et le retour", async () => {
    rendreCaisse({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement de votre caisse" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    await attendreSession();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("montre l'état vide quand il n'y a pas de session (404)", async () => {
    rendreCaisse({ panne: "vide" });
    expect(await screen.findByText("Aucune caisse ouverte")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreCaisse({ panne: "erreur" });
    expect(await screen.findByText("Impossible de charger votre caisse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });
});
