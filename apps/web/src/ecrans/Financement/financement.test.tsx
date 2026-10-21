import {
  ErreurHttp,
  FournisseurApi,
  creerClientMock,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { ConceptionProvider } from "@afrimove/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { VueFinancement, type EtatFinancement } from "./vue";

type Impl = Scenario["operations"][number];

/** Monte l'application sur /financement avec le scénario de démo ; `modifier` remplace des opérations du mock. */
function rendre(modifier?: (nom: string, impl: Impl) => Impl) {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return modifier
        ? {
            ...scenario,
            operations: scenario.operations.map((impl) => modifier(impl.operation.nom, impl)),
          }
        : scenario;
    },
  };
  const clientApi = creerClientMock({ source, scenario: "Financement", latenceMs: 0 });
  return rendreApp({ scenario: "Financement", url: "/financement", clientApi });
}

const panne = (impl: Impl): Impl =>
  ({
    operation: impl.operation,
    repondre: () => {
      throw new ErreurHttp(500, "Panne simulée", "PANNE");
    },
  }) as Impl;

async function attendreEcran() {
  await screen.findByText("Avance sur recettes");
}

const principal = () => document.querySelector("main") as HTMLElement;

/** Tape un PIN sur le clavier de la feuille de confirmation. */
async function taperPin(pin: string) {
  const clavier = await screen.findByRole("group", { name: "Clavier PIN" });
  for (const chiffre of pin) {
    fireEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

const PIN_VALIDE = "483920";

describe("Financement · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, partenaire en emplacement entre crochets et retour au patron", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Financement" })).toBeInTheDocument();
    const sousTitre = screen.getByText(/tes 90 jours de ventes font ton dossier/);
    expect(sousTitre).toHaveTextContent(
      "Avec [établissement financier partenaire] · tes 90 jours de ventes font ton dossier",
    );
    expect(within(sousTitre).getByText("[établissement financier partenaire]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
  });

  it("affiche l'avance : éligible, plafond, curseur à 6 M, remboursement, durée, coût en emplacement", async () => {
    rendre();
    await attendreEcran();
    const avance = screen.getByRole("region", { name: "Avance sur recettes" });
    expect(within(avance).getByText("éligible")).toBeInTheDocument();
    expect(within(avance).getByText("jusqu'à 12 M")).toBeInTheDocument();
    expect(within(avance).getByText("= 10 jours de ventes")).toBeInTheDocument();
    expect(within(avance).getByText("Montant")).toBeInTheDocument();
    expect(within(avance).getByText("6 M")).toBeInTheDocument();
    const conditions: Array<[string, string]> = [
      ["remboursé par", "8 % des ventes MoMo"],
      ["durée estimée", "≈ 7 semaines"],
      ["coût total", "[x %] · fixé par le partenaire"],
    ];
    for (const [libelle, valeur] of conditions) {
      expect(within(avance).getByText(libelle).nextElementSibling).toHaveTextContent(valeur);
    }
    expect(
      within(avance).getByText(
        "Versé sur ton compte en 24 h. Pas de garantie : ton historique de ventes AfriMove est la garantie. AfriMove ne prête pas, il présente ton dossier.",
      ),
    ).toBeInTheDocument();
    // Le curseur est à 6 M sur 12 M : la moitié de la piste.
    const piste = avance.querySelector<HTMLElement>("[aria-hidden='true'][style]")!;
    expect(piste.style.getPropertyValue("--part")).toBe("50%");
  });

  it("affiche le crédit matériel, la paie des équipages et le paiement en 2 fois (interrupteur éteint)", async () => {
    rendre();
    await attendreEcran();
    const credit = screen.getByRole("region", { name: "Crédit matériel" });
    expect(
      within(credit).getByText("2 téléphones + imprimante pour la nouvelle gare"),
    ).toBeVisible();
    expect(within(credit).getByText("1,1 M · 12 × 100 000 · retenu sur les ventes")).toBeVisible();

    const paie = screen.getByRole("region", { name: "Paie des équipages" });
    expect(within(paie).getByText("23 salaires versés par MoMo le vendredi")).toBeVisible();
    expect(
      within(paie).getByText("calculés sur les trajets et les primes · 1 touche"),
    ).toBeVisible();

    const voyageurs = screen.getByRole("region", { name: "Pour les voyageurs · payer en 2 fois" });
    expect(within(voyageurs).getByText("option par agence")).toBeVisible();
    expect(voyageurs).toHaveTextContent(
      "Billet VIP 7 500 : 4 000 à la réservation, 3 500 la veille. Le siège est bloqué, le billet part au 2e paiement.",
    );
    expect(voyageurs.querySelector("sup")).toHaveTextContent("e");
    const interrupteur = within(voyageurs).getByRole("switch");
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    expect(interrupteur).toHaveAccessibleName(/^Billet VIP 7 500/);
  });

  it("affiche l'action « Demander 6 M » et la mention du module masqué tant que la convention n'est pas signée", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("button", { name: "Demander 6 M · dossier envoyé en 1 touche" }),
    ).toBeVisible();
    expect(
      screen.getByText("Module masqué tant que la convention avec le partenaire n'est pas signée."),
    ).toBeVisible();
  });

  it("ne garde aucun bouton ni texte hors de la maquette (aucun « bientôt »)", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(principal().textContent).not.toMatch(/bientôt/i);
  });
});

