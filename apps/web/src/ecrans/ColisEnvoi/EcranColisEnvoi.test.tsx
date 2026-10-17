import { ErreurHttp, colis, implementer } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreColisEnvoi, surveiller, transformer } from "./rendre-colis-envoi";

/** Attend que l'écran soit affiché (les options d'envoi sont là). */
async function attendreEcran() {
  await screen.findByRole("button", { name: /Alpha Voyages/ });
}

const boutonPayer = () => screen.getByRole("button", { name: /^Payer et obtenir le code/ });
const champ = (nom: string) => screen.getByRole("textbox", { name: nom });
const interrupteur = () => screen.getByRole("switch", { name: /^Assurer/ });
const ligneRelais = () => screen.getByRole("button", { name: /^relais/ });
const ligneMoto = () => screen.getByRole("button", { name: /^moto/ });
const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** Attend un total précis sur le bouton de paiement (le devis se recalcule après chaque changement). */
async function attendreTotal(total: string) {
  await waitFor(() => expect(boutonPayer()).toHaveTextContent(`${total} F`));
}

/** Efface un champ puis y écrit `texte`. */
async function remplacer(nom: string, texte: string) {
  const zone = champ(nom);
  await userEvent.clear(zone);
  if (texte !== "") await userEvent.type(zone, texte);
}

/** Le colis tel que l'attend le contrat quand on paie le scénario de démonstration sans rien changer. */
const CREATION_DEMO: contrats.DemandeCreationColis = {
  departId: expect.stringMatching(/^dep-/) as unknown as string,
  photoRef: "photo-demo",
  destinataire: { nom: "Maman", telephone: "+237699401822" },
  contenu: "Médicaments et vêtements",
  poidsKg: 2,
  valeurDeclaree: 25000,
  assurer: true,
  mode: "gare",
  paiement: { moyen: "mtn_momo" },
};

describe("ColisEnvoi · rendu de la planche", () => {
  it("affiche la photo, le formulaire, le départ, l'assurance et le bouton du scénario de démo", async () => {
    rendreColisEnvoi();
    await attendreEcran();

    expect(screen.getByRole("heading", { level: 1, name: "Envoyer un colis" })).toBeInTheDocument();
    expect(screen.getByText("Photo, destinataire, paiement : un écran")).toBeInTheDocument();

    expect(
      await screen.findByRole("button", {
        name: "Photo prise · taille estimée : petit carton · 2 kg",
      }),
    ).toBeInTheDocument();

    expect(champ("Pour qui")).toHaveValue("Maman · 6 99 40 18 22");
    expect(champ("Où")).toHaveValue("Bafoussam · gare Alpha");
    expect(champ("Contenu déclaré")).toHaveValue("Médicaments et vêtements");
    expect(champ("Valeur (F)")).toHaveValue("25 000");

    expect(screen.getByText("Comment ça part")).toBeInTheDocument();
    expect(screen.getByText("prochain départ")).toBeInTheDocument();
    const gare = screen.getByRole("button", { name: /Alpha Voyages/ });
    expect(gare).toHaveAttribute("aria-pressed", "true");
    expect(gare).toHaveTextContent(
      "08:15Alpha Voyages · retrait à la gare de Bafoussam · arrivée 13 h1 500",
    );
    expect(ligneRelais()).toHaveAttribute("aria-pressed", "false");
    expect(ligneRelais()).toHaveTextContent(
      "relaisRemis chez un commerçant près de chez elle · 7 h–20 h+300",
    );
    expect(ligneMoto()).toHaveAttribute("aria-pressed", "false");
    expect(ligneMoto()).toHaveTextContent(
      "motoLivré à sa porte par un livreur vérifié, photo à la remise+1 000",
    );

    expect(interrupteur()).toBeChecked();
    expect(interrupteur()).toHaveTextContent("Assurer à 25 000 F · 500 F · assureur partenaire");

    await attendreTotal("2 200");
    expect(boutonPayer()).toHaveTextContent("tu déposes au guichet, l'étiquette est prête");
    expect(
      screen.getByText(
        "1 500 port + 200 frais + 500 assurance · interdits : argent, armes, périssables non emballés",
      ),
    ).toBeInTheDocument();
  });

  it("n'affiche le badge « TOUCHE 2 » et « touche 3 · » que si le flag conception est actif", async () => {
    rendreColisEnvoi();
    await attendreEcran();
    expect(screen.queryByText("TOUCHE 2")).not.toBeInTheDocument();
    expect(screen.queryByText(/touche 3/)).not.toBeInTheDocument();
  });

  it("affiche le badge « TOUCHE 2 » et « touche 3 · » avec le flag conception", async () => {
    rendreColisEnvoi({ conception: true });
    await attendreEcran();
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(boutonPayer()).toHaveTextContent(
      "touche 3 · tu déposes au guichet, l'étiquette est prête",
    );
  });

  it("n'a aucun bouton grisé et nomme le bouton retour", async () => {
    rendreColisEnvoi();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) {
      expect(bouton).toBeEnabled();
    }
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
  });

  it("ouvre l'accueil quand on touche « Retour »", async () => {
    const { routeur } = rendreColisEnvoi();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/voyager"));
  });
});

