import { ErreurHttp, colis, implementer } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { COLIS_MAMAN } from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  COLIS_ID,
  rendreRelais,
  surveiller,
  transformer,
  type OptionsRenduRelais,
} from "./rendre-relais";

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;
const iso = (heure: string) => `2027-01-05T${heure}:00.000+01:00`;

/** Attend que les relais soient affichés. */
async function attendreEcran() {
  await screen.findByRole("radiogroup", { name: "Points relais près du destinataire" });
}

const cartes = () => screen.getAllByRole("radio");
const bouton = (nom: string | RegExp = /^Choisir /) => screen.getByRole("button", { name: nom });
const carte = (nom: RegExp) => screen.getByRole("radio", { name: nom });

/** Remplace la liste des relais dans la réponse de « relais proches ». */
function avecRelais(
  modifier: (relais: contrats.PointRelais[]) => contrats.PointRelais[],
): NonNullable<OptionsRenduRelais["operations"]> {
  return (originale) => [
    transformer(colis.OP_RELAIS_PROCHES, originale, (r) => ({
      ...r,
      relais: modifier(r.relais),
    })),
  ];
}

describe("Relais · données de démonstration", () => {
  it("l'identifiant d'exemple est celui du colis de Maman dans les fixtures", () => {
    expect(COLIS_ID).toBe(COLIS_MAMAN.id);
  });
});

