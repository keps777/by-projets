import {
  ErreurHttp,
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ALPHA_AKWA, ALPHA_BAFOUSSAM, ecrans } from "@afrimove/fixtures";
import { ConceptionProvider } from "@afrimove/ui";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { urlExemple } from "@/coquille/planches";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import type { DetailGare, GuichetGare, QuaiGare } from "./gare";
import { GareVue, type EtatGare } from "./gare-vue";
import {
  caisseCourte,
  commenceParVoyelle,
  ecart,
  heureDouala,
  montant,
  morceauxJournal,
  taux,
} from "./formats";
import fr from "./i18n.fr.json";

const planche = ecrans.PatronGare.donnees;

function rendre(options: { url?: string; clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "PatronGare",
    url: options.url ?? `/gares/${ALPHA_AKWA.id}`,
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Gare d’Akwa · Douala");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function bloc(titre: string): HTMLElement {
  return screen.getByRole("region", { name: titre });
}

/** Les lignes (liens) d'un bloc. */
function liens(titre: string): HTMLElement[] {
  return within(bloc(titre)).getAllByRole("link");
}

type Impl = Scenario["operations"][number];

function clientAvec(
  remplacerGare: (impl: Impl) => Impl,
  scenarioNom = "PatronGare",
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((impl) =>
          impl.operation.nom === patron.OP_GARE.nom ? remplacerGare(impl) : impl,
        ),
      };
    },
  };
  return creerClientMock({ source, scenario: scenarioNom, latenceMs: 0 });
}

