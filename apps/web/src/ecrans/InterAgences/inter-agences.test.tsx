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
import { heureDouala, jourSemaine, montant, montantSigne, tonMontant, tonTroncon } from "./formats";
import fr from "./i18n.fr.json";
import type { VueInterAgences } from "./types";

const planche = ecrans.InterAgences.donnees;

function rendre(options: { clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "InterAgences",
    url: "/inter-agences",
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText(planche.colis.regle);
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function pied(): HTMLElement {
  return principal().nextElementSibling as HTMLElement;
}

function cartes() {
  return {
    colis: screen.getByRole("region", { name: /· colis C-/ }),
    reglement: screen.getByRole("region", { name: "Règlement entre compagnies · semaine" }),
    voyageurs: screen.getByRole("region", { name: "Aussi pour les voyageurs" }),
  };
}

type Impl = Scenario["operations"][number];

/** Le client du mock, dont la lecture « Entre compagnies » est retouchée avant d'être rendue. */
function clientAvecVue(modifier: (vue: VueInterAgences) => VueInterAgences) {
  return remplacerLecture((impl) =>
    implementer(patron.OP_INTER_AGENCES, async (params, ctx) => {
      const vue = (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
        params,
        ctx,
      )) as VueInterAgences;
      return modifier(vue);
    }),
  );
}

function remplacerLecture(fabrique: (impl: Impl) => Impl): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((impl) =>
          impl.operation.nom === patron.OP_INTER_AGENCES.nom ? fabrique(impl) : impl,
        ),
      };
    },
  };
  return creerClientMock({ source, scenario: "InterAgences", latenceMs: 0 });
}

