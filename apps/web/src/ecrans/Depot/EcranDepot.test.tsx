import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reinitialiserServiceParDefaut } from "@/impression/service";
import { rendreApp } from "@/test/rendre";
import { clientDepot } from "./test-outils";

// Le premier rendu charge les scénarios des planches : sous charge (suite complète) il peut dépasser 5 s.
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5000 });

const URL_DEPOT = "/guichet/depot?scenario=Depot";

beforeEach(() => {
  // Imprimante simulée, comme `?imprimante=factice` : le service partagé la lit dans l'adresse de la page.
  window.history.pushState({}, "", "/?imprimante=factice");
});

afterEach(() => {
  reinitialiserServiceParDefaut();
  window.history.pushState({}, "", "/");
});

async function attendreFiche() {
  await screen.findByText("Trouvé · payé 2 200 F dans l'app");
}

function ouvrir(options: { client?: ReturnType<typeof clientDepot>["client"] } = {}) {
  return rendreApp({
    url: URL_DEPOT,
    scenario: "Depot",
    ...(options.client ? { clientApi: options.client } : { fixtures: true }),
  });
}

/** Prend la photo au dépôt (le champ fichier caché que « Photo au dépôt » ouvre). */
function prendrePhoto() {
  const champ = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(champ, {
    target: { files: [new File(["x"], "colis.jpg", { type: "image/jpeg" })] },
  });
}

const accepter = () => screen.getByRole("link", { name: "Accepter · imprimer l'étiquette" });

