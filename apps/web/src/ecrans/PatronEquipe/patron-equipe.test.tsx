import {
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import {
  ALAIN_B,
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  ALPHA_MVAN,
  D_TCHINDA,
  ESSONO,
  JOSEPH_M,
  K_FOTSO,
  MARIE_T,
  M_NANA,
  O_ESSOMBA,
  PAULINE_N,
  R_MBALLA,
  ecrans,
} from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";
import {
  ecart,
  heureDouala,
  montant,
  tonAvatar,
  tonEtatPersonne,
  tonGare,
  tonIndicateur,
  villeAffichee,
} from "./formats";
import fr from "./i18n.fr.json";
import type { Gare, Personne, VueGares } from "./types";

const planche = ecrans.PatronEquipe.donnees;

function rendre(options: { clientApi?: ReturnType<typeof creerClientMock>; url?: string } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "PatronEquipe",
    url: options.url ?? "/gares",
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Akwa · Mme Essono");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function pied(): HTMLElement {
  return principal().nextElementSibling as HTMLElement;
}

/** Le lien de la zone principale dont le texte commence par celui-ci. */
function lien(texte: string): HTMLElement {
  const trouve = within(principal())
    .getAllByRole("link")
    .find((a) => (a.textContent ?? "").startsWith(texte));
  if (!trouve) throw new Error(`Pas de lien « ${texte} »`);
  return trouve;
}

/** Les lignes de la liste des gens (la région qui défile). */
function lignesGens(): HTMLElement[] {
  const liste = screen.getByRole("region", { name: /Mes gens · \d+ \(liste qui défile\)/ });
  return within(liste).getAllByRole("link");
}

function lignesGares(): HTMLElement[] {
  const carte = screen.getByRole("region", { name: "Mes gares · aujourd’hui" });
  return within(carte).getAllByRole("link");
}

type Impl = Scenario["operations"][number];
function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "PatronEquipe", latenceMs: 0 });
}

function remplacerGares(fabrique: (impl: Impl) => Impl): ReturnType<typeof creerClientMock> {
  return clientAvec((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === patron.OP_GARES.nom ? fabrique(impl) : impl,
    ),
  }));
}

/** Le client du mock, dont la lecture « Mes gares, mes gens » est retouchée avant d'être rendue. */
function clientAvecVue(modifier: (vue: VueGares) => VueGares) {
  return remplacerGares((impl) =>
    implementer(patron.OP_GARES, async (params, ctx) => {
      const vue = (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
        params,
        ctx,
      )) as VueGares;
      return modifier(vue);
    }),
  );
}

