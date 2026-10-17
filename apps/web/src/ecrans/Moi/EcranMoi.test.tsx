import { ErreurReseau, implementer } from "@afrimove/api-client";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { billetPourRecus } from "./EcranMoi";
import {
  BILLET_DEMO,
  FIDELITE,
  HISTORIQUE,
  PARRAINAGE,
  PROCHES,
  PROFIL,
  avecPanne,
  avecOperations,
  avecReponse,
  clientMoi,
  element,
  espionner,
  proche,
  rendreAppMoi,
  sansReponse,
} from "./test-outils";

/** Attend que l'écran ait son profil, ses proches et son historique. */
async function attendreEcran() {
  await screen.findByText("Aïcha Ngo");
  await screen.findByText("Maman · Bafoussam");
  await screen.findByText("Colis pour Maman · Bafoussam");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien de la zone principale dont le texte contient `texte`. */
function lien(texte: string | RegExp): HTMLAnchorElement {
  const trouve = within(principal())
    .getAllByText(texte)
    .map((el) => el.closest("a"))
    .find((a): a is HTMLAnchorElement => a !== null);
  if (!trouve) throw new Error(`Pas de lien pour « ${String(texte)} »`);
  return trouve;
}

const chemin = (a: HTMLAnchorElement) => new URL(a.href, "http://localhost").pathname;

describe("Moi · rendu de la planche (scénario de démo)", () => {
  it("affiche le profil : initiales, nom, numéro, CNI vérifiée et date d'inscription", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Moi · fidélité · parrainage · proches · historique",
    );
    expect(screen.getByText("AN")).toBeInTheDocument();
    expect(screen.getByText("Aïcha Ngo")).toBeInTheDocument();
    expect(
      screen.getByText("+237 6 91 22 10 08 · CNI vérifiée · depuis janv. 2027"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réglages" })).toBeEnabled();
  });

  it("affiche la fidélité (points = francs) et le parrainage AMI", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(screen.getByText("Fidélité")).toBeInTheDocument();
    expect(screen.getByText("pts").parentElement).toHaveTextContent("1 250 pts");
    expect(screen.getByText("= 1 250 F sur ton prochain billet")).toBeInTheDocument();
    expect(screen.getByText("Parrainage · AMI")).toBeInTheDocument();
    expect(screen.getByText("amis").parentElement).toHaveTextContent("3 amis");
    expect(screen.getByText("250 F pour toi, 250 F pour eux")).toBeInTheDocument();
  });

  it("liste mes proches avec l'action de chacun", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(screen.getByText("Mes proches · 1 touche pour acheter")).toBeInTheDocument();
    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText("prévenue à chaque arrivée")).toBeInTheDocument();
    expect(screen.getByText("Lui payer un billet")).toBeInTheDocument();
    expect(screen.getByText("KK")).toBeInTheDocument();
    expect(screen.getByText("Kevin · Montréal")).toBeInTheDocument();
    expect(screen.getByText("paie mes voyages par carte")).toBeInTheDocument();
    expect(screen.getByText("lui demander")).toBeInTheDocument();
  });

  it("liste l'historique des voyages et des colis avec leur état", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(screen.getByText("Mes voyages et colis")).toBeInTheDocument();
    expect(screen.getByText("tout l'historique")).toBeInTheDocument();
    expect(screen.getByText("Douala → Yaoundé · mar. 5 janv. · 08:00")).toBeInTheDocument();
    expect(screen.getByText("Bêta Express VIP · siège 7 · 7 500 F")).toBeInTheDocument();
    expect(screen.getByText("à venir")).toBeInTheDocument();
    expect(screen.getByText("C-ALP-DLA-270103-0017 · 2 kg · 1 500 F")).toBeInTheDocument();
    expect(screen.getByText("à retirer")).toBeInTheDocument();
    expect(screen.getByText("Alpha · 4 000 F · reçu disponible")).toBeInTheDocument();
    expect(screen.getByText("voyagé")).toBeInTheDocument();
  });

  it("montre les cartes relais et livreur, puis langue, reçus et aide", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(screen.getByText("Une boutique ? Deviens point de relais")).toBeInTheDocument();
    expect(screen.getByText("200 F par colis remis · 3 min")).toBeInTheDocument();
    expect(screen.getByText("Une moto ? Deviens livreur")).toBeInTheDocument();
    expect(screen.getByText("700 F la course · tu choisis tes heures")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Langue · FR" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mes reçus" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aide · WhatsApp" })).toBeInTheDocument();
  });

  it("garde la barre d'onglets de la coquille, onglet Moi éclairé", async () => {
    rendreAppMoi();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: "Moi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const nom of ["Voyager", "Colis", "Covoit"]) {
      expect(within(barre).getByRole("link", { name: nom })).not.toHaveAttribute("aria-current");
    }
  });
});

