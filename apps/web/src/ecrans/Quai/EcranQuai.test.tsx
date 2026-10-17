import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rendreQuai } from "./rendre-quai";
import { creerScannerFactice, installerScanner, type ScannerFactice } from "./scanner";

const QR_AICHA = "AM1:ALP-DLA-270105-0142:7341";
const QR_TCHOUMI = "AM1:ALP-DLA-270105-0185:6204";

let scanner: ScannerFactice;

beforeEach(() => {
  scanner = creerScannerFactice();
  installerScanner(() => scanner);
});

afterEach(() => installerScanner());

/** Attend que le quai soit affiché (le titre de la planche n'arrive qu'avec les données). */
async function attendreQuai() {
  await screen.findByRole("heading", { level: 1, name: "Quai 3 · 08:30 Yaoundé" });
}

/** Attend que la caméra (factice) tourne : la pastille « scan » est alors affichée. */
async function attendreCamera() {
  await attendreQuai();
  await waitFor(() => expect(scanner.demarre).toBe(true));
  await screen.findByRole("status");
}

function scanne(qr: string) {
  act(() => scanner.emettre(qr));
}

const carteScan = () => document.querySelector<HTMLElement>("[data-ton]")!;
const tuile = (libelle: string) => screen.getByText(libelle).parentElement!;

describe("Quai · rendu de la planche", () => {
  it("affiche l'en-tête, le dernier scan, les compteurs et les absents du scénario de démo", async () => {
    rendreQuai();
    await attendreQuai();

    expect(
      screen.getByText("Bus LT 412 AB · chauffeur Mbarga · convoyeur Alain"),
    ).toBeInTheDocument();

    const scan = carteScan();
    expect(scan).toHaveAttribute("data-ton", "ok");
    expect(within(scan).getByText("Dernier scan · OK · monte")).toBeInTheDocument();
    expect(within(scan).getByText("08:19:42")).toBeInTheDocument();
    expect(within(scan).getByText("Ngo Aïcha")).toBeInTheDocument();
    expect(within(scan).getByText("siège 7")).toBeInTheDocument();
    expect(
      within(scan).getByText("ALP-DLA-270105-0142 · CNI ···· 4471 · VIP · 1 bagage soute"),
    ).toBeInTheDocument();

    const embarques = screen.getByRole("region", { name: "embarqués" });
    expect(embarques).toHaveTextContent("31/40");
    expect(within(embarques).getByText("9 attendus · 2 non présentés à 08:25")).toBeInTheDocument();
    expect(within(embarques).getByText("départ 08:30")).toBeInTheDocument();
    expect(embarques.querySelector<HTMLElement>("[style]")).toHaveStyle({ width: "78%" });

    expect(tuile("Soute")).toHaveTextContent("14/17");
    expect(tuile("Soute")).toHaveTextContent("3 colis à charger");
    expect(tuile("Refusés")).toHaveTextContent("1");
    expect(tuile("Refusés")).toHaveTextContent("déjà scanné 07:58");
    expect(tuile("En route")).toHaveTextContent("4");
    expect(tuile("En route")).toHaveTextContent("montent à Pouma");

    const absents = screen.getByRole("region", { name: "Pas encore montés" });
    expect(within(absents).getByText("appeler · 1 touche")).toBeInTheDocument();
    expect(absents).toHaveTextContent("Tchoumi Paul · siège 24 · vendu 08:12");
    expect(absents).toHaveTextContent("Essomba R. · siège 12 · en retard, prévenu");
    expect(within(absents).getByRole("button", { name: "code 4 chiffres" })).toBeInTheDocument();
    expect(within(absents).getByRole("button", { name: "libérer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appeler Tchoumi Paul" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appeler Essomba R." })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Vendre les 9 restantes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Départ · liste au chauffeur" })).toBeInTheDocument();
  });

  it("n'affiche aucun badge « TOUCHE » (la planche n'en porte pas), même avec le flag conception", async () => {
    rendreQuai({ conception: true });
    await attendreQuai();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/touche \d/)).not.toBeInTheDocument();
  });

  it("n'a aucun bouton grisé et nomme chaque bouton rond", async () => {
    rendreQuai();
    await attendreQuai();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });
});

