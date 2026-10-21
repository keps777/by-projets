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

const planche = ecrans.ComptableRapprochement.donnees;

type Rapprochement = contrats.RapprochementMomo;

function rendre(clientApi?: ReturnType<typeof creerClientMock>) {
  return rendreApp({
    fixtures: true,
    scenario: "ComptableRapprochement",
    url: "/comptable/rapprochement",
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("MP261203.1142.A71290");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "ComptableRapprochement", latenceMs: 0 });
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

/** Change la réponse du rapprochement ; `suite` donne la réponse du scénario. */
function avecRapprochement(
  transformer: (reponse: Rapprochement, appel: number) => Rapprochement | Promise<Rapprochement>,
  options: { envois?: unknown[] } = {},
) {
  let appel = 0;
  return clientAvec((scenario) => {
    const avecLecture = avecOperation(scenario, patron.OP_RAPPROCHEMENT.nom, async (suite) => {
      appel += 1;
      return transformer((await suite()) as Rapprochement, appel);
    });
    return options.envois
      ? avecOperation(avecLecture, patron.OP_APPLIQUER_RAPPROCHEMENT.nom, (suite, params) => {
          options.envois!.push(params);
          return suite();
        })
      : avecLecture;
  });
}

function avecDecisions(
  decisions: Array<contrats.ActionRapprochement | null>,
): (r: Rapprochement) => Rapprochement {
  return (r) => ({
    ...r,
    lignes: r.lignes.map((l, i) => ({ ...l, decision: decisions[i] ?? null })),
  });
}

function boutonAppliquer(): HTMLElement {
  return screen.getByRole("button", { name: /^Appliquer / });
}

async function saisirPin(pin: string) {
  const clavier = await screen.findByRole("group", {
    name: "Clavier PIN pour signer les décisions",
  });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

describe("ComptableRapprochement · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, détail du mois, part sans correspondance et retour au Comptable", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sans correspondance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Décembre · 4 transactions sur 1 912 · 16 000 FCFA"),
    ).toBeInTheDocument();
    expect(screen.getByText("0,2 %")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/comptable");
  });

  it("reprend l'explication d'introduction de la planche", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText(planche.intro)).toBeInTheDocument();
  });

  it("liste les quatre transactions dans l'ordre : référence, date, numéro masqué, opérateur, montant", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Réf. opérateur · date · numéro")).toBeInTheDocument();
    expect(screen.getByText("montant")).toBeInTheDocument();
    const lignes = within(principal()).getAllByRole("listitem");
    expect(lignes).toHaveLength(4);
    planche.lignes.forEach((l, i) => {
      expect(lignes[i], l.reference).toHaveTextContent(l.reference);
      expect(lignes[i], l.reference).toHaveTextContent(l.quand);
      expect(lignes[i], l.reference).toHaveTextContent(
        l.montant.toLocaleString("fr-FR").replace(/\s/g, " "),
      );
    });
    expect(lignes[0]).toHaveTextContent("3 déc. 11:42 · 6 77 •• •• 41 · MTN");
    expect(lignes[1]).toHaveTextContent("9 déc. 06:58 · 6 99 •• •• 02 · Orange");
  });

  it("propose pour chaque ligne la cause probable de la planche, 2e et 1er en exposant", async () => {
    rendre();
    await attendreEcran();
    const lignes = within(principal()).getAllByRole("listitem");
    planche.lignes.forEach((l, i) => {
      expect(lignes[i]!.textContent, l.reference).toContain(l.cause);
    });
    const exposants = Array.from(lignes[0]!.querySelectorAll("sup")).map((s) => s.textContent);
    expect(exposants).toEqual(["e", "er"]);
  });

  it("l'action proposée de chaque ligne est un lien vers la clôture", async () => {
    rendre();
    await attendreEcran();
    const lignes = within(principal()).getAllByRole("listitem");
    ["Rembourser", "Rembourser", "Rattacher", "Demander"].forEach((libelle, i) => {
      const action = within(lignes[i]!).getByRole("link", { name: libelle });
      expect(action).toHaveAttribute("href", "/comptable/cloture");
    });
  });

  it("la couleur de l'explication dit la certitude : verte, verte, bleue, rouge", async () => {
    rendre();
    await attendreEcran();
    const lignes = within(principal()).getAllByRole("listitem");
    const ton = (i: number) => {
      const cause = Array.from(lignes[i]!.querySelectorAll("span")).find((s) =>
        /^(Probable|Inconnu) :/.test(s.textContent ?? ""),
      );
      return cause?.className ?? "";
    };
    expect(ton(0)).toMatch(/vert/);
    expect(ton(1)).toMatch(/vert/);
    expect(ton(2)).toMatch(/bleu/);
    expect(ton(3)).toMatch(/rouge/);
  });

  it("totalise ce qui reste à traiter : 16 000", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Total à traiter")).toBeInTheDocument();
    expect(screen.getByText("Total à traiter").parentElement).toHaveTextContent("16 000");
  });

  it("explique les trois actions et rappelle que rien n'est clôturé tant qu'une ligne reste ouverte", async () => {
    rendre();
    await attendreEcran();
    for (const a of planche.actions) {
      expect(screen.getAllByText(a.titre).length).toBeGreaterThan(0);
      expect(screen.getByText(a.detail)).toBeInTheDocument();
    }
    expect(screen.getByText(planche.pied)).toBeInTheDocument();
  });

  it("garde « Plus tard » et « Appliquer les 4 · mon PIN » en pied, hors de la zone principale", async () => {
    rendre();
    await attendreEcran();
    const plusTard = screen.getByRole("link", { name: "Plus tard" });
    expect(plusTard).toHaveAttribute("href", "/comptable");
    expect(principal().contains(plusTard)).toBe(false);
    const appliquer = boutonAppliquer();
    expect(appliquer).toHaveTextContent("Appliquer les 4 · mon PIN");
    expect(appliquer).toHaveTextContent("2 remboursements · 1 rattachement · 1 réclamation");
    expect(principal().contains(appliquer)).toBe(false);
    expect(appliquer.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});

describe("ComptableRapprochement · navigation de la planche", () => {
  it("« Retour » et « Plus tard » reviennent au Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("« Plus tard » revient au Comptable sans rien écrire", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre(avecRapprochement((r) => r, { envois }));
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Plus tard" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
    expect(envois).toEqual([]);
  });

  it.each([["Rembourser"], ["Rattacher"], ["Demander"]])(
    "« %s » mène à la clôture",
    async (libelle) => {
      const { routeur } = rendre();
      await attendreEcran();
      const lignes = within(principal()).getAllByRole("listitem");
      const ligne = lignes.find((l) => within(l).queryByRole("link", { name: libelle }));
      await userEvent.click(within(ligne!).getByRole("link", { name: libelle }));
      await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable/cloture"));
    },
  );
});

