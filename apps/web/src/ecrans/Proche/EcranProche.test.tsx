import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  horlogeManuelle,
  rendreProche,
  surveiller,
  transformer,
  type OptionsRenduProche,
} from "./rendre-proche";

/** Attend que l'écran soit affiché (la liste des proches est là). */
async function attendreEcran() {
  await screen.findByRole("group", { name: "Choisir le proche" });
}

const proche = (nom: string) => screen.getByRole("button", { name: nom });
const depart = (heure: string) => screen.getByRole("button", { name: new RegExp(`^${heure}`) });
const boutonPayer = () => screen.getByRole("button", { name: /^Payer ·/ });
const interrupteur = () =>
  screen.getByRole("switch", { name: /^Me prévenir/ }) as HTMLButtonElement;
const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

type Operations = NonNullable<OptionsRenduProche["operations"]>;

/** Journal des écritures du mock : commandes créées, paiements demandés, proches prévenus ou ajoutés. */
function journaux() {
  const commandes: contrats.CreerCommande[] = [];
  const paiements: contrats.PayerCommande[] = [];
  const prevenus: Array<{ billetId: string; procheId: string }> = [];
  const ajoutes: contrats.NouveauProche[] = [];
  const operations: Operations = (originale) => [
    surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
    surveiller(voyageur.OP_PAYER_COMMANDE, originale, (p) => paiements.push(p)),
    surveiller(voyageur.OP_PREVENIR_PROCHE, originale, (p) =>
      prevenus.push({ billetId: p.billetId, procheId: p.procheId }),
    ),
    surveiller(voyageur.OP_AJOUTER_PROCHE, originale, (p) => ajoutes.push(p)),
  ];
  return { commandes, paiements, prevenus, ajoutes, operations };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Proche · rendu de la planche", () => {
  it("affiche le scénario de démo : proches, destinataire, trajet, départs, paiement et bouton", async () => {
    rendreProche();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "Payer pour un proche" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Depuis Montréal, Paris ou Douala · il reçoit le billet par SMS"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");

    expect(proche("Maman")).toHaveAttribute("aria-pressed", "true");
    expect(proche("Paul")).toHaveAttribute("aria-pressed", "false");
    expect(proche("+ Nouveau numéro")).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("Maman · Thérèse Ngo")).toBeInTheDocument();
    expect(screen.getByText("+237 6 99 40 18 22")).toBeInTheDocument();
    expect(screen.getByText(/^Bafoussam/)).toHaveTextContent("Bafoussam → Douala");
    // Le 10 janvier 2027 est un dimanche : le jour de la semaine vient de la date, pas de la planche (« sam. »).
    expect(screen.getByText("dim. 10 janv.")).toBeInTheDocument();
    expect(screen.getByText("Départs dimanche")).toBeInTheDocument();
    expect(screen.getByText("elle choisit son siège au quai, ou toi ici")).toBeInTheDocument();

    const premier = depart("07:30");
    expect(premier).toHaveAttribute("aria-pressed", "true");
    expect(within(premier).getByText("Alpha Voyages")).toBeInTheDocument();
    expect(within(premier).getByText("VIP · clim")).toBeInTheDocument();
    expect(within(premier).getByText(/^14 places/)).toBeInTheDocument();
    expect(within(premier).getByText("5 500")).toBeInTheDocument();
    const second = depart("10:00");
    expect(second).toHaveAttribute("aria-pressed", "false");
    expect(within(second).getByText("Oméga Transports")).toBeInTheDocument();
    expect(within(second).getByText("classique")).toBeInTheDocument();
    expect(within(second).getByText("22 places")).toBeInTheDocument();
    expect(within(second).getByText("3 500")).toBeInTheDocument();

    expect(screen.getByText("Tu paies par carte · CAD")).toBeInTheDocument();
    expect(await screen.findByText("5 500 F + 250 F de frais")).toBeInTheDocument();
    expect(await screen.findByText("≈ 12,90 $ CA")).toBeInTheDocument();
    expect(interrupteur()).toHaveAttribute("aria-checked", "true");
    expect(interrupteur()).toHaveAccessibleName(
      "Me prévenir quand elle monte et quand elle arrive",
    );

    expect(boutonPayer()).toHaveTextContent("Payer · Maman reçoit son billet");
    expect(boutonPayer()).toHaveTextContent("SMS avec QR et code 4 chiffres");
    expect(await screen.findByText("5 750 F")).toBeInTheDocument();
    expect(
      screen.getByText("Elle n'a besoin ni de smartphone ni d'internet : le SMS suffit au quai."),
    ).toBeInTheDocument();
  });

  it("n'affiche le badge « TOUCHE 2 » et « touche 3 · » que si le flag conception est actif", async () => {
    rendreProche();
    await attendreEcran();
    expect(screen.queryByText("TOUCHE 2")).not.toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent("SMS avec QR et code 4 chiffres");
    expect(screen.queryByText(/touche 3/)).not.toBeInTheDocument();
  });

  it("affiche le badge « TOUCHE 2 » et « touche 3 · » avec le flag conception", async () => {
    rendreProche({ conception: true });
    await attendreEcran();
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent("touche 3 · SMS avec QR et code 4 chiffres");
  });

  it("montre le siège que je tiens sur le départ choisi, et seulement sur lui", async () => {
    rendreProche();
    await attendreEcran();
    expect(await within(depart("07:30")).findByText(/siège 7 côté fenêtre choisi/)).toBeVisible();
    expect(within(depart("10:00")).queryByText(/siège/)).not.toBeInTheDocument();

    await userEvent.click(depart("10:00"));
    expect(depart("10:00")).toHaveAttribute("aria-pressed", "true");
    expect(depart("07:30")).toHaveAttribute("aria-pressed", "false");
    expect(await within(depart("10:00")).findByText(/siège 7 côté fenêtre choisi/)).toBeVisible();
    expect(within(depart("07:30")).queryByText(/siège/)).not.toBeInTheDocument();
  });

  it("affiche la carte enregistrée seulement quand l'API en donne une", async () => {
    rendreProche();
    await attendreEcran();
    await screen.findByText("≈ 12,90 $ CA");
    expect(screen.queryByText(/Visa/)).not.toBeInTheDocument();
  });

  it("affiche la carte enregistrée donnée par les moyens de paiement", async () => {
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_MOYENS_PAIEMENT, originale, (moyens) =>
          moyens.map((m) => (m.code === "carte" ? { ...m, detail: "Visa ···· 4471" } : m)),
        ),
      ],
    });
    await attendreEcran();
    expect(await screen.findByText("Visa ···· 4471")).toBeInTheDocument();
  });

  it("n'écrit pas les frais quand ils sont offerts", async () => {
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_DEVIS, originale, () => ({
          lignes: [
            { code: "billet", libelle: "Billet", montant: 5500 },
            { code: "frais_voyageur", libelle: "Frais de service", montant: 0 },
          ],
          total: 5500,
        })),
      ],
    });
    await attendreEcran();
    await waitFor(() => expect(boutonPayer()).toHaveTextContent("5 500 F"));
    expect(boutonPayer()).not.toHaveTextContent("5 750 F");
    // « 5 500 F » : la ligne de détail du paiement et le prix du bouton.
    expect(screen.getAllByText("5 500 F")).toHaveLength(2);
    expect(screen.queryByText(/de frais/)).not.toBeInTheDocument();
  });

  it("écrit la devise et le montant approximatif donnés par la commande", async () => {
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_CREER_COMMANDE, originale, (commande) => ({
          ...commande,
          conversion: { devise: "EUR", montantMineur: 1190, approximatif: true },
        })),
      ],
    });
    await attendreEcran();
    expect(await screen.findByText("≈ 11,90 €")).toBeInTheDocument();
    expect(screen.getByText("Tu paies par carte · EUR")).toBeInTheDocument();
  });
});

