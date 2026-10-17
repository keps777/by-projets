import { ErreurHttp, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  BILLET_ID,
  rendreCourse,
  surveiller,
  transformer,
  type OptionsRenduCourse,
} from "./rendre-course";

/** Attend que l'écran soit affiché (la proposition est lue). */
async function attendreEcran() {
  await screen.findByText("Partir 07:10");
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;
const iso = (heure: string) => `2027-01-05T${heure}:00.000+01:00`;
const carte = () => screen.getByRole("img", { name: /^Carte : / });
const bouton = (nom: string | RegExp) => screen.getByRole("button", { name: nom });

/** Réponse du scénario pour `OP_PROPOSITION_COURSE`, modifiée par `modifier`. */
function propositionModifiee(
  modifier: (vue: contrats.PropositionCourse) => contrats.PropositionCourse,
): NonNullable<OptionsRenduCourse["operations"]> {
  return (originale) => [
    transformer(voyageur.OP_PROPOSITION_COURSE, originale, (reponse) => modifier(reponse)),
  ];
}

describe("Course · rendu de la planche", () => {
  it("affiche la carte, l'heure de départ, les modes, le chauffeur, le récapitulatif et le bouton de la planche", async () => {
    rendreCourse();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "Moto ou taxi vers la gare" }),
    ).toBeInTheDocument();
    expect(carte()).toHaveAccessibleName(
      "Carte : de chez toi à la gare d'Akwa, 12 minutes en moto",
    );
    expect(within(carte()).getByText("Chez toi · Bonapriso")).toBeInTheDocument();
    expect(within(carte()).getByText("Gare Akwa · Bêta Express")).toBeInTheDocument();
    expect(within(carte()).getByText("Jean · 3 min")).toBeInTheDocument();

    expect(screen.getByText("Pour être au quai 20 min avant")).toBeInTheDocument();
    expect(screen.getByText("Partir 07:10")).toBeInTheDocument();
    expect(screen.getByText(/^12 min de trajet/)).toHaveTextContent("12 min de trajetbus à 08:00");

    expect(bouton("Moto · 700 F")).toHaveAttribute("aria-pressed", "true");
    expect(bouton("Taxi · 1 500 F")).toHaveAttribute("aria-pressed", "false");
    expect(bouton("Avec 2 valises")).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("JK")).toBeInTheDocument();
    expect(screen.getByText(/^Jean K\. · moto-taxi/)).toHaveTextContent(
      "Jean K. · moto-taxi vérifié · 4,8 ★",
    );
    expect(screen.getByText("Casque passager · LT 203 MT · connaît la gare")).toBeInTheDocument();

    expect(screen.getByText("Jean vient te chercher à").nextSibling).toHaveTextContent("07:10");
    expect(screen.getByText("Arrivée au quai Bêta Express").nextSibling).toHaveTextContent("07:22");
    expect(
      screen.getByText("Payé avec le billet · un seul paiement").nextSibling,
    ).toHaveTextContent("700 F");

    expect(bouton("Réserver la moto pour 07:10")).toBeInTheDocument();
    expect(
      screen.getByText("Rappel 10 min avant. Annulation gratuite jusqu'à 06:55."),
    ).toBeInTheDocument();
  });

  it("nomme les boutons comme la planche, sans aucun bouton grisé, et n'a ni badge de conception ni barre d'onglets", async () => {
    rendreCourse({ conception: true });
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour au billet" })).toBeInTheDocument();
    expect(bouton("Appeler Jean")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button")) expect(b).toBeEnabled();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navigation" })).not.toBeInTheDocument();
  });

  it("n'écrit ni « vérifié » ni note quand le chauffeur n'en a pas", async () => {
    rendreCourse({
      operations: propositionModifiee((p) => {
        const { note: _note, ...chauffeur } = p.chauffeur;
        return { ...p, chauffeur: { ...chauffeur, verifie: false } };
      }),
    });
    await attendreEcran();
    expect(screen.getByText(/^Jean K\. · moto-taxi/)).toHaveTextContent("Jean K. · moto-taxi");
    expect(screen.queryByText(/vérifié/)).not.toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it("reprend les minutes de rappel, l'heure d'annulation gratuite et le trajet du serveur", async () => {
    rendreCourse({
      operations: propositionModifiee((p) => ({
        ...p,
        trajetMinutes: 8,
        rappelMinutes: 15,
        annulationGratuiteJusqua: iso("06:45"),
      })),
    });
    await screen.findByText("8 min de trajet", { exact: false });
    expect(
      screen.getByText("Rappel 15 min avant. Annulation gratuite jusqu'à 06:45."),
    ).toBeInTheDocument();
    expect(carte()).toHaveAccessibleName("Carte : de chez toi à la gare d'Akwa, 8 minutes en moto");
  });

  it("dit que la course n'est pas payée avec le billet quand elle se règle à part", async () => {
    rendreCourse({ operations: propositionModifiee((p) => ({ ...p, payeAvecBillet: false })) });
    await attendreEcran();
    expect(screen.getByText("Prix de la course").nextSibling).toHaveTextContent("700 F");
    expect(screen.queryByText(/un seul paiement/)).not.toBeInTheDocument();
  });
});

