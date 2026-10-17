import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rendreApp } from "@/test/rendre";
import fr from "./i18n.fr.json";
import en from "./i18n.en.json";
import pcm from "./i18n.pcm.json";
import { montantCourt, montantFcfa } from "./formats";
import {
  DELAI_POSITION_MS,
  positionNavigateur,
  remplacerPeripheriques,
  type FournisseurPhoto,
  type PositionRelevee,
} from "./peripheriques";
import { rendreChauffeur } from "./rendre-chauffeur";

// Suite complète en parallèle : le premier rendu (chargement du chunk de la route) peut dépasser 1 s.
configure({ asyncUtilTimeout: 5000 });

const POSITION: PositionRelevee = { latitude: 3.8667, longitude: 10.2, precisionM: 12 };

let restaurer: (() => void) | null = null;

/** Position et photo de remplacement : aucun test ne touche le vrai navigateur. */
function doubles(options: { position?: PositionRelevee | null; photo?: File | null } = {}) {
  const photo: FournisseurPhoto = {
    prendre: async () => {
      const fichier = options.photo;
      return fichier ? { nom: fichier.name, taille: fichier.size, fichier } : null;
    },
  };
  restaurer = remplacerPeripheriques({
    position: {
      position: async () => (options.position === undefined ? POSITION : options.position),
    },
    photo,
  });
}

