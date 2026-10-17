import { act, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerScannerFactice, installerScanner, type ScannerFactice } from "../Quai/scanner";
import { BILLET_0232, QR_0225, rendreCadenceQuai } from "./rendre-cadence-quai";

// Le premier rendu compose les scénarios de toutes les planches (repli) : sous charge il dépasse 1 s.
configure({ asyncUtilTimeout: 8000 });

const QR_0232 = "AM1:ALP-DLA-270105-0232:9047";

let scanner: ScannerFactice;

beforeEach(() => {
  scanner = creerScannerFactice();
  installerScanner(() => scanner);
});

afterEach(() => installerScanner());

/** Attend que le billet soit affiché (le titre de la planche n'arrive qu'avec les données). */
async function attendreBillet() {
  await screen.findByRole("heading", { level: 1, name: "Quai 1 · 05:30 Yaoundé" });
}

function scanne(qr: string) {
  act(() => scanner.emettre(qr));
}

const champNom = () => screen.getByRole("textbox", { name: "Nom" });
const champPiece = () => screen.getByRole("textbox", { name: "Pièce · 4 derniers" });
const champTelephone = () => screen.getByRole("textbox", { name: "Téléphone (facultatif, SMS)" });
const boutonEmbarquer = () => screen.getByRole("button", { name: /^Embarquer · siège/ });

/** Vide le téléphone coupé de la planche (« 6 55 12 … ») : il est facultatif, mais ne peut pas rester incomplet. */
async function viderTelephone() {
  await userEvent.clear(champTelephone());
}

describe("CadenceQuai · rendu de la planche", () => {
  it("affiche l'en-tête, le billet scanné, la saisie, les compteurs et la liste (scénario de démo)", async () => {
    rendreCadenceQuai();
    await attendreBillet();

    expect(
      screen.getByText("Convoyeur Alain · scan + compléter les billets de cadence"),
    ).toBeInTheDocument();

    const scan = screen.getByRole("status", { name: "Scanné · billet de cadence, sans nom" });
    expect(scan).toHaveTextContent("05:22:10");
    expect(within(scan).getByText("ALP-DLA-270105-0232")).toBeInTheDocument();
    expect(within(scan).getByText("siège 19")).toBeInTheDocument();
    expect(
      within(scan).getByText("Vendu à 05:14 au guichet 2 · cash 4 000 · valide pour ce départ"),
    ).toBeInTheDocument();

    expect(screen.getByText("Compléter · le client montre sa pièce")).toBeInTheDocument();
    expect(champNom()).toHaveValue("Ngono Albertine");
    expect(champPiece()).toHaveValue("2210");
    expect(champTelephone()).toHaveValue("6 55 12 …");
    expect(
      screen.getByText(
        "Le nom est tapé une fois ici, jamais au guichet pendant la cadence. Sans nom, pas d'embarquement.",
      ),
    ).toBeInTheDocument();

    const embarques = screen.getByRole("region", { name: "embarqués" });
    expect(embarques).toHaveTextContent("21/40");
    expect(embarques).toHaveTextContent("15 nominatifs · 6 cadence complétés");
    expect(within(embarques).getByText("départ 05:30")).toBeInTheDocument();

    const liste = screen.getByRole("region", { name: "Billets de cadence encore sans nom" });
    expect(liste).toHaveTextContent("11");
    expect(liste).toHaveTextContent("0225 · siège 12 · 05:11 · cash");
    expect(liste).toHaveTextContent("0228 · siège 15 · 05:12 · MoMo · SMS envoyé");
    expect(liste).toHaveTextContent("0231 · siège 18 · 05:14 · cash");
    expect(within(liste).getAllByText("au scan")).toHaveLength(3);

    expect(
      screen.getByText(
        "Un billet de cadence jamais scanné ni complété au départ apparaît dans le rapport du soir comme « vendu, non embarqué, sans nom ». C'est ce que le patron et l'assistant surveillent.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Vue du quai" })).toBeInTheDocument();
    expect(boutonEmbarquer()).toHaveTextContent(
      "Embarquer · siège 19le billet devient nominatif · scan suivant",
    );
  });

  it("dessine la jauge : 38 % de nominatifs (vert) puis 15 % de cadence complétés (ambre)", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    const segments = [
      ...screen.getByRole("region", { name: "embarqués" }).querySelectorAll<HTMLElement>("[style]"),
    ];
    expect(segments.map((s) => s.style.width)).toEqual(["38%", "15%"]);
  });

  it("n'a aucun bouton grisé, aucun badge « touche » et nomme le bouton rond", async () => {
    rendreCadenceQuai({ conception: true });
    await attendreBillet();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.queryByText(/touche \d/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("démarre la caméra pour le scan suivant", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    await waitFor(() => expect(scanner.demarre).toBe(true));
  });
});

