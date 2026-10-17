import { ErreurHttp } from "@afrimove/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  PROGRAMME,
  avecProfil,
  enveloppant,
  espionnerDepot,
  rendreLivreurDevenir,
  sansReponse,
} from "./test-outils";

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** Attend que le programme soit affiché. */
async function attendreEcran() {
  await screen.findByText("Tes particularités · on te propose les bonnes courses");
}

function bouton(nom: string | RegExp): HTMLElement {
  return screen.getByRole("button", { name: nom });
}

const inscrire = () => bouton(/^Je m'inscris/);

/** Les champs de fichier cachés des cases permis et assurance, dans l'ordre de la planche. */
function champsPhoto(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input[type=file]"));
}

const FICHIER = () => new File(["x"], "photo.jpg", { type: "image/jpeg" });

async function prendreLesPhotos(user: ReturnType<typeof userEvent.setup>) {
  const [permis, assurance] = champsPhoto();
  await user.upload(permis!, FICHIER());
  await user.upload(assurance!, FICHIER());
}

describe("LivreurDevenir · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, sous-titre et pastille de la course", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Deviens livreur" })).toBeInTheDocument();
    expect(
      screen.getByText("Programme ouvert · moto, vélo ou à pied · tu choisis tes heures"),
    ).toBeInTheDocument();
    expect(screen.getByText("700 F / COURSE")).toBeInTheDocument();
  });

  it("affiche les trois chiffres : la course, le meilleur livreur de la semaine, les livreurs", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    const course = screen.getByText("La course").parentElement!;
    expect(course).toHaveTextContent("700 F");
    expect(course).toHaveTextContent("≈ 4 km · payé le soir");
    const eric = screen.getByText("Éric T.").parentElement!;
    expect(eric).toHaveTextContent("31 k");
    expect(eric).toHaveTextContent("la semaine · 41 courses");
    const livreurs = screen.getByText("Livreurs").parentElement!;
    expect(livreurs).toHaveTextContent("86");
    expect(livreurs).toHaveTextContent("dans 12 villes");
  });

  it("propose les quatre moyens (moto choisie), la zone, les heures, la charge et le MoMo de la planche", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    const moyens = within(screen.getByRole("radiogroup", { name: "Je me déplace" }));
    expect(moyens.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Moto",
      "Vélo",
      "À pied",
      "Tricycle · gros colis",
    ]);
    expect(moyens.getByRole("radio", { name: "Moto" })).toBeChecked();
    expect(moyens.getByRole("radio", { name: "Vélo" })).not.toBeChecked();

    expect(screen.getByLabelText("Ma zone")).toHaveValue("Bafoussam · Tamdja, Djeleng, centre");
    expect(screen.getByLabelText("Mes heures")).toHaveValue("Soirs 17 h – 21 h");
    expect(screen.getByLabelText("Je porte jusqu’à")).toHaveValue("10 kg · colis courants");
    expect(screen.getByLabelText("MoMo pour être payé")).toHaveValue("6 75 •• •• 09 · MTN");
    expect(within(screen.getByLabelText("Ma zone")).getAllByRole("option")).toHaveLength(4);
    expect(within(screen.getByLabelText("Mes heures")).getAllByRole("option")).toHaveLength(4);
    expect(within(screen.getByLabelText("Je porte jusqu’à")).getAllByRole("option")).toHaveLength(
      3,
    );
  });

  it("affiche les pièces, les trois règles et la mention", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    expect(screen.getByText("CNI").parentElement).toHaveTextContent("déjà vérifiée");
    expect(screen.getByText("Permis A").parentElement).toHaveTextContent("photo · si moto");
    expect(screen.getByText("Assurance moto").parentElement).toHaveTextContent("photo · si moto");

    const titre = screen.getByText("Les 3 règles · tu les signes");
    const regles = titre.parentElement!;
    expect(regles).toHaveTextContent(
      "1. Jamais de remise sans le code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, à chaque fois. Le colis est assuré jusqu'à 50 000 F dès que tu scannes.",
    );
    expect(Array.from(regles.querySelectorAll("strong")).map((s) => s.textContent)).toEqual([
      "1.",
      "2.",
      "3.",
    ]);
    expect(
      screen.getByText(
        "Pas d'exclusivité : tu acceptes ou passes chaque course. 30 s pour répondre, puis elle va au suivant.",
      ),
    ).toBeInTheDocument();
  });

  it("n'a ni emoji ni bouton grisé", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    const ecran = document.querySelector("[data-planche='LivreurDevenir']")!.parentElement!;
    expect(ecran.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const b of screen.getAllByRole("button")) expect(b).toBeEnabled();
  });
});

