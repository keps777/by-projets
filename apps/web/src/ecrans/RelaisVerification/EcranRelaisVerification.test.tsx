import { ErreurHttp } from "@afrimove/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { urlPlanche } from "@/coquille/planches";
import {
  SUIVI,
  avecSuivi,
  enveloppant,
  rendreRelaisVerification,
  sansReponse,
} from "./test-outils";

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** Attend que le suivi soit affiché. */
async function attendreEcran() {
  await screen.findByText("Suivi · en direct");
}

const jalons = () => within(screen.getByRole("list", { name: "Suivi de ta demande" }));

describe("RelaisVerification · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, étape et dossier", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Fiche envoyée" })).toBeInTheDocument();
    expect(screen.getByText("Étape 2 / 3 · vérification · dossier R-BAF-0215")).toBeInTheDocument();
  });

  it("dessine trois segments : vert, ambre, gris", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    const segments = Array.from(document.querySelectorAll("[data-segment]"));
    expect(segments.map((s) => s.getAttribute("data-segment"))).toEqual([
      "fait",
      "courant",
      "reste",
    ]);
  });

  it("affiche la frise : deux étapes faites, l'agent en cours, deux à venir, le libellé en gras", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    const lignes = jalons().getAllByRole("listitem");
    expect(lignes).toHaveLength(5);
    expect(lignes.map((l) => l.getAttribute("data-etat"))).toEqual([
      "fait",
      "fait",
      "en-cours",
      "a-venir",
      "a-venir",
    ]);
    expect(lignes.map((l) => l.querySelector("strong")?.textContent)).toEqual([
      "Fiche reçue",
      "Position et horaires validés",
      "Agent AfriMove · visite ou appel vidéo",
      "Activation",
      "Premier colis",
    ]);
    expect(lignes[0]).toHaveTextContent(
      "Fait : Fiche reçue · aujourd’hui 10:12 · SMS de confirmation envoyé",
    );
    expect(lignes[2]).toHaveTextContent(
      "En cours : Agent AfriMove · visite ou appel vidéo · Paul K. · jeudi entre 9 h et 12 h · il vérifie la façade, l’abri, et te forme (10 min)",
    );
    expect(lignes[4]).toHaveTextContent(
      "À venir : Premier colis · le convoyeur te prévient la veille · tu scannes · 200 F",
    );
    // Seul le jalon en cours est « l'étape courante » pour les lecteurs d'écran.
    expect(lignes.filter((l) => l.hasAttribute("aria-current"))).toEqual([lignes[2]]);
  });

  it("affiche le code relais réservé et l'essai de l'app relais", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    const code = screen.getByText("Ton code relais · réservé").parentElement!;
    expect(code).toHaveTextContent("R-BAF-0215");
    expect(code).toHaveTextContent("actif après la visite");
    const demo = screen.getByRole("link", { name: /Essayer l'app relais · démo/ });
    expect(demo).toHaveTextContent("En attendant");
    expect(demo).toHaveTextContent("recevoir · remettre · payé lundi →");
  });

  it("affiche le récit de jeudi, sa dernière phrase en gras, puis la mention", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    const recit = screen.getByText("Étape 3 · à quoi ressemble jeudi").parentElement!;
    expect(recit).toHaveTextContent(
      "Paul scanne ta fiche, colle l'affiche QR à ta vitrine, te montre les 2 gestes (scanner à la réception, code + pièce à la remise) et active ton compte devant toi. Dès le soir, les voyageurs qui envoient un colis à Tamdja voient « Boutique Chez Thérèse » dans la liste des relais.",
    );
    expect(Array.from(recit.querySelectorAll("strong")).map((s) => s.textContent)).toEqual([
      "Dès le soir, les voyageurs qui envoient un colis à Tamdja voient « Boutique Chez Thérèse » dans la liste des relais.",
    ]);
    expect(
      screen.getByText(
        "Tu peux modifier ta fiche, déplacer la visite ou retirer ta demande à tout moment. Rien n'est facturé.",
      ),
    ).toBeInTheDocument();
  });

  it("n'a ni emoji ni bouton grisé", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    const ecran = document.querySelector("[data-planche='RelaisVerification']")!.parentElement!;
    expect(ecran.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(ecran.querySelectorAll("[disabled], [aria-disabled='true']")).toHaveLength(0);
  });
});

