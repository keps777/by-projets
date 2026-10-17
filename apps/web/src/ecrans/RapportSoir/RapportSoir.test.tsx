import {
  ErreurHttp,
  ErreurReseau,
  FournisseurApi,
  creerClientMock,
  implementer,
  patron,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ConceptionProvider } from "@afrimove/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import {
  echelleDe,
  ecart,
  francs,
  groupes,
  heureDouala,
  montantCourt,
  partCourte,
  pourcentEntier,
  recetteCourte,
  variation,
} from "./formats";
import fr from "./i18n.fr.json";
import { ranger } from "./lignes";
import { RapportVue, type EtatRapport } from "./rapport-vue";
import type { RapportSoir } from "./types";

/** Le rapport tel que l'API d'AM-171 le produit pour la planche (mêmes textes que `calcul.test.ts`). */
const RAPPORT: RapportSoir = {
  jour: "2027-01-05",
  envoyeA: "2027-01-05T21:00:00.000+01:00",
  titre: "Rapport du mardi 5 janvier · 3 gares",
  nbGares: 3,
  chiffres: {
    billets: 1004,
    variationBilletsPct: 6,
    colis: 312,
    litiges: 0,
    recette: 4_410_000,
    cash: 2_900_000,
    momo: 1_510_000,
  },
  gares: [
    {
      gareId: "gare-akwa",
      nom: "Akwa",
      billets: 491,
      ecart: -1000,
      remarques: ["3 guichets clôturés", "guichet 2, validé par Essono"],
    },
    {
      gareId: "gare-mvan",
      nom: "Mvan",
      billets: 338,
      ecart: 0,
      remarques: ["1 départ fusionné (16:00 + 16:30)"],
    },
    {
      gareId: "gare-bafoussam",
      nom: "Bafoussam",
      billets: 175,
      ecart: 0,
      remarques: ["soute pleine à 10:00"],
    },
  ],
  enRoute: {
    billetsConvoyeurs: 23,
    controles: 1,
    regularisations: 1,
    texte:
      "23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
  },
  remplissage: { moyenPct: 84, remarque: "le 09:30 Oméga part à 55 %" },
  annulations: { nombre: 5, montant: 20_000, toutesAvecPin: true },
  enLigne: { billets: 61, partPct: 6.1 },
  signatures: [
    { nom: "Essono", gare: "Akwa" },
    { nom: "Tchinda", gare: "Mvan" },
    { nom: "Fosso", gare: "Baf." },
  ],
  questionSuggeree: {
    question: "Pourquoi le 09:30 Oméga part si vide ?",
    reponse:
      "Trois jours de suite à 55 %. Alpha part 08:30 et 10:00 sur la même ligne, 500 F moins cher. Deux options : décaler à 11:00 (créneau vide chez tout le monde), ou aligner le prix. L'assistant a préparé la simulation.",
  },
};

type Impl = Scenario["operations"][number];

/** Client mock dont `GET /patron/rapports/soir` répond `reponse` (une valeur, ou une fonction à chaque appel). */
function clientRapport(
  reponse: RapportSoir | ((appel: number) => RapportSoir),
  appels: { n: number } = { n: 0 },
): ClientApi {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      const impl: Impl = implementer(patron.OP_RAPPORT_SOIR, () => {
        appels.n += 1;
        return typeof reponse === "function" ? reponse(appels.n) : reponse;
      });
      return { ...scenario, operations: [impl, ...scenario.operations] };
    },
  };
  return creerClientMock({ source, scenario: "RapportSoir", latenceMs: 0 });
}

