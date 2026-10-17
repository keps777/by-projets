import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import fr from "./i18n.fr.json";
import en from "./i18n.en.json";
import pcm from "./i18n.pcm.json";
import { rendreControleur } from "./rendre-controleur";

// Suite complète en parallèle : le premier rendu (chargement du chunk de la route) peut dépasser 1 s.
configure({ asyncUtilTimeout: 5000 });

/** Attend que le contrôle soit affiché. */
async function attendreControle() {
  await screen.findByText("Siège par siège · touche un siège pour vérifier");
}

const lienRetour = () => screen.getByRole("link", { name: "Retour" });
const lienCloture = () =>
  screen.getByRole("link", { name: "Clore le contrôle · envoyer au patron" });
const siege = (numero: number, etat: string) =>
  screen.getByRole("button", { name: `Siège ${numero}, ${etat}` });
const tuile = (libelle: string) => screen.getByText(libelle).parentElement!;
const boutonRegulariser = () => screen.getByRole("button", { name: /^Régulariser · billet/ });
const boutonSignaler = () => screen.getByRole("button", { name: "Signaler le convoyeur" });

describe("Controleur · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête, la pastille INOPINÉ et le retour", async () => {
    rendreControleur();
    await attendreControle();

    expect(screen.getByRole("heading", { level: 1, name: "Contrôle à bord" })).toBeInTheDocument();
    expect(
      screen.getByText("Mme Fouda · contrôleuse Alpha · bus LT 412 AB à Edéa"),
    ).toBeInTheDocument();
    expect(screen.getByText("INOPINÉ")).toBeInTheDocument();
    expect(lienRetour()).toBeInTheDocument();
  });

  it("affiche les trois compteurs : Liste 35, Comptés 36, Écart +1", async () => {
    rendreControleur();
    await attendreControle();

    expect(tuile("Liste")).toHaveTextContent("35billets valides");
    expect(tuile("Comptés")).toHaveTextContent("36têtes à bord");
    expect(tuile("Écart")).toHaveTextContent("+1sans billet");
    expect(tuile("Écart")).toHaveAttribute("data-ton", "alerte");
  });

  it("affiche le plan des 36 sièges : un sans billet (7), un libre (23), les autres scannés", async () => {
    rendreControleur();
    await attendreControle();

    expect(screen.getByText("36 sièges")).toBeInTheDocument();
    const plan = screen.getByRole("group", { name: "Plan de contrôle des sièges" });
    const sieges = within(plan).getAllByRole("button");
    expect(sieges).toHaveLength(36);
    expect(sieges[6]).toHaveAttribute("aria-label", "Siège 7, occupé sans billet");
    expect(sieges[22]).toHaveAttribute("aria-label", "Siège 23, libre");
    expect(
      sieges.filter((s) => /billet scanné$/.test(s.getAttribute("aria-label") ?? "")),
    ).toHaveLength(34);
    expect(screen.getByText("billet scanné")).toBeInTheDocument();
    expect(screen.getByText("occupé sans billet")).toBeInTheDocument();
    expect(screen.getAllByText("libre").length).toBeGreaterThan(0);
  });

  it("affiche la fiche du siège 7 avec son explication et ses deux actions", async () => {
    rendreControleur();
    await attendreControle();

    const fiche = screen.getByRole("region", { name: "Siège 7 · voyageur sans billet" });
    expect(
      within(fiche).getByRole("heading", { level: 2, name: "Siège 7 · voyageur sans billet" }),
    ).toBeInTheDocument();
    expect(within(fiche).getByText("Edéa · 09:14")).toBeInTheDocument();
    expect(
      within(fiche).getByText(
        "Il dit avoir payé 4 000 F au convoyeur à Douala. Aucune vente en route n'est enregistrée pour ce siège.",
      ),
    ).toBeInTheDocument();
    expect(boutonRegulariser()).toHaveTextContent("Régulariser · billet 4 000");
    expect(boutonSignaler()).toBeInTheDocument();
  });

  it("dit qu'une vente en route existe quand le serveur l'a trouvée", async () => {
    rendreControleur({
      controle: (c) => ({
        ...c,
        sansBillet: c.sansBillet && { ...c.sansBillet, venteEnRouteTrouvee: true },
      }),
    });
    await attendreControle();
    expect(
      screen.getByText(
        "Il dit avoir payé 4 000 F au convoyeur à Douala. Une vente en route est enregistrée pour ce siège.",
      ),
    ).toBeInTheDocument();
  });

  it("n'affiche aucune fiche quand aucun voyageur n'est à traiter", async () => {
    rendreControleur({
      controle: (c) => ({
        ...c,
        sansBillet: null,
        sieges: c.sieges.map((s) =>
          s.constat === "sans_billet" ? { ...s, constat: "scanne" } : s,
        ),
        comptes: { liste: 36, tetes: 36, ecart: 0 },
      }),
    });
    await attendreControle();
    expect(screen.queryByRole("region", { name: /voyageur sans billet/ })).not.toBeInTheDocument();
    expect(tuile("Écart")).toHaveTextContent("0aucun écart");
    expect(tuile("Écart")).toHaveAttribute("data-ton", "ok");
    expect(lienCloture()).toBeInTheDocument();
  });

  it("n'a aucun bouton grisé, ni emoji, et nomme son bouton rond", async () => {
    rendreControleur();
    await attendreControle();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(lienRetour()).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(document.body.textContent).not.toMatch(/bientôt/i);
  });

  it("n'affiche aucun badge « TOUCHE » (la planche n'en montre pas), même avec le flag conception", async () => {
    const { rendreApp } = await import("@/test/rendre");
    rendreApp({ fixtures: true, scenario: "Controleur", url: "/inopine", conception: true });
    await attendreControle();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
  });
});

