import {
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";
import {
  LIGNES_VISIBLES,
  couleurInitiales,
  finDeNumero,
  montant,
  tonIndicateur,
  type LigneReglage,
  type Regles,
} from "./formats";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import { detailLigne } from "./sections";
import { reglesApresBascule } from "./signature";

const config = ecrans.Config.donnees;
const [dlaYde, dlaBaf, ydeBaf] = config.lignes.liste;

function rendre(options: { url?: string; clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "Config",
    url: options.url ?? "/reglages",
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Équipe · 23 personnes");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien de la page (en-tête compris) qui porte ce texte. */
function lien(texte: string | RegExp): HTMLElement {
  const trouve = screen
    .getAllByRole("link")
    .find((a) =>
      typeof texte === "string" ? a.textContent === texte : texte.test(a.textContent ?? ""),
    );
  if (!trouve) throw new Error(`Pas de lien « ${String(texte)} »`);
  return trouve;
}

const liensPersonnes = () =>
  within(principal())
    .getAllByRole("link")
    .filter((a) => a.getAttribute("href")?.startsWith("/personnes/"));

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "Config", latenceMs: 0 });
}

/**
 * Remplace la réponse d'une opération du scénario, en gardant celle du mock pour les autres appels. `suite()` rend une
 * promesse : la source de scénarios replie les implémentations d'une même opération sur 404 (`replierSur404`).
 */
function avecOperation(
  scenario: Scenario,
  nom: string,
  remplacement: (suite: () => Promise<unknown>, params: unknown) => unknown,
): Scenario {
  return {
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === nom
        ? implementer(impl.operation, async (params, ctx) =>
            remplacement(
              async () => (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx),
              params,
            ),
          )
        : impl,
    ),
  };
}

describe("Config · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, sous-titre, retour et Modules", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Réglages" })).toBeInTheDocument();
    expect(
      screen.getByText("Lignes, tarifs, équipe, règles · tout se change ici"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(lien("Modules")).toBeInTheDocument();
  });

  it("affiche les trois lignes avec leurs tarifs, la proposition de l'assistant en ambre", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 2, name: "Lignes et tarifs" })).toBeInTheDocument();
    for (const ligne of config.lignes.liste) {
      const rangee = lien(new RegExp(`^${ligne.nom}`));
      expect(rangee).toHaveTextContent(`${ligne.nom}${ligne.detail}${ligne.action}`);
    }
    const proposition = within(lien(/^Douala → Yaoundé/)).getByText("10:00 → 09:15 proposé");
    expect(proposition).toHaveAttribute("data-propose", "true");
    expect(within(lien(/^Douala → Bafoussam/)).getByText("modifier")).toHaveAttribute(
      "data-propose",
      "false",
    );
  });

  it("affiche l'équipe : 23 personnes, quatre rôles avec leurs effectifs, les guichetiers d'abord", async () => {
    rendre();
    await attendreEcran();
    const filtres = screen.getByRole("group", { name: "Filtrer l'équipe par rôle" });
    const boutons = within(filtres).getAllByRole("button");
    expect(boutons.map((b) => b.textContent)).toEqual([
      "9guichetiers",
      "3superviseurs",
      "7convoyeurs",
      "4chauffeurs",
    ]);
    expect(boutons.map((b) => b.getAttribute("aria-current"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(screen.getByText("+ personne")).toBeInTheDocument();
  });

  it("liste les neuf guichetiers dans la liste glissable, avec leur synthèse en couleur", async () => {
    rendre();
    await attendreEcran();
    await screen.findByText("Joseph M.", { exact: false });
    const liste = screen.getByRole("list", { name: "guichetiers" });
    const lignes = liensPersonnes();
    expect(lignes).toHaveLength(9);
    expect(liste).toHaveAttribute("tabindex", "0");
    for (const g of config.equipe.guichetiers) {
      const rangee = lignes.find((a) => a.textContent?.startsWith(g.initiales));
      expect(rangee, g.nom).toHaveTextContent(
        `${g.initiales}${g.nom} · ${g.lieu}${g.detail}modifier`,
      );
    }
    expect(within(lignes[0]!).getByText("PIN à renouveler · 3 écarts")).toHaveAttribute(
      "data-ton",
      "ambre",
    );
    expect(within(lignes[1]!).getByText("1 204 billets · 0 écart")).toHaveAttribute(
      "data-ton",
      "neutre",
    );
    expect(within(lignes[2]!).getByText("bloquée · 3 PIN faux")).toHaveAttribute(
      "data-ton",
      "rouge",
    );
    expect(within(lignes[5]!).getByText("hors ligne 40 min")).toHaveAttribute("data-ton", "ambre");
    expect(screen.getByText("9 guichetiers · 3 visibles · glisser")).toBeInTheDocument();
    expect(lien("Voir la liste").querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("affiche les règles de l'agence avec leurs valeurs, interrupteurs éteints", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 2, name: "Règles" })).toBeInTheDocument();
    expect(lien(/^Annulation gratuite/)).toHaveTextContent(
      "Annulation gratuite jusqu'à 1 h avant · puis selon classemodifier",
    );
    expect(within(lien(/^Annulation gratuite/)).getByText("1 h").tagName).toBe("STRONG");
    expect(lien(/^Tolérance/)).toHaveTextContent("Tolérance d'écart de caisse · 1 000 Fmodifier");
    expect(within(lien(/^Tolérance/)).getByText("1 000 F").tagName).toBe("STRONG");
    expect(lien(/^Comptes MoMo/)).toHaveTextContent(
      "Comptes MoMo de l'agence · MTN ···· 02 · OM ···· 77modifier",
    );
    const cadence = screen.getByRole("switch", {
      name: "Numéro de téléphone obligatoire en mode cadence",
    });
    const frais = screen.getByRole("switch", {
      name: "Frais de service voyageur (250 F) pris en charge par l'agence",
    });
    expect(cadence).toHaveAttribute("aria-checked", "false");
    expect(frais).toHaveAttribute("aria-checked", "false");
  });

  it("garde la mention de traçabilité en pied d'écran", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText("Chaque changement est daté, signé, et visible dans le rapport du soir."),
    ).toBeInTheDocument();
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt », et dessine des icônes SVG", async () => {
    rendre();
    await attendreEcran();
    await screen.findByText("9 guichetiers · 3 visibles · glisser");
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByRole("link", { name: "Retour" }).querySelector("svg")).not.toBeNull();
  });
});