describe("PatronEquipe · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, retour, compte, heure et personnes en service", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mes gares, mes gens");
    expect(screen.getByText(planche.detail)).toBeInTheDocument();
    expect(screen.getByText("3 gares · 23 personnes · 14 bus · 14:02")).toBeInTheDocument();
    expect(screen.getByText("19 EN SERVICE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("n'a pas de barre d'onglets : la planche n'en montre pas", async () => {
    rendre();
    await attendreEcran();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("affiche les trois gares comme la planche : nom, composition, caisse et état de synchronisation", async () => {
    rendre();
    await attendreEcran();
    const lignes = lignesGares();
    expect(lignes).toHaveLength(3);
    planche.gares.liste.forEach((attendue, i) => {
      const ligne = lignes[i]!;
      expect(ligne).toHaveTextContent(attendue.nom);
      expect(ligne).toHaveTextContent(attendue.detail);
      expect(ligne).toHaveTextContent(montant(attendue.caisse));
      expect(ligne).toHaveTextContent(attendue.etat);
    });
    expect(lignes[0]).toHaveTextContent("1 412 000");
    expect(lignes[0]).toHaveTextContent("3 / 3 sync · écart − 1 000");
    expect(lignes[1]).toHaveTextContent("Mvan · Yaoundé · O. Essomba");
    expect(lignes[2]).toHaveTextContent("1 guichet · 1 quai");
    expect(lignes[2]).toHaveTextContent("hors ligne 40 min");
  });

  it("colore l'état des gares : écart en ambre, tout synchronisé en vert, hors ligne en rouge", async () => {
    rendre();
    await attendreEcran();
    const tons = lignesGares().map((l) => l.querySelector("[data-ton]")?.getAttribute("data-ton"));
    expect(tons).toEqual(["ambre", "vert", "rouge"]);
  });

  it("affiche les en-têtes des deux cartes et leurs mentions", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Mes gares · aujourd’hui")).toBeInTheDocument();
    expect(screen.getByText("touche une gare")).toBeInTheDocument();
    expect(screen.getByText("Mes gens · 23")).toBeInTheDocument();
    expect(screen.getByText("touche un nom · glisser")).toBeInTheDocument();
  });

  it("affiche les effectifs par rôle : guichets, superviseurs, convoyeurs, chauffeurs", async () => {
    rendre();
    await attendreEcran();
    const effectifs = Array.from(document.querySelectorAll("main ul > li[class*='effectif']"));
    expect(effectifs.map((e) => e.textContent)).toEqual(
      planche.effectifs.map((e) => `${e.libelle}${e.nombre}${e.detail}`),
    );
    expect(effectifs).toHaveLength(4);
    expect(effectifs[2]).toHaveTextContent("Convoy.75 à bord");
    expect(effectifs[3]).toHaveTextContent("Chauff.43 en route");
  });

  it("affiche les dix personnes avec rôle, synthèse et état, accordés comme la planche", async () => {
    rendre();
    await attendreEcran();
    const lignes = lignesGens();
    expect(lignes).toHaveLength(10);
    planche.gens.personnes.forEach((attendue, i) => {
      const ligne = lignes[i]!;
      expect(ligne).toHaveTextContent(attendue.initiales);
      expect(ligne).toHaveTextContent(`${attendue.nom} · ${attendue.role}`);
      expect(ligne).toHaveTextContent(attendue.detail);
      expect(ligne).toHaveTextContent(new RegExp(`${attendue.etat}$`));
    });
    // Le féminin vient du prénom ou de la civilité : le contrat n'a pas de genre.
    expect(lignes[1]).toHaveTextContent("guichetière");
    expect(lignes[2]).toHaveTextContent("superviseure");
    expect(lignes[4]).toHaveTextContent(/bloquée$/);
    expect(lignes[0]).toHaveTextContent("guichetier ·");
    expect(lignes[7]).toHaveTextContent("superviseur · Mvan");
  });

  it("colore la synthèse et l'état de chaque personne : ambre à voir, rouge bloquée, gris au repos", async () => {
    rendre();
    await attendreEcran();
    const lignes = lignesGens();
    const tonIndic = (i: number) =>
      lignes[i]!.querySelector("[class*='indicateur']")?.getAttribute("data-ton");
    const tonEtat = (i: number) =>
      lignes[i]!.querySelector("[class*='etatPersonne']")?.getAttribute("data-ton");
    // Joseph M. (3 écarts, PIN), Pauline N. (bloquée), M. Nana (2 pannes), R. Mballa (indisponible)
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(tonIndic)).toEqual([
      "ambre",
      "neutre",
      "neutre",
      "neutre",
      "rouge",
      "ambre",
      "neutre",
      "neutre",
      "neutre",
      "ambre",
    ]);
    expect([0, 3, 4, 5, 6, 9].map(tonEtat)).toEqual([
      "vert",
      "vert",
      "rouge",
      "gris",
      "vert",
      "gris",
    ]);
  });

  it("affiche les trois repères et leur couleur", async () => {
    rendre();
    await attendreEcran();
    const reperes = Array.from(document.querySelectorAll("main li[class*='repere']"));
    expect(reperes.map((r) => r.textContent)).toEqual(
      planche.repere.map((r) => `${r.libelle}${r.valeur}`),
    );
    expect(reperes.map((r) => r.getAttribute("data-ton"))).toEqual(["vert", "ambre", "neutre"]);
  });

  it("affiche le pied : « + personne · + gare » et le paiement des 23 salaires", async () => {
    rendre();
    await attendreEcran();
    expect(within(pied()).getByRole("link", { name: "+ personne · + gare" })).toBeInTheDocument();
    const payer = within(pied()).getByRole("link", { name: /Payer les 23 salaires/ });
    expect(payer).toHaveTextContent("Payer les 23 salairesle 30 · par MoMo · 1 touche");
    expect(payer.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt », et dessine des icônes SVG", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const svg of Array.from(document.querySelectorAll("svg"))) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("garde des cibles tactiles d'au moins 44 px : retour, gares, personnes, pied", async () => {
    rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(parseFloat(getComputedStyle(retour).width)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(getComputedStyle(retour).height)).toBeGreaterThanOrEqual(44);
    const cibles = [...lignesGares(), ...lignesGens(), ...within(pied()).getAllByRole("link")];
    expect(cibles).toHaveLength(3 + 10 + 2);
    for (const a of cibles) {
      expect(parseFloat(getComputedStyle(a).minHeight), a.textContent ?? "").toBeGreaterThanOrEqual(
        44,
      );
    }
  });
});