describe("Moi · navigation (celle de la maquette)", () => {
  it("« + ajouter » et les deux proches mènent à Proche", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(chemin(lien("+ ajouter"))).toBe("/proche");
    expect(chemin(lien("Lui payer un billet"))).toBe("/proche");
    expect(chemin(lien("lui demander"))).toBe("/proche");
  });

  it("toucher un voyage ouvre son billet, toucher un colis ouvre son suivi", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(chemin(lien("Douala → Yaoundé · mar. 5 janv. · 08:00"))).toBe(`/billet/${BILLET_DEMO}`);
    expect(chemin(lien("Colis pour Maman · Bafoussam"))).toMatch(
      /^\/colis\/c-alp-dla-270103-0017$/i,
    );
    expect(chemin(lien("Yaoundé → Douala"))).toMatch(/^\/billet\/voyage-/);
  });

  it("les cartes « Deviens… », « Mes reçus » et « Aide » mènent aux bons écrans", async () => {
    rendreAppMoi();
    await attendreEcran();
    expect(chemin(lien("Une boutique ? Deviens point de relais"))).toBe("/moi/devenir-relais");
    expect(chemin(lien("Une moto ? Deviens livreur"))).toBe("/moi/devenir-livreur");
    expect(chemin(lien("Aide · WhatsApp"))).toBe("/sans-internet");
    // Les reçus ouvrent le voyage dont le reçu est disponible (celui du 28 déc.).
    expect(chemin(lien("Mes reçus"))).toMatch(/^\/billet\/voyage-/);
  });

  it("les onglets mènent à Voyager, Colis et Covoit", async () => {
    rendreAppMoi();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    const hrefs = within(barre)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/voyager", "/colis", "/covoit", "/moi"]);
  });
});

describe("Moi · langue", () => {
  it("« Langue · FR » reste sur l'écran et passe à la langue suivante", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = rendreAppMoi();
    await attendreEcran();
    await utilisateur.click(screen.getByRole("button", { name: "Langue · FR" }));
    expect(await screen.findByRole("button", { name: "Language · EN" })).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/moi");
    expect(document.documentElement.lang).toBe("en");
    await utilisateur.click(screen.getByRole("button", { name: "Language · EN" }));
    expect(await screen.findByRole("button", { name: "Language · PCM" })).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Language · PCM" }));
    expect(await screen.findByRole("button", { name: "Langue · FR" })).toBeInTheDocument();
  });
});