describe("Config · navigation identique à la maquette", () => {
  const id = (ligne: { _ligneId: string }) => ligne._ligneId;
  const premiersGuichetiers = config.equipe.guichetiers.slice(0, 3);

  const liens: Array<[string, string, string | RegExp]> = [
    ["Retour", "/aujourdhui", "Retour"],
    ["Modules", "/reglages/modules", "Modules"],
    ["+ ligne", "/reglages/ligne/nouvelle", "+ ligne"],
    ["Douala → Yaoundé", `/reglages/ligne/${id(dlaYde!)}`, /^Douala → Yaoundé/],
    ["Douala → Bafoussam", `/reglages/ligne/${id(dlaBaf!)}`, /^Douala → Bafoussam/],
    ["Yaoundé → Bafoussam", `/reglages/ligne/${id(ydeBaf!)}`, /^Yaoundé → Bafoussam/],
    ["+ personne", "/reglages/personne/nouvelle", "+ personne"],
    ["Voir la liste", "/reglages/equipe", "Voir la liste"],
    ["Annulation gratuite", "/reglages/regles", /^Annulation gratuite/],
    ["Tolérance d'écart", "/reglages/regles", /^Tolérance/],
    ["Comptes MoMo", "/reglages/regles", /^Comptes MoMo/],
    ...premiersGuichetiers.map((g): [string, string, RegExp] => [
      g.nom,
      `/personnes/${g._personneId}`,
      new RegExp(`^${g.initiales}`),
    ]),
  ];

  it.each(liens)("« %s » mène à %s", async (_nom, chemin, texte) => {
    const { routeur } = rendre();
    await attendreEcran();
    await screen.findByText("Marie T.", { exact: false });
    const cible = texte === "Retour" ? screen.getByRole("link", { name: "Retour" }) : lien(texte);
    expect(cible).toHaveAttribute("href", chemin);
    await userEvent.click(cible);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("les neuf guichetiers ouvrent chacun leur fiche patron", async () => {
    rendre();
    await attendreEcran();
    await screen.findByText("Marie T.", { exact: false });
    expect(liensPersonnes().map((a) => a.getAttribute("href"))).toEqual(
      config.equipe.guichetiers.map((g) => `/personnes/${g._personneId}`),
    );
  });
});

describe("Config · filtres de l'équipe, sur place", () => {
  it("un rôle touché montre sa liste sans quitter l'écran, le rôle courant est marqué", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await screen.findByText("9 guichetiers · 3 visibles · glisser");

    await userEvent.click(screen.getByRole("button", { name: /superviseurs/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /superviseurs/ })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: /guichetiers/ })).toHaveAttribute(
      "aria-current",
      "false",
    );
    expect(routeur.state.location.pathname).toBe("/reglages");
    expect(screen.queryByText("9 guichetiers · 3 visibles · glisser")).not.toBeInTheDocument();
    expect(screen.queryByText("Marie T.", { exact: false })).not.toBeInTheDocument();
  });

  it("revenir aux guichetiers remet leur liste", async () => {
    rendre();
    await attendreEcran();
    await screen.findByText("9 guichetiers · 3 visibles · glisser");
    await userEvent.click(screen.getByRole("button", { name: /convoyeurs/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /convoyeurs/ })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /guichetiers/ }));
    expect(await screen.findByText("9 guichetiers · 3 visibles · glisser")).toBeInTheDocument();
    expect(liensPersonnes()).toHaveLength(9);
  });

  it("un rôle sans personne le dit, sans casser la carte (pas de « glisser »)", async () => {
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_EQUIPE.nom, async (suite, params) => {
        const reponse = (await suite()) as { personnes: unknown[] };
        const role = (params as { role?: string }).role;
        return role === "convoyeur" ? { ...reponse, personnes: [] } : reponse;
      }),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: /convoyeurs/ }));
    expect(
      await screen.findByText("Personne dans cette équipe pour le moment."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 convoyeur · 0 visible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la liste" })).toBeInTheDocument();
  });

  it("une liste d'équipe qui ne se charge pas affiche une erreur et se relance, le reste de l'écran reste là", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_EQUIPE.nom, (suite) => {
        appels += 1;
        if (appels === 1) throw new ErreurReseau("coupure");
        return suite();
      }),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    expect(await screen.findByText("La liste ne s'est pas chargée.")).toBeInTheDocument();
    expect(lien(/^Annulation gratuite/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("9 guichetiers · 3 visibles · glisser")).toBeInTheDocument();
  });
});

