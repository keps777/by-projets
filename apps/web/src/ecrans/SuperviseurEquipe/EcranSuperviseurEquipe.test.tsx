import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { deriverCle, signer } from "@/ecrans/SuperviseurValider/pin";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import {
  compteBloque,
  dejaFait,
  inconnue,
  panne,
  refusPin,
  rendreEquipe,
  type OptionsRenduEquipe,
} from "./rendre-equipe";

const CLE_BLOCAGE = "afrimove.pin.bloque.pers-essono";
const PIN_TAPE = "246813";

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(CLE_BLOCAGE);
});

async function ouvrir(options?: OptionsRenduEquipe) {
  const rendu = rendreEquipe(options);
  await screen.findByText("Pauline N. · guichetière · guichet 3");
  return rendu;
}

const NOMS = { JM: "Joseph M.", MT: "Marie T.", AB: "Alain B.", PN: "Pauline N." } as const;

/** La ligne de la liste d'une personne, repérée par ses initiales (l'avatar est décoratif). */
const ligne = (initiales: keyof typeof NOMS) =>
  screen.getByRole("button", { name: (nom) => nom.startsWith(NOMS[initiales]) });
const fiche = () => screen.getByRole("region", { name: /^(Joseph|Marie|Alain|Pauline) / });
const bouton = (nom: string | RegExp) => screen.getByRole("button", { name: nom });