describe("Moi · modules masqués", () => {
  it("relais masqué : la carte « point de relais » disparaît, celle du livreur prend la largeur", async () => {
    rendreAppMoi({ masques: ["relais"] });
    await attendreEcran();
    expect(screen.queryByText("Une boutique ? Deviens point de relais")).not.toBeInTheDocument();
    expect(screen.getByText("Une moto ? Deviens livreur")).toBeInTheDocument();
  });

  it("livraison masquée : la carte « livreur » disparaît", async () => {
    rendreAppMoi({ masques: ["livraison"] });
    await attendreEcran();
    expect(screen.queryByText("Une moto ? Deviens livreur")).not.toBeInTheDocument();
    expect(screen.getByText("Une boutique ? Deviens point de relais")).toBeInTheDocument();
  });

  it("relais et livraison masqués : plus aucune carte « Deviens… »", async () => {
    rendreAppMoi({ masques: ["relais", "livraison"] });
    await attendreEcran();
    expect(screen.queryByText(/Deviens/)).not.toBeInTheDocument();
  });

  it("fidélité masquée : les deux tuiles disparaissent et rien n'est demandé au serveur", async () => {
    const { source, appels } = espionner(FIDELITE.nom);
    rendreAppMoi({ masques: ["fidelite"], client: clientMoi(source) });
    await attendreEcran();
    expect(screen.queryByText("Fidélité")).not.toBeInTheDocument();
    expect(screen.queryByText(/Parrainage/)).not.toBeInTheDocument();
    expect(appels).toHaveLength(0);
    expect(screen.getByText("Mes proches · 1 touche pour acheter")).toBeInTheDocument();
  });

  it("colis masqué : les colis quittent l'historique, les voyages restent", async () => {
    rendreAppMoi({ masques: ["colis"] });
    await screen.findByText("Aïcha Ngo");
    await screen.findByText("Douala → Yaoundé · mar. 5 janv. · 08:00");
    expect(screen.queryByText("Colis pour Maman · Bafoussam")).not.toBeInTheDocument();
    expect(screen.getByText("Yaoundé → Douala")).toBeInTheDocument();
  });

  it("USSD masqué : « Aide · WhatsApp » disparaît", async () => {
    rendreAppMoi({ masques: ["ussd"] });
    await attendreEcran();
    expect(screen.queryByText("Aide · WhatsApp")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mes reçus" })).toBeInTheDocument();
  });
});

describe("Moi · les valeurs viennent des données", () => {
  it("écrit le point au singulier, les francs et l'ami selon la réponse du serveur", async () => {
    const source = avecOperations(
      implementer(PARRAINAGE, () => ({
        code: "BONUS",
        amis: 1,
        bonusParrain: 1000,
        bonusFilleul: 500,
      })),
      implementer(FIDELITE, () => ({ points: 0, valeurFcfa: 1 })),
    );
    rendreAppMoi({ client: clientMoi(source) });
    expect(await screen.findByText("Parrainage · BONUS")).toBeInTheDocument();
    expect(screen.getByText("ami").parentElement).toHaveTextContent("1 ami");
    expect(screen.getByText("pts").parentElement).toHaveTextContent("0 pts");
    expect(screen.getByText("1 000 F pour toi, 500 F pour eux")).toBeInTheDocument();
    expect(screen.getByText("= 1 F sur ton prochain billet")).toBeInTheDocument();
  });

  it("n'écrit « CNI vérifiée » que pour une pièce vérifiée", async () => {
    const source = avecReponse(PROFIL, () => ({
      id: "u-2",
      prenom: "Paul",
      nom: "Mba",
      initiales: "PM",
      telephone: "+237677889900",
      pieceVerifiee: false,
      inscritDepuis: "2027-03-12T10:00:00.000+01:00",
      langue: "fr" as const,
    }));
    rendreAppMoi({ client: clientMoi(source) });
    expect(await screen.findByText("Paul Mba")).toBeInTheDocument();
    expect(screen.getByText("+237 6 77 88 99 00 · depuis mars 2027")).toBeInTheDocument();
    expect(screen.getByText("PM")).toBeInTheDocument();
  });

  it("montre le début du numéro d'un proche et accorde « prévenu » selon le nom", async () => {
    const source = avecReponse(PROCHES, () => [
      proche({
        id: "m",
        nom: "Maman",
        ville: "Bafoussam",
        initiales: "MA",
        telephone: "+237699123456",
        prevenuALArrivee: true,
      }),
      proche({ id: "p", nom: "Paul", initiales: "PA", prevenuALArrivee: true }),
    ]);
    rendreAppMoi({ client: clientMoi(source) });
    expect(await screen.findByText("6 99 … · prévenue à chaque arrivée")).toBeInTheDocument();
    expect(screen.getByText("Paul")).toBeInTheDocument();
    expect(screen.getByText("prévenu à chaque arrivée")).toBeInTheDocument();
    // Un proche qui ne paie pas mes voyages reçoit « Lui payer un billet ».
    expect(screen.getAllByText("Lui payer un billet")).toHaveLength(2);
  });

  it("habille chaque état de l'historique : à venir, à retirer, voyagé, annulé, livré", async () => {
    const source = avecReponse(HISTORIQUE, () => [
      element({ id: "b1", statut: "a_venir" }),
      element({ id: "c1", type: "colis", titre: "Colis pour Paul", statut: "a_retirer" }),
      element({ id: "b2", titre: "Douala → Kribi", statut: "voyage", recuDisponible: true }),
      element({ id: "b3", titre: "Douala → Édéa", statut: "annule" }),
      element({ id: "c2", type: "colis", titre: "Colis pour Léa", statut: "livre" }),
    ]);
    rendreAppMoi({ client: clientMoi(source) });
    await screen.findByText("Colis pour Paul");
    for (const statut of ["à venir", "à retirer", "voyagé", "annulé", "livré"]) {
      expect(screen.getByText(statut)).toBeInTheDocument();
    }
    // Le voyage « à venir » est un lien vers son billet, le colis vers son suivi.
    expect(chemin(lien("Colis pour Paul"))).toBe("/colis/c1");
    expect(chemin(lien("Douala → Kribi"))).toBe("/billet/b2");
    // « Mes reçus » ouvre le voyage dont le reçu est disponible.
    expect(chemin(lien("Mes reçus"))).toBe("/billet/b2");
  });
});

describe("Moi · billet des reçus", () => {
  it("prend le voyage au reçu disponible, sinon le premier voyage, sinon rien", () => {
    expect(
      billetPourRecus([
        element({ id: "a" }),
        element({ id: "b", recuDisponible: true }),
        element({ id: "c", recuDisponible: true }),
      ]),
    ).toBe("b");
    expect(billetPourRecus([element({ id: "a" }), element({ id: "b" })])).toBe("a");
    expect(
      billetPourRecus([element({ id: "c", type: "colis", recuDisponible: true })]),
    ).toBeUndefined();
    expect(billetPourRecus([])).toBeUndefined();
  });
});

describe("Moi · chargement, vide, erreur", () => {
  it("montre des squelettes tant que les données n'arrivent pas, sans casser la mise en page", async () => {
    const source = sansReponse(PROCHES.nom);
    rendreAppMoi({ client: clientMoi(source) });
    // Le reste de l'écran s'affiche, les proches attendent.
    await screen.findByText("Aïcha Ngo");
    expect(await screen.findByText("Mes proches · 1 touche pour acheter")).toBeInTheDocument();
    const attente = screen.getByRole("status", { name: "Chargement de ton compte" });
    expect(attente).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("+ ajouter")).toBeInTheDocument();
    expect(screen.queryByText("Maman · Bafoussam")).not.toBeInTheDocument();
  });

  it("montre le profil en chargement avec un squelette à la place du nom", async () => {
    rendreAppMoi({ client: clientMoi(sansReponse(PROFIL.nom)) });
    const attente = await screen.findAllByRole("status", { name: "Chargement de ton compte" });
    expect(attente.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Réglages" })).toBeInTheDocument();
  });

  it("dit qu'il n'y a pas encore de proche ni d'historique, et garde « + ajouter »", async () => {
    const vide = avecOperations(
      implementer(PROCHES, () => []),
      implementer(HISTORIQUE, () => []),
    );
    rendreAppMoi({ client: clientMoi(vide) });
    expect(await screen.findByText("Aucun proche pour l'instant")).toBeInTheDocument();
    expect(await screen.findByText("Aucun voyage ni colis pour l'instant")).toBeInTheDocument();
    expect(chemin(lien("+ ajouter"))).toBe("/proche");
    // Sans voyage, il n'y a pas de reçu à ouvrir : la puce disparaît au lieu d'être grisée.
    expect(screen.queryByText("Mes reçus")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Langue · FR" })).toBeInTheDocument();
  });

  it("propose de réessayer quand les proches ne chargent pas, puis les affiche", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = avecPanne(PROCHES.nom, (n) =>
      n === 1 ? new ErreurReseau() : undefined,
    );
    rendreAppMoi({ client: clientMoi(source) });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Indisponible pour le moment")).toBeInTheDocument();
    // Le reste de l'écran est intact.
    expect(screen.getByText("Aïcha Ngo")).toBeInTheDocument();
    expect(screen.getByText("Douala → Yaoundé · mar. 5 janv. · 08:00")).toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Maman · Bafoussam")).toBeInTheDocument();
    expect(appels()).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("propose de réessayer quand l'historique, la fidélité ou le profil ne chargent pas", async () => {
    const utilisateur = userEvent.setup();
    const historique = avecPanne(HISTORIQUE.nom, (n) => (n === 1 ? new ErreurReseau() : undefined));
    rendreAppMoi({ client: clientMoi(historique.source) });
    const alerte = await screen.findByRole("alert");
    await utilisateur.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Colis pour Maman · Bafoussam")).toBeInTheDocument();
    expect(historique.appels()).toBe(2);
  });

  it("une tuile en panne n'efface pas l'autre, une panne de profil garde les réglages", async () => {
    const fidelite = avecPanne(FIDELITE.nom, () => new ErreurReseau());
    rendreAppMoi({ client: clientMoi(fidelite.source) });
    expect(await screen.findByText("Parrainage · AMI")).toBeInTheDocument();
    const alertes = await screen.findAllByRole("alert");
    expect(alertes.some((a) => a.textContent?.includes("Indisponible pour le moment"))).toBe(true);
    expect(screen.getByText("Fidélité")).toBeInTheDocument();
  });

  it("une panne de profil l'annonce sans masquer le reste", async () => {
    const profil = avecPanne(PROFIL.nom, () => new ErreurReseau());
    rendreAppMoi({ client: clientMoi(profil.source) });
    expect(await screen.findByText("Profil indisponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réglages" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Maman · Bafoussam")).toBeInTheDocument());
    await act(async () => {});
  });
});
