import { ErreurHttp, colis, implementer, type Operation } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreVendeur, transformer, type OptionsRenduVendeur } from "./rendre-vendeur";

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** Attend que les trois blocs de données soient affichés. */
async function attendreEcran() {
  await screen.findByRole("link", { name: /^08:30 Alpha Voyages/ });
  await screen.findByText("83");
  await screen.findByRole("link", { name: /^Mme Ebogo/ });
}

const lienDepart = (nom: RegExp) => screen.getByRole("link", { name: nom });
const lienClient = (nom: RegExp) => screen.getByRole("link", { name: nom });
const grandBouton = () => screen.getByRole("link", { name: "Vendre un billet à un voisin" });

/** Départs de démonstration : leurs identifiants sont ceux des fixtures. */
const [ALPHA, BETA] = ecrans.Vendeur.entites.departs ?? [];
const ALPHA_ID = ALPHA?.id ?? "";
const BETA_ID = BETA?.id ?? "";

const departs = (
  modifier: (
    liste: contrats.DepartVendeur[],
    reponse: contrats.DepartsVendeur,
  ) => Partial<contrats.DepartsVendeur>,
): NonNullable<OptionsRenduVendeur["operations"]> => {
  return (originale) => [
    transformer(colis.OP_DEPARTS_VENDEUR, originale, (r) => ({
      ...r,
      ...modifier(r.departs, r),
    })),
  ];
};

const clientsDe = (
  modifier: (liste: contrats.ClientVendeur[]) => contrats.ClientVendeur[],
): NonNullable<OptionsRenduVendeur["operations"]> => {
  return (originale) => [
    transformer(colis.OP_CLIENTS_VENDEUR, originale, (r) => ({
      ...r,
      clients: modifier(r.clients),
    })),
  ];
};

/** Une réponse sans le départ proposé (ancienne réponse) : l'écran se rabat sur l'heure de la proposition. */
const sansDepartId = (client: contrats.ClientVendeur): contrats.ClientVendeur => {
  const { departId: _departId, ...reste } = client;
  return reste;
};

const espaceDe = (
  modifier: (espace: contrats.EspaceVendeur) => contrats.EspaceVendeur,
): NonNullable<OptionsRenduVendeur["operations"]> => {
  return (originale) => [transformer(colis.OP_ESPACE_VENDEUR, originale, (r) => modifier(r))];
};

const enPanne =
  <P, R>(operation: Operation<P, R>) =>
  () => [
    implementer(operation, () => {
      throw new ErreurHttp(500, "Panne", "panne");
    }),
  ];

describe("Vendeur · données de démonstration", () => {
  it("les deux départs proposés sont ceux des fixtures", () => {
    expect(ALPHA_ID).not.toBe("");
    expect(BETA_ID).not.toBe("");
    expect(ALPHA_ID).not.toBe(BETA_ID);
  });
});