describe("Course · heure de départ", () => {
  it("avance le départ quand le bus part plus tôt : bus − 20 min au quai − trajet", async () => {
    rendreCourse({ operations: propositionModifiee((p) => ({ ...p, busA: iso("07:40") })) });
    await screen.findByText("Partir 07:08");
    expect(screen.getByText(/^12 min de trajet/)).toHaveTextContent("bus à 07:40");
    expect(screen.getByText("Jean vient te chercher à").nextSibling).toHaveTextContent("07:08");
    expect(screen.getByText("Arrivée au quai Bêta Express").nextSibling).toHaveTextContent("07:20");
    expect(bouton("Réserver la moto pour 07:08")).toBeInTheDocument();
  });

  it("avance le départ quand le trajet est plus long", async () => {
    rendreCourse({
      operations: propositionModifiee((p) => ({
        ...p,
        trajetMinutes: 45,
        arriveeQuai: iso("07:55"),
      })),
    });
    await screen.findByText("Partir 06:55");
    expect(screen.getByText("Arrivée au quai Bêta Express").nextSibling).toHaveTextContent("07:40");
  });

  it("réserve à l'heure affichée", async () => {
    const appels: contrats.ReserverCourse[] = [];
    rendreCourse({
      operations: (originale) => [
        transformer(voyageur.OP_PROPOSITION_COURSE, originale, (p) => ({
          ...p,
          busA: iso("07:40"),
        })),
        surveiller(voyageur.OP_RESERVER_COURSE, originale, (p) => appels.push(p)),
      ],
    });
    await screen.findByText("Partir 07:08");
    await userEvent.click(bouton("Réserver la moto pour 07:08"));
    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toEqual({ billetId: BILLET_ID, mode: "moto", partirA: iso("07:08") });
  });
});