afterEach(() => {
  restaurer?.();
  restaurer = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Attend que la feuille de route soit affichée. */
async function attendreFeuille() {
  await screen.findByText("Trajet en cours");
}

const lienRetour = () => screen.getByRole("link", { name: "Retour" });
const lienArrivee = () => screen.getByRole("link", { name: /^Arrivé à Pouma · ouvrir les portes/ });
const boutonIncident = () => screen.getByRole("button", { name: /^Incident · panne/ });
const boutonRetard = () => screen.getByRole("button", { name: /^Retard · 20 min/ });
const photoJoute = new File(["jpeg"], "recu-parking.jpg", { type: "image/jpeg" });

describe("Chauffeur · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête, le trajet en cours et la vitesse", async () => {
    rendreApp({ fixtures: true, scenario: "Chauffeur", url: "/chauffeur" });
    await attendreFeuille();

    expect(
      screen.getByRole("heading", { level: 1, name: "Chauffeur · Mbarga" }),
    ).toBeInTheDocument();
    expect(screen.getByText("LT 412 AB · feuille de route du 5 janv.")).toBeInTheDocument();
    expect(screen.getByText("GPS")).toBeInTheDocument();

    expect(screen.getByText("Douala → Yaoundé")).toBeInTheDocument();
    expect(
      screen.getByText("parti 08:34 · 33 à bord · 14 colis · prochain arrêt Pouma 10:05"),
    ).toBeInTheDocument();
    expect(screen.getByText("84")).toHaveAttribute("data-exces", "false");
    expect(screen.getByText("km/h · limite 90")).toBeInTheDocument();
  });

  it("affiche les dépenses du trajet avec leur justificatif", async () => {
    rendreChauffeur();
    await attendreFeuille();

    const depenses = screen.getByRole("region", {
      name: "Dépenses du trajet · justificatif photo",
    });
    expect(within(depenses).getByText("remboursées au rapport")).toBeInTheDocument();
    const lignes = within(depenses).getAllByRole("listitem");
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toHaveTextContent("Carburant · Total Edéa45 000photo ✓");
    expect(lignes[1]).toHaveTextContent("Péage · 2 postes1 000photo ✓");
    expect(lignes[2]).toHaveTextContent("Autre (parking, réparation…)—+ ajouter");
  });

  it("affiche incident, retard et la semaine du chauffeur", async () => {
    rendreChauffeur();
    await attendreFeuille();

    expect(boutonIncident()).toHaveTextContent("1 touche · gare + voyageurs prévenus");
    expect(boutonRetard()).toHaveTextContent("SMS automatique aux 33");

    const semaine = screen.getByRole("region", { name: "Ma semaine" });
    expect(within(semaine).getByText("paie le vendredi par MoMo")).toBeInTheDocument();
    for (const [valeur, libelle] of [
      ["9", "trajets"],
      ["2 310", "km"],
      ["0", "excès vitesse"],
      ["81 k", "à recevoir"],
    ] as const) {
      expect(within(semaine).getByText(libelle).previousElementSibling).toHaveTextContent(
        new RegExp(`^${valeur}$`),
      );
    }
    expect(within(semaine).getByText("0")).toHaveAttribute("data-ton", "bon");
  });

  it("passe la vitesse et les excès en rouge quand la limite est dépassée", async () => {
    rendreChauffeur({
      feuille: (f) => ({
        ...f,
        trajet: { ...f.trajet, vitesseKmh: 97 },
        semaine: { ...f.semaine, excesVitesse: 2 },
      }),
    });
    await attendreFeuille();
    expect(screen.getByText("97")).toHaveAttribute("data-exces", "true");
    expect(
      within(screen.getByRole("region", { name: "Ma semaine" })).getByText("2"),
    ).toHaveAttribute("data-ton", "exces");
  });

  it("éteint le point GPS quand le suivi ne répond pas", async () => {
    rendreChauffeur({ feuille: (f) => ({ ...f, gps: false }) });
    await attendreFeuille();
    expect(screen.getByText("GPS").firstElementChild).toHaveAttribute("data-actif", "false");
  });

  it("n'a aucun bouton grisé, ni emoji, et nomme son bouton rond", async () => {
    rendreChauffeur();
    await attendreFeuille();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(lienRetour()).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("n'affiche aucun badge « TOUCHE » (la planche n'en montre pas), même avec le flag conception", async () => {
    rendreApp({ fixtures: true, scenario: "Chauffeur", url: "/chauffeur", conception: true });
    await attendreFeuille();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
  });
});

describe("Chauffeur · navigation", () => {
  it("« Retour » mène au Quai (/embarquement)", async () => {
    const { routeur } = rendreChauffeur();
    await attendreFeuille();
    expect(lienRetour()).toHaveAttribute("href", "/embarquement");
    await userEvent.click(lienRetour());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/embarquement"));
  });

  it("« Arrivé à Pouma · ouvrir les portes » enregistre l'arrivée puis mène au Convoyeur (/convoyeur)", async () => {
    doubles();
    const { routeur, envoyes } = rendreChauffeur();
    await attendreFeuille();
    expect(lienArrivee()).toHaveAttribute("href", "/convoyeur");

    await userEvent.click(lienArrivee());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/convoyeur"));
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({
      type: "chauffeur.arrivee_arret",
      donnees: { arret: "Pouma", gps: POSITION },
    });
    expect(envoyes[0]?.donnees.departId).toEqual(expect.any(String));
  });

  it("reste sur la feuille avec une alerte si l'arrivée n'est pas enregistrée", async () => {
    doubles();
    const { routeur } = rendreChauffeur({ panne: "arrivee" });
    await attendreFeuille();
    await userEvent.click(lienArrivee());
    expect(await screen.findByRole("alert")).toHaveTextContent("L'arrivée n'a pas été enregistrée");
    expect(routeur.state.location.pathname).toBe("/chauffeur");
  });
});

describe("Chauffeur · incident et retard en 1 touche", () => {
  it("« Incident · panne » prévient la gare et les voyageurs avec la position du bus", async () => {
    doubles();
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();

    await userEvent.click(boutonIncident());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Incident signalé : la gare et 33 voyageurs sont prévenus.",
    );
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({
      type: "chauffeur.incident",
      donnees: { nature: "panne", gps: POSITION, note: null },
    });
    expect(envoyes[0]?.donnees.incidentId).toEqual(expect.any(String));
  });

  it("part quand même sans position (refusée ou indisponible)", async () => {
    doubles({ position: null });
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    await userEvent.click(boutonIncident());
    await screen.findByRole("status");
    expect(envoyes[0]?.donnees.gps).toBeNull();
  });

  it("garde le bouton actif et alerte si l'incident n'est pas parti", async () => {
    doubles();
    rendreChauffeur({ panne: "incident" });
    await attendreFeuille();
    await userEvent.click(boutonIncident());
    expect(await screen.findByRole("alert")).toHaveTextContent("L'incident n'a pas été envoyé");
    expect(boutonIncident()).toBeEnabled();
  });

  it("« Retard · 20 min » envoie le retard par défaut et le SMS part aux voyageurs", async () => {
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    await userEvent.click(boutonRetard());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Retard de 20 min annoncé : SMS envoyé à 33 voyageurs.",
    );
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({
      type: "chauffeur.retard",
      donnees: { minutes: 20 },
    });
  });

  it("alerte si le retard n'est pas parti", async () => {
    rendreChauffeur({ panne: "retard" });
    await attendreFeuille();
    await userEvent.click(boutonRetard());
    expect(await screen.findByRole("alert")).toHaveTextContent("Le retard n'a pas été envoyé");
  });
});