describe("Vendeur · rendu de la planche", () => {
  it("affiche l'en-tête, la vente, les chiffres du mois, les clients, la règle et le bouton de la planche", async () => {
    rendreVendeur();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "Vendeur ambulant · commission" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Vendeur AfriMove")).toBeInTheDocument();
    expect(
      screen.getByText("Nadège · quartier Ndokoti · agréée par Alpha et Bêta"),
    ).toBeInTheDocument();
    expect(screen.getByText("n° V-0412")).toBeInTheDocument();

    const vente = screen.getByRole("region", { name: "Vendre à un voisin · 3 touches" });
    expect(within(vente).getByText("commission 100 F / billet")).toBeInTheDocument();
    expect(vente).toHaveTextContent("Douala → Yaoundé");
    expect(within(vente).getByText("demain")).toBeInTheDocument();
    expect(
      within(vente)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual([
      "08:30Alpha Voyages · 18 placesle voisin paie cash, je paie MoMo, il reçoit le SMS4 000",
      "08:00Bêta Express VIP · 9 placescommission 150 F7 500",
    ]);

    expect(screen.getByText("Ce mois").parentElement).toHaveTextContent("Ce mois83billets vendus");
    expect(screen.getByText("Gagné").parentElement).toHaveTextContent("Gagné9 350versé le lundi");
    expect(screen.getByText("Clients").parentElement).toHaveTextContent(
      "Clients41dont 12 réguliers",
    );

    const clients = screen.getByRole("region", { name: "Mes clients · revendre en 1 touche" });
    expect(
      within(clients)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual([
      "Mme Ebogo · Yaoundé chaque vendredi · 6 70 …vendredi 08:30 ?",
      "Pasteur Nkou · Bafoussam · 6 94 …dernier : 28 déc.",
    ]);

    expect(
      screen.getByText(
        "Le billet est au nom du voisin, pas au tien. Tu ne gardes jamais d'argent : le voisin paie, tu paies l'agence par MoMo dans la minute, la commission arrive le lundi.",
      ),
    ).toBeInTheDocument();
    expect(grandBouton()).toBeInTheDocument();
  });

  it("met le gain en vert et le premier départ en avant", async () => {
    rendreVendeur();
    await attendreEcran();
    expect(screen.getByText("9 350")).toHaveAttribute("data-ton", "vert");
    expect(screen.getByText("83")).not.toHaveAttribute("data-ton");
    expect(lienDepart(/^08:30/)).toHaveAttribute("data-premier", "true");
    expect(lienDepart(/^08:00/)).toHaveAttribute("data-premier", "false");
  });

  it("n'a aucun bouton grisé ni badge de conception, et ne promet rien « bientôt »", async () => {
    rendreVendeur({ conception: true });
    await attendreEcran();
    for (const b of screen.queryAllByRole("button")) expect(b).toBeEnabled();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bientôt/i)).not.toBeInTheDocument();
  });

  it("accorde « dont … régulier » et « … place » au singulier", async () => {
    rendreVendeur({
      operations: (originale) => [
        ...espaceDe((e) => ({ ...e, bilan: { ...e.bilan, clientsReguliers: 1 } }))(originale),
        ...departs((liste) => ({ departs: liste.map((d) => ({ ...d, placesLibres: 1 })) }))(
          originale,
        ),
      ],
    });
    await attendreEcran();
    expect(screen.getByText("dont 1 régulier")).toBeInTheDocument();
    expect(screen.getByText("Alpha Voyages · 1 place")).toBeInTheDocument();
  });

  it("lit le nom du vendeur, son quartier et ses compagnies dans l'espace du vendeur", async () => {
    rendreVendeur({
      operations: espaceDe((e) => ({
        ...e,
        vendeur: {
          ...e.vendeur,
          nom: "Paul",
          numero: "V-0007",
          quartier: "Bonabéri",
          compagnies: ["Alpha", "Bêta", "Gamma"],
        },
      })),
    });
    await attendreEcran();
    expect(
      screen.getByText("Paul · quartier Bonabéri · agréée par Alpha, Bêta et Gamma"),
    ).toBeInTheDocument();
    expect(screen.getByText("n° V-0007")).toBeInTheDocument();
  });

  it("ajoute « VIP » au nom d'une compagnie VIP qui ne le dit pas déjà", async () => {
    rendreVendeur({
      operations: departs((liste) => ({
        departs: liste.map((d) => ({ ...d, compagnie: d.compagnie.replace(/ VIP$/, "") })),
      })),
    });
    await attendreEcran();
    expect(screen.getByText("Bêta Express VIP · 9 places")).toBeInTheDocument();
    expect(screen.getByText("Alpha Voyages · 18 places")).toBeInTheDocument();
  });

  it("écrit la commission d'un départ qui n'a pas la commission par défaut, et la phrase du paiement sinon", async () => {
    rendreVendeur({
      operations: departs((liste) => ({
        departs: liste.map((d) => ({ ...d, commission: d.departId === ALPHA_ID ? 200 : 100 })),
      })),
    });
    await attendreEcran();
    // 200 F ≠ 100 F (par défaut) : « commission 200 F » à la place de la phrase ; 100 F : la commission, pas la phrase (2e ligne).
    expect(lienDepart(/^08:30/)).toHaveTextContent("commission 200 F");
    expect(lienDepart(/^08:30/)).not.toHaveTextContent("le voisin paie cash");
    expect(lienDepart(/^08:00/)).toHaveTextContent("commission 100 F");
  });

  it.each([
    ["2027-01-05", "aujourd'hui"],
    ["2027-01-06", "demain"],
    ["2027-01-09", "9 janv."],
  ])("dit le jour des départs (%s) : « %s »", async (jour, attendu) => {
    rendreVendeur({ operations: departs(() => ({ jour })) });
    await attendreEcran();
    const vente = screen.getByRole("region", { name: "Vendre à un voisin · 3 touches" });
    expect(within(vente).getByText(attendu)).toBeInTheDocument();
  });

  it("n'écrit rien à droite d'un client sans proposition ni dernier voyage", async () => {
    rendreVendeur({
      operations: clientsDe((liste) =>
        liste.map((c) => ({ ...c, proposition: null, dernierVoyage: null })),
      ),
    });
    await attendreEcran();
    const lien = lienClient(/^Mme Ebogo/);
    expect(lien).toHaveTextContent("Mme Ebogo · Yaoundé chaque vendredi · 6 70 …");
    expect(lien).not.toHaveTextContent("dernier");
    expect(lien).not.toHaveTextContent("?");
  });
});