describe("Controleur · le compteur de têtes se saisit en touchant les sièges", () => {
  it("un siège occupé qu'on touche deux fois devient libre : une tête de moins, l'écart se ferme", async () => {
    const { envoyes } = rendreControleur();
    await attendreControle();

    // Siège 12 : billet scanné -> occupé sans billet (même nombre de têtes) -> libre (une tête de moins).
    await userEvent.click(siege(12, "billet scanné"));
    await screen.findByRole("button", { name: "Siège 12, occupé sans billet" });
    expect(tuile("Comptés")).toHaveTextContent("36");

    await userEvent.click(siege(12, "occupé sans billet"));
    await screen.findByRole("button", { name: "Siège 12, libre" });
    expect(tuile("Comptés")).toHaveTextContent("35têtes à bord");
    expect(tuile("Écart")).toHaveTextContent("0aucun écart");
    expect(tuile("Écart")).toHaveAttribute("data-ton", "ok");

    await waitFor(() => expect(envoyes).toHaveLength(2));
    expect(envoyes.map((e) => [e.type, e.donnees.siege, e.donnees.constat])).toEqual([
      ["controle.siege_verifie", 12, "sans_billet"],
      ["controle.siege_verifie", 12, "libre"],
    ]);
    expect(envoyes[0]?.donnees).toMatchObject({ departId: expect.any(String) });
  });

  it("un siège libre qu'on touche devient occupé : une tête de plus, l'écart grandit", async () => {
    rendreControleur();
    await attendreControle();

    await userEvent.click(siege(23, "libre"));
    await screen.findByRole("button", { name: "Siège 23, billet scanné" });
    expect(tuile("Comptés")).toHaveTextContent("37");
    expect(tuile("Écart")).toHaveTextContent("+2");
  });

  it("garde le constat après la relecture du serveur", async () => {
    rendreControleur();
    await attendreControle();
    await userEvent.click(siege(5, "billet scanné"));
    await userEvent.click(siege(5, "occupé sans billet"));
    await screen.findByRole("button", { name: "Siège 5, libre" });
    // Le serveur (mock) a retenu les deux constats : le siège reste libre après la relecture.
    await waitFor(() => expect(tuile("Comptés")).toHaveTextContent("35"));
    expect(siege(5, "libre")).toBeInTheDocument();
  });

  it("repasse le siège à son état d'avant, avec une alerte, quand l'envoi échoue", async () => {
    rendreControleur({ panne: "siege" });
    await attendreControle();

    await userEvent.click(siege(12, "billet scanné"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le siège 12 n'a pas été enregistré. Réessayez.",
    );
    expect(siege(12, "billet scanné")).toBeInTheDocument();
    expect(tuile("Comptés")).toHaveTextContent("36");
  });

  it("passe en rouge un siège touché, sans ouvrir de fiche pour lui (le serveur n'en traite qu'un à la fois)", async () => {
    rendreControleur();
    await attendreControle();
    await userEvent.click(siege(12, "billet scanné"));
    await screen.findByRole("button", { name: "Siège 12, occupé sans billet" });
    expect(screen.getAllByRole("region", { name: /voyageur sans billet/ })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Siège 7 · voyageur sans billet" })).toBeVisible();
  });

  it("masque la fiche du siège 7 quand on le repasse en libre, et la rend en le touchant encore", async () => {
    rendreControleur();
    await attendreControle();
    await userEvent.click(siege(7, "occupé sans billet"));
    await screen.findByRole("button", { name: "Siège 7, libre" });
    expect(screen.queryByRole("region", { name: /Siège 7 ·/ })).not.toBeInTheDocument();
    expect(tuile("Comptés")).toHaveTextContent("35");

    await userEvent.click(siege(7, "libre"));
    await userEvent.click(siege(7, "billet scanné"));
    await screen.findByRole("button", { name: "Siège 7, occupé sans billet" });
    expect(screen.getByRole("region", { name: "Siège 7 · voyageur sans billet" })).toBeVisible();
    expect(tuile("Comptés")).toHaveTextContent("36");
  });
});

describe("Controleur · régulariser et signaler", () => {
  it("« Régulariser · billet 4 000 » vend un billet comptant au prix déclaré et règle l'écart", async () => {
    const { envoyes } = rendreControleur();
    await attendreControle();

    await userEvent.click(boutonRegulariser());
    expect(await screen.findByRole("status")).toHaveTextContent(
      /^Billet ALP-DLA-\d{6}-\d{4} vendu : le siège 7 est en règle\.$/,
    );

    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]?.type).toBe("controle.regularise");
    expect(envoyes[0]?.donnees).toMatchObject({
      siege: 7,
      prix: 4000,
      paiement: { mode: "cash", recu: 4000, rendu: 0, reference: null },
      passager: { nom: null, pieceQuatreDerniers: null },
      controleId: expect.any(String),
      departId: expect.any(String),
      billetId: expect.any(String),
    });
    expect(envoyes[0]?.donnees.codeBillet).toMatch(/^\d{4}$/);

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: /Siège 7 ·/ })).not.toBeInTheDocument(),
    );
    expect(tuile("Liste")).toHaveTextContent("36");
    expect(tuile("Comptés")).toHaveTextContent("36");
    expect(tuile("Écart")).toHaveTextContent("0aucun écart");
    expect(screen.getByRole("button", { name: "Siège 7, billet scanné" })).toBeInTheDocument();
  });

  it("garde la fiche et signale l'échec quand le billet n'est pas vendu", async () => {
    rendreControleur({ panne: "regularisation" });
    await attendreControle();

    await userEvent.click(boutonRegulariser());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le billet n'a pas été vendu. Réessayez.",
    );
    expect(boutonRegulariser()).toBeInTheDocument();
    expect(tuile("Liste")).toHaveTextContent("35");
    expect(tuile("Écart")).toHaveTextContent("+1");
  });

  it("« Signaler le convoyeur » envoie le constat du siège 7 au patron, une seule fois", async () => {
    const { envoyes } = rendreControleur();
    await attendreControle();

    await userEvent.click(boutonSignaler());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Convoyeur signalé : le patron recevra le constat du siège 7.",
    );
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]?.type).toBe("controle.convoyeur_signale");
    expect(envoyes[0]?.donnees).toMatchObject({
      siege: 7,
      montantDeclare: 4000,
      note: null,
      convoyeurId: expect.stringContaining("convoyeur"),
    });
    // Le signalement est fait : le bouton disparaît, on peut encore régulariser.
    expect(screen.queryByRole("button", { name: "Signaler le convoyeur" })).not.toBeInTheDocument();
    expect(boutonRegulariser()).toBeInTheDocument();
  });

  it("garde le bouton et signale l'échec quand le convoyeur n'est pas signalé", async () => {
    rendreControleur({ panne: "signalement" });
    await attendreControle();

    await userEvent.click(boutonSignaler());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le convoyeur n'a pas été signalé. Réessayez.",
    );
    expect(boutonSignaler()).toBeInTheDocument();
  });
});