describe("Financement · données de l'offre", () => {
  const offreDeDemo = async (): Promise<contrats.OffreFinancement> => {
    const client = creerClientMock({
      source: sourceScenariosFixtures(),
      scenario: "Financement",
      latenceMs: 0,
    });
    return client.executer(patron.OP_OFFRE_FINANCEMENT, undefined);
  };

  function rendreVue(offre: contrats.OffreFinancement, etat: EtatFinancement = "pret") {
    const onDemander = vi.fn(async () => {});
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <MemoryRouter>
              <VueFinancement
                etat={etat}
                offre={offre}
                onReessayer={() => {}}
                onDemander={onDemander}
                onReglerDeuxFois={async () => {}}
              />
            </MemoryRouter>
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
    return onDemander;
  }

  it("convention signée : le partenaire et le coût remplacent les crochets, la mention disparaît", async () => {
    const offre = await offreDeDemo();
    rendreVue({
      ...offre,
      partenaire: "Afriland First Bank",
      conventionSignee: true,
      avance: {
        ...offre.avance,
        conditions: { ...offre.avance.conditions, coutTotalPct: 7.5 },
      },
    });
    expect(screen.getByText("Afriland First Bank")).toBeInTheDocument();
    expect(screen.queryByText(/établissement financier partenaire/)).not.toBeInTheDocument();
    expect(screen.getByText("coût total").nextElementSibling).toHaveTextContent(
      "7,5 % · fixé par le partenaire",
    );
    expect(screen.queryByText(/Module masqué/)).not.toBeInTheDocument();
  });

  it("avance non éligible : le statut le dit et aucune demande n'est proposée", async () => {
    const offre = await offreDeDemo();
    rendreVue({ ...offre, avance: { ...offre.avance, statut: "non_eligible" } });
    expect(screen.getByText("non éligible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Demander/ })).not.toBeInTheDocument();
  });

  it("un seul salaire et paiement en 2 fois actif : singulier et interrupteur allumé", async () => {
    const offre = await offreDeDemo();
    rendreVue({
      ...offre,
      paie: { nbSalaires: 1, jourDeVersement: "samedi" },
      billetEnDeuxFois: { ...offre.billetEnDeuxFois, actif: true },
    });
    expect(screen.getByText("1 salaire versé par MoMo le samedi")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("le montant du bouton suit le montant proposé", async () => {
    const offre = await offreDeDemo();
    rendreVue({ ...offre, avance: { ...offre.avance, montantPropose: 4_500_000 } });
    expect(
      screen.getByRole("button", { name: "Demander 4,5 M · dossier envoyé en 1 touche" }),
    ).toBeVisible();
  });
});

describe("Financement · demander l'avance", () => {
  it("la touche ouvre le clavier PIN, le bon PIN crée le dossier de 6 M et ouvre FinancementDemande", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Demander 6 M · dossier envoyé en 1 touche" }),
    );
    const feuille = await screen.findByRole("dialog");
    expect(within(feuille).getByText("Confirme avec ton PIN")).toBeInTheDocument();
    expect(within(feuille).getByText("Demander 6 M d'avance sur recettes")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/financement");

    await taperPin(PIN_VALIDE);
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/financement/demande/AV-2027-0042"),
    );
  });

  it("le montant envoyé est le montant proposé et la commande porte la signature du PIN", async () => {
    const envoyes: unknown[] = [];
    const { routeur } = rendre((nom, impl) =>
      nom === patron.OP_DEMANDER_AVANCE.nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) => {
              envoyes.push(params);
              return (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx);
            },
          } as Impl)
        : impl,
    );
    await attendreEcran();
    fireEvent.click(screen.getByRole("button", { name: /Demander 6 M/ }));
    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(routeur.state.location.pathname).toMatch(/demande\/AV-/));
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({
      montant: 6_000_000,
      signature: { pin: PIN_VALIDE, methode: "pin" },
    });
  });

  it("un PIN refusé ne crée rien et on reste sur l'écran", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    fireEvent.click(screen.getByRole("button", { name: /Demander 6 M/ }));
    await taperPin(patron.PIN_REFUSE_PAR_LE_MOCK);
    // Le clavier compte l'essai raté, la feuille reste ouverte, aucun dossier n'est ouvert et aucune panne n'est annoncée.
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("La demande n'a pas pu être envoyée. Réessaie."),
    ).not.toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/financement");
  });

  it("une panne à l'envoi est annoncée dans la feuille, sans ouvrir de dossier", async () => {
    const { routeur } = rendre((nom, impl) =>
      nom === patron.OP_DEMANDER_AVANCE.nom ? panne(impl) : impl,
    );
    await attendreEcran();
    fireEvent.click(screen.getByRole("button", { name: /Demander 6 M/ }));
    await taperPin(PIN_VALIDE);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La demande n'a pas pu être envoyée. Réessaie.",
    );
    expect(routeur.state.location.pathname).toBe("/financement");
  });

  it("fermer la feuille abandonne la demande", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Demander 6 M/ }));
    await user.click(await screen.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(routeur.state.location.pathname).toBe("/financement");
  });
});

