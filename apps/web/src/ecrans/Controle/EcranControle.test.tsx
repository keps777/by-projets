import {
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  simulerFlux,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import type { SalleDeControle } from "./direct";
import { VueControle, type EtatEcran } from "./vue";

const planche = ecrans.Controle.donnees;

type Impl = Scenario["operations"][number];
type Repondre = (params: unknown, ctx: unknown) => SalleDeControle;

/** Client du scénario « Controle » dont on peut changer la lecture de la salle et le temps réel. */
function clientAvec(options: {
  salle?: (salle: SalleDeControle) => SalleDeControle;
  lecture?: (appel: number, originale: Repondre) => SalleDeControle;
  messages?: readonly unknown[];
}): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  let appels = 0;
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => {
      const scenario = await base.charger(nom);
      const operations = scenario.operations.map((impl): Impl => {
        if (impl.operation.nom !== patron.OP_SALLE_DE_CONTROLE.nom) return impl;
        const originale = impl.repondre as unknown as Repondre;
        return implementer(patron.OP_SALLE_DE_CONTROLE, (params, ctx) => {
          appels += 1;
          if (options.lecture) return options.lecture(appels, originale);
          const salle = originale(params, ctx);
          return options.salle ? options.salle(salle) : salle;
        });
      });
      const { messages } = options;
      return {
        ...scenario,
        operations,
        flux: messages
          ? [
              simulerFlux(patron.CANAL_DIRECT_CONTROLE, (_params, ctx) => {
                messages.forEach((message, i) =>
                  ctx.planifier(30 * (i + 1), () => ctx.emettre(message)),
                );
              }),
            ]
          : scenario.flux,
      };
    },
  };
  return creerClientMock({ source, scenario: "Controle", latenceMs: 0 });
}