describe("PatronEquipe · navigation identique à la maquette", () => {
  const gares = [
    [0, ALPHA_AKWA.id],
    [1, ALPHA_MVAN.id],
    [2, ALPHA_BAFOUSSAM.id],
  ] as const;

  it.each(gares)("la gare n° %i ouvre la gare %s", async (rang, gareId) => {
    const { routeur } = rendre();
    await attendreEcran();
    const ligne = lignesGares()[rang]!;
    expect(ligne).toHaveAttribute("href", `/gares/${gareId}`);
    await userEvent.click(ligne);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(`/gares/${gareId}`));
  });

  const personnes = [
    JOSEPH_M,
    MARIE_T,
    ESSONO,
    ALAIN_B,
    PAULINE_N,
    M_NANA,
    K_FOTSO,
    O_ESSOMBA,
    D_TCHINDA,
    R_MBALLA,
  ];

  it.each(personnes.map((p, i) => [i, p.id] as const))(
    "la personne n° %i ouvre la fiche %s",
    async (rang, personneId) => {
      const { routeur } = rendre();
      await attendreEcran();
      const ligne = lignesGens()[rang]!;
      expect(ligne).toHaveAttribute("href", `/personnes/${personneId}`);
      await userEvent.click(ligne);
      await waitFor(() => expect(routeur.state.location.pathname).toBe(`/personnes/${personneId}`));
    },
  );

  it("« Retour » mène au Patron", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/aujourdhui");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
  });

  it("« + personne · + gare » mène aux réglages", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const ajouter = within(pied()).getByRole("link", { name: "+ personne · + gare" });
    expect(ajouter).toHaveAttribute("href", "/reglages");
    await userEvent.click(ajouter);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
  });

  it("« Payer les 23 salaires » mène au financement", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const payer = within(pied()).getByRole("link", { name: /Payer les 23 salaires/ });
    expect(payer).toHaveAttribute("href", "/financement");
    await userEvent.click(payer);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/financement"));
  });

  it("n'écrit rien : aucun bouton dans la zone principale, que des liens", async () => {
    rendre();
    await attendreEcran();
    expect(within(principal()).queryByRole("button")).not.toBeInTheDocument();
    for (const a of within(principal()).getAllByRole("link")) {
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^\/[a-z]/);
    }
  });
});

describe("PatronEquipe · les données de l'API font l'écran", () => {
  it("écrit les chiffres de l'API : caisse, écart positif, synchronisation partielle en ambre", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        gares: vue.gares.map((g, i) =>
          i === 1
            ? {
                ...g,
                caisse: 1_250_000,
                ecartTotal: 500,
                synchro: { guichetsSynchronises: 1, guichets: 2 },
              }
            : g,
        ),
      })),
    });
    await attendreEcran();
    const mvan = lignesGares()[1]!;
    expect(mvan).toHaveTextContent("1 250 000");
    expect(mvan).toHaveTextContent("1 / 2 sync · écart + 500");
    expect(mvan.querySelector("[data-ton]")).toHaveAttribute("data-ton", "ambre");
  });

  it("une gare sans écart connu écrit seulement sa synchronisation", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        gares: vue.gares.map((g, i) => (i === 1 ? { ...g, ecartTotal: null } : g)),
      })),
    });
    await attendreEcran();
    const mvan = lignesGares()[1]!;
    expect(mvan).toHaveTextContent("2 / 2 sync");
    expect(mvan).not.toHaveTextContent("écart");
  });

  it("accorde les pluriels : une gare, un guichet, une personne, un salaire", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        nbPersonnes: 1,
        gares: [{ ...vue.gares[0]!, nbGuichets: 1, nbQuais: 1 }],
        paie: { ...vue.paie, nbSalaires: 1 },
      })),
    });
    await attendreEcran();
    expect(screen.getByText("1 gare · 1 personne · 14 bus · 14:02")).toBeInTheDocument();
    expect(lignesGares()[0]).toHaveTextContent("1 guichet · 1 quai");
    expect(screen.getByText("Mes gens · 1")).toBeInTheDocument();
    expect(within(pied()).getByRole("link", { name: /Payer le salaire/ })).toBeInTheDocument();
  });

  it("le badge, le jour de paie et les effectifs suivent l'API", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        enService: 7,
        paie: { ...vue.paie, jourDuMois: 28 },
        effectifs: [
          ...vue.effectifs,
          { role: "relais" as const, nombre: 2, enService: 1 },
          { role: "comptable" as const, nombre: 1, enService: 1 },
        ],
      })),
    });
    await attendreEcran();
    expect(screen.getByText("7 EN SERVICE")).toBeInTheDocument();
    expect(within(pied()).getByText("le 28 · par MoMo · 1 touche")).toBeInTheDocument();
    expect(screen.getByText("Relais")).toBeInTheDocument();
    expect(screen.getByText("Compta.")).toBeInTheDocument();
  });

  it("un état hors service s'écrit en gris", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        personnes: vue.personnes.map((p, i) =>
          i === 3 ? { ...p, etat: "hors_service" as const } : p,
        ),
      })),
    });
    await attendreEcran();
    const ligne = lignesGens()[3]!;
    expect(ligne).toHaveTextContent(/hors service$/);
    expect(ligne.querySelector("[class*='etatPersonne']")).toHaveAttribute("data-ton", "gris");
  });

  it("la liste des gens montre ce que l'API envoie, dans son ordre", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        personnes: vue.personnes.slice(0, 3).reverse(),
      })),
    });
    await attendreEcran();
    expect(lignesGens().map((l) => l.textContent)).toEqual([
      expect.stringContaining("Mme Essono"),
      expect.stringContaining("Marie T."),
      expect.stringContaining("Joseph M."),
    ]);
  });
});

