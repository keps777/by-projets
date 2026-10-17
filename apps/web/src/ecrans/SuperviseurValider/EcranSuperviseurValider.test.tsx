import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import {
  panne,
  refusPin,
  rendreValider,
  SESSION_DEMO,
  type OptionsRenduValider,
} from "./rendre-valider";

const CLE_BLOCAGE = "afrimove.pin.bloque.pers-essono";

/** Attend que la clôture soit affichée (le titre est déjà là pendant le chargement). */
async function attendreCloture() {
  await screen.findByText("Tolérance de l'agence");
}

const lienValider = () => screen.getByRole("link", { name: /^Valider · écart − 1 000/ });
const lienRefuser = () => screen.getByRole("link", { name: "Refuser · recompter" });
const champCommentaire = () =>
  screen.getByRole("textbox", { name: "Commentaire du superviseur (visible par le patron)" });

/** Tape un PIN sur le clavier du kit et attend que la clé de signature soit prête. */
async function taperPin(pin: string) {
  const clavier = screen.getByRole("group", { name: "Clavier PIN" });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

async function pinSaisi(pin = "246813") {
  await taperPin(pin);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "PIN saisi. Tu peux valider ou refuser.",
  );
}

/** Rend l'écran puis attend la clôture. */
async function ouvrir(options?: OptionsRenduValider) {
  const rendu = rendreValider(options);
  await attendreCloture();
  return rendu;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SuperviseurValider · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, guichet, agent, numéro de session, heure de clôture et badge PIN", async () => {
    await ouvrir();
    expect(
      screen.getByRole("heading", { level: 1, name: "Valider la clôture" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Guichet 2 · Joseph M. · K-DLA-270105-2-1 · 13:58"),
    ).toBeInTheDocument();
    expect(screen.getByText("PIN")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
  });

  it("affiche attendu, compté et écart, l'écart en ambre dans la tolérance", async () => {
    await ouvrir();
    const bilan = screen.getByRole("group", { name: "Bilan de la caisse" });
    expect(within(bilan).getByText("Attendu").nextElementSibling).toHaveTextContent("695 500");
    expect(within(bilan).getByText("Compté").nextElementSibling).toHaveTextContent("694 500");
    const ecart = within(bilan).getByText("Écart");
    expect(ecart.nextElementSibling).toHaveTextContent("− 1 000");
    expect(ecart.parentElement).toHaveAttribute("data-ton", "ambre");
  });

  it("affiche le détail de la session, la tolérance, l'historique de l'agent et les billets de cadence", async () => {
    await ouvrir();
    expect(
      screen.getByText("184 billets cash · 41 colis · 2 annulations validées"),
    ).toBeInTheDocument();
    expect(screen.getByText("05:02 → 13:58")).toBeInTheDocument();
    expect(screen.getByText("Tolérance de l'agence").nextElementSibling).toHaveTextContent(
      "1 000 · dans la limite",
    );
    expect(screen.getByText("dans la limite")).toHaveAttribute("data-ton", "vert");
    expect(screen.getByText("Joseph · 10 derniers jours").nextElementSibling).toHaveTextContent(
      "3 écarts négatifs · − 4 500",
    );
    expect(
      screen.getByText("Billets de cadence sans numéro aujourd'hui").nextElementSibling,
    ).toHaveTextContent("11");
  });

  it("propose le commentaire du superviseur, modifiable", async () => {
    await ouvrir();
    expect(champCommentaire()).toHaveValue(
      "Recompté avec Joseph, écart confirmé, retenu sur sa prime",
    );
    await userEvent.clear(champCommentaire());
    await userEvent.type(champCommentaire(), "Recompté");
    expect(champCommentaire()).toHaveValue("Recompté");
  });

  it("affiche le clavier PIN de six chiffres avec sa règle des essais", async () => {
    await ouvrir();
    expect(screen.getByText("Mon PIN · Mme Essono")).toBeInTheDocument();
    expect(screen.getByText("6 chiffres · jamais partagé")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0 chiffres saisis sur 6" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "3 essais, puis blocage 15 min et alerte au patron. Le PIN valide, horodaté et signé, part dans le rapport de 21 h.",
      ),
    ).toBeInTheDocument();
    for (const chiffre of "0123456789") {
      expect(screen.getByRole("button", { name: chiffre })).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Effacer" })).toBeEnabled();
  });

  it("affiche les deux actions du pied avec les textes de la planche", async () => {
    await ouvrir();
    expect(lienRefuser()).toHaveAttribute("href", "/guichet/caisse");
    expect(lienValider()).toHaveAttribute("href", "/rapport");
    expect(lienValider()).toHaveTextContent("signé Essono · caisse fermée");
  });

  it("n'ajoute ni « touche n » ni bouton grisé, même avec le flag conception", async () => {
    await ouvrir({ conception: true });
    expect(lienValider()).not.toHaveTextContent(/touche/);
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
  });

  it("n'a pas de touche d'empreinte quand le navigateur ne la propose pas", async () => {
    await ouvrir();
    expect(
      screen.queryByRole("button", { name: "Utiliser mon empreinte" }),
    ).not.toBeInTheDocument();
  });

  it("les icônes SVG sont décoratives et aucun emoji n'est affiché", async () => {
    await ouvrir();
    for (const svg of document.querySelectorAll("main svg, header svg, a svg, button svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("SuperviseurValider · navigation", () => {
  it("« Retour » mène au Superviseur (/gare)", async () => {
    const { routeur } = await ouvrir();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
  });

  it("« Valider » sans PIN reste sur l'écran et demande le PIN, sans rien envoyer", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");
    expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_DEMO}`);
    expect(recus).toHaveLength(0);
  });

  it("« Refuser » sans PIN reste sur l'écran et demande le PIN, sans rien envoyer", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienRefuser());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");
    expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_DEMO}`);
    expect(recus).toHaveLength(0);
  });
});

describe("SuperviseurValider · valider avec le PIN", () => {
  it("envoie la validation signée de l'écart, puis mène au Rapport du soir (/rapport)", async () => {
    const { routeur, recus } = await ouvrir();
    await pinSaisi();
    await userEvent.click(lienValider());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/rapport"));
    expect(recus).toHaveLength(1);
    const [evenement] = recus;
    expect(evenement?.type).toBe("caisse.validee");
    expect(evenement?.donnees).toMatchObject({
      sessionId: SESSION_DEMO,
      ecart: -1000,
      commentaire: "Recompté avec Joseph, écart confirmé, retenu sur sa prime",
      validePar: { superviseurId: "pers-essono", methode: "pin" },
    });
    expect(evenement?.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("n'envoie jamais le PIN : ni dans l'événement, ni dans la page", async () => {
    const { recus } = await ouvrir();
    await pinSaisi("135792");
    await userEvent.click(lienValider());
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(JSON.stringify(recus)).not.toContain("135792");
    expect(document.body.innerHTML).not.toContain("135792");
  });

  it("envoie le commentaire modifié, et null s'il est vide", async () => {
    const premier = await ouvrir();
    await pinSaisi();
    await userEvent.clear(champCommentaire());
    await userEvent.type(champCommentaire(), "Écart confirmé");
    await userEvent.click(lienValider());
    await waitFor(() => expect(premier.recus).toHaveLength(1));
    expect(premier.recus[0]?.donnees.commentaire).toBe("Écart confirmé");
    cleanup();

    const second = await ouvrir();
    await pinSaisi();
    await userEvent.clear(champCommentaire());
    await userEvent.click(lienValider());
    await waitFor(() => expect(second.recus).toHaveLength(1));
    expect(second.recus[0]?.donnees.commentaire).toBeNull();
  });

  it("la signature couvre la décision : un autre commentaire ou un autre PIN la change", async () => {
    const signatures: string[] = [];
    for (const [pin, commentaire] of [
      ["246813", "A"],
      ["246813", "B"],
      ["246814", "A"],
      ["246813", "A"],
    ] as const) {
      const { recus } = await ouvrir();
      await pinSaisi(pin);
      await userEvent.clear(champCommentaire());
      await userEvent.type(champCommentaire(), commentaire);
      await userEvent.click(lienValider());
      await waitFor(() => expect(recus).toHaveLength(1));
      signatures.push(recus[0]!.donnees.validePar.signature);
      cleanup();
    }
    expect(new Set(signatures.slice(0, 3)).size).toBe(3);
    // Même PIN, même contenu : même signature (elle se vérifie).
    expect(signatures[3]).toBe(signatures[0]);
  });

  it("n'envoie rien deux fois si on touche Valider plusieurs fois de suite", async () => {
    const { recus } = await ouvrir({ latenceMs: 50 });
    await pinSaisi();
    await userEvent.dblClick(lienValider());
    await waitFor(() => expect(recus.length).toBeGreaterThan(0));
    await new Promise((fin) => setTimeout(fin, 150));
    expect(recus).toHaveLength(1);
  });
});

describe("SuperviseurValider · refuser et recompter", () => {
  it("envoie le refus signé avec le commentaire, puis mène à la Caisse (/guichet/caisse)", async () => {
    const { routeur, recus } = await ouvrir();
    await pinSaisi();
    await userEvent.click(lienRefuser());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/caisse"));
    expect(recus).toHaveLength(1);
    expect(recus[0]?.type).toBe("caisse.refusee");
    expect(recus[0]?.donnees).toMatchObject({
      sessionId: SESSION_DEMO,
      motif: "Recompté avec Joseph, écart confirmé, retenu sur sa prime",
      validePar: { superviseurId: "pers-essono", methode: "pin" },
    });
    expect(recus[0]?.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("SuperviseurValider · PIN refusé par le serveur : 3 essais, puis blocage 15 min", () => {
  it("compte les essais, bloque le clavier au troisième et s'en souvient", async () => {
    const { routeur, recus } = await ouvrir({ reponseDecision: () => refusPin() });

    await pinSaisi("111111");
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");

    // Le PIN refusé est oublié : il faut le retaper.
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");

    await pinSaisi("222222");
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 1 essai restant.");

    await pinSaisi("333333");
    await userEvent.click(lienValider());
    expect(
      await screen.findByText(/Trop d'essais\. Clavier bloqué pendant 15 min\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Réouverture dans/)).toBeInTheDocument();
    for (const chiffre of "0123456789") {
      expect(screen.getByRole("button", { name: chiffre })).toBeDisabled();
    }
    expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_DEMO}`);
    expect(recus).toHaveLength(3);

    // Le blocage tient aussi pour les boutons du pied, sans nouvel envoi.
    await userEvent.click(lienValider());
    expect(await screen.findByText("Clavier bloqué : attends sa réouverture.")).toBeInTheDocument();
    expect(recus).toHaveLength(3);

    // Il survit à un rechargement de l'écran.
    const jusqua = Number(localStorage.getItem(CLE_BLOCAGE));
    expect(jusqua).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(jusqua).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    cleanup();
    await ouvrir();
    expect(screen.getByRole("button", { name: "5" })).toBeDisabled();
    expect(screen.getByText(/Trop d'essais/)).toBeInTheDocument();
  });

  it("un blocage échu ne bloque plus", async () => {
    localStorage.setItem(CLE_BLOCAGE, String(Date.now() - 1000));
    await ouvrir();
    expect(screen.getByRole("button", { name: "5" })).toBeEnabled();
  });

  it("un compte bloqué par le serveur (423) bloque tout de suite le clavier", async () => {
    const { routeur } = await ouvrir({
      reponseDecision: () => Object.assign(refusPin(), { statut: 423, code: "PIN_BLOQUE" }),
    });
    await pinSaisi();
    await userEvent.click(lienValider());
    expect(await screen.findByText(/Trop d'essais/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_DEMO}`);
  });

  it("un PIN accepté après une erreur mène au rapport", async () => {
    const { routeur, recus } = await ouvrir({
      reponseDecision: (numero) => (numero === 1 ? refusPin() : undefined),
    });
    await pinSaisi("111111");
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent("2 essais restants");
    await pinSaisi("246813");
    await userEvent.click(lienValider());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/rapport"));
    expect(recus).toHaveLength(2);
  });

  it("une panne du serveur ne compte pas comme un essai raté", async () => {
    const { routeur } = await ouvrir({
      reponseDecision: (numero) => (numero === 1 ? panne() : numero === 2 ? refusPin() : undefined),
    });
    await pinSaisi();
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La décision n'a pas été envoyée. Réessaie.",
    );
    expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_DEMO}`);

    // Le PIN saisi reste valable : on peut réessayer sans le retaper.
    await userEvent.click(lienValider());
    // Ce deuxième envoi est un refus de PIN : il reste bien 2 essais (la panne n'en a pas pris un).
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");
  });

  it("signale une clôture déjà décidée (409)", async () => {
    await ouvrir({
      reponseDecision: () => Object.assign(panne(), { statut: 409, code: "TRANSITION_INTERDITE" }),
    });
    await pinSaisi();
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cette clôture a déjà reçu une décision.",
    );
  });
});

describe("SuperviseurValider · empreinte", () => {
  function simulerEmpreinte(reponse: unknown) {
    vi.stubGlobal(
      "PublicKeyCredential",
      Object.assign(function PublicKeyCredential() {}, {
        isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
      }),
    );
    const get = vi.fn().mockResolvedValue(reponse);
    Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
    return get;
  }

  it("signe la décision avec l'empreinte quand l'appareil la propose", async () => {
    const get = simulerEmpreinte({ rawId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer });
    const { routeur, recus } = await ouvrir();
    await userEvent.click(await screen.findByRole("button", { name: "Utiliser mon empreinte" }));
    expect(await screen.findByRole("status")).toHaveTextContent("PIN saisi");
    expect(get).toHaveBeenCalledTimes(1);

    await userEvent.click(lienValider());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/rapport"));
    expect(recus[0]?.donnees.validePar).toMatchObject({
      superviseurId: "pers-essono",
      methode: "empreinte",
    });
    expect(recus[0]?.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("une empreinte refusée ne donne aucune preuve", async () => {
    simulerEmpreinte(null);
    const { recus } = await ouvrir();
    await userEvent.click(await screen.findByRole("button", { name: "Utiliser mon empreinte" }));
    await userEvent.click(lienValider());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");
    expect(recus).toHaveLength(0);
  });
});

describe("SuperviseurValider · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête et le retour", async () => {
    rendreValider({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement de la clôture" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Valider la clôture" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
    await attendreCloture();
    expect(
      screen.queryByRole("status", { name: "Chargement de la clôture" }),
    ).not.toBeInTheDocument();
  });

  it("montre l'état vide pour une session inconnue (404)", async () => {
    rendreValider({ url: "/cloture/session-inconnue" });
    expect(await screen.findByText("Aucune clôture à valider")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Clavier PIN" })).not.toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreValider({ lecture: "erreur" });
    expect(await screen.findByText("Impossible de charger la clôture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });
});

describe("SuperviseurValider · textes", () => {
  function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
    return Object.entries(objet).flatMap(([k, v]) =>
      typeof v === "object" && v !== null
        ? cles(v as Record<string, unknown>, `${prefixe}${k}.`)
        : [`${prefixe}${k}`],
    );
  }

  it("l'anglais et le pidgin ont exactement les clés du français", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