describe("RelaisVerification · navigation", () => {
  it("les liens vont où va la maquette", async () => {
    rendreRelaisVerification();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/moi");
    expect(screen.getByRole("link", { name: /Essayer l'app relais/ })).toHaveAttribute(
      "href",
      urlPlanche("RelaisApp"),
    );
    expect(screen.getByRole("link", { name: "Modifier ma fiche" })).toHaveAttribute(
      "href",
      "/moi/devenir-relais/fiche",
    );
    expect(
      screen.getByRole("link", { name: "Retour à mon espace je te préviens par SMS jeudi" }),
    ).toHaveAttribute("href", "/moi");
  });

  it("« Retour à mon espace » ouvre Moi", async () => {
    const { routeur } = rendreRelaisVerification();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: /^Retour à mon espace/ }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi"));
  });

  it("« Modifier ma fiche » ouvre la fiche", async () => {
    const { routeur } = rendreRelaisVerification();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Modifier ma fiche" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/fiche"));
  });

  it("« Retour » ouvre Moi", async () => {
    const { routeur } = rendreRelaisVerification();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi"));
  });
});

describe("RelaisVerification · données", () => {
  it("demande le suivi de la dernière demande du compte", async () => {
    const appels: unknown[] = [];
    rendreRelaisVerification(
      enveloppant(SUIVI.nom, (params) => {
        appels.push(params);
      }),
    );
    await attendreEcran();
    expect(appels[0]).toEqual({});
  });

  it("demande le suivi du dossier donné dans l'adresse", async () => {
    const appels: unknown[] = [];
    rendreRelaisVerification(
      enveloppant(SUIVI.nom, (params) => {
        appels.push(params);
      }),
      "?dossier=R-BAF-0215",
    );
    await attendreEcran();
    expect(appels[0]).toEqual({ dossier: "R-BAF-0215" });
  });

  it("sans visite planifiée, « Retour à mon espace » ne promet pas de SMS", async () => {
    rendreRelaisVerification(avecSuivi((s) => ({ ...s, agent: null })));
    await attendreEcran();
    const retour = screen.getByRole("link", { name: /^Retour à mon espace/ });
    expect(retour).toHaveAccessibleName("Retour à mon espace");
  });

  it("une demande activée : tout est fait, rien ne pulse, plus de SMS à attendre", async () => {
    rendreRelaisVerification(
      avecSuivi((s) => ({
        ...s,
        statut: "active",
        titre: "Point relais actif",
        etape: { courante: 3, total: 3 },
        jalons: s.jalons.map((j) => ({ ...j, fait: true })),
      })),
    );
    await screen.findByRole("heading", { level: 1, name: "Point relais actif" });
    const lignes = jalons().getAllByRole("listitem");
    expect(lignes.every((l) => l.getAttribute("data-etat") === "fait")).toBe(true);
    expect(document.querySelector("[aria-current='step']")).toBeNull();
    expect(document.querySelector(".am-pulse")).toBeNull();
    expect(
      Array.from(document.querySelectorAll("[data-segment]")).map((s) =>
        s.getAttribute("data-segment"),
      ),
    ).toEqual(["fait", "fait", "fait"]);
    expect(screen.getByRole("link", { name: "Retour à mon espace" })).toBeInTheDocument();
  });

  it("une demande refusée : pas de barre d'étapes ni de jalon en cours", async () => {
    rendreRelaisVerification(
      avecSuivi((s) => ({
        ...s,
        statut: "refusee",
        titre: "Demande refusée",
        detail: "Ta demande n'a pas été retenue",
        etape: null,
      })),
    );
    await screen.findByRole("heading", { level: 1, name: "Demande refusée" });
    expect(document.querySelectorAll("[data-segment]")).toHaveLength(0);
    expect(document.querySelector("[data-etat='en-cours']")).toBeNull();
    expect(screen.getByText("Ta demande n'a pas été retenue")).toBeInTheDocument();
  });
});

describe("RelaisVerification · états chargement, vide et erreur", () => {
  it("chargement : des blocs gris dans le style nuit, avec Retour et Retour à mon espace", async () => {
    rendreRelaisVerification(sansReponse(SUIVI.nom));
    const zone = await screen.findByRole("status", { name: "Chargement du suivi de ta demande" });
    expect(zone).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/moi");
    expect(screen.getByRole("link", { name: "Retour à mon espace" })).toHaveAttribute(
      "href",
      "/moi",
    );
    expect(screen.queryByRole("link", { name: "Modifier ma fiche" })).not.toBeInTheDocument();
  });

  it("vide : aucune demande (404), sans casser la mise en page", async () => {
    rendreRelaisVerification(
      enveloppant(SUIVI.nom, () => {
        throw new ErreurHttp(404, "Aucune demande trouvée", "demande_introuvable");
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Aucune demande en cours" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à mon espace" })).toBeInTheDocument();
    expect(screen.queryByText("Suivi · en direct")).not.toBeInTheDocument();
  });

  it("erreur : message, « Réessayer » recharge le suivi", async () => {
    rendreRelaisVerification(
      enveloppant(SUIVI.nom, (_p, appel) => {
        if (appel === 1) throw new ErreurHttp(500, "Panne");
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Suivi indisponible");
    expect(screen.getByRole("link", { name: "Retour à mon espace" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Modifier ma fiche" })).toBeInTheDocument();
  });
});