describe("Controleur · clôture et navigation", () => {
  it("« Retour » mène à la gare du superviseur (/gare)", async () => {
    const { routeur } = rendreControleur();
    await attendreControle();
    expect(lienRetour()).toHaveAttribute("href", "/gare");
    await userEvent.click(lienRetour());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
  });

  it("« Clore le contrôle » envoie le constat au patron puis ouvre le rapport du soir (/rapport)", async () => {
    const { routeur, envoyes } = rendreControleur();
    await attendreControle();
    expect(lienCloture()).toHaveAttribute("href", "/rapport");

    await userEvent.click(lienCloture());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/rapport"));
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]?.type).toBe("controle.cloture");
    expect(envoyes[0]?.donnees).toMatchObject({ liste: 35, tetes: 36, ecart: 1 });
    expect(envoyes[0]?.donnees.departId).toEqual(expect.any(String));
  });

  it("envoie les têtes comptées en touchant les sièges, après les sièges eux-mêmes", async () => {
    const { routeur, envoyes } = rendreControleur();
    await attendreControle();

    await userEvent.click(siege(12, "billet scanné"));
    await userEvent.click(siege(12, "occupé sans billet"));
    await userEvent.click(siege(23, "libre"));
    await userEvent.click(lienCloture());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/rapport"));
    expect(envoyes.map((e) => e.type)).toEqual([
      "controle.siege_verifie",
      "controle.siege_verifie",
      "controle.siege_verifie",
      "controle.cloture",
    ]);
    // 36 têtes au départ, un siège libéré (12), un siège occupé (23) : 36 têtes, 35 billets, écart +1.
    expect(envoyes[3]?.donnees).toMatchObject({ liste: 35, tetes: 36, ecart: 1 });
  });

  it("envoie la liste à 36 et l'écart à 0 une fois le voyageur régularisé", async () => {
    const { routeur, envoyes } = rendreControleur();
    await attendreControle();

    await userEvent.click(boutonRegulariser());
    await screen.findByRole("status");
    await userEvent.click(lienCloture());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/rapport"));
    expect(envoyes.at(-1)?.type).toBe("controle.cloture");
    expect(envoyes.at(-1)?.donnees).toMatchObject({ liste: 36, tetes: 36, ecart: 0 });
  });

  it("reste sur le contrôle avec une alerte si le constat n'est pas envoyé au patron", async () => {
    const { routeur } = rendreControleur({ panne: "cloture" });
    await attendreControle();

    await userEvent.click(lienCloture());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le contrôle n'a pas été envoyé au patron. Réessayez.",
    );
    expect(routeur.state.location.pathname).toBe("/inopine");
    expect(lienCloture()).toBeInTheDocument();
  });
});