describe("Quai · scan continu par la caméra", () => {
  it("démarre la caméra, montre la pastille « scan » et la coupe en quittant l'écran", async () => {
    const { routeur } = rendreQuai();
    await attendreCamera();
    expect(screen.getByRole("status")).toHaveTextContent("scan");
    await userEvent.click(screen.getByRole("link", { name: "Retour au guichet" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    await waitFor(() => expect(scanner.demarre).toBe(false));
  });

  it("fait monter un voyageur : carte, compteur, absents et places mis à jour", async () => {
    rendreQuai();
    await attendreCamera();

    scanne(QR_TCHOUMI);

    await waitFor(() => expect(carteScan()).toHaveTextContent("Tchoumi Paul"));
    expect(carteScan()).toHaveAttribute("data-ton", "ok");
    expect(carteScan()).toHaveTextContent("siège 24");
    expect(carteScan()).toHaveTextContent("08:25:00");
    expect(carteScan()).toHaveTextContent("ALP-DLA-270105-0185 · CNI ···· 8820 · Classique");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "embarqués" })).toHaveTextContent("32/40"),
    );
    expect(screen.getByRole("region", { name: "embarqués" })).toHaveTextContent("8 attendus");
    expect(screen.queryByRole("button", { name: "Appeler Tchoumi Paul" })).not.toBeInTheDocument();
  });

  it("refuse un billet déjà scanné avec l'heure du premier scan", async () => {
    rendreQuai();
    await attendreCamera();

    scanne(QR_AICHA);

    await waitFor(() => expect(carteScan()).toHaveAttribute("data-ton", "refus"));
    expect(carteScan()).toHaveTextContent("Refusé · déjà scanné à 08:19");
    expect(carteScan()).toHaveTextContent("Ngo Aïcha");
    expect(carteScan()).toHaveAttribute("role", "alert");
    // Le compteur des refusés suit, et le billet n'est pas compté deux fois.
    await waitFor(() => expect(tuile("Refusés")).toHaveTextContent("2"));
    expect(screen.getByRole("region", { name: "embarqués" })).toHaveTextContent("31/40");
  });

  it("refuse un QR inconnu", async () => {
    rendreQuai();
    await attendreCamera();
    scanne("AM1:ALP-DLA-270105-9999:0000");
    await waitFor(() => expect(carteScan()).toHaveTextContent("Refusé · billet introuvable"));
    expect(carteScan()).toHaveAttribute("data-ton", "refus");
  });

  it("compte les deux voyageurs de deux scans qui se suivent", async () => {
    rendreQuai();
    await attendreCamera();
    scanne(QR_TCHOUMI);
    scanne(QR_AICHA);
    await waitFor(() => expect(carteScan()).toHaveTextContent("Refusé · déjà scanné"));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "embarqués" })).toHaveTextContent("32/40"),
    );
  });

  it("prévient quand le scan n'a pas pu être envoyé, sans casser la mise en page", async () => {
    rendreQuai({ panne: "scan" });
    await attendreCamera();
    scanne(QR_TCHOUMI);
    expect(await screen.findByText("Scan non envoyé")).toBeInTheDocument();
    expect(carteScan()).toHaveAttribute("role", "alert");
    expect(screen.getByRole("region", { name: "embarqués" })).toHaveTextContent("31/40");
  });
});

