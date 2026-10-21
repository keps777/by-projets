import {
  ErreurHttp,
  ErreurReseau,
  colis,
  creerClientMock,
  implementer,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { urlPlanche } from "@/coquille/planches";
import { rendreApp } from "@/test/rendre";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const planche = ecrans.InterAgencesConvention.donnees;
const ID = "convention-alpha-omega";

type Convention = contrats.Convention;

function rendre(options: { id?: string; clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "InterAgencesConvention",
    url: `/inter-agences/convention/${options.id ?? ID}`,
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Les 5 règles");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Remplace la réponse de la convention, en gardant celle du mock pour le reste. `appel` compte les lectures. */
function avecConvention(
  transformer: (reponse: Convention, appel: number) => Convention | Promise<Convention>,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  let appel = 0;
  const source: SourceScenarios = {
    ...base,
    charger: async (nom): Promise<Scenario> => {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((impl) =>
          impl.operation.nom === colis.OP_CONVENTION_INTER_AGENCES.nom
            ? implementer(impl.operation, async (params, ctx) => {
                appel += 1;
                const reponse = await (impl.repondre as (p: unknown, c: unknown) => unknown)(
                  params,
                  ctx,
                );
                return transformer(reponse as Convention, appel);
              })
            : impl,
        ),
      };
    },
  };
  return creerClientMock({ source, scenario: "InterAgencesConvention", latenceMs: 0 });
}

function tuile(etiquette: string): HTMLElement {
  return screen.getByText(etiquette).parentElement as HTMLElement;
}

describe("InterAgencesConvention · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, date de signature, renouvellement, pastille ACTIVE et retour", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 1, name: "Convention Alpha – Oméga" }),
    ).toBeInTheDocument();
    expect(screen.getByText(planche.detail)).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/inter-agences");
  });

  it("tronçons et parts : une part par compagnie, « — » sans part, total sous un trait", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Tronçons et parts")).toBeInTheDocument();
    expect(screen.getByText("colis · 3 kg type")).toBeInTheDocument();
    const tableau = screen.getByRole("table", { name: "Tronçons et parts" });
    const lignes = within(tableau)
      .getAllByRole("row")
      .map((ligne) =>
        Array.from(
          ligne.querySelectorAll("[role='cell'], [role='columnheader'], [role='rowheader']"),
        ).map((c) => c.textContent),
      );
    expect(lignes).toEqual([
      ["tronçon", "Alpha", "Oméga"],
      ["Douala → Bafoussam", "1 400", "—"],
      ["Bafoussam → Bamenda", "—", "1 200"],
      ["Transbordement à Bafoussam", "200", "200"],
      ["Client paie 3 000 · AfriMove 150 (payé par l'émetteur)", "1 600", "1 400"],
    ]);
    // Alpha en ambre, Oméga en bleu, l'absence de part en gris.
    const cellules = within(tableau).getAllByRole("cell");
    expect(cellules[1]!.className).toMatch(/premiere/);
    expect(cellules[2]!.className).toMatch(/sansPart/);
    expect(cellules[4]!.className).toMatch(/sansPart/);
    expect(cellules[5]!.className).toMatch(/seconde/);
  });

  it("liste les 5 règles, chacune avec son rang et son titre en gras", async () => {
    rendre();
    await attendreEcran();
    const bloc = screen.getByRole("region", { name: "Les 5 règles" });
    const regles = within(bloc).getAllByRole("listitem");
    expect(regles).toHaveLength(5);
    planche.regles.liste.forEach((regle, i) => {
      expect(regles[i]).toHaveTextContent(`${regle.titre} ${regle.texte}`);
      expect(within(regles[i]!).getByText(regle.titre).tagName).toBe("STRONG");
    });
    expect(regles[0]).toHaveTextContent("1 · Responsabilité au scan.");
    expect(regles[3]).toHaveTextContent("personne ne voit les ventes de l'autre");
  });

  it("montre les signatures par PIN des deux patrons : « Toi » pour le patron connecté", async () => {
    rendre();
    await attendreEcran();
    expect(tuileSignature("Signé pour Alpha")).toHaveTextContent(
      "Toi · PIN patron · 12 oct. 09:40",
    );
    expect(tuileSignature("Signé pour Oméga")).toHaveTextContent(
      "E. Tchoua · PIN patron · 12 oct. 11:05",
    );
  });

  it("chiffres du trimestre : 184 colis, 1 litige réglé en 2 jours en vert, + 131 k en 12 lundis", async () => {
    rendre();
    await attendreEcran();
    expect(tuile("Trimestre")).toHaveTextContent("Trimestre184colis échangés");
    expect(tuile("Litiges")).toHaveTextContent("Litiges1réglé en 2 jours");
    expect(within(tuile("Litiges")).getByText("1").className).toMatch(/vert/);
    expect(tuile("Net reçu")).toHaveTextContent("Net reçu+ 131 k12 lundis");
    expect(within(tuile("Net reçu")).getByText("+ 131 k").className).toMatch(/vert/);
    expect(screen.getByText(planche.pied)).toBeInTheDocument();
  });
});