describe("Relais · rendu de la planche", () => {
  it("affiche le titre, la carte, les trois relais, l'invitation et le bouton de la planche", async () => {
    rendreRelais();
    await attendreEcran();

    // Le titre de la planche est du texte ; le h1 est celui de l'écran, lu par les lecteurs d'écran.
    expect(
      screen.getByRole("heading", { level: 1, name: "Points relais · carte" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Points relais · Bafoussam")).toBeInTheDocument();
    expect(screen.getByText("3 commerçants près de chez elle")).toBeInTheDocument();

    const carteVille = screen.getByRole("img", {
      name: "Carte de Bafoussam avec trois points relais autour du marché A",
    });
    expect(within(carteVille).getByText("Marché A")).toBeInTheDocument();
    expect(within(carteVille).getByText("Chez Maman")).toBeInTheDocument();
    expect(within(carteVille).getByText("Gare Alpha")).toBeInTheDocument();
    expect(
      within(carteVille)
        .getAllByText(/^[123]$/)
        .map((n) => n.textContent),
    ).toEqual(["1", "2", "3"]);

    expect(cartes().map((c) => c.closest("label")?.textContent)).toEqual([
      "1Boutique Mama Fotso · ouvert350 m de chez Maman · 7 h–20 h · lun.–sam. · 4,9 ★ · 212 colis remis+300",
      "2Pharmacie du Marché · ouvert900 m · 7 h 30–22 h · 7 j/7 · 4,8 ★ · frigo pour médicaments+300",
      "3Call-box Tonton Paul · ferme à 19 h1,2 km · 6 h–19 h · 4,6 ★ · petit colis seulement+300",
    ]);

    expect(
      screen.getByText("Ta boutique ici ? Deviens point de relais · 200 F par colis"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Le relais scanne à la réception et à la remise · code + pièce · 7 jours de garde inclus",
      ),
    ).toBeInTheDocument();
    expect(bouton()).toHaveTextContent("Choisir Mama Fotso · prévenir Maman300 F");
  });

  it("n'a aucun bouton grisé, nomme le bouton rond et n'affiche pas le badge de conception", async () => {
    rendreRelais({ conception: true });
    await attendreEcran();
    for (const b of screen.getAllByRole("button")) expect(b).toBeEnabled();
    for (const radio of cartes()) expect(radio).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
  });

  it("colore l'état de chaque relais : ouvert en vert, ferme bientôt en ambre, fermé en rouge", async () => {
    rendreRelais({
      operations: avecRelais((relais) =>
        relais.map((p) => (p.rang === 2 ? { ...p, ouvert: false, fermeLe: null } : p)),
      ),
    });
    await attendreEcran();
    expect(screen.getByText("· ouvert")).toHaveAttribute("data-ton", "ouvert");
    expect(screen.getByText("· ferme à 19 h")).toHaveAttribute("data-ton", "bientot");
    expect(screen.getByText("· fermé")).toHaveAttribute("data-ton", "ferme");
  });

  it("écrit l'heure de fermeture à partir de la réponse du serveur", async () => {
    rendreRelais({
      operations: avecRelais((relais) =>
        relais.map((p) => (p.rang === 3 ? { ...p, fermeLe: iso("19:30") } : p)),
      ),
    });
    await attendreEcran();
    expect(screen.getByText("· ferme à 19 h 30")).toBeInTheDocument();
  });

  it("n'écrit « de chez … » que pour le plus proche, et passe en kilomètres au-delà de 1 000 m", async () => {
    rendreRelais({
      operations: avecRelais((relais) =>
        relais.map((p) => (p.rang === 2 ? { ...p, distanceM: 2000 } : p)),
      ),
    });
    await attendreEcran();
    expect(carte(/^2 Pharmacie/).closest("label")).toHaveTextContent("2 km · 7 h 30–22 h");
    expect(carte(/^1 Boutique/).closest("label")).toHaveTextContent("350 m de chez Maman");
  });

  it("accorde le sous-titre et la carte quand il n'y a qu'un seul relais", async () => {
    rendreRelais({ operations: avecRelais((relais) => relais.slice(0, 1)) });
    await attendreEcran();
    expect(screen.getByText("1 commerçant près de chez elle")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Carte de Bafoussam avec un point relais autour du marché A",
      }),
    ).toBeInTheDocument();
  });
});

describe("Relais · choix du relais", () => {
  it("coche le plus proche au départ", async () => {
    rendreRelais();
    await attendreEcran();
    expect(cartes().map((c) => (c as HTMLInputElement).checked)).toEqual([true, false, false]);
  });

  it("toucher une carte la coche et met à jour le bouton et son prix", async () => {
    rendreRelais({
      operations: avecRelais((relais) =>
        relais.map((p) => (p.rang === 2 ? { ...p, supplement: 1_500 } : p)),
      ),
    });
    await attendreEcran();
    await userEvent.click(carte(/^2 Pharmacie du Marché/));

    expect(cartes().map((c) => (c as HTMLInputElement).checked)).toEqual([false, true, false]);
    expect(carte(/^2 Pharmacie/).closest("label")).toHaveAttribute("data-choisi", "true");
    expect(carte(/^1 Boutique/).closest("label")).toHaveAttribute("data-choisi", "false");
    expect(bouton()).toHaveTextContent("Choisir Pharmacie du Marché · prévenir Maman1 500 F");
  });

  it("se choisit aussi au clavier, avec les flèches", async () => {
    rendreRelais();
    await attendreEcran();
    carte(/^1 Boutique/).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(carte(/^2 Pharmacie/)).toBeChecked();
    expect(bouton()).toHaveTextContent("Choisir Pharmacie du Marché");
  });

  it("enregistre le relais choisi sur le colis puis ouvre le colis", async () => {
    const choix: contrats.ChoixRelais[] = [];
    const { routeur } = rendreRelais({
      operations: (originale) => [
        surveiller(colis.OP_CHOISIR_RELAIS, originale, (p) => choix.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(bouton("Choisir Mama Fotso · prévenir Maman 300 F"));
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}`));
    expect(choix).toEqual([{ colisId: COLIS_ID, relaisId: "relais-boutique-mama-fotso" }]);
  });

  it("enregistre le relais touché, pas toujours le premier", async () => {
    const choix: contrats.ChoixRelais[] = [];
    const { routeur } = rendreRelais({
      operations: (originale) => [
        surveiller(colis.OP_CHOISIR_RELAIS, originale, (p) => choix.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(carte(/^3 Call-box/));
    await userEvent.click(bouton());
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}`));
    expect(choix).toEqual([{ colisId: COLIS_ID, relaisId: "relais-call-box-tonton-paul" }]);
  });

  it("n'envoie le choix qu'une fois quand on touche le bouton deux fois de suite", async () => {
    const choix: contrats.ChoixRelais[] = [];
    const { routeur } = rendreRelais({
      latenceMs: 300,
      operations: (originale) => [
        surveiller(colis.OP_CHOISIR_RELAIS, originale, (p) => choix.push(p)),
      ],
    });
    await attendreEcran();
    const b = bouton();
    await userEvent.click(b);
    expect(b).toHaveAttribute("aria-busy", "true");
    await userEvent.click(b);
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}`), { timeout: 3000 });
    expect(choix).toHaveLength(1);
  });

  it.each([
    ["relais_complet", 409, "Ce point relais est complet. Choisis-en un autre."],
    ["colis_trop_lourd", 422, "Ce colis est trop lourd pour ce point relais. Choisis-en un autre."],
    ["panne", 500, "Le point relais n'a pas pu être enregistré. Réessaie."],
  ])("explique l'échec « %s » et reste sur la planche", async (code, statut, phrase) => {
    const { routeur } = rendreRelais({
      operations: () => [
        implementer(colis.OP_CHOISIR_RELAIS, () => {
          throw new ErreurHttp(statut, "Refusé", code);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(bouton());
    expect(await screen.findByRole("alert")).toHaveTextContent(phrase);
    expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}/relais`);
    // Rien n'est grisé : on peut choisir un autre relais, et le message disparaît.
    await userEvent.click(carte(/^2 Pharmacie/));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("laisse réessayer après un échec", async () => {
    let appels = 0;
    const { routeur } = rendreRelais({
      operations: (originale) => [
        implementer(colis.OP_CHOISIR_RELAIS, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "panne");
          return (
            originale(colis.OP_CHOISIR_RELAIS.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(bouton());
    await screen.findByRole("alert");
    await userEvent.click(bouton());
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}`));
    expect(appels).toBe(2);
  });
});

describe("Relais · navigation", () => {
  it("revient au colis avec « Retour »", async () => {
    const { routeur } = rendreRelais();
    await attendreEcran();
    const retour = screen.getByRole("link", { name: "Retour" });
    expect(retour).toHaveAttribute("href", `/colis/${COLIS_ID}`);
    await userEvent.click(retour);
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}`));
  });

  it("ouvre « Devenir point relais » avec la carte « Ta boutique ici ? »", async () => {
    const { routeur } = rendreRelais();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: /^Ta boutique ici \?/ });
    expect(lien).toHaveAttribute("href", "/moi/devenir-relais");
    await userEvent.click(lien);
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais"));
  });

  it("lit les relais du colis de l'adresse", async () => {
    const lectures: contrats.ParamsRelaisProches[] = [];
    rendreRelais({
      colisId: "colis-autre",
      operations: (originale) => [
        surveiller(colis.OP_RELAIS_PROCHES, originale, (p) => lectures.push(p)),
      ],
    });
    await attendreEcran();
    expect(lectures).toEqual([{ colisId: "colis-autre" }]);
  });
});

describe("Relais · états", () => {
  it("affiche un chargement dans le style nuit, avec le retour déjà disponible", async () => {
    rendreRelais({ latenceMs: 200 });
    const etat = await screen.findByRole("status", { name: "Chargement des points relais" });
    expect(etat).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Choisir / })).not.toBeInTheDocument();
    await attendreEcran();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dit qu'il n'y a aucun point relais quand la liste est vide, sans bouton « Choisir »", async () => {
    rendreRelais({ operations: avecRelais(() => []) });
    expect(await screen.findByText("Aucun point relais près d'ici")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au colis" })).toHaveAttribute(
      "href",
      `/colis/${COLIS_ID}`,
    );
    expect(screen.queryByRole("button", { name: /^Choisir / })).not.toBeInTheDocument();
  });

  it.each([404, 403])("dit « Colis introuvable » quand le serveur répond %i", async (statut) => {
    rendreRelais({
      operations: () => [
        implementer(colis.OP_RELAIS_PROCHES, () => {
          throw new ErreurHttp(statut, "Refusé", "colis_introuvable");
        }),
      ],
    });
    expect(await screen.findByText("Colis introuvable")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("propose de réessayer après une erreur de chargement", async () => {
    let appels = 0;
    rendreRelais({
      operations: (originale) => [
        implementer(colis.OP_RELAIS_PROCHES, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "panne");
          return (
            originale(colis.OP_RELAIS_PROCHES.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger les points relais");
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(cartes()).toHaveLength(3);
  });
});