describe("Chauffeur · dépenses avec photo du justificatif", () => {
  async function ouvrirFormulaire() {
    await userEvent.click(screen.getByRole("button", { name: "+ ajouter" }));
    return screen.findByRole("dialog", { name: "Ajouter une dépense" });
  }

  it("refuse une dépense sans photo : elle n'est pas envoyée (non remboursable)", async () => {
    doubles({ photo: null });
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    const feuille = await ouvrirFormulaire();

    await userEvent.type(within(feuille).getByLabelText("Libellé"), "Parking Edéa");
    await userEvent.type(within(feuille).getByLabelText("Montant (FCFA)"), "12000");
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter la dépense" }));

    expect(await within(feuille).findByRole("alert")).toHaveTextContent(
      "sans photo, la dépense n'est pas remboursée",
    );
    expect(envoyes).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("exige un montant", async () => {
    doubles({ photo: photoJoute });
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    const feuille = await ouvrirFormulaire();
    await userEvent.click(within(feuille).getByRole("button", { name: "Prendre la photo" }));
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter la dépense" }));
    expect(await within(feuille).findByText("Indiquez le montant en FCFA.")).toBeInTheDocument();
    expect(envoyes).toHaveLength(0);
  });

  it("envoie la dépense avec la photo, referme la feuille et ajoute la ligne « photo ✓ »", async () => {
    doubles({ photo: photoJoute });
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    const feuille = await ouvrirFormulaire();

    await userEvent.type(within(feuille).getByLabelText("Libellé"), "Parking Edéa");
    await userEvent.type(within(feuille).getByLabelText("Montant (FCFA)"), "12000");
    expect(within(feuille).getByLabelText("Montant (FCFA)")).toHaveValue("12 000");
    await userEvent.click(within(feuille).getByRole("button", { name: "Prendre la photo" }));
    expect(within(feuille).getByText("photo jointe · recu-parking.jpg")).toBeInTheDocument();
    expect(within(feuille).getByRole("button", { name: "Reprendre la photo" })).toBeInTheDocument();
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter la dépense" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({
      type: "chauffeur.depense",
      donnees: {
        categorie: "autre",
        libelle: "Parking Edéa",
        montant: 12_000,
        justificatifRef: `photo:recu-parking.jpg:${photoJoute.size}`,
      },
    });

    const lignes = within(
      screen.getByRole("region", { name: "Dépenses du trajet · justificatif photo" }),
    ).getAllByRole("listitem");
    await waitFor(() => expect(lignes.length).toBeGreaterThanOrEqual(3));
    await screen.findByText("Parking Edéa");
    expect(screen.getByText("Parking Edéa").closest("li")).toHaveTextContent(
      "Parking Edéa12 000photo ✓",
    );
  });

  it("prend la catégorie choisie et son nom comme libellé quand il est vide", async () => {
    doubles({ photo: photoJoute });
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    const feuille = await ouvrirFormulaire();
    expect(within(feuille).getByRole("radio", { name: "Autre" })).toBeChecked();
    await userEvent.click(within(feuille).getByRole("radio", { name: "Péage" }));
    expect(within(feuille).getByRole("radio", { name: "Péage" })).toBeChecked();
    await userEvent.type(within(feuille).getByLabelText("Montant (FCFA)"), "500");
    await userEvent.click(within(feuille).getByRole("button", { name: "Prendre la photo" }));
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter la dépense" }));
    await waitFor(() => expect(envoyes).toHaveLength(1));
    expect(envoyes[0]?.donnees).toMatchObject({
      categorie: "peage",
      libelle: "Péage",
      montant: 500,
    });
  });

  it("alerte et garde la feuille ouverte si la dépense n'est pas partie", async () => {
    doubles({ photo: photoJoute });
    rendreChauffeur({ panne: "depense" });
    await attendreFeuille();
    const feuille = await ouvrirFormulaire();
    await userEvent.type(within(feuille).getByLabelText("Montant (FCFA)"), "700");
    await userEvent.click(within(feuille).getByRole("button", { name: "Prendre la photo" }));
    await userEvent.click(within(feuille).getByRole("button", { name: "Ajouter la dépense" }));
    expect(
      await within(feuille).findByText("La dépense n'a pas été envoyée. Réessayez."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("repart d'une feuille vierge à chaque ouverture, et « Annuler » ne laisse rien partir", async () => {
    doubles({ photo: photoJoute });
    const { envoyes } = rendreChauffeur();
    await attendreFeuille();
    let feuille = await ouvrirFormulaire();
    await userEvent.type(within(feuille).getByLabelText("Montant (FCFA)"), "900");
    await userEvent.click(within(feuille).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    feuille = await ouvrirFormulaire();
    expect(within(feuille).getByLabelText("Montant (FCFA)")).toHaveValue("");
    expect(envoyes).toHaveLength(0);
  });

  it("affiche « sans photo » en rouge pour une dépense sans justificatif", async () => {
    rendreChauffeur({
      feuille: (f) => ({
        ...f,
        depenses: {
          ...f.depenses,
          lignes: [
            ...f.depenses.lignes,
            {
              depenseId: "d-9",
              categorie: "autre",
              libelle: "Réparation",
              montant: 3000,
              justificatif: false,
            },
          ],
        },
      }),
    });
    await attendreFeuille();
    const ligne = (await screen.findByText("Réparation")).closest("li")!;
    expect(ligne).toHaveTextContent("Réparation3 000sans photo");
    expect(within(ligne).getByText("sans photo")).toHaveAttribute("data-manquant", "true");
  });
});

describe("Chauffeur · périphériques du téléphone", () => {
  it("prend la photo avec un champ fichier « image/* » en mode capture", async () => {
    rendreChauffeur();
    await attendreFeuille();
    await userEvent.click(screen.getByRole("button", { name: "+ ajouter" }));
    const feuille = await screen.findByRole("dialog");
    await userEvent.click(within(feuille).getByRole("button", { name: "Prendre la photo" }));

    const champ = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(champ).not.toBeNull();
    expect(champ).toHaveAttribute("accept", "image/*");
    expect(champ).toHaveAttribute("capture");
    fireEvent.change(champ!, { target: { files: [photoJoute] } });
    expect(await within(feuille).findByText("photo jointe · recu-parking.jpg")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("une prise de photo annulée ne joint rien", async () => {
    rendreChauffeur();
    await attendreFeuille();
    await userEvent.click(screen.getByRole("button", { name: "+ ajouter" }));
    const feuille = await screen.findByRole("dialog");
    await userEvent.click(within(feuille).getByRole("button", { name: "Prendre la photo" }));
    fireEvent(document.querySelector('input[type="file"]')!, new Event("cancel"));
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeNull());
    expect(within(feuille).queryByText(/photo jointe/)).not.toBeInTheDocument();
  });

  it("lit la position par navigator.geolocation (précision comprise)", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({
        coords: { latitude: 4.05, longitude: 9.7, accuracy: 20 },
        timestamp: 0,
      } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    expect(await positionNavigateur.position()).toEqual({
      latitude: 4.05,
      longitude: 9.7,
      precisionM: 20,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ timeout: DELAI_POSITION_MS }),
    );
  });

  it("renvoie « pas de position » si elle est refusée ou si le téléphone n'en a pas", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_: PositionCallback, refus: PositionErrorCallback) =>
          refus({} as GeolocationPositionError),
      },
    });
    expect(await positionNavigateur.position()).toBeNull();
    vi.stubGlobal("navigator", { ...navigator, geolocation: undefined });
    expect(await positionNavigateur.position()).toBeNull();
  });
});

describe("Chauffeur · états chargement, vide et erreur", () => {
  it("montre un chargement nuit avec le retour déjà actif", async () => {
    rendreChauffeur({ latenceMs: 400 });
    expect(
      await screen.findByRole("status", { name: "Chargement de la feuille de route" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("heading", { level: 1, name: "Chauffeur · feuille de route · incidents" }),
    ).toBeInTheDocument();
    expect(lienRetour()).toHaveAttribute("href", "/embarquement");
    await attendreFeuille();
  });

  it("montre l'état vide quand aucune feuille n'est affectée (404)", async () => {
    rendreChauffeur({ panne: "vide" });
    expect(await screen.findByText("Aucune feuille de route")).toBeInTheDocument();
    expect(lienRetour()).toBeInTheDocument();
  });

  it("montre l'erreur avec « Réessayer » qui recharge la feuille", async () => {
    rendreChauffeur({ panne: "erreur" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La feuille de route ne s'est pas chargée",
    );
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });
});

describe("Chauffeur · formats et langues", () => {
  it("formate les montants comme la planche", () => {
    expect(montantFcfa(45000)).toBe("45 000");
    expect(montantFcfa(2310)).toBe("2 310");
    expect(montantCourt(81000)).toBe("81 k");
    expect(montantCourt(81500)).toBe("81,5 k");
    expect(montantCourt(800)).toBe("800");
  });

  it("a les mêmes clés en français, anglais et pidgin", () => {
    const cles = (o: unknown, prefixe = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? cles(v, `${prefixe}${k}.`) : [`${prefixe}${k}`],
      );
    expect(cles(en).sort()).toEqual(cles(fr).sort());
    expect(cles(pcm).sort()).toEqual(cles(fr).sort());
  });
});