describe("Config · interrupteurs des règles signés par le PIN", () => {
  const nomCadence = "Numéro de téléphone obligatoire en mode cadence";
  const nomFrais = "Frais de service voyageur (250 F) pris en charge par l'agence";

  async function saisirPin(pin: string) {
    const clavier = await screen.findByRole("group", {
      name: "Clavier PIN pour signer le changement",
    });
    for (const chiffre of pin) {
      await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
    }
  }

  it("toucher un interrupteur ouvre la signature sans rien changer avant le PIN", async () => {
    rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("switch", { name: nomCadence }));
    const feuille = await screen.findByRole("dialog", { name: nomCadence });
    expect(within(feuille).getByText("Ton PIN signe ce changement")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: nomCadence })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("avec le bon PIN, la règle change, la feuille se ferme, les autres règles ne bougent pas", async () => {
    rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("switch", { name: nomCadence }));
    await saisirPin("123456");
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: nomCadence })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: nomFrais })).toHaveAttribute("aria-checked", "false");
    expect(lien(/^Annulation gratuite/)).toHaveTextContent("1 h avant · puis selon classe");
    expect(lien(/^Tolérance/)).toHaveTextContent("1 000 F");
    expect(lien(/^Comptes MoMo/)).toHaveTextContent("MTN ···· 02 · OM ···· 77");
  });

  it("la signature envoyée porte le PIN, sa méthode et l'instant, et les règles complètes", async () => {
    const envois: unknown[] = [];
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_ENREGISTRER_REGLES.nom, (suite, params) => {
        envois.push(params);
        return suite();
      }),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(screen.getByRole("switch", { name: nomFrais }));
    await saisirPin("246135");
    await waitFor(() => expect(envois).toHaveLength(1));
    const envoi = envois[0] as {
      signature: { pin: string; methode: string; signeA: string };
      regles: Regles & { comptesMomo?: unknown };
    };
    expect(envoi.signature).toMatchObject({ pin: "246135", methode: "pin" });
    expect(envoi.signature.signeA).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(envoi.regles.fraisService).toEqual({ montant: 250, priseEnChargeParAgence: true });
    expect(envoi.regles.cadence).toEqual({ numeroObligatoire: false });
    expect(envoi.regles.caisse.toleranceEcart).toBe(1000);
    expect(envoi.regles).not.toHaveProperty("comptesMomo");
  });

  it("un PIN refusé compte un essai, la règle ne change pas et la feuille reste ouverte", async () => {
    rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("switch", { name: nomCadence }));
    await saisirPin(patron.PIN_REFUSE_PAR_LE_MOCK);
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: nomCadence })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: nomCadence })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("fermer la feuille abandonne le changement sans écrire", async () => {
    const envois: unknown[] = [];
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_ENREGISTRER_REGLES.nom, (suite, params) => {
        envois.push(params);
        return suite();
      }),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(screen.getByRole("switch", { name: nomCadence }));
    await userEvent.click(await screen.findByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(envois).toEqual([]);
  });
});