describe("InterAgences · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, sous-titre et retour", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(planche.titre);
    expect(screen.getByText(planche.sousTitre)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("affiche le colis : trajet, numéro, poids, règle de responsabilité", async () => {
    rendre();
    await attendreEcran();
    const { colis } = cartes();
    expect(within(colis).getByRole("heading", { level: 2 })).toHaveTextContent(planche.colis.titre);
    expect(colis).toHaveTextContent("3 kg");
    expect(within(colis).getByText(planche.colis.regle)).toBeInTheDocument();
    // « La responsabilité passe au scan » : la règle de l'API le dit en toutes lettres.
    expect(colis).toHaveTextContent("remis à Oméga");
    expect(colis).toHaveTextContent("reçu");
    expect(colis).toHaveTextContent("La responsabilité passe au scan.");
  });

  it("affiche les deux tronçons : compagnie, trajet, horaire, bus et part de chacun", async () => {
    rendre();
    await attendreEcran();
    const troncons = within(cartes().colis).getAllByRole("listitem");
    expect(troncons).toHaveLength(2);
    planche.colis.troncons.forEach((attendu, i) => {
      const t = troncons[i]!;
      expect(t).toHaveTextContent(attendu.libelle);
      expect(t).toHaveTextContent(attendu.trajet);
      expect(t).toHaveTextContent(attendu.horaire);
      expect(t).toHaveTextContent(attendu.part);
    });
    expect(troncons[0]).toHaveTextContent("Tronçon 1 · Alpha");
    expect(troncons[0]).toHaveTextContent("Douala → Bafoussam");
    expect(troncons[0]).toHaveTextContent("08:15 · LT 118 AB · arrivée 13:00");
    expect(troncons[0]).toHaveTextContent("1 500 · pour Alpha");
    expect(troncons[1]).toHaveTextContent("Tronçon 2 · Oméga");
    expect(troncons[1]).toHaveTextContent("14:00 · OU 302 NW · arrivée 16:30");
    expect(troncons[1]).toHaveTextContent("1 200 · pour Oméga");
  });

  it("colore les tronçons (Alpha en ambre, Oméga en bleu) et pose le rond de passage entre les deux", async () => {
    rendre();
    await attendreEcran();
    const etiquettes = within(cartes().colis)
      .getAllByRole("listitem")
      .map((t) => t.querySelector("[data-ton]")?.getAttribute("data-ton"));
    expect(etiquettes).toEqual(["ambre", "bleu"]);
    const ronds = cartes().colis.querySelectorAll("[data-passage]");
    expect(ronds).toHaveLength(1);
    expect((ronds[0] as HTMLElement).style.left).toBe("50%");
    expect(ronds[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("affiche le règlement de la semaine : dû, à devoir, solde net, jour et heure", async () => {
    rendre();
    await attendreEcran();
    const { reglement } = cartes();
    expect(reglement).toHaveTextContent("lundi");
    const lignes = within(reglement).getAllByRole("listitem");
    expect(lignes).toHaveLength(3);
    planche.reglement.lignes.forEach((attendue, i) => {
      expect(lignes[i]).toHaveTextContent(attendue.libelle);
      expect(lignes[i]).toHaveTextContent(montantSigne(attendue.montant));
    });
    expect(lignes[0]).toHaveTextContent("Oméga te doit · 14 colis transportés pour eux+ 19 500");
    expect(lignes[1]).toHaveTextContent("Tu dois à Oméga · 6 colis en correspondance− 7 200");
    expect(lignes[2]).toHaveTextContent("Solde net · réglé par MoMo lundi 08:00+ 12 300");
  });

  it("colore les montants : vert pour ce qu'on nous doit, rouge pour ce que nous devons, vert pour le solde", async () => {
    rendre();
    await attendreEcran();
    const tons = within(cartes().reglement)
      .getAllByRole("listitem")
      .map((l) => l.querySelector("[class*='somme']")?.getAttribute("data-ton"));
    expect(tons).toEqual(["vert", "rouge", "vert"]);
  });

  it("affiche le billet voyageur en correspondance avec les minutes de l'API", async () => {
    rendre();
    await attendreEcran();
    const { voyageurs } = cartes();
    expect(within(voyageurs).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Aussi pour les voyageurs",
    );
    expect(voyageurs).toHaveTextContent(planche.voyageurs.texte.replace(/'/g, "’"));
    expect(voyageurs).toHaveTextContent("correspondance de 25 min garantie");
    expect(voyageurs).toHaveTextContent("le second attend 15 min");
  });
});

describe("InterAgences · navigation identique à la maquette", () => {
  it("« Retour » mène à Patron (/aujourdhui)", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", "/aujourdhui");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
  });

  it("« Convention Oméga · voir » mène à la convention de l'API", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = within(pied()).getByRole("link", { name: planche.actions[0]! });
    expect(lien).toHaveAttribute("href", "/inter-agences/convention/convention-alpha-omega");
    await userEvent.click(lien);
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe(
        "/inter-agences/convention/convention-alpha-omega",
      ),
    );
  });

  it("« Ajouter une compagnie » mène au réseau (/reseau)", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const lien = within(pied()).getByRole("link", { name: planche.actions[1]! });
    expect(lien).toHaveAttribute("href", "/reseau");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reseau"));
  });

  it("n'écrit rien : que des liens, aucun bouton ni élément grisé, rien de « bientôt »", async () => {
    rendre();
    await attendreEcran();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    for (const a of screen.getAllByRole("link")) {
      expect(a).not.toHaveAttribute("aria-disabled");
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^\/[a-z]/);
    }
    expect(document.body).not.toHaveTextContent(/bientôt/i);
  });
});

describe("InterAgences · les données de l'API font l'écran", () => {
  it("écrit le colis, les tronçons et les parts de l'API", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        colisEnCorrespondance: {
          ...vue.colisEnCorrespondance,
          numero: "C-ALP-DLA-270105-0099",
          poidsKg: 12,
          troncons: vue.colisEnCorrespondance.troncons.map((t, i) =>
            i === 0 ? { ...t, bus: "XX 001 YY", heureDepart: "09:05", part: 12_500 } : t,
          ),
        },
      })),
    });
    await attendreEcran();
    const { colis } = cartes();
    expect(colis).toHaveTextContent("Douala → Bamenda · colis C-ALP-DLA-270105-0099");
    expect(colis).toHaveTextContent("12 kg");
    const premier = within(colis).getAllByRole("listitem")[0]!;
    expect(premier).toHaveTextContent("09:05 · XX 001 YY · arrivée 13:00");
    expect(premier).toHaveTextContent("12 500 · pour Alpha");
  });

  it("trois tronçons : trois colonnes, deux ronds de passage, couleurs en alternance", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => {
        const [un, deux] = vue.colisEnCorrespondance.troncons as [
          VueInterAgences["colisEnCorrespondance"]["troncons"][number],
          VueInterAgences["colisEnCorrespondance"]["troncons"][number],
        ];
        return {
          ...vue,
          colisEnCorrespondance: {
            ...vue.colisEnCorrespondance,
            troncons: [un, deux, { ...un, rang: 3, compagnie: "Delta", part: 900 }],
          },
        };
      }),
    });
    await attendreEcran();
    const troncons = within(cartes().colis).getAllByRole("listitem");
    expect(troncons).toHaveLength(3);
    expect(troncons.map((t) => t.querySelector("[data-ton]")?.getAttribute("data-ton"))).toEqual([
      "ambre",
      "bleu",
      "ambre",
    ]);
    const ronds = Array.from(cartes().colis.querySelectorAll<HTMLElement>("[data-passage]"));
    expect(ronds.map((r) => Number.parseFloat(r.style.left))).toEqual([
      expect.closeTo(100 / 3, 3),
      expect.closeTo(200 / 3, 3),
    ]);
    expect(troncons[2]).toHaveTextContent("900 · pour Delta");
  });

  it("le règlement suit l'API : compagnie, nombres de colis, sommes, jour et heure de paiement", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        reglement: {
          autreCompagnie: "Delta",
          nousDoit: 4000,
          nbColisTransportesPourEux: 1,
          nousLeDevons: 9500,
          nbColisEnCorrespondance: 3,
          soldeNet: -5500,
          reglementA: "2027-01-12T17:30:00.000+01:00",
        },
      })),
    });
    await attendreEcran();
    const { reglement } = cartes();
    expect(reglement).toHaveTextContent("mardi");
    const lignes = within(reglement).getAllByRole("listitem");
    // Un seul colis : « transporté » au singulier.
    expect(lignes[0]).toHaveTextContent("Delta te doit · 1 colis transporté pour eux+ 4 000");
    expect(lignes[1]).toHaveTextContent("Tu dois à Delta · 3 colis en correspondance− 9 500");
    expect(lignes[2]).toHaveTextContent("Solde net · réglé par MoMo mardi 17:30− 5 500");
    expect(lignes[2]!.querySelector("[class*='somme']")).toHaveAttribute("data-ton", "rouge");
  });

  it("la correspondance des voyageurs suit l'API et les compagnies des tronçons", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        correspondanceVoyageurs: { minutesGaranties: 40, attenteDuSecondBusMinutes: 20 },
        colisEnCorrespondance: {
          ...vue.colisEnCorrespondance,
          troncons: vue.colisEnCorrespondance.troncons.map((t) =>
            t.rang === 2 ? { ...t, compagnie: "Delta" } : t,
          ),
        },
      })),
    });
    await attendreEcran();
    const { voyageurs } = cartes();
    expect(voyageurs).toHaveTextContent("Alpha jusqu’à Bafoussam, Delta ensuite");
    expect(voyageurs).toHaveTextContent("correspondance de 40 min garantie");
    expect(voyageurs).toHaveTextContent("le second attend 20 min");
  });

  it("le lien de la convention porte le nom de la compagnie et l'identifiant de l'API", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        conventions: [{ id: "conv-delta-1", avec: "Delta", statut: "active" as const }],
      })),
    });
    await attendreEcran();
    expect(within(pied()).getByRole("link", { name: "Convention Delta · voir" })).toHaveAttribute(
      "href",
      "/inter-agences/convention/conv-delta-1",
    );
  });

  it("sans convention, seul « Ajouter une compagnie » reste dans le pied", async () => {
    rendre({ clientApi: clientAvecVue((vue) => ({ ...vue, conventions: [] })) });
    await attendreEcran();
    const liens = within(pied()).getAllByRole("link");
    expect(liens.map((l) => l.textContent)).toEqual(["Ajouter une compagnie"]);
    expect(pied()).toHaveAttribute("data-seul");
  });

  it("deux conventions : un lien chacune, « Ajouter une compagnie » en dernier", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        conventions: [
          ...vue.conventions,
          { id: "conv-delta-1", avec: "Delta", statut: "active" as const },
        ],
      })),
    });
    await attendreEcran();
    expect(
      within(pied())
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Convention Oméga · voir", "Convention Delta · voir", "Ajouter une compagnie"]);
  });

  it("sans tronçon, le colis le dit et le billet voyageur n'est pas affiché", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        colisEnCorrespondance: { ...vue.colisEnCorrespondance, troncons: [] },
      })),
    });
    await screen.findByText("Aucun colis en correspondance pour le moment.");
    expect(screen.queryByRole("region", { name: "Aussi pour les voyageurs" })).toBeNull();
    expect(screen.getByRole("region", { name: /Règlement entre compagnies/ })).toBeInTheDocument();
  });
});

