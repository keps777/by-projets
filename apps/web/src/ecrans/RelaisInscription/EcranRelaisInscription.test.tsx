import { ErreurHttp, colis, implementer } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CLE_BROUILLON, oublierBrouillon } from "./fiche";
import {
  rendreFiche,
  surveiller,
  transformer,
  type OptionsRendu,
} from "./rendre-relais-inscription";

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;

/** Attend que la fiche soit affichée (le titre est déjà là pendant le chargement). */
async function attendreFiche() {
  await screen.findByRole("textbox", { name: "Nom de la boutique" });
}

const nom = () => screen.getByRole("textbox", { name: "Nom de la boutique" });
const momo = () => screen.getByRole("textbox", { name: "MoMo pour être payé" });
const envoyer = () => screen.getByRole("button", { name: /^Envoyer ma fiche/ });
const plusTard = () => screen.getByRole("button", { name: /^Plus tard/ });
const facade = () => screen.getByRole("button", { name: /Photo de la façade/ });
const fichierPhoto = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

/** Prend la photo de la façade (le téléversement n'est pas dans ce périmètre : une référence est gardée). */
async function prendreLaPhoto() {
  await userEvent.upload(fichierPhoto(), new File(["x"], "facade.jpg", { type: "image/jpeg" }));
}

/** Les appels reçus par le mock, pour le brouillon et pour l'envoi. */
function journaux() {
  const brouillons: Array<{ fiche: Partial<contrats.FicheRelais> }> = [];
  const envois: contrats.FicheRelais[] = [];
  const operations: OptionsRendu["operations"] = (originale) => [
    surveiller(colis.OP_ENREGISTRER_BROUILLON_RELAIS, originale, (p) => brouillons.push(p)),
    surveiller(colis.OP_ENVOYER_FICHE_RELAIS, originale, (p) => envois.push(p)),
  ];
  return { brouillons, envois, operations };
}

beforeEach(() => oublierBrouillon());

