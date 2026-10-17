import { ErreurHttp, implementer, simulerFlux, voyageur } from "@afrimove/api-client";
import { DEPART_BETA_0800 } from "@afrimove/fixtures";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DEPART_ID,
  horlogeManuelle,
  rendreSiegePay,
  surveiller,
  transformer,
  type OptionsRenduSiegePay,
} from "./rendre-siegepay";

/** Attend que l'écran soit affiché (le plan et le récapitulatif sont là). */
async function attendreEcran() {
  await screen.findByRole("group", { name: "Plan des sièges" });
}

const siege = (numero: number, etat: string) =>
  screen.getByRole("button", { name: `Siège ${numero}, ${etat}` });
const boutonPayer = () => screen.getByRole("button", { name: /^Payer et recevoir le billet/ });
const moyen = (nom: string) => screen.getByRole("button", { name: nom });
const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

describe("SiegePay · rendu de la planche", () => {
  it("affiche le rappel du départ, le plan, le voyageur, le récapitulatif et le bouton du scénario de démo", async () => {
    rendreSiegePay();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "Bêta Express · VIP" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Douala Akwa → Yaoundé Mvan/)).toHaveTextContent(
      "Douala Akwa → Yaoundé Mvan · 08:00 · 3 h 30",
    );

    expect(screen.getByRole("button", { name: "Pour moi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: "Pour un proche" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "À plusieurs" })).toBeInTheDocument();

    // Plan : 16 sièges, 7 pris, le 7 est le mien.
    for (const numero of [1, 2, 5, 9, 10, 14, 15]) {
      expect(siege(numero, "pris")).toBeDisabled();
    }
    for (const numero of [3, 4, 6, 8, 11, 12, 13, 16]) {
      expect(siege(numero, "libre")).toBeEnabled();
    }
    expect(siege(7, "choisi")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Choisis ta place")).toBeInTheDocument();
    expect(screen.getByText("chauffeur")).toBeInTheDocument();
    expect(screen.getByText("9 places libres")).toBeInTheDocument();
    expect(screen.getByText(/^Siège/, { selector: "span" })).toHaveTextContent(
      "Siège 7 · côté fenêtre · près de la porte",
    );

    expect(screen.getByText("Aïcha Ngo · 6 91 22 10 08")).toBeInTheDocument();
    expect(moyen("MTN MoMo")).toHaveAttribute("aria-pressed", "true");
    expect(moyen("Orange Money")).toHaveAttribute("aria-pressed", "false");
    expect(moyen("Carte")).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("Billet Bêta Express VIP").nextElementSibling).toHaveTextContent(
      "7 500",
    );
    const frais = screen.getByText(/^Frais de service AfriMove/);
    expect(frais).toHaveTextContent("(offerts avec JOURJ)");
    expect(frais.nextElementSibling).toHaveTextContent("250 0");
    expect(frais.nextElementSibling?.querySelector("s")).toHaveTextContent("250");

    expect(boutonPayer()).toHaveTextContent("confirmation MoMo sur ton téléphone");
    expect(boutonPayer()).toHaveTextContent("7 500 F");
    expect(
      screen.getByText("L'argent du billet va à Bêta Express. AfriMove ne le garde pas."),
    ).toBeInTheDocument();
  });

  it("n'affiche le badge « TOUCHE 2 » et « touche 3 · » que si le flag conception est actif", async () => {
    rendreSiegePay();
    await attendreEcran();
    expect(screen.queryByText("TOUCHE 2")).not.toBeInTheDocument();
    expect(screen.queryByText(/touche 3/)).not.toBeInTheDocument();
  });

  it("affiche le badge « TOUCHE 2 » et « touche 3 · » avec le flag conception", async () => {
    rendreSiegePay({ conception: true });
    await attendreEcran();
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent("touche 3 · confirmation MoMo sur ton téléphone");
  });

  it("n'a aucun bouton grisé (hors sièges pris) et nomme chaque bouton rond", async () => {
    rendreSiegePay();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) {
      if (/pris$/.test(bouton.getAttribute("aria-label") ?? "")) continue;
      expect(bouton).toBeEnabled();
    }
    expect(screen.getByRole("link", { name: "Retour aux départs" })).toBeInTheDocument();
  });

  it("mène aux autres écrans comme la maquette : départs, proche, groupe, voyageur", async () => {
    rendreSiegePay();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour aux départs" })).toHaveAttribute(
      "href",
      "/voyager",
    );
    expect(screen.getByRole("link", { name: "Pour un proche" })).toHaveAttribute("href", "/proche");
    expect(screen.getByRole("link", { name: "À plusieurs" })).toHaveAttribute("href", "/groupe");
    expect(screen.getByRole("link", { name: "modifier" })).toHaveAttribute("href", "/moi");
  });

  it.each([
    ["Pour un proche", "/proche"],
    ["À plusieurs", "/groupe"],
    ["modifier", "/moi"],
    ["Retour aux départs", "/voyager"],
  ])("ouvre l'écran suivant quand on touche « %s »", async (nom, chemin) => {
    const { routeur } = rendreSiegePay();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: nom }));
    await waitFor(() => expect(pathname(routeur)).toBe(chemin));
  });

  it("garde les frais de service sur une ligne à part, jamais ajoutés au prix du billet", async () => {
    rendreSiegePay({
      operations: (originale) => [
        transformer(voyageur.OP_DEVIS, originale, (devis) => ({
          lignes: [
            { code: "billet", libelle: "Billet Bêta Express VIP", montant: 7500 },
            { code: "frais_voyageur", libelle: "Frais de service AfriMove", montant: 250 },
          ],
          total: devis.total + 250,
        })),
      ],
    });
    await attendreEcran();
    expect(screen.getByText("Billet Bêta Express VIP").nextElementSibling).toHaveTextContent(
      /^7 500$/,
    );
    const frais = screen.getByText("Frais de service AfriMove");
    expect(frais.nextElementSibling).toHaveTextContent(/^250$/);
    expect(screen.queryByText(/offerts avec/)).not.toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent("7 750 F");
  });

  it("accorde « place libre » au singulier", async () => {
    // Le plan en temps réel remplace l'instantané : on lui donne un plan où seul mon siège reste.
    rendreSiegePay({
      flux: () => [
        simulerFlux(voyageur.CANAL_PLAN_SIEGES, (p, ctx) => {
          ctx.emettre({
            type: "plan",
            plan: {
              departId: p.departId,
              capacite: 16,
              sieges: Array.from({ length: 16 }, (_, i) => ({
                numero: i + 1,
                etat: i + 1 === 7 ? "a_moi" : "pris",
              })),
              libres: 1,
              mon: { departId: p.departId, siege: 7, jusqua: "2027-01-05T07:53:00.000+01:00" },
              versionPlan: 5,
            },
          });
        }),
      ],
    });
    await attendreEcran();
    expect(await screen.findByText("1 place libre")).toBeInTheDocument();
  });
});