describe("Controleur · états chargement, vide et erreur", () => {
  it("montre un chargement nuit avec le retour déjà actif", async () => {
    rendreControleur({ latenceMs: 400 });
    expect(await screen.findByRole("status", { name: "Chargement du contrôle" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Contrôle à bord" })).toBeInTheDocument();
    expect(lienRetour()).toHaveAttribute("href", "/gare");
    await attendreControle();
  });

  it("montre l'état vide quand aucun contrôle n'est en cours (404)", async () => {
    rendreControleur({ panne: "vide" });
    expect(await screen.findByText("Aucun contrôle en cours")).toBeInTheDocument();
    expect(lienRetour()).toBeInTheDocument();
  });

  it("montre l'erreur avec « Réessayer »", async () => {
    rendreControleur({ panne: "erreur" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Le contrôle ne s'ouvre pas");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });
});

describe("Controleur · langues", () => {
  it("a les mêmes clés en français, en anglais et en pidgin (les clés vides se replient sur le français)", () => {
    const cles = (o: unknown, prefixe = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? cles(v, `${prefixe}${k}.`) : [`${prefixe}${k}`],
      );
    expect(cles(en).sort()).toEqual(cles(fr).sort());
    expect(cles(pcm).sort()).toEqual(cles(fr).sort());
  });
});