function rendre(
  options: { masques?: string[]; clientApi?: ReturnType<typeof creerClientMock> } = {},
) {
  return rendreApp({
    fixtures: true,
    scenario: "Controle",
    url: "/controle",
    ...(options.masques ? { masques: options.masques } : {}),
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Salle de contrôle · Alpha Voyages");
}

const kpi = (cle: string) => document.querySelector<HTMLElement>(`[data-kpi="${cle}"]`)!;

async function salleDeDemo(): Promise<SalleDeControle> {
  const client = clientAvec({});
  const lecture = await client.executer(patron.OP_SALLE_DE_CONTROLE, undefined);
  return lecture;
}

function ligneGare(nom: string): HTMLElement {
  return within(screen.getByRole("table")).getByText(nom).closest("tr") as HTMLElement;
}

function lignesATraiter(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("a[data-type]"));
}

describe("Salle de contrôle · rendu de la planche", () => {
  it("affiche l'en-tête, la pastille et les cinq vues de la planche", async () => {
    rendre();
    await attendreEcran();

    expect(
      screen.getByRole("heading", { level: 1, name: "Salle de contrôle (web)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(planche.sousTitre)).toBeInTheDocument();
    expect(screen.getByText(planche.statut)).toBeInTheDocument();

    const vues = within(screen.getByRole("navigation", { name: "Vues" })).getAllByRole("link");
    expect(vues.map((v) => v.textContent)).toEqual(planche.vues);
    expect(vues[0]).toHaveAttribute("aria-current", "page");
    expect(vues.slice(1).every((v) => !v.hasAttribute("aria-current"))).toBe(true);
  });

  it("affiche les cinq chiffres avec leurs mentions", async () => {
    rendre();
    await attendreEcran();
    expect(kpi("recette")).toHaveTextContent("Recette du jour2,61 M+ 8 % vs mardi dernier");
    expect(kpi("billets")).toHaveTextContent("Billets612dont 37 en ligne · 11 en route");
    expect(kpi("colis")).toHaveTextContent("Colis1886 en correspondance · 0 litige");
    expect(kpi("remplissage")).toHaveTextContent("Remplissage86 %22 départs · 2 fusionnés");
    expect(kpi("ecarts")).toHaveTextContent("Écarts de caisse− 1 0001 caisse sur 9 · à valider");
  });

  it("l'écart de caisse est en ambre tant qu'il y en a un, neutre à zéro", async () => {
    rendre();
    await attendreEcran();
    expect(kpi("ecarts").className).toMatch(/kpiAlerte/);
    expect(kpi("billets").className).not.toMatch(/kpiAlerte/);
  });

  it("affiche le tableau des gares : montants, écart, prochain départ, superviseur", async () => {
    rendre();
    await attendreEcran();
    const lignes: Array<[string, string[]]> = [
      [
        "Douala Akwa",
        ["291", "98", "1 412 500", "− 1 000", "14:30 Yaoundé · 38/40", "Essono · en ligne"],
      ],
      [
        "Yaoundé Mvan",
        ["208", "61", "902 000", "0", "14:00 Douala · 40/40 · plein", "Tchinda · en ligne"],
      ],
      [
        "Bafoussam",
        ["113", "29", "431 000", "0", "15:00 Douala · 19/40", "Fosso · hors ligne 4 min"],
      ],
    ];
    for (const [nom, cellules] of lignes) {
      const ligne = ligneGare(nom);
      expect(
        within(ligne)
          .getAllByRole("cell")
          .slice(1)
          .map((c) => c.textContent),
      ).toEqual(cellules);
    }
    const colonnes = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(colonnes).toEqual(planche.gares.colonnes);
  });

  it("l'écart d'une gare est ambre quand il est non nul, vert à zéro", async () => {
    rendre();
    await attendreEcran();
    const ecarts = (nom: string) => within(ligneGare(nom)).getAllByRole("cell")[4]!;
    expect(ecarts("Douala Akwa").className).toMatch(/ambre/);
    expect(ecarts("Yaoundé Mvan").className).toMatch(/vert/);
  });

  it("affiche la carte : titre, aide, un point par bus, l'alerte du bus arrêté", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Bus en route · 9")).toBeInTheDocument();
    expect(screen.getByText("position GPS · 30 s")).toBeInTheDocument();
    const carte = screen.getByRole("img", {
      name: "Carte des bus en route entre Douala, Yaoundé et Bafoussam",
    });
    // 8 bus normaux + le bus en alerte + les 4 repères de ville
    expect(carte.querySelectorAll("circle[r='9']")).toHaveLength(8 + 1 + 1);
    for (const texte of [...planche.carte.villes, planche.carte.alerte]) {
      expect(within(carte as unknown as HTMLElement).getByText(texte)).toBeInTheDocument();
    }
  });

  it("affiche « À traiter », les ventes par heure et le rapport du soir", async () => {
    rendre();
    await attendreEcran();

    expect(screen.getByText("À traiter · 4")).toBeInTheDocument();
    expect(lignesATraiter().map((a) => a.textContent)).toEqual(
      planche.atraiter.liste.map((x) => `${x.texte}${x.quand}`),
    );

    expect(screen.getByText("Ventes par heure")).toBeInTheDocument();
    expect(screen.getByText(planche.ventesParHeure.lecture)).toBeInTheDocument();
    expect(screen.getByText("17 h · prévu")).toBeInTheDocument();
    for (const repere of ["05 h", "09 h", "13 h"]) {
      expect(screen.getByText(repere)).toBeInTheDocument();
    }

    expect(screen.getByText("Rapport du soir")).toBeInTheDocument();
    expect(screen.getByText(planche.rapport.texte)).toBeInTheDocument();
  });

  it("dessine douze barres : pic et heure en cours en ambre, trois heures prévues en pointillés", async () => {
    rendre();
    await attendreEcran();
    const barres = Array.from(document.querySelectorAll<HTMLElement>("[data-ton]"));
    expect(barres).toHaveLength(12);
    expect(barres.map((b) => b.dataset["ton"])).toEqual([
      "pic",
      "pic",
      "pic",
      "normal",
      "normal",
      "normal",
      "normal",
      "normal",
      "pic",
      "prevu",
      "prevu",
      "prevu",
    ]);
    // hauteurs de la planche (en %), à l'arrondi près des montants
    const visuel = ecrans.Controle.visuel["ventesParHeure"] as readonly number[];
    barres.forEach((barre, i) => {
      expect(Number.parseFloat(barre.style.height)).toBeCloseTo(visuel[i]!, 0);
    });
  });
});

describe("Salle de contrôle · navigation de la planche", () => {
  it("chaque vue ouvre son écran ; « Direct » reste sur l'écran", async () => {
    rendre();
    await attendreEcran();
    const vue = (nom: string) =>
      within(screen.getByRole("navigation", { name: "Vues" })).getByRole("link", { name: nom });
    expect(vue("Direct")).toHaveAttribute("href", "/controle");
    expect(vue("Analyses")).toHaveAttribute("href", "/analyses");
    expect(vue("Comptable")).toHaveAttribute("href", "/comptable");
    expect(vue("Réglages")).toHaveAttribute("href", "/reglages");
    expect(vue("Modules")).toHaveAttribute("href", "/reglages/modules");
  });

  it("les trois gares ouvrent le superviseur", async () => {
    rendre();
    await attendreEcran();
    for (const nom of ["Douala Akwa", "Yaoundé Mvan", "Bafoussam"]) {
      expect(screen.getByRole("link", { name: nom })).toHaveAttribute("href", "/gare");
    }
  });

  it("chaque élément « à traiter » ouvre l'écran qui permet d'agir", async () => {
    rendre();
    await attendreEcran();
    const destinations = lignesATraiter().map((a) => a.getAttribute("href"));
    expect(destinations).toEqual(["/gare", "/chauffeur", "/inter-agences", "/assistant"]);
  });

  it("« Voir le rapport d'hier » ouvre le rapport du soir", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Voir le rapport d'hier" })).toHaveAttribute(
      "href",
      "/rapport",
    );
  });

  it("un clic sur une gare navigue dans l'application, sans recharger", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Bafoussam" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
  });

  it("« Direct » relit la salle et ne change pas de page", async () => {
    let lectures = 0;
    const { routeur } = rendre({
      clientApi: clientAvec({
        salle: (salle) => {
          lectures += 1;
          return salle;
        },
      }),
    });
    await attendreEcran();
    const avant = lectures;
    await userEvent.click(screen.getByRole("link", { name: "Direct" }));
    await waitFor(() => expect(lectures).toBe(avant + 1));
    expect(routeur.state.location.pathname).toBe("/controle");
  });
});

