import { ErreurReseau } from "@afrimove/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apercuDeLaPlanche, avecApercu, clientUssd, rendreUssd } from "./test-outils";

/** Attend que l'aperçu soit affiché (le titre est déjà là pendant le chargement). */
async function attendreApercu() {
  await screen.findByRole("log", { name: "Conversation WhatsApp : achat d'un billet" });
}

/** Le texte de l'afficheur USSD, tel que le lit un lecteur d'écran (libellé de l'image). */
function afficheur(): string {
  const image = screen.getByRole("img", { name: /^Écran USSD simulé/ });
  return image.textContent ?? "";
}

/** Les bulles de la conversation, dans l'ordre. */
function bulles(): HTMLElement[] {
  const conversation = screen.getByRole("log");
  return within(conversation).getAllByRole("group");
}

const TEXTE_USSD = `AfriMove
1 Billet
2 Mon billet
3 Colis
4 Suivre bus
5 Proche
0 Aide

Repondre: 1
--------
Douala>Yaounde
1 08:00 Beta VIP 7500
2 08:30 Alpha 4000
3 09:30 Omega 3800
Place: 2
Payer MoMo? 1=oui`;

describe("USSD · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, titre et sous-titre de la planche", async () => {
    rendreUssd();
    await attendreApercu();
    expect(screen.getByRole("heading", { level: 1, name: "Sans internet" })).toBeInTheDocument();
    expect(screen.getByText("Le même service sur un téléphone à touches")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("montre le menu USSD et l'achat en trois réponses, mot pour mot, avec la ligne vide avant la réponse", async () => {
    rendreUssd();
    await attendreApercu();
    expect(screen.getByText("USSD · tape *123#")).toBeInTheDocument();
    expect(afficheur()).toContain(TEXTE_USSD);
    expect(
      screen.getByText(
        "3 réponses = un billet. Le SMS arrive avec le code à 4 chiffres. Même règles, mêmes prix, zéro frais en plus.",
      ),
    ).toBeInTheDocument();
  });

  it("dessine le clavier 1 à 6, *, 0, #", async () => {
    rendreUssd();
    await attendreApercu();
    const clavier = screen.getByRole("img", { name: /^Écran USSD simulé/ }).nextElementSibling;
    const touches = Array.from(clavier?.children ?? []);
    expect(touches.map((t) => t.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "*",
      "0",
      "#",
    ]);
  });

  it("montre la conversation WhatsApp : cinq messages, côté voyageur à droite, côté AfriMove à gauche", async () => {
    rendreUssd();
    await attendreApercu();
    expect(screen.getByText("WhatsApp · écris « billet »")).toBeInTheDocument();
    const messages = bulles();
    expect(messages).toHaveLength(5);
    expect(messages.map((m) => m.getAttribute("aria-label"))).toEqual([
      "Message de Vous",
      "Message de AfriMove",
      "Message de Vous",
      "Message de AfriMove",
      "Message de AfriMove",
    ]);
    expect(messages[0]).toHaveTextContent("Billet Douala Yaoundé demain matin");
    expect(messages[1]?.innerHTML).toContain("<br>");
    expect(messages[1]).toHaveTextContent(
      "3 départs demain :1 · 08:00 Bêta VIP 7 5002 · 08:30 Alpha 4 0003 · 09:30 Oméga 3 800Réponds 1, 2 ou 3.",
    );
    expect(messages[2]).toHaveTextContent(/^2$/);
    expect(messages[3]).toHaveTextContent(
      "Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?Oui · Changer de siège",
    );
    expect(messages[4]).toHaveTextContent(
      "✓ Payé. Billet ALP-DLA-270106-0031, code 5582. Bon voyage, Aïcha.",
    );
    expect(
      screen.getByText(
        "Vocal accepté : « je veux aller à Yaoundé demain ». Réponse en français, en anglais ou en pidgin.",
      ),
    ).toBeInTheDocument();
  });

  it("met « Oui » en gras et le message payé en confirmation, et rien d'autre", async () => {
    rendreUssd();
    await attendreApercu();
    const messages = bulles();
    const gras = messages.flatMap((m) => Array.from(m.querySelectorAll("strong")));
    expect(gras.map((g) => g.textContent)).toEqual(["Oui"]);
    expect(messages[4]?.querySelector("span > span")).toHaveTextContent("✓ Payé.");
  });

  it("n'a ni badge de touche sans le flag conception, ni bouton grisé, ni emoji", async () => {
    rendreUssd();
    await attendreApercu();
    expect(screen.queryByText(/^TOUCHE/)).not.toBeInTheDocument();
    for (const bouton of screen.queryAllByRole("button")) expect(bouton).toBeEnabled();
    const emoji = /\p{Extended_Pictographic}/u;
    expect(document.querySelector("main")?.textContent ?? "").not.toMatch(emoji);
  });
});

describe("USSD · navigation", () => {
  it("expose les trois liens de la planche vers les bonnes routes", async () => {
    rendreUssd();
    await attendreApercu();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
    expect(screen.getByRole("link", { name: "Voir le billet reçu" })).toHaveAttribute(
      "href",
      "/billet/ALP-DLA-270106-0031",
    );
    expect(screen.getByRole("link", { name: "Acheter pour quelqu'un" })).toHaveAttribute(
      "href",
      "/proche",
    );
  });

  it("« Retour » ouvre l'accueil voyageur", async () => {
    const { routeur } = rendreUssd();
    await attendreApercu();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it("« Voir le billet reçu » ouvre le billet annoncé par la conversation", async () => {
    const { routeur } = rendreUssd();
    await attendreApercu();
    await userEvent.click(screen.getByRole("link", { name: "Voir le billet reçu" }));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/billet/ALP-DLA-270106-0031"),
    );
  });

  it("« Acheter pour quelqu'un » ouvre l'achat pour un proche", async () => {
    const { routeur } = rendreUssd();
    await attendreApercu();
    await userEvent.click(screen.getByRole("link", { name: "Acheter pour quelqu'un" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/proche"));
  });
});

describe("USSD · données de l'API", () => {
  it("affiche ce que le serveur renvoie, pas un texte figé : code, mot-clé, menu, messages, légendes", async () => {
    const apercu = await apercuDeLaPlanche();
    const { source } = avecApercu(() => ({
      ussd: {
        code: "*456#",
        lignes: ["Menu test", "1 Un", "Repondre: 1", "Fin"],
        touches: apercu.ussd.touches,
        note: "Note du serveur.",
      },
      whatsapp: {
        motCle: "ticket",
        echanges: [
          { de: "voyageur", lignes: ["ticket"] },
          {
            de: "afrimove",
            lignes: ["Veux-tu payer ?", "Oui · Non", "Billet BEX-YDE-270107-0142 prêt"],
          },
        ],
        vocal: "Vocal du serveur.",
      },
    }));
    rendreUssd({ client: clientUssd(source) });
    await attendreApercu();
    expect(screen.getByText("USSD · tape *456#")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp · écris « ticket »")).toBeInTheDocument();
    expect(afficheur()).toContain("Menu test\n1 Un\n\nRepondre: 1\nFin");
    expect(screen.getByText("Note du serveur.")).toBeInTheDocument();
    expect(screen.getByText("Vocal du serveur.")).toBeInTheDocument();
    expect(bulles()).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Voir le billet reçu" })).toHaveAttribute(
      "href",
      "/billet/BEX-YDE-270107-0142",
    );
  });

  it("sans numéro de billet dans la conversation, le lien mène quand même à un billet (celui de démonstration)", async () => {
    const apercu = await apercuDeLaPlanche();
    const { source } = avecApercu(() => ({
      ...apercu,
      whatsapp: { ...apercu.whatsapp, echanges: [{ de: "voyageur", lignes: ["billet"] }] },
    }));
    rendreUssd({ client: clientUssd(source) });
    await attendreApercu();
    expect(screen.getByRole("link", { name: "Voir le billet reçu" })).toHaveAttribute(
      "href",
      "/billet/BEX-DLA-270105-0142",
    );
  });
});

describe("USSD · états chargement, vide et erreur", () => {
  it("chargement : en-tête, deux colonnes grises annoncées aux lecteurs d'écran, pas de lien d'action", async () => {
    let liberer: () => void = () => {};
    const attente = new Promise<void>((resolve) => (liberer = resolve));
    const apercu = await apercuDeLaPlanche();
    const { source } = avecApercu(() => apercu);
    const client = clientUssd({
      ...source,
      charger: async (nom) => {
        await attente;
        return source.charger(nom);
      },
    });
    rendreUssd({ client });
    expect(
      await screen.findByRole("status", { name: "Chargement de l'aperçu sans internet" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Sans internet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir le billet reçu" })).not.toBeInTheDocument();
    liberer();
    await attendreApercu();
    expect(screen.queryByRole("status", { name: /Chargement/ })).not.toBeInTheDocument();
  });

  it("vide : explique qu'il n'y a rien à montrer, avec le retour", async () => {
    const apercu = await apercuDeLaPlanche();
    const { source } = avecApercu(() => ({
      ussd: { ...apercu.ussd, lignes: [] },
      whatsapp: { ...apercu.whatsapp, echanges: [] },
    }));
    rendreUssd({ client: clientUssd(source) });
    expect(await screen.findByText("Rien à montrer pour l'instant")).toBeInTheDocument();
    expect(screen.getByText("L'aperçu USSD et WhatsApp n'est pas disponible.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("erreur : message d'alerte et « Réessayer » qui relit l'aperçu", async () => {
    const apercu = await apercuDeLaPlanche();
    const { source, appels } = avecApercu((appel) => {
      if (appel === 1) throw new ErreurReseau("Réseau coupé");
      return apercu;
    });
    rendreUssd({ client: clientUssd(source) });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("L'aperçu ne s'est pas chargé");
    expect(alerte).toHaveTextContent("Vérifie ta connexion, puis réessaie.");
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreApercu();
    expect(appels()).toBe(2);
    expect(afficheur()).toContain(TEXTE_USSD);
  });
});

describe("USSD · textes", () => {
  it("s'affiche en anglais, sans clé brute", async () => {
    rendreUssd({ langue: "en" });
    await screen.findByRole("log", { name: "WhatsApp conversation: buying a ticket" });
    expect(screen.getByRole("heading", { level: 1, name: "Without internet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the ticket received" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/actions\.|whatsapp\.|ussd\.|etats\./);
  });

  it("s'affiche en pidgin, sans clé brute", async () => {
    rendreUssd({ langue: "pcm" });
    await screen.findByRole("log", { name: "WhatsApp conversation: how to buy ticket" });
    expect(screen.getByRole("link", { name: "See di ticket wey you receive" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/actions\.|whatsapp\.|ussd\.|etats\./);
  });
});