describe("Depot · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête, le code lu, la fiche trouvée, les deux vérifications, la note et le bouton", async () => {
    ouvrir();
    await attendreFiche();

    expect(screen.getByRole("heading", { level: 1, name: "Dépôt prépayé" })).toBeInTheDocument();
    expect(screen.getByText("Le client a payé dans l'app · scanner son code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toHaveAttribute(
      "href",
      "/guichet/accueil",
    );

    expect(screen.getByText("ou le code")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Code du colis prépayé" })).toHaveValue(
      "C-ALP-DLA-270105-0017",
    );

    const fiche = screen.getByText("Trouvé · payé 2 200 F dans l'app").closest("section")!;
    expect(within(fiche).getByText("07:40")).toBeInTheDocument();
    expect(fiche).toHaveTextContent("DeNgo Aïcha · 6 91 22 10 08");
    expect(fiche).toHaveTextContent("PourNgo Thérèse · Bafoussam gare");
    expect(fiche).toHaveTextContent("DéclaréMédicaments, vêtements · 2 kg · 25 000 F · assuré");
    expect(fiche).toHaveTextContent("Départ08:15 Alpha Bafoussam · soute 60 %");

    expect(
      screen.getByRole("button", { name: "Vérifier le poids 2,1 kg · conforme" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Photo au dépôt à prendre" })).toBeVisible();
    expect(
      screen.getByText(
        "Rien à encaisser. Si le poids dépasse de plus de 1 kg, l'app propose un complément à payer par MoMo au client.",
      ),
    ).toBeInTheDocument();
    expect(accepter()).toHaveAttribute("href", "/embarquement");
  });
});

describe("Depot · états sans fiche", () => {
  it("sans code lu : invite à scanner ou taper, sans casser la page", async () => {
    rendreApp({ url: "/guichet/depot", fixtures: true });
    expect(await screen.findByText("Aucun code lu")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Code du colis prépayé" })).toHaveValue("");
    expect(screen.getByText("Rien à encaisser.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vérifier le poids/ })).not.toBeInTheDocument();
  });

  it("un lien ?code= remplit le champ et cherche le colis", async () => {
    rendreApp({
      url: "/guichet/depot?code=C-ALP-DLA-270105-0017",
      scenario: "Depot",
      fixtures: true,
    });
    await attendreFiche();
  });

  it("code inconnu : message d'erreur dans le style nuit, champ signalé invalide", async () => {
    ouvrir();
    await attendreFiche();
    const champ = screen.getByRole("textbox", { name: "Code du colis prépayé" });
    await userEvent.clear(champ);
    await userEvent.type(champ, "C-ALP-DLA-270105-9999{Enter}");
    expect(await screen.findByText("Aucun colis prépayé pour ce code")).toBeInTheDocument();
    expect(champ).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Trouvé · payé 2 200 F dans l'app")).not.toBeInTheDocument();
  });

  it("cherche seul quand la frappe s'arrête, et accepte les minuscules", async () => {
    ouvrir();
    await attendreFiche();
    const champ = screen.getByRole("textbox", { name: "Code du colis prépayé" });
    await userEvent.clear(champ);
    await userEvent.type(champ, "c-alp-dla-270105-0017");
    await attendreFiche();
  });

  it("panne de chargement : message et bouton Réessayer", async () => {
    const { client } = clientDepot("erreur");
    ouvrir({ client });
    expect(
      await screen.findByText("Impossible de charger le colis", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});

describe("Depot · accepter le dépôt", () => {
  it("refuse tant que la photo n'est pas prise, sans rien enregistrer", async () => {
    const enregistreur = clientDepot();
    ouvrir({ client: enregistreur.client });
    await attendreFiche();
    await userEvent.click(accepter());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Prenez la photo du colis avant d'accepter.",
    );
    expect(enregistreur.depots).toHaveLength(0);
  });

  it("enregistre le dépôt (poids relevé, photo), imprime l'étiquette et ouvre le quai", async () => {
    const enregistreur = clientDepot();
    const { routeur } = ouvrir({ client: enregistreur.client });
    await attendreFiche();
    prendrePhoto();
    expect(screen.getByRole("button", { name: "Photo au dépôt prise ✓" })).toBeVisible();

    await userEvent.click(accepter());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/embarquement"));
    expect(enregistreur.depots).toHaveLength(1);
    expect(enregistreur.depots[0]).toMatchObject({ poidsReleveKg: 2.1, complement: 0 });
    expect(enregistreur.depots[0]?.photoRef).toContain("colis.jpg");
    expect(enregistreur.impressions).toEqual([
      expect.objectContaining({ document: "etiquette_colis", copies: 1, reimpression: false }),
    ]);
  });

  it("poids supérieur de plus de 1 kg : la feuille chiffre le complément MoMo, le dépôt le demande", async () => {
    const enregistreur = clientDepot();
    const { routeur } = ouvrir({ client: enregistreur.client });
    await attendreFiche();
    prendrePhoto();

    await userEvent.click(screen.getByRole("button", { name: /Vérifier le poids/ }));
    const champ = await screen.findByRole("textbox", { name: "Poids relevé (kg)" });
    await userEvent.clear(champ);
    await userEvent.type(champ, "3,5");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Plus de 1 kg au-dessus du déclaré : le client paie un complément de 1 150 F par MoMo.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Valider le poids" }));
    expect(
      await screen.findByRole("button", { name: "Vérifier le poids 3,5 kg · complément 1 150 F" }),
    ).toBeVisible();

    await userEvent.click(accepter());

    expect(
      await screen.findByText("Complément de 1 150 F demandé au client par MoMo."),
    ).toBeVisible();
    expect(enregistreur.depots[0]).toMatchObject({ poidsReleveKg: 3.5, complement: 1150 });
    // Le dépôt reste affiché : l'agent voit la demande, puis continue vers le quai.
    expect(routeur.state.location.pathname).toBe("/guichet/depot");
    await userEvent.click(screen.getByRole("link", { name: "Continuer vers le quai" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/embarquement"));
    expect(enregistreur.depots).toHaveLength(1);
  });

  it("un poids de 1 kg de plus reste conforme (le seuil est « plus de 1 kg »)", async () => {
    const enregistreur = clientDepot();
    ouvrir({ client: enregistreur.client });
    await attendreFiche();
    await userEvent.click(screen.getByRole("button", { name: /Vérifier le poids/ }));
    const champ = await screen.findByRole("textbox", { name: "Poids relevé (kg)" });
    await userEvent.clear(champ);
    await userEvent.type(champ, "3");
    expect(screen.getByRole("status")).toHaveTextContent("Conforme : 3 kg, écart +1 kg.");
  });

  it("refuse un poids illisible dans la feuille", async () => {
    ouvrir();
    await attendreFiche();
    await userEvent.click(screen.getByRole("button", { name: /Vérifier le poids/ }));
    const champ = await screen.findByRole("textbox", { name: "Poids relevé (kg)" });
    await userEvent.clear(champ);
    await userEvent.type(champ, "abc");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tapez le poids en kilos, par exemple 2,1.",
    );
    fireEvent.submit(champ.closest("form")!);
    expect(screen.getByRole("textbox", { name: "Poids relevé (kg)" })).toBeVisible();
  });

  it("imprimante absente : le dépôt est enregistré, l'étiquette attend, l'agent continue vers le quai", async () => {
    // Sans `?imprimante=factice`, jsdom n'a pas Web Bluetooth : l'étiquette part en file d'attente.
    window.history.pushState({}, "", "/");
    reinitialiserServiceParDefaut();
    const enregistreur = clientDepot();
    const { routeur } = ouvrir({ client: enregistreur.client });
    await attendreFiche();
    prendrePhoto();
    await userEvent.click(accepter());
    expect(
      await screen.findByText("L'étiquette sortira dès que l'imprimante sera prête."),
    ).toBeVisible();
    expect(enregistreur.depots).toHaveLength(1);
    await userEvent.click(screen.getByRole("link", { name: "Continuer vers le quai" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/embarquement"));
  });

  it("échec de l'enregistrement : message, pas de navigation, on peut réessayer", async () => {
    const enregistreur = clientDepot("depot");
    const { routeur } = ouvrir({ client: enregistreur.client });
    await attendreFiche();
    prendrePhoto();
    await userEvent.click(accepter());
    expect(await screen.findByText("Le dépôt n'a pas été enregistré. Réessayez.")).toBeVisible();
    expect(routeur.state.location.pathname).toBe("/guichet/depot");
    expect(accepter()).toBeVisible();
  });

  it("sans fiche, le bouton principal ramène sur le champ du code", async () => {
    rendreApp({ url: "/guichet/depot", fixtures: true });
    await screen.findByText("Aucun code lu");
    await userEvent.click(accepter());
    expect(screen.getByRole("textbox", { name: "Code du colis prépayé" })).toHaveFocus();
  });
});