function rendre(clientApi?: ClientApi) {
  return rendreApp({
    fixtures: true,
    scenario: "RapportSoir",
    url: "/rapport",
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreRapport() {
  return screen.findByText("Rapport du mardi 5 janvier · 3 gares");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** La ligne de la bulle dont le texte commence par celui-ci (« Akwa », « En route »…), espaces normalisés. */
function ligne(debut: string): string {
  const trouve = [...principal().querySelectorAll("span")].find(
    (s) => (s.textContent ?? "").startsWith(debut) && s.querySelector("strong") !== null,
  );
  if (!trouve) throw new Error(`Pas de ligne « ${debut} »`);
  return (trouve.textContent ?? "").replace(/\s+/g, " ");
}

describe("RapportSoir · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête de l'expéditeur vérifié avec l'heure du rapport", async () => {
    rendre();
    await attendreRapport();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Rapport du soir · WhatsApp 21 h",
    );
    expect(await screen.findByText("AfriMove · Alpha Voyages")).toBeInTheDocument();
    expect(screen.getByText("compte vérifié · répond en 2 min")).toBeInTheDocument();
    expect(screen.getByText("21:00")).toBeInTheDocument();
  });

  it("affiche le titre et les trois chiffres de la bulle", async () => {
    rendre();
    await attendreRapport();
    const bulle = principal();
    for (const [libelle, valeur, detail] of [
      ["Billets", "1 004", "+6 % vs hier"],
      ["Colis", "312", "0 litige"],
      ["Recette", "4,41 M", "cash 2,9 · MoMo 1,5"],
    ] as const) {
      const tuile = within(bulle).getByText(libelle).parentElement as HTMLElement;
      expect(within(tuile).getByText(valeur)).toBeInTheDocument();
      expect(within(tuile).getByText(detail)).toBeInTheDocument();
    }
  });

  it("écrit une ligne par gare puis en route, remplissage, annulations et en ligne", async () => {
    rendre();
    await attendreRapport();
    expect(ligne("Akwa")).toBe(
      "Akwa · 491 billets · 3 guichets clôturés · écart − 1 000 (guichet 2, validé par Essono)",
    );
    expect(ligne("Mvan")).toMatch(/^Mvan · 338 billets · écart 0 · 1 départ fusionné/);
    expect(ligne("Bafoussam")).toBe("Bafoussam · 175 billets · écart 0 · soute pleine à 10:00");
    expect(ligne("En route")).toBe(
      "En route · 23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
    );
    expect(ligne("Remplissage")).toBe("Remplissage · 84 % moyen · le 09:30 Oméga part à 55 %");
    expect(ligne("Annulations")).toBe(
      "Annulations · 5 (20 000 F), toutes avec PIN · En ligne · 61 billets (6 %)",
    );
  });

  it("l'écart de la gare est ambre quand il manque de l'argent, vert à zéro", async () => {
    rendre();
    await attendreRapport();
    const akwa = within(principal()).getByText("− 1 000");
    expect(akwa).toHaveAttribute("data-ton", "ambre");
    const zeros = within(principal()).getAllByText("0", { selector: "span[data-ton]" });
    expect(zeros).toHaveLength(2);
    for (const zero of zeros) expect(zero).toHaveAttribute("data-ton", "vert");
  });

  it("signe le rapport avec les superviseurs, puis la question et la réponse de l'assistant", async () => {
    rendre();
    await attendreRapport();
    expect(
      screen.getByText("21:00 · signé Essono (Akwa), Tchinda (Mvan), Fosso (Baf.)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pourquoi le 09:30 Oméga part si vide ?")).toBeInTheDocument();
    expect(screen.getByText(/^Trois jours de suite à 55 %\./)).toHaveTextContent(
      "L'assistant a préparé la simulation. Voir →",
    );
    expect(screen.getByText("Pose une question sur tes chiffres…")).toBeInTheDocument();
  });

  it("suit la navigation de la planche, sans aucune touche à donner pour lire", async () => {
    rendre();
    await attendreRapport();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    expect(screen.getByRole("link", { name: "Ouvrir le détail dans l'app" })).toHaveAttribute(
      "href",
      "/analyses",
    );
    expect(screen.getByRole("link", { name: "Voir →" })).toHaveAttribute("href", "/assistant");
    expect(screen.getByRole("link", { name: "Ouvrir l'assistant" })).toHaveAttribute(
      "href",
      "/assistant",
    );
    // Le rapport arrive seul : quatre liens de navigation, aucun bouton, aucun champ.
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("RapportSoir · le rapport tel que l'API le produit", () => {
  it("garde les parenthèses du départ fusionné et range les remarques autour de l'écart", async () => {
    rendre(clientRapport(RAPPORT));
    await attendreRapport();
    expect(ligne("Akwa")).toBe(
      "Akwa · 491 billets · 3 guichets clôturés · écart − 1 000 (guichet 2, validé par Essono)",
    );
    expect(ligne("Mvan")).toBe("Mvan · 338 billets · écart 0 · 1 départ fusionné (16:00 + 16:30)");
    expect(within(principal()).getByText("cash 2,9 · MoMo 1,51")).toBeInTheDocument();
  });

  it("n'affiche que ce que dit le rapport : autre jour, autres gares, autres chiffres", async () => {
    const autre: RapportSoir = {
      ...RAPPORT,
      titre: "Rapport du mercredi 6 janvier · 1 gare",
      envoyeA: "2027-01-06T21:00:00.000+01:00",
      chiffres: { ...RAPPORT.chiffres, billets: 12, colis: 3, litiges: 2, variationBilletsPct: 0 },
      gares: [
        {
          gareId: "g1",
          nom: "Edéa",
          billets: 12,
          ecart: 500,
          remarques: [
            "1 guichet clôturé sur 2",
            "guichet 2, caisse encore ouverte",
            "1 billet de cadence sans nom",
          ],
        },
      ],
    };
    rendre(clientRapport(autre));
    await screen.findByText("Rapport du mercredi 6 janvier · 1 gare");
    expect(ligne("Edéa")).toBe(
      "Edéa · 12 billets · 1 guichet clôturé sur 2 · écart + 500 (guichet 2, caisse encore ouverte) · 1 billet de cadence sans nom",
    );
    expect(within(principal()).getByText("+ 500")).toHaveAttribute("data-ton", "ambre");
    expect(within(principal()).getByText("2 litiges")).toBeInTheDocument();
    expect(within(principal()).getByText("0 % vs hier")).toHaveAttribute("data-tendance", "stable");
    expect(screen.queryByText("Akwa", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("une baisse des billets est signalée en rouge et écrite avec le vrai signe moins", async () => {
    rendre(
      clientRapport({ ...RAPPORT, chiffres: { ...RAPPORT.chiffres, variationBilletsPct: -3.5 } }),
    );
    await attendreRapport();
    const detail = within(principal()).getByText("−3,5 % vs hier");
    expect(detail).toHaveAttribute("data-tendance", "baisse");
  });

  it("recette sous le million : écrite en milliers, l'unité suit chaque montant", async () => {
    rendre(
      clientRapport({
        ...RAPPORT,
        chiffres: { ...RAPPORT.chiffres, recette: 850_000, cash: 600_000, momo: 250_000 },
      }),
    );
    await attendreRapport();
    expect(within(principal()).getByText("850 k")).toBeInTheDocument();
    expect(within(principal()).getByText("cash 600 k · MoMo 250 k")).toBeInTheDocument();
  });

  it("annulations : aucune, ou au moins une sans PIN, et un seul billet en ligne", async () => {
    rendre(
      clientRapport({
        ...RAPPORT,
        annulations: { nombre: 0, montant: 0, toutesAvecPin: true },
        enLigne: { billets: 1, partPct: 0.4 },
      }),
    );
    await attendreRapport();
    expect(ligne("Annulations")).toBe("Annulations · aucune · En ligne · 1 billet (0 %)");
  });

  it("annulations sans PIN : le dit", async () => {
    rendre(
      clientRapport({
        ...RAPPORT,
        annulations: { nombre: 2, montant: 7500, toutesAvecPin: false },
      }),
    );
    await attendreRapport();
    expect(ligne("Annulations")).toContain("2 (7 500 F), dont au moins une sans PIN");
  });

  it("remplissage sans départ faible : pas de remarque", async () => {
    rendre(clientRapport({ ...RAPPORT, remplissage: { moyenPct: 83.7, remarque: null } }));
    await attendreRapport();
    expect(ligne("Remplissage")).toBe("Remplissage · 84 % moyen");
  });

  it("sans signature ni question suggérée : la conversation s'arrête au rapport", async () => {
    rendre(
      clientRapport({
        ...RAPPORT,
        signatures: [],
        questionSuggeree: { question: "", reponse: "" },
      }),
    );
    await attendreRapport();
    expect(screen.getByText("21:00 · aucune signature")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir →" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pourquoi/)).not.toBeInTheDocument();
    // la zone de saisie et la flèche vers l'assistant restent
    expect(screen.getByRole("link", { name: "Ouvrir l'assistant" })).toBeInTheDocument();
  });

  it("sans gare : le dit", async () => {
    rendre(clientRapport({ ...RAPPORT, gares: [], nbGares: 0 }));
    await attendreRapport();
    expect(screen.getByText("Aucune gare dans ce rapport.")).toBeInTheDocument();
  });
});

describe("RapportSoir · états chargement, vide et erreur", () => {
  function rendreVue(etat: EtatRapport, reessayer?: () => void) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <RapportVue etat={etat} {...(reessayer ? { onReessayer: reessayer } : {})} />
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  it("chargement : la mise en page est là, aucun texte de donnée", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Chargement du rapport du soir")).toBeInTheDocument();
    expect(screen.queryByText(/^Rapport du \S+ \d/)).not.toBeInTheDocument();
    expect(screen.queryByText("1 004")).not.toBeInTheDocument();
    // l'en-tête et la zone de saisie restent
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
    expect(screen.getByText("compte vérifié · répond en 2 min")).toBeInTheDocument();
    expect(screen.getByText("AfriMove")).toBeInTheDocument();
    expect(screen.getByText("Pose une question sur tes chiffres…")).toBeInTheDocument();
  });

  it("vide : un message dans le style nuit", () => {
    rendreVue("vide");
    expect(screen.getByRole("status")).toHaveTextContent(fr.etats.vide);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("vide : le rapport n'est pas encore arrêté (404), ce n'est pas une panne", async () => {
    const base = sourceScenariosFixtures();
    const client = creerClientMock({
      source: {
        ...base,
        charger: async (nom) => {
          const scenario = await base.charger(nom);
          const impl: Impl = implementer(patron.OP_RAPPORT_SOIR, () => {
            throw new ErreurHttp(404, "Pas encore de rapport", "RAPPORT_PAS_ENCORE");
          });
          return { ...scenario, operations: [impl, ...scenario.operations] };
        },
      },
      scenario: "RapportSoir",
      latenceMs: 0,
    });
    rendre(client);
    expect(await screen.findByText(fr.etats.vide)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("erreur : message, bouton Réessayer, puis le rapport", async () => {
    const appels = { n: 0 };
    const base = sourceScenariosFixtures();
    const client = creerClientMock({
      source: {
        ...base,
        charger: async (nom) => {
          const scenario = await base.charger(nom);
          const impl: Impl = implementer(patron.OP_RAPPORT_SOIR, () => {
            appels.n += 1;
            if (appels.n === 1) throw new ErreurReseau("coupure");
            return RAPPORT;
          });
          return { ...scenario, operations: [impl, ...scenario.operations] };
        },
      },
      scenario: "RapportSoir",
      latenceMs: 0,
    });
    rendre(client);
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(fr.etats.erreur);
    expect(screen.queryByText("Rapport du mardi 5 janvier · 3 gares")).not.toBeInTheDocument();
    // la navigation reste utilisable
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreRapport();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("erreur en vue seule : le bouton Réessayer appelle onReessayer", async () => {
    let relances = 0;
    rendreVue("erreur", () => (relances += 1));
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(relances).toBe(1);
  });
});

describe("RapportSoir · formats", () => {
  it("groupes, écarts et montants comme la planche", () => {
    expect(groupes(1004)).toBe("1 004");
    expect(groupes(312)).toBe("312");
    expect(ecart(-1000)).toBe("− 1 000");
    expect(ecart(0)).toBe("0");
    expect(ecart(500)).toBe("+ 500");
    expect(francs(20_000)).toBe("20 000 F");
    expect(heureDouala("2027-01-05T21:00:00.000+01:00")).toBe("21:00");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("variation : signe, virgule décimale, zéro sans signe", () => {
    expect(variation(6)).toBe("+6 %");
    expect(variation(-3)).toBe("−3 %");
    expect(variation(0.7)).toBe("+0,7 %");
    expect(variation(0)).toBe("0 %");
    expect(pourcentEntier(83.7)).toBe("84");
  });

  it("recette courte : millions, milliers ou francs", () => {
    expect(recetteCourte(4_410_000)).toBe("4,41 M");
    expect(recetteCourte(2_610_000)).toBe("2,61 M");
    expect(recetteCourte(612_500)).toBe("612,5 k");
    expect(recetteCourte(612_000)).toBe("612 k");
    expect(recetteCourte(950)).toBe("950");
    expect(echelleDe(1_000_000)).toBe("M");
    expect(echelleDe(999_999)).toBe("k");
    expect(montantCourt(2_900_000, "M")).toBe("2,9");
    expect(partCourte(0, "M")).toBe("0");
    expect(partCourte(600_000, "k")).toBe("600 k");
    expect(partCourte(400, "F")).toBe("400");
  });

  it("range les remarques d'une gare autour de l'écart", () => {
    expect(
      ranger([
        "2 guichets clôturés",
        "guichet 1, validé par Essono",
        "soute pleine à 10:00",
        "guichet 2, clôturée sans comptage",
        "  ",
        "3 autres remarques",
      ]),
    ).toEqual({
      avant: ["2 guichets clôturés"],
      entreParentheses: ["guichet 1, validé par Essono", "guichet 2, clôturée sans comptage"],
      apres: ["soute pleine à 10:00", "3 autres remarques"],
    });
    expect(ranger([])).toEqual({ avant: [], entreParentheses: [], apres: [] });
  });
});
