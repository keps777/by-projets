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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { horlogeFigee } from "@/coquille/horloge";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const planche = ecrans.ComptableApercu.donnees;

type Apercu = contrats.ApercuExport;

/** L'instant où la planche dit avoir généré le fichier : « généré à l'instant ». */
const GENERE_A = ecrans.ComptableApercu.maintenant;

function rendre(
  options: { client?: ReturnType<typeof creerClientMock>; url?: string; maintenant?: Date } = {},
) {
  return rendreApp({
    fixtures: true,
    scenario: "ComptableApercu",
    url: options.url ?? "/comptable/apercu/journal_ventes",
    horloge: horlogeFigee(options.maintenant ?? GENERE_A),
    ...(options.client ? { clientApi: options.client } : {}),
  });
}

async function attendreEcran() {
  return screen.findByRole("dialog", { name: planche.export.nom });
}

function fenetre(): HTMLElement {
  return screen.getByRole("dialog");
}

function racine(): HTMLElement {
  return document.querySelector("[data-planche='ComptableApercu']") as HTMLElement;
}

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "ComptableApercu", latenceMs: 0 });
}

/** Change la réponse de l'aperçu ; `transformer` voit la réponse du scénario, les paramètres et le numéro de l'appel. */
function avecApercu(
  transformer: (reponse: Apercu, appel: number, params: unknown) => Apercu | Promise<Apercu>,
) {
  let appel = 0;
  return clientAvec((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === patron.OP_APERCU_EXPORT.nom
        ? implementer(patron.OP_APERCU_EXPORT, async (params, ctx) => {
            appel += 1;
            return transformer(
              (await (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx)) as Apercu,
              appel,
              params,
            );
          })
        : impl,
    ),
  }));
}

function texteDesLignes(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((tr) =>
      within(tr)
        .getAllByRole("cell")
        .map((td) => td.textContent ?? ""),
    );
}

