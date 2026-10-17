import { ErreurHttp, ErreurReseau, implementer } from "@afrimove/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  OP_SUIVI,
  avecOperations,
  clientVerification,
  rendreVerification,
  suiviEnPanne,
  suiviModifie,
  suiviSansReponse,
} from "./test-outils";

/** Attend que le suivi soit affiché. */
async function attendreEcran() {
  await screen.findByText("Fiche reçue");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

const chemin = (a: HTMLElement) =>
  new URL(a.getAttribute("href") ?? "", "http://localhost").pathname;

/** Le lien dont le nom accessible contient `nom`. */
function lien(nom: string | RegExp): HTMLElement {
  return screen.getByRole("link", { name: nom });
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

describe("LivreurVerification · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, sous-titre, retour et pastille EN COURS", async () => {
    rendreVerification();
    await attendreEcran();

    expect(screen.getByRole("heading", { level: 1, name: "Demande envoyée" })).toBeInTheDocument();
    expect(
      screen.getByText("Livreur · moto · Bafoussam Tamdja · soirs · dossier L-BAF-0087"),
    ).toBeInTheDocument();
    expect(screen.getByText("EN COURS")).toHaveAttribute("data-statut-demande", "en_cours");
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("affiche la frise : deux étapes faites, la lecture des pièces en cours, deux à venir", async () => {
    rendreVerification();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 2, name: "Suivi · en direct" }),
    ).toBeInTheDocument();
    const etapes = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(etapes.map((e) => e.getAttribute("data-etat"))).toEqual([
      "fait",
      "fait",
      "en_cours",
      "a_venir",
      "a_venir",
    ]);
    expect(etapes.map((e) => e.textContent)).toEqual([
      "Fiche reçue · aujourd’hui 18:40 · SMS de confirmation",
      "CNI et MoMo au même nom · vérifiés automatiquement",
      "Permis et assurance · lecture par l’app en cours · 2 min · ou l’agent les regarde à la gare",
      "Formation · 10 min en vidéo · les 3 règles, le scan, la remise contre code · quiz de 5 questions",
      "Activation · badge livreur n° 87 · l’app passe en mode livreur · tu reçois ta première course dans ta zone, à tes heures",
    ]);
    // Le libellé de chaque étape est en gras, le détail non.
    expect(within(etapes[0]!).getByText("Fiche reçue").tagName).toBe("STRONG");
    // Seule l'étape en cours est annoncée comme courante.
    expect(etapes.filter((e) => e.hasAttribute("aria-current")).length).toBe(1);
    expect(etapes[2]).toHaveAttribute("aria-current", "step");
    // Les coches ne sont dessinées que pour ce qui est fait.
    expect(etapes.map((e) => e.querySelector("svg") !== null)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("affiche le badge réservé, l'essai de l'app livreur, la première soirée et les particularités", async () => {
    rendreVerification();
    await attendreEcran();
    const corps = within(principal());

    expect(corps.getByText("Ton badge · réservé")).toBeInTheDocument();
    expect(corps.getByText("L-BAF-0087")).toBeInTheDocument();
    expect(corps.getByText("actif après la formation")).toBeInTheDocument();

    expect(corps.getByText("Essayer l'app livreur · démo")).toBeInTheDocument();
    expect(corps.getByText("mission · accepter · payé le soir →")).toBeInTheDocument();

    expect(
      corps.getByRole("heading", { level: 2, name: "Ta première soirée · à quoi ça ressemble" }),
    ).toBeInTheDocument();
    const recit = corps.getByText(/Le bus de 17 h arrive gare Alpha/);
    expect(recit).toHaveTextContent(
      "« Gare → Tamdja, 2 kg, 4,1 km, 700 F ». Tu as 30 s pour accepter.",
    );
    // La dernière phrase, celle du gain, est en gras.
    expect(within(recit).getByText("700 F sur ton MoMo le soir même.").tagName).toBe("STRONG");

    expect(
      corps.getByRole("heading", {
        level: 2,
        name: "Tes particularités · modifiables à tout moment",
      }),
    ).toBeInTheDocument();
    expect(
      corps.getByText(
        "Moto · Tamdja, Djeleng, centre · soirs 17 h – 21 h · jusqu'à 10 kg. On ne te propose que ça. Tu passes en « indisponible » d'une touche.",
      ),
    ).toBeInTheDocument();
  });

  it("n'affiche ni emoji ni bouton grisé", async () => {
    rendreVerification();
    await attendreEcran();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const bouton of screen.queryAllByRole("button")) expect(bouton).toBeEnabled();
  });
});

describe("LivreurVerification · navigation", () => {
  it("pointe chaque lien de la planche vers la bonne destination", async () => {
    rendreVerification();
    await attendreEcran();

    expect(chemin(lien("Retour"))).toBe("/moi");
    expect(chemin(lien(/Essayer l'app livreur · démo/))).toBe("/livreur/accueil");
    expect(chemin(lien("Modifier ma fiche"))).toBe("/moi/devenir-livreur");
    expect(chemin(lien(/Retour à mon espace/))).toBe("/moi");
  });

  it("donne aux liens le nom que la planche leur donne", async () => {
    rendreVerification();
    await attendreEcran();
    expect(lien(/Essayer l'app livreur · démo/)).toHaveTextContent(
      "En attendantEssayer l'app livreur · démomission · accepter · payé le soir →",
    );
    expect(lien(/Retour à mon espace/)).toHaveTextContent(
      "Retour à mon espaceje te préviens dès l’activation",
    );
  });

  it("« Retour » mène à Moi", async () => {
    const { routeur } = rendreVerification();
    await attendreEcran();
    await userEvent.setup().click(lien("Retour"));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi"));
  });

  it("l'essai de l'app livreur mène à l'app du livreur", async () => {
    const { routeur } = rendreVerification();
    await attendreEcran();
    await userEvent.setup().click(lien(/Essayer l'app livreur · démo/));
    await waitFor(() => expect(pathname(routeur)).toBe("/livreur/accueil"));
  });

  it("« Modifier ma fiche » mène à la fiche du livreur", async () => {
    const { routeur } = rendreVerification();
    await attendreEcran();
    await userEvent.setup().click(lien("Modifier ma fiche"));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur"));
  });

  it("« Retour à mon espace » mène à Moi", async () => {
    const { routeur } = rendreVerification();
    await attendreEcran();
    await userEvent.setup().click(lien(/Retour à mon espace/));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi"));
  });
});

describe("LivreurVerification · suivant les données du serveur", () => {
  it("avance la frise quand de nouvelles vérifications sont faites", async () => {
    const source = suiviModifie((s) => ({
      ...s,
      jalons: s.jalons.map((j, i) => ({ ...j, fait: i < 4 })),
    }));
    rendreVerification(clientVerification(source));
    await attendreEcran();
    const etapes = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(etapes.map((e) => e.getAttribute("data-etat"))).toEqual([
      "fait",
      "fait",
      "fait",
      "fait",
      "en_cours",
    ]);
  });

  it("n'a plus d'étape en cours quand tout est fait", async () => {
    const source = suiviModifie((s) => ({
      ...s,
      statut: "active",
      jalons: s.jalons.map((j) => ({ ...j, fait: true })),
    }));
    rendreVerification(clientVerification(source));
    await attendreEcran();
    const etapes = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(etapes.every((e) => e.getAttribute("data-etat") === "fait")).toBe(true);
    expect(etapes.some((e) => e.hasAttribute("aria-current"))).toBe(false);
  });

  it("change la pastille avec le statut de la demande", async () => {
    const source = suiviModifie((s) => ({ ...s, statut: "active" }));
    rendreVerification(clientVerification(source));
    await attendreEcran();
    expect(screen.getByText("ACTIVE")).toHaveAttribute("data-statut-demande", "active");
    expect(screen.queryByText("EN COURS")).not.toBeInTheDocument();
  });

  it("montre la pastille d'une demande refusée", async () => {
    const source = suiviModifie((s) => ({ ...s, statut: "refusee" }));
    rendreVerification(clientVerification(source));
    await attendreEcran();
    expect(screen.getByText("REFUSÉE")).toHaveAttribute("data-statut-demande", "refusee");
  });

  it("affiche le dossier, le badge et le gain tels que le serveur les donne", async () => {
    const source = suiviModifie((s) => ({
      ...s,
      titre: "Dossier reçu",
      detail: "Livreur · vélo · Douala Akwa · matins · dossier L-DLA-0042",
      reservation: {
        libelle: "Ton badge · réservé",
        valeur: "L-DLA-0042",
        activation: "actif après la formation",
      },
      recit: {
        titre: "Ta première matinée",
        texte: "Une mission apparaît. 600 F sur ton MoMo le jour même.",
      },
    }));
    rendreVerification(clientVerification(source));
    await screen.findByText("Dossier reçu");
    expect(screen.getByText("L-DLA-0042")).toBeInTheDocument();
    expect(screen.getByText("Ta première matinée")).toBeInTheDocument();
    expect(screen.getByText("600 F sur ton MoMo le jour même.").tagName).toBe("STRONG");
  });

  it("masque les particularités quand le serveur n'en donne pas", async () => {
    const source = suiviModifie((s) => ({ ...s, complement: null }));
    rendreVerification(clientVerification(source));
    await attendreEcran();
    expect(screen.queryByText(/Tes particularités/)).not.toBeInTheDocument();
    // Le reste de l'écran est intact.
    expect(screen.getByText("Ta première soirée · à quoi ça ressemble")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier ma fiche" })).toBeInTheDocument();
  });
});

describe("LivreurVerification · chargement, vide, erreur", () => {
  it("montre des blocs gris qui pulsent tant que le suivi n'arrive pas, et garde le pied", async () => {
    rendreVerification(clientVerification(suiviSansReponse()));
    const attente = await screen.findByRole("status", {
      name: "Chargement du suivi de ta demande",
    });
    expect(attente).toHaveAttribute("aria-busy", "true");
    expect(attente.querySelectorAll(".am-pulse").length).toBe(4);
    // L'en-tête garde son retour et le pied ses deux actions : la mise en page ne bouge pas.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Devenir livreur · vérification · première course",
    );
    expect(chemin(lien("Retour"))).toBe("/moi");
    expect(chemin(lien("Modifier ma fiche"))).toBe("/moi/devenir-livreur");
    expect(chemin(lien(/Retour à mon espace/))).toBe("/moi");
    expect(screen.queryByText("Fiche reçue")).not.toBeInTheDocument();
  });

  it("propose de déposer une demande quand il n'y en a pas (404)", async () => {
    const source = avecOperations(
      implementer(OP_SUIVI, () => {
        throw new ErreurHttp(404, "Pas de demande", "demande_introuvable");
      }),
    );
    rendreVerification(clientVerification(source));
    expect(await screen.findByText("Pas de demande en cours")).toBeInTheDocument();
    expect(
      screen.getByText("Tu n'as pas encore déposé de demande pour devenir livreur."),
    ).toBeInTheDocument();
    expect(chemin(screen.getByRole("link", { name: "Devenir livreur" }))).toBe(
      "/moi/devenir-livreur",
    );
    expect(chemin(lien("Retour"))).toBe("/moi");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("propose de réessayer quand le suivi ne charge pas, puis l'affiche", async () => {
    const utilisateur = userEvent.setup();
    const { source, appels } = suiviEnPanne((n) => (n === 1 ? new ErreurReseau() : undefined));
    rendreVerification(clientVerification(source));
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Impossible de charger le suivi")).toBeInTheDocument();
    expect(within(alerte).getByText("Vérifie ta connexion, puis réessaie.")).toBeInTheDocument();
    expect(chemin(lien("Retour"))).toBe("/moi");

    await utilisateur.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Fiche reçue")).toBeInTheDocument();
    expect(appels()).toBe(2);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("traite une erreur serveur comme une panne, pas comme l'absence de demande", async () => {
    const source = avecOperations(
      implementer(OP_SUIVI, () => {
        throw new ErreurHttp(500, "Erreur interne", "erreur");
      }),
    );
    rendreVerification(clientVerification(source));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Pas de demande en cours")).not.toBeInTheDocument();
  });
});