describe("ColisEnvoi · prix", () => {
  it("ajoute 300 F pour le relais et 1 000 F pour la moto, ligne par ligne, et revient à la gare", async () => {
    rendreColisEnvoi();
    await attendreEcran();
    await attendreTotal("2 200");

    await userEvent.click(ligneRelais());
    await attendreTotal("2 500");
    expect(ligneRelais()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Alpha Voyages/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByText(/^1 500 port \+ 200 frais \+ 500 assurance \+ 300 relais · /),
    ).toBeVisible();

    await userEvent.click(ligneMoto());
    await attendreTotal("3 200");
    expect(ligneRelais()).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText(/^1 500 port \+ 200 frais \+ 500 assurance \+ 1 000 livraison · /),
    ).toBeVisible();

    // Retoucher la ligne choisie, ou toucher le départ, ramène au retrait en gare.
    await userEvent.click(ligneMoto());
    await attendreTotal("2 200");
    await userEvent.click(ligneRelais());
    await attendreTotal("2 500");
    await userEvent.click(screen.getByRole("button", { name: /Alpha Voyages/ }));
    await attendreTotal("2 200");
  });

  it("retire la prime de l'assurance quand on la coupe, et la remet", async () => {
    const devis: contrats.DemandeDevisColis[] = [];
    rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_DEVIS_COLIS, originale, (p) => devis.push(p)),
      ],
    });
    await attendreEcran();
    await attendreTotal("2 200");

    await userEvent.click(interrupteur());
    expect(interrupteur()).not.toBeChecked();
    await attendreTotal("1 700");
    expect(devis.at(-1)).toMatchObject({ mode: "gare", valeurAssuree: 0 });
    expect(
      screen.getByText(
        "1 500 port + 200 frais · interdits : argent, armes, périssables non emballés",
      ),
    ).toBeInTheDocument();

    await userEvent.click(interrupteur());
    await attendreTotal("2 200");
    expect(interrupteur()).toBeChecked();
    expect(devis.map((d) => d.valeurAssuree)).toEqual([25000, 0]);
  });

  it("recalcule la prime quand la valeur change : 2 % de la valeur, minimum 500 F", async () => {
    rendreColisEnvoi();
    await attendreEcran();
    await attendreTotal("2 200");

    await remplacer("Valeur (F)", "100000");
    expect(champ("Valeur (F)")).toHaveValue("100 000");
    await attendreTotal("3 700");
    expect(interrupteur()).toHaveTextContent("Assurer à 100 000 F · 2 000 F · assureur partenaire");

    await remplacer("Valeur (F)", "10000");
    await attendreTotal("2 200");
    expect(interrupteur()).toHaveTextContent("Assurer à 10 000 F · 500 F · assureur partenaire");
  });

  it("n'assure rien tant que la valeur est vide et rappelle la règle de l'assurance", async () => {
    rendreColisEnvoi();
    await attendreEcran();
    await remplacer("Valeur (F)", "");
    await attendreTotal("1 700");
    expect(interrupteur()).toHaveTextContent(
      "Assurer le colis · 2 % de la valeur, min. 500 F · assureur partenaire",
    );
  });
});