describe("ComptableRapprochement · appliquer les décisions avec le PIN", () => {
  it("toucher « Appliquer » ouvre la signature sans rien écrire avant le PIN", async () => {
    const envois: unknown[] = [];
    rendre(avecRapprochement((r) => r, { envois }));
    await attendreEcran();
    await userEvent.click(boutonAppliquer());
    const feuille = await screen.findByRole("dialog", { name: "Appliquer les 4 · mon PIN" });
    expect(within(feuille).getByText("Ton PIN signe ces décisions")).toBeInTheDocument();
    expect(envois).toEqual([]);
  });

  it("avec le bon PIN, envoie une décision par ligne ouverte (l'action proposée), signée, puis mène à la clôture", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre(avecRapprochement((r) => r, { envois }));
    await attendreEcran();
    await userEvent.click(boutonAppliquer());
    await saisirPin("246135");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable/cloture"));
    expect(envois).toHaveLength(1);
    const envoi = envois[0] as {
      mois: string;
      decisions: Array<{ reference: string; action: string }>;
      signature: { pin: string; methode: string; signeA: string };
    };
    expect(envoi.mois).toBe("2026-12");
    expect(envoi.decisions).toEqual([
      { reference: "MP261203.1142.A71290", action: "rembourser" },
      { reference: "OM261209.0658.K01884", action: "rembourser" },
      { reference: "MP261217.1930.B55012", action: "rattacher" },
      { reference: "OM261228.1405.Q77731", action: "demander" },
    ]);
    expect(envoi.signature).toMatchObject({ pin: "246135", methode: "pin" });
    expect(envoi.signature.signeA).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("un PIN refusé compte un essai : rien n'est appliqué, la feuille reste ouverte, on reste sur l'écran", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre(avecRapprochement((r) => r, { envois }));
    await attendreEcran();
    await userEvent.click(boutonAppliquer());
    await saisirPin(patron.PIN_REFUSE_PAR_LE_MOCK);
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Appliquer les 4 · mon PIN" })).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/comptable/rapprochement");
    expect(screen.getByText("MP261203.1142.A71290")).toBeInTheDocument();
  });

  it("fermer la feuille abandonne sans écrire", async () => {
    const envois: unknown[] = [];
    rendre(avecRapprochement((r) => r, { envois }));
    await attendreEcran();
    await userEvent.click(boutonAppliquer());
    await userEvent.click(await screen.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(envois).toEqual([]);
  });

  it("n'envoie que les lignes encore ouvertes, avec leur compte, leur total et un « Remboursé » sur les autres", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre(
      avecRapprochement((r) => avecDecisions(["rembourser", "rembourser"])(r), { envois }),
    );
    await attendreEcran();
    expect(boutonAppliquer()).toHaveTextContent("Appliquer les 2 · mon PIN");
    expect(boutonAppliquer()).toHaveTextContent("1 rattachement · 1 réclamation");
    expect(screen.getByText("Total à traiter").parentElement).toHaveTextContent("8 000");
    expect(screen.getAllByText("Remboursé")).toHaveLength(2);
    expect(screen.queryAllByRole("link", { name: "Rembourser" })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: /^(Rattacher|Demander)$/ })).toHaveLength(2);
    expect(
      screen.getByText(
        "Rien n'est clôturé tant qu'une ligne reste ouverte. Le cabinet reçoit les 2 décisions avec leurs références.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(boutonAppliquer());
    await saisirPin("135790");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable/cloture"));
    const envoi = envois[0] as { decisions: Array<{ reference: string; action: string }> };
    expect(envoi.decisions).toEqual([
      { reference: "MP261217.1930.B55012", action: "rattacher" },
      { reference: "OM261228.1405.Q77731", action: "demander" },
    ]);
  });

  it("une seule ligne ouverte : accords au singulier", async () => {
    rendre(
      avecRapprochement((r) => ({
        ...r,
        transactions: 1,
        montantTotal: 4000,
        lignes: r.lignes.slice(0, 1),
      })),
    );
    await attendreEcran();
    expect(screen.getByText("Décembre · 1 transaction sur 1 912 · 4 000 FCFA")).toBeInTheDocument();
    expect(boutonAppliquer()).toHaveTextContent("Appliquer la ligne · mon PIN");
    expect(boutonAppliquer()).toHaveTextContent("1 remboursement");
    expect(boutonAppliquer()).not.toHaveTextContent("remboursements");
    expect(
      screen.getByText(/Le cabinet reçoit la décision avec sa référence\./),
    ).toBeInTheDocument();
  });
});

