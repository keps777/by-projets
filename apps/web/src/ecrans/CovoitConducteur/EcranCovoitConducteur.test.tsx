import { ErreurHttp, ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreConducteur, surveiller, transformer } from "./rendre-conducteur";

/** Attend que les chiffres et les listes soient affichés. */
async function attendreEcran() {
  await screen.findByText("Mes trajets publiés");
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

const main = () => document.querySelector("main") as HTMLElement;

/** Le scénario, avec une réponse de « mes trajets » modifiée. */
const mesTrajets = (modifier: (m: c.MesTrajetsCovoit) => c.MesTrajetsCovoit) =>
  rendreConducteur({
    operations: (originale) => [transformer(voyageur.OP_MES_TRAJETS_COVOIT, originale, modifier)],
  });

describe("CovoitConducteur · rendu de la planche (scénario de démo)", () => {
  it("affiche le titre, la pastille du conducteur, les deux sélecteurs", async () => {
    rendreConducteur();
    await attendreEcran();

    // Le titre de l'écran est celui de la coquille, lu par les lecteurs d'écran seulement.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Covoiturage · je conduis (proposer mon trajet)",
    );
    const entete = document.querySelector("header") as HTMLElement;
    expect(within(entete).getByText("Covoiturage")).toBeInTheDocument();
    expect(within(entete).getByText("Samuel · vérifié · 4,9 ★")).toBeInTheDocument();

    const mode = screen.getByRole("group", { name: "Type de trajet" });
    expect(within(mode).getByRole("button", { name: "Entre villes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(mode).getByRole("button", { name: "En ville · Douala" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("glisse pour changer")).toBeInTheDocument();

    const role = screen.getByRole("group", { name: "Mon rôle" });
    expect(within(role).getByRole("button", { name: "Je suis passager" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(role).getByRole("button", { name: "Je conduis" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("affiche les trois chiffres : gains de la semaine, trajets, pièces", async () => {
    rendreConducteur();
    await attendreEcran();
    const texte = main().textContent ?? "";
    expect(texte).toContain("Semaine12 000reçus par MoMo");
    expect(texte).toContain("Trajets1120 annulation");
    expect(texte).toContain("PiècesOKpermis · carte grise");
  });

  it("affiche mes deux trajets publiés avec heure, jour, places et réservations", async () => {
    rendreConducteur();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Mes trajets publiés" });
    expect(bloc).toHaveTextContent("Mes trajets publiés2");

    expect(bloc).toHaveTextContent("08:30sam.");
    expect(bloc).toHaveTextContent("Douala → Kribi · 2 places");
    expect(bloc).toHaveTextContent("1 réservée · Aïcha N. · payée 4 000 · 1 libre");

    expect(bloc).toHaveTextContent("17:00dim.");
    expect(bloc).toHaveTextContent("Kribi → Douala · 3 places");
    expect(bloc).toHaveTextContent("0 réservée · visible par 240 voyageurs");
    expect(within(bloc).getAllByRole("button", { name: "Gérer" })).toHaveLength(2);
  });

  it("affiche les passagers qui cherchent une voiture, avec « Proposer 08:30 »", async () => {
    rendreConducteur();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Passagers qui cherchent une voiture" });
    expect(bloc).toHaveTextContent("sur tes trajets");
    expect(bloc).toHaveTextContent("Marthe N. · Douala → Kribi · dimanche matin · 1 place · 4,7 ★");
    expect(bloc).toHaveTextContent("Éric et Nadia · Kribi → Douala · dimanche · 2 places");
    expect(within(bloc).getByRole("button", { name: "Proposer 08:30" })).toBeInTheDocument();
    expect(within(bloc).getByRole("button", { name: "Proposer 17:00" })).toBeInTheDocument();
  });

  it("affiche la mention de paiement, avec les frais lus dans les données", async () => {
    mesTrajets((m) => ({ ...m, fraisParPlace: 300 }));
    await attendreEcran();
    expect(
      screen.getByText(
        "Tu es payé par MoMo à l'arrivée, quand le passager confirme ou 2 h après l'heure prévue. AfriMove garde 300 F par place. Partage de frais, pas de bénéfice.",
      ),
    ).toBeInTheDocument();
  });

  it("garde la mention de la planche (250 F par place) avec les données de démonstration", async () => {
    rendreConducteur();
    await attendreEcran();
    expect(screen.getByText(/AfriMove garde 250 F par place/)).toBeInTheDocument();
  });

  it("montre le bouton « Proposer mon trajet », avec « touche 1 » seulement en conception", async () => {
    rendreConducteur();
    await attendreEcran();
    const bouton = screen.getByRole("button", { name: /Proposer mon trajet/ });
    expect(bouton).toHaveTextContent("Proposer mon trajettrajet, places, prix · publié en 10 s");
    expect(bouton).not.toHaveTextContent("touche 1");
  });

  it("écrit « touche 1 · … » sur le bouton avec le flag conception", async () => {
    rendreConducteur({ conception: true });
    await attendreEcran();
    expect(screen.getByRole("button", { name: /Proposer mon trajet/ })).toHaveTextContent(
      "touche 1 · trajet, places, prix · publié en 10 s",
    );
  });

  it("nomme tout ce qui se touche : boutons de l'écran avec un nom accessible", async () => {
    rendreConducteur();
    await attendreEcran();
    // Deux « Gérer », deux « Proposer », le bouton du bas, les quatre segments des sélecteurs.
    const boutons = screen.getAllByRole("button");
    expect(boutons).toHaveLength(2 + 2 + 1 + 4);
    for (const bouton of boutons) expect(bouton).toHaveAccessibleName();
  });
});

describe("CovoitConducteur · mes chiffres selon les données", () => {
  it("écrit « 2 annulations » au pluriel et « À faire » quand les pièces ne sont pas toutes validées", async () => {
    mesTrajets((m) => ({ ...m, resume: { ...m.resume, annulations: 2, piecesOk: false } }));
    await attendreEcran();
    const texte = main().textContent ?? "";
    expect(texte).toContain("Trajets1122 annulations");
    expect(texte).toContain("PiècesÀ fairepermis · carte grise");
  });

  it("n'affiche pas « vérifié » pour un conducteur non vérifié", async () => {
    mesTrajets((m) => ({ ...m, conducteur: { ...m.conducteur, verifie: false } }));
    await attendreEcran();
    expect(screen.getByText("Samuel · à vérifier · 4,9 ★")).toBeInTheDocument();
    expect(screen.queryByText(/vérifié/)).toBeNull();
  });

  it("colore l'heure : vert avec une réservation, ambre sans", async () => {
    rendreConducteur();
    await attendreEcran();
    expect(screen.getByText("08:30")).toHaveAttribute("data-ton", "vert");
    expect(screen.getByText("17:00")).toHaveAttribute("data-ton", "ambre");
  });

  it("n'écrit pas « libre » quand toutes les places sont réservées, et liste chaque passager", async () => {
    mesTrajets((m) => ({
      ...m,
      publies: [
        {
          id: "t1",
          departA: "2027-01-09T08:30:00.000+01:00",
          depart: "Douala",
          arrivee: "Kribi",
          places: 3,
          placesReservees: 3,
          reservations: [
            { passager: "Aïcha N.", places: 1, montantPaye: 4000 },
            { passager: "Paul M.", places: 2, montantPaye: 8000 },
          ],
        },
      ],
    }));
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Mes trajets publiés" });
    expect(bloc).toHaveTextContent("3 réservées · Aïcha N. · payée 4 000 · Paul M. · payée 8 000");
    expect(bloc).not.toHaveTextContent("libre");
    expect(bloc).toHaveTextContent("Mes trajets publiés1");
  });
});

describe("CovoitConducteur · gérer un trajet", () => {
  it("« Gérer » déplie le détail du trajet (prix, passagers) et se referme", async () => {
    rendreConducteur();
    await attendreEcran();
    const gerer = screen.getAllByRole("button", { name: "Gérer" });
    expect(gerer[0]).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(gerer[0] as HTMLElement);
    expect(gerer[0]).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(gerer[0]?.getAttribute("aria-controls") ?? "");
    expect(detail).toHaveTextContent("Prix d'une place : 4 000 F");
    expect(detail).toHaveTextContent("Aïcha N. · 1 place · payée 4 000");

    await userEvent.click(gerer[0] as HTMLElement);
    expect(gerer[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Prix d'une place/)).toBeNull();
  });

  it("dit qu'aucune réservation n'est faite sur le trajet sans passager", async () => {
    rendreConducteur();
    await attendreEcran();
    await userEvent.click(screen.getAllByRole("button", { name: "Gérer" })[1] as HTMLElement);
    expect(screen.getByText("Aucune réservation pour le moment.")).toBeInTheDocument();
  });
});

describe("CovoitConducteur · navigation", () => {
  it("« En ville · Douala » ouvre CovoitVille", async () => {
    const { routeur } = rendreConducteur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "En ville · Douala" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit/ville"));
  });

  it("« Je suis passager » ouvre Covoit", async () => {
    const { routeur } = rendreConducteur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Je suis passager" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
  });

  it("« Entre villes » et « Je conduis » (déjà choisis) laissent sur l'écran", async () => {
    const { routeur } = rendreConducteur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Entre villes" }));
    await userEvent.click(screen.getByRole("button", { name: "Je conduis" }));
    expect(pathname(routeur)).toBe("/covoit/conducteur");
  });

  it("« Proposer mon trajet » ouvre la publication d'un conducteur vérifié", async () => {
    const { routeur } = rendreConducteur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: /Proposer mon trajet/ }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit/proposer"));
  });
});

describe("CovoitConducteur · conducteur non vérifié", () => {
  const nonVerifie = () =>
    mesTrajets((m) => ({
      ...m,
      conducteur: { ...m.conducteur, verifie: false },
      resume: { ...m.resume, piecesOk: false },
    }));

  it("voit le parcours de vérification au lieu de la publication", async () => {
    const { routeur } = nonVerifie();
    await attendreEcran();
    expect(
      screen.queryByRole("region", { name: "Vérifie tes pièces avant de publier" }),
    ).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Proposer mon trajet/ }));
    const carte = await screen.findByRole("region", {
      name: "Vérifie tes pièces avant de publier",
    });
    expect(carte).toHaveTextContent("Pièce d'identité");
    expect(carte).toHaveTextContent("Permis de conduire");
    expect(carte).toHaveTextContent("Carte grise");
    expect(carte).toHaveTextContent("Voiture");
    expect(carte).toHaveTextContent("Tu pourras publier dès qu'elles sont validées.");
    expect(pathname(routeur)).toBe("/covoit/conducteur");
  });

  it("un conducteur vérifié ne voit jamais ce parcours", async () => {
    rendreConducteur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: /Proposer mon trajet/ }));
    expect(
      screen.queryByRole("region", { name: "Vérifie tes pièces avant de publier" }),
    ).toBeNull();
  });
});

describe("CovoitConducteur · proposer un trajet à un passager", () => {
  it("« Proposer 08:30 » propose le trajet de 08:30 à Marthe, qui quitte la liste", async () => {
    const propositions: c.ProposerADemande[] = [];
    rendreConducteur({
      operations: (originale) => [
        surveiller(voyageur.OP_PROPOSER_A_DEMANDE, originale, (p) => propositions.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Proposer 08:30" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Proposer 08:30" })).toBeNull(),
    );
    expect(propositions).toEqual([{ demandeId: "demande-1", trajetId: "trajet-1" }]);
    expect(screen.getByRole("status")).toHaveTextContent("Proposition envoyée à Marthe N.");
    expect(screen.getByRole("button", { name: "Proposer 17:00" })).toBeInTheDocument();
  });

  it("« Proposer 17:00 » propose le trajet de 17:00 à Éric et Nadia", async () => {
    const propositions: c.ProposerADemande[] = [];
    rendreConducteur({
      operations: (originale) => [
        surveiller(voyageur.OP_PROPOSER_A_DEMANDE, originale, (p) => propositions.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Proposer 17:00" }));
    await waitFor(() => expect(propositions).toHaveLength(1));
    expect(propositions[0]).toEqual({ demandeId: "demande-2", trajetId: "trajet-2" });
  });

  it("ne propose qu'une fois quand on touche deux fois de suite", async () => {
    const propositions: c.ProposerADemande[] = [];
    rendreConducteur({
      operations: (originale) => [
        implementer(voyageur.OP_PROPOSER_A_DEMANDE, async (p, ctx) => {
          propositions.push(p);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (
            originale(voyageur.OP_PROPOSER_A_DEMANDE.nom).repondre as (
              p: c.ProposerADemande,
              ctx: unknown,
            ) => c.ResultatProposition
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.dblClick(screen.getByRole("button", { name: "Proposer 08:30" }));
    await waitFor(() => expect(propositions).toHaveLength(1));
  });

  it("affiche un message d'échec, garde la demande et permet de réessayer", async () => {
    let essais = 0;
    rendreConducteur({
      operations: (originale) => [
        implementer(voyageur.OP_PROPOSER_A_DEMANDE, (p, ctx) => {
          essais += 1;
          if (essais === 1) throw new ErreurReseau();
          return (
            originale(voyageur.OP_PROPOSER_A_DEMANDE.nom).repondre as (
              p: c.ProposerADemande,
              ctx: unknown,
            ) => c.ResultatProposition
          )(p, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Proposer 08:30" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La proposition n'a pas abouti. Réessaie.",
    );
    expect(screen.getByRole("button", { name: "Proposer 08:30" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Proposer 08:30" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Proposer 08:30" })).toBeNull(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("recharge la liste quand la demande n'existe plus (404)", async () => {
    let lectures = 0;
    rendreConducteur({
      operations: (originale) => [
        surveiller(voyageur.OP_MES_TRAJETS_COVOIT, originale, () => (lectures += 1)),
        implementer(voyageur.OP_PROPOSER_A_DEMANDE, () => {
          throw new ErreurHttp(404, "Demande inconnue", "demande_inconnue");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Proposer 08:30" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(lectures).toBeGreaterThanOrEqual(2));
  });
});

describe("CovoitConducteur · états", () => {
  it("affiche le chargement en gardant l'en-tête, sans bouton du bas", async () => {
    rendreConducteur({ latenceMs: 300 });
    const chargement = await screen.findByRole("status", { name: "Chargement de tes trajets" });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("group", { name: "Type de trajet" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mon rôle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Proposer mon trajet/ })).toBeNull();
    await attendreEcran();
    expect(screen.queryByRole("status", { name: "Chargement de tes trajets" })).toBeNull();
    expect(screen.getByRole("button", { name: /Proposer mon trajet/ })).toBeInTheDocument();
  });

  it("dit quand aucun trajet n'est publié et qu'aucun passager ne cherche", async () => {
    mesTrajets((m) => ({ ...m, publies: [], demandes: [] }));
    await attendreEcran();
    expect(screen.getByText("Tu n'as publié aucun trajet pour le moment.")).toBeInTheDocument();
    expect(
      screen.getByText("Aucun passager ne cherche de voiture sur tes trajets pour le moment."),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mes trajets publiés" })).toHaveTextContent(
      "Mes trajets publiés0",
    );
    // Les chiffres, la mention et le bouton restent là.
    expect(main().textContent).toContain("Semaine12 000");
    expect(screen.getByRole("button", { name: /Proposer mon trajet/ })).toBeInTheDocument();
  });

  it("affiche l'erreur de chargement et recharge au toucher de « Réessayer »", async () => {
    let enPanne = true;
    rendreConducteur({
      operations: (originale) => [
        implementer(voyageur.OP_MES_TRAJETS_COVOIT, (p, ctx) => {
          if (enPanne) throw new ErreurReseau();
          return (
            originale(voyageur.OP_MES_TRAJETS_COVOIT.nom).repondre as (
              p: undefined,
              ctx: unknown,
            ) => c.MesTrajetsCovoit
          )(p as undefined, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alerte).toHaveTextContent("Impossible de charger tes trajets");
    // L'en-tête reste là, pas le bouton de publication.
    expect(screen.getByRole("group", { name: "Mon rôle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Proposer mon trajet/ })).toBeNull();
    enPanne = false;
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