describe("ColisEnvoi · payer", () => {
  it("crée le colis avec ce qui est affiché, puis ouvre le suivi du colis créé", async () => {
    const creations: contrats.DemandeCreationColis[] = [];
    const { routeur } = rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await attendreTotal("2 200");
    await screen.findByText(/^Photo prise/);

    await userEvent.click(boutonPayer());
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/colis\/colis-c-/));
    expect(creations).toEqual([CREATION_DEMO]);
    expect(pathname(routeur)).not.toMatch(/\/(relais|livraison)$/);
  });

  it("n'envoie jamais le code de retrait : la création ne porte que ce que le voyageur a saisi", async () => {
    const creations: contrats.DemandeCreationColis[] = [];
    rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await userEvent.click(boutonPayer());
    await waitFor(() => expect(creations).toHaveLength(1));
    expect(JSON.stringify(creations[0])).not.toMatch(/code/i);
    expect(screen.queryByText(/\d{6}/)).not.toBeInTheDocument();
  });

  it.each([
    ["relais", () => ligneRelais(), /^\/colis\/colis-c-[^/]+\/relais$/],
    ["moto", () => ligneMoto(), /^\/colis\/colis-c-[^/]+\/livraison$/],
  ])(
    "avec « %s » choisi, ouvre ensuite l'écran qui règle ce mode pour le colis créé",
    async (_nom, ligne, chemin) => {
      const { routeur } = rendreColisEnvoi();
      await attendreEcran();
      await attendreTotal("2 200");
      await screen.findByText(/^Photo prise/);
      await userEvent.click(ligne());
      await attendreTotal(_nom === "relais" ? "2 500" : "3 200");
      await userEvent.click(boutonPayer());
      await waitFor(() => expect(pathname(routeur)).toMatch(chemin));
    },
  );

  it("garde l'assurance coupée dans la création du colis", async () => {
    const creations: contrats.DemandeCreationColis[] = [];
    rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await userEvent.click(interrupteur());
    await attendreTotal("1 700");
    await userEvent.click(boutonPayer());
    await waitFor(() => expect(creations).toHaveLength(1));
    expect(creations[0]).toMatchObject({ assurer: false, valeurDeclaree: 25000 });
  });

  it("refuse de payer un champ illisible, le signale et ne crée rien", async () => {
    const creations: unknown[] = [];
    const { routeur } = rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await remplacer("Pour qui", "Maman");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Prends le colis en photo et remplis tous les champs avant de payer.",
    );
    expect(champ("Pour qui")).toHaveAttribute("aria-invalid", "true");
    expect(champ("Contenu déclaré")).not.toHaveAttribute("aria-invalid");
    expect(creations).toEqual([]);
    expect(pathname(routeur)).toBe("/colis");

    // Corrigé, le même bouton paie.
    await remplacer("Pour qui", "Maman · 6 99 40 18 22");
    await userEvent.click(boutonPayer());
    await waitFor(() => expect(creations).toHaveLength(1));
  });

  it("signale un échec du paiement, garde la saisie et permet de réessayer", async () => {
    let appels = 0;
    const { routeur } = rendreColisEnvoi({
      operations: (originale) => [
        implementer(colis.OP_CREER_COLIS, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (
            originale(colis.OP_CREER_COLIS.nom).repondre as (
              p: typeof params,
              c: typeof ctx,
            ) => Promise<contrats.ColisCree>
          )(params, ctx);
        }),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await remplacer("Contenu déclaré", "Livres");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le paiement n'a pas abouti. Réessaie.",
    );
    expect(pathname(routeur)).toBe("/colis");
    expect(champ("Contenu déclaré")).toHaveValue("Livres");

    await userEvent.click(boutonPayer());
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/colis\/colis-c-/));
    expect(appels).toBe(2);
  });

  it("dit que le départ n'accepte plus de colis quand le serveur le refuse", async () => {
    rendreColisEnvoi({
      operations: () => [
        implementer(colis.OP_CREER_COLIS, () => {
          throw new ErreurHttp(422, "Départ fermé", "depart_ferme");
        }),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce départ n'accepte plus de colis. Réessaie un peu plus tard.",
    );
  });

  it("ne crée qu'un seul colis quand on touche deux fois le bouton", async () => {
    const creations: unknown[] = [];
    rendreColisEnvoi({
      latenceMs: 20,
      operations: (originale) => [
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await attendreTotal("2 200");
    await userEvent.dblClick(boutonPayer());
    await waitFor(() => expect(creations).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(creations).toHaveLength(1);
  });
});

describe("ColisEnvoi · photo avec la caméra de l'appareil", () => {
  const fichierPhoto = () =>
    document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;

  it("ouvre la caméra arrière dans l'écran, sans quitter le formulaire", async () => {
    const { routeur } = rendreColisEnvoi({ demonstration: false });
    await attendreEcran();
    expect(fichierPhoto()).toHaveAttribute("accept", "image/*");
    expect(fichierPhoto()).toHaveAttribute("capture", "environment");
    expect(pathname(routeur)).toBe("/colis");
  });

  it("commence sans photo ni saisie hors démonstration, puis lit la photo prise", async () => {
    const estimations: unknown[] = [];
    rendreColisEnvoi({
      demonstration: false,
      operations: (originale) => [
        surveiller(colis.OP_ESTIMER_PHOTO_COLIS, originale, (p) => estimations.push(p)),
      ],
    });
    await attendreEcran();
    expect(
      screen.getByRole("button", { name: "Touche pour prendre le colis en photo" }),
    ).toBeInTheDocument();
    expect(champ("Contenu déclaré")).toHaveValue("");
    expect(champ("Valeur (F)")).toHaveValue("");
    expect(estimations).toEqual([]);
    // Le destinataire suggéré et la destination viennent de l'API.
    expect(champ("Pour qui")).toHaveValue("Maman · 6 99 40 18 22");
    expect(champ("Où")).toHaveValue("Bafoussam · gare Alpha");

    await userEvent.upload(fichierPhoto(), new File(["x"], "colis.jpg", { type: "image/jpeg" }));
    expect(
      await screen.findByRole("button", {
        name: "Photo prise · taille estimée : petit carton · 2 kg",
      }),
    ).toBeInTheDocument();
    expect(estimations).toHaveLength(1);
    expect(estimations[0]).toMatchObject({ photoRef: expect.stringMatching(/^photo-/) });
  });

  it("refuse de payer sans photo, marque le cadre, puis paie avec la photo prise", async () => {
    const creations: contrats.DemandeCreationColis[] = [];
    const { routeur } = rendreColisEnvoi({
      demonstration: false,
      operations: (originale) => [
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await remplacer("Contenu déclaré", "Livres");
    await remplacer("Valeur (F)", "8000");
    await attendreTotal("2 200");

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Prends le colis en photo et remplis tous les champs avant de payer.",
    );
    expect(
      screen.getByRole("button", { name: "Touche pour prendre le colis en photo" }),
    ).toHaveAttribute("data-invalide", "true");
    expect(creations).toEqual([]);

    await userEvent.upload(fichierPhoto(), new File(["x"], "colis.jpg", { type: "image/jpeg" }));
    await screen.findByText(/^Photo prise/);
    await userEvent.click(boutonPayer());
    await waitFor(() => expect(pathname(routeur)).toMatch(/^\/colis\/colis-c-/));
    expect(creations).toEqual([
      expect.objectContaining({
        photoRef: expect.stringMatching(/^photo-/) as unknown as string,
        contenu: "Livres",
        valeurDeclaree: 8000,
        poidsKg: 2,
        assurer: true,
      }),
    ]);
  });

  it("signale une photo illisible sans bloquer le formulaire", async () => {
    rendreColisEnvoi({
      demonstration: false,
      operations: () => [
        implementer(colis.OP_ESTIMER_PHOTO_COLIS, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.upload(fichierPhoto(), new File(["x"], "colis.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La photo n'a pas pu être lue. Reprends-la.",
    );
    expect(
      screen.getByRole("button", { name: "Touche pour prendre le colis en photo" }),
    ).toBeInTheDocument();
    expect(champ("Pour qui")).toBeEnabled();
  });
});

describe("ColisEnvoi · destination", () => {
  it("cherche les départs de la nouvelle ville quand on quitte le champ « Où »", async () => {
    const demandes: contrats.ParamsOptionsEnvoi[] = [];
    rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_OPTIONS_ENVOI_COLIS, originale, (p) => demandes.push(p)),
      ],
    });
    await attendreEcran();
    expect(demandes).toEqual([{}]);

    await remplacer("Où", "Yaoundé · gare Mvan");
    // Tant qu'on écrit, rien n'est demandé.
    expect(demandes).toEqual([{}]);
    await userEvent.tab();
    await waitFor(() => expect(demandes).toEqual([{}, { ville: "Yaoundé" }]));
    // L'écran reste affiché pendant la recherche, la saisie est intacte.
    expect(champ("Où")).toHaveValue("Yaoundé · gare Mvan");
    expect(champ("Pour qui")).toHaveValue("Maman · 6 99 40 18 22");
  });

  it("ne relance rien quand la ville n'a pas changé", async () => {
    const demandes: contrats.ParamsOptionsEnvoi[] = [];
    rendreColisEnvoi({
      operations: (originale) => [
        surveiller(colis.OP_OPTIONS_ENVOI_COLIS, originale, (p) => demandes.push(p)),
      ],
    });
    await attendreEcran();
    await remplacer("Où", "Bafoussam · gare Alpha");
    await userEvent.tab();
    await remplacer("Où", "Bafoussam · autre gare");
    await userEvent.tab();
    expect(demandes).toEqual([{}]);
  });

  it("dit qu'aucun départ ne dessert une ville sans départ et refuse de payer", async () => {
    const creations: unknown[] = [];
    rendreColisEnvoi({
      operations: (originale) => [
        implementer(colis.OP_OPTIONS_ENVOI_COLIS, async (params, ctx) => {
          const reponse = originale(colis.OP_OPTIONS_ENVOI_COLIS.nom).repondre as (
            p: typeof params,
            c: typeof ctx,
          ) => contrats.OptionsEnvoiColis | Promise<contrats.OptionsEnvoiColis>;
          const options = await reponse(params, ctx);
          return params.ville ? { ...options, departs: [] } : options;
        }),
        surveiller(colis.OP_CREER_COLIS, originale, (p) => creations.push(p)),
      ],
    });
    await attendreEcran();
    await screen.findByText(/^Photo prise/);
    await remplacer("Où", "Garoua · gare nord");
    await userEvent.tab();
    expect(await screen.findByText("Aucun départ pour cette destination.")).toBeInTheDocument();

    await userEvent.click(boutonPayer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Aucun départ ne peut porter ce colis. Change la destination.",
    );
    expect(creations).toEqual([]);
  });
});

describe("ColisEnvoi · états", () => {
  it("affiche un chargement dans le style nuit tant que les options arrivent", async () => {
    rendreColisEnvoi({ latenceMs: 200 });
    const chargement = await screen.findByRole("status", {
      name: "Chargement de l'envoi de colis",
    });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Envoyer un colis" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    await attendreEcran();
    expect(
      screen.queryByRole("status", { name: "Chargement de l'envoi de colis" }),
    ).not.toBeInTheDocument();
  });

  it("affiche l'état vide quand aucun départ ne peut porter de colis", async () => {
    rendreColisEnvoi({
      operations: (originale) => [
        transformer(colis.OP_OPTIONS_ENVOI_COLIS, originale, (options) => ({
          ...options,
          departs: [],
        })),
      ],
    });
    expect(await screen.findByText("Aucun départ pour un colis")).toBeInTheDocument();
    expect(
      screen.getByText("Reviens à l'accueil, un départ sera bientôt proposé."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
    expect(screen.queryByRole("button", { name: /^Payer/ })).not.toBeInTheDocument();
  });

  it("affiche l'erreur avec un bouton qui recharge, puis l'écran", async () => {
    let appels = 0;
    rendreColisEnvoi({
      operations: (originale) => [
        implementer(colis.OP_OPTIONS_ENVOI_COLIS, (params, ctx) => {
          appels += 1;
          if (appels <= 1) throw new ErreurHttp(400, "Mauvaise requête", "REQUETE");
          return (
            originale(colis.OP_OPTIONS_ENVOI_COLIS.nom).repondre as (
              p: typeof params,
              c: typeof ctx,
            ) => Promise<contrats.OptionsEnvoiColis>
          )(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Impossible de charger l'envoi")).toBeInTheDocument();
    expect(within(alerte).getByText("Vérifie ta connexion, puis réessaie.")).toBeInTheDocument();

    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(champ("Pour qui")).toHaveValue("Maman · 6 99 40 18 22");
  });
});
