import {
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

const PERSONNE = "pers-joseph";
const URL_PERSONNE = `/reglages/personne/${PERSONNE}`;
const URL_NOUVELLE = "/reglages/personne/nouvelle";

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
  return creerClientMock({ source, scenario: "ConfigPersonne", latenceMs: 0 });
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

function rendre(options: { url?: string; modifier?: Modifier } = {}) {
  return rendreApp({
    scenario: "ConfigPersonne",
    url: options.url ?? URL_PERSONNE,
    ...(options.modifier ? { clientApi: clientAvec(options.modifier) } : { fixtures: true }),
  });
}

async function attendreEcran() {
  return screen.findByRole("heading", { level: 1, name: "Joseph M." });
}

async function attendreCreation() {
  return screen.findByRole("heading", { level: 1, name: "Nouvelle personne" });
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

const champ = (nom: string | RegExp) => screen.getByRole("textbox", { name: nom });
/** Les listes de la fiche : le sélecteur de rôle de démonstration de la coquille a lui aussi un « Rôle ». */
const liste = (nom: string | RegExp) => within(principal()).getByRole("combobox", { name: nom });
const interrupteur = (nom: string | RegExp) => screen.getByRole("switch", { name: nom });
const boutonEnregistrer = () => screen.getByRole("button", { name: /^Enregistrer · mon PIN/ });
const boutonDesactiver = () => screen.getByRole("button", { name: /^Désactiver le compte/ });
const boutonPinProvisoire = () => screen.getByRole("button", { name: /^Nouveau PIN provisoire/ });

async function saisirPin(pin: string) {
  const feuille = await screen.findByRole("dialog");
  for (const chiffre of pin) {
    await userEvent.click(within(feuille).getByRole("button", { name: chiffre }));
  }
}

async function remplacerTexte(zone: HTMLElement, texte: string) {
  await userEvent.clear(zone);
  if (texte !== "") await userEvent.type(zone, texte);
}

describe("ConfigPersonne · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : la personne, son rôle, son lieu, son ancienneté, la pastille MODIFIER et le retour à l'équipe", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText("Guichetier · Akwa guichet 2 · depuis le 5 janv. 2027"),
    ).toBeInTheDocument();
    expect(screen.getByText("MODIFIER")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      "/reglages/equipe",
    );
  });

  it("affiche les sept champs de la planche avec leurs valeurs", async () => {
    rendre();
    await attendreEcran();
    expect(champ("Nom")).toHaveValue("Joseph Mbappé");
    expect(champ("Téléphone · reçoit le PIN")).toHaveValue("6 77 12 34 23");
    expect(liste("Opérateur")).toHaveDisplayValue("MTN");
    expect(liste("Rôle")).toHaveDisplayValue("Guichetier");
    expect(liste("Gare")).toHaveDisplayValue("Akwa · Douala");
    expect(liste("Guichet")).toHaveDisplayValue("Guichet 2");
    expect(champ("Salaire · payé le 30")).toHaveValue("95 000");
  });

  it("propose les choix de la planche : opérateurs, six rôles, trois gares, quatre guichets", async () => {
    rendre();
    await attendreEcran();
    const textes = (nom: string) =>
      within(liste(nom))
        .getAllByRole("option")
        .map((o) => o.textContent);
    expect(textes("Opérateur")).toEqual(["MTN", "Orange"]);
    expect(textes("Rôle")).toEqual([
      "Guichetier",
      "Superviseur",
      "Convoyeur",
      "Chauffeur",
      "Agent relais",
      "Comptable",
    ]);
    expect(textes("Gare")).toEqual(["—", "Akwa · Douala", "Mvan · Yaoundé", "Bafoussam"]);
    expect(textes("Guichet")).toEqual(["—", "Guichet 1", "Guichet 2", "Guichet 3", "Nuit"]);
  });

  it("affiche les quatre droits du rôle, « par défaut du rôle », deux actifs et deux non", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 2, name: "Ce qu’il peut faire" }),
    ).toBeInTheDocument();
    expect(screen.getByText("par défaut du rôle")).toBeInTheDocument();
    expect(interrupteur("Vendre billets et colis · cash et MoMo")).toBeChecked();
    expect(interrupteur("Annuler un billet sans PIN du superviseur")).not.toBeChecked();
    expect(interrupteur("Mode cadence (vente sans nom)")).toBeChecked();
    expect(interrupteur("Voir la caisse des autres guichets")).not.toBeChecked();
  });

  it("affiche le PIN provisoire, la fiche, la note, « Désactiver » et « Enregistrer · mon PIN »", async () => {
    rendre();
    await attendreEcran();
    expect(boutonPinProvisoire()).toHaveTextContent("Nouveau PIN provisoireSMS · valable 1 h");
    expect(
      screen.getByRole("link", { name: "Voir sa fiche · 90 jours billets, écarts, journal" }),
    ).toHaveAttribute("href", `/personnes/${PERSONNE}`);
    expect(
      screen.getByText(
        "Pour une nouvelle personne : même écran, champs vides. Elle reçoit par SMS son PIN provisoire et le lien de l'app ; son compte s'ouvre à sa première connexion.",
      ),
    ).toBeInTheDocument();
    expect(boutonDesactiver()).toHaveTextContent("Désactiver le compteimmédiat · tracé");
    expect(boutonEnregistrer()).toHaveTextContent(
      "Enregistrer · mon PINdaté, signé, visible au rapport du soir",
    );
  });

  it("les champs, listes, interrupteurs et boutons sont atteignables au clavier et ont un nom", async () => {
    rendre();
    await attendreEcran();
    for (const interrupt of within(principal()).getAllByRole("switch")) {
      expect(interrupt).toHaveAccessibleName();
      expect(interrupt).not.toBeDisabled();
    }
    for (const zone of [
      ...screen.getAllByRole("textbox"),
      ...screen.getAllByRole("combobox"),
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("link"),
    ]) {
      expect(zone).toHaveAccessibleName();
      expect(zone).not.toBeDisabled();
    }
  });
});

