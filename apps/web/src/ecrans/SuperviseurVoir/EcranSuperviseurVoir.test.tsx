import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import styleCss from "./superviseur-voir.module.css?raw";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import {
  BILLET_DEMO,
  DEMANDE_DEMO,
  panne,
  refusPin,
  rendreVoir,
  type OptionsRenduVoir,
} from "./rendre-voir";

const CLE_BLOCAGE = "afrimove.pin.bloque.pers-essono";

/** Attend que la demande soit affichée (le titre est déjà là pendant le chargement). */
async function attendreDemande() {
  await screen.findByText("Ce que l'app a vérifié", { selector: "span" });
}

const lienAnnuler = () => screen.getByRole("link", { name: /^Annuler · rembourser 4 000/ });
const lienRefuser = () => screen.getByRole("link", { name: "Refuser" });
const choix = (nom: string) => screen.getByRole("button", { name: nom });

/** Tape un PIN sur le clavier du kit et attend que la clé de signature soit prête. */
async function taperPin(pin: string) {
  const clavier = screen.getByRole("group", { name: "Clavier PIN" });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

async function pinSaisi(pin = "246813") {
  await taperPin(pin);
  expect(await screen.findByRole("status")).toHaveTextContent("PIN saisi. Tu peux décider.");
}

/** Rend l'écran puis attend la demande. */
async function ouvrir(options?: OptionsRenduVoir) {
  const rendu = rendreVoir(options);
  await attendreDemande();
  return rendu;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SuperviseurVoir · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, guichet, agent, heure et ancienneté de la demande, badge PIN", async () => {
    await ouvrir();
    expect(
      screen.getByRole("heading", { level: 1, name: "Demande d'annulation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Guichet 1 · Marie T. · demandée à 13:51, il y a 11 min"),
    ).toBeInTheDocument();
    expect(screen.getByText("PIN")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
  });

  it("affiche le billet : numéro, montant, départ, voyageur, vente et motif", async () => {
    await ouvrir();
    expect(screen.getByText("ALP-DLA-270105-0171")).toBeInTheDocument();
    expect(screen.getByText("4 000", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Départ", { selector: "span" }).parentElement).toHaveTextContent(
      "Départ14:30 Yaoundé · siège 9",
    );
    expect(screen.getByText("Voyageur", { selector: "span" }).parentElement).toHaveTextContent(
      "VoyageurEssomba Rachel · CNI ···· 3309",
    );
    expect(screen.getByText("Vendu", { selector: "span" }).parentElement).toHaveTextContent(
      "Vendu09:12 · guichet 1 · cash · Marie T.",
    );
    expect(screen.getByText("Motif saisi", { selector: "span" }).parentElement).toHaveTextContent(
      "Motif saisi« Client parti, ne voyage plus »",
    );
  });

  it("affiche ce que l'app a vérifié : scan, délai, fréquence des annulations de l'agent, client présent", async () => {
    await ouvrir();
    const bloc = screen.getByRole("group", { name: "Ce que l'app a vérifié" });
    expect(within(bloc).getByText("pas encore scanné").parentElement).toHaveTextContent(
      "Billet pas encore scanné · le siège 9 est libérable",
    );
    expect(within(bloc).getByText("remboursement intégral").parentElement).toHaveTextContent(
      "Plus de 1 h avant le départ · remboursement intégral selon les règles de l'agence",
    );
    const frequence = within(bloc).getByText("annulation", { exact: false, selector: "strong" });
    expect(frequence).toHaveTextContent("2e annulation");
    expect(frequence.parentElement).toHaveTextContent(
      "2e annulation de Marie aujourd'hui · 5 sur les 10 derniers jours (moyenne des guichets : 2)",
    );
    expect(
      within(bloc).getByText(
        "Le client est présent au guichet · pièce vue · 4 000 F à lui rendre en cash",
      ),
    ).toBeInTheDocument();
  });

  it("propose les trois choix, « Rembourser » retenu", async () => {
    await ouvrir();
    expect(choix("Rembourser")).toHaveAttribute("aria-pressed", "true");
    expect(choix("Reporter à demain")).toHaveAttribute("aria-pressed", "false");
    expect(choix("Avoir 4 000")).toHaveAttribute("aria-pressed", "false");
  });

  it("affiche le clavier PIN de six chiffres, la règle de l'annulation et les deux actions du pied", async () => {
    await ouvrir();
    expect(screen.getByText("Mon PIN · Mme Essono")).toBeInTheDocument();
    expect(screen.getByText("Marie ne peut pas annuler seule")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0 chiffres saisis sur 6" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "L'annulation garde le numéro 0171, passe à l'état « annulé », n'est pas facturée par AfriMove et apparaît nominativement dans le rapport du soir.",
      ),
    ).toBeInTheDocument();
    for (const chiffre of "0123456789") {
      expect(screen.getByRole("button", { name: chiffre })).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Effacer" })).toBeEnabled();
    expect(lienRefuser()).toHaveAttribute("href", "/gare");
    expect(lienAnnuler()).toHaveAttribute("href", "/gare");
    expect(lienAnnuler()).toHaveTextContent("siège 9 libéré · signé Essono");
  });

  it("n'ajoute ni « touche n » ni bouton grisé, même avec le flag conception", async () => {
    await ouvrir({ conception: true });
    expect(lienAnnuler()).not.toHaveTextContent(/touche/);
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

  it("les cibles tactiles font au moins 44 px (choix, clavier du kit, pied)", () => {
    const hauteur = (selecteur: string) => {
      const bloc = new RegExp(`${selecteur}\\s*\\{[^}]*min-height:\\s*(\\d+)px`).exec(styleCss);
      return Number(bloc?.[1]);
    };
    expect(hauteur("\\.choisir")).toBeGreaterThanOrEqual(44);
    expect(hauteur("\\.refuser\\.refuser")).toBeGreaterThanOrEqual(44);
  });
});

describe("SuperviseurVoir · autres cas que la planche", () => {
  it("annulée avec retenue : le montant remboursé et le texte du délai suivent les règles de l'agence", async () => {
    const { recus } = await ouvrir({
      demande: (d) => ({
        ...d,
        verifications: { ...d.verifications, remboursementIntegral: false, retenue: 400 },
      }),
    });
    expect(screen.getByText("retenue de 400").parentElement).toHaveTextContent(
      "Moins d'1 h avant le départ · retenue de 400 selon les règles de l'agence",
    );
    expect(choix("Avoir 3 600")).toBeInTheDocument();
    await pinSaisi();
    await userEvent.click(screen.getByRole("link", { name: /^Annuler · rembourser 3 600/ }));
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]?.donnees).toMatchObject({ decision: "rembourser", montant: 3600 });
  });

  it("billet déjà scanné, client absent et pièce non vue : les contrôles le disent", async () => {
    await ouvrir({
      demande: (d) => ({
        ...d,
        verifications: {
          ...d.verifications,
          scanne: true,
          siegeLiberable: false,
          clientPresent: false,
          pieceVue: false,
          aRendreCash: 0,
        },
      }),
    });
    expect(screen.getByText("déjà scanné").parentElement).toHaveTextContent(
      "Billet déjà scanné · le siège 9 n'est pas libérable",
    );
    expect(screen.getByText("Le client n'est pas au guichet · pièce non vue")).toBeInTheDocument();
  });

  it("première annulation de l'agent, dans la moyenne : « 1re » et pas d'alerte", async () => {
    await ouvrir({
      demande: (d) => ({
        ...d,
        verifications: {
          ...d.verifications,
          annulationsAgentAujourdhui: 1,
          annulationsAgent10Jours: 1,
          moyenneGuichets: 2,
        },
      }),
    });
    const gras = screen.getByText("annulation", { exact: false, selector: "strong" });
    expect(gras).toHaveTextContent("1re annulation");
    expect(gras).toHaveAttribute("data-alerte", "false");
  });

  it("deuxième annulation du jour : la fréquence est en alerte", async () => {
    await ouvrir();
    expect(screen.getByText("annulation", { exact: false, selector: "strong" })).toHaveAttribute(
      "data-alerte",
      "true",
    );
  });

  it("l'ancienneté de la demande passe en heures puis en jours, sans jamais être négative", async () => {
    await ouvrir({ horloge: "2027-01-05T14:56:00+01:00" });
    expect(screen.getByText(/il y a 1 h 05$/)).toBeInTheDocument();
    cleanup();
    await ouvrir({ horloge: "2027-01-07T14:00:00+01:00" });
    expect(screen.getByText(/il y a 2 jours$/)).toBeInTheDocument();
    cleanup();
    await ouvrir({ horloge: "2027-01-05T07:38:00+01:00" });
    expect(screen.getByText(/il y a 0 min$/)).toBeInTheDocument();
  });
});

describe("SuperviseurVoir · le choix change le pied et ce qui est envoyé", () => {
  it("« Avoir » : le pied propose l'avoir et l'événement porte la décision et le montant", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(choix("Avoir 4 000"));
    expect(choix("Avoir 4 000")).toHaveAttribute("aria-pressed", "true");
    expect(choix("Rembourser")).toHaveAttribute("aria-pressed", "false");
    await pinSaisi();
    await userEvent.click(screen.getByRole("link", { name: /^Annuler · avoir 4 000/ }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(1);
    expect(recus[0]?.donnees).toMatchObject({
      demandeId: DEMANDE_DEMO,
      billetId: BILLET_DEMO,
      decision: "avoir",
      montant: 4000,
    });
  });

  it("« Reporter à demain » : le montant est 0 et la règle parle du report", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(choix("Reporter à demain"));
    expect(
      screen.getByText(
        "Le billet garde le numéro 0171, il est reporté à demain, et le report apparaît nominativement dans le rapport du soir.",
      ),
    ).toBeInTheDocument();
    await pinSaisi();
    await userEvent.click(
      screen.getByRole("link", { name: /^Reporter à demain siège 9 libéré · signé Essono/ }),
    );
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus[0]?.donnees).toMatchObject({ decision: "reporter", montant: 0 });
  });
});

