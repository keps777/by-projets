import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreApp } from "@/test/rendre";
import { horlogeFigee } from "@/coquille/horloge";
import { HORLOGE_CADENCE, rendreCadence } from "./rendre-cadence";

/** Attend que l'état de la cadence soit affiché. */
async function attendreCadence() {
  await screen.findByText(/Vendus en cadence/);
}

const cash = () => screen.getByRole("button", { name: /^CASH/ });
const momo = () => screen.getByRole("button", { name: /^MOMO/ });
const feuille = () => screen.findByRole("dialog");

async function saisirNumero(numero = "677301145") {
  const dialogue = await feuille();
  await userEvent.type(within(dialogue).getByLabelText("Numéro de téléphone"), numero);
  await userEvent.click(within(dialogue).getByRole("button", { name: "Valider" }));
}

// Le premier rendu compose les scénarios de toutes les planches (repli) : sous charge il dépasse 1 s.
configure({ asyncUtilTimeout: 8000 });

describe("Cadence · rendu de la planche", () => {
  it("affiche le départ, le dernier billet, le prochain, les deux boutons et le pied du scénario de démo", async () => {
    rendreApp({
      fixtures: true,
      scenario: "Cadence",
      url: "/guichet/cadence",
      horloge: horlogeFigee(HORLOGE_CADENCE),
    });
    await attendreCadence();

    expect(screen.getByRole("heading", { level: 1, name: "Mode cadence" })).toBeInTheDocument();
    expect(screen.getByText("CADENCE · 05:14")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitter la cadence" })).toHaveAttribute(
      "href",
      "/guichet/accueil",
    );

    const depart = screen.getByRole("region", { name: "Départ en cours" });
    expect(within(depart).getByText("05:30 Yaoundé")).toBeInTheDocument();
    expect(within(depart).getByText("17")).toBeInTheDocument();
    expect(within(depart).getByText("places restantes")).toBeInTheDocument();

    expect(screen.getByText("Dernier billet · 17 s")).toBeInTheDocument();
    expect(screen.getByText("0231 · siège 18 · Ngono A.")).toBeInTheDocument();
    expect(screen.getByText("Prochain")).toBeInTheDocument();
    expect(screen.getByText(/^4 000/)).toHaveTextContent("4 000 F");
    expect(screen.getByText(/Siège suivant :/)).toHaveTextContent(
      "Siège suivant : 19 · nom et pièce saisis au quai par le convoyeur",
    );

    expect(cash()).toHaveTextContent("CASH");
    expect(cash()).toHaveTextContent("imprime + SMS si numéro");
    expect(momo()).toHaveTextContent("MOMO");
    expect(momo()).toHaveTextContent("push confirmé");
    for (const libelle of ["× 2 places", "+ numéro", "Autre départ"]) {
      expect(screen.getByRole("button", { name: libelle })).toBeInTheDocument();
    }

    expect(screen.getByText(/Vendus en cadence/)).toHaveTextContent(
      "Vendus en cadence : 63 · 0 annulation",
    );
    expect(screen.getByText("hors ligne OK · sync 05:13")).toBeInTheDocument();
  });

  it("n'affiche « touche n · » que si le flag conception est actif", async () => {
    rendreCadence();
    await attendreCadence();
    expect(screen.queryByText(/touche 1/)).not.toBeInTheDocument();
  });

  it("affiche « touche 1 · » et « touche 2 · » avec le flag conception", async () => {
    rendreCadence({ conception: true });
    await attendreCadence();
    expect(cash()).toHaveTextContent("touche 1 · imprime + SMS si numéro");
    expect(momo()).toHaveTextContent("touche 1 · push touche 2 · confirmé");
  });

  it("n'a aucun bouton grisé", async () => {
    rendreCadence();
    await attendreCadence();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
  });

  it("vieillit le dernier billet avec l'horloge : minutes, puis heures", async () => {
    rendreCadence({ horloge: "2027-01-05T05:19:00+01:00" });
    expect(await screen.findByText("Dernier billet · 5 min")).toBeInTheDocument();
  });
});