describe("InterAgences · chargement, vide, erreur", () => {
  it("chargement : des blocs qui pulsent, retour et ajout utilisables", async () => {
    const client = remplacerLecture(() =>
      implementer(patron.OP_INTER_AGENCES, () => new Promise<never>(() => {})),
    );
    rendre({ clientApi: client });
    const corps = await screen.findByRole("main", {
      name: "Chargement des échanges entre compagnies",
    });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(corps.querySelectorAll("[class*='squelette'].am-pulse")).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Entre compagnies");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    expect(within(pied()).getByRole("link", { name: "Ajouter une compagnie" })).toHaveAttribute(
      "href",
      "/reseau",
    );
    expect(within(pied()).queryByText(/Convention/)).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer qui relit, puis l'écran complet", async () => {
    let appels = 0;
    const client = remplacerLecture((impl) =>
      implementer(patron.OP_INTER_AGENCES, (params, ctx) => {
        appels += 1;
        if (appels === 1) throw new ErreurReseau("coupure");
        return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
      }),
    );
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(
      "Les échanges entre compagnies ne se sont pas chargés. Les raccourcis restent utilisables.",
    );
    expect(within(pied()).getByRole("link", { name: "Ajouter une compagnie" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(appels).toBe(2);
  });

  it("vide : ni tronçon ni convention, un message et le raccourci d'ajout", async () => {
    rendre({
      clientApi: clientAvecVue((vue) => ({
        ...vue,
        conventions: [],
        colisEnCorrespondance: { ...vue.colisEnCorrespondance, troncons: [] },
      })),
    });
    const message = await screen.findByText("Aucun échange entre compagnies pour le moment.");
    expect(message.closest("[role='status']")).not.toBeNull();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(within(pied()).getByRole("link", { name: "Ajouter une compagnie" })).toBeInTheDocument();
  });
});

describe("InterAgences · textes", () => {
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

describe("InterAgences · fonctions pures", () => {
  it("montant : groupes de trois chiffres séparés par une espace, sans signe", () => {
    expect(montant(0)).toBe("0");
    expect(montant(950)).toBe("950");
    expect(montant(1500)).toBe("1 500");
    expect(montant(1_412_000)).toBe("1 412 000");
    expect(montant(-7200)).toBe("7 200");
  });

  it("montantSigne : plus, vrai signe moins avec une espace, zéro nu", () => {
    expect(montantSigne(19_500)).toBe("+ 19 500");
    expect(montantSigne(-7200)).toBe("− 7 200");
    expect(montantSigne(0)).toBe("0");
  });

  it("heureDouala : lit l'heure écrite dans l'ISO, sans passer par le fuseau du navigateur", () => {
    expect(heureDouala("2027-01-11T08:00:00.000+01:00")).toBe("08:00");
    expect(heureDouala("2027-01-11T23:45:00.000+01:00")).toBe("23:45");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("jourSemaine : le jour de Douala (0 dimanche … 6 samedi)", () => {
    expect(jourSemaine("2027-01-11T08:00:00.000+01:00")).toBe(1);
    expect(jourSemaine("2027-01-05T00:30:00.000+01:00")).toBe(2);
    expect(jourSemaine("2027-01-10T23:59:00.000+01:00")).toBe(0);
    expect(jourSemaine("2027-01-09T12:00:00.000+01:00")).toBe(6);
  });

  it("tonTroncon : premier en ambre, deuxième en bleu, puis en alternance", () => {
    expect([1, 2, 3, 4].map(tonTroncon)).toEqual(["ambre", "bleu", "ambre", "bleu"]);
  });

  it("tonMontant : vert quand on nous doit, rouge quand nous devons, neutre à zéro", () => {
    expect(tonMontant(12_300)).toBe("vert");
    expect(tonMontant(-7200)).toBe("rouge");
    expect(tonMontant(0)).toBe("neutre");
  });
});