describe("PatronEquipe · chargement, vide, erreur", () => {
  it("chargement : des repères qui pulsent à la taille des éléments, retour et ajout utilisables", async () => {
    const client = remplacerGares(() =>
      implementer(patron.OP_GARES, () => new Promise<never>(() => {})),
    );
    rendre({ clientApi: client });
    const corps = await screen.findByRole("main", { name: "Chargement de l’équipe" });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(corps.querySelectorAll("[class*='squelette'].am-pulse").length).toBeGreaterThan(5);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mes gares, mes gens");
    expect(screen.getByText("Mes gens")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    expect(within(pied()).getByRole("link", { name: "+ personne · + gare" })).toHaveAttribute(
      "href",
      "/reglages",
    );
    expect(within(pied()).queryByText(/Payer/)).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer qui relit, puis l'écran complet", async () => {
    let appels = 0;
    const client = remplacerGares((impl) =>
      implementer(patron.OP_GARES, (params, ctx) => {
        appels += 1;
        if (appels === 1) throw new ErreurReseau("coupure");
        return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
      }),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(
      "L’équipe ne s’est pas chargée. Les raccourcis restent utilisables.",
    );
    expect(within(pied()).getByRole("link", { name: "+ personne · + gare" })).toBeInTheDocument();
    expect(within(pied()).queryByText(/Payer/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(lignesGens()).toHaveLength(10);
    expect(appels).toBe(2);
  });

  it("vide : ni gare ni personne, un message et le raccourci vers les réglages", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({ ...vue, gares: [], personnes: [], reperes: [] })),
    });
    const message = await screen.findByText("Aucune gare ni personne pour le moment.");
    expect(message.closest("[role='status']")).not.toBeNull();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(within(pied()).getByRole("link", { name: "+ personne · + gare" })).toBeInTheDocument();
  });
});

describe("PatronEquipe · textes", () => {
  it("les trois langues ont les mêmes clés ; le français est rempli", async () => {
    const en = (await import("./i18n.en.json")).default;
    const pcm = (await import("./i18n.pcm.json")).default;
    function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
      return Object.entries(objet).flatMap(([cle, valeur]) =>
        typeof valeur === "object" && valeur !== null
          ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
          : [`${prefixe}${cle}`],
      );
    }
    const valeurs = (objet: Record<string, unknown>): string[] =>
      Object.values(objet).flatMap((v) =>
        typeof v === "object" && v !== null ? valeurs(v as Record<string, unknown>) : [String(v)],
      );
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
    expect(valeurs(fr).filter((v) => v.trim() === "")).toEqual([]);
  });
});