describe("Course · choix du véhicule", () => {
  it("passe au taxi : prix, carte et bouton suivent", async () => {
    rendreCourse();
    await attendreEcran();
    await userEvent.click(bouton("Taxi · 1 500 F"));
    expect(bouton("Taxi · 1 500 F")).toHaveAttribute("aria-pressed", "true");
    expect(bouton("Moto · 700 F")).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Payé avec le billet · un seul paiement").nextSibling,
    ).toHaveTextContent("1 500 F");
    expect(bouton("Réserver le taxi pour 07:10")).toBeInTheDocument();
    expect(carte()).toHaveAccessibleName(
      "Carte : de chez toi à la gare d'Akwa, 12 minutes en taxi",
    );
  });

  it("« Avec 2 valises » se choisit aussi, au prix de la course proposée", async () => {
    rendreCourse();
    await attendreEcran();
    await userEvent.click(bouton("Avec 2 valises"));
    expect(bouton("Avec 2 valises")).toHaveAttribute("aria-pressed", "true");
    expect(bouton(/^Moto/)).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Payé avec le billet · un seul paiement").nextSibling,
    ).toHaveTextContent("700 F");
    expect(bouton("Réserver la course pour 07:10")).toBeInTheDocument();
  });

  it("reprend le mode coché par le serveur", async () => {
    rendreCourse({
      operations: propositionModifiee((p) => ({
        ...p,
        modes: p.modes.map((m) => ({ ...m, choisi: m.mode === "taxi" })),
      })),
    });
    await attendreEcran();
    expect(bouton("Taxi · 1 500 F")).toHaveAttribute("aria-pressed", "true");
    expect(bouton("Réserver le taxi pour 07:10")).toBeInTheDocument();
  });
});

