import { ErreurHttp, colis, implementer } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { CODE_RETRAIT_COLIS_0017, ecrans } from "@afrimove/fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rendreRelaisApp, surveiller, transformer } from "./rendre-relaisapp";

const colisDeLaPlanche = ecrans.RelaisApp.entites.colis ?? [];
const colis0017 = colisDeLaPlanche[0]!;
const colis0011 = colisDeLaPlanche[1]!;

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** Attend que l'espace du relais soit affiché (le h1 est déjà là pendant le chargement). */
async function attendreEcran() {
  await screen.findByText("Boutique Mama Fotso");
}

const champCode = () =>
  screen.getByRole("textbox", { name: "Code de retrait donné par le client" });
const caseCode = () => screen.getAllByTestId("case-code").map((c) => c.textContent);
const boutonRemis = () => screen.getByRole("button", { name: /^Colis remis · photo/ });
const champPhoto = () => screen.getByTestId("photo-colis");
const photo = () => new File(["x"], "colis.jpg", { type: "image/jpeg" });
const piece = () => screen.getByRole("checkbox", { name: "Pièce d'identité vérifiée" });

/** Complète le code de démonstration (48291) avec le dernier chiffre. */
async function taperDernierChiffre(chiffre = "3") {
  await userEvent.type(champCode(), chiffre);
}

/** Remplace le code de démonstration par un autre code complet. */
async function taperCode(code: string) {
  await userEvent.clear(champCode());
  await userEvent.type(champCode(), code);
}

describe("RelaisApp · rendu de la planche", () => {
  it("affiche l'en-tête, les trois tuiles, les deux actions, la remise en cours, la liste et le bouton du scénario de démo", async () => {
    rendreRelaisApp();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "App du point relais" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Point relais AfriMove · Bafoussam · ouvert")).toBeInTheDocument();
    expect(screen.getByText("4,9 ★")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ inscrire une boutique" })).toHaveAttribute(
      "href",
      "/moi/devenir-relais",
    );

    expect(screen.getByText("En garde").parentElement).toHaveTextContent("En garde7/30");
    expect(screen.getByText("Arrivent").parentElement).toHaveTextContent("Arrivent3vers 13:30");
    expect(screen.getByText("Semaine").parentElement).toHaveTextContent(
      "Semaine8 40042 remis · lundi MoMo",
    );

    expect(screen.getByRole("button", { name: "Remettre code + pièce · touche 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Recevoir scanner l'étiquette" })).toBeVisible();

    const remise = screen.getByRole("region", { name: "Remise en cours" });
    expect(within(remise).getByText("C-…-0017 · pour Ngo Thérèse")).toBeInTheDocument();
    expect(caseCode()).toEqual(["4", "8", "2", "9", "1", "_"]);
    expect(
      within(remise).getByText(
        "Pièce vérifiée : CNI au nom de Ngo Thérèse. Ne pas photographier la pièce. Photo du colis remis à la fin.",
      ),
    ).toBeInTheDocument();
    expect(piece()).toBeChecked();

    const garde = screen.getByRole("region", { name: "En garde · 7" });
    expect(within(garde).getByText("repris à J+7")).toBeInTheDocument();
    const lignes = within(garde).getAllByRole("button");
    expect(lignes.map((l) => l.textContent)).toEqual([
      "C-…-0011 · Kamdem J. · 1 kg · depuis 2 j6 71 …",
      "C-…-0009 · Tagne M. · 4 kg · depuis 6 j · rappel envoyé6 93 …",
    ]);
    expect(within(lignes[1]!).getByText("depuis 6 j · rappel envoyé")).toBeInTheDocument();

    expect(boutonRemis()).toHaveTextContent("Colis remis · photo · + 200 F");
  });

  it("n'affiche le badge « TOUCHE n » dans aucun cas : la planche n'en a pas", async () => {
    rendreRelaisApp({ conception: true });
    await attendreEcran();
    expect(screen.queryByText(/^TOUCHE/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remettre code + pièce · touche 1" }),
    ).toBeInTheDocument();
  });

  it("n'a aucun bouton grisé, et chaque champ et case est nommé", async () => {
    rendreRelaisApp();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(champCode()).toBeEnabled();
    expect(piece()).toBeEnabled();
  });

  it("ne reprend la saisie et la pièce de la planche que dans le scénario de démonstration", async () => {
    rendreRelaisApp({ sansDemo: true });
    await attendreEcran();
    expect(caseCode()).toEqual(["_", "_", "_", "_", "_", "_"]);
    expect(piece()).not.toBeChecked();
    expect(
      screen.getByText(
        "Pièce à vérifier : CNI au nom de Ngo Thérèse. Ne pas photographier la pièce. Photo du colis remis à la fin.",
      ),
    ).toBeInTheDocument();
  });
});

describe("RelaisApp · navigation", () => {
  it("« + inscrire une boutique » mène à RelaisDevenir", async () => {
    const { routeur } = rendreRelaisApp();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "+ inscrire une boutique" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais"));
  });

  it("« Remettre » reste sur l'écran et met le curseur dans le code", async () => {
    const { routeur } = rendreRelaisApp();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: /^Remettre/ }));
    expect(pathname(routeur)).toBe("/relais/accueil");
    expect(champCode()).toHaveFocus();
  });

  it("« Recevoir » reste sur l'écran et ouvre la réception, qu'un second appui referme", async () => {
    const { routeur } = rendreRelaisApp();
    await attendreEcran();
    const recevoir = screen.getByRole("button", { name: /^Recevoir/ });
    expect(recevoir).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(recevoir);
    expect(pathname(routeur)).toBe("/relais/accueil");
    expect(recevoir).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Numéro lu sur l'étiquette" })).toBeVisible();
    await userEvent.click(recevoir);
    expect(screen.queryByRole("textbox", { name: "Numéro lu sur l'étiquette" })).toBeNull();
  });
});