describe("Vendeur · navigation", () => {
  it("ouvre le plan du bus (SiegePay) du départ touché", async () => {
    const { routeur } = rendreVendeur();
    await attendreEcran();
    expect(lienDepart(/^08:30/)).toHaveAttribute("href", `/depart/${ALPHA_ID}`);
    expect(lienDepart(/^08:00/)).toHaveAttribute("href", `/depart/${BETA_ID}`);
    await userEvent.click(lienDepart(/^08:00/));
    await waitFor(() => expect(pathname(routeur)).toBe(`/depart/${BETA_ID}`));
  });

  it("revend à un client avec le départ que l'API propose (departId), même absent de la carte de vente", async () => {
    const { routeur } = rendreVendeur({
      operations: clientsDe((liste) =>
        liste.map((c) => (c.nom === "Mme Ebogo" ? { ...c, departId: "dep-vendredi-0830" } : c)),
      ),
    });
    await attendreEcran();
    expect(lienClient(/^Mme Ebogo/)).toHaveAttribute("href", "/depart/dep-vendredi-0830");
    await userEvent.click(lienClient(/^Mme Ebogo/));
    await waitFor(() => expect(pathname(routeur)).toBe("/depart/dep-vendredi-0830"));
  });

  it("dans la démo, la proposition porte son départ : un client sans proposition n'en a pas", async () => {
    let clients: contrats.ClientVendeur[] = [];
    rendreVendeur({
      operations: clientsDe((liste) => {
        clients = liste;
        return liste;
      }),
    });
    await attendreEcran();
    expect(clients.find((c) => c.nom === "Mme Ebogo")).toMatchObject({
      proposition: "vendredi 08:30",
      departId: ALPHA_ID,
    });
    const sans = clients.filter((c) => c.proposition === null);
    expect(sans.length).toBeGreaterThan(0);
    expect(sans.every((c) => c.departId === undefined)).toBe(true);
  });

  it("sans departId dans la réponse, revend avec le départ dont l'heure est dans la proposition", async () => {
    const { routeur } = rendreVendeur({
      operations: clientsDe((liste) =>
        liste.map((c) =>
          c.nom === "Mme Ebogo" ? { ...sansDepartId(c), proposition: "vendredi 08:00" } : c,
        ),
      ),
    });
    await attendreEcran();
    expect(lienClient(/^Mme Ebogo/)).toHaveAttribute("href", `/depart/${BETA_ID}`);
    await userEvent.click(lienClient(/^Mme Ebogo/));
    await waitFor(() => expect(pathname(routeur)).toBe(`/depart/${BETA_ID}`));
  });

  it("sans departId, revend avec le premier départ quand la proposition n'a pas d'heure ou que l'heure n'existe pas", async () => {
    const { routeur } = rendreVendeur({
      operations: clientsDe((liste) =>
        liste.map((c) =>
          c.nom === "Mme Ebogo" ? { ...sansDepartId(c), proposition: "vendredi 23:15" } : c,
        ),
      ),
    });
    await attendreEcran();
    expect(lienClient(/^Mme Ebogo/)).toHaveAttribute("href", `/depart/${ALPHA_ID}`);
    expect(lienClient(/^Pasteur Nkou/)).toHaveAttribute("href", `/depart/${ALPHA_ID}`);
    await userEvent.click(lienClient(/^Pasteur Nkou/));
    await waitFor(() => expect(pathname(routeur)).toBe(`/depart/${ALPHA_ID}`));
  });

  it("« Vendre un billet à un voisin » ouvre SiegePay avec le premier départ", async () => {
    const { routeur } = rendreVendeur();
    await attendreEcran();
    expect(grandBouton()).toHaveAttribute("href", `/depart/${ALPHA_ID}`);
    await userEvent.click(grandBouton());
    await waitFor(() => expect(pathname(routeur)).toBe(`/depart/${ALPHA_ID}`));
  });

  it("sans départ, le grand bouton mène à la recherche de trajets", async () => {
    const { routeur } = rendreVendeur({ operations: departs(() => ({ departs: [] })) });
    await screen.findByText("Aucun départ à vendre");
    expect(grandBouton()).toHaveAttribute("href", "/voyager");
    await userEvent.click(grandBouton());
    await waitFor(() => expect(pathname(routeur)).toBe("/voyager"));
  });

  it("lit les départs du jour par défaut (demain), sans filtre de trajet", async () => {
    const lectures: contrats.ParamsDepartsVendeur[] = [];
    rendreVendeur({
      operations: (originale) => [
        implementer(colis.OP_DEPARTS_VENDEUR, (params, ctx) => {
          lectures.push(params);
          return (
            originale(colis.OP_DEPARTS_VENDEUR.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    await attendreEcran();
    expect(lectures).toEqual([{}]);
  });
});

describe("Vendeur · états", () => {
  it("affiche un chargement dans le style nuit, avec le titre et le bouton déjà là", async () => {
    rendreVendeur({ latenceMs: 200 });
    const etat = await screen.findByRole("status", { name: "Chargement de ton espace vendeur" });
    expect(etat).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Vendeur AfriMove")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vendre un billet à un voisin" })).toBeInTheDocument();
    expect(screen.queryByText("83")).not.toBeInTheDocument();
    await attendreEcran();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dit qu'il n'y a aucun départ quand la liste est vide, sans toucher au reste", async () => {
    rendreVendeur({ operations: departs(() => ({ departs: [] })) });
    expect(await screen.findByText("Aucun départ à vendre")).toBeInTheDocument();
    expect(screen.getByText("83")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^08:30/ })).not.toBeInTheDocument();
    // Les clients restent là. Celui qui a une proposition ouvre le départ de l'API (il n'a pas besoin de la carte) ;
    // celui qui n'en a pas, sans départ connu, ouvre la recherche de trajets.
    expect(lienClient(/^Mme Ebogo/)).toHaveAttribute("href", `/depart/${ALPHA_ID}`);
    expect(lienClient(/^Pasteur Nkou/)).toHaveAttribute("href", "/voyager");
  });

  it("dit qu'il n'y a pas encore de client quand la liste est vide", async () => {
    rendreVendeur({ operations: clientsDe(() => []) });
    expect(await screen.findByText("Pas encore de client")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Mme Ebogo/ })).not.toBeInTheDocument();
    expect(lienDepart(/^08:30/)).toBeInTheDocument();
  });

  it("propose de réessayer quand les départs ne se chargent pas, les autres blocs restent affichés", async () => {
    let appels = 0;
    rendreVendeur({
      operations: (originale) => [
        implementer(colis.OP_DEPARTS_VENDEUR, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "panne");
          return (
            originale(colis.OP_DEPARTS_VENDEUR.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger les départs");
    expect(screen.getByText("83")).toBeInTheDocument();
    expect(screen.getByText("Mme Ebogo")).toBeInTheDocument();
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("link", { name: /^08:30 Alpha Voyages/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("propose de réessayer quand les clients ne se chargent pas", async () => {
    let appels = 0;
    rendreVendeur({
      operations: (originale) => [
        implementer(colis.OP_CLIENTS_VENDEUR, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "panne");
          return (
            originale(colis.OP_CLIENTS_VENDEUR.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger tes clients");
    expect(lienDepart(/^08:30/)).toBeInTheDocument();
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("link", { name: /^Mme Ebogo/ })).toBeInTheDocument();
  });

  it("remplace les chiffres par une erreur quand l'espace ne se charge pas, sans la règle ni le numéro", async () => {
    rendreVendeur({ operations: enPanne(colis.OP_ESPACE_VENDEUR) });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger tes chiffres");
    expect(screen.getByText("Vendeur AfriMove")).toBeInTheDocument();
    expect(screen.queryByText(/^n° /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tu ne gardes jamais d'argent/)).not.toBeInTheDocument();
    // La vente reste possible.
    expect(lienDepart(/^08:30/)).toBeInTheDocument();
    expect(grandBouton()).toHaveAttribute("href", `/depart/${ALPHA_ID}`);
  });
});

describe("Vendeur · cibles tactiles", () => {
  const css = readFileSync(resolve(__dirname, "vendeur.module.css"), "utf8");
  const regle = (selecteur: string) =>
    new RegExp(`^${selecteur.replace(".", "\\.")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";

  it.each([
    [".depart", 54],
    [".client", 44],
    [".action", 56],
  ])("%s fait au moins 44 px de haut", (selecteur, minimum) => {
    const hauteur = /min-height:\s*(\d+)px/.exec(regle(selecteur))?.[1];
    expect(Number(hauteur)).toBe(minimum);
    expect(Number(hauteur)).toBeGreaterThanOrEqual(44);
  });

  it("le bouton « Réessayer » fait au moins 44 px de haut", () => {
    const hauteur = /min-height:\s*(\d+)px/.exec(regle(".reessayer"))?.[1];
    expect(Number(hauteur)).toBeGreaterThanOrEqual(44);
  });
});
