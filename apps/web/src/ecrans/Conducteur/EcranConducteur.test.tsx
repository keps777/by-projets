import { ErreurHttp, ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreConducteur, surveiller, transformer } from "./rendre-conducteur";

/** Attend que le formulaire soit affiché. */
async function attendreEcran() {
  await screen.findByRole("button", { name: /Publier le trajet/ });
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

const publier = () => screen.getByRole("button", { name: /Publier le trajet/ });
const prix = () => screen.getByRole("textbox", { name: "Prix par place" });
const place = (n: number) =>
  within(screen.getByRole("group", { name: "Places" })).getByRole("button", { name: String(n) });
const option = (nom: string) => screen.getByRole("button", { name: nom });

/** Remplace le texte d'un champ. */
async function ecrire(champ: HTMLElement, texte: string) {
  await userEvent.clear(champ);
  if (texte !== "") await userEvent.type(champ, texte);
}

/** Le formulaire du scénario, modifié par `modifier`. */
const formulaire = (modifier: (f: c.FormulairePublication) => c.FormulairePublication) =>
  rendreConducteur({
    operations: (originale) => [
      transformer(voyageur.OP_FORMULAIRE_PUBLICATION, originale, modifier),
    ],
  });

describe("Conducteur · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : retour, titre, identité du conducteur et pastille VÉRIFIÉ", async () => {
    rendreConducteur();
    await attendreEcran();

    expect(screen.getByRole("heading", { level: 1, name: "Proposer mon trajet" })).toBeVisible();
    expect(screen.getByText("Samuel E. · vérifié · Toyota Corolla · LT 882 CE")).toBeVisible();
    expect(screen.getByText("VÉRIFIÉ")).toBeVisible();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/covoit");
  });

  it("affiche le trajet, les points de départ et d'arrivée, les places, le prix et le conseil", async () => {
    rendreConducteur();
    await attendreEcran();

    const main = document.querySelector("main") as HTMLElement;
    expect(main).toHaveTextContent("Douala → Kribi");
    expect(within(main).getByText("sam. · 08:30")).toBeInTheDocument();
    expect(screen.getByLabelText("Point de départ")).toHaveValue("Bonapriso, pharmacie");
    expect(screen.getByLabelText("Arrivée")).toHaveValue("Kribi centre");

    expect(screen.getByText("Places")).toBeInTheDocument();
    for (const n of [1, 2, 3]) {
      expect(place(n)).toHaveAttribute("aria-pressed", String(n === 2));
    }
    expect(screen.getByText("Prix / place")).toBeInTheDocument();
    expect(prix()).toHaveValue("4 000");
    expect(
      screen.getByText(
        "Prix conseillé 3 500 à 4 500 (carburant partagé). Pas de bénéfice : du partage de frais.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche les quatre options, Clim et Bagage moyen étant choisis", async () => {
    rendreConducteur();
    await attendreEcran();

    expect(screen.getByText("Options")).toBeInTheDocument();
    const attendu: Array<[string, boolean, string]> = [
      ["Clim", true, "Clim ✓"],
      ["Bagage moyen", true, "Bagage moyen ✓"],
      ["Femmes seulement", false, "Femmes seulement"],
      ["Trajet régulier · chaque sam.", false, "Trajet régulier · chaque sam."],
    ];
    for (const [nom, actif, texte] of attendu) {
      const bouton = option(nom);
      expect(bouton).toHaveAttribute("aria-pressed", String(actif));
      expect(bouton).toHaveTextContent(texte);
    }
  });

  it("affiche la réputation, le rappel de vérification et la règle de paiement", async () => {
    rendreConducteur();
    await attendreEcran();

    expect(screen.getByText("Tes 112 trajets · 4,9 ★")).toBeInTheDocument();
    expect(screen.getByText("pièce, permis, carte grise vérifiés")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tu reçois le paiement à l'arrivée, par MoMo, quand le passager confirme ou 2 h après l'heure prévue. AfriMove garde 250 F par place.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche « Publier le trajet » avec le total « 2 × 4 000 »", async () => {
    rendreConducteur();
    await attendreEcran();
    expect(publier()).toHaveTextContent("Publier le trajet");
    expect(publier()).toHaveTextContent("visible dans l'app voyageur en 10 s");
    expect(publier()).toHaveTextContent("2 × 4 000");
    expect(publier()).not.toHaveTextContent("touche 2");
    expect(publier()).toBeEnabled();
  });

  it("écrit « touche 2 · » devant le détail avec le flag conception seulement", async () => {
    rendreConducteur({ conception: true });
    await attendreEcran();
    expect(publier()).toHaveTextContent("touche 2 · visible dans l'app voyageur en 10 s");
  });

  it("n'affiche aucune alerte quand le conducteur est vérifié", async () => {
    rendreConducteur();
    await attendreEcran();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("garde des cibles utilisables : chaque bouton et chaque champ a un nom", async () => {
    rendreConducteur();
    await attendreEcran();
    const boutons = screen.getAllByRole("button");
    // 3 places, 4 options et le bouton de publication.
    expect(boutons).toHaveLength(3 + 4 + 1);
    for (const bouton of boutons) expect(bouton).toHaveAccessibleName();
    for (const champ of screen.getAllByRole("textbox")) expect(champ).toHaveAccessibleName();
  });
});

describe("Conducteur · comportements", () => {
  it("met le total à jour quand on change les places : « 3 × 4 000 », puis « 1 × 4 000 »", async () => {
    rendreConducteur();
    await attendreEcran();
    await userEvent.click(place(3));
    expect(place(3)).toHaveAttribute("aria-pressed", "true");
    expect(place(2)).toHaveAttribute("aria-pressed", "false");
    expect(publier()).toHaveTextContent("3 × 4 000");
    await userEvent.click(place(1));
    expect(publier()).toHaveTextContent("1 × 4 000");
  });

  it("met le total à jour quand on change le prix et groupe les milliers", async () => {
    rendreConducteur();
    await attendreEcran();
    await ecrire(prix(), "3500");
    expect(prix()).toHaveValue("3 500");
    expect(publier()).toHaveTextContent("2 × 3 500");
  });

  it("n'accepte que des chiffres dans le prix", async () => {
    rendreConducteur();
    await attendreEcran();
    await ecrire(prix(), "4a2b0c0");
    expect(prix()).toHaveValue("4 200");
  });

  it("ramène un prix trop haut à la borne conseillée quand on quitte le champ", async () => {
    rendreConducteur();
    await attendreEcran();
    await ecrire(prix(), "9000");
    await userEvent.tab();
    expect(prix()).toHaveValue("4 500");
    expect(publier()).toHaveTextContent("2 × 4 500");
  });

  it("ramène un prix trop bas à la borne conseillée quand on quitte le champ", async () => {
    rendreConducteur();
    await attendreEcran();
    await ecrire(prix(), "1000");
    await userEvent.tab();
    expect(prix()).toHaveValue("3 500");
  });

  it("coche et décoche une option : le ✓ suit l'état", async () => {
    rendreConducteur();
    await attendreEcran();
    await userEvent.click(option("Femmes seulement"));
    expect(option("Femmes seulement")).toHaveAttribute("aria-pressed", "true");
    expect(option("Femmes seulement")).toHaveTextContent("Femmes seulement ✓");
    await userEvent.click(option("Clim"));
    expect(option("Clim")).toHaveAttribute("aria-pressed", "false");
    expect(option("Clim")).toHaveTextContent(/^Clim$/);
  });

  it("garde ce qu'on a saisi quand le formulaire est relu en arrière-plan", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rendreConducteur({ queryClient });
    await attendreEcran();
    await ecrire(screen.getByLabelText("Arrivée"), "Kribi port");
    await userEvent.click(place(3));
    await queryClient.invalidateQueries();
    await queryClient.refetchQueries();
    await waitFor(() => expect(screen.getByLabelText("Arrivée")).toHaveValue("Kribi port"));
    expect(place(3)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Conducteur · publication", () => {
  async function publierAvec(
    modifier?: (formulaire: c.FormulairePublication) => c.FormulairePublication,
  ) {
    const envois: c.PublierTrajet[] = [];
    const rendu = rendreConducteur({
      operations: (originale) => [
        ...(modifier ? [transformer(voyageur.OP_FORMULAIRE_PUBLICATION, originale, modifier)] : []),
        surveiller(voyageur.OP_PUBLIER_TRAJET, originale, (p) => envois.push(p)),
      ],
    });
    await attendreEcran();
    return { ...rendu, envois };
  }

  it("publie le trajet de la planche puis revient au covoiturage", async () => {
    const { routeur, envois } = await publierAvec();
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois).toEqual([
      {
        depart: { ville: "Douala", point: "Bonapriso, pharmacie" },
        arrivee: { ville: "Kribi", point: "Kribi centre" },
        departA: expect.stringMatching(/^2027-01-09T08:30:00(\.000)?\+01:00$/) as string,
        places: 2,
        prixParPlace: 4000,
        options: ["clim", "bagage-moyen"],
        regulier: false,
      },
    ]);
  });

  it("publie ce que le conducteur a changé : points, places, prix et options", async () => {
    const { routeur, envois } = await publierAvec();
    await ecrire(screen.getByLabelText("Point de départ"), "Akwa, Total");
    await ecrire(screen.getByLabelText("Arrivée"), "Kribi port");
    await userEvent.click(place(3));
    await ecrire(prix(), "3700");
    await userEvent.click(option("Femmes seulement"));
    await userEvent.click(option("Clim"));
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({
      depart: { ville: "Douala", point: "Akwa, Total" },
      arrivee: { ville: "Kribi", point: "Kribi port" },
      places: 3,
      prixParPlace: 3700,
      options: ["bagage-moyen", "femmes-seulement"],
      regulier: false,
    });
  });

  it("publie un trajet régulier quand l'option est choisie", async () => {
    const { routeur, envois } = await publierAvec();
    await userEvent.click(option("Trajet régulier · chaque sam."));
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois[0]?.regulier).toBe(true);
    expect(envois[0]?.options).toContain("trajet-regulier-chaque-sam");
  });

  it("publie le code « regulier » du serveur comme un trajet régulier", async () => {
    const { routeur, envois } = await publierAvec((f) => ({
      ...f,
      options: f.options.map((o) => (o.code.includes("regulier") ? { ...o, code: "regulier" } : o)),
    }));
    await userEvent.click(option("Trajet régulier · chaque sam."));
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois[0]).toMatchObject({ regulier: true });
    expect(envois[0]?.options).toContain("regulier");
  });

  it("n'envoie jamais un prix hors de la fourchette : la saisie est ramenée dedans avant l'envoi", async () => {
    const { routeur, envois } = await publierAvec();
    await ecrire(prix(), "5000");
    // Toucher le bouton fait quitter le champ : le prix revient à la borne, c'est lui qui part.
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois).toHaveLength(1);
    expect(envois[0]?.prixParPlace).toBe(4500);
  });

  it("refuse un prix vide", async () => {
    const { envois } = await publierAvec();
    await ecrire(prix(), "");
    await userEvent.click(publier());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le prix reste entre 3 500 et 4 500",
    );
    expect(envois).toHaveLength(0);
  });

  it.each(["3500", "4500"])("accepte la borne de la fourchette : %s", async (borne) => {
    const { routeur, envois } = await publierAvec();
    await ecrire(prix(), borne);
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois[0]?.prixParPlace).toBe(Number(borne));
  });

  it("demande les points quand l'un d'eux est vide, sans rien envoyer", async () => {
    const { envois } = await publierAvec();
    await ecrire(screen.getByLabelText("Point de départ"), "   ");
    await userEvent.click(publier());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Indique la ville et le point de départ, puis ceux d'arrivée.",
    );
    expect(envois).toHaveLength(0);
  });

  it("ne publie qu'une fois quand on touche deux fois de suite", async () => {
    const envois: c.PublierTrajet[] = [];
    rendreConducteur({
      operations: (originale) => [
        implementer(voyageur.OP_PUBLIER_TRAJET, async (p, ctx) => {
          envois.push(p);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (
            originale(voyageur.OP_PUBLIER_TRAJET.nom).repondre as (
              p: c.PublierTrajet,
              ctx: unknown,
            ) => c.TrajetPublie
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.dblClick(publier());
    await waitFor(() => expect(envois).toHaveLength(1));
  });

  it("dit que le dossier n'est pas vérifié quand le serveur refuse (403), sans quitter l'écran", async () => {
    const { routeur } = rendreConducteur({
      operations: () => [
        implementer(voyageur.OP_PUBLIER_TRAJET, () => {
          throw new ErreurHttp(403, "Non vérifié", "CONDUCTEUR_NON_VERIFIE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(publier());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ton dossier n'est pas encore vérifié",
    );
    expect(pathname(routeur)).toBe("/covoit/proposer");
  });

  it("dit que le prix est refusé (422) en rappelant la fourchette", async () => {
    rendreConducteur({
      operations: () => [
        implementer(voyageur.OP_PUBLIER_TRAJET, () => {
          throw new ErreurHttp(422, "Prix invalide", "PRIX_INVALIDE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(publier());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le prix reste entre 3 500 et 4 500 F la place",
    );
  });

  it("dit qu'un trajet est déjà publié à ce moment-là (409)", async () => {
    const { routeur } = rendreConducteur({
      operations: () => [
        implementer(voyageur.OP_PUBLIER_TRAJET, () => {
          throw new ErreurHttp(409, "Chevauchement", "TRAJET_CHEVAUCHANT");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(publier());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu as déjà un trajet publié à ce moment-là.",
    );
    expect(pathname(routeur)).toBe("/covoit/proposer");
  });

  it("affiche un message d'échec pour une autre panne, le retire à l'essai suivant et publie", async () => {
    let essais = 0;
    const { routeur } = rendreConducteur({
      operations: (originale) => [
        implementer(voyageur.OP_PUBLIER_TRAJET, (p, ctx) => {
          essais += 1;
          if (essais === 1) throw new ErreurReseau();
          return (
            originale(voyageur.OP_PUBLIER_TRAJET.nom).repondre as (
              p: c.PublierTrajet,
              ctx: unknown,
            ) => c.TrajetPublie
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(publier());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le trajet n'a pas pu être publié. Réessaie.",
    );
    // Ce qui a été saisi reste là.
    expect(place(2)).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(screen.queryByText("Le trajet n'a pas pu être publié. Réessaie.")).toBeNull();
  });
});

describe("Conducteur · conducteur non vérifié et premier trajet", () => {
  it("rappelle la vérification, sans pastille ni « vérifié » dans l'en-tête", async () => {
    formulaire((f) => ({
      ...f,
      conducteur: { ...f.conducteur, verifie: false },
      reputation: { ...f.reputation, piecesVerifiees: [] },
    }));
    await attendreEcran();
    expect(screen.queryByText("VÉRIFIÉ")).toBeNull();
    expect(screen.getByText("Samuel E. · Toyota Corolla · LT 882 CE")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ton dossier n'est pas encore vérifié");
    expect(screen.queryByText(/vérifiés$/)).toBeNull();
    expect(publier()).toBeEnabled();
  });

  it("écrit « Ton premier trajet » quand il n'y a encore aucun trajet", async () => {
    formulaire((f) => ({ ...f, reputation: { ...f.reputation, trajets: 0 } }));
    await attendreEcran();
    expect(screen.getByText("Ton premier trajet")).toBeInTheDocument();
    expect(screen.queryByText(/★/)).toBeNull();
  });

  it("accorde « Ton trajet » et « vérifié » au singulier", async () => {
    formulaire((f) => ({
      ...f,
      reputation: { ...f.reputation, trajets: 1, piecesVerifiees: ["permis"] },
    }));
    await attendreEcran();
    expect(screen.getByText("Ton trajet · 4,9 ★")).toBeInTheDocument();
    expect(screen.getByText("permis vérifié")).toBeInTheDocument();
  });

  it("fait saisir les villes quand le serveur n'en propose pas, et les envoie", async () => {
    const envois: c.PublierTrajet[] = [];
    const { routeur } = rendreConducteur({
      operations: (originale) => [
        transformer(voyageur.OP_FORMULAIRE_PUBLICATION, originale, (f) => ({
          ...f,
          depart: { ville: "", point: "" },
          arrivee: { ville: "", point: "" },
        })),
        surveiller(voyageur.OP_PUBLIER_TRAJET, originale, (p) => envois.push(p)),
      ],
    });
    await attendreEcran();

    // Rien n'est envoyé tant que les champs sont vides.
    await userEvent.click(publier());
    expect(await screen.findByRole("alert")).toHaveTextContent("Indique la ville et le point");
    expect(envois).toHaveLength(0);

    await ecrire(screen.getByLabelText("Ville de départ"), "Douala");
    await ecrire(screen.getByLabelText("Ville d'arrivée"), "Limbé");
    await ecrire(screen.getByLabelText("Point de départ"), "Akwa");
    await ecrire(screen.getByLabelText("Arrivée"), "Limbé centre");
    await userEvent.click(publier());
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
    expect(envois[0]).toMatchObject({
      depart: { ville: "Douala", point: "Akwa" },
      arrivee: { ville: "Limbé", point: "Limbé centre" },
    });
  });

  it("ne propose pas de saisir les villes quand le serveur les donne", async () => {
    rendreConducteur();
    await attendreEcran();
    expect(screen.queryByLabelText("Ville de départ")).toBeNull();
  });
});

describe("Conducteur · états", () => {
  it("affiche le chargement en gardant l'en-tête et le retour", async () => {
    rendreConducteur({ latenceMs: 300 });
    const chargement = await screen.findByRole("status", { name: "Chargement du formulaire" });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Proposer mon trajet" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/covoit");
    expect(screen.queryByRole("button", { name: /Publier le trajet/ })).toBeNull();
    await attendreEcran();
    expect(screen.queryByRole("status", { name: "Chargement du formulaire" })).toBeNull();
  });

  it("affiche l'état vide quand aucune voiture n'est déclarée", async () => {
    formulaire((f) => ({ ...f, vehicule: "", immatriculation: "" }));
    expect(await screen.findByText("Aucune voiture déclarée")).toBeInTheDocument();
    expect(
      screen.getByText("Déclare ta voiture et fais vérifier tes pièces pour proposer un trajet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publier le trajet/ })).toBeNull();
  });

  it("affiche l'erreur de chargement et recharge au toucher de « Réessayer »", async () => {
    let enPanne = true;
    rendreConducteur({
      operations: (originale) => [
        implementer(voyageur.OP_FORMULAIRE_PUBLICATION, (p, ctx) => {
          if (enPanne) throw new ErreurReseau();
          return (
            originale(voyageur.OP_FORMULAIRE_PUBLICATION.nom).repondre as (
              p: void,
              ctx: unknown,
            ) => c.FormulairePublication
          )(p, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alerte).toHaveTextContent("Impossible de charger le formulaire");
    // L'en-tête reste là.
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    enPanne = false;
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