describe("Course · réservation et navigation", () => {
  it("réserve la moto pour 07:10, sans aucun paiement, puis ouvre le billet", async () => {
    const reservations: contrats.ReserverCourse[] = [];
    const paiements: string[] = [];
    const { routeur } = rendreCourse({
      operations: (originale) => [
        surveiller(voyageur.OP_RESERVER_COURSE, originale, (p) => reservations.push(p)),
        implementer(voyageur.OP_PAYER_COMMANDE, () => {
          paiements.push("payer");
          throw new Error("la course ne se paie pas ici");
        }),
        implementer(voyageur.OP_CREER_COMMANDE, () => {
          paiements.push("commande");
          throw new Error("la course ne crée pas de commande");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(bouton("Réserver la moto pour 07:10"));
    await waitFor(() => expect(pathname(routeur)).toBe(`/billet/${BILLET_ID}`));
    expect(reservations).toEqual([{ billetId: BILLET_ID, mode: "moto", partirA: iso("07:10") }]);
    expect(paiements).toEqual([]);
  });

  it("réserve le taxi quand il est choisi", async () => {
    const reservations: contrats.ReserverCourse[] = [];
    const { routeur } = rendreCourse({
      operations: (originale) => [
        surveiller(voyageur.OP_RESERVER_COURSE, originale, (p) => reservations.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(bouton("Taxi · 1 500 F"));
    await userEvent.click(bouton("Réserver le taxi pour 07:10"));
    await waitFor(() => expect(pathname(routeur)).toBe(`/billet/${BILLET_ID}`));
    expect(reservations).toEqual([{ billetId: BILLET_ID, mode: "taxi", partirA: iso("07:10") }]);
  });

  it("n'envoie qu'une réservation quand on touche deux fois le bouton", async () => {
    const reservations: contrats.ReserverCourse[] = [];
    rendreCourse({
      latenceMs: 200,
      operations: (originale) => [
        surveiller(voyageur.OP_RESERVER_COURSE, originale, (p) => reservations.push(p)),
      ],
    });
    await screen.findByText("Partir 07:10");
    const reserver = bouton("Réserver la moto pour 07:10");
    await userEvent.click(reserver);
    await userEvent.click(reserver);
    await waitFor(() => expect(reservations.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 400));
    expect(reservations).toHaveLength(1);
  });

  it("reste sur l'écran et le dit quand la réservation échoue, puis laisse réessayer", async () => {
    let appels = 0;
    const { routeur } = rendreCourse({
      operations: (originale) => {
        const reponse = originale(voyageur.OP_RESERVER_COURSE.nom).repondre as (
          p: unknown,
          c: unknown,
        ) => unknown;
        return [
          implementer(voyageur.OP_RESERVER_COURSE, (p, ctx) => {
            appels += 1;
            if (appels === 1) throw new ErreurHttp(409, "plus de chauffeur", "pas_de_chauffeur");
            return reponse(p, ctx) as never;
          }),
        ];
      },
    });
    await attendreEcran();
    await userEvent.click(bouton("Réserver la moto pour 07:10"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La course n'a pas pu être réservée. Réessaie.",
    );
    expect(pathname(routeur)).toBe("/course");

    await userEvent.click(bouton("Réserver la moto pour 07:10"));
    await waitFor(() => expect(pathname(routeur)).toBe(`/billet/${BILLET_ID}`));
    expect(appels).toBe(2);
  });

  it("revient au billet avec « Retour au billet »", async () => {
    const { routeur } = rendreCourse();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour au billet" });
    expect(retour).toHaveAttribute("href", `/billet/${BILLET_ID}`);
    await userEvent.click(retour);
    await waitFor(() => expect(pathname(routeur)).toBe(`/billet/${BILLET_ID}`));
  });

  it("lit la proposition du billet de l'adresse", async () => {
    const lus: string[] = [];
    rendreCourse({
      url: "/course?billetId=billet-aicha",
      operations: (originale) => [
        surveiller(voyageur.OP_PROPOSITION_COURSE, originale, (p) => lus.push(p.billetId)),
      ],
    });
    await attendreEcran();
    expect(lus).toEqual(["billet-aicha"]);
    expect(screen.getByRole("link", { name: "Retour au billet" })).toHaveAttribute(
      "href",
      "/billet/billet-aicha",
    );
  });

  it("l'appel dit que le numéro du chauffeur n'est pas communiqué", async () => {
    rendreCourse();
    await attendreEcran();
    await userEvent.click(bouton("Appeler Jean"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Le numéro de Jean n'est pas disponible pour le moment.",
    );
  });
});

describe("Course · états", () => {
  it("montre le chargement dans le style nuit, avec « Retour au billet »", async () => {
    rendreCourse({ latenceMs: 50 });
    expect(await screen.findByRole("status", { name: "Chargement de la course" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("link", { name: "Retour au billet" })).toHaveAttribute(
      "href",
      `/billet/${BILLET_ID}`,
    );
    expect(screen.queryByRole("button", { name: /^Réserver/ })).not.toBeInTheDocument();
    await attendreEcran();
  });

  it.each([404, 403, 409])("montre l'état vide quand le serveur répond %i", async (statut) => {
    rendreCourse({
      operations: () => [
        implementer(voyageur.OP_PROPOSITION_COURSE, () => {
          throw new ErreurHttp(statut, "non", "pas_de_course");
        }),
      ],
    });
    expect(await screen.findByText("Pas de course à proposer")).toBeInTheDocument();
    expect(screen.queryByText(/Partir/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au billet" })).toBeInTheDocument();
  });

  it("montre l'erreur avec de quoi réessayer, puis la proposition", async () => {
    let appels = 0;
    rendreCourse({
      operations: (originale) => {
        const reponse = originale(voyageur.OP_PROPOSITION_COURSE.nom).repondre as (
          p: unknown,
          c: unknown,
        ) => unknown;
        return [
          implementer(voyageur.OP_PROPOSITION_COURSE, (p, ctx) => {
            appels += 1;
            if (appels === 1) throw new ErreurHttp(500, "panne", "panne");
            return reponse(p, ctx) as never;
          }),
        ];
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger la course");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(bouton("Réserver la moto pour 07:10")).toBeInTheDocument();
  });

  it("prend le billet de démonstration quand l'adresse n'en donne pas, en mode démo", async () => {
    rendreCourse({ url: "/course" });
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour au billet" })).toHaveAttribute(
      "href",
      `/billet/${BILLET_ID}`,
    );
  });

  it("montre l'état vide, sans lien de retour, quand l'adresse n'a pas de billet hors démonstration", async () => {
    rendreCourse({ url: "/course", demo: false });
    expect(await screen.findByText("Pas de course à proposer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Retour au billet" })).not.toBeInTheDocument();
  });
});