describe("Config · états chargement, vide et erreur", () => {
  it("chargement : mêmes blocs, aucun texte de donnée, en-tête et pied présents", async () => {
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_REGLAGES.nom, () => new Promise(() => undefined)),
    );
    rendre({ clientApi: client });
    expect(
      await screen.findByRole("status", { name: "Chargement des réglages" }),
    ).toBeInTheDocument();
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Réglages" })).toBeInTheDocument();
    expect(screen.queryByText("Lignes et tarifs")).not.toBeInTheDocument();
    expect(screen.getByText(/Chaque changement est daté/)).toBeInTheDocument();
    expect(lien("Modules")).toHaveAttribute("href", "/reglages/modules");
  });

  it("erreur : message dans le style nuit, Réessayer relance, les liens de l'en-tête restent là", async () => {
    let appels = 0;
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_REGLAGES.nom, (suite) => {
        appels += 1;
        if (appels === 1) throw new ErreurReseau("coupure");
        return suite();
      }),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Les réglages ne se sont pas chargés.");
    expect(lien("Modules")).toHaveAttribute("href", "/reglages/modules");
    expect(screen.queryByText("Lignes et tarifs")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aucune ligne : le dit, garde « + ligne » et le reste de l'écran", async () => {
    const client = clientAvec((scenario) =>
      avecOperation(scenario, patron.OP_REGLAGES.nom, async (suite) => ({
        ...((await suite()) as object),
        lignes: [],
      })),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    expect(
      screen.getByText("Aucune ligne pour le moment. Ajoute la première avec « + ligne »."),
    ).toBeInTheDocument();
    expect(lien("+ ligne")).toHaveAttribute("href", "/reglages/ligne/nouvelle");
    expect(lien(/^Tolérance/)).toBeInTheDocument();
  });
});