describe("SiegePay · choisir une place", () => {
  it("bloque le siège libre touché pour l'utilisateur et décrit le siège choisi", async () => {
    const blocages: unknown[] = [];
    rendreSiegePay({
      operations: (originale) => [
        surveiller(voyageur.OP_BLOQUER_SIEGE, originale, (p) => blocages.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(siege(8, "libre"));
    expect(blocages).toEqual([{ departId: DEPART_ID, siege: 8 }]);
    expect(siege(8, "choisi")).toHaveAttribute("aria-pressed", "true");
    expect(siege(7, "libre")).toBeInTheDocument();
    expect(screen.getByText(/^Siège/, { selector: "span" })).toHaveTextContent("Siège 8");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ne relâche pas le siège choisi quand on le retouche", async () => {
    const blocages: unknown[] = [];
    rendreSiegePay({
      operations: (originale) => [
        surveiller(voyageur.OP_BLOQUER_SIEGE, originale, (p) => blocages.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(siege(7, "choisi"));
    expect(blocages).toEqual([]);
    expect(siege(7, "choisi")).toHaveAttribute("aria-pressed", "true");
  });

  it("signale un siège pris entre-temps (409) sans perdre la place ni le moyen de paiement", async () => {
    rendreSiegePay({
      operations: () => [
        implementer(voyageur.OP_BLOQUER_SIEGE, () => {
          throw new ErreurHttp(409, "Siège indisponible", "siege_indisponible");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(moyen("Orange Money"));

    await userEvent.click(siege(8, "libre"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le siège 8 vient d'être pris par un autre voyageur. Choisis une autre place.",
    );
    expect(siege(7, "choisi")).toBeInTheDocument();
    expect(siege(8, "libre")).toBeInTheDocument();
    expect(moyen("Orange Money")).toHaveAttribute("aria-pressed", "true");
  });

  it("signale l'échec du blocage sans le présenter comme un siège pris", async () => {
    rendreSiegePay({
      operations: () => [
        implementer(voyageur.OP_BLOQUER_SIEGE, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(siege(8, "libre"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cette place n'a pas pu être bloquée. Réessaie.",
    );
    expect(siege(7, "choisi")).toBeInTheDocument();
  });

  it("grise en direct le siège pris par un autre voyageur, sans toucher à la saisie", async () => {
    const horloge = horlogeManuelle();
    rendreSiegePay({ horlogeClient: horloge, departId: DEPART_BETA_0800.id });
    await attendreEcran();
    await userEvent.click(moyen("Orange Money"));
    expect(siege(3, "libre")).toBeEnabled();

    // Le mock fait prendre le siège 3 par un autre voyageur après 30 s.
    await act(async () => {
      await horloge.avancer(30_000);
    });
    expect(siege(3, "pris")).toBeDisabled();
    expect(siege(7, "choisi")).toBeInTheDocument();
    expect(moyen("Orange Money")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signale que le siège choisi vient d'être pris par un autre voyageur et libère le choix", async () => {
    const horloge = horlogeManuelle();
    rendreSiegePay({
      horlogeClient: horloge,
      departId: DEPART_BETA_0800.id,
      flux: () => [
        simulerFlux(voyageur.CANAL_PLAN_SIEGES, (p, ctx) => {
          ctx.planifier(1000, () =>
            ctx.emettre({
              type: "siege",
              departId: p.departId,
              siege: 7,
              etat: "pris",
              versionPlan: 99,
            }),
          );
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(moyen("Carte"));
    expect(siege(7, "choisi")).toBeInTheDocument();

    await act(async () => {
      await horloge.avancer(1000);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le siège 7 vient d'être pris par un autre voyageur. Choisis une autre place.",
    );
    expect(siege(7, "pris")).toBeDisabled();
    expect(screen.getByText("Touche une place libre")).toBeInTheDocument();
    expect(moyen("Carte")).toHaveAttribute("aria-pressed", "true");
  });

  it("libère la place quand le blocage de 15 minutes est terminé", async () => {
    // L'horloge de l'application est 16 minutes après la prise du siège 7 (07:38 + 15 min = 07:53).
    rendreSiegePay({ horloge: { maintenant: () => new Date("2027-01-05T07:54:00+01:00") } });
    await attendreEcran();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ta place n'est plus bloquée. Touche-la de nouveau pour la garder.",
    );
    expect(siege(7, "libre")).toBeEnabled();
    expect(screen.getByText("Touche une place libre")).toBeInTheDocument();
  });

  it("demande de choisir une place quand aucune n'est tenue, sans paiement", async () => {
    const commandes: unknown[] = [];
    rendreSiegePay({
      operations: (originale) => [
        transformer(voyageur.OP_PLAN_SIEGES, originale, (plan) => ({
          ...plan,
          mon: undefined,
          sieges: plan.sieges.map((s) =>
            s.etat === "a_moi" ? { ...s, etat: "libre" as const } : s,
          ),
        })),
        surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
      ],
    });
    await attendreEcran();
    expect(screen.getByText("Touche une place libre")).toBeInTheDocument();
    expect(siege(7, "libre")).toBeEnabled();

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent("Choisis ta place avant de payer.");
    expect(commandes).toEqual([]);
  });
});

/** Opérations de paiement surveillées : les commandes créées et les paiements demandés. */
function surveillerPaiement(
  commandes: unknown[],
  paiements: unknown[],
): NonNullable<OptionsRenduSiegePay["operations"]> {
  return (originale) => [
    surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
    surveiller(voyageur.OP_PAYER_COMMANDE, originale, (p) => paiements.push(p)),
  ];
}

describe("SiegePay · payer", () => {
  it("demande la confirmation MoMo sur le téléphone puis ouvre le billet", async () => {
    const commandes: unknown[] = [];
    const paiements: unknown[] = [];
    const horloge = horlogeManuelle();
    const { routeur } = rendreSiegePay({
      horlogeClient: horloge,
      operations: surveillerPaiement(commandes, paiements),
    });
    await attendreEcran();

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Demande envoyée. Confirme le paiement sur ton téléphone avec ton code MTN MoMo.",
    );
    expect(commandes).toEqual([{ departId: DEPART_ID, sieges: [7], pour: "moi" }]);
    expect(paiements).toEqual([
      { commandeId: "cmd-1", moyen: "mtn_momo", telephone: "+237691221008" },
    ]);
    expect(pathname(routeur)).toBe(`/depart/${DEPART_ID}`);

    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe("/billet/billet-cmd-1"));
  });

  it("paie avec Orange Money quand c'est le moyen choisi", async () => {
    const paiements: unknown[] = [];
    const horloge = horlogeManuelle();
    rendreSiegePay({
      horlogeClient: horloge,
      operations: surveillerPaiement([], paiements),
    });
    await attendreEcran();
    await userEvent.click(moyen("Orange Money"));
    expect(boutonPayer()).toHaveTextContent("confirmation Orange Money sur ton téléphone");

    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    expect(paiements).toEqual([
      { commandeId: "cmd-1", moyen: "orange_money", telephone: "+237691221008" },
    ]);
  });

  it("paie le siège que l'utilisateur vient de choisir", async () => {
    const commandes: unknown[] = [];
    rendreSiegePay({ operations: surveillerPaiement(commandes, []) });
    await attendreEcran();
    await userEvent.click(siege(12, "libre"));
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    expect(commandes).toEqual([{ departId: DEPART_ID, sieges: [12], pour: "moi" }]);
  });

  it("ne crée qu'une commande quand on touche deux fois le bouton", async () => {
    const commandes: unknown[] = [];
    rendreSiegePay({ operations: surveillerPaiement(commandes, []) });
    await attendreEcran();
    await userEvent.dblClick(boutonPayer());
    await screen.findByRole("status");
    expect(commandes).toHaveLength(1);
  });

  it("passe par l'écran Paiement pour la carte, sans demander de paiement mobile", async () => {
    const paiements: unknown[] = [];
    const { routeur } = rendreSiegePay({ operations: surveillerPaiement([], paiements) });
    await attendreEcran();
    await userEvent.click(moyen("Carte"));
    expect(boutonPayer()).toHaveTextContent("paiement par carte à l'étape suivante");

    await userEvent.click(boutonPayer());
    await waitFor(() => expect(pathname(routeur)).toBe("/paiement/cmd-1"));
    expect(paiements).toEqual([]);
  });

  it("annonce l'échec, relâche la place et permet de recommencer avec une nouvelle commande", async () => {
    const commandes: unknown[] = [];
    let refus = true;
    const { routeur } = rendreSiegePay({
      operations: (originale) => [
        surveiller(voyageur.OP_CREER_COMMANDE, originale, (p) => commandes.push(p)),
        transformer(voyageur.OP_PAYER_COMMANDE, originale, (paiement) => {
          const reponse = refus ? { ...paiement, statut: "echoue" as const } : paiement;
          refus = false;
          return reponse;
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(moyen("Orange Money"));

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas abouti. Ta place est libérée : choisis-la de nouveau pour réessayer.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(pathname(routeur)).toBe(`/depart/${DEPART_ID}`);
    expect(screen.getByText("Touche une place libre")).toBeInTheDocument();
    expect(siege(7, "libre")).toBeEnabled();
    expect(moyen("Orange Money")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(siege(7, "libre"));
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(commandes).toHaveLength(2);
  });

  it("annonce le délai dépassé quand le serveur déclare le paiement expiré", async () => {
    const { routeur } = rendreSiegePay({
      operations: (originale) => [
        transformer(voyageur.OP_STATUT_PAIEMENT, originale, (paiement) => ({
          ...paiement,
          statut: "expire" as const,
        })),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le délai de confirmation est dépassé. Ta place est libérée : choisis-la de nouveau pour réessayer.",
    );
    expect(pathname(routeur)).toBe(`/depart/${DEPART_ID}`);
    expect(screen.getByText("Touche une place libre")).toBeInTheDocument();
  });

  it("annonce le délai dépassé quand la commande a expiré sans nouvelle du serveur", async () => {
    // L'application est 20 minutes après la commande, qui expire 15 minutes après sa création.
    const { routeur } = rendreSiegePay({
      horloge: { maintenant: () => new Date("2027-01-05T07:58:00+01:00") },
      operations: (originale) => [
        transformer(voyageur.OP_PLAN_SIEGES, originale, (plan) =>
          plan.mon
            ? { ...plan, mon: { ...plan.mon, jusqua: "2027-01-05T09:00:00.000+01:00" } }
            : plan,
        ),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le délai de confirmation est dépassé.",
    );
    expect(pathname(routeur)).toBe(`/depart/${DEPART_ID}`);
  });

  it("garde la saisie et propose de réessayer quand le paiement ne démarre pas", async () => {
    rendreSiegePay({
      operations: () => [
        implementer(voyageur.OP_PAYER_COMMANDE, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas pu démarrer. Réessaie.",
    );
    expect(siege(7, "choisi")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("relâche le choix quand la commande est refusée parce que le siège est pris (409)", async () => {
    rendreSiegePay({
      operations: () => [
        implementer(voyageur.OP_CREER_COMMANDE, () => {
          throw new ErreurHttp(409, "Siège indisponible", "siege_indisponible");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le siège 7 vient d'être pris par un autre voyageur.",
    );
    expect(screen.getByText("Touche une place libre")).toBeInTheDocument();
  });
});

describe("SiegePay · états", () => {
  it("affiche un état de chargement dans le style nuit, avec le retour aux départs", async () => {
    rendreSiegePay({ latenceMs: 150 });
    expect(await screen.findByRole("status", { name: "Chargement du départ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux départs" })).toHaveAttribute(
      "href",
      "/voyager",
    );
    await attendreEcran();
    expect(screen.queryByRole("status", { name: "Chargement du départ" })).not.toBeInTheDocument();
  });

  it("affiche l'erreur de chargement et recharge au clic sur « Réessayer »", async () => {
    let pannes = 1;
    rendreSiegePay({
      operations: (originale) => [
        implementer(voyageur.OP_DETAIL_DEPART, (params, ctx) => {
          if (pannes-- > 0) throw new ErreurHttp(500, "Panne", "PANNE");
          const repondre = originale(voyageur.OP_DETAIL_DEPART.nom).repondre as (
            p: unknown,
            c: unknown,
          ) => never;
          return repondre(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Impossible de charger ce départ")).toBeInTheDocument();
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 1, name: "Bêta Express · VIP" }),
    ).toBeInTheDocument();
  });

  it("affiche l'état vide quand le départ n'existe plus (404)", async () => {
    rendreSiegePay({
      operations: () => [
        implementer(voyageur.OP_DETAIL_DEPART, () => {
          throw new ErreurHttp(404, "Départ introuvable", "INTROUVABLE");
        }),
      ],
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Ce départ n'est plus proposé" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux départs" })).toBeInTheDocument();
  });

  it("affiche l'état vide quand le départ est complet", async () => {
    rendreSiegePay({
      operations: (originale) => [
        transformer(voyageur.OP_PLAN_SIEGES, originale, (plan) => ({
          ...plan,
          mon: undefined,
          libres: 0,
          sieges: plan.sieges.map((s) => ({ ...s, etat: "pris" as const })),
        })),
      ],
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Plus aucune place" }),
    ).toBeInTheDocument();
  });
});