describe("ComptableRapprochement · états chargement, vide, erreur", () => {
  it("chargement : des repères gris à la place des lignes, la mise en page tient, le retour reste utilisable", async () => {
    const client = avecRapprochement(() => new Promise<Rapprochement>(() => {}));
    rendre(client);
    const corps = await waitFor(() => {
      const main = principal();
      expect(main).toHaveAttribute("data-etat", "chargement");
      return main;
    });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("heading", { level: 1, name: "Sans correspondance" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/comptable");
    expect(screen.getByText("Total à traiter")).toBeInTheDocument();
    expect(screen.getByText("Remboursement")).toBeInTheDocument();
    expect(screen.queryByText("MP261203.1142.A71290")).toBeNull();
    expect(corps.querySelectorAll("[aria-hidden='true'].am-pulse").length).toBeGreaterThan(8);
    expect(screen.queryByRole("button", { name: /^Appliquer / })).toBeNull();
  });

  it("erreur : le dit, propose Réessayer et recharge l'écran", async () => {
    const client = avecRapprochement((r, appel) => {
      if (appel === 1) throw new ErreurReseau("coupure");
      return r;
    });
    rendre(client);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les transactions ne se sont pas chargées.",
    );
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.queryByRole("button", { name: /^Appliquer / })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("aucune transaction sans correspondance : le dit, sans bouton Appliquer", async () => {
    const client = avecRapprochement((r) => ({
      ...r,
      transactions: 0,
      montantTotal: 0,
      lignes: [],
    }));
    rendre(client);
    expect(
      (await screen.findByText("Aucune transaction sans correspondance.")).closest(
        "[role=\'status\']",
      ),
    ).not.toBeNull();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    expect(screen.queryByRole("button", { name: /^Appliquer / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("une réponse 404 (rien à rapprocher ce mois) est un état vide, pas une panne", async () => {
    const client = avecRapprochement(() => {
      throw new ErreurHttp(404, "Introuvable", "MOIS_INDISPONIBLE");
    });
    rendre(client);
    expect(
      (await screen.findByText("Aucune transaction sans correspondance.")).closest(
        "[role=\'status\']",
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("toutes les lignes traitées : le dit et ne propose plus d'appliquer", async () => {
    const client = avecRapprochement(
      avecDecisions(["rembourser", "rembourser", "rattacher", "demander"]),
    );
    rendre(client);
    expect(
      (await screen.findByText("Toutes les transactions sont traitées.")).closest(
        "[role=\'status\']",
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Appliquer / })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plus tard" })).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/comptable");
  });
});

describe("ComptableRapprochement · textes", () => {
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
