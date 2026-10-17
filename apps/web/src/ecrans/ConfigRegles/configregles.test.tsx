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
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const URL_REGLES = "/reglages/regles";

type Implementation = Scenario["operations"][number];
type Modifier = (operations: readonly Implementation[]) => readonly Implementation[];

/** Un client mock des scénarios de fixtures, dont on peut remplacer des opérations (pour espionner ou faire échouer). */
function clientAvec(modifier: Modifier) {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return { ...scenario, operations: modifier(scenario.operations) };
    },
  };
  return creerClientMock({ source, scenario: "ConfigRegles", latenceMs: 0 });
}

function remplacer(nom: string, fabrique: (originale: Implementation) => Implementation): Modifier {
  return (operations) =>
    operations.map((impl) => (impl.operation.nom === nom ? fabrique(impl) : impl));
}

/** Même réponse que le mock, après avoir noté l'appel. */
function espionner(nom: string, appels: unknown[]): Modifier {
  return remplacer(nom, (impl) =>
    implementer(impl.operation, (params, ctx) => {
      appels.push(params);
      return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
    }),
  );
}

function enchainer(...modifiers: Modifier[]): Modifier {
  return (operations) => modifiers.reduce((ops, modifier) => modifier(ops), operations);
}

function rendre(
  options: { url?: string; modifier?: Modifier; client?: ReturnType<typeof clientAvec> } = {},
) {
  return rendreApp({
    scenario: "ConfigRegles",
    url: options.url ?? URL_REGLES,
    ...(options.client
      ? { clientApi: options.client }
      : options.modifier
        ? { clientApi: clientAvec(options.modifier) }
        : { fixtures: true }),
  });
}