describe("Proche · choisir le proche et le départ", () => {
  it("passe aux textes neutres pour un proche dont le genre n'est pas connu", async () => {
    rendreProche();
    await attendreEcran();
    await userEvent.click(proche("Paul"));

    expect(proche("Paul")).toHaveAttribute("aria-pressed", "true");
    expect(proche("Maman")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Maman · Thérèse Ngo")).not.toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent("Payer · Paul reçoit son billet");
    expect(interrupteur()).toHaveAccessibleName(
      "Me prévenir à la montée et à l'arrivée de ton proche",
    );
    expect(
      screen.getByText("ton proche choisit son siège au quai, ou toi ici"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ton proche n'a besoin ni de smartphone ni d'internet : le SMS suffit au quai.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\belle\b/i)).not.toBeInTheDocument();
  });

  it("crée la commande de la sélection, puis une nouvelle à chaque changement de proche ou de départ", async () => {
    const { commandes, operations } = journaux();
    rendreProche({ operations });
    await attendreEcran();

    await waitFor(() => expect(commandes).toHaveLength(1));
    expect(commandes[0]).toEqual({
      departId: expect.stringMatching(/^dep-/) as string,
      sieges: [7],
      pour: "proche",
      procheId: "maman",
      devise: "CAD",
    });

    await userEvent.click(proche("Paul"));
    await waitFor(() => expect(commandes).toHaveLength(2));
    expect(commandes[1]).toMatchObject({ procheId: "paul", sieges: [7] });

    await userEvent.click(depart("10:00"));
    await waitFor(() => expect(commandes).toHaveLength(3));
    expect(commandes[2]?.departId).not.toBe(commandes[1]?.departId);
    expect(commandes[2]).toMatchObject({ procheId: "paul" });
  });

  it("lit le trajet, le jour et la devise dans l'adresse", async () => {
    const recherches: contrats.RechercheDeparts[] = [];
    const { commandes, operations } = journaux();
    rendreProche({
      url: "/proche?depart=DLA&arrivee=YDE&jour=2027-01-12&devise=eur",
      operations: (originale) => [
        ...operations(originale),
        surveiller(voyageur.OP_RECHERCHER_DEPARTS, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    expect(recherches[0]).toEqual({ depart: "DLA", arrivee: "YDE", jour: "2027-01-12" });
    await waitFor(() => expect(commandes).toHaveLength(1));
    expect(commandes[0]).toMatchObject({ devise: "EUR" });
  });

  it("cherche Bafoussam → Douala, aujourd'hui, quand l'adresse ne dit rien", async () => {
    const recherches: contrats.RechercheDeparts[] = [];
    rendreProche({
      operations: (originale) => [
        surveiller(voyageur.OP_RECHERCHER_DEPARTS, originale, (p) => recherches.push(p)),
      ],
    });
    await attendreEcran();
    expect(recherches[0]).toEqual({ depart: "BAF", arrivee: "DLA" });
  });

  it("réserve la première place libre quand je n'en tiens aucune", async () => {
    const { commandes, operations } = journaux();
    rendreProche({
      operations: (originale) => [
        ...operations(originale),
        transformer(voyageur.OP_PLAN_SIEGES, originale, (plan) => {
          const { mon: _mon, ...sansBlocage } = plan;
          return {
            ...sansBlocage,
            sieges: plan.sieges.map((s) => ({ ...s, etat: s.numero < 4 ? "pris" : "libre" })),
          } as contrats.PlanSiegesVue;
        }),
      ],
    });
    await attendreEcran();
    await waitFor(() => expect(commandes).toHaveLength(1));
    expect(commandes[0]?.sieges).toEqual([4]);
    expect(within(depart("07:30")).queryByText(/siège/)).not.toBeInTheDocument();
  });
});

describe("Proche · nouveau numéro", () => {
  it("demande le prénom et le numéro, et refuse de payer tant qu'ils manquent", async () => {
    const { paiements, operations } = journaux();
    rendreProche({ operations });
    await attendreEcran();
    await userEvent.click(proche("+ Nouveau numéro"));

    expect(proche("+ Nouveau numéro")).toHaveAttribute("aria-pressed", "true");
    expect(proche("Maman")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("textbox", { name: "Prénom du proche" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Numéro du proche" })).toHaveValue("");
    expect(boutonPayer()).toHaveTextContent("Payer · ton proche reçoit son billet");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saisis le prénom et le numéro de ton proche avant de payer.",
    );
    expect(paiements).toEqual([]);
  });

  it("efface le message quand on change de proche", async () => {
    rendreProche();
    await attendreEcran();
    await userEvent.click(proche("+ Nouveau numéro"));
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.click(proche("Maman"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signale un numéro qui n'est pas un mobile camerounais", async () => {
    rendreProche();
    await attendreEcran();
    await userEvent.click(proche("+ Nouveau numéro"));
    const champ = screen.getByRole("textbox", { name: "Numéro du proche" });
    await userEvent.type(champ, "12345");
    await userEvent.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Numéro camerounais attendu : 9 chiffres, qui commencent par 6.",
    );
    await userEvent.clear(champ);
    await userEvent.type(champ, "699 12 34 56");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("crée la commande avec le passager saisi, au numéro normalisé", async () => {
    const { commandes, operations } = journaux();
    rendreProche({ operations });
    await attendreEcran();
    await waitFor(() => expect(commandes).toHaveLength(1));

    await userEvent.click(proche("+ Nouveau numéro"));
    await userEvent.type(screen.getByRole("textbox", { name: "Prénom du proche" }), "Esther");
    await userEvent.type(screen.getByRole("textbox", { name: "Numéro du proche" }), "699 12 34 56");

    await waitFor(() => expect(commandes).toHaveLength(2));
    expect(commandes[1]).toEqual({
      departId: commandes[0]?.departId,
      sieges: [7],
      pour: "proche",
      devise: "CAD",
      passagers: [{ nom: "Esther", telephone: "+237699123456" }],
    });
    expect(boutonPayer()).toHaveTextContent("Payer · Esther reçoit son billet");
  });
});

describe("Proche · payer", () => {
  it("paie la commande par carte, puis ouvre le billet quand le paiement est confirmé", async () => {
    const { commandes, paiements, prevenus, operations } = journaux();
    const horloge = horlogeManuelle();
    const { routeur } = rendreProche({ horlogeClient: horloge, operations });
    await attendreEcran();
    await screen.findByText("5 750 F");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Paiement envoyé. Si ta banque te le demande, confirme-le auprès d'elle.",
    );
    expect(commandes).toHaveLength(1);
    expect(paiements).toEqual([{ commandeId: "cmd-proche-1", moyen: "carte" }]);
    expect(pathname(routeur)).toBe("/proche");

    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe("/billet/billet-cmd-proche-1"));
    expect(prevenus).toEqual([{ billetId: "billet-cmd-proche-1", procheId: "maman" }]);
  });

  it("ne prévient pas le proche quand l'interrupteur est coupé", async () => {
    const { prevenus, operations } = journaux();
    const horloge = horlogeManuelle();
    const { routeur } = rendreProche({ horlogeClient: horloge, operations });
    await attendreEcran();
    await screen.findByText("5 750 F");

    await userEvent.click(interrupteur());
    expect(interrupteur()).toHaveAttribute("aria-checked", "false");
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe("/billet/billet-cmd-proche-1"));
    expect(prevenus).toEqual([]);
  });

  it("enregistre un nouveau proche avant de le prévenir", async () => {
    const { ajoutes, prevenus, operations } = journaux();
    const horloge = horlogeManuelle();
    const { routeur } = rendreProche({ horlogeClient: horloge, operations });
    await attendreEcran();
    await userEvent.click(proche("+ Nouveau numéro"));
    await userEvent.type(screen.getByRole("textbox", { name: "Prénom du proche" }), "Esther");
    await userEvent.type(screen.getByRole("textbox", { name: "Numéro du proche" }), "699123456");
    await waitFor(() => expect(boutonPayer()).toHaveTextContent("Payer · Esther"));

    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe("/billet/billet-cmd-proche-1"));
    expect(ajoutes).toEqual([
      { nom: "Esther", telephone: "+237699123456", prevenuALArrivee: true },
    ]);
    expect(prevenus).toEqual([{ billetId: "billet-cmd-proche-1", procheId: "proche-esther" }]);
  });

  it("ouvre le billet même si le proche n'a pas pu être prévenu", async () => {
    const horloge = horlogeManuelle();
    const { routeur } = rendreProche({
      horlogeClient: horloge,
      operations: (originale) => [
        transformer(voyageur.OP_PREVENIR_PROCHE, originale, () => {
          throw new ErreurHttp(500, "Panne simulée", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe("/billet/billet-cmd-proche-1"));
  });

  it("ne lance qu'un paiement quand on touche deux fois le bouton", async () => {
    const { commandes, paiements, operations } = journaux();
    rendreProche({ operations });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.dblClick(boutonPayer());
    await screen.findByRole("status");
    expect(paiements).toHaveLength(1);
    expect(commandes).toHaveLength(1);
  });

  it("paie même si la commande de la sélection n'est pas encore créée", async () => {
    const { commandes, paiements, operations } = journaux();
    rendreProche({ operations });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(proche("Paul"));
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    // Une seule commande par sélection : celle de Paul, créée pour le paiement, pas deux.
    await waitFor(() => expect(paiements).toHaveLength(1));
    expect(commandes.filter((c) => c.procheId === "paul")).toHaveLength(1);
  });

  it("annonce l'échec, abandonne la commande et en crée une nouvelle pour recommencer", async () => {
    const { commandes, paiements, operations } = journaux();
    const { routeur } = rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_PAYER_COMMANDE, originale, (paiement) => ({
          ...paiement,
          statut: "echoue" as const,
        })),
        ...operations(originale),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas abouti. Vérifie ta carte, puis réessaie.",
    );
    expect(pathname(routeur)).toBe("/proche");
    await waitFor(() => expect(commandes).toHaveLength(2));
    expect(paiements).toHaveLength(0);

    await userEvent.click(boutonPayer());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(pathname(routeur)).toBe("/proche");
  });

  it("annonce le délai dépassé quand le paiement expire", async () => {
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_PAYER_COMMANDE, originale, (paiement) => ({
          ...paiement,
          statut: "expire" as const,
        })),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le délai de paiement est dépassé. Réessaie.",
    );
  });

  it("annonce que le paiement n'a pas pu démarrer quand le serveur refuse, et repart d'une commande neuve", async () => {
    const { commandes, operations } = journaux();
    const { routeur } = rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_PAYER_COMMANDE, originale, () => {
          throw new ErreurHttp(503, "Paiement indisponible", "MODE_DEGRADE");
        }),
        ...operations(originale),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas pu démarrer. Réessaie.",
    );
    expect(pathname(routeur)).toBe("/proche");
    // La commande a pu expirer : la suivante est créée à neuf.
    await waitFor(() => expect(commandes).toHaveLength(2));
  });

  it("annonce que le prix n'a pas pu être calculé quand la commande échoue", async () => {
    const { paiements, operations } = journaux();
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_CREER_COMMANDE, originale, () => {
          throw new ErreurHttp(409, "Siège pris", "SIEGE_PRIS");
        }),
        ...operations(originale),
      ],
    });
    await attendreEcran();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le prix n'a pas pu être calculé. Réessaie.",
    );
    await userEvent.click(boutonPayer());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Le prix n'a pas pu être calculé"),
    );
    expect(paiements).toEqual([]);
  });

  it("dit que le départ est complet quand il ne reste aucune place à réserver", async () => {
    const { commandes, paiements, operations } = journaux();
    rendreProche({
      operations: (originale) => [
        ...operations(originale),
        transformer(voyageur.OP_PLAN_SIEGES, originale, (plan) => {
          const { mon: _mon, ...sansBlocage } = plan;
          return {
            ...sansBlocage,
            libres: 0,
            sieges: plan.sieges.map((s) => ({ ...s, etat: "pris" })),
          } as contrats.PlanSiegesVue;
        }),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce départ est complet. Choisis un autre départ.",
    );
    expect(commandes).toEqual([]);
    expect(paiements).toEqual([]);
  });

  it("ouvre l'authentification 3-D Secure dans un autre onglet, en https seulement", async () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_PAYER_COMMANDE, originale, (paiement) => ({
          ...paiement,
          urlAuthentification: "https://3ds.example/authentifier/123",
        })),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    expect(ouvrir).toHaveBeenCalledWith(
      "https://3ds.example/authentifier/123",
      "_blank",
      "noopener",
    );
  });

  it("n'ouvre jamais une adresse d'authentification qui n'est pas en https", async () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_PAYER_COMMANDE, originale, (paiement) => ({
          ...paiement,
          urlAuthentification: "http://3ds.example/authentifier/123",
        })),
      ],
    });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it("fige le choix du proche et du départ pendant que le paiement attend sa confirmation", async () => {
    const { commandes, operations } = journaux();
    rendreProche({ operations });
    await attendreEcran();
    await screen.findByText("5 750 F");
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");

    await userEvent.click(proche("Paul"));
    await userEvent.click(depart("10:00"));
    expect(proche("Maman")).toHaveAttribute("aria-pressed", "true");
    expect(depart("07:30")).toHaveAttribute("aria-pressed", "true");
    expect(commandes).toHaveLength(1);
  });
});