describe("Config · logique pure", () => {
  const ligne = (surcharge: Partial<LigneReglage> = {}): LigneReglage => ({
    id: "l1",
    nom: "A → B",
    nbDeparts: 4,
    tarifs: { classique: 3500, vip: 5000, bagage: 1000 },
    arrets: [],
    propositionAssistant: null,
    ...surcharge,
  });
  // `t` de test : renvoie la clé et ses paramètres, pour vérifier ce que detailLigne assemble.
  const t = ((cle: string, options?: Record<string, unknown>) =>
    `${cle}${options ? JSON.stringify(options) : ""}`) as never;

  it("montant : espace entre les milliers, sans signe", () => {
    expect(montant(4000)).toBe("4 000");
    expect(montant(1000)).toBe("1 000");
    expect(montant(250)).toBe("250");
    expect(montant(1204000)).toBe("1 204 000");
    expect(montant(-1000)).toBe("1 000");
  });

  it("finDeNumero : les deux derniers chiffres du numéro masqué", () => {
    expect(finDeNumero("6 77 •• •• 02")).toBe("···· 02");
    expect(finDeNumero("6 99 •• •• 77")).toBe("···· 77");
    expect(finDeNumero("")).toBe("····");
  });

  it("detailLigne : la grille complète quand l'assistant propose, sinon le prix classique et les arrêts", () => {
    expect(detailLigne(ligne({ propositionAssistant: "10:00 → 09:15" }), t)).toBe(
      [
        'lignes.detail.departs{"count":4}',
        'lignes.detail.classique{"prix":"3 500"}',
        'lignes.detail.vip{"prix":"5 000"}',
        'lignes.detail.bagage{"prix":"1 000"}',
      ].join(" · "),
    );
    expect(detailLigne(ligne({ arrets: ["Bafang", "Mbouda"] }), t)).toBe(
      [
        'lignes.detail.departs{"count":4}',
        "3 500",
        'lignes.detail.arrets{"liste":"Bafang, Mbouda"}',
      ].join(" · "),
    );
    expect(detailLigne(ligne(), t)).toBe(
      ['lignes.detail.departs{"count":4}', "3 500", "lignes.detail.prorata"].join(" · "),
    );
  });

  it("tonIndicateur : rouge si bloquée, ambre si le PIN est à renouveler ou le guichet hors ligne", () => {
    expect(tonIndicateur({ etat: "bloquee", indicateur: "bloquée · 3 PIN faux" })).toBe("rouge");
    expect(tonIndicateur({ etat: "en_service", indicateur: "PIN à renouveler · 3 écarts" })).toBe(
      "ambre",
    );
    expect(tonIndicateur({ etat: "en_service", indicateur: "hors ligne 40 min" })).toBe("ambre");
    expect(tonIndicateur({ etat: "en_service", indicateur: "612 billets · 0 écart" })).toBe(
      "neutre",
    );
  });

  it("couleurInitiales : gris si bloquée, ambre si alerte, sinon bleu ou vert, toujours le même pour une personne", () => {
    expect(couleurInitiales({ id: "p1", etat: "bloquee", indicateur: "" })).toBe("craie2");
    expect(couleurInitiales({ id: "p1", etat: "repos", indicateur: "" })).toBe("craie2");
    expect(
      couleurInitiales({ id: "p1", etat: "en_service", indicateur: "hors ligne 40 min" }),
    ).toBe("ambre");
    const normale = couleurInitiales({ id: "pers-marie", etat: "en_service", indicateur: "" });
    expect(["bleu", "vert"]).toContain(normale);
    expect(couleurInitiales({ id: "pers-marie", etat: "en_service", indicateur: "x" })).toBe(
      normale,
    );
  });

  it("reglesApresBascule : change la règle touchée, garde les autres, retire les comptes MoMo", () => {
    const regles: Regles = {
      annulation: {
        gratuiteJusqua: "1h_avant",
        retenue: "selon_classe",
        retenueParClassePct: { classique: 10, vip: 20 },
      },
      caisse: { toleranceEcart: 1000, auDela: "pin_superviseur_et_patron" },
      cadence: { numeroObligatoire: false },
      fraisService: { montant: 250, priseEnChargeParAgence: false },
      comptesMomo: {
        mtn: { numeroMasque: "6 77 •• •• 02" },
        orange: { numeroMasque: "6 99 •• •• 77" },
      },
    };
    const cadence = reglesApresBascule(regles, { cle: "cadence", valeur: true });
    expect(cadence.cadence).toEqual({ numeroObligatoire: true });
    expect(cadence.fraisService).toEqual(regles.fraisService);
    expect(cadence).not.toHaveProperty("comptesMomo");
    const frais = reglesApresBascule(regles, { cle: "fraisService", valeur: true });
    expect(frais.fraisService).toEqual({ montant: 250, priseEnChargeParAgence: true });
    expect(frais.cadence).toEqual(regles.cadence);
    expect(frais.annulation).toEqual(regles.annulation);
    expect(frais.caisse).toEqual(regles.caisse);
  });

  it("la liste montre trois lignes sans défiler", () => {
    expect(LIGNES_VISIBLES).toBe(3);
  });
});

describe("Config · textes", () => {
  const cles = (o: unknown, prefixe = ""): string[] =>
    typeof o === "object" && o !== null
      ? Object.entries(o).flatMap(([k, v]) => cles(v, `${prefixe}${k}.`))
      : [prefixe];

  it("l'anglais et le pidgin ont les mêmes clés que le français (textes à traduire)", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });

  it("les textes de la planche sont ceux de la maquette", () => {
    expect(fr.entete.titre).toBe("Réglages");
    expect(fr.lignes.titre).toBe("Lignes et tarifs");
    expect(fr.pied).toBe(config.pied);
    expect(fr.regles.cadence).toBe(config.regles.cadence);
    expect(fr.equipe.voirListe).toBe(config.equipe.liste);
    expect(fr.equipe.ajouter).toBe(config.equipe.ajouter);
    expect(fr.lignes.ajouter).toBe(config.lignes.ajouter);
    expect(fr.regles.tolerance.debut).toBe(config.regles.tolerance.libelle);
  });
});