describe("LivreurDevenir · navigation (identique à la maquette)", () => {
  it("« Retour » et « Plus tard » mènent à Moi", async () => {
    const { routeur } = rendreLivreurDevenir();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/moi");
    const plusTard = screen.getByRole("link", { name: "Plus tard" });
    expect(plusTard).toHaveAttribute("href", "/moi");
    await userEvent.click(plusTard);
    await waitFor(() => expect(pathname(routeur)).toBe("/moi"));
  });

  it("« Je m'inscris » dépose la demande puis ouvre le suivi (LivreurVerification)", async () => {
    const { source, demandes } = espionnerDepot();
    const { routeur } = rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    // À moto, les photos du permis et de l'assurance sont demandées.
    await prendreLesPhotos(user);
    expect(inscrire()).toHaveTextContent("Je m'inscris");
    expect(inscrire()).toHaveTextContent("pièces · 10 min de formation · 1re course");
    await user.click(inscrire());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur/suivi"));
    expect(demandes).toHaveLength(1);
  });
});

describe("LivreurDevenir · choix et demande envoyée", () => {
  it("envoie le moyen, la zone, les heures, la charge, le MoMo, les photos et la signature des règles", async () => {
    const { source, demandes } = espionnerDepot();
    rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Ma zone"), "Douala · Akwa, Bonanjo");
    await user.selectOptions(screen.getByLabelText("Mes heures"), "Week-ends");
    await user.selectOptions(screen.getByLabelText("Je porte jusqu’à"), "3 kg · petits colis");
    await prendreLesPhotos(user);
    await user.click(inscrire());
    await waitFor(() => expect(demandes).toHaveLength(1));
    const demande = demandes[0]!;
    expect(demande).toMatchObject({
      deplacement: "moto",
      zone: "Douala · Akwa, Bonanjo",
      heures: "Week-ends",
      chargeMax: "3 kg · petits colis",
      momo: { operateur: "mtn" },
      reglesAcceptees: true,
    });
    expect(demande.pieces.permisRef).toMatch(/^photo-/);
    expect(demande.pieces.assuranceRef).toMatch(/^photo-/);
    expect(demande.pieces.permisRef).not.toBe(demande.pieces.assuranceRef);
  });

  it("choisir un autre moyen change la sélection (un seul à la fois) et l'envoie", async () => {
    const { source, demandes } = espionnerDepot();
    rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Tricycle · gros colis" }));
    expect(screen.getByRole("radio", { name: "Tricycle · gros colis" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Moto" })).not.toBeChecked();
    await user.click(inscrire());
    await waitFor(() => expect(demandes).toHaveLength(1));
    expect(demandes[0]!.deplacement).toBe("tricycle");
  });

  it.each([
    ["Vélo", "velo"],
    ["À pied", "pied"],
    ["Tricycle · gros colis", "tricycle"],
  ])("%s : ni permis ni assurance demandés", async (libelle, valeur) => {
    const { source, demandes } = espionnerDepot();
    const { routeur } = rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: libelle }));
    // Les cases restent affichées comme sur la planche, mais ce ne sont plus des boutons de photo.
    expect(screen.getByText("Permis A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Permis A/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assurance moto/ })).not.toBeInTheDocument();
    expect(champsPhoto()).toHaveLength(0);
    await user.click(inscrire());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur/suivi"));
    expect(demandes[0]!.deplacement).toBe(valeur);
    expect(demandes[0]!.pieces).toEqual({});
  });

  it("à moto, sans les deux photos, l'inscription ne part pas et les cases manquantes sont marquées", async () => {
    const { source, demandes } = espionnerDepot();
    const { routeur } = rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(inscrire());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ajoute la photo du permis et celle de l'assurance",
    );
    expect(demandes).toHaveLength(0);
    expect(pathname(routeur)).toBe("/moi/devenir-livreur");
    const permis = bouton(/Permis A/);
    const assurance = bouton(/Assurance moto/);
    expect(permis).toHaveAttribute("data-manquante", "true");
    expect(assurance).toHaveAttribute("data-manquante", "true");

    // Une seule photo ne suffit pas ; la case prise n'est plus marquée.
    await user.upload(champsPhoto()[0]!, FICHIER());
    expect(permis).toHaveAttribute("aria-pressed", "true");
    expect(permis).not.toHaveAttribute("data-manquante");
    await user.click(inscrire());
    expect(demandes).toHaveLength(0);
    expect(bouton(/Assurance moto/)).toHaveAttribute("data-manquante", "true");
  });

  it("la case d'une pièce de moto ouvre le choix de photo", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    const [permis] = champsPhoto();
    let ouvert = 0;
    permis!.addEventListener("click", () => (ouvert += 1));
    await userEvent.click(bouton(/Permis A/));
    expect(ouvert).toBe(1);
    expect(permis).toHaveAttribute("capture", "environment");
    expect(permis).toHaveAttribute("accept", "image/*");
  });

  it("les cibles tactiles sont des boutons, des liens ou des champs étiquetés (aria-label « Retour » repris)", async () => {
    rendreLivreurDevenir();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    for (const nom of ["Ma zone", "Mes heures", "Je porte jusqu’à", "MoMo pour être payé"]) {
      expect(screen.getByLabelText(nom)).toBeInTheDocument();
    }
  });
});

