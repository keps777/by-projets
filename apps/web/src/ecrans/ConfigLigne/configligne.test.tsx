import {
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
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const LIGNE = "ligne-alp-dlabaf";
const URL_LIGNE = `/reglages/ligne/${LIGNE}`;
const premierDepartId = (ecrans.ConfigLigne.donnees.departs.liste[0] as { _departId: string })
  ._departId;

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
  return creerClientMock({ source, scenario: "ConfigLigne", latenceMs: 0 });
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

function rendre(options: { url?: string; modifier?: Modifier } = {}) {
  return rendreApp({
    scenario: "ConfigLigne",
    url: options.url ?? URL_LIGNE,
    ...(options.modifier ? { clientApi: clientAvec(options.modifier) } : { fixtures: true }),
  });
}

async function attendreEcran() {
  return screen.findByRole("heading", { level: 1, name: "Douala → Bafoussam" });
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function champ(nom: string | RegExp): HTMLInputElement {
  return screen.getByRole("textbox", { name: nom });
}

/** L'interrupteur d'un départ ou d'une règle, par son nom accessible. */
function interrupteur(nom: string | RegExp): HTMLElement {
  return screen.getByRole("switch", { name: nom });
}

/** Le texte de la rangée du départ dont l'heure est dans ce champ. */
function rangee(heureChamp: HTMLInputElement): HTMLElement {
  return heureChamp.closest("[data-etat]") as HTMLElement;
}

async function saisirPin(pin: string) {
  const feuille = await screen.findByRole("dialog");
  for (const chiffre of pin) {
    await userEvent.click(within(feuille).getByRole("button", { name: chiffre }));
  }
}

/** La rangée d'un arrêt : le nom est en gras, le texte est donc coupé en plusieurs nœuds. */
function ligneArret(texte: string): HTMLElement {
  return screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === texte);
}

const boutonPublier = () => screen.getByRole("button", { name: /^Publier dès lundi/ });

describe("ConfigLigne · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : la ligne, ses compteurs, la pastille BROUILLON et le retour aux réglages", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText("Ligne · 5 départs · 2 arrêts · prix, sièges, règles"),
    ).toBeInTheDocument();
    expect(screen.getByText("BROUILLON")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toHaveAttribute(
      "href",
      "/reglages",
    );
  });

  it("affiche les cinq départs avec leur heure dans un champ, leur détail, leur prix et leur interrupteur", async () => {
    rendre();
    await attendreEcran();
    const attendus = [
      ["Heure du départ de 06:00", "06:00", "classique · LT 118 AB · 40 pl.", "normal"],
      ["Heure du départ de 08:15", "08:15", "classique · soute colis", "normal"],
      ["Heure du départ, modifiée", "09:15", "était 10:00 · proposé par l'assistant", "modifie"],
      ["Heure du départ de 13:00", "13:00", "classique", "normal"],
      ["Nouveau départ du mardi", "17:00", "nouveau · mardi seulement · marché", "nouveau"],
    ] as const;
    for (const [nom, heure, detail, etat] of attendus) {
      const saisie = champ(nom);
      expect(saisie).toHaveValue(heure);
      const ligne = rangee(saisie);
      expect(ligne).toHaveAttribute("data-etat", etat);
      expect(within(ligne).getByText(detail)).toBeInTheDocument();
      expect(within(ligne).getByText("3 500")).toBeInTheDocument();
      expect(within(ligne).getByRole("switch")).toBeChecked();
    }
  });

  it("affiche les tarifs, les arrêts avec leur prorata, le plan de sièges et les deux règles", async () => {
    rendre();
    await attendreEcran();
    expect(champ("Prix classique")).toHaveValue("3 500");
    expect(champ("Prix VIP")).toHaveValue("5 000");
    expect(champ("Prix du bagage")).toHaveValue("1 000");
    expect(ligneArret("Bafang · prorata 2 000 · montée OK")).toBeInTheDocument();
    expect(ligneArret("Mbouda · prorata 2 800 · montée OK")).toBeInTheDocument();
    expect(screen.getByText("40 places").tagName).toBe("STRONG");
    expect(screen.getByText(/^Plan de sièges ·/)).toHaveTextContent(
      "Plan de sièges · 40 places, 2+2, 11 rangées",
    );
    expect(interrupteur(/Vente en ligne · sièges visibles dans l'app voyageur/)).toBeChecked();
    expect(interrupteur(/Fusion automatique si deux départs sont sous 40 %/)).not.toBeChecked();
  });

  it("affiche le pied : Annuler et « Publier dès lundi » avec les 2 changements du brouillon", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/reglages");
    expect(boutonPublier()).toHaveTextContent(
      "Publier dès lundi2 changements · guichets et app à jour · tracé",
    );
  });

  it("le titre de l'écran vient du nom de la ligne, et chaque lien de la planche a sa destination", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute(
      "href",
      `/depart/${premierDepartId}`,
    );
  });

  it("les zones de saisie, boutons et interrupteurs sont atteignables au clavier et ont un nom", async () => {
    rendre();
    await attendreEcran();
    for (const interrupt of within(principal()).getAllByRole("switch")) {
      expect(interrupt).toHaveAccessibleName();
    }
    expect(within(principal()).getAllByRole("switch")).toHaveLength(7);
    for (const saisie of within(principal()).getAllByRole("textbox")) {
      expect(saisie).toHaveAccessibleName();
    }
    // Les icônes sont décoratives.
    expect(document.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
  });

  it("n'affiche aucun emoji ni bouton grisé", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(document.querySelectorAll("button:disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[oô]t/i);
  });
});

