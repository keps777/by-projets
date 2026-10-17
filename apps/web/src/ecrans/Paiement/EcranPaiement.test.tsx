import { ErreurHttp, implementer, simulerFlux, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMANDE_ID,
  horlogeManuelle,
  rendrePaiement,
  surveiller,
  transformer,
  type OptionsRenduPaiement,
} from "./rendre-paiement";

/** Attend que l'écran soit affiché (la commande et les moyens de paiement sont là). */
async function attendreEcran() {
  await screen.findByRole("button", { name: /MTN Mobile Money/ });
}

/** Ligne de moyen de paiement : le nom commence par celui du moyen (le bouton « Payer » répète « Orange Money »). */
const moyen = (nom: RegExp) => screen.getByRole("button", { name: new RegExp(`^${nom.source}`) });
const boutonPayer = () => screen.getByRole("button", { name: /^Payer 4 250 F/ });
const lienProche = () => screen.getByRole("link", { name: /Demander à un proche de payer/ });
const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

type Operations = NonNullable<OptionsRenduPaiement["operations"]>;

describe("Paiement · rendu de la planche", () => {
  it("affiche l'objet payé, le montant, le détail, les quatre moyens et le bouton du scénario de démo", async () => {
    rendrePaiement();
    await attendreEcran();

    expect(screen.getByRole("heading", { level: 1, name: "Paiement" })).toBeInTheDocument();
    expect(screen.getByText("Covoiturage Samuel · Douala → Kribi · 08:30")).toBeInTheDocument();

    expect(screen.getByText("À payer").nextElementSibling).toHaveTextContent(/^4 250 F$/);
    expect(screen.getByText("Trajet · 1 place").nextElementSibling).toHaveTextContent(/^4 000$/);
    expect(screen.getByText("Frais de service AfriMove").nextElementSibling).toHaveTextContent(
      /^250$/,
    );

    expect(screen.getByText("Avec quoi ?")).toBeInTheDocument();
    expect(moyen(/MTN Mobile Money/)).toHaveAttribute("aria-pressed", "true");
    expect(moyen(/MTN Mobile Money/)).toHaveTextContent(
      "6 91 22 10 08 · tu confirmes sur ton téléphone",
    );
    expect(moyen(/Orange Money/)).toHaveAttribute("aria-pressed", "false");
    expect(moyen(/Orange Money/)).toHaveTextContent("code #150# ou confirmation dans l'app Orange");
    expect(moyen(/Carte bancaire/)).toHaveAttribute("aria-pressed", "false");
    expect(moyen(/Carte bancaire/)).toHaveTextContent("Visa, Mastercard · aussi depuis l'étranger");
    expect(lienProche()).toHaveTextContent("il reçoit un lien, tu reçois le billet");

    expect(
      screen.getByText(
        "Paiement traité par un établissement agréé. Le prix du trajet va au conducteur à l'arrivée ; seuls les frais vont à AfriMove.",
      ),
    ).toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent("confirmation MoMo · billet par SMS en 10 s");
  });

  it("n'affiche le badge « TOUCHE 3 » que si le flag conception est actif", async () => {
    rendrePaiement();
    await attendreEcran();
    expect(screen.queryByText("TOUCHE 3")).not.toBeInTheDocument();
  });

  it("affiche le badge « TOUCHE 3 » avec le flag conception", async () => {
    rendrePaiement({ conception: true });
    await attendreEcran();
    expect(screen.getByText("TOUCHE 3")).toBeInTheDocument();
    // La planche n'écrit pas « touche 3 » dans le bouton : seul le badge de l'en-tête le dit.
    expect(boutonPayer()).not.toHaveTextContent(/touche 3/);
  });

  it("n'a aucun bouton grisé, aucun emoji et nomme le bouton rond", async () => {
    rendrePaiement();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(document.body.textContent).not.toMatch(/bientôt/i);
  });

  it("mène aux autres écrans comme la maquette : Covoit, Proche", async () => {
    rendrePaiement();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/covoit");
    expect(lienProche()).toHaveAttribute("href", "/proche");
  });

  it("ouvre Covoit quand on touche « Retour »", async () => {
    const { routeur } = rendrePaiement();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/covoit"));
  });

  it("change de moyen au toucher et adapte le détail du bouton", async () => {
    rendrePaiement();
    await attendreEcran();

    await userEvent.click(moyen(/Orange Money/));
    expect(moyen(/Orange Money/)).toHaveAttribute("aria-pressed", "true");
    expect(moyen(/MTN Mobile Money/)).toHaveAttribute("aria-pressed", "false");
    expect(boutonPayer()).toHaveTextContent("confirmation Orange Money · billet par SMS en 10 s");

    await userEvent.click(moyen(/Carte bancaire/));
    expect(moyen(/Carte bancaire/)).toHaveAttribute("aria-pressed", "true");
    expect(boutonPayer()).toHaveTextContent(
      "authentification de la banque · billet par SMS en 10 s",
    );
  });

  it("sert tous les types de commande : la commande de l'adresse, un autre texte de garantie, le total du serveur", async () => {
    const demandees: unknown[] = [];
    rendrePaiement({
      commandeId: "cmd-groupe-9",
      operations: (originale) => [
        transformer(voyageur.OP_COMMANDE, originale, (commande, params) => {
          demandees.push(params);
          return {
            ...commande,
            type: "groupe" as const,
            libelle: "Bus entier Alpha Voyages · Douala → Yaoundé",
            lignes: [
              { code: "billet", libelle: "Bus de 30 places", montant: 150000 },
              { code: "frais_voyageur", libelle: "Frais de service AfriMove", montant: 2500 },
            ],
            total: 152500,
          };
        }),
      ],
    });
    expect(await screen.findByRole("button", { name: /Payer 152 500 F/ })).toBeInTheDocument();
    expect(demandees).toEqual([{ commandeId: "cmd-groupe-9" }]);
    expect(screen.getByText("Bus entier Alpha Voyages · Douala → Yaoundé")).toBeInTheDocument();
    expect(screen.getByText("À payer").nextElementSibling).toHaveTextContent(/^152 500 F$/);
    expect(screen.getByText("Bus de 30 places").nextElementSibling).toHaveTextContent(/^150 000$/);
    expect(
      screen.getByText(
        "Paiement traité par un établissement agréé. Le prix du billet va à la compagnie ; seuls les frais vont à AfriMove.",
      ),
    ).toBeInTheDocument();
  });

  it("barre le montant d'une ligne offerte avec un code promotionnel", async () => {
    rendrePaiement({
      operations: (originale) => [
        transformer(voyageur.OP_COMMANDE, originale, (commande) => ({
          ...commande,
          lignes: [
            { code: "billet", libelle: "Trajet · 1 place", montant: 4000 },
            {
              code: "frais_voyageur",
              libelle: "Frais de service AfriMove",
              montant: 0,
              montantBarre: 250,
              offertAvec: "JOURJ",
            },
          ],
          total: 4000,
        })),
      ],
    });
    expect(await screen.findByRole("button", { name: /^Payer 4 000 F/ })).toBeInTheDocument();
    const frais = screen.getByText(/^Frais de service AfriMove/);
    expect(frais).toHaveTextContent("(offerts avec JOURJ)");
    expect(frais.nextElementSibling?.querySelector("s")).toHaveTextContent("250");
    expect(frais.nextElementSibling).toHaveTextContent("250 0");
  });

  it("ne propose que la carte pour une commande réglée dans une autre devise, avec l'équivalent approximatif", async () => {
    const paiements: unknown[] = [];
    rendrePaiement({
      operations: (originale) => [
        ...paiementsDemandes(paiements)(originale),
        transformer(voyageur.OP_COMMANDE, originale, (commande) => ({
          ...commande,
          conversion: { devise: "CAD", montantMineur: 1290, approximatif: true },
        })),
      ],
    });
    await screen.findByRole("button", { name: /Carte bancaire/ });
    expect(screen.queryByRole("button", { name: /MTN Mobile Money/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Orange Money/ })).not.toBeInTheDocument();
    expect(moyen(/Carte bancaire/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Équivalent en CAD").nextElementSibling).toHaveTextContent(
      "≈ 12,90 CAD",
    );

    await userEvent.click(boutonPayer());
    await screen.findByRole("status");
    expect(paiements).toEqual([
      { commandeId: COMMANDE_ID, moyen: "carte", jetonCarte: "jeton-carte-demo" },
    ]);
  });
});

/**
 * Paiements demandés, notés dans `paiements` ; `modifier` change la réponse. Le client prend la première
 * implémentation d'une opération : la surveillance et la modification vont donc dans la même.
 */
function paiementsDemandes(
  paiements: unknown[],
  modifier: (reponse: contrats.Paiement, numero: number) => contrats.Paiement = (reponse) =>
    reponse,
): Operations {
  return (originale) => [
    transformer(voyageur.OP_PAYER_COMMANDE, originale, (reponse, params) => {
      paiements.push(params);
      return modifier(reponse, paiements.length);
    }),
  ];
}

describe("Paiement · payer", () => {
  it("demande la confirmation MoMo sur le téléphone puis ouvre le billet", async () => {
    const paiements: unknown[] = [];
    const horloge = horlogeManuelle();
    const { routeur } = rendrePaiement({
      horlogeClient: horloge,
      operations: paiementsDemandes(paiements),
    });
    await attendreEcran();

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Demande envoyée. Tu confirmes sur ton téléphone.",
    );
    // Le numéro n'est pas renvoyé : le serveur débite celui du compte.
    expect(paiements).toEqual([{ commandeId: COMMANDE_ID, moyen: "mtn_momo" }]);
    expect(pathname(routeur)).toBe(`/paiement/${COMMANDE_ID}`);
    expect(boutonPayer()).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe(`/billet/billet-${COMMANDE_ID}`));
  });

  it("ouvre le billet de la commande quand le temps réel est coupé (relève du statut)", async () => {
    const horloge = horlogeManuelle();
    const { routeur } = rendrePaiement({
      horlogeClient: horloge,
      flux: () => [simulerFlux(voyageur.CANAL_STATUT_PAIEMENT, () => undefined)],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    await screen.findByRole("status");

    await act(async () => {
      await horloge.avancer(5000);
    });
    await waitFor(() => expect(pathname(routeur)).toBe(`/billet/billet-${COMMANDE_ID}`), {
      timeout: 8000,
    });
  }, 15_000);

  it("paie avec Orange Money quand c'est le moyen choisi, avec la consigne du serveur", async () => {
    const paiements: unknown[] = [];
    rendrePaiement({
      operations: paiementsDemandes(paiements, (paiement) => ({
        ...paiement,
        consigne: "Compose #150# ou confirme dans l'app Orange avec ton code.",
      })),
    });
    await attendreEcran();
    await userEvent.click(moyen(/Orange Money/));
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Demande envoyée. Compose #150# ou confirme dans l'app Orange avec ton code.",
    );
    expect(paiements).toEqual([{ commandeId: COMMANDE_ID, moyen: "orange_money" }]);
  });

  it("n'envoie qu'un paiement quand on touche deux fois le bouton, puis fige le choix du moyen", async () => {
    const paiements: unknown[] = [];
    rendrePaiement({ operations: paiementsDemandes(paiements) });
    await attendreEcran();
    await userEvent.dblClick(boutonPayer());
    await screen.findByRole("status");
    expect(paiements).toHaveLength(1);

    await userEvent.click(moyen(/Orange Money/));
    expect(moyen(/MTN Mobile Money/)).toHaveAttribute("aria-pressed", "true");
  });

  it("paie par carte avec un jeton, jamais un numéro, et propose la page de la banque en https", async () => {
    const paiements: unknown[] = [];
    rendrePaiement({
      operations: paiementsDemandes(paiements, (paiement) => ({
        ...paiement,
        urlAuthentification: "https://banque.example/3ds/pay-1",
      })),
    });
    await attendreEcran();
    await userEvent.click(moyen(/Carte bancaire/));
    await userEvent.click(boutonPayer());

    const statut = await screen.findByRole("status");
    expect(statut).toHaveTextContent("Authentifie le paiement auprès de ta banque.");
    const lien = within(statut).getByRole("link", { name: "Ouvrir la page de ma banque" });
    expect(lien).toHaveAttribute("href", "https://banque.example/3ds/pay-1");
    expect(lien).toHaveAttribute("target", "_blank");
    expect(lien).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(paiements).toEqual([
      { commandeId: COMMANDE_ID, moyen: "carte", jetonCarte: "jeton-carte-demo" },
    ]);
    expect(JSON.stringify(paiements)).not.toMatch(/\d{12,}/);
  });

  it("n'ouvre jamais une adresse d'authentification qui n'est pas en https", async () => {
    rendrePaiement({
      operations: (originale) => [
        transformer(voyageur.OP_PAYER_COMMANDE, originale, (paiement) => ({
          ...paiement,
          urlAuthentification: "http://banque.example/3ds",
        })),
      ],
    });
    await attendreEcran();
    await userEvent.click(moyen(/Carte bancaire/));
    await userEvent.click(boutonPayer());
    const statut = await screen.findByRole("status");
    expect(within(statut).queryByRole("link")).not.toBeInTheDocument();
  });

  it("refuse de payer par carte sans champ hébergé du prestataire, sans fabriquer de jeton", async () => {
    const paiements: unknown[] = [];
    rendrePaiement({ demo: false, operations: paiementsDemandes(paiements) });
    await attendreEcran();
    await userEvent.click(moyen(/Carte bancaire/));
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La saisie de la carte n'est pas disponible pour le moment. Choisis un autre moyen de paiement.",
    );
    expect(paiements).toEqual([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(boutonPayer()).toBeEnabled();
  });

  it("annonce l'échec avec la cause du serveur et permet de recommencer", async () => {
    const paiements: unknown[] = [];
    rendrePaiement({
      operations: paiementsDemandes(paiements, (paiement, numero) =>
        numero === 1
          ? {
              ...paiement,
              statut: "echoue" as const,
              consigne: "Le paiement n'a pas abouti. Rien n'a été débité.",
            }
          : paiement,
      ),
    });
    await attendreEcran();
    await userEvent.click(moyen(/Orange Money/));

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas abouti. Rien n'a été débité.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(moyen(/Orange Money/)).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(paiements).toHaveLength(2);
  });

  it("annonce le délai dépassé quand le serveur déclare le paiement expiré", async () => {
    const { routeur } = rendrePaiement({
      operations: (originale) => [
        transformer(
          voyageur.OP_STATUT_PAIEMENT,
          originale,
          ({ consigne: _consigne, ...paiement }) => ({
            ...paiement,
            statut: "expire" as const,
          }),
        ),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le délai de confirmation est dépassé. Rien n'a été débité.",
    );
    expect(pathname(routeur)).toBe(`/paiement/${COMMANDE_ID}`);
    expect(boutonPayer()).toBeEnabled();
  });

  it("reprend la phrase du serveur pour expliquer un paiement expiré", async () => {
    rendrePaiement({
      operations: (originale) => [
        transformer(voyageur.OP_STATUT_PAIEMENT, originale, (paiement) => ({
          ...paiement,
          statut: "expire" as const,
          consigne: "Le délai de confirmation est dépassé. Rien n'a été débité sur ta carte.",
        })),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le délai de confirmation est dépassé. Rien n'a été débité sur ta carte.",
    );
  });

  it("explique qu'un paiement est déjà en cours (409)", async () => {
    rendrePaiement({
      operations: () => [
        implementer(voyageur.OP_PAYER_COMMANDE, () => {
          throw new ErreurHttp(409, "Paiement en cours", "PAIEMENT_EN_COURS");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Un paiement est déjà en cours pour cette commande. Confirme-le sur ton téléphone, puis patiente quelques instants.",
    );
  });

  it("garde le choix et propose de réessayer quand le paiement ne démarre pas", async () => {
    rendrePaiement({
      operations: () => [
        implementer(voyageur.OP_PAYER_COMMANDE, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(moyen(/Orange Money/));
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas pu démarrer. Réessaie.",
    );
    expect(moyen(/Orange Money/)).toHaveAttribute("aria-pressed", "true");
    expect(boutonPayer()).toHaveAttribute("aria-busy", "false");
  });

  it("affiche la consigne du mode dégradé quand le paiement en ligne est coupé entre-temps (503)", async () => {
    let coupe = false;
    rendrePaiement({
      operations: (originale) => [
        implementer(voyageur.OP_PAYER_COMMANDE, () => {
          coupe = true;
          throw new ErreurHttp(503, "Mode dégradé", "MODE_DEGRADE");
        }),
        implementer(voyageur.OP_MOYENS_PAIEMENT, (params, ctx) => {
          const repondre = originale(voyageur.OP_MOYENS_PAIEMENT.nom).repondre as (
            p: unknown,
            c: unknown,
          ) => never;
          return coupe ? [] : repondre(params, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonPayer());
    expect(
      await screen.findByRole("heading", { level: 2, name: "Paiement en ligne indisponible" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/paie au guichet de la gare ou en MoMo marchand/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });
});

describe("Paiement · demander à un proche de payer", () => {
  const originaux = {
    share: Object.getOwnPropertyDescriptor(Navigator.prototype, "share"),
    clipboard: Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard"),
  };
  function definir(nom: "share" | "clipboard", valeur: unknown) {
    Object.defineProperty(navigator, nom, { value: valeur, configurable: true, writable: true });
  }
  afterEach(() => {
    for (const nom of ["share", "clipboard"] as const) {
      Reflect.deleteProperty(navigator, nom);
      const d = originaux[nom];
      if (d) Object.defineProperty(Navigator.prototype, nom, d);
    }
  });

  it("crée le lien de paiement, le partage, puis ouvre l'écran Proche", async () => {
    const liens: unknown[] = [];
    const partage = vi.fn().mockResolvedValue(undefined);
    definir("share", partage);
    const { routeur } = rendrePaiement({
      operations: (originale) => [
        surveiller(voyageur.OP_LIEN_PROCHE, originale, (p) => liens.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(lienProche());
    await waitFor(() => expect(pathname(routeur)).toBe("/proche"));
    expect(liens).toEqual([{ commandeId: COMMANDE_ID }]);
    expect(partage).toHaveBeenCalledTimes(1);
    expect(partage).toHaveBeenCalledWith({
      title: "Payer mon voyage",
      text: "Peux-tu payer mon voyage ? Covoiturage Samuel · Douala → Kribi · 08:30 · 4 250 F. Paiement sécurisé ici :",
      url: `https://afrimove.example/payer/${COMMANDE_ID}`,
    });
  });

  it("copie le lien quand le téléphone n'a pas de feuille de partage", async () => {
    const ecrire = vi.fn().mockResolvedValue(undefined);
    definir("clipboard", { writeText: ecrire });
    const { routeur } = rendrePaiement();
    await attendreEcran();
    await userEvent.click(lienProche());
    await waitFor(() => expect(pathname(routeur)).toBe("/proche"));
    expect(ecrire).toHaveBeenCalledWith(
      expect.stringContaining(`https://afrimove.example/payer/${COMMANDE_ID}`),
    );
  });

  it("reste sur l'écran quand le voyageur ferme la feuille de partage", async () => {
    definir("share", vi.fn().mockRejectedValue(new DOMException("annulé", "AbortError")));
    const { routeur } = rendrePaiement();
    await attendreEcran();
    await userEvent.click(lienProche());
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(pathname(routeur)).toBe(`/paiement/${COMMANDE_ID}`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signale l'échec de la création du lien et reste sur l'écran", async () => {
    const { routeur } = rendrePaiement({
      operations: () => [
        implementer(voyageur.OP_LIEN_PROCHE, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(lienProche());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le lien pour ton proche n'a pas pu être créé. Réessaie.",
    );
    expect(pathname(routeur)).toBe(`/paiement/${COMMANDE_ID}`);
  });

  it("n'est pas proposé quand l'API ne le propose pas", async () => {
    rendrePaiement({
      operations: (originale) => [
        transformer(voyageur.OP_MOYENS_PAIEMENT, originale, (moyens) =>
          moyens.filter((m) => m.code !== "proche"),
        ),
      ],
    });
    await attendreEcran();
    expect(screen.queryByRole("link", { name: /proche de payer/ })).not.toBeInTheDocument();
  });
});

describe("Paiement · états", () => {
  it("affiche un état de chargement dans le style nuit, avec le retour", async () => {
    rendrePaiement({ latenceMs: 150 });
    expect(
      await screen.findByRole("status", { name: "Chargement du paiement" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/covoit");
    await attendreEcran();
    expect(
      screen.queryByRole("status", { name: "Chargement du paiement" }),
    ).not.toBeInTheDocument();
  });

  it("affiche l'erreur de chargement et recharge au clic sur « Réessayer »", async () => {
    let pannes = 1;
    rendrePaiement({
      operations: (originale) => [
        implementer(voyageur.OP_COMMANDE, (params, ctx) => {
          if (pannes-- > 0) throw new ErreurHttp(500, "Panne", "PANNE");
          const repondre = originale(voyageur.OP_COMMANDE.nom).repondre as (
            p: unknown,
            c: unknown,
          ) => never;
          return repondre(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Impossible de charger ce paiement")).toBeInTheDocument();
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.getByText("À payer")).toBeInTheDocument();
  });

  it("affiche l'état vide quand la commande n'existe plus (404)", async () => {
    rendrePaiement({
      operations: () => [
        implementer(voyageur.OP_COMMANDE, () => {
          throw new ErreurHttp(404, "Commande introuvable", "COMMANDE_INCONNUE");
        }),
      ],
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Cette commande n'existe plus" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("dit qu'une commande déjà payée (par un proche) est réglée et ouvre son billet", async () => {
    const { routeur } = rendrePaiement({
      operations: (originale) => [
        transformer(voyageur.OP_COMMANDE, originale, (commande) => ({
          ...commande,
          statut: "payee" as const,
          billetIds: ["billet-du-proche"],
        })),
      ],
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Cette commande est déjà payée" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Payer/ })).not.toBeInTheDocument();
    const lien = screen.getByRole("link", { name: "Ouvrir mon billet" });
    expect(lien).toHaveAttribute("href", "/billet/billet-du-proche");
    await userEvent.click(lien);
    await waitFor(() => expect(pathname(routeur)).toBe("/billet/billet-du-proche"));
  });

  it.each([
    ["expiree", "Le délai pour payer est dépassé"],
    ["annulee", "Cette commande a été annulée"],
  ] as const)("ne propose plus de payer une commande %s", async (statut, titre) => {
    rendrePaiement({
      operations: (originale) => [
        transformer(voyageur.OP_COMMANDE, originale, (commande) => ({ ...commande, statut })),
      ],
    });
    expect(await screen.findByRole("heading", { level: 2, name: titre })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Payer/ })).not.toBeInTheDocument();
  });

  it("ne propose plus de payer quand le blocage de 15 minutes est terminé", async () => {
    // L'application est 20 minutes après la commande, qui expire 15 minutes après sa création.
    rendrePaiement({ horloge: { maintenant: () => new Date("2027-01-05T07:58:00+01:00") } });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Le délai pour payer est dépassé" }),
    ).toBeInTheDocument();
  });

  it("explique le paiement en ligne indisponible quand l'API ne propose aucun moyen (mode dégradé)", async () => {
    rendrePaiement({
      operations: () => [implementer(voyageur.OP_MOYENS_PAIEMENT, () => [])],
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Paiement en ligne indisponible" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Payer/ })).not.toBeInTheDocument();
  });
});