function tuileSignature(libelle: string): HTMLElement {
  return screen.getByText(libelle).parentElement as HTMLElement;
}

describe("InterAgencesConvention · navigation", () => {
  it("« Historique · règlements » mène au Comptable, « Retour · entre compagnies » à InterAgences", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Historique · règlements" })).toHaveAttribute(
      "href",
      urlPlanche("Comptable"),
    );
    expect(screen.getByRole("link", { name: "Retour · entre compagnies" })).toHaveAttribute(
      "href",
      urlPlanche("InterAgences"),
    );
    expect(urlPlanche("Comptable")).toBe("/comptable");
    expect(urlPlanche("InterAgences")).toBe("/inter-agences");
  });

  it("« Retour » ramène à InterAgences", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/inter-agences"));
  });

  it("« Historique · règlements » ouvre le Comptable", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Historique · règlements" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable"));
  });
});

describe("InterAgencesConvention · autres valeurs du contrat", () => {
  it("convention suspendue : pastille ambre SUSPENDUE ; résiliée : RÉSILIÉE", async () => {
    rendre({ clientApi: avecConvention((c) => ({ ...c, statut: "suspendue" })) });
    await attendreEcran();
    expect(screen.queryByText("ACTIVE")).toBeNull();
    expect(screen.getByText("SUSPENDUE").className).toMatch(/ton-ambre/);
  });

  it("convention résiliée : pastille rouge RÉSILIÉE", async () => {
    rendre({ clientApi: avecConvention((c) => ({ ...c, statut: "resiliee" })) });
    await attendreEcran();
    expect(screen.getByText("RÉSILIÉE").className).toMatch(/ton-rouge/);
  });

  it("le signataire est nommé quand ce n'est pas le patron connecté, « Toi » seulement si `moi`", async () => {
    rendre({
      clientApi: avecConvention((c) => ({
        ...c,
        signatures: [
          { ...c.signatures[0]!, signataire: "J. Kamga", moi: false },
          { ...c.signatures[1]!, signataire: "E. Tchoua", moi: true },
        ],
      })),
    });
    await attendreEcran();
    expect(tuileSignature("Signé pour Alpha")).toHaveTextContent(
      "J. Kamga · PIN patron · 12 oct. 09:40",
    );
    expect(tuileSignature("Signé pour Oméga")).toHaveTextContent(
      "Toi · PIN patron · 12 oct. 11:05",
    );
  });

  it("un litige encore ouvert est dit en cours, en ambre ; sans litige : aucun litige", async () => {
    rendre({
      clientApi: avecConvention((c) => ({
        ...c,
        trimestre: { ...c.trimestre, litiges: 2, delaiLitigeJours: null },
      })),
    });
    await attendreEcran();
    expect(tuile("Litiges")).toHaveTextContent("Litiges2en cours");
    expect(within(tuile("Litiges")).getByText("2").className).toMatch(/ambre/);
  });

  it("aucun litige : le dit, en vert", async () => {
    rendre({
      clientApi: avecConvention((c) => ({
        ...c,
        trimestre: { ...c.trimestre, litiges: 0, delaiLitigeJours: null },
      })),
    });
    await attendreEcran();
    expect(tuile("Litiges")).toHaveTextContent("Litiges0aucun litige");
    expect(within(tuile("Litiges")).getByText("0").className).toMatch(/vert/);
  });

  it("net négatif : montant en rouge avec le signe moins ; un seul colis et un seul lundi au singulier", async () => {
    rendre({
      clientApi: avecConvention((c) => ({
        ...c,
        trimestre: { ...c.trimestre, netRecu: -8000, colisEchanges: 1, lundis: 1 },
      })),
    });
    await attendreEcran();
    expect(within(tuile("Net reçu")).getByText("− 8 k").className).toMatch(/rouge/);
    expect(tuile("Net reçu")).toHaveTextContent("1 lundi");
    expect(tuile("Net reçu")).not.toHaveTextContent("1 lundis");
    expect(tuile("Trimestre")).toHaveTextContent("colis échangé");
    expect(tuile("Trimestre")).not.toHaveTextContent("colis échangés");
  });

  it("les parts suivent les compagnies de la convention, pas des noms écrits dans l'écran", async () => {
    rendre({
      clientApi: avecConvention((c) => ({
        ...c,
        parts: {
          ...c.parts,
          entetes: ["tronçon", "Bêta", "Gamma"],
          lignes: [{ troncon: "Yaoundé → Bertoua", parts: { Bêta: 900, Gamma: null } }],
          total: { ...c.parts.total, parts: { Bêta: 900, Gamma: 2100 } },
        },
      })),
    });
    await attendreEcran();
    const tableau = screen.getByRole("table", { name: "Tronçons et parts" });
    expect(
      within(tableau)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual(["tronçon", "Bêta", "Gamma"]);
    expect(within(tableau).getByText("Yaoundé → Bertoua").parentElement).toHaveTextContent(
      "Yaoundé → Bertoua900—",
    );
    expect(within(tableau).getByText("2 100")).toBeInTheDocument();
  });
});

describe("InterAgencesConvention · états chargement, vide, erreur", () => {
  it("chargement : des repères gris à la place des blocs, la mise en page tient, la navigation reste utilisable", async () => {
    rendre({ clientApi: avecConvention(() => new Promise<Convention>(() => {})) });
    const corps = await waitFor(() => {
      const main = principal();
      expect(main).toHaveAttribute("data-etat", "chargement");
      return main;
    });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(corps).toHaveAttribute("aria-label", "Chargement de la convention");
    expect(
      screen.getByRole("heading", { level: 1, name: "Convention entre compagnies" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/inter-agences");
    expect(screen.getByRole("link", { name: "Historique · règlements" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour · entre compagnies" })).toBeInTheDocument();
    expect(screen.queryByText("Les 5 règles")).toBeNull();
    expect(screen.queryByText("ACTIVE")).toBeNull();
    expect(corps.querySelectorAll("[aria-hidden='true'].am-pulse").length).toBeGreaterThan(8);
  });

  it("erreur : le dit, propose Réessayer et recharge l'écran", async () => {
    rendre({
      clientApi: avecConvention((c, appel) => {
        if (appel === 1) throw new ErreurReseau("coupure");
        return c;
      }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La convention ne s'est pas chargée.",
    );
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.queryByText("Les 5 règles")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("une convention inconnue (404 du mock) est un état vide, pas une panne", async () => {
    rendre({ id: "convention-inconnue" });
    expect(
      (await screen.findByText("Cette convention est introuvable.")).closest("[role='status']"),
    ).not.toBeNull();
    expect(principal()).toHaveAttribute("data-etat", "vide");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("un 404 venu du serveur est aussi un état vide", async () => {
    rendre({
      clientApi: avecConvention(() => {
        throw new ErreurHttp(404, "Introuvable", "convention_introuvable");
      }),
    });
    expect(await screen.findByText("Cette convention est introuvable.")).toBeInTheDocument();
  });
});

describe("InterAgencesConvention · textes", () => {
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
