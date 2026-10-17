import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreApp } from "@/test/rendre";
import { horlogeFigee } from "@/coquille/horloge";
import { BILLET_0232, HORLOGE_BILLET, rendreCadence } from "../Cadence/rendre-cadence";

/** Attend que le billet soit affiché. */
async function attendreBillet() {
  await screen.findByText(/^Vendu · /);
}

// Le premier rendu compose les scénarios de toutes les planches (repli) : sous charge il dépasse 1 s.
configure({ asyncUtilTimeout: 8000 });

describe("CadenceBillet · rendu de la planche", () => {
  it("affiche la vente, le billet, ce que l'app a fait et ce qu'il manque (scénario de démo)", async () => {
    rendreApp({
      fixtures: true,
      scenario: "CadenceBillet",
      url: `/guichet/cadence/vendu?billet=${BILLET_0232}`,
      horloge: horlogeFigee(HORLOGE_BILLET),
    });
    await attendreBillet();

    expect(screen.getByText("CADENCE · 05:14:52")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Vendu · 1,8 s" })).toBeInTheDocument();
    const vendu = screen.getByRole("region", { name: "Vente de cadence" });
    expect(
      within(vendu).getByText("billet 0232 · siège 19 · cash 4 000 · rendu 1 000"),
    ).toBeInTheDocument();
    expect(vendu).toHaveTextContent("16 restent");

    const billet = screen.getByRole("group", { name: "Billet ALP-DLA-270105-0232" });
    for (const texte of [
      "ALPHA VOYAGES",
      "DLA → YDE",
      "05:30 · 05.01.27",
      "à compléter au quai",
      "PIÈCE : ____ (4 chiffres)",
      "9 0 4 7",
      "ALP-DLA-270105-0232",
      "Au quai 20 min avant · afrimove.cm",
    ]) {
      expect(within(billet).getByText(texte)).toBeInTheDocument();
    }
    expect(billet).toHaveTextContent("SIÈGE 19 · CLASSIQUE");
    expect(billet).toHaveTextContent("NOM : à compléter au quai");
    expect(within(billet).getByRole("img", { name: "QR code du billet" })).toBeInTheDocument();

    expect(screen.getByText("En 2 secondes, l'app a fait")).toBeInTheDocument();
    for (const [titre, ligne] of [
      ["Numéroté", "Numéroté 0232, sans trou dans ma plage"],
      ["Siège 19", "Siège 19 bloqué sur le plan du bus"],
      ["Imprimé", "Imprimé · QR + code 9047"],
      ["Caisse", "Caisse +4 000 cash, rendu 1 000"],
      ["SMS", "SMS : pas de numéro · + numéro pour l'envoyer"],
      ["Synchro", "Synchro au retour du réseau · hors ligne OK"],
    ] as const) {
      expect(screen.getByText(titre, { selector: "strong" }).parentElement).toHaveTextContent(
        ligne,
      );
    }

    const manque = screen.getByText("Ce qu'il manque encore").closest("section")!;
    expect(manque).toHaveTextContent("complété au quai, à la montée");
    expect(manque).toHaveTextContent(
      "Le nom et les 4 chiffres de la pièce. Le convoyeur scanne le QR ou tape 9047, le client montre sa pièce, le billet devient nominatif. Tant que ce n'est pas fait, le billet apparaît « cadence, sans nom » dans la liste du départ et dans le rapport du soir.",
    );

    expect(screen.getByRole("button", { name: "+ numéro · envoyer le SMS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler · PIN superviseur" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la suite au quai" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Billet suivant/ })).toHaveTextContent(
      "siège 20 · 4 000",
    );
  });

  it("n'a aucun bouton grisé et nomme le bouton rond", async () => {
    rendreCadence({ scenario: "CadenceBillet" });
    await attendreBillet();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour à la cadence" })).toBeInTheDocument();
  });

  it("n'affiche « touche n · » nulle part (la planche n'en a pas)", async () => {
    rendreCadence({ scenario: "CadenceBillet", conception: true });
    await attendreBillet();
    expect(screen.queryByText(/touche \d/)).not.toBeInTheDocument();
  });
});

describe("CadenceBillet · navigation", () => {
  it("« Retour à la cadence » mène à la Cadence (/guichet/cadence)", async () => {
    const { routeur } = rendreCadence({ scenario: "CadenceBillet" });
    await attendreBillet();
    const retour = screen.getByRole("link", { name: "Retour à la cadence" });
    expect(retour).toHaveAttribute("href", "/guichet/cadence");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/cadence"));
  });

  it("« Billet suivant » mène à la Cadence", async () => {
    const { routeur } = rendreCadence({ scenario: "CadenceBillet" });
    await attendreBillet();
    await userEvent.click(screen.getByRole("link", { name: /^Billet suivant/ }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/cadence"));
    expect(await screen.findByText(/Vendus en cadence/)).toBeInTheDocument();
  });

  it("« Voir la suite au quai » mène au quai (/completer)", async () => {
    const { routeur } = rendreCadence({ scenario: "CadenceBillet" });
    await attendreBillet();
    const lien = screen.getByRole("link", { name: "Voir la suite au quai" });
    expect(lien).toHaveAttribute("href", "/completer");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/completer"));
  });

  it("« Annuler · PIN superviseur » demande l'annulation puis mène au Superviseur (/gare)", async () => {
    const { routeur, ecritures } = rendreCadence({ scenario: "CadenceBillet" });
    await attendreBillet();
    await userEvent.click(screen.getByRole("button", { name: "Annuler · PIN superviseur" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    const demande = ecritures.find((e) => e.type === "annulation.demandee");
    expect(demande?.donnees).toMatchObject({ billetId: BILLET_0232 });
    expect(demande?.donnees["motif"]).toBeTruthy();
    // La demande attend le PIN du superviseur : aucune annulation n'est décidée ici.
    expect(ecritures.some((e) => e.type === "annulation.decidee")).toBe(false);
  });

  it("reste sur l'écran avec une alerte si la demande d'annulation échoue", async () => {
    const { routeur } = rendreCadence({ scenario: "CadenceBillet", panne: "annulation" });
    await attendreBillet();
    await userEvent.click(screen.getByRole("button", { name: "Annuler · PIN superviseur" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La demande d'annulation n'est pas partie",
    );
    expect(routeur.state.location.pathname).toBe("/guichet/cadence/vendu");
  });
});

describe("CadenceBillet · + numéro · envoyer le SMS", () => {
  it("ajoute le numéro au billet, passe la ligne SMS à « envoyé » et retire le bouton", async () => {
    const { ecritures } = rendreCadence({ scenario: "CadenceBillet" });
    await attendreBillet();
    await userEvent.click(screen.getByRole("button", { name: "+ numéro · envoyer le SMS" }));
    const dialogue = await screen.findByRole("dialog");
    await userEvent.type(within(dialogue).getByLabelText("Numéro de téléphone"), "677301145");
    await userEvent.click(within(dialogue).getByRole("button", { name: "Valider" }));

    expect(await screen.findByText(": envoyé au 6 77 30 11 45")).toBeInTheDocument();
    expect(ecritures.find((e) => e.type === "billet.telephone_ajoute")?.donnees).toEqual({
      billetId: BILLET_0232,
      telephone: "+237677301145",
    });
    expect(
      screen.queryByRole("button", { name: "+ numéro · envoyer le SMS" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler · PIN superviseur" })).toBeInTheDocument();
  });

  it("alerte si le numéro n'a pas pu être enregistré", async () => {
    rendreCadence({ scenario: "CadenceBillet", panne: "telephone" });
    await attendreBillet();
    await userEvent.click(screen.getByRole("button", { name: "+ numéro · envoyer le SMS" }));
    const dialogue = await screen.findByRole("dialog");
    await userEvent.type(within(dialogue).getByLabelText("Numéro de téléphone"), "677301145");
    await userEvent.click(within(dialogue).getByRole("button", { name: "Valider" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Le numéro n'a pas été enregistré");
    expect(screen.getByRole("button", { name: "+ numéro · envoyer le SMS" })).toBeInTheDocument();
  });
});

describe("CadenceBillet · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec le retour", async () => {
    rendreCadence({ scenario: "CadenceBillet", latenceMs: 200 });
    expect(await screen.findByRole("status", { name: "Chargement du billet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à la cadence" })).toBeInTheDocument();
    await attendreBillet();
  });

  it("montre l'état vide pour un billet inconnu (404)", async () => {
    rendreCadence({ scenario: "CadenceBillet", url: "/guichet/cadence/vendu?billet=inconnu" });
    expect(await screen.findByText("Aucun billet à montrer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à la cadence" })).toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreCadence({ scenario: "CadenceBillet", panne: "billet-erreur" });
    expect(await screen.findByText("Impossible de charger le billet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("sans identifiant, relit le dernier billet vendu sur l'appareil", async () => {
    rendreCadence({ scenario: "Cadence", url: "/guichet/cadence/vendu" });
    // Le scénario Cadence ne sait relire que ses propres billets : ici le dernier (0231) n'a pas de page « Vendu ».
    expect(await screen.findByText("Aucun billet à montrer")).toBeInTheDocument();
  });
});