describe("Financement · demande en cours", () => {
  const rendreEnCours = async (dossierId: string | undefined) => {
    const client = creerClientMock({
      source: sourceScenariosFixtures(),
      scenario: "Financement",
      latenceMs: 0,
    });
    const offre = await client.executer(patron.OP_OFFRE_FINANCEMENT, undefined);
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={client}>
          <ConceptionProvider actif={false}>
            <MemoryRouter>
              <VueFinancement
                etat="pret"
                offre={{
                  ...offre,
                  avance: {
                    ...offre.avance,
                    statut: "en_cours",
                    ...(dossierId ? { dossierId } : {}),
                  },
                }}
                onReessayer={() => {}}
                onDemander={async () => {}}
                onReglerDeuxFois={async () => {}}
              />
            </MemoryRouter>
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  };

  it("renvoie vers le suivi du dossier ouvert et ne propose plus de nouvelle demande", async () => {
    await rendreEnCours("AV-2027-0042");
    expect(screen.getByText("en cours")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Suivre ma demande" })).toHaveAttribute(
      "href",
      "/financement/demande/AV-2027-0042",
    );
    expect(screen.queryByRole("button", { name: /Demander/ })).not.toBeInTheDocument();
  });

  it("sans numéro de dossier, aucun lien n'est inventé", async () => {
    await rendreEnCours(undefined);
    expect(screen.queryByRole("link", { name: "Suivre ma demande" })).not.toBeInTheDocument();
  });

  it("dans l'application : demander l'avance, revenir sur l'écran, l'offre renvoie vers le dossier", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Demander 6 M/ }));
    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(routeur.state.location.pathname).toMatch(/demande\/AV-2027-0042/));
    await routeur.navigate("/financement");
    const lien = await screen.findByRole("link", { name: "Suivre ma demande" });
    expect(lien).toHaveAttribute("href", "/financement/demande/AV-2027-0042");
    expect(screen.queryByRole("button", { name: /Demander/ })).not.toBeInTheDocument();
  });
});