describe("ConfigLigne · modifier le brouillon (rien n'est publié)", () => {
  it("changer l'heure d'un départ le marque « était 13:00 » et ajoute un changement ; la remettre l'efface", async () => {
    rendre();
    await attendreEcran();
    const saisie = champ("Heure du départ de 13:00");
    await userEvent.clear(saisie);
    await userEvent.type(saisie, "14:30");
    const ligne = rangee(saisie);
    expect(ligne).toHaveAttribute("data-etat", "modifie");
    expect(within(ligne).getByText("était 13:00")).toBeInTheDocument();
    expect(boutonPublier()).toHaveTextContent("3 changements");

    await userEvent.clear(saisie);
    await userEvent.type(saisie, "13:00");
    expect(rangee(saisie)).toHaveAttribute("data-etat", "normal");
    expect(boutonPublier()).toHaveTextContent("2 changements");
  });

  it("une heure tapée « 9h40 » est écrite « 09:40 » en quittant le champ", async () => {
    rendre();
    await attendreEcran();
    const saisie = champ("Heure du départ de 06:00");
    await userEvent.clear(saisie);
    await userEvent.type(saisie, "9h40");
    await userEvent.tab();
    expect(saisie).toHaveValue("09:40");
  });

  it("« + départ » ajoute une ligne de plus sur place, sans quitter l'écran ni rien envoyer", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_LIGNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "+ départ" }));
    expect(
      screen.getByText("Ligne · 6 départs · 2 arrêts · prix, sièges, règles"),
    ).toBeInTheDocument();
    const nouveau = champ("Nouveau départ");
    expect(nouveau).toHaveValue("");
    expect(rangee(nouveau)).toHaveAttribute("data-etat", "nouveau");
    expect(within(rangee(nouveau)).getByText("nouveau")).toBeInTheDocument();
    expect(within(rangee(nouveau)).getByText("3 500")).toBeInTheDocument();
    expect(boutonPublier()).toHaveTextContent("3 changements");
    expect(routeur.state.location.pathname).toBe(URL_LIGNE);
    expect(ecritures).toEqual([]);
  });

  it("un interrupteur de départ le désactive et compte comme un changement", async () => {
    rendre();
    await attendreEcran();
    const bascule = interrupteur("Départ de 08:15 actif");
    await userEvent.click(bascule);
    expect(bascule).not.toBeChecked();
    expect(boutonPublier()).toHaveTextContent("3 changements");
    await userEvent.click(bascule);
    expect(bascule).toBeChecked();
    expect(boutonPublier()).toHaveTextContent("2 changements");
  });

  it("changer le tarif classique met à jour le prix des départs classiques, pas celui du VIP", async () => {
    rendre();
    await attendreEcran();
    const prix = champ("Prix classique");
    await userEvent.clear(prix);
    await userEvent.type(prix, "4000");
    expect(prix).toHaveValue("4 000");
    for (const nom of ["Heure du départ de 06:00", "Heure du départ de 13:00"]) {
      expect(within(rangee(champ(nom))).getByText("4 000")).toBeInTheDocument();
    }
    expect(champ("Prix VIP")).toHaveValue("5 000");
    expect(boutonPublier()).toHaveTextContent("3 changements");
  });

  it("les règles de la ligne se basculent et se comptent", async () => {
    rendre();
    await attendreEcran();
    const fusion = interrupteur(/Fusion automatique/);
    await userEvent.click(fusion);
    expect(fusion).toBeChecked();
    await userEvent.click(interrupteur(/Vente en ligne/));
    expect(interrupteur(/Vente en ligne/)).not.toBeChecked();
    expect(boutonPublier()).toHaveTextContent("4 changements");
  });

  it("« + arrêt » ouvre une feuille ; l'arrêt ajouté apparaît sur place, son prorata est calculé à la publication", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "+ arrêt" }));
    const feuille = await screen.findByRole("dialog", { name: "Ajouter un arrêt" });
    await userEvent.type(
      within(feuille).getByRole("textbox", { name: "Nom de l'arrêt" }),
      "Foumban",
    );
    await userEvent.click(within(feuille).getByRole("checkbox", { name: "Montée autorisée" }));
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter l'arrêt" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ligneArret("Foumban · prorata à la publication · sans montée")).toBeInTheDocument();
    expect(
      screen.getByText("Ligne · 5 départs · 3 arrêts · prix, sièges, règles"),
    ).toBeInTheDocument();
    expect(boutonPublier()).toHaveTextContent("3 changements");
    expect(routeur.state.location.pathname).toBe(URL_LIGNE);
  });

  it("refuse un arrêt sans nom ou déjà sur la ligne, la feuille reste ouverte", async () => {
    rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "+ arrêt" }));
    const feuille = await screen.findByRole("dialog");
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter l'arrêt" }));
    expect(within(feuille).getByRole("alert")).toHaveTextContent("Entre le nom de l'arrêt.");

    await userEvent.type(within(feuille).getByRole("textbox"), "bafang");
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter l'arrêt" }));
    expect(within(feuille).getByRole("alert")).toHaveTextContent(
      "Cet arrêt est déjà sur la ligne.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(boutonPublier()).toHaveTextContent("2 changements");
  });

  it("Annuler revient aux réglages sans rien écrire", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_LIGNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.click(interrupteur(/Fusion automatique/));
    await userEvent.click(screen.getByRole("link", { name: "Annuler" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
    expect(ecritures).toEqual([]);
  });
});