describe("PatronGare · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : gare, superviseure, effectifs, heure et synchronisation", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByText("Superviseure Mme Essono · 3 guichets · 2 quais · 14:02"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 / 3 sync")).toBeInTheDocument();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Patron · une gare en détail",
    );
  });

  it("affiche les quatre chiffres : caisse, billets, colis, écart en ambre", async () => {
    rendre();
    await attendreEcran();
    const caisse = screen.getByRole("group", { name: /^Caisse/ });
    expect(within(caisse).getByText("1,41 M")).toBeInTheDocument();
    expect(within(caisse).getByText("depuis 05:30")).toBeInTheDocument();
    const billets = screen.getByRole("group", { name: /^Billets/ });
    expect(within(billets).getByText("318")).toBeInTheDocument();
    expect(within(billets).getByText("86 % rempli")).toBeInTheDocument();
    const colis = screen.getByRole("group", { name: /^Colis/ });
    expect(within(colis).getByText("96")).toBeInTheDocument();
    expect(within(colis).getByText("12 au relais")).toBeInTheDocument();
    const ecartTuile = screen.getByRole("group", { name: /^Écart/ });
    expect(within(ecartTuile).getByText("− 1 000")).toBeInTheDocument();
    expect(within(ecartTuile).getByText("guichet 2")).toBeInTheDocument();
    expect(ecartTuile).toHaveAttribute("data-etat", "ambre");
  });

  it("liste les trois guichets : qui, combien, état, chacun ouvre la fiche de la personne", async () => {
    rendre();
    await attendreEcran();
    expect(
      within(bloc("Guichets · qui, combien, état")).getByText("touche un guichet"),
    ).toBeInTheDocument();
    const lignes = liens("Guichets · qui, combien, état");
    expect(lignes.map((a) => a.textContent)).toEqual([
      "MTGuichet 1 · Marie T.142 billets · 38 colis · 0 écart612 000sync 14:01",
      "JMGuichet 2 · Joseph M.121 billets · 31 colis · écart − 1 000 · clôture attend PIN694 500sync 14:00",
      "PNGuichet 3 · Pauline N.55 billets · 27 colis · bloquée depuis 09:40105 500bloqué",
    ]);
    // une fiche par personne, avec l'identifiant de la fixture
    expect(lignes.map((a) => a.getAttribute("href"))).toEqual(
      planche.guichets.liste.map((g) => `/personnes/${g._personneId}`),
    );
    expect(lignes[1]).toHaveAttribute("href", "/personnes/pers-joseph");
  });

  it("colore chaque guichet selon son état : écart en ambre, bloqué en rouge, synchronisé en vert", async () => {
    rendre();
    await attendreEcran();
    const [marie, joseph, pauline] = liens("Guichets · qui, combien, état");
    const ton = (ligne: HTMLElement | undefined, texte: string) =>
      within(ligne!).getByText(texte).getAttribute("data-ton");
    expect(ton(marie, "142 billets · 38 colis · 0 écart")).toBe("neutre");
    expect(ton(marie, "sync 14:01")).toBe("vert");
    expect(ton(joseph, "121 billets · 31 colis · écart − 1 000 · clôture attend PIN")).toBe(
      "ambre",
    );
    expect(ton(joseph, "sync 14:00")).toBe("vert");
    expect(ton(pauline, "55 billets · 27 colis · bloquée depuis 09:40")).toBe("rouge");
    expect(ton(pauline, "bloqué")).toBe("rouge");
  });

  it("liste les deux prochains départs : trajet, bus, équipage, places libres, lien vers le quai", async () => {
    rendre();
    await attendreEcran();
    expect(within(bloc("Quais · prochains départs")).getByText("2 quais")).toBeInTheDocument();
    const lignes = liens("Quais · prochains départs");
    expect(lignes.map((a) => a.textContent)).toEqual([
      "16:00 · Douala → Yaoundé · LT 412 ABMbarga · Alain B. · 27 / 30 · embarquement 15:303 libres",
      "17:00 · Douala → Bafoussam · LT 118 ABFotso · 18 / 30 · 09:30 Oméga en face12 libres",
    ]);
    expect(lignes.map((a) => a.getAttribute("href"))).toEqual(["/embarquement", "/embarquement"]);
    expect(within(lignes[0]!).getByText("3 libres")).toHaveAttribute("data-ton", "vert");
    expect(within(lignes[1]!).getByText("12 libres")).toHaveAttribute("data-ton", "ambre");
  });

  it("affiche le journal du jour : heure en gras, texte, état, rang en exposant", async () => {
    rendre();
    await attendreEcran();
    const journal = bloc("Journal de la gare · aujourd’hui");
    expect(within(journal).getByText("3 événements")).toBeInTheDocument();
    const lignes = within(journal).getAllByRole("listitem");
    expect(lignes.map((li) => li.textContent)).toEqual([
      "09:40 · Pauline N. bloquée · 3 PIN faux · superviseure prévenueouvert",
      "11:15 · annulation 0171 · 4 000 · « client parti » · validée Essonotracé",
      "14:00 · clôture guichet 2 · écart − 1 000 · 3e en 10 joursattend PIN",
    ]);
    expect(within(lignes[0]!).getByText("09:40").tagName).toBe("STRONG");
    expect(within(lignes[2]!).getByText("e").tagName).toBe("SUP");
    expect(within(lignes[0]!).getByText("ouvert")).toHaveAttribute("data-ton", "rouge");
    expect(within(lignes[1]!).getByText("tracé")).toHaveAttribute("data-ton", "neutre");
    expect(within(lignes[2]!).getByText("attend PIN")).toHaveAttribute("data-ton", "ambre");
    // le journal se lit : ses lignes ne sont pas des liens
    expect(within(journal).queryAllByRole("link")).toEqual([]);
  });

  it("rappelle la règle du patron et mène au rapport d'hier et à la caisse en direct", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText(planche.regle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rapport 21 h d’hier" })).toHaveAttribute(
      "href",
      "/rapport",
    );
    const caisse = screen.getByRole("link", { name: /^Caisse en direct/ });
    expect(caisse).toHaveTextContent("Caisse en direct1 412 000 · 3 guichets · live");
    expect(caisse).toHaveAttribute("href", "/guichet/caisse");
  });

  it("« Retour » ramène à la liste des gares", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gares");
  });

  it("le patron ne touche pas la caisse : aucun bouton, aucune validation", async () => {
    rendre();
    await attendreEcran();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText(/valider/i, { selector: "a, button" })).not.toBeInTheDocument();
    expect(principal().querySelector("input, select, textarea")).toBeNull();
    // aucun lien n'écrit : tous mènent à un écran de lecture ou de suivi du patron, du quai ou de la caisse
    const hrefs = within(principal())
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs.filter((h) => /cloture|debloquer|annulation/.test(h ?? ""))).toEqual([]);
  });

  it("n'écrit rien dans l'API : seule la lecture de la gare est appelée", async () => {
    const lectures: string[] = [];
    const client = clientAvec((impl) =>
      implementer(patron.OP_GARE, (params, ctx) => {
        lectures.push(JSON.stringify(params));
        return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
      }),
    );
    rendre({ clientApi: client });
    await attendreEcran();
    expect(lectures).toEqual([JSON.stringify({ gareId: ALPHA_AKWA.id })]);
  });

  it("les identifiants d'exemple de la route existent dans les fixtures", () => {
    expect(urlExemple("PatronGare")).toBe(`/gares/${ALPHA_AKWA.id}`);
    expect(urlExemple("PatronPersonne")).toBe(
      `/personnes/${planche.guichets.liste[1]!._personneId}`,
    );
  });
});