describe("Salle de contrôle · un module masqué retire ses liens", () => {
  it("supervision masqué : les gares restent affichées sans lien, clôture et assistant disparaissent", async () => {
    rendre({ masques: ["supervision"] });
    await attendreEcran();
    expect(screen.queryByRole("link", { name: "Douala Akwa" })).not.toBeInTheDocument();
    expect(screen.getByText("Douala Akwa")).toBeInTheDocument();
    expect(screen.getByText("À traiter · 2")).toBeInTheDocument();
    expect(lignesATraiter().map((a) => a.getAttribute("href"))).toEqual([
      "/chauffeur",
      "/inter-agences",
    ]);
    // le rapport du soir est un écran du module de supervision : son lien disparaît aussi
    expect(screen.queryByRole("link", { name: "Voir le rapport d'hier" })).not.toBeInTheDocument();
    expect(screen.getByText(planche.rapport.texte)).toBeInTheDocument();
  });

  it("inter-agences masqué : le colis en correspondance n'est plus proposé", async () => {
    rendre({ masques: ["inter-agences"] });
    await attendreEcran();
    expect(screen.getByText("À traiter · 3")).toBeInTheDocument();
    expect(screen.queryByText(/colis Oméga/)).not.toBeInTheDocument();
  });
});

describe("Salle de contrôle · tout se met à jour en direct", () => {
  const chiffresDirect = {
    recette: 2_650_000,
    variationPct: 9,
    billets: 613,
    billetsEnLigne: 38,
    billetsEnRoute: 12,
    colis: 189,
    colisEnCorrespondance: 6,
    litiges: 1,
    remplissagePct: 87,
    departs: 22,
    departsFusionnes: 2,
    ecartsDeCaisse: { total: -2000, caissesEnEcart: 2, caisses: 9 },
  };

  it("les chiffres du direct remplacent ceux de la lecture, l'heure suit", async () => {
    rendre({
      clientApi: clientAvec({
        messages: [
          { type: "chiffres", instant: "2027-01-05T14:06:00.000+01:00", chiffres: chiffresDirect },
        ],
      }),
    });
    await attendreEcran();
    expect(await screen.findByText("2,65 M")).toBeInTheDocument();
    expect(screen.queryByText("2,61 M")).not.toBeInTheDocument();
    expect(kpi("recette")).toHaveTextContent("+ 9 % vs mardi dernier");
    expect(kpi("billets")).toHaveTextContent("613dont 38 en ligne · 12 en route");
    expect(kpi("colis")).toHaveTextContent("1 litige");
    expect(kpi("remplissage")).toHaveTextContent("87 %");
    expect(kpi("ecarts")).toHaveTextContent("− 2 0002 caisses sur 9 · à valider");
    expect(screen.getByText(/EN DIRECT · 14:06/)).toBeInTheDocument();
  });

  it("une gare du direct remplace sa ligne, les autres ne bougent pas", async () => {
    const salle = await salleDeDemo();
    const bafoussam = salle.gares.find((g) => g.nom === "Bafoussam")!;
    rendre({
      clientApi: clientAvec({
        messages: [
          {
            type: "gare",
            instant: "2027-01-05T14:06:00.000+01:00",
            gare: {
              ...bafoussam,
              billets: 120,
              colis: 31,
              cashAttendu: 455_000,
              ecart: -500,
              prochainDepart: { heure: "15:00", destination: "Douala", remplis: 40, capacite: 40 },
              superviseur: { nom: "Fosso", enLigne: true, horsLigneDepuisMinutes: null },
            },
          },
        ],
      }),
    });
    await attendreEcran();
    await waitFor(() =>
      expect(within(ligneGare("Bafoussam")).getAllByRole("cell")[1]).toHaveTextContent("120"),
    );
    expect(
      within(ligneGare("Bafoussam"))
        .getAllByRole("cell")
        .slice(1)
        .map((c) => c.textContent),
    ).toEqual([
      "120",
      "31",
      "455 000",
      "− 500",
      "15:00 Douala · 40/40 · plein",
      "Fosso · en ligne",
    ]);
    expect(within(ligneGare("Douala Akwa")).getAllByRole("cell")[1]).toHaveTextContent("291");
    expect(within(ligneGare("Yaoundé Mvan")).getAllByRole("cell")[1]).toHaveTextContent("208");
  });

  it("un nouvel élément « à traiter » s'ajoute en tête et au compteur, une seule fois", async () => {
    const element = {
      id: "a-traiter-direct-1",
      type: "cloture_en_attente",
      texte: "Clôture guichet 1 Mvan · écart − 500 · attend le PIN de Tchinda",
      quand: "2027-01-05T14:06:00.000+01:00",
    } as const;
    rendre({
      clientApi: clientAvec({
        messages: [
          { type: "a_traiter", element },
          { type: "a_traiter", element },
        ],
        // la relecture que déclenche le message rattrape le même élément : il ne doit pas être compté deux fois
        lecture: (_appel, originale) => {
          const salle = originale(undefined, undefined);
          return _appel > 1 ? { ...salle, aTraiter: [element, ...salle.aTraiter] } : salle;
        },
      }),
    });
    await attendreEcran();
    expect(await screen.findByText("À traiter · 5")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByText("À traiter · 5")).toBeInTheDocument();
    expect(lignesATraiter()).toHaveLength(5);
    expect(lignesATraiter()[0]).toHaveTextContent(element.texte);
    expect(lignesATraiter()[0]).toHaveTextContent(/14:06$/);
    expect(lignesATraiter()[0]).toHaveAttribute("href", "/gare");
  });

  it("un message plus ancien que la lecture est ignoré", async () => {
    rendre({
      clientApi: clientAvec({
        messages: [
          { type: "chiffres", instant: "2027-01-05T13:00:00.000+01:00", chiffres: chiffresDirect },
        ],
      }),
    });
    await attendreEcran();
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByText("2,61 M")).toBeInTheDocument();
    expect(screen.queryByText("2,65 M")).not.toBeInTheDocument();
  });

  it("avec le mock par défaut, le flux de démonstration est branché (la pastille dit EN DIRECT)", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText(/^EN DIRECT/)).toBeInTheDocument();
  });
});