describe("RelaisInscription · rendu de la planche", () => {
  it("affiche l'en-tête, les champs préremplis de la démo, les pièces, l'engagement et les actions", async () => {
    rendreFiche();
    await attendreFiche();

    expect(screen.getByRole("heading", { level: 1, name: "Ta boutique" })).toBeInTheDocument();
    expect(screen.getByText("Étape 1 / 3 · la fiche · tout se corrige après")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();

    expect(nom()).toHaveValue("Boutique Chez Thérèse");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("Boutique · alimentation");
    expect(screen.getByRole("combobox", { name: "Ouvert" })).toHaveValue("7 h – 20 h · lun.–sam.");
    expect(screen.getByRole("combobox", { name: "Taille des colis acceptés" })).toHaveValue(
      "Petits et moyens (≤ 10 kg)",
    );
    expect(momo()).toHaveValue("6 99 •• •• 41 · Orange");

    expect(screen.getByText("Position · détectée")).toBeInTheDocument();
    expect(screen.getByText("Bafoussam · Tamdja, face école publique")).toBeInTheDocument();

    expect(screen.getByText("Photo de la façade")).toBeInTheDocument();
    expect(screen.getByText(/pour que les clients te trouvent/)).toBeInTheDocument();
    expect(screen.getByText("CNI · Ngo Thérèse")).toBeInTheDocument();
    expect(screen.getByText(/déjà vérifiée à ton inscription AfriMove/)).toBeInTheDocument();

    expect(screen.getByText("Tu t’engages à")).toBeInTheDocument();
    expect(
      screen.getByText(/Scanner chaque colis à la réception et à la remise/),
    ).toHaveTextContent(
      "AfriMove assure la perte jusqu'à 50 000 F par colis dès lors que les scans sont faits.",
    );
    expect(
      screen.getByText("Tes infos servent à te trouver sur la carte et à te payer. Rien d'autre."),
    ).toBeInTheDocument();

    expect(plusTard()).toHaveTextContent("Plus tardbrouillon gardé");
    expect(envoyer()).toHaveTextContent("Envoyer ma fiche" + "un agent te rappelle sous 72 h");
  });

  it("propose les choix de la maquette dans chaque liste", async () => {
    rendreFiche();
    await attendreFiche();
    const choix = (nomListe: string) =>
      within(screen.getByRole("combobox", { name: nomListe }))
        .getAllByRole("option")
        .map((o) => o.textContent);
    expect(choix("Type")).toEqual([
      "Boutique · alimentation",
      "Pharmacie",
      "Call-box",
      "Quincaillerie",
      "Salon de coiffure",
      "Autre",
    ]);
    expect(choix("Ouvert")).toEqual([
      "7 h – 20 h · lun.–sam.",
      "7 h – 22 h · 7 j / 7",
      "8 h – 18 h · lun.–ven.",
    ]);
    expect(choix("Taille des colis acceptés")).toEqual([
      "Petits et moyens (≤ 10 kg)",
      "Petits seulement (≤ 3 kg)",
      "Tous (≤ 30 kg)",
    ]);
  });

  it("met « et » en gras dans l'engagement, comme la planche", async () => {
    rendreFiche();
    await attendreFiche();
    const gras = screen.getByText("et", { selector: "strong" });
    expect(gras.parentElement).toHaveTextContent("le code et la pièce");
  });

  it("dessine trois traits d'étape dont le premier est l'étape courante", async () => {
    rendreFiche();
    await attendreFiche();
    const traits = Array.from(document.querySelectorAll("[data-courante]"));
    expect(traits.map((t) => t.getAttribute("data-courante"))).toEqual(["true", "false", "false"]);
  });

  it("la case de la photo est une cible tactile, la CNI déjà vérifiée n'est pas un bouton", async () => {
    rendreFiche();
    await attendreFiche();
    expect(facade()).toBeEnabled();
    expect(screen.queryByRole("button", { name: /CNI/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/bientôt/i)).not.toBeInTheDocument();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
  });
});

describe("RelaisInscription · navigation", () => {
  it("« Retour » mène à RelaisDevenir", async () => {
    const { routeur } = rendreFiche();
    await attendreFiche();
    await userEvent.click(screen.getByRole("button", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais"));
  });

  it("« Plus tard » mène à Moi", async () => {
    const { routeur } = rendreFiche();
    await attendreFiche();
    await userEvent.click(plusTard());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi"));
  });

  it("« Envoyer ma fiche » mène à RelaisVerification une fois la fiche complète", async () => {
    const { routeur } = rendreFiche();
    await attendreFiche();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/suivi"));
  });
});

describe("RelaisInscription · le brouillon est conservé", () => {
  it("« Plus tard » enregistre ce qui est déjà bon, sans le MoMo masqué", async () => {
    const { brouillons, operations } = journaux();
    rendreFiche({ operations });
    await attendreFiche();
    await userEvent.clear(nom());
    await userEvent.type(nom(), "Chez Paul");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "Pharmacie");
    await userEvent.click(plusTard());

    await waitFor(() => expect(brouillons).toHaveLength(1));
    expect(brouillons[0]?.fiche).toEqual({
      nom: "Chez Paul",
      type: "Pharmacie",
      ouvert: "7 h – 20 h · lun.–sam.",
      position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face école publique" },
      tailleMax: "Petits et moyens (≤ 10 kg)",
    });
  });

  it("« Plus tard » enregistre même une fiche qu'on n'a pas touchée", async () => {
    const { brouillons, operations } = journaux();
    rendreFiche({ operations });
    await attendreFiche();
    await userEvent.click(plusTard());
    await waitFor(() => expect(brouillons).toHaveLength(1));
  });

  it("quitter par « Retour » enregistre ce qui a changé, une seule fois", async () => {
    const { brouillons, operations } = journaux();
    const { routeur } = rendreFiche({ operations });
    await attendreFiche();
    await userEvent.clear(nom());
    await userEvent.type(nom(), "Chez Paul");
    await userEvent.click(screen.getByRole("button", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais"));
    await waitFor(() => expect(brouillons).toHaveLength(1));
    expect(brouillons[0]?.fiche.nom).toBe("Chez Paul");
  });

  it("ne renvoie rien au serveur quand rien n'a changé et qu'on quitte par « Retour »", async () => {
    const { brouillons, operations } = journaux();
    const { routeur } = rendreFiche({ operations });
    await attendreFiche();
    await userEvent.click(screen.getByRole("button", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais"));
    expect(brouillons).toHaveLength(0);
  });

  it("garde la saisie sur l'appareil à chaque frappe, sans le numéro MoMo", async () => {
    rendreFiche();
    await attendreFiche();
    await userEvent.clear(nom());
    await userEvent.type(nom(), "Chez Paul");
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();

    const garde = JSON.parse(localStorage.getItem(CLE_BROUILLON) ?? "{}") as Record<
      string,
      unknown
    >;
    expect(garde).toMatchObject({ nom: "Chez Paul", type: "Boutique · alimentation" });
    expect(String(garde.facadeRef)).toMatch(/^photo-/);
    expect(localStorage.getItem(CLE_BROUILLON)).not.toContain("699");
  });

  it("retrouve la saisie quand l'utilisateur revient, même si le serveur n'a rien gardé", async () => {
    localStorage.setItem(
      CLE_BROUILLON,
      JSON.stringify({
        nom: "Chez Paul",
        type: "Pharmacie",
        ouvert: "7 h – 22 h · 7 j / 7",
        tailleMax: "Tous (≤ 30 kg)",
        facadeRef: "photo-abc",
      }),
    );
    rendreFiche();
    await attendreFiche();

    expect(nom()).toHaveValue("Chez Paul");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("Pharmacie");
    expect(screen.getByRole("combobox", { name: "Ouvert" })).toHaveValue("7 h – 22 h · 7 j / 7");
    expect(screen.getByRole("combobox", { name: "Taille des colis acceptés" })).toHaveValue(
      "Tous (≤ 30 kg)",
    );
    expect(facade()).toHaveAttribute("data-prise", "true");
  });

  it("reprend le brouillon du serveur quand l'appareil n'a rien", async () => {
    rendreFiche({
      operations: (originale) => [
        transformer(colis.OP_FORMULAIRE_RELAIS, originale, (f) => ({
          ...f,
          fiche: {
            ...f.fiche,
            nom: "Chez Marie",
            momo: { ...f.fiche.momo, valeurMasquee: "6 77 •• •• 12 · MTN" },
          },
        })),
      ],
    });
    await attendreFiche();
    expect(nom()).toHaveValue("Chez Marie");
    expect(momo()).toHaveValue("6 77 •• •• 12 · MTN");
  });
});

describe("RelaisInscription · envoyer la fiche", () => {
  it("envoie la fiche complète au format du contrat, puis oublie le brouillon", async () => {
    const { envois, operations } = journaux();
    const { routeur } = rendreFiche({ operations });
    await attendreFiche();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "Pharmacie");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Taille des colis acceptés" }),
      "Tous (≤ 30 kg)",
    );
    await userEvent.clear(momo());
    await userEvent.type(momo(), "6 99 12 34 41 · Orange");
    await prendreLaPhoto();
    expect(localStorage.getItem(CLE_BROUILLON)).not.toBeNull();
    await userEvent.click(envoyer());

    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/suivi"));
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({
      nom: "Boutique Chez Thérèse",
      type: "Pharmacie",
      ouvert: "7 h – 20 h · lun.–sam.",
      position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face école publique" },
      tailleMax: "Tous (≤ 30 kg)",
      momo: { telephone: "+237699123441", operateur: "orange" },
    });
    expect(envois[0]?.facadeRef).toMatch(/^photo-/);
    expect(localStorage.getItem(CLE_BROUILLON)).toBeNull();
  });

  it("ne part pas sans photo de la façade : message, case en erreur, rien d'envoyé", async () => {
    const { envois, operations } = journaux();
    const { routeur } = rendreFiche({ operations });
    await attendreFiche();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await userEvent.click(envoyer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ajoute la photo de la façade pour envoyer ta fiche.",
    );
    expect(facade()).toHaveAttribute("data-manquante", "true");
    expect(envois).toHaveLength(0);
    expect(pathname(routeur)).toBe("/moi/devenir-relais/fiche");

    await prendreLaPhoto();
    expect(screen.queryByText(/Ajoute la photo/)).not.toBeInTheDocument();
  });

  it("en un seul geste : le MoMo du compte laissé tel quel, la fiche part sans MoMo (le serveur prend celui du compte)", async () => {
    const { envois, operations } = journaux();
    const { routeur } = rendreFiche({ operations });
    await attendreFiche();
    expect(momo()).toHaveValue("6 99 •• •• 41 · Orange");
    await prendreLaPhoto();
    await userEvent.click(envoyer());

    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/suivi"));
    expect(envois).toHaveLength(1);
    expect(envois[0]).not.toHaveProperty("momo");
    expect(envois[0]).toMatchObject({
      nom: "Boutique Chez Thérèse",
      position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face école publique" },
    });
    expect(screen.queryByText("Écris ton numéro MoMo en entier (9 chiffres).")).toBeNull();
  });

  it("demande le numéro en entier quand on l'a retapé à moitié", async () => {
    const { envois, operations } = journaux();
    const { routeur } = rendreFiche({ operations });
    await attendreFiche();
    await prendreLaPhoto();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699 12");
    await userEvent.click(envoyer());

    expect(await screen.findByText("Écris ton numéro MoMo en entier (9 chiffres).")).toBeVisible();
    expect(momo()).toHaveAttribute("aria-invalid", "true");
    expect(envois).toHaveLength(0);
    expect(pathname(routeur)).toBe("/moi/devenir-relais/fiche");

    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    expect(momo()).not.toHaveAttribute("aria-invalid");
  });

  it("demande le nom de la boutique quand il est vide", async () => {
    const { envois, operations } = journaux();
    rendreFiche({ operations });
    await attendreFiche();
    await userEvent.clear(nom());
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());

    expect(await screen.findByText("Écris le nom de ta boutique.")).toBeVisible();
    expect(nom()).toHaveAttribute("aria-invalid", "true");
    expect(envois).toHaveLength(0);
  });

  it("MoMo sélectionné d'un coup au focus pour qu'on le retape", async () => {
    rendreFiche();
    await attendreFiche();
    const champ = momo() as HTMLInputElement;
    fireEvent.focus(champ);
    expect(champ.selectionStart).toBe(0);
    expect(champ.selectionEnd).toBe(champ.value.length);
  });

  it("une panne du serveur laisse la fiche en place avec un message, et on peut réessayer", async () => {
    let appels = 0;
    const { routeur } = rendreFiche({
      operations: () => [
        implementer(colis.OP_ENVOYER_FICHE_RELAIS, () => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return { dossier: "R-BAF-0215", deposeeLe: "2027-01-05T07:38:00+01:00", suite: "ok" };
        }),
      ],
    });
    await attendreFiche();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La fiche n'a pas été envoyée. Réessaie.",
    );
    expect(pathname(routeur)).toBe("/moi/devenir-relais/fiche");
    expect(nom()).toHaveValue("Boutique Chez Thérèse");
    expect(localStorage.getItem(CLE_BROUILLON)).not.toBeNull();

    await userEvent.click(envoyer());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/suivi"));
    expect(appels).toBe(2);
  });

  it("dit à quelqu'un qui est déjà point de relais qu'il l'est", async () => {
    rendreFiche({
      operations: () => [
        implementer(colis.OP_ENVOYER_FICHE_RELAIS, () => {
          throw new ErreurHttp(409, "Déjà relais", "deja_relais");
        }),
      ],
    });
    await attendreFiche();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu es déjà point de relais.");
  });

  it("mène au suivi quand une demande est déjà ouverte", async () => {
    const { routeur } = rendreFiche({
      operations: () => [
        implementer(colis.OP_ENVOYER_FICHE_RELAIS, () => {
          throw new ErreurHttp(409, "Demande en cours", "demande_en_cours");
        }),
      ],
    });
    await attendreFiche();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/suivi"));
  });

  it("un second clic pendant l'envoi n'envoie pas deux fois la fiche", async () => {
    const { envois, operations } = journaux();
    const { routeur } = rendreFiche({ operations, latenceMs: 40 });
    await attendreFiche();
    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());
    expect(envoyer()).toHaveAttribute("aria-busy", "true");
    await userEvent.click(envoyer());
    await waitFor(() => expect(pathname(routeur)).toBe("/moi/devenir-relais/suivi"));
    expect(envois).toHaveLength(1);
  });
});

describe("RelaisInscription · position non détectée", () => {
  const sansPosition: OptionsRendu["operations"] = (originale) => [
    transformer(colis.OP_FORMULAIRE_RELAIS, originale, (f) => ({
      ...f,
      fiche: { ...f.fiche, position: { ...f.fiche.position, valeur: "" } },
    })),
  ];

  it("laisse taper la position, et la demande avant d'envoyer", async () => {
    const { envois, operations } = journaux();
    rendreFiche({
      operations: (originale) => [...sansPosition(originale), ...operations(originale)],
    });
    await attendreFiche();
    const position = screen.getByRole("textbox", { name: "Position · détectée" });
    expect(position).toHaveValue("");

    await userEvent.clear(momo());
    await userEvent.type(momo(), "699123441");
    await prendreLaPhoto();
    await userEvent.click(envoyer());
    expect(
      await screen.findByText("Écris ta position sous la forme Ville · Quartier, repère."),
    ).toBeVisible();
    expect(envois).toHaveLength(0);

    await userEvent.type(position, "Douala · Akwa, face la poste");
    await userEvent.click(envoyer());
    await waitFor(() => expect(envois).toHaveLength(1));
    expect(envois[0]?.position).toEqual({
      ville: "Douala",
      quartier: "Akwa",
      repere: "face la poste",
    });
  });
});

describe("RelaisInscription · états", () => {
  it("chargement : l'en-tête et trois cartes qui pulsent, sans la fiche", async () => {
    rendreFiche({ latenceMs: 200 });
    const chargement = await screen.findByRole("status", { name: "Chargement de la fiche" });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Ta boutique" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      "/moi/devenir-relais",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await attendreFiche();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("vide : un texte, et le retour reste possible", async () => {
    rendreFiche({
      operations: () => [
        implementer(colis.OP_FORMULAIRE_RELAIS, () => {
          throw new ErreurHttp(404, "Introuvable", "introuvable");
        }),
      ],
    });
    expect(await screen.findByText("Fiche indisponible")).toBeVisible();
    expect(screen.getByText("Cette fiche n'est pas disponible pour le moment.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute(
      "href",
      "/moi/devenir-relais",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("erreur : un message, et « Réessayer » recharge la fiche", async () => {
    let appels = 0;
    rendreFiche({
      operations: (originale) => [
        implementer(colis.OP_FORMULAIRE_RELAIS, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (
            originale(colis.OP_FORMULAIRE_RELAIS.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("La fiche ne s'est pas chargée");
    expect(alerte).toHaveTextContent("Vérifie ta connexion puis réessaie.");
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreFiche();
    expect(nom()).toHaveValue("Boutique Chez Thérèse");
  });
});