describe("CadenceQuai · compléter et embarquer", () => {
  it("envoie le nom, la pièce et le téléphone, embarque, et reste sur l'écran", async () => {
    const { routeur, ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await userEvent.clear(champTelephone());
    await userEvent.type(champTelephone(), "655121234");
    await userEvent.click(boutonEmbarquer());

    expect(await screen.findByText("Embarqué · Ngono Albertine")).toBeInTheDocument();
    const completion = ecritures.find((e) => e.type === "billet.complete");
    expect(completion?.donnees).toMatchObject({
      billetId: BILLET_0232,
      nom: "Ngono Albertine",
      pieceQuatreDerniers: "2210",
      telephone: "+237655121234",
      embarquer: true,
    });
    expect(completion?.donnees["departId"]).toBeTruthy();
    expect(routeur.state.location.pathname).toBe("/completer");
  });

  it("envoie le nom et la pièce corrigés par le convoyeur, téléphone laissé vide", async () => {
    const { ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await userEvent.clear(champNom());
    await userEvent.type(champNom(), "Mballa Rose");
    await userEvent.clear(champPiece());
    await userEvent.type(champPiece(), "8804");
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());

    await screen.findByText("Embarqué · Mballa Rose");
    expect(ecritures.find((e) => e.type === "billet.complete")?.donnees).toMatchObject({
      nom: "Mballa Rose",
      pieceQuatreDerniers: "8804",
      telephone: null,
    });
  });

  it("met à jour les compteurs, retire le formulaire et le bouton, et garde « Vue du quai »", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());
    await screen.findByText("Embarqué · Ngono Albertine");

    const embarques = screen.getByRole("region", { name: "embarqués" });
    await waitFor(() => expect(embarques).toHaveTextContent("22/40"));
    expect(embarques).toHaveTextContent("16 nominatifs · 7 cadence complétés");
    expect(screen.getByText("Le billet est nominatif. Scannez le billet suivant.")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Embarquer/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vue du quai" })).toBeInTheDocument();
  });

  it("sans nom, pas d'embarquement : alerte, champ marqué, rien n'est envoyé", async () => {
    const { ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await userEvent.clear(champNom());
    await userEvent.click(boutonEmbarquer());

    expect(await screen.findByRole("alert")).toHaveTextContent("Sans nom, pas d'embarquement.");
    expect(champNom()).toHaveAttribute("aria-invalid", "true");
    expect(champNom()).toHaveFocus();
    expect(ecritures.some((e) => e.type === "billet.complete")).toBe(false);
    expect(screen.queryByText(/Embarqué ·/)).not.toBeInTheDocument();
  });

  it("refuse une pièce de moins de 4 chiffres", async () => {
    const { ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await userEvent.clear(champPiece());
    await userEvent.type(champPiece(), "22");
    await userEvent.click(boutonEmbarquer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pièce : tapez les 4 derniers chiffres.",
    );
    expect(champPiece()).toHaveAttribute("aria-invalid", "true");
    expect(ecritures.some((e) => e.type === "billet.complete")).toBe(false);
  });

  it("ne garde que des chiffres dans la pièce", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    await userEvent.clear(champPiece());
    await userEvent.type(champPiece(), "a1b2c3d4");
    expect(champPiece()).toHaveValue("1234");
  });

  it("refuse le téléphone coupé de la planche (« 6 55 12 … ») sans rien envoyer", async () => {
    const { ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await userEvent.click(boutonEmbarquer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Téléphone : 9 chiffres, ou laissez le champ vide.",
    );
    expect(champTelephone()).toHaveAttribute("aria-invalid", "true");
    expect(ecritures.some((e) => e.type === "billet.complete")).toBe(false);
  });

  it("efface l'alerte dès qu'on corrige le champ et remet l'aide", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    await userEvent.clear(champNom());
    await userEvent.click(boutonEmbarquer());
    await screen.findByRole("alert");
    await userEvent.type(champNom(), "Ngono");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(champNom()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText(/Le nom est tapé une fois ici/)).toBeInTheDocument();
  });

  it("alerte et garde la saisie quand le billet n'a pas pu être complété", async () => {
    rendreCadenceQuai({ panne: "completion" });
    await attendreBillet();
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le billet n'a pas été complété. Réessayez.",
    );
    expect(champNom()).toHaveValue("Ngono Albertine");
    expect(boutonEmbarquer()).toBeEnabled();
    expect(screen.queryByText(/Embarqué ·/)).not.toBeInTheDocument();
  });

  it("dit quand le billet porte déjà un nom (409)", async () => {
    rendreCadenceQuai({ panne: "deja" });
    await attendreBillet();
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce billet porte déjà un nom.");
  });
});

