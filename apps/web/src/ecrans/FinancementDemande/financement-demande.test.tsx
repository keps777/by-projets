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

const planche = ecrans.FinancementDemande.donnees;

type Dossier = contrats.DossierFinancement;

function rendre(options: { url?: string; clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "FinancementDemande",
    url: options.url ?? "/financement/demande/AV-2027-0041",
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("90 jours de ventes certifiées AfriMove");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
  scenario = "FinancementDemande",
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

/** Change la réponse de la lecture du dossier ; `appel` compte les lectures (1 = la première). */
function avecDossier(
  transformer: (dossier: Dossier, appel: number) => Dossier | Promise<Dossier>,
  extra: (scenario: Scenario) => Scenario = (s) => s,
) {
  let appel = 0;
  return clientAvec((scenario) =>
    extra(
      avecOperation(scenario, patron.OP_DOSSIER_FINANCEMENT.nom, async (suite) => {
        appel += 1;
        return transformer((await suite()) as Dossier, appel);
      }),
    ),
  );
}

/** Enregistre les paramètres de chaque retrait envoyé, puis laisse le mock répondre (ou remplace sa réponse). */
function avecRetrait(
  envois: unknown[],
  remplacer?: (suite: () => unknown) => unknown,
): (scenario: Scenario) => Scenario {
  return (scenario) =>
    avecOperation(scenario, patron.OP_RETIRER_DEMANDE.nom, (suite, params) => {
      envois.push(params);
      return remplacer ? remplacer(suite) : suite();
    });
}

async function saisirPin(pin: string) {
  const clavier = await screen.findByRole("group", { name: "Clavier PIN pour signer le retrait" });
  for (const chiffre of pin) {
    await userEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

const lienRetirer = () => screen.getByRole("link", { name: "Retirer la demande" });

describe("FinancementDemande · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, avance, partenaire à désigner en ambre, numéro, pastille EN COURS", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Dossier envoyé" })).toBeInTheDocument();
    const entete = document.querySelector("header") as HTMLElement;
    expect(entete).toHaveTextContent(`${planche.detail}EN COURS`);
    const partenaire = within(entete).getByText("[établissement financier partenaire]");
    expect(partenaire.className).toMatch(/partenaire/);
    const pastille = within(entete).getByText("EN COURS");
    expect(pastille).toHaveAttribute("data-statut", "enCours");
    expect(pastille.querySelector(".am-pulse")).not.toBeNull();
  });

  it("affiche le montant, le délai de réponse et les trois conditions", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("6 000 000")).toBeInTheDocument();
    expect(screen.getByText("FCFA · réponse sous 24 h")).toBeInTheDocument();
    for (const { libelle, valeur } of planche.demande.conditions) {
      const terme = screen.getByText(libelle);
      expect(terme.nextElementSibling, libelle).toHaveTextContent(valeur);
    }
    // le coût total n'est pas encore fixé par le partenaire : crochet ambre
    expect(screen.getByText("[x %] · partenaire")).toHaveAttribute("data-ton", "ambre");
    expect(screen.getByText("8 % des ventes MoMo")).not.toHaveAttribute("data-ton", "ambre");
  });

  it("liste les quatre pièces jointes automatiques, une coche et un format chacune", async () => {
    rendre();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Pièces jointes · automatiques" });
    expect(within(bloc).getByText("rien à scanner")).toBeInTheDocument();
    const lignes = within(bloc).getAllByRole("listitem");
    expect(lignes).toHaveLength(4);
    planche.pieces.liste.forEach((piece, i) => {
      expect(lignes[i], piece.nom).toHaveTextContent(piece.nom);
      expect(lignes[i], piece.nom).toHaveTextContent(piece.detail);
      expect(lignes[i], piece.nom).toHaveTextContent(new RegExp(`${piece.format}$`));
      expect(lignes[i]!.querySelector("svg[aria-hidden='true']"), piece.nom).not.toBeNull();
    });
  });

  it("montre la frise : envoyé (fait), analyse (en cours, qui pulse), versement (à venir) avec le « 1er » en exposant", async () => {
    rendre();
    await attendreEcran();
    const titre = screen.getByRole("heading", { level: 2, name: "Suivi" });
    const etapes = within(titre.parentElement!).getAllByRole("listitem");
    expect(etapes.map((e) => e.textContent)).toEqual([
      "Envoyé · aujourd'hui 10:04 · accusé reçu du partenaire",
      "Analyse · le partenaire décide seul · jusqu'à demain 10:04",
      "Versement sur ton compte · SMS + notification · le 8 % démarre au 1er billet MoMo suivant",
    ]);
    expect(etapes.map((e) => e.getAttribute("data-etat"))).toEqual(["fait", "en_cours", "a_venir"]);
    expect(within(etapes[0]!).getByText("Envoyé").tagName).toBe("STRONG");
    expect(within(etapes[1]!).getByText("Analyse").tagName).toBe("STRONG");
    // seule l'étape en cours pulse
    expect(etapes.map((e) => e.querySelector(".am-pulse") !== null)).toEqual([false, true, false]);
    expect(etapes[1]).toHaveAttribute("aria-current", "step");
    expect(within(etapes[2]!).getByText("er").tagName).toBe("SUP");
  });

  it("rappelle qu'AfriMove ne prête pas et que la demande se retire tant qu'elle n'est pas versée", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText(planche.mention)).toBeInTheDocument();
  });

  it("n'a aucun bouton grisé, nomme le bouton rond et garde les liens du pied sous le corps", async () => {
    rendre();
    await attendreEcran();
    for (const bouton of screen.queryAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(principal().contains(lienRetirer())).toBe(false);
    expect(
      principal().contains(screen.getByRole("link", { name: /^Retour au tableau de bord/ })),
    ).toBe(false);
    expect(screen.queryByText(/bientôt/i)).toBeNull();
  });

  it("n'écrit aucun emoji", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("FinancementDemande · navigation de la planche", () => {
  it("« Retour » mène au Financement (/financement)", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/financement");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/financement"));
  });

  it("« Retour au tableau de bord » mène au Patron (/aujourdhui) sans rien écrire", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre({ clientApi: avecDossier((d) => d, avecRetrait(envois)) });
    await attendreEcran();
    const retour = screen.getByRole("link", {
      name: "Retour au tableau de bord je te préviens dès la réponse",
    });
    expect(retour).toHaveAttribute("href", "/aujourdhui");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
    expect(envois).toEqual([]);
  });

  it("« Retirer la demande » garde la destination Financement (/financement)", async () => {
    rendre();
    await attendreEcran();
    expect(lienRetirer()).toHaveAttribute("href", "/financement");
  });
});