describe("ConfigPersonne · modifier une personne", () => {
  it("sans changement il n'y a rien à signer : « Enregistrer » revient à l'équipe, sans PIN ni écriture", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_PERSONNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.click(boutonEnregistrer());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages/equipe"));
    expect(ecritures).toEqual([]);
  });

  it("le PIN d'abord : rien n'est parti ; puis seuls les champs changés sont enregistrés, signés et datés", async () => {
    const ecritures: contrats.ModifierPersonne[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_PERSONNE.nom, ecritures) });
    await attendreEcran();
    await remplacerTexte(champ("Salaire · payé le 30"), "100000");
    expect(champ("Salaire · payé le 30")).toHaveValue("100 000");
    await userEvent.selectOptions(liste("Opérateur"), "Orange");
    await userEvent.click(boutonEnregistrer());

    expect(
      await screen.findByRole("dialog", { name: "Signer l'enregistrement" }),
    ).toHaveTextContent("Joseph M. · tracé dans le journal");
    expect(ecritures).toEqual([]);

    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages/equipe"));

    expect(ecritures).toHaveLength(1);
    const corps = ecritures[0]!;
    expect(corps).toMatchObject({
      personneId: PERSONNE,
      champs: { salaire: 100000, operateur: "Orange" },
      signature: { pin: "123456", methode: "pin" },
    });
    expect(Object.keys(corps.champs).sort()).toEqual(["operateur", "salaire"]);
    expect(corps.signature.signeA).toMatch(/^2027-01-05T07:3\d:\d\d(\.\d{3})?\+01:00$/);
  });

  it("l'enregistrement met la fiche à jour pour les autres écrans : la lecture suivante rend le nouveau salaire", async () => {
    const client = clientAvec((operations) => operations);
    rendreApp({ clientApi: client, scenario: "ConfigPersonne", url: URL_PERSONNE });
    await attendreEcran();
    await remplacerTexte(champ("Nom"), "Joseph Mbappé Ndi");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Signer l'enregistrement" }),
      ).not.toBeInTheDocument(),
    );

    const relue = await client.executer(patron.OP_PERSONNE_EDITABLE, { personneId: PERSONNE });
    expect(relue.nom).toBe("Joseph Mbappé Ndi");
  });

  it("un numéro tapé « 677123499 » est écrit « 6 77 12 34 99 » en quittant le champ et envoyé en +237", async () => {
    const ecritures: contrats.ModifierPersonne[] = [];
    rendre({ modifier: espionner(patron.OP_MODIFIER_PERSONNE.nom, ecritures) });
    await attendreEcran();
    await remplacerTexte(champ("Téléphone · reçoit le PIN"), "677123499");
    await userEvent.tab();
    expect(champ("Téléphone · reçoit le PIN")).toHaveValue("6 77 12 34 99");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await waitFor(() => expect(ecritures).toHaveLength(1));
    expect(ecritures[0]!.champs).toEqual({ telephone: "+237677123499" });
  });

  it("un PIN refusé est dit, compte un essai et n'enregistre rien", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_PERSONNE.nom, ecritures) });
    await attendreEcran();
    await remplacerTexte(champ("Nom"), "Joseph M. Ndi");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("000000");
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_PERSONNE);
    expect(screen.queryByText(/L'action n'a pas été enregistrée/)).not.toBeInTheDocument();
  });

  it("une panne à l'enregistrement est dite, rien n'est perdu et on reste sur la fiche", async () => {
    const { routeur } = rendre({
      modifier: remplacer(patron.OP_MODIFIER_PERSONNE.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    });
    await attendreEcran();
    await remplacerTexte(champ("Nom"), "Joseph Mbappé Ndi");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    expect(await screen.findByText(/L'action n'a pas été enregistrée/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_PERSONNE);

    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(champ("Nom")).toHaveValue("Joseph Mbappé Ndi");
  });

  it("un champ obligatoire vidé bloque l'enregistrement : message sous le champ, champ marqué, pas de clavier PIN", async () => {
    rendre();
    await attendreEcran();
    await remplacerTexte(champ("Nom"), "");
    await remplacerTexte(champ("Salaire · payé le 30"), "");
    await remplacerTexte(champ("Téléphone · reçoit le PIN"), "12 34");
    await userEvent.click(boutonEnregistrer());
    expect(screen.getByText("Entre le nom.")).toBeInTheDocument();
    expect(screen.getByText("Entre un numéro à 9 chiffres.")).toBeInTheDocument();
    expect(screen.getByText("Entre le salaire.")).toBeInTheDocument();
    expect(champ("Nom")).toHaveAttribute("aria-invalid", "true");
    expect(champ("Téléphone · reçoit le PIN")).toHaveAttribute("aria-invalid", "true");
    expect(champ("Salaire · payé le 30")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.type(champ("Nom"), "Joseph");
    await userEvent.type(champ("Salaire · payé le 30"), "95000");
    await remplacerTexte(champ("Téléphone · reçoit le PIN"), "677123423");
    await userEvent.click(boutonEnregistrer());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Entre le nom.")).not.toBeInTheDocument();
  });
});

describe("ConfigPersonne · les droits suivent le rôle, une exception est tracée", () => {
  it("changer le rôle remet les droits par défaut de ce rôle et retire le guichet quand il n'y en a plus", async () => {
    rendre();
    await attendreEcran();
    await userEvent.selectOptions(liste("Rôle"), "superviseur");
    expect(interrupteur("Vendre billets et colis · cash et MoMo")).toBeChecked();
    expect(interrupteur("Annuler un billet sans PIN du superviseur")).toBeChecked();
    expect(interrupteur("Mode cadence (vente sans nom)")).toBeChecked();
    expect(interrupteur("Voir la caisse des autres guichets")).toBeChecked();
    expect(screen.getByText("par défaut du rôle")).toBeInTheDocument();
    expect(
      within(principal()).queryByRole("combobox", { name: "Guichet" }),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(liste("Rôle"), "chauffeur");
    for (const droit of within(principal()).getAllByRole("switch")) {
      expect(droit).not.toBeChecked();
    }
    await userEvent.selectOptions(liste("Rôle"), "guichetier");
    expect(liste("Guichet")).toHaveDisplayValue("—");
    expect(interrupteur("Mode cadence (vente sans nom)")).toBeChecked();
  });

  it("un droit basculé est une exception : l'aide la compte, la remettre dans l'état du rôle l'efface", async () => {
    rendre();
    await attendreEcran();
    await userEvent.click(interrupteur("Annuler un billet sans PIN du superviseur"));
    expect(interrupteur("Annuler un billet sans PIN du superviseur")).toBeChecked();
    expect(screen.getByText("1 exception · tracée")).toBeInTheDocument();
    expect(screen.queryByText("par défaut du rôle")).not.toBeInTheDocument();

    await userEvent.click(interrupteur("Voir la caisse des autres guichets"));
    expect(screen.getByText("2 exceptions · tracées")).toBeInTheDocument();

    await userEvent.click(interrupteur("Annuler un billet sans PIN du superviseur"));
    await userEvent.click(interrupteur("Voir la caisse des autres guichets"));
    expect(screen.getByText("par défaut du rôle")).toBeInTheDocument();
  });

  it("l'exception part avec la fiche, signée par le PIN : c'est ce qui la trace au journal", async () => {
    const ecritures: contrats.ModifierPersonne[] = [];
    rendre({ modifier: espionner(patron.OP_MODIFIER_PERSONNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.click(interrupteur("Annuler un billet sans PIN du superviseur"));
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await waitFor(() => expect(ecritures).toHaveLength(1));
    expect(ecritures[0]).toMatchObject({
      personneId: PERSONNE,
      champs: {
        droits: {
          vendreBilletsEtColis: true,
          annulerSansPinSuperviseur: true,
          modeCadence: true,
          voirCaissesDesAutres: false,
        },
      },
      signature: { pin: "123456" },
    });
  });

  it("un nouveau rôle part avec ses droits par défaut et sans guichet", async () => {
    const ecritures: contrats.ModifierPersonne[] = [];
    rendre({ modifier: espionner(patron.OP_MODIFIER_PERSONNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.selectOptions(liste("Rôle"), "superviseur");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await waitFor(() => expect(ecritures).toHaveLength(1));
    expect(ecritures[0]!.champs).toEqual({
      role: "superviseur",
      guichet: null,
      droits: {
        vendreBilletsEtColis: true,
        annulerSansPinSuperviseur: true,
        modeCadence: true,
        voirCaissesDesAutres: true,
      },
    });
  });
});

describe("ConfigPersonne · PIN provisoire, fiche, désactivation", () => {
  it("« Nouveau PIN provisoire » demande le PIN, envoie le SMS à cette personne puis ouvre l'équipe du superviseur", async () => {
    const envois: contrats.NouveauPinProvisoire[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_PIN_PROVISOIRE.nom, envois) });
    await attendreEcran();
    await userEvent.click(boutonPinProvisoire());
    expect(
      await screen.findByRole("dialog", { name: "Signer l'envoi du PIN provisoire" }),
    ).toBeInTheDocument();
    expect(envois).toEqual([]);
    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/equipe"));
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({ personneId: PERSONNE, signature: { pin: "123456" } });
  });

  it("« Désactiver le compte » demande le PIN, désactive cette personne puis revient à l'équipe", async () => {
    const desactivations: contrats.DesactiverPersonne[] = [];
    const { routeur } = rendre({
      modifier: espionner(patron.OP_DESACTIVER_PERSONNE.nom, desactivations),
    });
    await attendreEcran();
    await userEvent.click(boutonDesactiver());
    expect(
      await screen.findByRole("dialog", { name: "Signer la désactivation" }),
    ).toBeInTheDocument();
    expect(desactivations).toEqual([]);
    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages/equipe"));
    expect(desactivations).toHaveLength(1);
    expect(desactivations[0]).toMatchObject({ personneId: PERSONNE, signature: { pin: "123456" } });
  });

  it("un PIN refusé est dit et ne quitte pas la fiche : l'API refuse la désactivation signée de ce PIN", async () => {
    const desactivations: contrats.DesactiverPersonne[] = [];
    const { routeur } = rendre({
      modifier: espionner(patron.OP_DESACTIVER_PERSONNE.nom, desactivations),
    });
    await attendreEcran();
    await userEvent.click(boutonDesactiver());
    await saisirPin("000000");
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_PERSONNE);
    expect(screen.getByRole("dialog", { name: "Signer la désactivation" })).toBeInTheDocument();
    expect(desactivations.map((d) => d.signature.pin)).toEqual(["000000"]);
  });

  it("un compte déjà désactivé n'offre plus « Désactiver » : l'enregistrement prend toute la ligne", async () => {
    rendre({
      modifier: remplacer(patron.OP_PERSONNE_EDITABLE.nom, (impl) =>
        implementer(impl.operation, async (params, ctx) => ({
          ...((await (impl.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as contrats.PersonneEditable),
          actif: false,
        })),
      ),
    });
    await attendreEcran();
    expect(screen.queryByRole("button", { name: /Désactiver/ })).not.toBeInTheDocument();
    expect(boutonEnregistrer()).toBeInTheDocument();
  });
});

describe("ConfigPersonne · ajouter une personne (/reglages/personne/nouvelle)", () => {
  it("même écran, champs vides, sans PIN provisoire, fiche ni désactivation, et sans lire de fiche", async () => {
    const lectures: unknown[] = [];
    rendre({
      url: URL_NOUVELLE,
      modifier: espionner(patron.OP_PERSONNE_EDITABLE.nom, lectures),
    });
    await attendreCreation();
    expect(screen.getByText("NOUVEAU")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      "/reglages/equipe",
    );
    expect(champ("Nom")).toHaveValue("");
    expect(champ("Téléphone · reçoit le PIN")).toHaveValue("");
    expect(champ("Salaire · payé le 30")).toHaveValue("");
    expect(liste("Opérateur")).toHaveDisplayValue("MTN");
    expect(liste("Rôle")).toHaveDisplayValue("Guichetier");
    expect(liste("Gare")).toHaveDisplayValue("—");
    expect(liste("Guichet")).toHaveDisplayValue("—");
    expect(interrupteur("Vendre billets et colis · cash et MoMo")).toBeChecked();
    expect(screen.getByText("par défaut du rôle")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Nouveau PIN provisoire/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Voir sa fiche/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Désactiver/ })).not.toBeInTheDocument();
    expect(boutonEnregistrer()).toBeInTheDocument();
    expect(lectures).toEqual([]);
  });

  it("des champs vides bloquent l'enregistrement : nom, numéro, gare, guichet et salaire sont marqués", async () => {
    rendre({ url: URL_NOUVELLE });
    await attendreCreation();
    await userEvent.click(boutonEnregistrer());
    for (const message of [
      "Entre le nom.",
      "Entre un numéro à 9 chiffres.",
      "Choisis la gare.",
      "Choisis le guichet.",
      "Entre le salaire.",
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(liste("Gare")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("une fois remplie, la fiche est créée avec le PIN du patron, le numéro en +237 et les droits du rôle", async () => {
    const creations: contrats.CreerPersonne[] = [];
    const client = clientAvec(espionner(patron.OP_CREER_PERSONNE.nom, creations));
    const { routeur } = rendreApp({
      clientApi: client,
      scenario: "ConfigPersonne",
      url: URL_NOUVELLE,
    });
    await attendreCreation();
    await userEvent.type(champ("Nom"), "  Aïcha Ngo ");
    await userEvent.type(champ("Téléphone · reçoit le PIN"), "6 91 22 10 08");
    await userEvent.selectOptions(liste("Opérateur"), "Orange");
    await userEvent.selectOptions(liste("Gare"), "Mvan · Yaoundé");
    await userEvent.selectOptions(liste("Guichet"), "Nuit");
    await userEvent.type(champ("Salaire · payé le 30"), "80000");
    await userEvent.click(boutonEnregistrer());
    expect(
      await screen.findByRole("dialog", { name: "Signer l'enregistrement" }),
    ).toHaveTextContent("Nouvelle personne · tracé dans le journal");
    expect(creations).toEqual([]);
    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages/equipe"));

    expect(creations).toHaveLength(1);
    const corps = creations[0]!;
    expect(corps.champs).toEqual({
      nom: "Aïcha Ngo",
      telephone: "+237691221008",
      operateur: "Orange",
      role: "guichetier",
      gareId: expect.stringMatching(/^gare-/) as string,
      guichet: "nuit",
      salaire: 80000,
      droits: {
        vendreBilletsEtColis: true,
        annulerSansPinSuperviseur: false,
        modeCadence: true,
        voirCaissesDesAutres: false,
      },
    });
    expect(corps.signature).toMatchObject({ pin: "123456", methode: "pin" });

    // L'API a reçu un compte actif, et envoie le PIN provisoire par SMS (création uniquement).
    const creee = await client.executer(patron.OP_PERSONNE_EDITABLE, {
      personneId: "pers-nouvelle-1",
    });
    expect(creee).toMatchObject({ nom: "Aïcha Ngo", actif: true, guichet: "nuit" });
  });

  it("un rôle sans guichet se crée sans guichet, et sa gare est facultative sauf pour un superviseur", async () => {
    const creations: contrats.CreerPersonne[] = [];
    rendre({
      url: URL_NOUVELLE,
      modifier: espionner(patron.OP_CREER_PERSONNE.nom, creations),
    });
    await attendreCreation();
    await userEvent.type(champ("Nom"), "Paul K.");
    await userEvent.type(champ("Téléphone · reçoit le PIN"), "677000040");
    await userEvent.type(champ("Salaire · payé le 30"), "70000");
    await userEvent.selectOptions(liste("Rôle"), "superviseur");
    expect(
      within(principal()).queryByRole("combobox", { name: "Guichet" }),
    ).not.toBeInTheDocument();
    await userEvent.click(boutonEnregistrer());
    expect(screen.getByText("Choisis la gare.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.selectOptions(liste("Rôle"), "chauffeur");
    await userEvent.click(boutonEnregistrer());
    await saisirPin("123456");
    await waitFor(() => expect(creations).toHaveLength(1));
    expect(creations[0]!.champs).toMatchObject({
      role: "chauffeur",
      gareId: null,
      guichet: null,
    });
  });
});

describe("ConfigPersonne · états", () => {
  it("chargement : l'en-tête et le retour sont là, le corps pulse dans le style nuit", async () => {
    rendre({
      modifier: remplacer(patron.OP_PERSONNE_EDITABLE.nom, (impl) =>
        implementer(impl.operation, () => new Promise<never>(() => {})),
      ),
    });
    expect(
      await screen.findByRole("status", { name: "Chargement de la fiche" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Réglages · modifier ou ajouter une personne",
    );
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      "/reglages/equipe",
    );
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
  });

  it("personne inconnue : message clair, retour possible, rien à enregistrer", async () => {
    rendre({ url: "/reglages/personne/pers-inconnue" });
    expect(
      await screen.findByText("Cette personne n'existe pas ou n'est plus dans l'équipe."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis la fiche s'affiche", async () => {
    let appels = 0;
    rendre({
      modifier: remplacer(patron.OP_PERSONNE_EDITABLE.nom, (impl) =>
        implementer(impl.operation, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
        }),
      ),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("La fiche ne s'est pas chargée.");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["une modification", URL_PERSONNE],
    ["une création", URL_NOUVELLE],
  ])(
    "sans la liste des gares, la fiche ne s'affiche pas à moitié (%s) : erreur, puis Réessayer",
    async (_nom, url) => {
      let appels = 0;
      rendre({
        url,
        modifier: remplacer(patron.OP_GARES.nom, (impl) =>
          implementer(impl.operation, (params, ctx) => {
            appels += 1;
            if (appels === 1) throw new ErreurReseau("coupure");
            return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
          }),
        ),
      });
      expect(await screen.findByRole("alert")).toHaveTextContent("La fiche ne s'est pas chargée.");
      expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
      expect(
        await screen.findByRole("button", { name: /^Enregistrer · mon PIN/ }),
      ).toBeInTheDocument();
    },
  );
});

describe("ConfigPersonne · textes", () => {
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
      expect(i18n.t("actions.enregistrer.libelle", { ns: "ConfigPersonne" })).toBe(
        "Enregistrer · mon PIN",
      );
      expect(i18n.t("droits.exceptions", { ns: "ConfigPersonne", count: 2 })).toBe(
        "2 exceptions · tracées",
      );
    }
  });
});
