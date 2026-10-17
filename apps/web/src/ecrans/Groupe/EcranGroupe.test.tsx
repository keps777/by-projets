import { ErreurHttp, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rendreGroupe, surveiller, transformer } from "./test-outils";

/** Attend que l'écran soit affiché (le groupe est là). */
async function attendreEcran() {
  await screen.findByRole("button", { name: /^Payer ma part/ });
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;
const recherche = (routeur: { state: { location: { search: string } } }) =>
  routeur.state.location.search;
const payerMaPart = () => screen.getByRole("button", { name: /^Payer ma part/ });
const toutPayer = () => screen.getByRole("button", { name: /^ou tout payer/ });
const mode = (nom: string) => screen.getByRole("button", { name: nom });
const plus = () => screen.getByRole("button", { name: "Plus de voyageurs" });
const moins = () => screen.getByRole("button", { name: "Moins de voyageurs" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Groupe · rendu de la planche", () => {
  it("affiche les modes, le départ, le stepper, les sièges, « Qui paie quoi » et les actions du scénario de démo", async () => {
    rendreGroupe();
    await attendreEcran();

    expect(screen.getByRole("heading", { level: 1, name: "À plusieurs" })).toBeInTheDocument();
    expect(
      screen.getByText("Places côte à côte, bus entier, cagnotte entre amis"),
    ).toBeInTheDocument();

    expect(mode("Groupe · 2 à 12")).toHaveAttribute("aria-pressed", "true");
    expect(mode("Bus entier")).toHaveAttribute("aria-pressed", "false");
    expect(mode("Cagnotte")).toHaveAttribute("aria-pressed", "false");

    // Le 10 janvier 2027 est un dimanche : l'écran écrit le jour du calendrier, pas « sam. » de la maquette.
    expect(screen.getByText("Douala → Bafoussam · dim. 10 janv.")).toBeInTheDocument();
    expect(screen.getByText("07:30 Alpha")).toBeInTheDocument();

    const stepper = screen.getByRole("group", { name: "Nombre de voyageurs" });
    expect(within(stepper).getByText("6")).toBeInTheDocument();
    expect(within(stepper).getByText("voyageurs · 6 places côte à côte")).toBeInTheDocument();

    const sieges = screen.getAllByRole("listitem").filter((li) => /^\d+$/.test(li.textContent));
    expect(sieges.map((li) => li.textContent)).toEqual(["11", "12", "13", "15", "16", "17"]);
    expect(
      screen.getByText(
        "Sièges 11 à 17 réservés ensemble, 15 min pour payer. Les billets partent à chaque numéro.",
      ),
    ).toBeInTheDocument();

    const cagnotte = screen.getByRole("region", { name: "Qui paie quoi" });
    expect(within(cagnotte).getByText("6 × 3 500 = 21 000")).toBeInTheDocument();
    const lignes = within(cagnotte).getAllByRole("listitem");
    expect(lignes.map((ligne) => ligne.textContent)).toEqual([
      "ANAïcha · moipayé",
      "PKPaul K.payé",
      "+4Marthe, Jo, Éric, Nadialien envoyé",
    ]);

    expect(screen.getByRole("button", { name: "Partager sur WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Louer un bus de 30 · devis" })).toBeInTheDocument();
    expect(payerMaPart()).toHaveTextContent("Payer ma part · 3 500 F");
    expect(toutPayer()).toHaveTextContent("ou tout payer pour le groupe : 21 000 F");
  });

  it("n'affiche ni badge « TOUCHE n » ni emoji, même avec le flag conception", async () => {
    rendreGroupe({ conception: true });
    await attendreEcran();
    expect(screen.queryByText(/^TOUCHE/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("n'a aucun bouton grisé et nomme les boutons sans texte", async () => {
    rendreGroupe();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) {
      expect(bouton).toBeEnabled();
    }
    expect(moins()).toBeInTheDocument();
    expect(plus()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
  });

  it("ouvre l'accueil quand on touche « Retour »", async () => {
    const { routeur } = rendreGroupe();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/voyager"));
  });

  it("compte les minutes qui restent avant la fin du blocage des sièges", async () => {
    rendreGroupe({
      operations: (originale) => [
        transformer(voyageur.OP_GROUPE, originale, (groupe) => ({
          ...groupe,
          blocageJusqua: "2027-01-05T07:47:30.000+01:00",
        })),
      ],
    });
    await attendreEcran();
    expect(screen.getByText(/réservés ensemble, 10 min pour payer/)).toBeInTheDocument();
  });

  it("affiche la teinte de chaque statut : payé en vert, lien envoyé en ambre, en attente en gris", async () => {
    rendreGroupe({
      operations: (originale) => [
        transformer(voyageur.OP_GROUPE, originale, (groupe) => ({
          ...groupe,
          cagnotte: {
            ...groupe.cagnotte,
            participants: [
              { nom: "Léa", initiales: "LE", places: 1, statut: "en_attente" as const },
              ...groupe.cagnotte.participants,
            ],
          },
        })),
      ],
    });
    await attendreEcran();
    expect(screen.getByText("en attente")).toHaveAttribute("data-statut", "en_attente");
    expect(screen.getAllByText("payé")[0]).toHaveAttribute("data-statut", "paye");
    expect(screen.getByText("lien envoyé")).toHaveAttribute("data-statut", "lien_envoye");
  });

  it("ne dit « moi » que pour mon compte quand le profil est connu", async () => {
    rendreGroupe({
      operations: () => [
        implementer(
          voyageur.OP_PROFIL,
          (): contrats.Profil => ({
            id: "pers-autre",
            prenom: "Autre",
            nom: "Personne",
            initiales: "AP",
            telephone: "+237691000000",
            pieceVerifiee: false,
            inscritDepuis: "2026-01-01T08:00:00.000+01:00",
            langue: "fr",
          }),
        ),
      ],
    });
    await attendreEcran();
    const cagnotte = screen.getByRole("region", { name: "Qui paie quoi" });
    await waitFor(() => expect(within(cagnotte).queryByText("moi")).not.toBeInTheDocument());
    expect(within(cagnotte).getByText("Aïcha")).toBeInTheDocument();
  });
});

describe("Groupe · mode et nombre de voyageurs", () => {
  it("redemande les sièges une seule fois après plusieurs touches de « + » et change le nombre tout de suite", async () => {
    const creations: contrats.CreerGroupe[] = [];
    const { routeur } = rendreGroupe({
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_GROUPE, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(plus());
    await userEvent.click(plus());
    const stepper = screen.getByRole("group", { name: "Nombre de voyageurs" });
    expect(within(stepper).getByText("8")).toBeInTheDocument();
    expect(within(stepper).getByText("voyageurs · 8 places côte à côte")).toBeInTheDocument();

    await waitFor(() => expect(creations).toHaveLength(1));
    expect(creations[0]).toEqual({
      departId: expect.stringMatching(/^dep-/) as unknown as string,
      voyageurs: 8,
      mode: "groupe",
      placesCoteACote: true,
    });
    // Le nouveau groupe est dans l'adresse, avec ses sièges.
    await waitFor(() => expect(recherche(routeur)).toMatch(/groupe=groupe-1/));
    expect(within(stepper).getByText("8")).toBeInTheDocument();
  });

  it("garde le nombre de voyageurs entre 2 et 12", async () => {
    rendreGroupe({
      operations: (originale) => [
        transformer(voyageur.OP_GROUPE, originale, (groupe) => ({ ...groupe, voyageurs: 12 })),
      ],
    });
    await attendreEcran();
    const stepper = screen.getByRole("group", { name: "Nombre de voyageurs" });
    expect(within(stepper).getByText("12")).toBeInTheDocument();
    expect(plus()).toBeDisabled();
    expect(moins()).toBeEnabled();
  });

  it("passe en « Bus entier » puis « Cagnotte » en redemandant le groupe dans ce mode", async () => {
    const creations: contrats.CreerGroupe[] = [];
    rendreGroupe({
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_GROUPE, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(mode("Bus entier"));
    expect(mode("Bus entier")).toHaveAttribute("aria-pressed", "true");
    expect(mode("Groupe · 2 à 12")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(creations).toHaveLength(1));
    expect(creations[0]).toMatchObject({ mode: "bus_entier", voyageurs: 6 });

    await userEvent.click(mode("Cagnotte"));
    expect(mode("Cagnotte")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(creations).toHaveLength(2));
    expect(creations[1]).toMatchObject({ mode: "cagnotte", voyageurs: 6 });
    expect(mode("Cagnotte")).toHaveAttribute("aria-pressed", "true");
  });

  it("revient au groupe précédent et le dit quand le serveur refuse la mise à jour", async () => {
    rendreGroupe({
      operations: () => [
        implementer(voyageur.OP_CREER_GROUPE, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();

    await userEvent.click(plus());
    expect(
      await screen.findByText("Le groupe n'a pas pu être mis à jour. Réessaie."),
    ).toBeInTheDocument();
    const stepper = screen.getByRole("group", { name: "Nombre de voyageurs" });
    expect(within(stepper).getByText("6")).toBeInTheDocument();
  });
});

describe("Groupe · payer", () => {
  it("crée la commande de ma part (un siège) et ouvre le paiement", async () => {
    const commandes: contrats.CreerCommande[] = [];
    const { routeur } = rendreGroupe({
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(payerMaPart());
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/paiement\/cmd-groupe/));
    expect(commandes).toEqual([
      {
        departId: expect.stringMatching(/^dep-/) as unknown as string,
        sieges: [11],
        pour: "plusieurs",
      },
    ]);
  });

  it("crée la commande de tout le groupe (les six sièges) et ouvre le paiement", async () => {
    const commandes: contrats.CreerCommande[] = [];
    const { routeur } = rendreGroupe({
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(toutPayer());
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/paiement\/cmd-groupe/));
    expect(commandes).toHaveLength(1);
    expect(commandes[0]?.sieges).toEqual([11, 12, 13, 15, 16, 17]);
  });

  it("ne crée qu'une commande si l'on touche deux fois le bouton", async () => {
    const commandes: contrats.CreerCommande[] = [];
    rendreGroupe({
      latenceMs: 30,
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.dblClick(payerMaPart());
    await waitFor(() => expect(commandes.length).toBeGreaterThan(0));
    expect(commandes).toHaveLength(1);
  });

  it("dit que les sièges ne sont plus bloqués (409) et reste sur l'écran", async () => {
    const { routeur } = rendreGroupe({
      operations: () => [
        implementer(voyageur.OP_CREER_COMMANDE, () => {
          throw new ErreurHttp(409, "Sièges pris", "siege_pris");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(payerMaPart());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ces sièges ne sont plus bloqués pour toi.",
    );
    expect(pathname(routeur)).toBe("/groupe");
  });

  it("dit que le paiement n'a pas pu démarrer quand le serveur échoue, puis laisse réessayer", async () => {
    let appels = 0;
    const { routeur } = rendreGroupe({
      operations: (originale) => [
        implementer(voyageur.OP_CREER_COMMANDE, (p, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (
            originale(voyageur.OP_CREER_COMMANDE.nom).repondre as (
              p: unknown,
              c: unknown,
            ) => contrats.Commande
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(toutPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas pu démarrer. Réessaie.",
    );
    await userEvent.click(toutPayer());
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/paiement\//));
    expect(appels).toBe(2);
  });

  it("n'ouvre pas le paiement tant que la mise à jour demandée n'est pas faite", async () => {
    const commandes: contrats.CreerCommande[] = [];
    rendreGroupe({
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(plus());
    await userEvent.click(payerMaPart());
    expect(commandes).toHaveLength(0);
    expect(payerMaPart()).toHaveAttribute("aria-busy", "true");
  });

  it("annonce la fin du blocage des sièges quand le délai de 15 minutes est passé", async () => {
    rendreGroupe({
      operations: (originale) => [
        transformer(voyageur.OP_GROUPE, originale, (groupe) => ({
          ...groupe,
          blocageJusqua: "2027-01-05T07:30:00.000+01:00",
        })),
      ],
    });
    await attendreEcran();
    expect(screen.getByRole("alert")).toHaveTextContent("Le blocage des sièges est terminé.");
    expect(screen.queryByText(/réservés ensemble/)).not.toBeInTheDocument();
  });
});

describe("Groupe · partager et louer un bus", () => {
  it("ouvre WhatsApp avec le lien de la cagnotte et la part de chacun", async () => {
    const ouvrir = vi.spyOn(window, "open").mockReturnValue(null);
    rendreGroupe();
    await attendreEcran();

    await userEvent.click(screen.getByRole("button", { name: "Partager sur WhatsApp" }));
    expect(ouvrir).toHaveBeenCalledTimes(1);
    const [adresse, cible] = ouvrir.mock.calls[0] ?? [];
    expect(cible).toBe("_blank");
    const url = new URL(String(adresse));
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    const texte = url.searchParams.get("text") ?? "";
    expect(texte).toContain("Douala → Bafoussam, dim. 10 janv. à 07:30");
    expect(texte).toContain("3 500 F");
    expect(texte).toContain("https://afrimove.example/groupe/groupe-demo");
  });

  it("demande le devis d'un bus de 30 places et annonce l'heure de la réponse", async () => {
    const devis: contrats.DemandeDevisBus[] = [];
    rendreGroupe({
      operations: (originale) => [
        surveiller(voyageur.OP_DEVIS_BUS, originale, (p) => devis.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(screen.getByRole("button", { name: "Louer un bus de 30 · devis" }));
    const info = await screen.findByText(
      "Demande de devis envoyée pour un bus de 30. Réponse de la compagnie avant 09:38.",
    );
    expect(info).toHaveAttribute("role", "status");
    expect(devis).toEqual([
      { departId: expect.stringMatching(/^dep-/) as unknown as string, places: 30 },
    ]);
  });

  it("annonce le montant quand la compagnie a déjà chiffré le devis", async () => {
    rendreGroupe({
      operations: (originale) => [
        transformer(voyageur.OP_DEVIS_BUS, originale, (devis) => ({
          ...devis,
          statut: "chiffre" as const,
          montant: 450000,
        })),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Louer un bus de 30 · devis" }));
    const info = await screen.findByText("Devis pour un bus de 30 : 450 000 F.");
    expect(info).toHaveAttribute("role", "status");
  });

  it("dit que la demande de devis n'a pas abouti quand le serveur échoue", async () => {
    rendreGroupe({
      operations: () => [
        implementer(voyageur.OP_DEVIS_BUS, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Louer un bus de 30 · devis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La demande de devis n'a pas abouti. Réessaie.",
    );
  });
});

describe("Groupe · d'où vient le groupe", () => {
  it("ouvre le groupe indiqué dans l'adresse", async () => {
    const lus: string[] = [];
    rendreGroupe({
      demonstration: false,
      entree: "/groupe?groupe=g-42",
      operations: (originale) => [
        surveiller(voyageur.OP_GROUPE, originale, (p) => lus.push(p.groupeId)),
      ],
    });
    await attendreEcran();
    expect(lus).toEqual(["g-42"]);
  });

  it("crée un groupe de deux voyageurs sur le départ indiqué dans l'adresse", async () => {
    const creations: contrats.CreerGroupe[] = [];
    rendreGroupe({
      demonstration: false,
      entree: "/groupe?depart=dep-0800",
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_GROUPE, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    expect(creations).toEqual([
      { departId: "dep-0800", voyageurs: 2, mode: "groupe", placesCoteACote: true },
    ]);
  });

  it("affiche l'état vide, avec le retour à l'accueil, quand aucun départ n'est choisi", async () => {
    const { routeur } = rendreGroupe({ demonstration: false });
    expect(await screen.findByText("Aucun départ choisi")).toBeInTheDocument();
    expect(
      screen.getByText("Choisis ton bus à l'accueil, puis reviens ici pour voyager à plusieurs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "À plusieurs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/voyager"));
  });

  it("affiche l'état vide quand le groupe est introuvable (404)", async () => {
    rendreGroupe({
      demonstration: false,
      entree: "/groupe?groupe=inconnu",
      operations: () => [
        implementer(voyageur.OP_GROUPE, () => {
          throw new ErreurHttp(404, "Introuvable", "groupe_introuvable");
        }),
      ],
    });
    expect(await screen.findByText("Aucun départ choisi")).toBeInTheDocument();
  });

  it("affiche l'état de chargement avant le groupe", async () => {
    rendreGroupe({ latenceMs: 80 });
    expect(await screen.findByRole("status", { name: "Chargement du groupe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "À plusieurs" })).toBeInTheDocument();
    await attendreEcran();
    expect(screen.queryByRole("status", { name: "Chargement du groupe" })).not.toBeInTheDocument();
  });

  it("affiche l'erreur avec un bouton qui recharge, puis l'écran", async () => {
    let appels = 0;
    rendreGroupe({
      operations: (originale) => [
        implementer(voyageur.OP_GROUPE, (p, ctx) => {
          appels += 1;
          if (appels <= 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (
            originale(voyageur.OP_GROUPE.nom).repondre as (
              p: unknown,
              c: unknown,
            ) => contrats.Groupe
          )(p, ctx);
        }),
      ],
    });
    expect(await screen.findByText("Impossible de charger le groupe")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByText("Impossible de charger le groupe")).not.toBeInTheDocument();
  });

  it("réessaie la création du groupe quand elle échoue", async () => {
    let appels = 0;
    rendreGroupe({
      demonstration: false,
      entree: "/groupe?depart=dep-0800",
      operations: (originale) => [
        implementer(voyageur.OP_CREER_GROUPE, (p, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (
            originale(voyageur.OP_CREER_GROUPE.nom).repondre as (
              p: unknown,
              c: unknown,
            ) => contrats.Groupe
          )(p, ctx);
        }),
      ],
    });
    expect(await screen.findByText("Impossible de charger le groupe")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(appels).toBe(2);
  });
});