describe("Financement · paiement du billet en 2 fois", () => {
  const interrupteur = () => screen.getByRole("switch");

  it("l'interrupteur ouvre la feuille PIN, le bon PIN envoie la commande signée et l'allume", async () => {
    const envoyes: unknown[] = [];
    rendre((nom, impl) =>
      nom === patron.OP_REGLER_BILLET_EN_DEUX_FOIS.nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) => {
              envoyes.push(params);
              return (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx);
            },
          } as Impl)
        : impl,
    );
    await attendreEcran();
    expect(interrupteur()).toHaveAttribute("aria-checked", "false");
    const user = userEvent.setup();
    await user.click(interrupteur());
    const feuille = await screen.findByRole("dialog");
    expect(
      within(feuille).getByText("Activer le paiement du billet en 2 fois"),
    ).toBeInTheDocument();
    expect(envoyes).toHaveLength(0);

    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(interrupteur()).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(envoyes).toEqual([
      { actif: true, signature: expect.objectContaining({ pin: PIN_VALIDE, methode: "pin" }) },
    ]);
  });

  it("un second toucher le coupe, avec sa propre signature", async () => {
    rendre();
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(interrupteur());
    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(interrupteur()).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(interrupteur());
    const feuille = await screen.findByRole("dialog");
    expect(within(feuille).getByText("Couper le paiement du billet en 2 fois")).toBeInTheDocument();
    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(interrupteur()).toHaveAttribute("aria-checked", "false"));
  });

  it("un PIN refusé ne change rien : l'interrupteur reste éteint et la feuille compte l'essai", async () => {
    rendre();
    await attendreEcran();
    fireEvent.click(interrupteur());
    await taperPin(patron.PIN_REFUSE_PAR_LE_MOCK);
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(interrupteur()).toHaveAttribute("aria-checked", "false");
  });

  it("une panne est annoncée dans la feuille, l'interrupteur ne bouge pas", async () => {
    rendre((nom, impl) => (nom === patron.OP_REGLER_BILLET_EN_DEUX_FOIS.nom ? panne(impl) : impl));
    await attendreEcran();
    fireEvent.click(interrupteur());
    await taperPin(PIN_VALIDE);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le changement n'a pas pu être enregistré. Réessaie.",
    );
    expect(interrupteur()).toHaveAttribute("aria-checked", "false");
  });

  it("fermer la feuille abandonne le changement", async () => {
    rendre();
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(interrupteur());
    await user.click(await screen.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(interrupteur()).toHaveAttribute("aria-checked", "false");
  });
});

describe("Financement · états chargement, vide et erreur", () => {
  function rendreVue(etat: EtatFinancement, reessayer: () => void = () => {}) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <MemoryRouter>
              <VueFinancement
                etat={etat}
                offre={undefined}
                onReessayer={reessayer}
                onDemander={async () => {}}
                onReglerDeuxFois={async () => {}}
              />
            </MemoryRouter>
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  it("chargement : en-tête et retour en place, blocs à la taille des cartes, aucun texte de donnée", () => {
    rendreVue("chargement");
    expect(screen.getByRole("heading", { level: 1, name: "Financement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    const zone = screen.getByRole("status", { name: "Chargement du financement" });
    expect(zone).toHaveAttribute("aria-busy", "true");
    expect(zone).toHaveTextContent("");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("vide : le dit dans le style nuit, le retour reste", () => {
    rendreVue("vide");
    expect(screen.getByText("Aucune offre pour le moment")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("erreur : message, bouton « Réessayer » de 44 px au moins qui relance la lecture", async () => {
    const reessayer = vi.fn();
    rendreVue("erreur", reessayer);
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger le financement");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reessayer).toHaveBeenCalledTimes(1);
  });

  it("une offre qui ne se charge pas affiche l'erreur dans l'application, puis se relit", async () => {
    let echecs = 1;
    rendre((nom, impl) =>
      nom === patron.OP_OFFRE_FINANCEMENT.nom
        ? ({
            operation: impl.operation,
            repondre: (params: unknown, ctx: unknown) => {
              if (echecs-- > 0) throw new ErreurHttp(500, "Panne simulée", "PANNE");
              return (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx);
            },
          } as Impl)
        : impl,
    );
    const alerte = await screen.findByRole("alert", undefined, { timeout: 5000 });
    expect(alerte).toHaveTextContent("Impossible de charger le financement");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.getByText("jusqu'à 12 M")).toBeInTheDocument();
  });
});