describe("RelaisApp · remise du colis", () => {
  it("remet le colis avec le code, la pièce et la photo du colis, puis recharge l'espace", async () => {
    const appels: contrats.RemiseColisRelais[] = [];
    rendreRelaisApp({
      operations: (originale) => [
        surveiller(colis.OP_REMETTRE_COLIS_RELAIS, originale, (p) => appels.push(p)),
      ],
    });
    await attendreEcran();

    await taperDernierChiffre();
    expect(caseCode()).toEqual(["4", "8", "2", "9", "1", "3"]);
    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());

    await screen.findByText("Colis C-DLA-270105-0017 remis · + 200 F");
    expect(appels).toEqual([
      {
        colisId: colis0017.id,
        code: CODE_RETRAIT_COLIS_0017,
        pieceVerifiee: true,
        photoRef: `photo-remise-${colis0017.id}`,
      },
    ]);
    // Rien d'autre que la référence du colis n'est envoyé : ni photo ni image de la pièce.
    expect(Object.keys(appels[0]!).sort()).toEqual([
      "code",
      "colisId",
      "photoRef",
      "pieceVerifiee",
    ]);

    // L'espace s'est rechargé : un colis de moins en garde, 200 F de plus cette semaine, plus de remise en cours.
    await waitFor(() =>
      expect(screen.getByText("En garde").parentElement).toHaveTextContent("En garde6/30"),
    );
    expect(screen.getByText("Semaine").parentElement).toHaveTextContent(
      "Semaine8 60043 remis · lundi MoMo",
    );
    expect(screen.getByText(/^Aucune remise en cours/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("case-code")).toHaveLength(0);
  });

  it("n'envoie rien tant que le code n'a pas ses six chiffres", async () => {
    const appels: unknown[] = [];
    rendreRelaisApp({
      operations: (originale) => [
        surveiller(colis.OP_REMETTRE_COLIS_RELAIS, originale, (p) => appels.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonRemis());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Saisissez les 6 chiffres du code du client.",
    );
    expect(champCode()).toHaveFocus();
    expect(appels).toEqual([]);
  });

  it("n'envoie rien tant que la pièce n'est pas vérifiée", async () => {
    const appels: unknown[] = [];
    rendreRelaisApp({
      operations: (originale) => [
        surveiller(colis.OP_REMETTRE_COLIS_RELAIS, originale, (p) => appels.push(p)),
      ],
    });
    await attendreEcran();
    await taperDernierChiffre();
    await userEvent.click(piece());
    expect(piece()).not.toBeChecked();
    await userEvent.click(boutonRemis());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Vérifiez la pièce d'identité avant de remettre le colis.",
    );
    expect(appels).toEqual([]);
  });

  it("garde seulement les chiffres du code, six au plus", async () => {
    rendreRelaisApp({ sansDemo: true });
    await attendreEcran();
    await userEvent.type(champCode(), "48a2-91 3777");
    expect(caseCode()).toEqual(["4", "8", "2", "9", "1", "3"]);
  });

  it("un code faux dit combien d'essais restent, vide le code, et le colis se bloque au troisième", async () => {
    rendreRelaisApp();
    await attendreEcran();

    await taperDernierChiffre("0");
    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Code incorrect. Il vous reste 2 essais.",
      ),
    );
    expect(caseCode()).toEqual(["_", "_", "_", "_", "_", "_"]);
    expect(champCode()).toHaveFocus();

    await taperCode("111111");
    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Code incorrect. Il vous reste 1 essai."),
    );

    await taperCode("222222");
    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Trop d'essais : ce colis est bloqué."),
    );

    // Même avec le bon code, le serveur garde le colis bloqué : l'écran ne remet rien.
    await taperCode(CODE_RETRAIT_COLIS_0017);
    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Trop d'essais : ce colis est bloqué."),
    );
    expect(screen.queryByText(/remis · \+ 200 F$/)).not.toBeInTheDocument();
  });

  it("un colis qui n'est plus en garde, ou une panne, donnent un message sans casser l'écran", async () => {
    let appel = 0;
    rendreRelaisApp({
      operations: () => [
        implementer(colis.OP_REMETTRE_COLIS_RELAIS, () => {
          appel += 1;
          throw appel === 1
            ? new ErreurHttp(409, "Pas en garde", "etat_incompatible")
            : new ErreurHttp(500, "Panne", "panne");
        }),
      ],
    });
    await attendreEcran();
    await taperDernierChiffre();

    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Ce colis n'est plus en garde chez vous.",
      ),
    );

    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "La remise n'a pas été enregistrée. Réessayez.",
      ),
    );
    expect(caseCode()).toEqual(["4", "8", "2", "9", "1", "3"]);
    expect(boutonRemis()).toBeEnabled();
  });

  it("annuler la prise de photo n'envoie rien", async () => {
    const appels: unknown[] = [];
    rendreRelaisApp({
      operations: (originale) => [
        surveiller(colis.OP_REMETTRE_COLIS_RELAIS, originale, (p) => appels.push(p)),
      ],
    });
    await attendreEcran();
    await taperDernierChiffre();
    await userEvent.click(boutonRemis());
    expect(appels).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toucher un colis de la liste le met en remise : code vide, pièce à contrôler", async () => {
    const appels: contrats.RemiseColisRelais[] = [];
    rendreRelaisApp({
      operations: (originale) => [
        surveiller(colis.OP_REMETTRE_COLIS_RELAIS, originale, (p) => appels.push(p)),
      ],
    });
    await attendreEcran();

    await userEvent.click(screen.getByRole("button", { name: /^C-…-0011/ }));
    const remise = screen.getByRole("region", { name: "Remise en cours" });
    expect(within(remise).getByText("C-…-0011 · pour Kamdem J.")).toBeInTheDocument();
    expect(caseCode()).toEqual(["_", "_", "_", "_", "_", "_"]);
    expect(piece()).not.toBeChecked();

    // Le code de Ngo Thérèse ne sert pas à Kamdem J. : rien n'est envoyé sans les six chiffres, ni sans pièce.
    await userEvent.click(boutonRemis());
    expect(screen.getByRole("alert")).toHaveTextContent("Saisissez les 6 chiffres");
    await userEvent.type(champCode(), "123456");
    await userEvent.click(boutonRemis());
    expect(screen.getByRole("alert")).toHaveTextContent("Vérifiez la pièce d'identité");
    expect(appels).toEqual([]);

    await userEvent.click(piece());
    await userEvent.click(boutonRemis());
    await userEvent.upload(champPhoto(), photo());
    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toMatchObject({ colisId: colis0011.id, code: "123456", pieceVerifiee: true });
    // Le code de ce colis est faux : l'écran reste sur lui et l'indique.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Code incorrect. Il vous reste 2 essais.",
      ),
    );
  });
});