describe("FinancementDemande · retirer la demande", () => {
  it("toucher « Retirer la demande » ouvre la signature par PIN sans rien écrire ni quitter l'écran", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre({ clientApi: avecDossier((d) => d, avecRetrait(envois)) });
    await attendreEcran();
    await userEvent.click(lienRetirer());
    const feuille = await screen.findByRole("dialog", { name: "Retirer la demande" });
    expect(within(feuille).getByText("Ton PIN signe le retrait de la demande")).toBeInTheDocument();
    expect(envois).toEqual([]);
    expect(routeur.state.location.pathname).toBe("/financement/demande/AV-2027-0041");
  });

  it("signe le retrait avec le PIN, retire le dossier et mène au Financement", async () => {
    const envois: unknown[] = [];
    const client = avecDossier((d) => d, avecRetrait(envois));
    const { routeur } = rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(lienRetirer());
    await saisirPin("246135");

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/financement"));
    expect(envois).toHaveLength(1);
    const envoi = envois[0] as {
      dossierId: string;
      signature: { pin: string; methode: string; signeA: string };
    };
    expect(envoi.dossierId).toBe("AV-2027-0041");
    expect(envoi.signature).toMatchObject({ pin: "246135", methode: "pin" });
    expect(envoi.signature.signeA).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // le serveur a bien retiré le dossier
    const dossier = await client.executer(patron.OP_DOSSIER_FINANCEMENT, {
      dossierId: "AV-2027-0041",
    });
    expect(dossier).toMatchObject({ statut: "retire", retirable: false });
  });

  it("un PIN refusé compte un essai : rien n'est retiré, la feuille reste ouverte", async () => {
    const envois: unknown[] = [];
    const { routeur } = rendre({ clientApi: avecDossier((d) => d, avecRetrait(envois)) });
    await attendreEcran();
    await userEvent.click(lienRetirer());
    await saisirPin(patron.PIN_REFUSE_PAR_LE_MOCK);
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Retirer la demande" })).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/financement/demande/AV-2027-0041");
    expect(screen.queryByText(/Le retrait n'a pas été envoyé|ne peut plus être retiré/)).toBeNull();
  });

  it("fermer la feuille abandonne sans écrire", async () => {
    const envois: unknown[] = [];
    rendre({ clientApi: avecDossier((d) => d, avecRetrait(envois)) });
    await attendreEcran();
    await userEvent.click(lienRetirer());
    await userEvent.click(await screen.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(envois).toEqual([]);
  });

  it("si le partenaire a versé entre-temps (409), le dit, ferme la feuille et retire le bouton", async () => {
    const envois: unknown[] = [];
    const client = avecDossier(
      (d, appel) => (appel === 1 ? d : { ...d, statut: "verse", retirable: false }),
      avecRetrait(envois, () => {
        throw new ErreurHttp(409, "Le dossier n'est plus retirable", "DOSSIER_NON_RETIRABLE");
      }),
    );
    const { routeur } = rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(lienRetirer());
    await saisirPin("246135");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le dossier ne peut plus être retiré : le partenaire a déjà répondu.",
    );
    expect(envois).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Retirer la demande" })).toBeNull(),
    );
    expect(screen.getByText("VERSÉ")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/financement/demande/AV-2027-0041");
  });

  it("une panne au retrait reste sur l'écran avec une alerte et laisse le dossier retirable", async () => {
    const client = avecDossier(
      (d) => d,
      avecRetrait([], () => {
        throw new ErreurReseau("coupure");
      }),
    );
    const { routeur } = rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(lienRetirer());
    await saisirPin("246135");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le retrait n'a pas été envoyé. Réessaie.",
    );
    expect(routeur.state.location.pathname).toBe("/financement/demande/AV-2027-0041");
    expect(lienRetirer()).toBeInTheDocument();
  });

  it("le mock refuse de retirer deux fois : un dossier retiré n'est plus retirable", async () => {
    const client = clientAvec((s) => s);
    const commande = {
      dossierId: "AV-2027-0041",
      signature: {
        pin: "246135",
        methode: "pin" as const,
        signeA: "2027-01-05T10:06:00.000+01:00",
      },
    };
    await client.executer(patron.OP_RETIRER_DEMANDE, commande);
    await expect(client.executer(patron.OP_RETIRER_DEMANDE, commande)).rejects.toMatchObject({
      statut: 409,
      code: "DOSSIER_NON_RETIRABLE",
    });
  });
});