describe("Salle de contrôle · états chargement, vide et erreur", () => {
  function rendreVue(
    etat: EtatEcran,
    options: { salle?: SalleDeControle; reessayer?: () => void; enDirect?: boolean } = {},
  ) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <VueControle
          etat={etat}
          salle={options.salle}
          enDirect={options.enDirect ?? true}
          lienActif={() => true}
          {...(options.reessayer ? { onReessayer: options.reessayer } : {})}
        />
      </I18nextProvider>,
    );
  }

  it("chargement : mêmes blocs, aucun texte de donnée, vues utilisables", () => {
    rendreVue("chargement");
    expect(document.querySelector("[data-etat='chargement']")).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("region", { name: "Chargement de la salle de contrôle" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Recette du jour")).toBeInTheDocument();
    expect(screen.getByText("Gares · maintenant")).toBeInTheDocument();
    expect(screen.getByText("À traiter · 0")).toBeInTheDocument();
    expect(screen.queryByText("2,61 M")).not.toBeInTheDocument();
    expect(screen.queryByText("Douala Akwa")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Direct|Analyses|Comptable|Réglages|Modules/ }),
    ).toHaveLength(5);
    expect(
      screen.getByRole("heading", { level: 1, name: "Salle de contrôle (web)" }),
    ).toBeInTheDocument();
  });

  it("erreur : message dans le style nuit, bouton pour réessayer, vues toujours là", async () => {
    let appels = 0;
    rendre({
      clientApi: clientAvec({
        lecture: (_appel, originale) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau("coupure");
          return originale(undefined, undefined);
        },
      }),
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("La salle de contrôle ne s'est pas chargée.");
    expect(screen.getByRole("link", { name: "Analyses" })).toHaveAttribute("href", "/analyses");
    expect(screen.queryByText("2,61 M")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.getByText("2,61 M")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("vide : un message par bloc, sans trou dans la page", async () => {
    const salle = await salleDeDemo();
    rendreVue("pret", {
      salle: {
        ...salle,
        gares: [],
        aTraiter: [],
        ventesParHeure: { ...salle.ventesParHeure, heures: [] },
        carte: { ...salle.carte, busEnRoute: 0, alerte: null },
      },
    });
    expect(screen.getByText("Aucune gare à afficher pour le moment.")).toBeInTheDocument();
    expect(screen.getByText("Rien à traiter pour le moment.")).toBeInTheDocument();
    expect(screen.getByText("Aucune vente pour le moment.")).toBeInTheDocument();
    expect(screen.getByText("Bus en route · 0")).toBeInTheDocument();
    expect(screen.getByText("À traiter · 0")).toBeInTheDocument();
    const carte = screen.getByRole("img", { name: /Carte des bus en route/ });
    expect(carte.querySelectorAll("circle[r='9']")).toHaveLength(1); // seul le repère de Bamenda
  });

  it("sans écart de caisse : la carte n'est plus ambre et dit qu'il n'y a aucun écart", async () => {
    const salle = await salleDeDemo();
    rendreVue("pret", {
      salle: {
        ...salle,
        chiffres: {
          ...salle.chiffres,
          ecartsDeCaisse: { total: 0, caissesEnEcart: 0, caisses: 9 },
        },
      },
    });
    const carte = kpi("ecarts");
    expect(carte).toHaveTextContent("Écarts de caisse0aucun écart · 9 caisses");
    expect(carte.className).not.toMatch(/kpiAlerte/);
  });

  it("hors ligne : la pastille ne dit plus EN DIRECT", async () => {
    const salle = await salleDeDemo();
    rendreVue("pret", { salle, enDirect: false });
    expect(screen.queryByText(/EN DIRECT/)).not.toBeInTheDocument();
    expect(screen.getByText("HORS LIGNE · 14:05 · 3 / 3 gares synchronisées")).toBeInTheDocument();
  });

  it("tous les rapports, même sans superviseur ni caisse à valider", async () => {
    const salle = await salleDeDemo();
    rendreVue("pret", {
      salle: {
        ...salle,
        rapport: {
          ...salle.rapport,
          destinataires: { patron: "M. Kamga", superviseurs: 0 },
          caissesAValider: 0,
        },
      },
    });
    expect(
      screen.getByText("Part à 21:00 sur WhatsApp à M. Kamga. Toutes les caisses sont validées."),
    ).toBeInTheDocument();
  });
});