describe("PatronGare · autres gares et cas limites", () => {
  it("une gare sans détail (Bafoussam) affiche ses chiffres et des blocs vides, sans casser la mise en page", async () => {
    rendre({ url: `/gares/${ALPHA_BAFOUSSAM.id}` });
    expect(await screen.findByText(/^Gare de Bafoussam/)).toBeInTheDocument();
    expect(within(bloc("Guichets · qui, combien, état")).getByRole("status")).toHaveTextContent(
      fr.guichets.aucun,
    );
    expect(within(bloc("Quais · prochains départs")).getByRole("status")).toHaveTextContent(
      fr.quais.aucun,
    );
    expect(within(bloc("Journal de la gare · aujourd’hui")).getByRole("status")).toHaveTextContent(
      fr.journal.aucun,
    );
    expect(screen.getByText("386 k")).toBeInTheDocument();
  });

  it("une gare inconnue (404) : message dans le style nuit, pas de bouton Réessayer, le retour reste", async () => {
    rendre({ url: "/gares/gare-inconnue" });
    expect(await screen.findByText(fr.etats.introuvable)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/gares");
    expect(screen.queryByText("1,41 M")).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis la gare", async () => {
    let appels = 0;
    const client = clientAvec((impl) =>
      implementer(patron.OP_GARE, (params, ctx) => {
        appels += 1;
        if (appels === 1) throw new ErreurReseau("coupure");
        return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
      }),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(fr.etats.erreur);
    expect(screen.queryByText("1,41 M")).not.toBeInTheDocument();
    // le pied reste utilisable, sans montant inventé
    expect(screen.getByRole("link", { name: "Rapport 21 h d’hier" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Caisse en direct/ })).toHaveTextContent(
      /^Caisse en direct$/,
    );

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.getByText("1,41 M")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("une erreur HTTP autre que 404 est une panne, pas une gare inconnue", async () => {
    const client = clientAvec(() =>
      implementer(patron.OP_GARE, () => {
        throw new ErreurHttp(500, "Panne", "PANNE");
      }),
    );
    rendre({ clientApi: client });
    expect(await screen.findByRole("alert")).toHaveTextContent(fr.etats.erreur);
  });
});

/* ---------------------------------------------------------------- la vue, sur des données choisies */

const A = (hhmm: string) => `2027-01-05T${hhmm}:00.000+01:00`;

const GUICHET: GuichetGare = {
  rang: 1,
  personne: { id: "pers-x", nom: "Awa K.", initiales: "AK" },
  sessionId: null,
  billets: 1,
  colis: 0,
  caisse: 12_500,
  ecart: 0,
  etat: "synchronise",
  derniereSyncA: A("13:58"),
  bloqueDepuis: null,
  clotureAttendPin: false,
};

const QUAI: QuaiGare = {
  departId: "dep-x",
  heureDepart: A("18:30"),
  origine: "Douala",
  destination: "Kribi",
  bus: "LT 001 AB",
  chauffeur: "Ngo",
  convoyeur: null,
  remplis: 30,
  capacite: 30,
  embarquementA: null,
  note: null,
};

const GARE: DetailGare = {
  gare: { id: "gare-x", nom: "Mvan", ville: "Yaoundé" },
  superviseur: "M. Ondoa",
  nbGuichets: 1,
  nbQuais: 1,
  instant: A("14:02"),
  synchro: { guichetsSynchronises: 0, guichets: 1 },
  chiffres: {
    caisse: 12_500,
    caisseDepuis: A("05:30"),
    billets: 1,
    remplissagePct: 86.5,
    colis: 0,
    colisAuRelais: 1,
    ecart: 0,
    ecartGuichet: null,
  },
  guichets: [GUICHET],
  quais: [QUAI],
  journal: [],
};

function rendreVue(etat: EtatGare, gare?: DetailGare, reessayer?: () => void) {
  render(
    <I18nextProvider i18n={creerI18n("fr")}>
      <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
        <ConceptionProvider actif={false}>
          <GareVue etat={etat} gare={gare} {...(reessayer ? { onReessayer: reessayer } : {})} />
        </ConceptionProvider>
      </FournisseurApi>
    </I18nextProvider>,
  );
}

describe("PatronGare · états chargement et cas de la vue", () => {
  it("chargement : les blocs et les liens statiques sont là, aucun texte de donnée", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Chargement de la gare")).toBeInTheDocument();
    expect(screen.getByText("Guichets · qui, combien, état")).toBeInTheDocument();
    expect(screen.getByText("Quais · prochains départs")).toBeInTheDocument();
    expect(screen.getByText("Journal de la gare · aujourd’hui")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rapport 21 h d’hier" })).toBeInTheDocument();
    expect(screen.queryByText(/sync/)).not.toBeInTheDocument();
    expect(screen.queryByText(/événement/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /Guichet/ })).toEqual([]);
  });

  it("gare hors ligne : la pastille passe à l'ambre, le guichet dit « sync » sans heure inventée", () => {
    rendreVue("pret", {
      ...GARE,
      guichets: [{ ...GUICHET, etat: "hors_ligne", derniereSyncA: null }],
    });
    expect(screen.getByText("0 / 1 sync").closest("[data-statut]")).toHaveAttribute(
      "data-statut",
      "horsLigne",
    );
    expect(screen.getByText("hors ligne")).toHaveAttribute("data-ton", "ambre");
    const guichet = liens("Guichets · qui, combien, état")[0]!;
    expect(within(guichet).getByText("1 billet · 0 colis · 0 écart")).toHaveAttribute(
      "data-ton",
      "ambre",
    );
  });

  it("guichet synchronisé sans heure : « sync » seul", () => {
    rendreVue("pret", { ...GARE, guichets: [{ ...GUICHET, derniereSyncA: null }] });
    expect(screen.getByText("sync")).toHaveAttribute("data-ton", "vert");
  });

  it("guichet bloqué avec un écart : l'heure du blocage et l'écart sont tous deux écrits", () => {
    rendreVue("pret", {
      ...GARE,
      guichets: [
        {
          ...GUICHET,
          etat: "bloque",
          bloqueDepuis: A("09:40"),
          ecart: -2500,
          derniereSyncA: null,
        },
      ],
    });
    expect(
      screen.getByText("1 billet · 0 colis · bloquée depuis 09:40 · écart − 2 500"),
    ).toHaveAttribute("data-ton", "rouge");
    expect(screen.getByText("bloqué")).toHaveAttribute("data-ton", "rouge");
  });

  it("un excédent est écrit avec son signe : « + 500 »", () => {
    rendreVue("pret", {
      ...GARE,
      chiffres: { ...GARE.chiffres, ecart: 500, ecartGuichet: 1 },
      guichets: [{ ...GUICHET, ecart: 500 }],
    });
    const tuile = screen.getByRole("group", { name: /^Écart/ });
    expect(within(tuile).getByText("+ 500")).toBeInTheDocument();
    expect(within(tuile).getByText("guichet 1")).toBeInTheDocument();
    expect(screen.getByText("1 billet · 0 colis · écart + 500")).toBeInTheDocument();
  });

  it("sans écart : tuile neutre, détail « aucun écart »", () => {
    rendreVue("pret", GARE);
    const tuile = screen.getByRole("group", { name: /^Écart/ });
    expect(within(tuile).getByText("0")).toBeInTheDocument();
    expect(within(tuile).getByText("aucun écart")).toBeInTheDocument();
    expect(tuile).toHaveAttribute("data-etat", "neutre");
  });

  it("gare dont le nom commence par une consonne, superviseur : « Gare de Mvan », « Superviseur M. Ondoa »", () => {
    rendreVue("pret", GARE);
    expect(screen.getByText("Gare de Mvan · Yaoundé")).toBeInTheDocument();
    expect(
      screen.getByText("Superviseur M. Ondoa · 1 guichet · 1 quai · 14:02"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 / 1 sync")).toBeInTheDocument();
  });

  it("départ complet : « complet » en vert, une seule place : « 1 libre »", () => {
    rendreVue("pret", {
      ...GARE,
      quais: [QUAI, { ...QUAI, departId: "dep-y", remplis: 29 }],
    });
    expect(screen.getByText("complet")).toHaveAttribute("data-ton", "vert");
    expect(screen.getByText("1 libre")).toHaveAttribute("data-ton", "vert");
    expect(screen.getByText("Ngo · 30 / 30")).toBeInTheDocument();
  });

  it("le pied annonce la caisse de la gare, le tableau plus bas fait de même", () => {
    rendreVue("pret", GARE);
    expect(screen.getByRole("link", { name: /^Caisse en direct/ })).toHaveTextContent(
      "Caisse en direct12 500 · 1 guichet · live",
    );
    expect(screen.getByText("12,5 k")).toBeInTheDocument();
    expect(screen.getByText("86,5 % rempli")).toBeInTheDocument();
  });

  it("erreur : le bouton Réessayer appelle la relance", async () => {
    const relance = vi.fn();
    rendreVue("erreur", undefined, relance);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(relance).toHaveBeenCalledTimes(1);
  });
});

describe("PatronGare · cibles tactiles", () => {
  // jsdom ne dessine rien : on lit les règles du module CSS. Chaque lien fait 44 px au moins une fois le bord compté ;
  // la ligne de départ (42 px dans la planche) reçoit une zone de touche de 44 px par un pseudo-élément.
  const css = readFileSync(
    join(process.cwd(), "src/ecrans/PatronGare/patron-gare.module.css"),
    "utf8",
  );
  const regle = (selecteur: string): string =>
    new RegExp(`(?:^|\\n)${selecteur.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const px = (corps: string, propriete: string): number =>
    Number(new RegExp(`${propriete}:\\s*(\\d+)px`).exec(corps)?.[1] ?? 0);

  it("retour, guichets, rapport et caisse en direct font 44 px au moins", () => {
    expect(px(regle(".retour"), "width")).toBeGreaterThanOrEqual(44);
    expect(px(regle(".retour"), "height")).toBeGreaterThanOrEqual(44);
    expect(px(regle(".ligneGuichet"), "min-height")).toBeGreaterThanOrEqual(44);
    expect(px(regle(".rapport"), "min-height")).toBeGreaterThanOrEqual(44);
    expect(px(regle(".caisseDirect"), "min-height")).toBeGreaterThanOrEqual(44);
  });

  it("la ligne de départ de 42 px déborde de 2 px vers le haut pour atteindre 44 px", () => {
    expect(px(regle(".ligneQuai"), "min-height")).toBe(42);
    expect(regle(".ligneQuai::after")).toMatch(/inset:\s*-2px 0 0/);
  });
});

describe("PatronGare · textes", () => {
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
    const vides = (objet: Record<string, unknown>): string[] =>
      Object.values(objet).flatMap((v) =>
        typeof v === "object" && v !== null ? vides(v as Record<string, unknown>) : [String(v)],
      );
    expect(vides(fr).filter((v) => v.trim() === "")).toEqual([]);
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
    expect(cles(fr).length).toBeGreaterThan(40);
  });
});

describe("PatronGare · fonctions pures", () => {
  it("formate heures, caisses, montants, écarts et taux comme la planche", () => {
    expect(heureDouala("2027-01-05T14:02:00.000+01:00")).toBe("14:02");
    expect(caisseCourte(1_412_000)).toBe("1,41 M");
    expect(caisseCourte(1_400_000)).toBe("1,4 M");
    expect(caisseCourte(12_000_000)).toBe("12 M");
    expect(caisseCourte(612_000)).toBe("612 k");
    expect(caisseCourte(612_500)).toBe("612,5 k");
    expect(caisseCourte(950)).toBe("950");
    expect(montant(1_412_000)).toBe("1 412 000");
    expect(montant(694_500)).toBe("694 500");
    expect(montant(0)).toBe("0");
    expect(montant(-1000)).toBe("− 1 000");
    expect(ecart(-1000)).toBe("− 1 000");
    expect(ecart(1_250_000)).toBe("+ 1 250 000");
    expect(ecart(0)).toBe("0");
    expect(taux(86)).toBe("86");
    expect(taux(86.5)).toBe("86,5");
  });

  it("élide « de » devant une voyelle : Akwa, Elig-Edzoa ; pas devant Mvan, Bafoussam", () => {
    expect(commenceParVoyelle("Akwa")).toBe(true);
    expect(commenceParVoyelle("Élig-Edzoa")).toBe(true);
    expect(commenceParVoyelle("Mvan")).toBe(false);
    expect(commenceParVoyelle("Bafoussam")).toBe(false);
  });

  it("met les rangs du journal en exposant : « 3e en 10 jours », « 1er », sans toucher aux autres nombres", () => {
    expect(morceauxJournal("clôture · 3e en 10 jours")).toEqual([
      { texte: "clôture · 3" },
      { exposant: "e" },
      { texte: " en 10 jours" },
    ]);
    expect(morceauxJournal("le 1er du mois")).toEqual([
      { texte: "le 1" },
      { exposant: "er" },
      { texte: " du mois" },
    ]);
    expect(morceauxJournal("annulation 0171 · 4 000")).toEqual([
      { texte: "annulation 0171 · 4 000" },
    ]);
    expect(morceauxJournal("")).toEqual([]);
  });
});