describe("SuperviseurVoir · navigation", () => {
  it("« Retour » mène au Superviseur (/gare)", async () => {
    const { routeur } = await ouvrir();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
  });

  it("« Annuler · rembourser » sans PIN reste sur l'écran et demande le PIN, sans rien envoyer", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");
    expect(routeur.state.location.pathname).toBe(`/annulation/${DEMANDE_DEMO}`);
    expect(recus).toHaveLength(0);
  });

  it("« Refuser » sans PIN reste sur l'écran et demande le PIN, sans rien envoyer", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienRefuser());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");
    expect(routeur.state.location.pathname).toBe(`/annulation/${DEMANDE_DEMO}`);
    expect(recus).toHaveLength(0);
  });
});

describe("SuperviseurVoir · annuler et rembourser avec le PIN", () => {
  it("envoie la décision signée, puis mène au Superviseur (/gare)", async () => {
    const { routeur, recus } = await ouvrir();
    await pinSaisi();
    await userEvent.click(lienAnnuler());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(1);
    const [evenement] = recus;
    expect(evenement?.type).toBe("annulation.decidee");
    expect(evenement?.donnees).toMatchObject({
      demandeId: DEMANDE_DEMO,
      billetId: BILLET_DEMO,
      decision: "rembourser",
      montant: 4000,
      validePar: { superviseurId: "pers-essono", methode: "pin" },
    });
    expect(evenement?.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("n'envoie jamais le PIN : ni dans l'événement, ni dans la page", async () => {
    const { recus } = await ouvrir();
    await pinSaisi("135792");
    await userEvent.click(lienAnnuler());
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(JSON.stringify(recus)).not.toContain("135792");
    expect(document.body.innerHTML).not.toContain("135792");
  });

  it("la signature couvre la décision : un autre PIN ou un autre choix la change", async () => {
    const signatures: string[] = [];
    for (const [pin, decision] of [
      ["246813", "Rembourser"],
      ["246813", "Avoir 4 000"],
      ["246814", "Rembourser"],
      ["246813", "Rembourser"],
    ] as const) {
      const { recus } = await ouvrir();
      await userEvent.click(choix(decision));
      await pinSaisi(pin);
      await userEvent.click(screen.getByRole("link", { name: /^Annuler/ }));
      await waitFor(() => expect(recus).toHaveLength(1));
      signatures.push(recus[0]!.donnees.validePar.signature);
      cleanup();
    }
    expect(new Set(signatures.slice(0, 3)).size).toBe(3);
    // Même PIN, même contenu : même signature (elle se vérifie).
    expect(signatures[3]).toBe(signatures[0]);
  });

  it("n'envoie rien deux fois si on touche Annuler plusieurs fois de suite", async () => {
    const { recus } = await ouvrir({ latenceMs: 50 });
    await pinSaisi();
    await userEvent.dblClick(lienAnnuler());
    await waitFor(() => expect(recus.length).toBeGreaterThan(0));
    await new Promise((fin) => setTimeout(fin, 150));
    expect(recus).toHaveLength(1);
  });
});

describe("SuperviseurVoir · refuser", () => {
  it("envoie le refus signé (montant 0), puis mène au Superviseur (/gare)", async () => {
    const { routeur, recus } = await ouvrir();
    await pinSaisi();
    await userEvent.click(lienRefuser());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(1);
    expect(recus[0]?.type).toBe("annulation.decidee");
    expect(recus[0]?.donnees).toMatchObject({
      demandeId: DEMANDE_DEMO,
      billetId: BILLET_DEMO,
      decision: "refuser",
      montant: 0,
      validePar: { superviseurId: "pers-essono", methode: "pin" },
    });
    expect(recus[0]?.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("SuperviseurVoir · PIN refusé par le serveur : 3 essais, puis blocage 15 min", () => {
  it("compte les essais, bloque le clavier au troisième et s'en souvient", async () => {
    const { routeur, recus } = await ouvrir({ reponseDecision: () => refusPin() });

    await pinSaisi("111111");
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");

    // Le PIN refusé est oublié : il faut le retaper.
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");

    await pinSaisi("222222");
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 1 essai restant.");

    await pinSaisi("333333");
    await userEvent.click(lienAnnuler());
    expect(
      await screen.findByText(/Trop d'essais\. Clavier bloqué pendant 15 min\./),
    ).toBeInTheDocument();
    for (const chiffre of "0123456789") {
      expect(screen.getByRole("button", { name: chiffre })).toBeDisabled();
    }
    expect(routeur.state.location.pathname).toBe(`/annulation/${DEMANDE_DEMO}`);
    expect(recus).toHaveLength(3);

    // Le blocage tient aussi pour les boutons du pied, sans nouvel envoi.
    await userEvent.click(lienRefuser());
    expect(await screen.findByText("Clavier bloqué : attends sa réouverture.")).toBeInTheDocument();
    expect(recus).toHaveLength(3);

    // Il survit à un rechargement de l'écran (et c'est le même que celui de la validation de clôture).
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
    await userEvent.click(lienAnnuler());
    expect(await screen.findByText(/Trop d'essais/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(`/annulation/${DEMANDE_DEMO}`);
  });

  it("un PIN accepté après une erreur mène au Superviseur", async () => {
    const { routeur, recus } = await ouvrir({
      reponseDecision: (numero) => (numero === 1 ? refusPin() : undefined),
    });
    await pinSaisi("111111");
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent("2 essais restants");
    await pinSaisi("246813");
    await userEvent.click(lienAnnuler());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(2);
  });

  it("une panne du serveur ne compte pas comme un essai raté", async () => {
    const { routeur } = await ouvrir({
      reponseDecision: (numero) => (numero === 1 ? panne() : numero === 2 ? refusPin() : undefined),
    });
    await pinSaisi();
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La décision n'a pas été envoyée. Réessaie.",
    );
    expect(routeur.state.location.pathname).toBe(`/annulation/${DEMANDE_DEMO}`);

    // Le PIN saisi reste valable : on peut réessayer sans le retaper.
    await userEvent.click(lienAnnuler());
    // Ce deuxième envoi est un refus de PIN : il reste bien 2 essais (la panne n'en a pas pris un).
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");
  });

  it("signale une demande déjà décidée (409)", async () => {
    await ouvrir({
      reponseDecision: () => Object.assign(panne(), { statut: 409, code: "DEJA_DECIDEE" }),
    });
    await pinSaisi();
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cette demande a déjà reçu une décision.",
    );
  });
});

describe("SuperviseurVoir · empreinte", () => {
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

    await userEvent.click(lienAnnuler());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
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
    await userEvent.click(lienAnnuler());
    expect(await screen.findByRole("alert")).toHaveTextContent("Saisis ton PIN pour décider.");
    expect(recus).toHaveLength(0);
  });
});

describe("SuperviseurVoir · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête et le retour", async () => {
    rendreVoir({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement de la demande d'annulation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Demande d'annulation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
    await attendreDemande();
    expect(
      screen.queryByRole("status", { name: "Chargement de la demande d'annulation" }),
    ).not.toBeInTheDocument();
  });

  it("montre l'état vide pour une demande inconnue (404)", async () => {
    rendreVoir({ url: "/annulation/demande-inconnue" });
    expect(await screen.findByText("Demande introuvable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Clavier PIN" })).not.toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreVoir({ lecture: "erreur" });
    expect(await screen.findByText("Impossible de charger la demande")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });
});

describe("SuperviseurVoir · textes", () => {
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
