import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreVente } from "@/ecrans/Vente/rendre-vente";
import { lireClientsConnus, memoriserClient } from "./clients-connus";

const nom = () => screen.getByRole("textbox", { name: "Nom du voyageur" });
const telephone = () => screen.getByRole("textbox", { name: "Téléphone" });
const piece = () => screen.getByRole("textbox", { name: "Pièce (4 derniers)" });
const clientConnu = () => screen.getByRole("button", { name: "Client connu ↓" });
const encaisser = () => screen.getByRole("link", { name: /^Encaisser et imprimer/ });

async function attendreVente() {
  await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-0185");
}

function connaitre(nomClient: string, tel: string | null, pieceClient: string | null) {
  memoriserClient({
    nom: nomClient,
    telephone: tel,
    pieceQuatreDerniers: pieceClient,
    dernierBilletA: "2027-01-04T09:00:00+01:00",
  });
}

describe("Vente · bouton « Client connu »", () => {
  it("ouvre la feuille et dit que le carnet est vide tant qu'aucun billet n'a été vendu", async () => {
    rendreVente();
    await attendreVente();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(clientConnu());
    const feuille = await screen.findByRole("dialog", { name: "Client connu" });
    expect(within(feuille).getByRole("status")).toHaveTextContent("Aucun client connu");

    await userEvent.click(within(feuille).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Fermer sans choisir ne touche pas au billet en cours.
    expect(nom()).toHaveValue("Tchoumi Paul");
  });

  it("remplit nom, téléphone et pièce avec le client touché, puis referme la feuille", async () => {
    connaitre("Ngo Marie", "+237699001122", "4471");
    connaitre("Essono Léa", null, null);
    rendreVente();
    await attendreVente();

    await userEvent.click(clientConnu());
    const feuille = await screen.findByRole("dialog", { name: "Client connu" });
    await userEvent.type(within(feuille).getByRole("searchbox"), "ngo");
    expect(within(feuille).queryByRole("button", { name: /Essono/ })).not.toBeInTheDocument();
    await userEvent.click(within(feuille).getByRole("button", { name: /Ngo Marie/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(nom()).toHaveValue("Ngo Marie");
    expect(telephone()).toHaveValue("6 99 00 11 22");
    expect(piece()).toHaveValue("4471");
  });

  it("vide le téléphone et la pièce d'un client qui n'en a pas, au lieu de garder ceux du billet précédent", async () => {
    connaitre("Essono Léa", null, null);
    rendreVente();
    await attendreVente();

    await userEvent.click(clientConnu());
    await userEvent.click(await screen.findByRole("button", { name: /Essono Léa/ }));
    expect(nom()).toHaveValue("Essono Léa");
    expect(telephone()).toHaveValue("");
    expect(piece()).toHaveValue("");
  });

  it("vend ensuite au client choisi, avec ses coordonnées", async () => {
    connaitre("Ngo Marie", "+237699001122", "4471");
    const { recus, routeur } = rendreVente();
    await attendreVente();

    await userEvent.click(clientConnu());
    await userEvent.click(await screen.findByRole("button", { name: /Ngo Marie/ }));
    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

    expect(recus).toHaveLength(1);
    expect(recus[0]).toMatchObject({
      donnees: {
        passager: { nom: "Ngo Marie", telephone: "+237699001122", pieceQuatreDerniers: "4471" },
      },
    });
  });

  it("ajoute au carnet le voyageur d'un billet vendu, et le propose à la vente suivante", async () => {
    expect(lireClientsConnus()).toEqual([]);
    const { routeur } = rendreVente();
    await attendreVente();
    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

    expect(lireClientsConnus()).toEqual([
      {
        nom: "Tchoumi Paul",
        telephone: "+237677301145",
        pieceQuatreDerniers: "8820",
        // L'horloge de la planche : 5 janvier 2027, 7 h 38 à Douala.
        dernierBilletA: "2027-01-05T06:38:00.000Z",
      },
    ]);
  });

  it("ne retient personne quand la vente échoue", async () => {
    const { routeur } = rendreVente({ panne: "vente" });
    await attendreVente();
    await userEvent.click(encaisser());
    await screen.findByRole("alert");
    expect(routeur.state.location.pathname).not.toBe("/guichet/accueil");
    expect(lireClientsConnus()).toEqual([]);
  });
});