describe("ConfigLigne · publier avec le PIN", () => {
  it("envoie la ligne signée avec le jour d'effet, puis revient aux réglages", async () => {
    const ecritures: contrats.ModifierLigne[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_LIGNE.nom, ecritures) });
    await attendreEcran();

    await userEvent.click(interrupteur(/Fusion automatique/));
    const tarif = champ("Prix VIP");
    await userEvent.clear(tarif);
    await userEvent.type(tarif, "5500");
    await userEvent.click(boutonPublier());
    // Le PIN d'abord : rien n'est parti.
    expect(await screen.findByRole("dialog", { name: "Signer la publication" })).toHaveTextContent(
      "4 changements · tracé dans le journal",
    );
    expect(ecritures).toEqual([]);

    await saisirPin("123456");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));

    expect(ecritures).toHaveLength(1);
    const corps = ecritures[0]!;
    expect(corps).toMatchObject({
      ligneId: LIGNE,
      effetDu: "2027-01-11",
      tarifs: { classique: 3500, vip: 5500, bagage: 1000 },
      options: { venteEnLigne: true, fusionAuto: true },
      plan: { capacite: 40, disposition: "2+2", rangees: 11 },
      signature: { pin: "123456", methode: "pin" },
    });
    expect(corps.signature.signeA).toMatch(/^2027-01-05T07:3\d:\d\d(\.\d{3})?\+01:00$/);
    expect(corps.departs?.map((d) => [d.heure, d.heureInitiale, d.nouveau])).toEqual([
      ["06:00", null, false],
      ["08:15", null, false],
      ["09:15", "10:00", false],
      ["13:00", null, false],
      ["17:00", null, true],
    ]);
    expect(corps.arrets).toEqual([
      { nom: "Bafang", montee: true },
      { nom: "Mbouda", montee: true },
    ]);
  });

  it("la publication met la ligne à jour pour les autres écrans : la lecture suivante rend les nouveaux tarifs", async () => {
    const client = clientAvec((operations) => operations);
    rendreApp({ clientApi: client, scenario: "ConfigLigne", url: URL_LIGNE });
    await attendreEcran();
    const tarif = champ("Prix du bagage");
    await userEvent.clear(tarif);
    await userEvent.type(tarif, "1500");
    await userEvent.click(boutonPublier());
    await saisirPin("123456");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const relue = await client.executer(patron.OP_LIGNE_EDITABLE, { ligneId: LIGNE });
    expect(relue.tarifs.bagage).toBe(1500);
  });

  it("un PIN refusé est dit, compte un essai et ne publie pas", async () => {
    const ecritures: unknown[] = [];
    const { routeur } = rendre({ modifier: espionner(patron.OP_MODIFIER_LIGNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.click(boutonPublier());
    await saisirPin("000000");
    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_LIGNE);
    expect(screen.queryByText(/La publication n'a pas été enregistrée/)).not.toBeInTheDocument();
  });

  it("une panne à la publication est dite, rien n'est perdu et on reste sur l'écran", async () => {
    const { routeur } = rendre({
      modifier: remplacer(patron.OP_MODIFIER_LIGNE.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    });
    await attendreEcran();
    await userEvent.click(interrupteur(/Fusion automatique/));
    await userEvent.click(boutonPublier());
    await saisirPin("123456");
    expect(await screen.findByText(/La publication n'a pas été enregistrée/)).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe(URL_LIGNE);

    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(interrupteur(/Fusion automatique/)).toBeChecked();
    expect(boutonPublier()).toHaveTextContent("3 changements");
  });

  it("une heure impossible bloque la publication : champ marqué, message, pas de clavier PIN", async () => {
    rendre();
    await attendreEcran();
    const saisie = champ("Heure du départ de 06:00");
    await userEvent.clear(saisie);
    await userEvent.type(saisie, "25:70");
    await userEvent.click(boutonPublier());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Corrige les champs marqués avant de publier",
    );
    expect(saisie).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.clear(saisie);
    await userEvent.type(saisie, "06:10");
    await userEvent.click(boutonPublier());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un départ ajouté sans heure et un tarif vide bloquent aussi la publication", async () => {
    rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "+ départ" }));
    await userEvent.click(boutonPublier());
    expect(champ("Nouveau départ")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.type(champ("Nouveau départ"), "7h45");
    await userEvent.clear(champ("Prix VIP"));
    await userEvent.click(boutonPublier());
    expect(champ("Prix VIP")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("le départ ajouté est publié avec l'heure normalisée, nouveau et au prix de la ligne", async () => {
    const ecritures: contrats.ModifierLigne[] = [];
    rendre({ modifier: espionner(patron.OP_MODIFIER_LIGNE.nom, ecritures) });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "+ départ" }));
    await userEvent.type(champ("Nouveau départ"), "7h45");
    await userEvent.click(boutonPublier());
    await saisirPin("123456");
    await waitFor(() => expect(ecritures).toHaveLength(1));
    expect(ecritures[0]!.departs!.at(-1)).toEqual({
      id: null,
      heure: "07:45",
      heureInitiale: null,
      classe: "classique",
      prix: 3500,
      actif: true,
      note: null,
      jours: [],
      nouveau: true,
    });
  });
});

describe("ConfigLigne · états", () => {
  it("chargement : l'en-tête et le retour sont là, le corps pulse dans le style nuit", async () => {
    rendre({
      modifier: remplacer(patron.OP_LIGNE_EDITABLE.nom, (impl) =>
        implementer(impl.operation, () => new Promise<never>(() => {})),
      ),
    });
    expect(
      await screen.findByRole("status", { name: "Chargement de la ligne" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Configuration · modifier une ligne",
    );
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toHaveAttribute(
      "href",
      "/reglages",
    );
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: /Publier/ })).not.toBeInTheDocument();
  });

  it("ligne inconnue : message clair, retour possible", async () => {
    rendre({ url: "/reglages/ligne/ligne-inconnue" });
    expect(
      await screen.findByText("Cette ligne n'existe pas ou n'est plus ouverte."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis la ligne s'affiche", async () => {
    let appels = 0;
    rendre({
      modifier: remplacer(patron.OP_LIGNE_EDITABLE.nom, (impl) =>
        implementer(impl.operation, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
        }),
      ),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("La ligne ne s'est pas chargée.");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sans l'analyse de la ligne, la planche s'affiche sans le bus du premier départ", async () => {
    rendre({
      modifier: remplacer(patron.OP_ANALYSE_LIGNE.nom, (impl) =>
        implementer(impl.operation, () => {
          throw new ErreurReseau("coupure");
        }),
      ),
    });
    await attendreEcran();
    const detail = within(rangee(champ("Heure du départ de 06:00")));
    expect(detail.getByText("classique")).toBeInTheDocument();
    expect(screen.queryByText(/LT 118 AB/)).not.toBeInTheDocument();
  });

  it("une ligne sans arrêt ni départ s'affiche et se complète sur place", async () => {
    rendre({
      modifier: remplacer(patron.OP_LIGNE_EDITABLE.nom, (impl) =>
        implementer(impl.operation, async (params, ctx) => ({
          ...((await (impl.repondre as (p: unknown, c: unknown) => unknown)(
            params,
            ctx,
          )) as contrats.LigneEditable),
          departs: [],
          arrets: [],
          brouillon: { modifications: 0, publicationA: null },
        })),
      ),
    });
    await attendreEcran();
    expect(
      screen.getByText("Ligne · 0 départ · 0 arrêt · prix, sièges, règles"),
    ).toBeInTheDocument();
    expect(boutonPublier()).toHaveTextContent("0 changement · guichets et app à jour · tracé");
    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ départ" }));
    expect(champ("Nouveau départ")).toBeInTheDocument();
  });
});

describe("ConfigLigne · textes", () => {
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
      expect(i18n.t("departs.ajouter", { ns: "ConfigLigne" })).toBe("+ départ");
      expect(i18n.t("nbChangements", { ns: "ConfigLigne", count: 2 })).toBe("2 changements");
    }
  });
});
