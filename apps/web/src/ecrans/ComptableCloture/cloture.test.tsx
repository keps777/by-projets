import {
  ErreurHttp,
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const planche = ecrans.ComptableCloture.donnees;

type Cloture = contrats.ClotureMois;

function rendre(
  options: { scenario?: string; clientApi?: ReturnType<typeof creerClientMock> } = {},
) {
  return rendreApp({
    fixtures: true,
    scenario: options.scenario ?? "ComptableCloture",
    url: "/comptable/cloture",
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Journal des ventes");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
  scenario = "ComptableCloture",
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario, latenceMs: 0 });
}

/** Remplace la réponse d'une opération du scénario, en gardant celle du mock pour les autres appels. */
function avecOperation(
  scenario: Scenario,
  nom: string,
  remplacement: (suite: () => unknown, params: unknown) => unknown,
): Scenario {
  return {
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? implementer(impl.operation, (params, ctx) =>
            remplacement(
              () => (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx),
              params,
            ),
          )
        : impl,
    ),
  };
}

/** Change la réponse de la clôture ; `envois` reçoit les paramètres de chaque clôture signée. */
function avecCloture(
  transformer: (reponse: Cloture, appel: number) => Cloture | Promise<Cloture>,
  options: { scenario?: string; envois?: unknown[] } = {},
) {
  let appel = 0;
  return clientAvec((scenario) => {
    const avecLecture = avecOperation(scenario, patron.OP_CLOTURE.nom, async (suite) => {
      appel += 1;
      return transformer((await suite()) as Cloture, appel);
    });
    return options.envois
      ? avecOperation(avecLecture, patron.OP_CLOTURER.nom, (suite, params) => {
          options.envois!.push(params);
          return suite();
        })
      : avecLecture;
  }, options.scenario);
}

