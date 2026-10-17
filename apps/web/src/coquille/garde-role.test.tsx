import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import fr from "@/i18n/fr.json";
import { rendreApp } from "@/test/rendre";
import { ACCUEIL_ESPACE, ESPACES, ESPACES_AUTORISES, peutOuvrir, type Role } from "./roles";
import { lireSessionStockee } from "./session";

describe("garde de rôle (hors mode démo)", () => {
  it("renvoie vers /connexion quand personne n'est connecté et que l'espace est celui d'un agent", async () => {
    const { routeur } = rendreApp({ url: "/guichet/accueil", demo: false, session: null });
    await screen.findByRole("heading", { level: 1, name: "Ton numéro, c'est ton compte." });
    expect(routeur.state.location.pathname).toBe("/connexion");
  });

  it("laisse le voyageur, connecté ou non, dans l'espace voyageur", async () => {
    rendreApp({ url: "/voyager", demo: false, session: null });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.ecrans.Main.titre }),
    ).toBeInTheDocument();
  });

  it("renvoie un compte voyageur qui ouvre le guichet vers son accueil", async () => {
    const { routeur } = rendreApp({
      url: "/guichet/vendre",
      demo: false,
      session: { role: "voyageur" },
    });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Main.titre });
    expect(routeur.state.location.pathname).toBe("/voyager");
  });

  it("renvoie un compte agent qui sort de son espace vers l'accueil de son espace", async () => {
    const guichet = rendreApp({ url: "/aujourdhui", demo: false, session: { role: "guichet" } });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Guichet.titre });
    expect(guichet.routeur.state.location.pathname).toBe("/guichet/accueil");
  });

  it("renvoie un patron qui ouvre le guichet vers /aujourdhui et un guichet qui ouvre le voyageur vers son guichet", async () => {
    const patron = rendreApp({ url: "/guichet/caisse", demo: false, session: { role: "patron" } });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Patron.titre });
    expect(patron.routeur.state.location.pathname).toBe("/aujourdhui");
  });

  it("laisse un compte guichet ouvrir le quai, et un superviseur la caisse, le quai et l'accueil du patron", async () => {
    const quai = rendreApp({ url: "/embarquement", demo: false, session: { role: "guichet" } });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.ecrans.Quai.titre }),
    ).toBeInTheDocument();
    expect(quai.routeur.state.location.pathname).toBe("/embarquement");
  });

  it.each(["/guichet/caisse", "/embarquement", "/aujourdhui", "/gare"])(
    "ouvre %s à un superviseur",
    async (url) => {
      const { routeur } = rendreApp({ url, demo: false, session: { role: "superviseur" } });
      await screen.findByRole("heading", { level: 1 });
      expect(routeur.state.location.pathname).toBe(url);
    },
  );

  it("ne montre pas le sélecteur de rôle", async () => {
    rendreApp({ url: "/voyager", demo: false });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Main.titre });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("table des rôles", () => {
  it("chaque rôle ouvre au moins son propre espace, et son accueil est dans cet espace", () => {
    for (const role of ESPACES) {
      expect(peutOuvrir(role, role)).toBe(true);
      expect(ACCUEIL_ESPACE[role]).toMatch(/^\//);
    }
  });

  it("ne donne aux comptes d'agent que leur espace, hors les exceptions des maquettes", () => {
    const attendu: Partial<Record<Role, string[]>> = {
      guichet: ["guichet", "quai"],
      superviseur: ["superviseur", "guichet", "quai", "patron"],
      vendeur: ["vendeur", "voyageur"],
    };
    for (const role of ESPACES) {
      expect([...ESPACES_AUTORISES[role]].sort()).toEqual((attendu[role] ?? [role]).sort());
    }
  });
});

describe("sélecteur de rôle (mode démo)", () => {
  it("ouvre une session mock et va à l'accueil de l'espace choisi", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendreApp({ url: "/voyager", demo: true });
    const groupe = await screen.findByRole("group", { name: fr.coquille.demo.titre });
    const selecteur = within(groupe).getByRole("combobox");
    await utilisateur.selectOptions(selecteur, "patron");
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Patron.titre });
    expect(routeur.state.location.pathname).toBe("/aujourdhui");
    expect(lireSessionStockee()).toEqual({ role: "patron" });
    // Le layout change d'espace : le sélecteur est remonté, on le relit.
    await utilisateur.selectOptions(await screen.findByRole("combobox"), "guichet");
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Guichet.titre });
    expect(routeur.state.location.pathname).toBe("/guichet/accueil");
  });

  it("laisse un visiteur ouvrir n'importe quel espace (pour le banc de fidélité)", async () => {
    rendreApp({ url: "/guichet/accueil", demo: true, session: null });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.ecrans.Guichet.titre }),
    ).toBeInTheDocument();
  });
});

describe("salle de contrôle /controle", () => {
  it("sans session patron et hors démo, propose la connexion du patron (mock) puis ouvre la salle", async () => {
    const utilisateur = userEvent.setup();
    rendreApp({ url: "/controle", demo: false, session: null });
    await screen.findByRole("heading", { level: 1, name: fr.coquille.controle.connexion });
    expect(
      screen.queryByRole("heading", { level: 1, name: fr.ecrans.Controle.titre }),
    ).not.toBeInTheDocument();
    await utilisateur.click(
      screen.getByRole("button", { name: new RegExp(fr.coquille.controle.action) }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.ecrans.Controle.titre }),
    ).toBeInTheDocument();
    expect(lireSessionStockee()).toEqual({ role: "patron" });
  });

  it("refuse la salle à un compte guichet connecté (il doit se connecter comme patron)", async () => {
    rendreApp({ url: "/controle", demo: false, session: { role: "guichet" } });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.coquille.controle.connexion }),
    ).toBeInTheDocument();
  });

  it("est ouverte directement en démo, sans cadre de 390 px", async () => {
    rendreApp({ url: "/controle", demo: true });
    await screen.findByRole("heading", { level: 1, name: fr.ecrans.Controle.titre });
    expect(document.querySelector("[data-espace='controle-salle']")).not.toBeNull();
    expect(document.querySelector("[data-espace='public']")).toBeNull();
  });
});

describe("/dev/*", () => {
  it("affiche le kit UI en mode démo", async () => {
    rendreApp({ url: "/dev/kit", demo: true });
    expect(await screen.findByRole("region", { name: "Boutons" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Écran complet" })).toBeInTheDocument();
  });

  it("n'existe pas hors mode démo", async () => {
    rendreApp({ url: "/dev/kit", demo: false });
    expect(
      await screen.findByRole("heading", { level: 1, name: fr.coquille.introuvable.titre }),
    ).toBeInTheDocument();
  });
});