describe("RelaisApp · réception d'un colis", () => {
  const champNumero = () => screen.getByRole("textbox", { name: "Numéro lu sur l'étiquette" });

  it("met le colis scanné en garde et recharge l'espace", async () => {
    const recus: contrats.ReceptionColisRelais[] = [];
    rendreRelaisApp({
      operations: (originale) => [
        surveiller(colis.OP_RECEVOIR_COLIS_RELAIS, originale, (p) => recus.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: /^Recevoir/ }));
    await userEvent.type(champNumero(), `${colis0011.numero}{Enter}`);

    await screen.findByText(`Colis ${colis0011.numero} reçu en garde.`);
    expect(recus).toEqual([{ numeroColis: colis0011.numero }]);
    expect(champNumero()).toHaveValue("");
  });

  it("dit quand le numéro est vide ou inconnu", async () => {
    rendreRelaisApp();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: /^Recevoir/ }));

    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la réception" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Saisissez le numéro de l'étiquette.");

    await userEvent.type(champNumero(), "C-XXX-000000-0000{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Aucun colis ne porte ce numéro."),
    );
  });
});

describe("RelaisApp · états", () => {
  it("chargement : l'en-tête de l'écran et des cartes vides qui pulsent", async () => {
    rendreRelaisApp({ latenceMs: 200 });
    const chargement = await screen.findByRole("status", {
      name: "Chargement de votre point relais",
    });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("heading", { level: 1, name: "App du point relais" }),
    ).toBeInTheDocument();
    await attendreEcran();
    expect(
      screen.queryByRole("status", { name: "Chargement de votre point relais" }),
    ).not.toBeInTheDocument();
  });

  it("erreur : un message et de quoi réessayer, qui recharge l'espace", async () => {
    let appels = 0;
    rendreRelaisApp({
      operations: () => [
        implementer(colis.OP_ESPACE_RELAIS, () => {
          appels += 1;
          throw new ErreurHttp(400, "Panne simulée", "panne");
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger votre point relais");
    expect(alerte).toHaveTextContent("Vérifiez la connexion, puis réessayez.");
    const avant = appels;
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(appels).toBeGreaterThan(avant));
  });

  it("erreur passagère : la relecture affiche l'espace", async () => {
    rendreRelaisApp({
      operations: (originale) => [
        transformer(colis.OP_ESPACE_RELAIS, originale, (espace, appel) => {
          if (appel === 1) throw new ErreurHttp(400, "Panne simulée", "panne");
          return espace;
        }),
      ],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    await attendreEcran();
  });

  it("vide : pas de point relais pour ce compte, avec le lien d'inscription", async () => {
    const { routeur } = rendreRelaisApp({
      operations: () => [
        implementer(colis.OP_ESPACE_RELAIS, () => {
          throw new ErreurHttp(404, "Aucun relais", "introuvable");
        }),
      ],
    });
    await screen.findByText("Aucun point relais");
    expect(
      screen.getByText("Votre boutique n'est pas encore inscrite comme point relais."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "+ inscrire une boutique" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais"));
  });

  it("garde vide : aucun colis en garde, la mise en page tient", async () => {
    rendreRelaisApp({
      operations: (originale) => [
        transformer(colis.OP_ESPACE_RELAIS, originale, (espace) => ({
          ...espace,
          remiseEnCours: null,
          enGarde: [],
          resume: { ...espace.resume, enGarde: 0 },
        })),
      ],
    });
    await attendreEcran();
    expect(screen.getByText("Aucun colis en garde pour le moment.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "En garde · 0" })).toBeInTheDocument();
    expect(screen.getByText(/^Aucune remise en cours/)).toBeInTheDocument();
    await userEvent.click(boutonRemis());
    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez d'abord un colis à remettre.");
  });
});