describe("Proche · états", () => {
  it("affiche un chargement aux couleurs de la planche, sans casser la mise en page", async () => {
    rendreProche({ latenceMs: 250 });
    expect(await screen.findByRole("status", { name: "Chargement des départs" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
    await attendreEcran();
    expect(
      screen.queryByRole("status", { name: "Chargement des départs" }),
    ).not.toBeInTheDocument();
  });

  it("dit qu'il n'y a aucun départ ce jour-là, avec le retour aux départs", async () => {
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_RECHERCHER_DEPARTS, originale, (recherche) => ({
          ...recherche,
          departs: [],
        })),
      ],
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Aucun départ ce jour-là" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reviens aux départs pour choisir un autre trajet ou un autre jour."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
    expect(screen.queryByRole("button", { name: /^Payer/ })).not.toBeInTheDocument();
  });

  it("affiche l'erreur de chargement et recharge au toucher de « Réessayer »", async () => {
    let panne = true;
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_RECHERCHER_DEPARTS, originale, (recherche) => {
          if (panne) throw new ErreurHttp(500, "Panne simulée", "PANNE");
          return recherche;
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Impossible de charger les départs",
    );
    expect(within(alerte).getByText("Vérifie ta connexion, puis réessaie.")).toBeInTheDocument();

    panne = false;
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.getByText("Maman · Thérèse Ngo")).toBeInTheDocument();
  });

  it("garde la page quand seul le prix est en panne, et l'annonce", async () => {
    rendreProche({
      operations: (originale) => [
        transformer(voyageur.OP_DEVIS, originale, () => {
          throw new ErreurHttp(500, "Panne simulée", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le prix n'a pas pu être calculé. Réessaie.",
    );
    expect(depart("07:30")).toBeInTheDocument();
  });
});