describe("CadenceQuai · scan suivant", () => {
  it("scanne un autre billet sans nom : il remplace le billet de l'écran, avec sa saisie", async () => {
    const { ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await waitFor(() => expect(scanner.demarre).toBe(true));
    scanne(QR_0225);

    const scan = await screen.findByRole("status", {
      name: "Scanné · billet de cadence, sans nom",
    });
    await waitFor(() => expect(scan).toHaveTextContent("ALP-DLA-270105-0225"));
    expect(scan).toHaveTextContent("siège 12");
    expect(boutonEmbarquer()).toHaveTextContent("Embarquer · siège 12");
    expect(ecritures.find((e) => e.type === "quai.scanne")?.donnees).toMatchObject({
      qr: QR_0225,
    });
  });

  it("après « Embarquer », le billet suivant scanné se complète à son tour", async () => {
    const { ecritures } = rendreCadenceQuai();
    await attendreBillet();
    await waitFor(() => expect(scanner.demarre).toBe(true));
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());
    await screen.findByText("Embarqué · Ngono Albertine");

    scanne(QR_0225);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nom" })).toBeInTheDocument());
    expect(screen.queryByText(/Embarqué ·/)).not.toBeInTheDocument();
    expect(boutonEmbarquer()).toHaveTextContent("Embarquer · siège 12");

    await userEvent.clear(champNom());
    await userEvent.type(champNom(), "Fouda Marie");
    await userEvent.clear(champPiece());
    await userEvent.type(champPiece(), "5501");
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());
    await screen.findByText("Embarqué · Fouda Marie");
    const completions = ecritures.filter((e) => e.type === "billet.complete");
    expect(completions).toHaveLength(2);
    expect(completions[1]?.donnees).toMatchObject({
      billetId: "billet-alp-dla-270105-0225",
      nom: "Fouda Marie",
      pieceQuatreDerniers: "5501",
    });
  });

  it("montre « Dernier scan · OK · monte » pour un billet déjà nominatif, sans toucher à la saisie", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    await waitFor(() => expect(scanner.demarre).toBe(true));
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());
    await screen.findByText("Embarqué · Ngono Albertine");

    scanne(QR_0232);
    const carte = await screen.findByText("Dernier scan · OK · monte");
    expect(carte.closest("[role='status']")).toHaveTextContent("ALP-DLA-270105-0232");
  });

  it("refuse un QR inconnu, en alerte, et garde le billet à compléter", async () => {
    rendreCadenceQuai();
    await attendreBillet();
    await waitFor(() => expect(scanner.demarre).toBe(true));
    scanne("AM1:ALP-DLA-270105-9999:0000");

    expect(await screen.findByRole("alert")).toHaveTextContent("Refusé · billet introuvable");
    expect(champNom()).toHaveValue("Ngono Albertine");
    expect(boutonEmbarquer()).toBeEnabled();
  });

  it("prévient quand le scan n'a pas pu être envoyé, sans casser l'écran", async () => {
    rendreCadenceQuai({ panne: "scan" });
    await attendreBillet();
    await waitFor(() => expect(scanner.demarre).toBe(true));
    scanne(QR_0225);

    expect(await screen.findByRole("alert")).toHaveTextContent("Scan non envoyé");
    expect(screen.getByRole("alert")).toHaveTextContent("Vérifiez la connexion");
    expect(champNom()).toHaveValue("Ngono Albertine");
    expect(boutonEmbarquer()).toBeEnabled();
  });
});

describe("CadenceQuai · navigation", () => {
  it("« Retour » mène au billet de cadence (/guichet/cadence/vendu)", async () => {
    const { routeur } = rendreCadenceQuai();
    await attendreBillet();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/guichet/cadence/vendu");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/cadence/vendu"));
  });

  it("« Vue du quai » mène au Quai (/embarquement)", async () => {
    const { routeur } = rendreCadenceQuai();
    await attendreBillet();
    const lien = screen.getByRole("link", { name: "Vue du quai" });
    expect(lien).toHaveAttribute("href", "/embarquement");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/embarquement"));
  });

  it("« Embarquer » ne quitte pas l'écran", async () => {
    const { routeur } = rendreCadenceQuai();
    await attendreBillet();
    await viderTelephone();
    await userEvent.click(boutonEmbarquer());
    await screen.findByText("Embarqué · Ngono Albertine");
    expect(routeur.state.location.pathname).toBe("/completer");
  });
});

describe("CadenceQuai · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec le retour", async () => {
    rendreCadenceQuai({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement du billet de cadence" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      "/guichet/cadence/vendu",
    );
    await attendreBillet();
  });

  it("montre l'état vide quand aucun billet n'est scanné (404)", async () => {
    rendreCadenceQuai({ panne: "vide" });
    expect(await screen.findByText("Aucun billet de cadence à compléter")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreCadenceQuai({ panne: "erreur" });
    expect(await screen.findByText("Impossible de charger le billet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });
});