describe("LivreurDevenir · numéro MoMo", () => {
  it("laissé tel quel, c'est le numéro du compte (profil) qui part, avec l'opérateur de la planche", async () => {
    // Le scénario de la planche n'a pas de profil : on le fournit, l'espion reste devant le dépôt.
    const { source, demandes } = espionnerDepot(avecProfil("+237675120409"));
    rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Vélo" }));
    await user.click(inscrire());
    await waitFor(() => expect(demandes).toHaveLength(1));
    expect(demandes[0]!.momo).toEqual({ telephone: "+237675120409", operateur: "mtn" });
  });

  it("modifié, c'est le numéro saisi qui part, avec l'opérateur écrit après la puce", async () => {
    const { source, demandes } = espionnerDepot();
    rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "À pied" }));
    const champ = screen.getByLabelText("MoMo pour être payé");
    await user.clear(champ);
    await user.type(champ, "6 99 12 34 56 · Orange");
    await user.click(inscrire());
    await waitFor(() => expect(demandes).toHaveLength(1));
    expect(demandes[0]!.momo).toEqual({ telephone: "+237699123456", operateur: "orange" });
  });

  it("un numéro incomplet est refusé avant l'envoi", async () => {
    const { source, demandes } = espionnerDepot();
    rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "À pied" }));
    const champ = screen.getByLabelText("MoMo pour être payé");
    await user.clear(champ);
    await user.type(champ, "6 99 12");
    await user.click(inscrire());
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent).join(" ")).toContain(
      "Le numéro MoMo est incomplet",
    );
    expect(champ).toBeInvalid();
    expect(demandes).toHaveLength(0);
  });
});

describe("LivreurDevenir · envoi : erreurs et double appui", () => {
  it("un échec du serveur affiche un message et laisse réessayer", async () => {
    const source = enveloppant("partenaires.livreur.envoyer", (_p, appel) => {
      if (appel === 1) throw new ErreurHttp(503, "Indisponible");
    });
    const { routeur } = rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Vélo" }));
    await user.click(inscrire());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L'inscription n'a pas pu être envoyée",
    );
    expect(pathname(routeur)).toBe("/moi/devenir-livreur");
    await user.click(inscrire());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur/suivi"));
  });

  it("« déjà livreur » le dit, sans ouvrir le suivi", async () => {
    const source = enveloppant("partenaires.livreur.envoyer", () => {
      throw new ErreurHttp(409, "Vous êtes déjà livreur", "deja_livreur");
    });
    const { routeur } = rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Vélo" }));
    await user.click(inscrire());
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu es déjà livreur AfriMove.");
    expect(pathname(routeur)).toBe("/moi/devenir-livreur");
  });

  it("une demande déjà en cours mène à son suivi", async () => {
    const source = enveloppant("partenaires.livreur.envoyer", () => {
      throw new ErreurHttp(409, "Une demande est déjà en cours", "demande_en_cours");
    });
    const { routeur } = rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Vélo" }));
    await user.click(inscrire());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-livreur/suivi"));
  });

  it("un double appui ne dépose qu'une demande", async () => {
    const { source, demandes } = espionnerDepot();
    rendreLivreurDevenir(source);
    await attendreEcran();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Vélo" }));
    const b = inscrire();
    await user.dblClick(b);
    await waitFor(() => expect(demandes).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(demandes).toHaveLength(1);
  });
});

describe("LivreurDevenir · états chargement, vide et erreur", () => {
  it("chargement : des blocs gris dans le style nuit, avec Retour et Plus tard", async () => {
    rendreLivreurDevenir(sansReponse(PROGRAMME.nom));
    const zone = await screen.findByRole("status", { name: "Chargement du programme livreur" });
    expect(zone).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/moi");
    expect(screen.getByRole("link", { name: "Plus tard" })).toHaveAttribute("href", "/moi");
    expect(screen.queryByRole("button", { name: /Je m'inscris/ })).not.toBeInTheDocument();
  });

  it("vide : le programme n'est pas ouvert (404)", async () => {
    rendreLivreurDevenir(
      enveloppant(PROGRAMME.nom, () => {
        throw new ErreurHttp(404, "Introuvable");
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Le programme n'est pas ouvert pour le moment" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Je m'inscris/ })).not.toBeInTheDocument();
  });

  it("erreur : message, « Réessayer » recharge le programme", async () => {
    rendreLivreurDevenir(
      enveloppant(PROGRAMME.nom, (_p, appel) => {
        if (appel === 1) throw new ErreurHttp(500, "Panne");
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Programme indisponible");
    expect(screen.getByRole("link", { name: "Plus tard" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(inscrire()).toBeInTheDocument();
  });
});