describe("Cadence · navigation", () => {
  it("« Quitter la cadence » mène au Guichet (/guichet/accueil)", async () => {
    const { routeur } = rendreCadence();
    await attendreCadence();
    await userEvent.click(screen.getByRole("link", { name: "Quitter la cadence" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
  });
});

describe("Cadence · CASH, une touche par billet", () => {
  it("vend un billet sans nom ni pièce, l'imprime, puis montre « Vendu »", async () => {
    const { routeur, ecritures } = rendreCadence();
    await attendreCadence();
    await userEvent.click(cash());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/cadence/vendu"));
    expect(await screen.findByText(/^Vendu · \d+,\d s$/)).toBeInTheDocument();

    const ventes = ecritures.filter((e) => e.type === "billet.vendu_cadence");
    expect(ventes).toHaveLength(1);
    expect(ventes[0]?.donnees).toMatchObject({
      siege: 19,
      prix: 4000,
      paiement: { mode: "cash", recu: 4000, rendu: 0 },
      telephone: null,
    });
    expect(ventes[0]?.donnees).not.toHaveProperty("passager");
    expect(ventes[0]?.donnees).not.toHaveProperty("nom");
    expect(String(ventes[0]?.donnees["codeBillet"])).toMatch(/^\d{4}$/);
    expect(ventes[0]?.numeroPlage).toBe(1001);

    const impressions = ecritures.filter((e) => e.type === "impression.demandee");
    expect(impressions).toHaveLength(1);
    expect(impressions[0]?.donnees).toMatchObject({ document: "billet", copies: 1 });
    expect(impressions[0]?.donnees["documentId"]).toBe(ventes[0]?.donnees["billetId"]);

    // L'écran « Vendu » montre ce qui vient d'être vendu, sans relire le serveur.
    expect(screen.getByText("billet 1001 · siège 19 · cash 4 000")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("Siège 19")).toBeInTheDocument();
    expect(screen.getByText("Imprimé")).toBeInTheDocument();
    expect(screen.getByText("Billet suivant").closest("a")).toHaveTextContent("siège 20 · 4 000");
  });

  it("ne bloque pas la vente quand l'imprimante est hors service : le billet reste à imprimer", async () => {
    rendreCadence({ panne: "imprimante-hors-service" });
    expect(await screen.findByText(/Imprimante indisponible/)).toBeInTheDocument();
    await userEvent.click(cash());
    expect(await screen.findByText("Impression")).toBeInTheDocument();
    expect(screen.getByText("en attente de l'imprimante")).toBeInTheDocument();
    expect(screen.queryByText("Imprimé")).not.toBeInTheDocument();
  });

  it("vend quand même si la demande d'impression échoue", async () => {
    const { routeur } = rendreCadence({ panne: "impression" });
    await attendreCadence();
    await userEvent.click(cash());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/cadence/vendu"));
    expect(await screen.findByText("Impression")).toBeInTheDocument();
  });

  it("reste sur la cadence avec une alerte si la vente échoue", async () => {
    const { routeur } = rendreCadence({ panne: "vente" });
    await attendreCadence();
    await userEvent.click(cash());
    expect(await screen.findByRole("alert")).toHaveTextContent("La vente n'a pas été enregistrée");
    expect(routeur.state.location.pathname).toBe("/guichet/cadence");
    expect(cash()).toBeEnabled();
  });

  it("ignore une seconde touche pendant que la vente part", async () => {
    const { ecritures } = rendreCadence({ latenceMs: 30 });
    await attendreCadence();
    await userEvent.click(cash());
    await userEvent.click(cash());
    await screen.findByText(/^Vendu · /);
    expect(ecritures.filter((e) => e.type === "billet.vendu_cadence")).toHaveLength(1);
  });
});

describe("Cadence · × 2 places et + numéro", () => {
  it("vend deux billets (deux événements, deux sièges) avec « × 2 places »", async () => {
    const { ecritures } = rendreCadence();
    await attendreCadence();
    const deux = screen.getByRole("button", { name: "× 2 places" });
    await userEvent.click(deux);
    expect(deux).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(cash());

    await screen.findByText(/^Vendu · /);
    const ventes = ecritures.filter((e) => e.type === "billet.vendu_cadence");
    expect(ventes.map((v) => v.donnees["siege"])).toEqual([19, 20]);
    expect(ventes.map((v) => v.numeroPlage)).toEqual([1001, 1002]);
    expect(new Set(ventes.map((v) => v.donnees["billetId"])).size).toBe(2);
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Billet suivant").closest("a")).toHaveTextContent("siège 21");
  });

  it("joint le numéro saisi au billet (SMS) et l'affiche dans l'écran « Vendu »", async () => {
    const { ecritures } = rendreCadence();
    await attendreCadence();
    await userEvent.click(screen.getByRole("button", { name: "+ numéro" }));
    await saisirNumero();
    expect(screen.getByRole("button", { name: "6 77 30 11 45" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(cash());

    await screen.findByText(/^Vendu · /);
    expect(ecritures.find((e) => e.type === "billet.vendu_cadence")?.donnees).toMatchObject({
      telephone: "+237677301145",
    });
    expect(screen.getByText(": envoyé au 6 77 30 11 45")).toBeInTheDocument();
  });

  it("refuse un numéro incomplet", async () => {
    rendreCadence();
    await attendreCadence();
    await userEvent.click(screen.getByRole("button", { name: "+ numéro" }));
    await saisirNumero("6773");
    expect(await screen.findByText("Entrez les 9 chiffres du numéro.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Cadence · numéro obligatoire (réglage du patron)", () => {
  it("ouvre « + numéro » à la place de vendre, puis vend avec le numéro", async () => {
    const { routeur, ecritures, reglesLues } = rendreCadence({ numeroObligatoire: true });
    await attendreCadence();
    // Le réglage arrive avec sa propre requête : on attend sa réponse, puis que l'écran l'ait prise en compte.
    await reglesLues;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await userEvent.click(cash());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Numéro obligatoire en cadence.")).toBeInTheDocument();
    expect(ecritures.filter((e) => e.type === "billet.vendu_cadence")).toHaveLength(0);
    expect(routeur.state.location.pathname).toBe("/guichet/cadence");

    await saisirNumero();
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/cadence/vendu"));
    expect(ecritures.find((e) => e.type === "billet.vendu_cadence")?.donnees).toMatchObject({
      telephone: "+237677301145",
    });
  });

  it("ne demande rien quand le réglage est coupé", async () => {
    rendreCadence({ numeroObligatoire: false });
    await attendreCadence();
    await userEvent.click(cash());
    await screen.findByText(/^Vendu · /);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Cadence · MOMO, push puis confirmé", () => {
  it("demande le numéro, envoie le push à la première touche, vend à la seconde", async () => {
    const { ecritures } = rendreCadence();
    await attendreCadence();

    await userEvent.click(momo());
    await saisirNumero();
    expect(momo()).toHaveTextContent("push envoyé");
    expect(ecritures.filter((e) => e.type === "billet.vendu_cadence")).toHaveLength(0);

    await userEvent.click(momo());
    await screen.findByText(/^Vendu · /);
    expect(ecritures.find((e) => e.type === "billet.vendu_cadence")?.donnees).toMatchObject({
      paiement: { mode: "momo", recu: 4000, rendu: 0 },
      telephone: "+237677301145",
    });
    expect(screen.getByText("billet 1001 · siège 19 · MoMo 4 000")).toBeInTheDocument();
    expect(screen.getByText("MoMo")).toBeInTheDocument();
    expect(screen.getByText("4 000, rien en caisse")).toBeInTheDocument();
  });

  it("vend en cash et annule le push en attente si l'agent touche CASH", async () => {
    const { ecritures } = rendreCadence();
    await attendreCadence();
    await userEvent.click(screen.getByRole("button", { name: "+ numéro" }));
    await saisirNumero();
    await userEvent.click(momo());
    expect(momo()).toHaveTextContent("push envoyé");
    await userEvent.click(cash());
    await screen.findByText(/^Vendu · /);
    expect(ecritures.find((e) => e.type === "billet.vendu_cadence")?.donnees).toMatchObject({
      paiement: { mode: "cash" },
    });
  });
});

describe("Cadence · autre départ", () => {
  it("liste les départs ouverts à la vente dans une feuille", async () => {
    rendreCadence();
    await attendreCadence();
    await userEvent.click(screen.getByRole("button", { name: "Autre départ" }));
    const dialogue = await feuille();
    expect(within(dialogue).getByText("Autre départ")).toBeInTheDocument();
    const choix = await within(dialogue).findAllByRole("button", {
      name: /· \d+ places? libres?$/,
    });
    expect(choix.length).toBeGreaterThan(0);
    await userEvent.click(choix[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/Vendus en cadence/)).toBeInTheDocument();
  });
});

describe("Cadence · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec la sortie", async () => {
    rendreCadence({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement du mode cadence" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitter la cadence" })).toBeInTheDocument();
    await attendreCadence();
    expect(
      screen.queryByRole("status", { name: "Chargement du mode cadence" }),
    ).not.toBeInTheDocument();
  });

  it("montre l'état vide quand aucun départ n'est ouvert (404)", async () => {
    rendreCadence({ panne: "etat-vide" });
    expect(await screen.findByText("Aucun départ en cadence")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitter la cadence" })).toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreCadence({ panne: "etat-erreur" });
    expect(await screen.findByText("Impossible de charger le mode cadence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Quitter la cadence" })).toBeInTheDocument();
  });
});