describe("FinancementDemande · autres issues du dossier", () => {
  it("dossier versé : pastille VERSÉ, aucun « Retirer » (ni bouton grisé), seul le retour reste, mention raccourcie", async () => {
    const client = avecDossier((d) => ({ ...d, statut: "verse", retirable: false }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText("VERSÉ")).toHaveAttribute("data-statut", "active");
    expect(screen.queryByRole("link", { name: "Retirer la demande" })).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByRole("link", { name: /^Retour au tableau de bord/ })).toBeInTheDocument();
    expect(principal()).toHaveTextContent(
      "AfriMove ne prête pas et ne touche pas l'argent : il présente ton dossier et exécute le prélèvement convenu.",
    );
    expect(principal()).not.toHaveTextContent("Tu peux retirer la demande");
  });

  it.each([
    ["refuse", "REFUSÉ"],
    ["retire", "RETIRÉ"],
  ] as const)("dossier %s : pastille %s, plus de retrait", async (statut, libelle) => {
    const client = avecDossier((d) => ({ ...d, statut, retirable: false }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText(libelle)).toBeInTheDocument();
    expect(screen.queryByText("EN COURS")).toBeNull();
    expect(screen.queryByRole("link", { name: "Retirer la demande" })).toBeNull();
  });

  it("dossier envoyé il y a un instant (statut « envoyé ») : même pastille EN COURS", async () => {
    const client = avecDossier((d) => ({ ...d, statut: "envoye" }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText("EN COURS")).toBeInTheDocument();
  });

  it("partenaire nommé et coût total fixé : plus de crochets, ni d'ambre", async () => {
    const client = avecDossier((d) => ({
      ...d,
      partenaire: "Banque Atlantique",
      conditions: { ...d.conditions, coutTotalPct: 12.5, dureeEstimeeSemaines: 1 },
    }));
    rendre({ clientApi: client });
    await attendreEcran();
    const entete = document.querySelector("header") as HTMLElement;
    expect(entete).toHaveTextContent("Avance 6 M · Banque Atlantique · n° AV-2027-0041");
    expect(screen.queryByText(/^\[/)).toBeNull();
    expect(screen.getByText("12,5 % · partenaire")).toHaveAttribute("data-ton", "neutre");
    expect(screen.getByText("≈ 1 semaine")).toBeInTheDocument();
  });

  it("calcule le délai de réponse annoncé depuis l'envoi", async () => {
    const client = avecDossier((d) => ({ ...d, reponseAvant: "2027-01-07T10:04:00.000+01:00" }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText("FCFA · réponse sous 48 h")).toBeInTheDocument();
  });

  it("un montant abrégé non rond : « Avance 1,5 M » et « 1 500 000 »", async () => {
    const client = avecDossier((d) => ({ ...d, montant: 1_500_000 }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText("1 500 000")).toBeInTheDocument();
    expect(document.querySelector("header")).toHaveTextContent("Avance 1,5 M");
  });
});

describe("FinancementDemande · états chargement, vide, erreur", () => {
  it("chargement : des repères gris à la place des blocs, la mise en page tient, le retour reste utilisable", async () => {
    const client = avecDossier(() => new Promise<Dossier>(() => {}));
    rendre({ clientApi: client });
    const corps = await waitFor(() => {
      const main = principal();
      expect(main).toHaveAttribute("data-etat", "chargement");
      return main;
    });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(corps).toHaveAttribute("aria-label", "Chargement du dossier");
    expect(screen.getByRole("heading", { level: 1, name: "Dossier envoyé" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/financement");
    expect(screen.getByRole("link", { name: /^Retour au tableau de bord/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Retirer la demande" })).toBeNull();
    expect(screen.queryByText("90 jours de ventes certifiées AfriMove")).toBeNull();
    expect(
      document.querySelectorAll("[aria-hidden='true'].am-pulse").length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("erreur : le dit, propose Réessayer et recharge l'écran", async () => {
    const client = avecDossier((d, appel) => {
      if (appel === 1) throw new ErreurReseau("coupure");
      return d;
    });
    rendre({ clientApi: client });
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger le dossier");
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.queryByText("90 jours de ventes certifiées AfriMove")).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/financement");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un dossier inconnu (404) est un état vide, pas une panne", async () => {
    rendre({ url: "/financement/demande/AV-2027-9999" });
    expect(await screen.findByText("Dossier introuvable")).toBeInTheDocument();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/financement");
  });
});

describe("FinancementDemande · textes", () => {
  it("les clés de l'anglais et du pidgin sont celles du français", () => {
    const cles = (objet: Record<string, unknown>, prefixe = ""): string[] =>
      Object.entries(objet).flatMap(([cle, valeur]) =>
        typeof valeur === "object" && valeur !== null
          ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
          : [`${prefixe}${cle}`],
      );
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
