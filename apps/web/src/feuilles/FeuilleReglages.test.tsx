import { ErreurReseau } from "@afrimove/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CLES } from "@/coquille/stockage";
import { PROFIL, avecPanne, clientMoi, rendreAppMoi } from "@/ecrans/Moi/test-outils";
import { rendreApp } from "@/test/rendre";
import { lireAlertes } from "./alertes";

/** Ouvre la feuille depuis l'écran Moi : l'icône roue de l'en-tête. */
async function ouvrirReglages() {
  await screen.findByText("Aïcha Ngo");
  await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
  return screen.findByRole("dialog", { name: "Réglages" });
}

describe("Feuille « Réglages » · depuis Moi", () => {
  it("l'icône roue ouvre la feuille avec le profil, la langue et les alertes", async () => {
    rendreAppMoi();
    await screen.findByText("Aïcha Ngo");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const feuille = await ouvrirReglages();

    expect(within(feuille).getByText("Mon compte et ce téléphone")).toBeVisible();
    expect(await within(feuille).findByText("Aïcha Ngo")).toBeVisible();
    expect(within(feuille).getByText("+237 6 91 22 10 08")).toBeVisible();

    const langues = within(feuille).getByRole("group", { name: "Langue de l'application" });
    expect(
      within(langues)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Français", "English", "Pidgin"]);
    expect(within(langues).getByRole("button", { name: "Français" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(within(feuille).getByRole("switch", { name: "Mon bus part ou arrive" })).toBeChecked();
    expect(within(feuille).getByRole("switch", { name: "Mon colis avance" })).toBeChecked();
    expect(within(feuille).getByRole("button", { name: "Terminé" })).toBeEnabled();
    // Style v3 : aucun emoji.
    expect(feuille.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("ne propose pas « Se déconnecter » sans session", async () => {
    rendreAppMoi();
    const feuille = await ouvrirReglages();
    expect(within(feuille).queryByRole("button", { name: "Se déconnecter" })).toBeNull();
  });

  it("se ferme avec Terminé, la croix, Échap et le voile, puis se rouvre", async () => {
    rendreAppMoi();
    await ouvrirReglages();

    await userEvent.click(screen.getByRole("button", { name: "Terminé" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
    await userEvent.click(await screen.findByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
    await screen.findByRole("dialog", { name: "Réglages" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
    await userEvent.click(await screen.findByTestId("voile"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("change la langue de l'application, la mémorise et marque le choix", async () => {
    rendreAppMoi();
    const feuille = await ouvrirReglages();
    await userEvent.click(within(feuille).getByRole("button", { name: "Pidgin" }));

    await waitFor(() => expect(localStorage.getItem(CLES.langue)).toBe("pcm"));
    expect(document.documentElement.lang).toBe("pcm");
    expect(within(feuille).getByRole("button", { name: "Pidgin" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(feuille).getByRole("button", { name: "Français" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("garde le choix des alertes sur l'appareil, à la réouverture comme au rechargement", async () => {
    rendreAppMoi();
    const feuille = await ouvrirReglages();
    await userEvent.click(within(feuille).getByRole("switch", { name: "Mon colis avance" }));

    expect(within(feuille).getByRole("switch", { name: "Mon colis avance" })).not.toBeChecked();
    expect(within(feuille).getByRole("switch", { name: "Mon bus part ou arrive" })).toBeChecked();
    expect(lireAlertes()).toEqual({ voyage: true, colis: false });

    await userEvent.click(within(feuille).getByRole("button", { name: "Terminé" }));
    await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
    const rouverte = await screen.findByRole("dialog", { name: "Réglages" });
    expect(within(rouverte).getByRole("switch", { name: "Mon colis avance" })).not.toBeChecked();
    expect(within(rouverte).getByRole("switch", { name: "Mon bus part ou arrive" })).toBeChecked();
  });

  it("annonce un profil indisponible, laisse régler la langue et recharge à la demande", async () => {
    const { source, appels } = avecPanne(PROFIL.nom, (n) =>
      // La 2e panne est celle de la relecture que fait la feuille en s'ouvrant.
      n <= 2 ? new ErreurReseau() : undefined,
    );
    rendreAppMoi({ client: clientMoi(source) });
    await screen.findByText("Profil indisponible");
    await userEvent.click(screen.getByRole("button", { name: "Réglages" }));
    const feuille = await screen.findByRole("dialog", { name: "Réglages" });

    const alerte = await within(feuille).findByRole("alert");
    expect(alerte).toHaveTextContent("Profil indisponible");
    expect(within(feuille).getByRole("button", { name: "English" })).toBeEnabled();

    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await within(feuille).findByText("Aïcha Ngo")).toBeVisible();
    expect(appels()).toBe(3);
    expect(within(feuille).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Feuille « Réglages » · avec un compte connecté", () => {
  it("« Se déconnecter » ferme la session et mène à la connexion", async () => {
    localStorage.setItem(CLES.session, JSON.stringify({ role: "voyageur" }));
    const { routeur } = rendreApp({
      url: "/moi",
      clientApi: clientMoi(),
      scenario: "Moi",
      session: { role: "voyageur" },
    });
    const feuille = await ouvrirReglages();
    await userEvent.click(within(feuille).getByRole("button", { name: "Se déconnecter" }));

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/connexion"));
    expect(localStorage.getItem(CLES.session)).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