/** Tape un PIN sur le clavier de la feuille ouverte. */
async function taperPin(pin = PIN_TAPE) {
  const clavier = screen.getByRole("group", { name: "Clavier PIN" });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

describe("SuperviseurEquipe · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, gare, effectif, retour et « + personne »", async () => {
    await ouvrir();
    expect(
      screen.getByRole("heading", { level: 1, name: "Équipe de la gare" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Akwa · 9 personnes · un compte et un PIN chacun")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
    expect(screen.getByRole("button", { name: "+ personne" })).toBeEnabled();
  });

  it("affiche les quatre personnes en service avec leur rôle, leur guichet, l'état du PIN et leur statut", async () => {
    await ouvrir();
    const liste = [
      [
        "JM",
        "Joseph M. · guichetier · guichet 2",
        "PIN à renouveler · 3 écarts en 10 jours",
        "en service",
      ],
      [
        "MT",
        "Marie T. · guichetière · guichet 1",
        "PIN OK · 5 annulations en 10 jours",
        "en service",
      ],
      ["AB", "Alain B. · convoyeur · LT 412 AB", "PIN OK · en route vers Yaoundé", "à bord"],
      ["PN", "Pauline N. · guichetière · guichet 3", "bloquée · 3 PIN faux à 09:40", "bloquée"],
    ] as const;
    for (const [initiales, nom, etat, statut] of liste) {
      const rangee = ligne(initiales);
      expect(within(rangee).getByText(nom)).toBeInTheDocument();
      expect(within(rangee).getByText(etat)).toBeInTheDocument();
      expect(within(rangee).getByText(statut)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { level: 2, name: "En service aujourd'hui" }),
    ).toBeInTheDocument();
    expect(screen.getByText("touche un nom")).toBeInTheDocument();
    expect(
      screen.getByText("+ 5 autres (2 convoyeurs, 2 chauffeurs, 1 guichetier de nuit)"),
    ).toBeInTheDocument();
  });

  it("colore l'état du PIN : ambre à renouveler, rouge bloqué, discret sinon", async () => {
    await ouvrir();
    const etat = (texte: string) => screen.getByText(texte);
    expect(etat("PIN à renouveler · 3 écarts en 10 jours")).toHaveAttribute("data-ton", "ambre");
    expect(etat("bloquée · 3 PIN faux à 09:40")).toHaveAttribute("data-ton", "rouge");
    expect(etat("PIN OK · 5 annulations en 10 jours")).toHaveAttribute("data-ton", "doux");
    expect(within(ligne("PN")).getByText("bloquée")).toHaveAttribute("data-ton", "rouge");
    expect(within(ligne("JM")).getByText("en service")).not.toHaveAttribute("data-ton");
  });

  it("ouvre la fiche de Joseph : détail, quatre actions, déblocage, mon PIN et la règle du PIN", async () => {
    await ouvrir();
    expect(ligne("JM")).toHaveAttribute("aria-pressed", "true");
    expect(ligne("MT")).toHaveAttribute("aria-pressed", "false");
    const f = within(fiche());
    expect(f.getByRole("heading", { name: "Joseph M." })).toBeInTheDocument();
    expect(f.getByText("guichetier depuis le 5 janv. · 1 204 billets")).toBeInTheDocument();
    const renouveler = f.getByRole("button", { name: /^Renouveler le PIN/ });
    expect(renouveler).toHaveAttribute("aria-pressed", "true");
    expect(renouveler).toHaveTextContent("PIN provisoire par SMS, à changer");
    expect(f.getByRole("button", { name: /^Changer de guichet/ })).toHaveTextContent("ou de rôle");
    expect(f.getByRole("button", { name: /^Voir son journal/ })).toHaveTextContent(
      "ventes, annulations, écarts",
    );
    expect(f.getByRole("button", { name: /^Désactiver le compte/ })).toHaveTextContent(
      "immédiat · patron prévenu",
    );
    expect(f.getByRole("button", { name: "Débloquer Pauline N." })).toBeInTheDocument();
    expect(f.getByRole("button", { name: "Mon propre PIN · changer" })).toBeInTheDocument();
    expect(
      f.getByText(
        "Un PIN n'est jamais affiché, même au superviseur. Le renouvellement envoie un PIN provisoire par SMS, valable 1 h, que la personne remplace à sa première connexion. Chaque action ici est signée par ton PIN et visible par le patron.",
      ),
    ).toBeInTheDocument();
  });

  it("n'affiche aucun PIN, aucun bouton grisé, aucun emoji ni « bientôt »", async () => {
    await ouvrir();
    for (const b of screen.getAllByRole("button")) expect(b).toBeEnabled();
    const texte = document.body.textContent ?? "";
    expect(texte).not.toMatch(/bientôt/i);
    expect(texte).not.toMatch(/\p{Extended_Pictographic}/u);
    // « 3 PIN faux » est un décompte : aucune suite de chiffres ne ressemble à un PIN de 4 à 6 chiffres.
    expect(texte).not.toMatch(/(?<![\d\s])\d{4,6}(?![\d\s])/);
  });

  it("garde le pied de la planche : Annuler vers la gare, « Renouveler · mon PIN » vers l'écran du PIN", async () => {
    await ouvrir();
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/gare");
    const renouveler = screen.getByRole("link", { name: /^Renouveler · mon PIN/ });
    expect(renouveler).toHaveTextContent("SMS provisoire à Joseph · tracé");
    expect(renouveler).toHaveAttribute("href", "/cloture/session-k-dla-270105-2-1");
  });

  it("« + personne » mène à la fiche d'une nouvelle personne", async () => {
    const { routeur } = await ouvrir();
    await userEvent.click(screen.getByRole("button", { name: "+ personne" }));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/reglages/personne/nouvelle"),
    );
  });
});

describe("SuperviseurEquipe · choisir une personne", () => {
  it("toucher un nom ouvre sa fiche et adresse le SMS provisoire à cette personne", async () => {
    await ouvrir();
    await userEvent.click(ligne("MT"));
    expect(ligne("MT")).toHaveAttribute("aria-pressed", "true");
    expect(ligne("JM")).toHaveAttribute("aria-pressed", "false");
    const f = within(screen.getByRole("region", { name: "Marie T." }));
    expect(f.getByText("guichetière · guichet 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Renouveler · mon PIN/ })).toHaveTextContent(
      "SMS provisoire à Marie · tracé",
    );
  });

  it("ne propose « Débloquer » que pour un compte bloqué", async () => {
    await ouvrir();
    await userEvent.click(ligne("AB"));
    expect(screen.getAllByRole("button", { name: /^Débloquer / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Débloquer Pauline N." })).toBeInTheDocument();
  });
});

describe("SuperviseurEquipe · renouveler le PIN (signé par le PIN du superviseur)", () => {
  it("demande le PIN, envoie la signature (jamais le PIN), puis mène à l'écran du PIN", async () => {
    const { recus, routeur } = await ouvrir();
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    const feuille = await screen.findByRole("dialog", { name: "Renouveler le PIN" });
    expect(within(feuille).getByText("Joseph M.")).toBeInTheDocument();
    expect(within(feuille).getByText("Mon PIN · Mme Essono")).toBeInTheDocument();
    expect(recus).toHaveLength(0);

    await taperPin();
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/cloture/session-k-dla-270105-2-1"),
    );

    expect(recus).toHaveLength(1);
    const evenement = recus[0]!;
    expect(evenement.type).toBe("equipe.pin_renouvele");
    expect(evenement.donnees.personneId).toBe("pers-joseph");
    const { validePar } = evenement.donnees;
    expect(validePar.superviseurId).toBe("pers-essono");
    expect(validePar.methode).toBe("pin");
    expect(validePar.signature).toMatch(/^[0-9a-f]{64}$/);
    // Le PIN ne voyage pas : seule la signature part avec l'événement.
    expect(JSON.stringify(evenement)).not.toContain(PIN_TAPE);
    // La signature est celle du PIN tapé, sur le contenu canonique de l'action.
    const attendue = await signer(await deriverCle(PIN_TAPE, "pers-essono"), {
      action: "equipe.pin_renouvele",
      personneId: "pers-joseph",
      superviseurId: "pers-essono",
      methode: "pin",
    });
    expect(validePar.signature).toBe(attendue);
  });

  it("le bouton « Renouveler le PIN » de la fiche ouvre la même feuille, pour la personne choisie", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(ligne("MT"));
    await userEvent.click(bouton(/^Renouveler le PIN/));
    await screen.findByRole("dialog", { name: "Renouveler le PIN" });
    await taperPin();
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]!.donnees.personneId).toBe("pers-marie");
  });

  it("la signature change avec le PIN tapé", async () => {
    const premier = await ouvrir();
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    await screen.findByRole("dialog");
    await taperPin("246813");
    await waitFor(() => expect(premier.recus).toHaveLength(1));
    cleanup();

    const second = await ouvrir();
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    await screen.findByRole("dialog");
    await taperPin("246814");
    await waitFor(() => expect(second.recus).toHaveLength(1));
    expect(second.recus[0]!.donnees.validePar.signature).not.toBe(
      premier.recus[0]!.donnees.validePar.signature,
    );
  });

  it("un PIN refusé par le serveur compte un essai, reste sur l'écran et n'envoie rien de plus", async () => {
    const { recus, routeur } = await ouvrir({ reponseEcriture: () => refusPin() });
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    await screen.findByRole("dialog");
    await taperPin();
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/equipe");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(recus).toHaveLength(1);
  });

  it("trois PIN faux bloquent le clavier 15 minutes, et le blocage survit au rechargement", async () => {
    await ouvrir({ reponseEcriture: () => refusPin() });
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    await screen.findByRole("dialog");
    await taperPin();
    await screen.findByText("PIN incorrect. 2 essais restants.");
    await taperPin();
    await screen.findByText("PIN incorrect. 1 essai restant.");
    await taperPin();
    expect(
      await screen.findByText(/Trop d'essais\. Clavier bloqué pendant 15 min\./),
    ).toBeInTheDocument();
    const jusqua = Number(window.localStorage.getItem(CLE_BLOCAGE));
    expect(jusqua).toBeGreaterThan(Date.now());
    cleanup();

    // Une nouvelle feuille, sans rechargement de la page : le clavier est déjà bloqué.
    await ouvrir();
    await userEvent.click(bouton(/^Désactiver le compte/));
    await screen.findByRole("dialog", { name: "Désactiver le compte" });
    expect(screen.getByText(/Trop d'essais\. Clavier bloqué pendant 15 min\./)).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Clavier PIN" })).getByRole("button", { name: "1" }),
    ).toBeDisabled();
  });

  it("le serveur qui bloque le compte (423) bloque aussi le clavier", async () => {
    await ouvrir({ reponseEcriture: () => compteBloque() });
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    await screen.findByRole("dialog");
    await taperPin();
    expect(
      await screen.findByText(/Trop d'essais\. Clavier bloqué pendant 15 min\./),
    ).toBeInTheDocument();
    expect(Number(window.localStorage.getItem(CLE_BLOCAGE))).toBeGreaterThan(Date.now());
  });

  it("une panne du serveur ne compte pas d'essai : message d'échec, on peut réessayer", async () => {
    const { recus } = await ouvrir({
      reponseEcriture: (numero) => (numero === 1 ? panne() : undefined),
    });
    await userEvent.click(screen.getByRole("link", { name: /^Renouveler · mon PIN/ }));
    await screen.findByRole("dialog");
    await taperPin();
    expect(
      await screen.findByText("La demande n'a pas été envoyée. Réessaie."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PIN incorrect/)).not.toBeInTheDocument();
    await taperPin();
    await waitFor(() => expect(recus).toHaveLength(2));
  });

  it("ferme la feuille sans rien envoyer avec le bouton Fermer", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton(/^Désactiver le compte/));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(recus).toHaveLength(0);
  });
});

describe("SuperviseurEquipe · débloquer, désactiver, changer de guichet ou de rôle, mon PIN", () => {
  it("débloque Pauline avec le PIN : l'événement, puis la liste se met à jour", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton("Débloquer Pauline N."));
    const feuille = await screen.findByRole("dialog", { name: "Débloquer Pauline N." });
    expect(feuille).toBeInTheDocument();
    await taperPin();
    expect(await screen.findByText("Pauline N. peut se reconnecter.")).toBeInTheDocument();
    expect(recus).toHaveLength(1);
    expect(recus[0]!.type).toBe("equipe.personne_debloquee");
    expect(recus[0]!.donnees.personneId).toBe("pers-pauline");
    expect(recus[0]!.donnees.validePar.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(within(ligne("PN")).queryByText("bloquée")).not.toBeInTheDocument());
    expect(within(ligne("PN")).getByText("en service")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Débloquer Pauline N." })).not.toBeInTheDocument();
  });

  it("désactive le compte de Joseph : événement signé, Joseph quitte la liste, la fiche passe à la suivante", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton(/^Désactiver le compte/));
    await screen.findByRole("dialog", { name: "Désactiver le compte" });
    await taperPin();
    expect(
      await screen.findByText("Le compte de Joseph M. est désactivé. Le patron est prévenu."),
    ).toBeInTheDocument();
    expect(recus[0]!.type).toBe("equipe.compte_desactive");
    expect(recus[0]!.donnees.personneId).toBe("pers-joseph");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^JM/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Akwa · 8 personnes · un compte et un PIN chacun")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Marie T." })).toBeInTheDocument();
  });

  it("changer de guichet : sans choix, le PIN n'envoie rien et le dit", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton(/^Changer de guichet/));
    await screen.findByRole("dialog", { name: "Changer de guichet" });
    await taperPin();
    expect(
      await screen.findByText("Choisis un guichet ou un rôle avant de saisir ton PIN."),
    ).toBeInTheDocument();
    expect(recus).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("changer de guichet : propose les guichets de la gare et envoie le guichet choisi", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton(/^Changer de guichet/));
    const feuille = within(await screen.findByRole("dialog", { name: "Changer de guichet" }));
    expect(
      feuille.getAllByRole("button", { name: /^Guichet \d$/ }).map((b) => b.textContent),
    ).toEqual(["Guichet 1", "Guichet 2", "Guichet 3"]);
    await userEvent.click(feuille.getByRole("button", { name: "Guichet 3" }));
    expect(feuille.getByRole("button", { name: "Guichet 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await taperPin();
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]!.type).toBe("equipe.affectation_changee");
    expect(recus[0]!.donnees).toMatchObject({
      personneId: "pers-joseph",
      guichetId: "guichet-alp-dla-3",
      role: null,
    });
    expect(await screen.findByText("L'affectation de Joseph M. est changée.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(ligne("JM")).getByText("Joseph M. · guichetier · guichet 3"),
      ).toBeInTheDocument(),
    );
  });

  it("changer de rôle : accorde le rôle au genre de la personne et envoie le rôle choisi", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(ligne("MT"));
    await userEvent.click(bouton(/^Changer de guichet/));
    const feuille = within(await screen.findByRole("dialog", { name: "Changer de guichet" }));
    expect(feuille.getByRole("button", { name: "contrôleuse" })).toBeInTheDocument();
    await userEvent.click(feuille.getByRole("button", { name: "convoyeuse" }));
    await taperPin();
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]!.donnees).toMatchObject({
      personneId: "pers-marie",
      guichetId: null,
      role: "convoyeur",
    });
  });

  it("« Mon propre PIN · changer » demande le PIN du superviseur et signe pour lui-même", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton("Mon propre PIN · changer"));
    await screen.findByRole("dialog", { name: "Mon propre PIN · changer" });
    await taperPin();
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]!.type).toBe("equipe.pin_renouvele");
    expect(recus[0]!.donnees.personneId).toBe("pers-essono");
    expect(recus[0]!.donnees.validePar.superviseurId).toBe("pers-essono");
  });

  it("une personne qui n'est plus dans l'équipe (404) est signalée, la feuille reste ouverte", async () => {
    await ouvrir({ reponseEcriture: () => inconnue() });
    await userEvent.click(bouton(/^Désactiver le compte/));
    await screen.findByRole("dialog");
    await taperPin();
    expect(await screen.findByText("Cette personne n'est plus dans l'équipe.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/PIN incorrect/)).not.toBeInTheDocument();
  });

  it("une action déjà faite (409) est signalée, sans compter d'essai", async () => {
    await ouvrir({ reponseEcriture: () => dejaFait() });
    await userEvent.click(bouton("Débloquer Pauline N."));
    await screen.findByRole("dialog");
    await taperPin();
    expect(
      await screen.findByText("Ce compte n'a pas besoin de cette action."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PIN incorrect/)).not.toBeInTheDocument();
  });
});

