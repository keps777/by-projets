import { agence } from "@afrimove/api-client";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Appareil } from "./FeuillePin";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import {
  APPAREIL_DEMO,
  panne,
  refusPin,
  rendreDebloquer,
  type OptionsRenduDebloquer,
} from "./rendre-debloquer";

const CLE_BLOCAGE = "afrimove.pin.bloque.pers-essono";
const SESSION_A_VALIDER = "session-k-dla-270105-2-1";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

/** Attend que l'appareil soit affiché (le titre est déjà là pendant le chargement). */
async function attendreAppareil() {
  await screen.findByText(
    "La règle : hors ligne plus de 12 h, le guichet ne vend plus sans ton PIN.",
  );
}

async function ouvrir(options?: OptionsRenduDebloquer) {
  const rendu = rendreDebloquer(options);
  await attendreAppareil();
  return rendu;
}

const boutonOption = (titre: string) => screen.getByRole("button", { name: new RegExp(titre) });
const lienPrincipal = () => screen.getByRole("link", { name: /^Synchroniser · mon PIN/ });
const lienPlusTard = () => screen.getByRole("link", { name: "Plus tard" });

/** Tape un PIN sur le clavier du kit (dans la feuille). */
async function taperPin(pin: string) {
  const clavier = screen.getByRole("group", { name: "Clavier PIN" });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

/** Les trois états de l'appareil que la planche ne montre pas : on part de la lecture de la planche. */
const AUTRE_ETAT = (etat: Appareil["etat"]) => (vue: Appareil) => ({ ...vue, etat });

describe("SuperviseurDebloquer · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, guichet, téléphone, durée hors ligne et pastille BLOQUÉ", async () => {
    await ouvrir();
    expect(screen.getByRole("heading", { level: 1, name: "Appareil bloqué" })).toBeInTheDocument();
    expect(
      screen.getByText("Guichet 3 · téléphone GU3-DLA · hors ligne depuis 12 h 40"),
    ).toBeInTheDocument();
    expect(screen.getByText("BLOQUÉ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
  });

  it("rappelle la règle des 12 h avec ce qui est enregistré sur le téléphone seulement", async () => {
    await ouvrir();
    expect(
      screen.getByText(
        /^Dernière synchronisation aujourd'hui 01:20\. Depuis, 26 ventes et 4 colis sont enregistrés sur le téléphone seulement\. Rien n'est perdu, mais le serveur, le patron et les sièges en ligne ne les voient pas encore\.$/,
      ),
    ).toBeInTheDocument();
  });

  it("affiche les trois tuiles : en attente, cash non rapproché, plage sans trou", async () => {
    await ouvrir();
    const attente = screen.getByText("En attente").parentElement as HTMLElement;
    expect(attente).toHaveTextContent("26");
    expect(attente).toHaveTextContent("ventes · 4 colis");

    const cash = screen.getByText("Cash dessus").parentElement as HTMLElement;
    expect(cash).toHaveTextContent("104 k");
    expect(cash).toHaveTextContent("non rapproché");

    const plage = screen.getByText("Plage").parentElement as HTMLElement;
    expect(within(plage).getByText("OK")).toHaveAttribute("data-ton", "vert");
    expect(plage).toHaveTextContent("2001–2026 sans trou");
  });

  it("affiche le diagnostic vérifié par l'app, avec ce qui explique le blocage en gras", async () => {
    await ouvrir();
    expect(screen.getByText("Pourquoi · vérifié par l'app")).toBeInTheDocument();
    expect(screen.getByText("éteint depuis 01:20").tagName).toBe("STRONG");
    expect(screen.getByText("crédit épuisé").tagName).toBe("STRONG");
    expect(
      screen.getByText(/Routeur 4G de la gare .* les guichets 1 et 2 passent par leur SIM/),
    ).toBeInTheDocument();
    expect(screen.getByText(/SIM data du téléphone GU3/)).toBeInTheDocument();
    const sain = screen.getByText("Téléphone sain · batterie 64 % · application à jour");
    expect(sain.previousElementSibling).toHaveAttribute("data-ton", "vert");
    // Les deux premiers constats sont des alertes (rouge), le troisième est sain (vert).
    expect(screen.getAllByText("!")).toHaveLength(2);
    for (const marque of screen.getAllByText("!")) {
      expect(marque).toHaveAttribute("data-ton", "rouge");
    }
  });

  it("propose les trois options dans l'ordre, la première recommandée", async () => {
    await ouvrir();
    expect(screen.getByText("Que faire · dans l'ordre")).toBeInTheDocument();
    const options = Array.from(document.querySelectorAll("main button"));
    expect(options.map((o) => o.querySelector("span")?.textContent)).toEqual(["1", "2", "3"]);
    expect(options[0]).toHaveTextContent("Synchroniser via mon téléphone");
    expect(options[0]).toHaveTextContent("partage de connexion · 26 ventes envoyées en 20 s");
    expect(options[0]).toHaveTextContent("recommandé");
    expect(options[0]).toHaveAttribute("aria-pressed", "true");
    expect(options[1]).toHaveTextContent("Débloquer 4 h de plus avec mon PIN");
    expect(options[1]).toHaveTextContent("si le réseau ne revient pas · tracé, patron prévenu");
    expect(options[1]).not.toHaveAttribute("aria-pressed");
    expect(options[2]).toHaveTextContent("Basculer sur le téléphone de secours");
    expect(options[2]).toHaveTextContent("dans le tiroir · Pauline se connecte avec son PIN");
    expect(options[2]).not.toHaveAttribute("aria-pressed");
  });

  it("annonce le rappel envoyé au support, avec le guichet de l'appareil", async () => {
    await ouvrir();
    expect(
      screen.getByText(
        "Recharger la SIM de GU3 et rallumer le routeur : rappel envoyé à l'agent support.",
      ),
    ).toBeInTheDocument();
  });

  it("n'annonce aucun rappel quand le support n'a pas été prévenu", async () => {
    await ouvrir({ modifierVue: (vue) => ({ ...vue, rappelSupport: false }) });
    expect(screen.queryByText(/rappel envoyé/)).not.toBeInTheDocument();
  });

  it("affiche les deux actions du pied avec les textes de la planche", async () => {
    await ouvrir();
    expect(lienPlusTard()).toHaveAttribute("href", "/gare");
    expect(lienPrincipal()).toHaveAttribute("href", `/cloture/${SESSION_A_VALIDER}`);
    expect(lienPrincipal()).toHaveTextContent("puis le guichet 3 revend");
  });

  it("la feuille du PIN n'apparaît qu'au geste : ni clavier ni fenêtre au départ", async () => {
    await ouvrir();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Clavier PIN" })).not.toBeInTheDocument();
  });

  it("n'ajoute ni « touche n » ni bouton grisé, même avec le flag conception", async () => {
    await ouvrir({ conception: true });
    expect(lienPrincipal()).not.toHaveTextContent(/touche/);
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/bientôt/i);
  });

  it("les icônes SVG sont décoratives et aucun emoji n'est affiché", async () => {
    await ouvrir();
    for (const svg of document.querySelectorAll("main svg, header svg, a svg, button svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("SuperviseurDebloquer · selon les données", () => {
  it("une plage avec des trous passe en rouge et dit combien de numéros manquent", async () => {
    await ouvrir({
      modifierVue: (vue) => ({
        ...vue,
        enAttente: { ...vue.enAttente, plage: { ...vue.enAttente.plage, trous: [2010, 2011] } },
      }),
    });
    const plage = screen.getByText("Plage").parentElement as HTMLElement;
    expect(within(plage).getByText("2")).toHaveAttribute("data-ton", "rouge");
    expect(plage).toHaveTextContent("2001–2026 · 2 manquants");
    expect(within(plage).queryByText("OK")).not.toBeInTheDocument();
  });

  it("accorde les ventes et la durée avec les données", async () => {
    await ouvrir({
      modifierVue: (vue) => ({
        ...vue,
        horsLigneMinutes: 725,
        enAttente: { ...vue.enAttente, ventes: 1, colis: 0, cash: 4_000 },
      }),
    });
    expect(
      screen.getByText("Guichet 3 · téléphone GU3-DLA · hors ligne depuis 12 h 05"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Depuis, 1 vente et 0 colis sont enregistrés/)).toBeInTheDocument();
    expect(screen.getByText("vente · 0 colis")).toBeInTheDocument();
    expect(screen.getByText("4 k")).toBeInTheDocument();
    expect(screen.getByText("partage de connexion · 1 vente envoyée en 20 s")).toBeInTheDocument();
  });

  it("dit « hier » quand la dernière synchronisation date de la veille", async () => {
    await ouvrir({
      modifierVue: (vue) => ({ ...vue, derniereSyncA: "2027-01-04T23:50:00.000+01:00" }),
    });
    expect(screen.getByText(/Dernière synchronisation hier 23:50\./)).toBeInTheDocument();
  });

  it("un appareil déjà en ligne : pastille SYNC, plus d'options ni de bouton principal", async () => {
    await ouvrir({ modifierVue: AUTRE_ETAT("en_ligne") });
    expect(
      screen.getByRole("heading", { level: 1, name: "Appareil en ligne" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SYNC")).toBeInTheDocument();
    expect(screen.queryByText("Que faire · dans l'ordre")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Synchroniser · mon PIN/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/rappel envoyé/)).not.toBeInTheDocument();
    expect(lienPlusTard()).toHaveAttribute("href", "/gare");
  });

  it("un appareil débloqué pour 4 h : pastille DÉBLOQUÉ", async () => {
    await ouvrir({ modifierVue: AUTRE_ETAT("debloque_temporairement") });
    expect(
      screen.getByRole("heading", { level: 1, name: "Appareil débloqué" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DÉBLOQUÉ")).toBeInTheDocument();
    expect(screen.queryByText("BLOQUÉ")).not.toBeInTheDocument();
  });
});

describe("SuperviseurDebloquer · états chargement, vide et erreur", () => {
  it("chargement : des blocs qui pulsent, la mise en page de la planche, l'en-tête déjà là", async () => {
    rendreDebloquer({ latenceMs: 200 });
    const zone = await screen.findByRole("status", { name: "Chargement de l'appareil" });
    expect(zone).toHaveAttribute("aria-busy", "true");
    expect(zone.querySelectorAll(".am-pulse")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
    await attendreAppareil();
    expect(screen.queryByRole("status", { name: "Chargement de l'appareil" })).toBeNull();
  });

  it("vide : un appareil inconnu (404) l'explique et laisse revenir au Superviseur", async () => {
    const { routeur } = rendreDebloquer({ url: "/debloquer/appareil-inconnu" });
    expect(await screen.findByText("Appareil introuvable")).toBeInTheDocument();
    expect(screen.getByText("Cet appareil n'existe pas ou n'est plus suivi.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
  });

  it("erreur : une panne de lecture est annoncée, avec un bouton pour réessayer", async () => {
    rendreDebloquer({ lecture: "erreur" });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger l'appareil");
    expect(alerte).toHaveTextContent("Vérifie la connexion, puis réessaie.");
    expect(within(alerte).getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });
});

describe("SuperviseurDebloquer · navigation", () => {
  it("« Retour » mène au Superviseur (/gare)", async () => {
    const { routeur } = await ouvrir();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
  });

  it("« Plus tard » mène au Superviseur (/gare) sans rien envoyer", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienPlusTard());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(0);
  });

  it("« Synchroniser · mon PIN » demande d'abord le PIN : on reste sur l'écran, rien n'est envoyé", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienPrincipal());
    const feuille = await screen.findByRole("dialog", { name: "Synchroniser via mon téléphone" });
    expect(within(feuille).getByText("Mon PIN · Mme Essono")).toBeInTheDocument();
    expect(within(feuille).getByText("6 chiffres · jamais partagé")).toBeInTheDocument();
    expect(
      within(feuille).getByRole("img", { name: "0 chiffres saisis sur 6" }),
    ).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(`/debloquer/${APPAREIL_DEMO}`);
    expect(recus).toHaveLength(0);
  });
});

describe("SuperviseurDebloquer · débloquer avec le PIN", () => {
  it("synchroniser : envoie le déblocage signé, puis mène à SuperviseurValider", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienPrincipal());
    await taperPin("246813");

    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_A_VALIDER}`),
    );
    expect(recus).toHaveLength(1);
    expect(recus[0]?.type).toBe("appareil.debloque");
    expect(recus[0]?.donnees).toMatchObject({
      appareilId: APPAREIL_DEMO,
      option: "synchroniser",
      validePar: { superviseurId: "pers-essono", methode: "pin" },
    });
    expect(recus[0]?.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la première option de la liste fait la même chose que le bouton principal", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(boutonOption("Synchroniser via mon téléphone"));
    expect(
      await screen.findByRole("dialog", { name: "Synchroniser via mon téléphone" }),
    ).toBeInTheDocument();
    await taperPin("246813");
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe(`/cloture/${SESSION_A_VALIDER}`),
    );
    expect(recus[0]?.donnees.option).toBe("synchroniser");
  });

  it("débloquer 4 h : envoie l'option 4 h, puis revient au Superviseur", async () => {
    const { routeur, recus, client } = await ouvrir();
    await userEvent.click(boutonOption("Débloquer 4 h de plus avec mon PIN"));
    expect(
      await screen.findByRole("dialog", { name: "Débloquer 4 h de plus avec mon PIN" }),
    ).toBeInTheDocument();
    await taperPin("246813");

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(1);
    expect(recus[0]?.donnees).toMatchObject({
      appareilId: APPAREIL_DEMO,
      option: "debloquer_4h",
      validePar: { superviseurId: "pers-essono", methode: "pin" },
    });
    // Le serveur a posé l'octroi de 4 h : l'appareil n'est plus bloqué, ses ventes restent à envoyer.
    const apres = await client.executer(agence.OP_SUPERVISEUR_APPAREIL, {
      appareilId: APPAREIL_DEMO,
    });
    expect(apres.etat).toBe("debloque_temporairement");
    expect(apres.enAttente.ventes).toBe(26);
  });

  it("téléphone de secours : envoie cette option, puis revient au Superviseur", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(boutonOption("Basculer sur le téléphone de secours"));
    await taperPin("246813");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(1);
    expect(recus[0]?.donnees.option).toBe("telephone_secours");
  });

  it("rien n'est perdu : la synchronisation envoie les 26 ventes et remet l'appareil en ligne", async () => {
    const { routeur, recus, client } = await ouvrir();
    await userEvent.click(lienPrincipal());
    await taperPin("246813");
    await waitFor(() => expect(routeur.state.location.pathname).toMatch(/^\/cloture\//));
    expect(recus).toHaveLength(1);
    const apres = await client.executer(agence.OP_SUPERVISEUR_APPAREIL, {
      appareilId: APPAREIL_DEMO,
    });
    expect(apres.etat).toBe("en_ligne");
    expect(apres.enAttente).toMatchObject({ ventes: 0, colis: 0, cash: 0 });
  });

  it("n'envoie jamais le PIN : ni dans l'événement, ni dans la page", async () => {
    const { recus, routeur } = await ouvrir();
    await userEvent.click(lienPrincipal());
    await taperPin("135792");
    await waitFor(() => expect(recus).toHaveLength(1));
    await waitFor(() => expect(routeur.state.location.pathname).toMatch(/^\/cloture\//));
    expect(JSON.stringify(recus)).not.toContain("135792");
    expect(document.body.innerHTML).not.toContain("135792");
  });

  it("la signature couvre l'appareil, l'option et le PIN : changer l'un d'eux la change", async () => {
    const signatures: string[] = [];
    for (const [pin, titre] of [
      ["246813", "Débloquer 4 h de plus avec mon PIN"],
      ["246813", "Basculer sur le téléphone de secours"],
      ["246814", "Débloquer 4 h de plus avec mon PIN"],
      ["246813", "Débloquer 4 h de plus avec mon PIN"],
    ] as const) {
      const { recus } = await ouvrir();
      await userEvent.click(boutonOption(titre));
      await taperPin(pin);
      await waitFor(() => expect(recus).toHaveLength(1));
      signatures.push(recus[0]!.donnees.validePar.signature);
      cleanup();
    }
    expect(new Set(signatures.slice(0, 3)).size).toBe(3);
    // Même PIN, même contenu : même signature (elle se vérifie).
    expect(signatures[3]).toBe(signatures[0]);
  });

  it("fermer la feuille (bouton ou Échap) n'envoie rien et laisse la planche telle quelle", async () => {
    const { routeur, recus } = await ouvrir();
    await userEvent.click(lienPrincipal());
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(boutonOption("Débloquer 4 h de plus avec mon PIN"));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(recus).toHaveLength(0);
    expect(routeur.state.location.pathname).toBe(`/debloquer/${APPAREIL_DEMO}`);
  });
});

describe("SuperviseurDebloquer · PIN refusé ou panne", () => {
  it("compte les essais du serveur, bloque le clavier au troisième et s'en souvient", async () => {
    const { routeur, recus } = await ouvrir({ reponseDeblocage: () => refusPin() });
    await userEvent.click(lienPrincipal());

    await taperPin("111111");
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");
    await taperPin("222222");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("PIN incorrect. 1 essai restant."),
    );
    await taperPin("333333");
    expect(
      await screen.findByText(/Trop d'essais\. Clavier bloqué pendant 15 min\./),
    ).toBeInTheDocument();
    for (const chiffre of "0123456789") {
      expect(screen.getByRole("button", { name: chiffre })).toBeDisabled();
    }
    expect(recus).toHaveLength(3);
    expect(routeur.state.location.pathname).toBe(`/debloquer/${APPAREIL_DEMO}`);

    // Le blocage est celui du PIN du superviseur : il survit à un rechargement, comme sur SuperviseurValider.
    const jusqua = Number(localStorage.getItem(CLE_BLOCAGE));
    expect(jusqua).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(jusqua).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    cleanup();
    await ouvrir();
    await userEvent.click(lienPrincipal());
    expect(await screen.findByText(/Trop d'essais/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5" })).toBeDisabled();
  });

  it("un blocage échu ne bloque plus", async () => {
    localStorage.setItem(CLE_BLOCAGE, String(Date.now() - 1000));
    await ouvrir();
    await userEvent.click(lienPrincipal());
    expect(await screen.findByRole("button", { name: "5" })).toBeEnabled();
  });

  it("un compte bloqué par le serveur (423) bloque tout de suite le clavier", async () => {
    const { routeur } = await ouvrir({
      reponseDeblocage: () => Object.assign(refusPin(), { statut: 423, code: "PIN_BLOQUE" }),
    });
    await userEvent.click(lienPrincipal());
    await taperPin("246813");
    expect(await screen.findByText(/Trop d'essais/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(`/debloquer/${APPAREIL_DEMO}`);
  });

  it("un PIN accepté après une erreur débloque quand même", async () => {
    const { routeur, recus } = await ouvrir({
      reponseDeblocage: (numero) => (numero === 1 ? refusPin() : undefined),
    });
    await userEvent.click(lienPrincipal());
    await taperPin("111111");
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");
    await taperPin("246813");
    await waitFor(() => expect(routeur.state.location.pathname).toMatch(/^\/cloture\//));
    expect(recus).toHaveLength(2);
  });

  it("une panne du serveur n'use pas d'essai : « Vérification impossible », on reste sur l'écran", async () => {
    const { routeur, recus } = await ouvrir({ reponseDeblocage: () => panne() });
    await userEvent.click(lienPrincipal());
    await taperPin("246813");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vérification impossible. Réessayez.",
    );
    expect(routeur.state.location.pathname).toBe(`/debloquer/${APPAREIL_DEMO}`);
    expect(recus).toHaveLength(1);
    // Aucun essai compté : le clavier reste ouvert.
    expect(screen.getByRole("button", { name: "5" })).toBeEnabled();
    expect(localStorage.getItem(CLE_BLOCAGE)).toBeNull();
  });

  it("sans superviseur connu, rien n'est signé ni envoyé", async () => {
    const { routeur, recus } = await ouvrir({ sansSuperviseur: true });
    await userEvent.click(lienPrincipal());
    const feuille = await screen.findByRole("dialog");
    expect(within(feuille).getByText("Mon PIN")).toBeInTheDocument();
    await taperPin("246813");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vérification impossible. Réessayez.",
    );
    expect(recus).toHaveLength(0);
    expect(routeur.state.location.pathname).toBe(`/debloquer/${APPAREIL_DEMO}`);
  });
});

describe("SuperviseurDebloquer · textes", () => {
  it("l'anglais et le pidgin ont les mêmes clés que le français, vides, donc repliées sur le français", () => {
    const cles = (objet: Record<string, unknown>, prefixe = ""): string[] =>
      Object.entries(objet).flatMap(([cle, valeur]) =>
        typeof valeur === "object" && valeur !== null
          ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
          : [`${prefixe}${cle}`],
      );
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