describe("ComptableApercu · rendu de la planche (scénario de démo)", () => {
  it("ouvre le pop-up d'un export : badge de format, nom, lignes, colonnes, taille, instant de génération", async () => {
    rendre();
    const dialogue = await attendreEcran();
    expect(dialogue).toHaveAttribute("aria-modal", "true");
    expect(within(dialogue).getByText("XLSX")).toBeInTheDocument();
    expect(within(dialogue).getByText(planche.export.nom)).toBeInTheDocument();
    expect(within(dialogue).getByText(planche.export.detail)).toBeInTheDocument();
    expect(planche.export.detail).toBe("31 404 lignes · 11 colonnes · 1,2 Mo · généré à l'instant");
  });

  it("garde un titre de page pour les lecteurs d'écran, comme les autres planches", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 1, name: "Comptable · aperçu d’un export (pop-up)" }),
    ).toBeInTheDocument();
  });

  it("montre l'écran Comptable estompé derrière le voile, sans qu'on puisse y aller", async () => {
    rendre();
    await attendreEcran();
    await waitFor(() =>
      expect(screen.getByText("Décembre 2026 · clôture le 5 du mois")).toBeInTheDocument(),
    );
    const fond = screen.getByText("Comptable").closest("[aria-hidden='true']") as HTMLElement;
    expect(fond).not.toBeNull();
    expect(fond).toHaveAttribute("inert");
    expect(within(fond).getByText(planche.fond.rapprochement)).toBeInTheDocument();
    expect(within(fond).getByText(planche.fond.exports)).toBeInTheDocument();
    expect(fond.contains(fenetre())).toBe(false);
    expect(fond.querySelector("a, button")).toBeNull();
  });

  it("affiche les quatre onglets de la planche, le premier actif", async () => {
    rendre();
    await attendreEcran();
    const onglets = within(screen.getByRole("list", { name: "Onglets de l'export" })).getAllByRole(
      "listitem",
    );
    expect(onglets.map((o) => o.textContent)).toEqual(planche.export.onglets);
    expect(onglets.map((o) => o.getAttribute("aria-current"))).toEqual(["true", null, null, null]);
  });

  it("affiche les dix premières lignes du tableau dans l'ordre des colonnes de la planche", async () => {
    rendre();
    await attendreEcran();
    const table = screen.getByRole("table", {
      name: "Journal des ventes · décembre, lignes 1 à 10",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(planche.tableau.colonnes);
    expect(texteDesLignes(table)).toEqual(
      planche.tableau.lignes.map((l) => [
        l.date,
        l.heure,
        l.ligne,
        l.depart,
        l.siege,
        l.classe,
        // Le tableau écrit le prix avec une espace entre les milliers : « 5 000 ».
        `${String(l.prix).slice(0, -3)} ${String(l.prix).slice(-3)}`,
        l.mode,
        l.guichet,
      ]),
    );
  });

  it("écrit « — » pour la cellule vide et « 01/12 » pour la date, comme la planche", async () => {
    rendre();
    await attendreEcran();
    const lignes = texteDesLignes(screen.getByRole("table"));
    expect(lignes[5]).toEqual([
      "01/12",
      "06:08",
      "COLIS",
      "06:30",
      "—",
      "3 kg",
      "3 000",
      "MOMO",
      "GU3 · PN",
    ]);
    expect(lignes.every((l) => l[0] === "01/12")).toBe(true);
  });

  it("colore le mode : CASH vert, MOMO ambre, APP et USSD bleu, ANNULÉ rouge ; la colonne prix est à droite", async () => {
    rendre();
    await attendreEcran();
    const table = screen.getByRole("table");
    const lignes = within(table).getAllByRole("row").slice(1);
    const modes = lignes.map((tr) => {
      const cellule = within(tr).getAllByRole("cell")[7] as HTMLElement;
      return [cellule.textContent, cellule.getAttribute("data-etat")];
    });
    expect(modes).toEqual([
      ["CASH", "vert"],
      ["MOMO", "ambre"],
      ["CASH", "vert"],
      ["APP", "bleu"],
      ["CASH", "vert"],
      ["MOMO", "ambre"],
      ["CASH", "vert"],
      ["USSD", "bleu"],
      ["ANNULÉ", "rouge"],
      ["CASH", "vert"],
    ]);
    const prix = within(table).getAllByRole("columnheader")[6] as HTMLElement;
    expect(prix).toHaveTextContent("prix");
    expect(prix).toHaveAttribute("data-align", "droite");
    expect(within(lignes[0] as HTMLElement).getAllByRole("cell")[6]).toHaveAttribute(
      "data-align",
      "droite",
    );
    // Les autres colonnes restent à gauche.
    expect(within(table).getAllByRole("columnheader")[2]).toHaveAttribute("data-align", "gauche");
  });

  it("colle la colonne « date » à gauche quand le tableau glisse", async () => {
    rendre();
    await attendreEcran();
    const table = screen.getByRole("table");
    const entetes = within(table).getAllByRole("columnheader");
    expect(entetes[0]).toHaveAttribute("data-fixe", "oui");
    expect(entetes.slice(1).every((th) => !th.hasAttribute("data-fixe"))).toBe(true);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .every((tr) => within(tr).getAllByRole("cell")[0]?.getAttribute("data-fixe") === "oui"),
    ).toBe(true);
    // La zone qui glisse se prend au clavier.
    expect(
      screen.getByRole("region", {
        name: "Journal des ventes · décembre, lignes 1 à 10 (défile à l'horizontale)",
      }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("dit où l'on en est (lignes 1 – 10 sur 31 404) et le total, 28 414 000", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText(planche.tableau.pied)).toBeInTheDocument();
    expect(planche.tableau.pied).toBe("Lignes 1 – 10 sur 31 404 · glisser pour les suivantes");
    expect(screen.getByText(planche.tableau.total)).toBeInTheDocument();
    expect(planche.tableau.total).toBe("total 28 414 000");
  });

  it("rappelle les trois garanties de la planche", async () => {
    rendre();
    await attendreEcran();
    for (const g of planche.garanties) {
      const titre = within(fenetre()).getByText(g.titre);
      expect(titre.parentElement).toHaveTextContent(`${g.titre}${g.detail}`);
    }
    expect(planche.garanties.map((g) => g.titre)).toEqual([
      "Colonnes fixes",
      "Un onglet par vue",
      "Signé",
    ]);
  });

  it("garde trois boutons : Fermer, Télécharger, Envoyer au cabinet", async () => {
    rendre();
    await attendreEcran();
    expect(planche.actions).toEqual(["Fermer", "Télécharger", "Envoyer au cabinet"]);
    expect(within(fenetre()).getByRole("link", { name: "Fermer" })).toHaveAttribute(
      "href",
      "/comptable",
    );
    expect(within(fenetre()).getByRole("button", { name: "Télécharger" })).toBeEnabled();
    expect(within(fenetre()).getByRole("link", { name: "Envoyer au cabinet" })).toHaveAttribute(
      "href",
      "/comptable/cloture",
    );
  });

  it("l'icône de Télécharger est décorative, aucun emoji, aucun bouton grisé", async () => {
    rendre();
    await attendreEcran();
    const telecharger = screen.getByRole("button", { name: "Télécharger" });
    expect(telecharger.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(fenetre().textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const bouton of within(fenetre()).getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(fenetre().textContent).not.toMatch(/bientôt/i);
  });
});

describe("ComptableApercu · navigation", () => {
  it("« Fermer » revient au Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(within(fenetre()).getByRole("link", { name: "Fermer" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("le « × » du haut revient au Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(within(fenetre()).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("toucher le voile ou appuyer sur Échap ferme le pop-up et revient au Comptable", async () => {
    const premier = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByTestId("voile"));
    await waitFor(() => expect(premier.routeur.state.location.pathname).toBe("/comptable"));
  });

  it("Échap revient au Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("toucher le pop-up lui-même ne le ferme pas", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(within(fenetre()).getByText(planche.export.nom));
    expect(routeur.state.location.pathname).toBe("/comptable/apercu/journal_ventes");
    expect(fenetre()).toBeInTheDocument();
  });

  it("« Envoyer au cabinet » mène à la clôture, sans rien envoyer d'ici", async () => {
    const envois: unknown[] = [];
    const client = clientAvec((scenario) => ({
      ...scenario,
      operations: scenario.operations.map((impl) =>
        impl.operation.methode === "POST"
          ? implementer(impl.operation, (params) => {
              envois.push(params);
              throw new Error("aucune écriture attendue");
            })
          : impl,
      ),
    }));
    const { routeur } = rendre({ client });
    await attendreEcran();
    await userEvent.click(within(fenetre()).getByRole("link", { name: "Envoyer au cabinet" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable/cloture"));
    expect(envois).toEqual([]);
  });

  it("depuis le Comptable, « Aperçu » d'un export ouvre ce pop-up", async () => {
    const { routeur } = rendre({ url: "/comptable" });
    await screen.findByText("Journal des ventes");
    await userEvent.click(
      screen
        .getAllByRole("link")
        .find((a) => a.getAttribute("href")?.startsWith("/comptable/apercu/")) as HTMLElement,
    );
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/comptable/apercu/journal_ventes"),
    );
    expect(await attendreEcran()).toBeInTheDocument();
  });
});

describe("ComptableApercu · télécharger", () => {
  let blobs: Blob[];
  let telechargements: Array<{ nom: string; href: string }>;

  beforeEach(() => {
    blobs = [];
    telechargements = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return "blob:apercu";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      telechargements.push({ nom: this.download, href: this.getAttribute("href") ?? "" });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function contenuDuFichier(): Promise<string> {
    const octets = await new Promise<ArrayBuffer>((resolve) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(lecteur.result as ArrayBuffer);
      lecteur.readAsArrayBuffer(blobs[0] as Blob);
    });
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(octets).replace(/^﻿/, "");
  }

  it("remet à l'appareil un fichier nommé d'après l'export, puis revient au Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Télécharger" }));
    expect(telechargements).toEqual([
      { nom: "journal-des-ventes-decembre-apercu.csv", href: "blob:apercu" },
    ]);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });

  it("le fichier est exactement ce que le pop-up montre : mêmes colonnes, mêmes dix lignes, même ordre", async () => {
    rendre();
    await attendreEcran();
    const table = screen.getByRole("table");
    const affichees = texteDesLignes(table);
    const colonnes = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    await userEvent.click(screen.getByRole("button", { name: "Télécharger" }));

    const lignes = (await contenuDuFichier()).trimEnd().split("\r\n");
    expect(lignes[0]).toBe(colonnes.join(";"));
    expect(lignes).toHaveLength(1 + affichees.length);
    lignes.slice(1).forEach((ligne, i) => {
      const cellules = ligne.split(";");
      const vues = affichees[i] as string[];
      expect(cellules).toHaveLength(vues.length);
      // Le fichier garde les valeurs brutes : seule leur mise en forme change (5000 -> 5 000, 2026-12-01 -> 01/12).
      cellules.forEach((cellule, j) => {
        const vue = vues[j] as string;
        expect(
          [
            cellule,
            cellule === "" ? "—" : cellule.replace(/^\d{4}-(\d{2})-(\d{2})$/, "$2/$1"),
          ].some((c) => c === vue || c.replace(/\B(?=(\d{3})+$)/g, " ") === vue),
          `ligne ${i + 1}, colonne ${colonnes[j]} : « ${cellule} » ≠ « ${vue} »`,
        ).toBe(true);
      });
    });
  });

  it("le fichier suit l'aperçu reçu : une autre réponse donne un autre fichier", async () => {
    const client = avecApercu((r) => ({
      ...r,
      tableau: { ...r.tableau, lignes: [["2026-12-02", "x", null, 9, "a;b", "z", 1, "CASH", "q"]] },
    }));
    rendre({ client });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Télécharger" }));
    expect((await contenuDuFichier()).split("\r\n")[1]).toBe('2026-12-02;x;;9;"a;b";z;1;CASH;q');
  });
});

describe("ComptableApercu · données de l'API", () => {
  it("lit l'aperçu de l'export de l'adresse, pour le mois en cours", async () => {
    const lus: unknown[] = [];
    const client = avecApercu((r, _appel, params) => {
      lus.push(params);
      return r;
    });
    rendre({ client });
    await attendreEcran();
    expect(lus).toEqual([{ exportId: "journal_ventes" }]);
  });

  it("accorde « 1 ligne · 1 colonne » au singulier", async () => {
    const client = avecApercu((r) => ({
      ...r,
      export: { ...r.export, lignes: 1, colonnes: 1 },
      tableau: {
        ...r.tableau,
        lignes: [r.tableau.lignes[0] as Apercu["tableau"]["lignes"][number]],
        derniere: 1,
        total: 1,
      },
    }));
    rendre({ client });
    await attendreEcran();
    expect(
      screen.getByText("1 ligne · 1 colonne · 1,2 Mo · généré à l'instant"),
    ).toBeInTheDocument();
    // Tout le fichier est montré : plus de « glisser pour les suivantes ».
    expect(screen.getByText("Lignes 1 – 1 sur 1")).toBeInTheDocument();
  });

  it.each([
    [5, "généré il y a 5 min"],
    [3 * 60, "généré il y a 3 h"],
    [2 * 24 * 60, "généré le 5 janv. 07:38"],
  ])(
    "dit depuis quand le fichier est généré : %i min plus tard, « %s »",
    async (minutes, texte) => {
      rendre({ maintenant: new Date(new Date(GENERE_A).getTime() + minutes * 60_000) });
      await attendreEcran();
      expect(within(fenetre()).getByText(new RegExp(`${texte}$`))).toBeInTheDocument();
    },
  );

  it("n'affiche pas la garantie « Signé » quand le fichier n'est pas signé", async () => {
    const client = avecApercu((r) => ({ ...r, signe: false }));
    rendre({ client });
    await attendreEcran();
    expect(within(fenetre()).queryByText("Signé")).toBeNull();
    expect(within(fenetre()).getByText("Colonnes fixes")).toBeInTheDocument();
    expect(within(fenetre()).getByText("Un onglet par vue")).toBeInTheDocument();
  });

  it("les onglets et les colonnes viennent de l'API : un autre export, un autre tableau", async () => {
    const client = avecApercu((r) => ({
      ...r,
      export: { ...r.export, format: "PDF", nom: "Annulations et remboursements", lignes: 142 },
      onglets: [
        { id: "annulations", libelle: "Annulations · 142" },
        { id: "motifs", libelle: "Motifs" },
      ],
      tableau: {
        ...r.tableau,
        colonnes: ["date", "motif", "montant"],
        lignes: [
          ["2026-12-03", "doublon", 5000],
          ["2026-12-04", null, 3500],
        ],
        derniere: 2,
        total: 142,
        totalMontant: 710_000,
      },
    }));
    rendre({ client });
    const dialogue = await screen.findByRole("dialog", { name: "Annulations et remboursements" });
    expect(within(dialogue).getByText("PDF")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Onglets de l'export" }))
        .getAllByRole("listitem")
        .map((o) => o.textContent),
    ).toEqual(["Annulations · 142", "Motifs"]);
    expect(within(dialogue).getByText("annulations · motifs")).toBeInTheDocument();
    expect(texteDesLignes(screen.getByRole("table"))).toEqual([
      ["03/12", "doublon", "5 000"],
      ["04/12", "—", "3 500"],
    ]);
    expect(
      within(dialogue).getByText("Lignes 1 – 2 sur 142 · glisser pour les suivantes"),
    ).toBeInTheDocument();
    expect(within(dialogue).getByText("total 710 000")).toBeInTheDocument();
  });
});

describe("ComptableApercu · états", () => {
  it("chargement : des repères gris, pas de tableau, Fermer et Envoyer restent utilisables", async () => {
    const client = avecApercu(() => new Promise<Apercu>(() => {}));
    rendre({ client });
    await waitFor(() => expect(racine()).toHaveAttribute("data-etat", "chargement"));
    expect(screen.getByRole("dialog", { name: "Aperçu d'un export" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Chargement de l'aperçu");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Télécharger" })).toBeNull();
    expect(fenetre().querySelectorAll("[aria-hidden='true'].am-pulse").length).toBeGreaterThan(8);
    expect(within(fenetre()).getByRole("link", { name: "Fermer" })).toHaveAttribute(
      "href",
      "/comptable",
    );
    expect(within(fenetre()).getByRole("link", { name: "Envoyer au cabinet" })).toHaveAttribute(
      "href",
      "/comptable/cloture",
    );
  });

  it("erreur : le dit, propose Réessayer et recharge l'aperçu", async () => {
    const client = avecApercu((r, appel) => {
      if (appel === 1) throw new ErreurReseau("coupure");
      return r;
    });
    rendre({ client });
    expect(await screen.findByRole("alert")).toHaveTextContent("L'aperçu ne s'est pas chargé.");
    expect(racine()).toHaveAttribute("data-etat", "erreur");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Télécharger" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Télécharger" })).toBeInTheDocument();
  });

  it("export sans aucune ligne : le dit, garde l'en-tête, sans tableau ni Télécharger", async () => {
    const client = avecApercu((r) => ({
      ...r,
      export: { ...r.export, lignes: 0 },
      tableau: { ...r.tableau, lignes: [], derniere: 1, total: 0, totalMontant: 0 },
    }));
    rendre({ client });
    expect(
      (await screen.findByText("Cet export ne contient aucune ligne.")).closest("[role='status']"),
    ).not.toBeNull();
    expect(racine()).toHaveAttribute("data-etat", "vide");
    expect(screen.getByRole("dialog", { name: planche.export.nom })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Télécharger" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(within(fenetre()).getByRole("link", { name: "Envoyer au cabinet" })).toBeInTheDocument();
  });

  it("un export dont l'aperçu n'existe pas (404) n'est pas une panne : pas de Réessayer", async () => {
    const client = avecApercu(() => {
      throw new ErreurHttp(404, "Introuvable", "APERCU_INDISPONIBLE");
    });
    rendre({ client });
    expect(
      (await screen.findByText("Cet aperçu n'est pas disponible pour cet export.")).closest(
        "[role='status']",
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Télécharger" })).toBeNull();
    expect(within(fenetre()).getByRole("link", { name: "Fermer" })).toBeInTheDocument();
  });

  it("avec le mock de démo, les exports autres que le journal des ventes n'ont pas d'aperçu : introuvable", async () => {
    rendre({ url: "/comptable/apercu/journal_caisse" });
    expect(
      await screen.findByText("Cet aperçu n'est pas disponible pour cet export."),
    ).toBeInTheDocument();
    expect(racine()).toHaveAttribute("data-etat", "introuvable");
  });

  it("un identifiant qui n'est pas celui d'un export n'appelle pas l'API", async () => {
    let appels = 0;
    const client = avecApercu((r) => {
      appels += 1;
      return r;
    });
    const { routeur } = rendre({ client, url: "/comptable/apercu/exp-2026-12" });
    expect(
      await screen.findByText("Cet aperçu n'est pas disponible pour cet export."),
    ).toBeInTheDocument();
    expect(appels).toBe(0);
    await userEvent.click(within(fenetre()).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });
});

describe("ComptableApercu · textes", () => {
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