async function saisirPin(pin: string) {
  const clavier = await screen.findByRole("group", { name: "Clavier PIN pour signer la clôture" });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

describe("ComptableCloture · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, date de clôture signée par le PIN, pastille verte et retour au Comptable", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Décembre clôturé" })).toBeInTheDocument();
    expect(screen.getByText("5 janv. 2027 · 09:12 · signé par ton PIN")).toBeInTheDocument();
    expect(screen.getByText(planche.detail)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/comptable");
    expect(document.querySelector("header svg[aria-hidden='true']")).not.toBeNull();
  });

  it("totalise l'encaissé : 28 414 000, cash 20 766 000, MoMo 7 648 000, écart 0 en vert", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("28 414 000")).toBeInTheDocument();
    expect(screen.getByText("FCFA encaissés · décembre")).toBeInTheDocument();
    expect(screen.getByText("Cash").parentElement).toHaveTextContent("Cash 20 766 000");
    expect(screen.getByText("MoMo").parentElement).toHaveTextContent("MoMo 7 648 000");
    const ecart = screen.getByText("Écart").parentElement!;
    expect(ecart).toHaveTextContent("Écart 0");
    expect(within(ecart).getByText("0").className).toMatch(/ecartNul/);
  });

  it("dit que les 4 transactions sont traitées et que le mois est verrouillé jusqu'aux écritures de janvier", async () => {
    rendre();
    await attendreEcran();
    await waitFor(() => expect(principal()).toHaveTextContent(planche.encaisse.verrou));
  });

  it("liste les cinq fichiers envoyés avec leur détail, leur format et leur taille, une coche chacun", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Envoyé à cabinet@…")).toBeInTheDocument();
    expect(screen.getByText("reçu 09:13")).toBeInTheDocument();
    const lignes = within(principal()).getAllByRole("listitem");
    expect(lignes).toHaveLength(5);
    const attendus = [
      ["Journal des ventes", "6 802 lignes · une par billet", "xlsx · 1,2 Mo"],
      ["Journal de caisse", "31 jours · 3 guichets · dépôts banque", "xlsx · 84 ko"],
      ["Annulations et remboursements", "212 lignes · motif · qui · PIN", "csv · 31 ko"],
      ["Écritures SYSCOHADA", "706 · 571 · 462 · 622 · prêt à importer", "csv · 58 ko"],
      ["Factures AfriMove · décembre", "6 802 × 75 + 1 940 colis × 150", "pdf · 2 p."],
    ];
    attendus.forEach(([nom, detail, format], i) => {
      expect(lignes[i], nom).toHaveTextContent(nom!);
      expect(lignes[i], nom).toHaveTextContent(detail!);
      expect(lignes[i], nom).toHaveTextContent(format!);
      expect(lignes[i]!.querySelector("svg[aria-hidden='true']"), nom).not.toBeNull();
    });
  });

  it("n'écrit plus « abonnement + » dans la facture : le modèle est sans abonnement", async () => {
    rendre();
    await attendreEcran();
    expect(planche.envoi.fichiers[4]!.detail).toContain("abonnement");
    expect(principal().textContent).not.toMatch(/abonnement/i);
  });

  it("montre les trois premières lignes du journal des ventes, avec l'en-tête du CSV", async () => {
    rendre();
    await attendreEcran();
    const apercu = screen.getByRole("region", {
      name: "Aperçu · journal des ventes · 3 premières lignes",
    });
    for (const ligne of planche.apercu.lignes) {
      expect(within(apercu).getByText(ligne)).toBeInTheDocument();
    }
    expect(apercu).toHaveAttribute("tabindex", "0");
  });

  it("garde « Revoir les exports » et « Retour au tableau de bord » en pied, sans bouton de signature", async () => {
    rendre();
    await attendreEcran();
    const revoir = screen.getByRole("link", { name: "Revoir les exports" });
    const retour = screen.getByRole("link", { name: "Retour au tableau de bord" });
    expect(revoir).toHaveAttribute("href", "/comptable");
    expect(retour).toHaveAttribute("href", "/aujourdhui");
    expect(principal().contains(revoir)).toBe(false);
    expect(principal().contains(retour)).toBe(false);
    expect(screen.queryByRole("button", { name: /mon PIN/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ComptableCloture · navigation de la planche", () => {
  it.each([["Retour"], ["Revoir les exports"]])("« %s » mène au Comptable", async (nom) => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: nom }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("« Retour au tableau de bord » mène au Patron", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour au tableau de bord" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
  });
});

describe("ComptableCloture · mois verrouillé", () => {
  it("un mois clôturé ne propose aucune écriture : ni bouton de clôture ni signature", async () => {
    const envois: unknown[] = [];
    rendre({ clientApi: avecCloture((c) => c, { envois }) });
    await attendreEcran();
    expect(screen.queryByRole("button")).toBeNull();
    expect(envois).toEqual([]);
  });

  it("le serveur refuse de clôturer deux fois : le mois verrouillé n'accepte plus rien", async () => {
    const client = creerClientMock({
      source: sourceScenariosFixtures(),
      scenario: "ComptableCloture",
      latenceMs: 0,
    });
    await expect(
      client.executer(patron.OP_CLOTURER, {
        mois: "2026-12",
        envoyerAuCabinet: true,
        signature: { pin: "246135", methode: "pin", signeA: "2027-01-05T09:20:00.000+01:00" },
      }),
    ).rejects.toMatchObject({ statut: 409, code: "MOIS_DEJA_CLOTURE" });
  });
});

describe("ComptableCloture · clôturer avec le PIN", () => {
  it("mois ouvert : annonce le verrou à venir et propose « Clôturer décembre · mon PIN », sans coche sur les fichiers", async () => {
    rendre({ scenario: "ComptableRapprochement" });
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 1, name: "Clôturer Décembre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("À envoyer à cabinet@…")).toBeInTheDocument();
    expect(screen.queryByText(/^reçu /)).toBeNull();
    expect(principal()).toHaveTextContent(
      "Une fois clôturé, le mois est verrouillé : plus aucune modification, seulement des écritures de janvier.",
    );
    const lignes = within(principal()).getAllByRole("listitem");
    for (const l of lignes) expect(l.querySelector("svg")).toBeNull();
    expect(screen.getByRole("button", { name: "Clôturer décembre · mon PIN" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Retour au tableau de bord" })).toBeNull();
    expect(screen.getByRole("link", { name: "Revoir les exports" })).toBeInTheDocument();
  });

  it("toucher « Clôturer » ouvre la signature sans rien écrire avant le PIN", async () => {
    const envois: unknown[] = [];
    rendre({
      scenario: "ComptableRapprochement",
      clientApi: avecCloture((c) => c, { envois, scenario: "ComptableRapprochement" }),
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Clôturer décembre · mon PIN" }));
    const feuille = await screen.findByRole("dialog", { name: "Clôturer décembre · mon PIN" });
    expect(within(feuille).getByText("Ton PIN signe la clôture")).toBeInTheDocument();
    expect(envois).toEqual([]);
  });

  it("de bout en bout : les décisions du rapprochement signées, puis la clôture signée, affichent le mois clôturé", async () => {
    const envois: unknown[] = [];
    const client = avecCloture((c) => c, { envois, scenario: "ComptableRapprochement" });
    const { routeur } = rendreApp({
      fixtures: true,
      scenario: "ComptableRapprochement",
      url: "/comptable/rapprochement",
      clientApi: client,
    });
    await screen.findByText("MP261203.1142.A71290");
    await userEvent.click(screen.getByRole("button", { name: /^Appliquer / }));
    const clavierRapprochement = await screen.findByRole("group", {
      name: "Clavier PIN pour signer les décisions",
    });
    for (const chiffre of "246135") {
      await userEvent.click(within(clavierRapprochement).getByRole("button", { name: chiffre }));
    }
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable/cloture"));
    const cloturer = await screen.findByRole("button", { name: "Clôturer décembre · mon PIN" });
    expect(envois).toEqual([]);

    await userEvent.click(cloturer);
    await saisirPin("135790");

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Décembre clôturé" }),
      ).toBeInTheDocument(),
    );
    expect(envois).toHaveLength(1);
    const envoi = envois[0] as {
      mois: string;
      envoyerAuCabinet: boolean;
      signature: { pin: string; methode: string; signeA: string };
    };
    expect(envoi.mois).toBe("2026-12");
    expect(envoi.envoyerAuCabinet).toBe(true);
    expect(envoi.signature).toMatchObject({ pin: "135790", methode: "pin" });
    expect(envoi.signature.signeA).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Envoyé à cabinet@…")).toBeInTheDocument();
    expect(screen.getByText(/^reçu \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au tableau de bord" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mon PIN/ })).toBeNull();
    expect(principal()).toHaveTextContent(
      "Les 4 transactions sans correspondance sont traitées. Le mois est verrouillé : plus aucune modification, seulement des écritures de janvier.",
    );
  });

  it("un PIN refusé compte un essai : rien n'est clôturé, la feuille reste ouverte", async () => {
    rendre({ scenario: "ComptableRapprochement" });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Clôturer décembre · mon PIN" }));
    await saisirPin(patron.PIN_REFUSE_PAR_LE_MOCK);
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Clôturer décembre · mon PIN" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Clôturer Décembre" }),
    ).toBeInTheDocument();
  });

  it("tant que le rapprochement est ouvert, le serveur refuse : erreur technique, aucun essai compté, mois toujours ouvert", async () => {
    rendre({ scenario: "ComptableRapprochement" });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Clôturer décembre · mon PIN" }));
    await saisirPin("246135");
    expect(await screen.findByText("Vérification impossible. Réessayez.")).toBeInTheDocument();
    expect(screen.queryByText(/PIN incorrect/)).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Clôturer Décembre" }),
    ).toBeInTheDocument();
  });

  it("fermer la feuille abandonne sans écrire", async () => {
    const envois: unknown[] = [];
    rendre({
      scenario: "ComptableRapprochement",
      clientApi: avecCloture((c) => c, { envois, scenario: "ComptableRapprochement" }),
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Clôturer décembre · mon PIN" }));
    await userEvent.click(await screen.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(envois).toEqual([]);
  });
});

describe("ComptableCloture · états chargement, vide, erreur", () => {
  it("chargement : des repères gris à la place des blocs, la mise en page tient, le retour reste utilisable", async () => {
    const client = avecCloture(() => new Promise<Cloture>(() => {}));
    rendre({ clientApi: client });
    const corps = await waitFor(() => {
      const main = principal();
      expect(main).toHaveAttribute("data-etat", "chargement");
      return main;
    });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(corps).toHaveAttribute("aria-label", "Chargement de la clôture");
    expect(screen.getByRole("heading", { level: 1, name: "Clôture du mois" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/comptable");
    expect(screen.getByRole("link", { name: "Revoir les exports" })).toBeInTheDocument();
    expect(screen.queryByText("Journal des ventes")).toBeNull();
    expect(corps.querySelectorAll("[aria-hidden='true'].am-pulse").length).toBeGreaterThan(8);
    expect(screen.queryByRole("button", { name: /mon PIN/ })).toBeNull();
  });

  it("erreur : le dit, propose Réessayer et recharge l'écran", async () => {
    const client = avecCloture((c, appel) => {
      if (appel === 1) throw new ErreurReseau("coupure");
      return c;
    });
    rendre({ clientApi: client });
    expect(await screen.findByRole("alert")).toHaveTextContent("La clôture ne s'est pas chargée.");
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.queryByText("Journal des ventes")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un mois inconnu (404) est un état vide, pas une panne", async () => {
    const client = avecCloture(() => {
      throw new ErreurHttp(404, "Introuvable", "MOIS_INDISPONIBLE");
    });
    rendre({ clientApi: client });
    expect(
      (await screen.findByText("Aucun mois à clôturer.")).closest("[role='status']"),
    ).not.toBeNull();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("clôturé sans accusé de réception : pas de « reçu », le reste est là", async () => {
    const client = avecCloture((c) => ({ ...c, envoi: { ...c.envoi, recuA: null } }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText("Envoyé à cabinet@…")).toBeInTheDocument();
    expect(screen.queryByText(/^reçu /)).toBeNull();
  });

  it("une seule transaction traitée : accord au singulier", async () => {
    const client = avecCloture((c) => ({ ...c, transactionsTraitees: 1 }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(principal()).toHaveTextContent("La transaction sans correspondance est traitée.");
  });

  it("le nombre de transactions traitées est celui de la clôture, sans lire le rapprochement", async () => {
    const lectures: string[] = [];
    const base = sourceScenariosFixtures();
    const client = creerClientMock({
      source: {
        ...base,
        charger: async (nom) => {
          const scenario = await base.charger(nom);
          return avecOperation(scenario, patron.OP_RAPPROCHEMENT.nom, async (suite) => {
            lectures.push("rapprochement");
            return suite();
          });
        },
      },
      scenario: "ComptableCloture",
      latenceMs: 0,
    });
    rendre({ clientApi: client });
    await attendreEcran();
    expect(principal()).toHaveTextContent("Les 4 transactions sans correspondance sont traitées.");
    expect(lectures).toEqual([]);
  });

  it("sans nombre fourni, la phrase du verrou ne parle pas de transactions", async () => {
    const client = avecCloture((c) => {
      const { transactionsTraitees: _ignore, ...sans } = c;
      return sans;
    });
    rendre({ clientApi: client });
    await attendreEcran();
    expect(principal()).not.toHaveTextContent(/transactions? sans correspondance/);
    expect(principal()).toHaveTextContent("Le mois est verrouillé");
  });

  it("zéro transaction traitée : la phrase n'en parle pas non plus", async () => {
    const client = avecCloture((c) => ({ ...c, transactionsTraitees: 0 }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(principal()).not.toHaveTextContent(/transactions? sans correspondance/);
  });
});

describe("ComptableCloture · textes", () => {
  it("les clés anglaises et pidgin sont celles du français (les textes vides se replient sur le français)", () => {
    const cles = (o: Record<string, unknown>, prefixe = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? cles(v as Record<string, unknown>, `${prefixe}${k}.`)
          : [`${prefixe}${k}`],
      );
    expect(cles(en).sort()).toEqual(cles(fr).sort());
    expect(cles(pcm).sort()).toEqual(cles(fr).sort());
  });
});