async function attendreEcran() {
  await screen.findByRole("heading", { level: 1, name: "Règles de l’agence" });
  // Les règles sont là quand le champ de tolérance l'est.
  await screen.findByRole("textbox", { name: "Tolérance d’écart" });
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

const liste = (nom: string | RegExp) => screen.getByRole("combobox", { name: nom });
const champ = (nom: string | RegExp) => screen.getByRole("textbox", { name: nom });
const boutonEnregistrer = () => screen.getByRole("button", { name: /^Enregistrer · mon PIN/ });

async function saisirPin(pin: string) {
  const feuille = await screen.findByRole("dialog");
  for (const chiffre of pin) {
    await userEvent.click(within(feuille).getByRole("button", { name: chiffre }));
  }
}

async function retaper(nom: string | RegExp, texte: string) {
  const saisie = champ(nom);
  await userEvent.clear(saisie);
  await userEvent.type(saisie, texte);
}

const SIGNEE = /^2027-01-05T07:3\d:\d\d(\.\d{3})?\+01:00$/;

describe("ConfigRegles · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, sous-titre, badge des gares et retour aux réglages", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText("S’appliquent à toutes les gares · signées par ton PIN"),
    ).toBeInTheDocument();
    expect(await screen.findByText("3 GARES")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/reglages");
  });

  it("affiche l'annulation par le voyageur : les deux listes, leurs valeurs et la note", async () => {
    rendre();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Annulation par le voyageur" });
    expect(within(bloc).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Annulation par le voyageur",
    );
    expect(liste("Gratuite jusqu’à")).toHaveDisplayValue("1 h avant le départ");
    expect(liste("Gratuite jusqu’à")).toHaveValue("1h_avant");
    expect(liste("Ensuite · retenue")).toHaveDisplayValue(
      "selon la classe (VIP 20 %, classique 10 %)",
    );
    expect(
      within(bloc).getByText(
        "Le remboursement part sur le même MoMo, le siège se libère tout de suite. Au guichet, après le délai, seul le superviseur peut annuler avec son PIN.",
      ),
    ).toBeInTheDocument();
  });

  it("propose les choix de la planche, dans son ordre", async () => {
    rendre();
    await attendreEcran();
    const choix = (nom: string) =>
      within(liste(nom))
        .getAllByRole("option")
        .map((o) => o.textContent);
    expect(choix("Gratuite jusqu’à")).toEqual([
      "1 h avant le départ",
      "2 h avant",
      "la veille 20:00",
      "jamais",
    ]);
    expect(choix("Ensuite · retenue")).toEqual([
      "selon la classe (VIP 20 %, classique 10 %)",
      "10 % partout",
      "50 % partout",
      "pas de remboursement",
    ]);
    expect(choix("Au-delà")).toEqual([
      "PIN superviseur + patron prévenu",
      "PIN superviseur seulement",
      "bloque le guichet",
    ]);
  });

  it("affiche la caisse et les comptes MoMo de l'agence avec leur note", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 2, name: "Caisse" })).toBeInTheDocument();
    expect(champ("Tolérance d’écart")).toHaveValue("1 000");
    expect(liste("Au-delà")).toHaveDisplayValue("PIN superviseur + patron prévenu");
    expect(
      screen.getByRole("heading", { level: 2, name: "Comptes MoMo de l’agence" }),
    ).toBeInTheDocument();
    expect(champ("MTN MoMo · marchand")).toHaveValue("6 77 •• •• 02");
    expect(champ("Orange Money · marchand")).toHaveValue("6 99 •• •• 77");
    expect(
      screen.getByText(
        "Changer un compte exige ton PIN et un SMS de confirmation à l’ancien numéro. Les ventes en cours restent sur l’ancien compte jusqu’à minuit.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Chaque règle garde son historique : qui, quand, ancienne et nouvelle valeur.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche le pied : Annuler vers les réglages et « Enregistrer · mon PIN » avec ses 3 gares", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/reglages");
    await waitFor(() =>
      expect(boutonEnregistrer()).toHaveTextContent(
        "Enregistrer · mon PINappliqué dès maintenant · 3 gares",
      ),
    );
  });

  it("sans le nombre de gares, la planche s'affiche sans badge ni « · 3 gares »", async () => {
    rendre({
      modifier: remplacer(patron.OP_GARES.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    });
    await attendreEcran();
    expect(screen.queryByText(/GARES?$/)).not.toBeInTheDocument();
    expect(boutonEnregistrer()).toHaveTextContent("Enregistrer · mon PINappliqué dès maintenant");
    expect(boutonEnregistrer()).not.toHaveTextContent("gares");
  });

  it("les champs et listes ont un nom, les icônes sont décoratives, ni emoji ni bouton grisé", async () => {
    rendre();
    await attendreEcran();
    expect(within(principal()).getAllByRole("combobox")).toHaveLength(3);
    expect(within(principal()).getAllByRole("textbox")).toHaveLength(3);
    for (const controle of [
      ...within(principal()).getAllByRole("combobox"),
      ...within(principal()).getAllByRole("textbox"),
    ]) {
      expect(controle).toHaveAccessibleName();
    }
    expect(document.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(document.querySelectorAll("button:disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[oô]t/i);
  });
});

describe("ConfigRegles · modifier le brouillon (rien n'est enregistré)", () => {
  it("changer une liste ou la tolérance ne touche pas à l'API ; Annuler revient aux réglages", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({
      modifier: enchainer(
        espionner(patron.OP_ENREGISTRER_REGLES.nom, ecritures),
        espionner(patron.OP_CONFIRMER_COMPTE_MOMO.nom, ecritures),
        espionner(patron.OP_CHANGER_COMPTE_MOMO.nom, ecritures),
      ),
    });
    await attendreEcran();
    await userEvent.selectOptions(liste("Gratuite jusqu’à"), "jamais");
    await retaper("Tolérance d’écart", "5000");
    expect(champ("Tolérance d’écart")).toHaveValue("5 000");
    expect(liste("Gratuite jusqu’à")).toHaveValue("jamais");

    await userEvent.click(screen.getByRole("link", { name: "Annuler" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
    expect(ecritures).toEqual([]);
  });

  it("le retour de l'en-tête mène aux réglages sans rien enregistrer", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({
      modifier: espionner(patron.OP_ENREGISTRER_REGLES.nom, ecritures),
    });
    await attendreEcran();
    await userEvent.selectOptions(liste("Au-delà"), "bloque_guichet");
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
    expect(ecritures).toEqual([]);
  });

  it("sans aucun changement, « Enregistrer » revient aux réglages sans clavier PIN ni écriture", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({
      modifier: espionner(patron.OP_ENREGISTRER_REGLES.nom, ecritures),
    });
    await attendreEcran();
    await userEvent.click(boutonEnregistrer());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ecritures).toEqual([]);
  });

  it("une tolérance vidée bloque l'enregistrement : champ marqué, message, pas de clavier PIN", async () => {
    rendre();
    await attendreEcran();
    await userEvent.clear(champ("Tolérance d’écart"));
    await userEvent.click(boutonEnregistrer());
    expect(champ("Tolérance d’écart")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Entre un montant en francs.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.type(champ("Tolérance d’écart"), "2000");
    await userEvent.click(boutonEnregistrer());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Entre un montant en francs.")).not.toBeInTheDocument();
  });

  it("un compte retapé qui n'est pas un numéro est refusé avant le PIN ; un compte laissé tel quel ne l'est pas", async () => {
    rendre();
    await attendreEcran();
    await retaper("MTN MoMo · marchand", "12");
    await userEvent.click(boutonEnregistrer());
    expect(champ("MTN MoMo · marchand")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Entre un numéro à 9 chiffres.");
    expect(champ("Orange Money · marchand")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ConfigRegles · enregistrer avec le PIN", () => {
  it("envoie les règles signées (le reste inchangé), puis revient aux réglages", async () => {
    const ecritures: contrats.EnregistrerRegles[] = [];
    const sms: unknown[] = [];
    const { routeur } = rendre({
      modifier: enchainer(
        // Cadence, frais de service et retenue par classe ne sont pas sur la planche : ils doivent repartir tels quels.
        remplacer(patron.OP_REGLES.nom, (impl) =>
          implementer(impl.operation, async (params, ctx) => {
            const regles = (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
              params,
              ctx,
            )) as contrats.ReglesAgence;
            return {
              ...regles,
              cadence: { numeroObligatoire: true },
              fraisService: { montant: 300, priseEnChargeParAgence: true },
            };
          }),
        ),
        espionner(patron.OP_ENREGISTRER_REGLES.nom, ecritures),
        espionner(patron.OP_CONFIRMER_COMPTE_MOMO.nom, sms),
      ),
    });
    await attendreEcran();
    await userEvent.selectOptions(liste("Gratuite jusqu’à"), "2h_avant");
    await userEvent.selectOptions(liste("Ensuite · retenue"), "dix_pct");
    await retaper("Tolérance d’écart", "2500");
    await userEvent.selectOptions(liste("Au-delà"), "pin_superviseur");
    await userEvent.click(boutonEnregistrer());

    // Le PIN d'abord : rien n'est parti.
    expect(
      await screen.findByRole("dialog", { name: "Signer l’enregistrement" }),
    ).toHaveTextContent("4 changements · tracé dans le journal");
    expect(ecritures).toEqual([]);

    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));

    expect(ecritures).toHaveLength(1);
    const corps = ecritures[0]!;
    expect(corps.regles).toEqual({
      annulation: {
        gratuiteJusqua: "2h_avant",
        retenue: "dix_pct",
        retenueParClassePct: { classique: 10, vip: 20 },
      },
      caisse: { toleranceEcart: 2500, auDela: "pin_superviseur" },
      cadence: { numeroObligatoire: true },
      fraisService: { montant: 300, priseEnChargeParAgence: true },
    });
    expect(corps.signature).toMatchObject({ pin: "123456", methode: "pin" });
    expect(corps.signature.signeA).toMatch(SIGNEE);
    // Aucun compte retapé : pas de SMS.
    expect(sms).toEqual([]);
  });

  it("l'enregistrement met les règles à jour pour les autres écrans : la lecture suivante rend les nouvelles valeurs", async () => {
    const client = clientAvec((operations) => operations);
    rendre({ client });
    await attendreEcran();
    await userEvent.selectOptions(liste("Gratuite jusqu’à"), "veille_20h");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const relues = await client.executer(patron.OP_REGLES, undefined);
    expect(relues.annulation.gratuiteJusqua).toBe("veille_20h");
    expect(relues.comptesMomo.mtn.numeroMasque).toBe("6 77 •• •• 02");
  });

  it("un PIN refusé est dit, compte un essai et n'enregistre rien", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({
      modifier: espionner(patron.OP_ENREGISTRER_REGLES.nom, ecritures),
    });
    await attendreEcran();
    await userEvent.selectOptions(liste("Gratuite jusqu’à"), "jamais");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("000000");
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_REGLES);
    expect(screen.queryByText(/Les règles n’ont pas été enregistrées/)).not.toBeInTheDocument();
  });

  it("une panne à l'enregistrement est dite, rien n'est perdu et on reste sur l'écran", async () => {
    const { routeur } = rendre({
      modifier: remplacer(patron.OP_ENREGISTRER_REGLES.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    });
    await attendreEcran();
    await userEvent.selectOptions(liste("Gratuite jusqu’à"), "jamais");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    expect(await screen.findByText(/Les règles n’ont pas été enregistrées/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_REGLES);

    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(liste("Gratuite jusqu’à")).toHaveValue("jamais");
  });

  it("fermer le clavier PIN abandonne l'enregistrement : rien n'est envoyé", async () => {
    const ecritures: unknown[] = [];
    rendre({ modifier: espionner(patron.OP_ENREGISTRER_REGLES.nom, ecritures) });
    await attendreEcran();
    await userEvent.selectOptions(liste("Gratuite jusqu’à"), "jamais");
    await userEvent.click(boutonEnregistrer());
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ecritures).toEqual([]);
  });
});

describe("ConfigRegles · changer un compte MoMo (PIN + SMS à l'ancien numéro)", () => {
  it("demande le PIN, fait partir le SMS vers l'ancien numéro, puis le code et un PIN neuf changent le compte", async () => {
    const sms: contrats.DemanderConfirmationCompteMomo[] = [];
    const changements: contrats.ChangerCompteMomo[] = [];
    const regles: unknown[] = [];
    const { routeur } = rendre({
      modifier: enchainer(
        espionner(patron.OP_CONFIRMER_COMPTE_MOMO.nom, sms),
        espionner(patron.OP_CHANGER_COMPTE_MOMO.nom, changements),
        espionner(patron.OP_ENREGISTRER_REGLES.nom, regles),
      ),
    });
    await attendreEcran();
    await retaper("MTN MoMo · marchand", "6 70 11 22 33");
    await userEvent.click(boutonEnregistrer());

    expect(
      await screen.findByRole("dialog", { name: "Signer l’enregistrement" }),
    ).toHaveTextContent("1 changement · tracé dans le journal");
    expect(sms).toEqual([]);
    await saisirPin("123456");

    // Étape 1 : le SMS est parti vers l'ancien numéro, rien n'est encore changé.
    const feuilleCode = await screen.findByRole("dialog", { name: "Confirmer le compte MTN MoMo" });
    expect(feuilleCode).toHaveTextContent(
      "Code à 6 chiffres envoyé par SMS à l’ancien numéro, 6 77 •• •• 02",
    );
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({
      operateur: "mtn",
      nouveauNumero: "+237670112233",
      signature: { pin: "123456", methode: "pin" },
    });
    expect(changements).toEqual([]);
    // Aucune règle modifiée : pas d'écriture de règles.
    expect(regles).toEqual([]);

    // Étape 2 : le code reçu, puis un PIN pour le changement lui-même.
    await userEvent.type(screen.getByLabelText("Code reçu par SMS"), "482915");
    expect(
      await screen.findByRole("dialog", { name: "Signer le changement de compte" }),
    ).toHaveTextContent("MTN MoMo · tracé dans le journal");
    expect(changements).toEqual([]);
    await saisirPin("654321");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));

    expect(changements).toHaveLength(1);
    expect(changements[0]).toMatchObject({
      operateur: "mtn",
      nouveauNumero: "+237670112233",
      codeSms: "482915",
      signature: { pin: "654321", methode: "pin" },
    });
    expect(changements[0]!.signature.signeA).toMatch(SIGNEE);
  });

  it("le compte change vraiment pour les autres écrans ; l'autre compte ne bouge pas", async () => {
    const client = clientAvec((operations) => operations);
    rendre({ client });
    await attendreEcran();
    await retaper("Orange Money · marchand", "699887766");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await userEvent.type(await screen.findByLabelText("Code reçu par SMS"), "111222");
    await saisirPin("123456");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const relues = await client.executer(patron.OP_REGLES, undefined);
    expect(relues.comptesMomo.orange.numeroMasque).toBe("6 99 •• •• 66");
    expect(relues.comptesMomo.mtn.numeroMasque).toBe("6 77 •• •• 02");
  });

  it("un code SMS refusé redemande le code, sans compter d'essai de PIN ni changer le compte", async () => {
    const changements: contrats.ChangerCompteMomo[] = [];
    const { routeur } = rendre({
      modifier: espionner(patron.OP_CHANGER_COMPTE_MOMO.nom, changements),
    });
    await attendreEcran();
    await retaper("MTN MoMo · marchand", "670112233");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await userEvent.type(await screen.findByLabelText("Code reçu par SMS"), "000000");
    await saisirPin("123456");

    expect(
      await screen.findByText("Le code n’est pas bon. Vérifie le SMS et recommence."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Confirmer le compte MTN MoMo" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PIN incorrect/)).not.toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_REGLES);

    // Le bon code, un PIN neuf : le compte change.
    await userEvent.type(screen.getByLabelText("Code reçu par SMS"), "482915");
    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
    expect(changements.map((c) => c.codeSms)).toEqual(["000000", "482915"]);
  });

  it("un PIN refusé au changement de compte est dit et ne change rien", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await retaper("MTN MoMo · marchand", "670112233");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await userEvent.type(await screen.findByLabelText("Code reçu par SMS"), "482915");
    await saisirPin("000000");
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_REGLES);
  });

  it("une panne pendant le changement de compte est dite et on reste sur l'écran", async () => {
    const { routeur } = rendre({
      modifier: remplacer(patron.OP_CHANGER_COMPTE_MOMO.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    });
    await attendreEcran();
    await retaper("MTN MoMo · marchand", "670112233");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await userEvent.type(await screen.findByLabelText("Code reçu par SMS"), "482915");
    await saisirPin("123456");
    expect(await screen.findByText(/Le compte n’a pas été changé/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_REGLES);
  });

  it("règles et deux comptes d'un coup : un seul PIN pour les règles et les deux SMS, puis un code et un PIN par compte", async () => {
    const ordre: string[] = [];
    const sms: contrats.DemanderConfirmationCompteMomo[] = [];
    const regles: contrats.EnregistrerRegles[] = [];
    const changements: contrats.ChangerCompteMomo[] = [];
    const { routeur } = rendre({
      modifier: enchainer(
        espionner(patron.OP_ENREGISTRER_REGLES.nom, regles),
        espionner(patron.OP_CONFIRMER_COMPTE_MOMO.nom, sms),
        espionner(patron.OP_CHANGER_COMPTE_MOMO.nom, changements),
        remplacer(patron.OP_CHANGER_COMPTE_MOMO.nom, (impl) =>
          implementer(impl.operation, (params, ctx) => {
            ordre.push((params as contrats.ChangerCompteMomo).operateur);
            return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
          }),
        ),
      ),
    });
    await attendreEcran();
    await userEvent.selectOptions(liste("Au-delà"), "bloque_guichet");
    await retaper("MTN MoMo · marchand", "670112233");
    await retaper("Orange Money · marchand", "699887766");
    await userEvent.click(boutonEnregistrer());
    expect(await screen.findByRole("dialog")).toHaveTextContent("3 changements");
    await saisirPin("123456");

    await screen.findByRole("dialog", { name: "Confirmer le compte MTN MoMo" });
    expect(regles).toHaveLength(1);
    expect(regles[0]!.regles.caisse.auDela).toBe("bloque_guichet");
    expect(sms.map((s) => s.operateur)).toEqual(["mtn", "orange"]);

    await userEvent.type(screen.getByLabelText("Code reçu par SMS"), "111111");
    await saisirPin("123456");
    // Le premier compte est changé ; le second attend son propre code.
    const secondCode = await screen.findByRole("dialog", {
      name: "Confirmer le compte Orange Money",
    });
    expect(secondCode).toHaveTextContent("6 99 •• •• 77");
    expect(routeur.state.location.pathname).toBe(URL_REGLES);

    await userEvent.type(screen.getByLabelText("Code reçu par SMS"), "222222");
    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
    expect(ordre).toEqual(["mtn", "orange"]);
    expect(changements.map((c) => c.codeSms)).toEqual(["111111", "222222"]);
  });
});

describe("ConfigRegles · chargement, erreur", () => {
  it("chargement : blocs de la mise en page, en-tête et retour à leur place, pas d'enregistrement", async () => {
    rendre({
      modifier: remplacer(patron.OP_REGLES.nom, (impl) =>
        implementer(impl.operation, () => new Promise<never>(() => undefined)),
      ),
    });
    expect(
      await screen.findByRole("status", { name: "Chargement des règles" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Règles de l’agence");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/reglages");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
  });

  it("règles introuvables : message clair, retour possible", async () => {
    rendre({
      modifier: remplacer(patron.OP_REGLES.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurHttp(404, "Introuvable", "REGLES_INCONNUES");
        }),
      ),
    });
    expect(
      await screen.findByText("Les règles de l’agence ne sont pas disponibles."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis les règles s'affichent", async () => {
    let appels = 0;
    rendre({
      modifier: remplacer(patron.OP_REGLES.nom, (impl) =>
        implementer(impl.operation, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
        }),
      ),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les règles ne se sont pas chargées.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ConfigRegles · textes", () => {
  const cles = (objet: Record<string, unknown>, prefixe = ""): string[] =>
    Object.entries(objet).flatMap(([cle, valeur]) =>
      typeof valeur === "object" && valeur !== null
        ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
        : [`${prefixe}${cle}`],
    );

  it("l'anglais et le pidgin ont les mêmes clés que le français (textes à traduire, vides)", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });

  it("le français n'a aucune valeur vide", () => {
    const vides = cles(fr).filter((cle) => {
      const valeur = cle
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], fr);
      return String(valeur).trim() === "";
    });
    expect(vides).toEqual([]);
  });

  it("en anglais comme en pidgin, les clés vides se replient sur le français", () => {
    for (const langue of ["en", "pcm"] as const) {
      const i18n = creerI18n(langue);
      expect(i18n.t("actions.annuler", { ns: "ConfigRegles" })).toBe("Annuler");
      expect(i18n.t("entete.gares", { ns: "ConfigRegles", count: 3 })).toBe("3 GARES");
    }
  });
});