describe("Quai · repli sur le code à 4 chiffres", () => {
  beforeEach(() => {
    installerScanner(() => null);
  });

  it("montre « code » à la place de « scan » quand la caméra n'est pas disponible", async () => {
    rendreQuai();
    await attendreQuai();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saisir un code à 4 chiffres" })).toHaveTextContent(
      "code",
    );
  });

  it("se replie aussi quand l'agent refuse la caméra", async () => {
    installerScanner(() => creerScannerFactice({ refuse: true }));
    rendreQuai();
    await attendreQuai();
    expect(
      await screen.findByRole("button", { name: "Saisir un code à 4 chiffres" }),
    ).toBeInTheDocument();
  });

  it("embarque le voyageur dont on saisit le code, depuis la pastille", async () => {
    rendreQuai();
    await attendreQuai();
    await userEvent.click(screen.getByRole("button", { name: "Saisir un code à 4 chiffres" }));

    const feuille = await screen.findByRole("dialog", { name: "Code à 4 chiffres" });
    await userEvent.type(within(feuille).getByRole("textbox", { name: "Code du billet" }), "6204");

    await waitFor(() => expect(carteScan()).toHaveTextContent("Tchoumi Paul"));
    expect(carteScan()).toHaveAttribute("data-ton", "ok");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ouvre la saisie depuis « code 4 chiffres » de la ligne, avec le nom du voyageur", async () => {
    rendreQuai();
    await attendreQuai();
    await userEvent.click(screen.getByRole("button", { name: "code 4 chiffres" }));
    const feuille = await screen.findByRole("dialog", { name: "Code à 4 chiffres" });
    expect(within(feuille).getByText("Tchoumi Paul")).toBeInTheDocument();
    await userEvent.type(within(feuille).getByRole("textbox", { name: "Code du billet" }), "6204");
    await waitFor(() => expect(carteScan()).toHaveTextContent("Tchoumi Paul"));
  });

  it("refuse un code inconnu et ferme la saisie en Échap", async () => {
    rendreQuai();
    await attendreQuai();
    await userEvent.click(screen.getByRole("button", { name: "Saisir un code à 4 chiffres" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Code du billet" }), "0000");
    await waitFor(() => expect(carteScan()).toHaveTextContent("Refusé · billet introuvable"));

    await userEvent.click(screen.getByRole("button", { name: "Saisir un code à 4 chiffres" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("garde la saisie ouverte avec une erreur quand le code n'a pas pu être envoyé", async () => {
    rendreQuai({ panne: "code" });
    await attendreQuai();
    await userEvent.click(screen.getByRole("button", { name: "Saisir un code à 4 chiffres" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Code du billet" }), "6204");
    expect(await screen.findByText("Code non envoyé. Réessayez.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Quai · absents", () => {
  it("« libérer » retire l'absent et remet le siège à la vente", async () => {
    rendreQuai();
    await attendreQuai();

    await userEvent.click(screen.getByRole("button", { name: "libérer" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Appeler Essomba R." })).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("link", { name: "Vendre les 10 restantes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tchoumi Paul", { exact: false })).toBeInTheDocument();
  });

  it("alerte quand le siège n'a pas pu être libéré", async () => {
    rendreQuai({ panne: "liberation" });
    await attendreQuai();
    await userEvent.click(screen.getByRole("button", { name: "libérer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Le siège n'a pas été libéré");
    expect(screen.getByRole("button", { name: "Appeler Essomba R." })).toBeInTheDocument();
  });

  it("« Appeler » le dit quand le contrat ne donne pas de numéro", async () => {
    rendreQuai();
    await attendreQuai();
    await userEvent.click(screen.getByRole("button", { name: "Appeler Tchoumi Paul" }));
    expect(screen.getByText("Pas de numéro enregistré pour Tchoumi Paul.")).toHaveAttribute(
      "role",
      "status",
    );
  });
});

describe("Quai · navigation", () => {
  it("« Retour au guichet » mène au Guichet (/guichet/accueil)", async () => {
    const { routeur } = rendreQuai();
    await attendreQuai();
    const retour = screen.getByRole("link", { name: "Retour au guichet" });
    expect(retour).toHaveAttribute("href", "/guichet/accueil");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
  });

  it("« Vendre les 9 restantes » mène au Convoyeur (/convoyeur)", async () => {
    const { routeur } = rendreQuai();
    await attendreQuai();
    const lien = screen.getByRole("link", { name: "Vendre les 9 restantes" });
    expect(lien).toHaveAttribute("href", "/convoyeur");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/convoyeur"));
  });

  it("« Départ · liste au chauffeur » envoie la liste puis mène au Chauffeur (/chauffeur)", async () => {
    const { routeur } = rendreQuai();
    await attendreQuai();
    const lien = screen.getByRole("link", { name: "Départ · liste au chauffeur" });
    expect(lien).toHaveAttribute("href", "/chauffeur");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/chauffeur"));
  });

  it("reste sur le quai avec une alerte si la liste n'est pas partie", async () => {
    const { routeur } = rendreQuai({ panne: "liste" });
    await attendreQuai();
    await userEvent.click(screen.getByRole("link", { name: "Départ · liste au chauffeur" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La liste n'a pas été envoyée");
    expect(routeur.state.location.pathname).toBe("/embarquement");
  });
});

describe("Quai · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête et le retour", async () => {
    rendreQuai({ latenceMs: 200 });
    expect(await screen.findByRole("status", { name: "Chargement du quai" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    await attendreQuai();
    expect(screen.queryByRole("status", { name: "Chargement du quai" })).not.toBeInTheDocument();
  });

  it("montre l'état vide quand il n'y a pas de quai ouvert (404)", async () => {
    rendreQuai({ panne: "vide" });
    expect(await screen.findByText("Aucun départ à embarquer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreQuai({ panne: "erreur" });
    expect(await screen.findByText("Impossible de charger le quai")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });
});