describe("PatronEquipe · fonctions pures", () => {
  const gare = (extra: Partial<Gare> = {}): Gare => ({
    id: "gare-x",
    nom: "Akwa",
    ville: "Douala",
    responsable: "Mme Essono",
    nbGuichets: 3,
    nbQuais: 2,
    caisse: 1_412_000,
    synchro: { guichetsSynchronises: 3, guichets: 3 },
    ecartTotal: 0,
    horsLigneDepuisMinutes: null,
    ...extra,
  });
  const personne = (extra: Partial<Personne> = {}): Personne => ({
    id: "pers-x",
    nom: "Joseph M.",
    initiales: "JM",
    role: "guichetier",
    lieu: "Akwa guichet 2",
    indicateur: "0 écart",
    etat: "en_service",
    ...extra,
  });

  it("formate heure, montants et écarts comme la planche", () => {
    expect(heureDouala("2027-01-05T14:02:00.000+01:00")).toBe("14:02");
    expect(heureDouala("n'importe quoi")).toBe("");
    expect(montant(1_412_000)).toBe("1 412 000");
    expect(montant(948_000)).toBe("948 000");
    expect(montant(950)).toBe("950");
    expect(ecart(-1000)).toBe("− 1 000");
    expect(ecart(1_250_000)).toBe("+ 1 250 000");
    expect(ecart(0)).toBe("0");
  });

  it("colore l'état d'une gare : hors ligne rouge, écart ou synchronisation partielle ambre, sinon vert", () => {
    expect(tonGare(gare())).toBe("vert");
    expect(tonGare(gare({ ecartTotal: -1000 }))).toBe("ambre");
    expect(tonGare(gare({ synchro: { guichetsSynchronises: 2, guichets: 3 } }))).toBe("ambre");
    expect(tonGare(gare({ ecartTotal: null, horsLigneDepuisMinutes: 40 }))).toBe("rouge");
    expect(tonGare(gare({ horsLigneDepuisMinutes: 40, ecartTotal: -1000 }))).toBe("rouge");
  });

  it("n'écrit la ville que si le nom ne la dit pas et si ce n'est pas celle de la première gare", () => {
    const akwa = gare();
    const mvan = gare({ id: "gare-y", nom: "Mvan", ville: "Yaoundé" });
    const baf = gare({ id: "gare-z", nom: "Bafoussam", ville: "Bafoussam" });
    const toutes = [akwa, mvan, baf];
    expect(villeAffichee(akwa, toutes)).toBeNull();
    expect(villeAffichee(mvan, toutes)).toBe("Yaoundé");
    expect(villeAffichee(baf, toutes)).toBeNull();
    expect(
      villeAffichee(gare({ id: "gare-w", nom: "Yaoundé Mvan", ville: "Yaoundé" }), toutes),
    ).toBeNull();
    expect(villeAffichee(gare({ ville: " " }), toutes)).toBeNull();
  });

  it("choisit la couleur des initiales d'après l'état et le PIN", () => {
    expect(tonAvatar(personne())).toBe("bleu");
    expect(tonAvatar(personne({ indicateur: "3 écarts · PIN à renouveler" }))).toBe("ambre");
    expect(tonAvatar(personne({ etat: "bloquee" }))).toBe("gris");
    expect(tonAvatar(personne({ etat: "indisponible", role: "chauffeur" }))).toBe("gris");
    expect(tonAvatar(personne({ etat: "a_bord", role: "convoyeur" }))).toBe("vert");
    expect(tonAvatar(personne({ etat: "en_route", role: "chauffeur" }))).toBe("vert");
    expect(tonAvatar(personne({ etat: "repos", role: "chauffeur" }))).toBe("bleu");
    expect(tonAvatar(personne({ role: "superviseur" }))).toBe("vert");
  });

  it("choisit la couleur de la synthèse : « 0 écart » reste discret, « 3 écarts » passe en ambre", () => {
    expect(tonIndicateur(personne({ indicateur: "1 204 billets · 0 écart" }))).toBe("neutre");
    expect(tonIndicateur(personne({ indicateur: "3 écarts · PIN à renouveler" }))).toBe("ambre");
    expect(tonIndicateur(personne({ indicateur: "1 écart" }))).toBe("ambre");
    expect(tonIndicateur(personne({ indicateur: "10 écarts" }))).toBe("ambre");
    expect(tonIndicateur(personne({ indicateur: "2 pannes · 1 retard" }))).toBe("ambre");
    expect(tonIndicateur(personne({ indicateur: "8 trajets · à l’heure" }))).toBe("neutre");
    expect(tonIndicateur(personne({ indicateur: "2 validations en attente" }))).toBe("neutre");
    expect(
      tonIndicateur(personne({ indicateur: "visite technique en cours", etat: "indisponible" })),
    ).toBe("ambre");
    expect(
      tonIndicateur(personne({ indicateur: "bloquée · 3 PIN faux 09:40", etat: "bloquee" })),
    ).toBe("rouge");
  });

  it("colore l'état à droite : vert au travail, gris au repos, rouge bloqué", () => {
    expect(tonEtatPersonne("en_service")).toBe("vert");
    expect(tonEtatPersonne("a_bord")).toBe("vert");
    expect(tonEtatPersonne("en_route")).toBe("vert");
    expect(tonEtatPersonne("repos")).toBe("gris");
    expect(tonEtatPersonne("indisponible")).toBe("gris");
    expect(tonEtatPersonne("hors_service")).toBe("gris");
    expect(tonEtatPersonne("bloquee")).toBe("rouge");
  });
});