describe("SuperviseurEquipe · voir son journal", () => {
  it("ouvre le journal de la personne en lecture seule, sans demander le PIN", async () => {
    const { recus } = await ouvrir();
    await userEvent.click(bouton(/^Voir son journal/));
    const feuille = await screen.findByRole("dialog", { name: "Voir son journal" });
    expect(within(feuille).getByText("Joseph M.")).toBeInTheDocument();
    expect(within(feuille).queryByRole("group", { name: "Clavier PIN" })).not.toBeInTheDocument();
    expect(
      await within(feuille).findByText("Ouverture de la caisse K-DLA-270105-2-1 avec 20000 F"),
    ).toBeInTheDocument();
    expect(within(feuille).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(recus).toHaveLength(0);
    await userEvent.click(within(feuille).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("SuperviseurEquipe · états chargement, vide et erreur", () => {
  it("chargement : en-tête et blocs qui pulsent, sans casser la mise en page", async () => {
    rendreEquipe({ latenceMs: 200 });
    const etat = await screen.findByRole("status", { name: "Chargement de l'équipe" });
    expect(etat).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("heading", { level: 1, name: "Équipe de la gare" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
    expect(etat.querySelectorAll(".am-pulse")).toHaveLength(2);
    await screen.findByText("Pauline N. · guichetière · guichet 3");
  });

  it("vide : personne n'est en service", async () => {
    rendreEquipe({ lecture: "vide" });
    expect(await screen.findByText("Personne en service")).toBeInTheDocument();
    expect(
      screen.getByText("Aucune personne de la gare n'est en service aujourd'hui."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
  });

  it("erreur : message, puis « Réessayer » recharge l'équipe", async () => {
    rendreEquipe({ lecture: "erreur", echecsLecture: 1 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger l'équipe");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gare");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Pauline N. · guichetière · guichet 3")).toBeInTheDocument();
  });
});

describe("SuperviseurEquipe · textes", () => {
  const cles = (objet: unknown, prefixe = ""): string[] =>
    Object.entries(objet as Record<string, unknown>).flatMap(([cle, valeur]) =>
      typeof valeur === "object" && valeur !== null
        ? cles(valeur, `${prefixe}${cle}.`)
        : [`${prefixe}${cle}`],
    );

  it("l'anglais et le pidgin ont les mêmes clés que le français, à traduire (vides)", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
    expect(JSON.stringify(en)).not.toMatch(/"[^"]+":\s*"[^"]/);
    expect(JSON.stringify(pcm)).not.toMatch(/"[^"]+":\s*"[^"]/);
  });
});
