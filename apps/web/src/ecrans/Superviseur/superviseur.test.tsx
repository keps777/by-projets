import {
  ErreurReseau,
  FournisseurApi,
  agence,
  creerClientMock,
  implementer,
  simulerFlux,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { ConceptionProvider } from "@afrimove/ui";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { DIRECT_VIDE, avecDirect, recevoir, type SuperviseurGare } from "./direct";
import { couleurRemplissage, heureDouala, montant, sequenceBillet } from "./formats";
import { APPAREIL_A_DEBLOQUER, GareVue, type EtatGare } from "./gare-vue";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const idsFixtures = ecrans.Superviseur;

function rendre(options: { url?: string; clientApi?: ReturnType<typeof creerClientMock> } = {}) {
  return rendreApp({
    fixtures: true,
    scenario: "Superviseur",
    url: options.url ?? "/gare",
    ...(options.clientApi ? { clientApi: options.clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Superviseur · Akwa");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien de la zone principale qui porte ce texte. */
function lien(texte: string | RegExp): HTMLElement {
  const trouve = within(principal())
    .getAllByRole("link")
    .find((a) =>
      typeof texte === "string" ? a.textContent === texte : texte.test(a.textContent ?? ""),
    );
  if (!trouve) throw new Error(`Pas de lien « ${String(texte)} »`);
  return trouve;
}

/** Les textes des lignes de demande de la zone principale (« Clôture guichet 2 · Joseph · … »). */
function textesDemandes(): string[] {
  return Array.from(document.querySelectorAll("[class*='demandeTexte']")).map(
    (el) => el.textContent ?? "",
  );
}

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "Superviseur", latenceMs: 0 });
}

describe("Superviseur · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : gare, superviseur, guichets, quais, heure et synchronisation", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Mme Essono · 3 guichets · 2 quais · 14:02")).toBeInTheDocument();
    expect(screen.getByText("3 / 3 sync")).toBeInTheDocument();
    // Le titre de l'écran (lecteurs d'écran, tests de routes) est la clé commune de la coquille.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Superviseur de gare · PIN · annulations",
    );
  });

  it("affiche les deux demandes qui attendent le PIN, avec leurs textes", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("2 demandes attendent ton PIN")).toBeInTheDocument();
    expect(screen.getByText("touche 1 · PIN · fait")).toBeInTheDocument();
    expect(textesDemandes()).toContain(
      "Clôture guichet 2 · Joseph · écart − 1 000 · compté 694 500",
    );
    expect(textesDemandes()).toContain(
      "Annulation · guichet 1 · billet 0171 · 4 000 · « client parti »",
    );
    expect(lien("Valider · PIN")).toBeInTheDocument();
    expect(lien("Voir · PIN")).toBeInTheDocument();
  });

  it("affiche l'état des trois guichets, celui qui attend en ambre", async () => {
    rendre();
    await attendreEcran();
    for (const [etiquette, billets, etat, ton] of [
      ["Guichet 1", "211", "écart 0 · ouvert", "vert"],
      ["Guichet 2", "184", "− 1 000 · à valider", "ambre"],
      ["Guichet 3", "96", "ouvert 09:00", "neutre"],
    ] as const) {
      const tuile = within(principal()).getByText(etiquette).parentElement as HTMLElement;
      expect(within(tuile).getByText(billets)).toBeInTheDocument();
      expect(within(tuile).getByText(etat)).toHaveAttribute("data-ton", ton);
    }
    const attente = within(principal()).getByText("Guichet 2").parentElement as HTMLElement;
    expect(attente).toHaveAttribute("data-attente", "true");
  });

  it("affiche les départs de l'après-midi avec leur remplissage et la fusion proposée", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Départs de l'après-midi")).toBeInTheDocument();
    expect(screen.getByText("remplissage")).toBeInTheDocument();

    const premier = lien(/^14:30/);
    expect(premier).toHaveTextContent("14:30Yaoundé · quai 3 · LT 207 AB38/40");
    expect(within(premier).getByText("38/40")).toHaveAttribute("data-ton", "vert");

    const deuxieme = lien(/^15:00/);
    expect(deuxieme).toHaveTextContent("15:00Bafoussam · quai 1 · LT 118 AB19/40");
    expect(within(deuxieme).getByText("19/40")).toHaveAttribute("data-ton", "ambre");

    const troisieme = lien(/^16:00/);
    expect(troisieme).toHaveTextContent("16:00Yaoundé · quai 3 · fusion proposée avec 16:309/40");
    expect(within(troisieme).getByText("9/40")).toHaveAttribute("data-ton", "rouge");
    expect(within(troisieme).getByText("fusion proposée avec 16:30")).toBeInTheDocument();
  });

  it("garde les quatre raccourcis et la barre d'onglets du superviseur, Gare courant", async () => {
    rendre();
    await attendreEcran();
    for (const libelle of ["Contrôle", "Équipe · PIN", "Débloquer 12 h", "Rapport 21 h"]) {
      expect(lien(libelle)).toBeInTheDocument();
    }
    const barre = screen.getByRole("navigation", { name: "Navigation superviseur" });
    expect(
      within(barre)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Gare", "Caisses", "Quais", "Patron"]);
    expect(within(barre).getByRole("link", { name: "Gare" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt », et dessine des icônes SVG", async () => {
    rendre();
    await attendreEcran();
    expect(document.body.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    const raccourcis = within(principal()).getByText("Contrôle").parentElement as HTMLElement;
    expect(raccourcis.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("garde des cibles tactiles d'au moins 44 px pour les départs et les raccourcis", async () => {
    rendre();
    await attendreEcran();
    const liens = within(principal()).getAllByRole("link");
    expect(liens).toHaveLength(9);
    for (const a of liens) {
      // Les deux boutons de demande dessinent 36 px comme la planche ; leur zone tactile (::after) monte à 44 px.
      if (/PIN$/.test(a.textContent ?? "") && /^(Valider|Voir)/.test(a.textContent ?? "")) continue;
      const minimum = parseFloat(getComputedStyle(a).minHeight);
      expect(minimum, a.textContent ?? "").toBeGreaterThanOrEqual(44);
    }
  });
});

describe("Superviseur · navigation identique à la maquette", () => {
  const sessionId = idsFixtures.donnees.demandes.liste[0]!._sessionId;

  const liens = [
    ["Valider · PIN", `/cloture/${sessionId}`],
    ["Voir · PIN", /^\/annulation\/.+/],
    [/^14:30/, "/embarquement"],
    [/^15:00/, "/embarquement"],
    [/^16:00/, "/embarquement"],
    ["Contrôle", "/inopine"],
    ["Équipe · PIN", "/equipe"],
    ["Débloquer 12 h", `/debloquer/${APPAREIL_A_DEBLOQUER}`],
    ["Rapport 21 h", "/rapport"],
  ] as const;

  it.each(liens)("« %s » mène à %s", async (texte, chemin) => {
    const { routeur } = rendre();
    await attendreEcran();
    const cible = lien(texte);
    if (typeof chemin === "string") expect(cible).toHaveAttribute("href", chemin);
    else expect(cible.getAttribute("href")).toMatch(chemin);
    await userEvent.click(cible);
    await waitFor(() => {
      const atteint = routeur.state.location.pathname;
      if (typeof chemin === "string") expect(atteint).toBe(chemin);
      else expect(atteint).toMatch(chemin);
    });
  });

  const onglets = [
    ["Caisses", "/guichet/caisse"],
    ["Quais", "/embarquement"],
    ["Patron", "/aujourdhui"],
  ] as const;

  it.each(onglets)("l'onglet « %s » mène à %s", async (libelle, chemin) => {
    const { routeur } = rendre();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation superviseur" });
    await userEvent.click(within(barre).getByRole("link", { name: libelle }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("l'onglet « Gare » reste sur l'écran", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation superviseur" });
    await userEvent.click(within(barre).getByRole("link", { name: "Gare" }));
    expect(routeur.state.location.pathname).toBe("/gare");
    expect(await attendreEcran()).toBeInTheDocument();
  });
});

describe("Superviseur · temps réel", () => {
  const demandeNouvelle = {
    genre: "annulation",
    demandeId: "ann-direct-1",
    billetId: "billet-direct-1",
    billetSequence: 188,
    guichetRang: 3,
    montant: 6000,
    motif: "erreur de saisie",
  } as const;

  function clientDirect(messages: readonly unknown[]) {
    return clientAvec((scenario) => ({
      ...scenario,
      flux: [
        simulerFlux(agence.CANAL_GARE, (_params, ctx) => {
          messages.forEach((message, i) => ctx.planifier(30 * (i + 1), () => ctx.emettre(message)));
        }),
        ...(scenario.flux ?? []),
      ],
    }));
  }

  it("une demande qui arrive s'ajoute à la liste et au compteur, sans recharger", async () => {
    rendre({
      clientApi: clientDirect([
        { type: "demande", at: "2027-01-05T14:05:00.000+01:00", demande: demandeNouvelle },
      ]),
    });
    await attendreEcran();
    expect(screen.getByText("2 demandes attendent ton PIN")).toBeInTheDocument();
    expect(await screen.findByText("3 demandes attendent ton PIN")).toBeInTheDocument();
    expect(textesDemandes()).toContain(
      "Annulation · guichet 3 · billet 0188 · 6 000 · « erreur de saisie »",
    );
    expect(
      within(principal())
        .getAllByRole("link", { name: "Voir · PIN" })
        .map((a) => a.getAttribute("href")),
    ).toContain("/annulation/ann-direct-1");
  });

  it("le remplissage d'un départ suit le direct (rouge, ambre ou vert selon le taux)", async () => {
    const depart = idsFixtures.donnees.apresMidi.departs[1]!._departId;
    rendre({
      clientApi: clientDirect([
        {
          type: "remplissage",
          at: "2027-01-05T14:05:00.000+01:00",
          departId: depart,
          vendus: 30,
          capacite: 40,
        },
      ]),
    });
    await attendreEcran();
    expect(await screen.findByText("30/40")).toHaveAttribute("data-ton", "ambre");
    expect(screen.queryByText("19/40")).not.toBeInTheDocument();
  });

  it("l'état d'un guichet suit le direct", async () => {
    rendre({
      clientApi: clientDirect([
        {
          type: "guichet",
          at: "2027-01-05T14:06:00.000+01:00",
          guichet: { rang: 3, billets: 97, ecart: -500, etat: "ouvert", ouvertA: null },
        },
      ]),
    });
    await attendreEcran();
    expect(await screen.findByText("97")).toBeInTheDocument();
    expect(screen.getByText("écart − 500 · ouvert")).toHaveAttribute("data-ton", "ambre");
  });

  it("publier de nouveau une demande déjà affichée ne la double pas", async () => {
    const connue = idsFixtures.donnees.demandes.liste[0]!;
    rendre({
      clientApi: clientDirect([
        {
          type: "demande",
          at: "2027-01-05T14:05:00.000+01:00",
          demande: {
            genre: "cloture",
            // identifiant que le mock donne à la demande de clôture de la planche
            demandeId: `dem-cloture-${connue._sessionId}`,
            sessionId: connue._sessionId,
            guichetRang: 2,
            agent: { id: "x", nom: "Joseph" },
            compte: 694_500,
            ecart: -1000,
          },
        },
        { type: "demande", at: "2027-01-05T14:05:30.000+01:00", demande: demandeNouvelle },
      ]),
    });
    await attendreEcran();
    expect(await screen.findByText("3 demandes attendent ton PIN")).toBeInTheDocument();
  });
});

describe("Superviseur · la fusion est proposée, jamais faite", () => {
  it("la proposition n'est qu'un texte dans une ligne de départ : aucun bouton de fusion, aucune écriture", async () => {
    rendre();
    await attendreEcran();
    expect(within(principal()).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/^fusionner/i)).not.toBeInTheDocument();
    const ligne = lien(/^16:00/);
    expect(within(ligne).getByText("fusion proposée avec 16:30")).toBeInTheDocument();
    // La ligne ouvre le quai : le superviseur y décide, rien n'est modifié ici.
    expect(ligne).toHaveAttribute("href", "/embarquement");
  });

  it("n'écrit rien : l'écran ne branche aucun hook d'écriture", async () => {
    const ecritures: string[] = [];
    const client = clientAvec((scenario) => ({
      ...scenario,
      operations: scenario.operations.map((impl) =>
        Object.values(agence.ECRITURES).some((e) => e.operation.nom === impl.operation.nom)
          ? implementer(impl.operation, (params, ctx) => {
              ecritures.push(impl.operation.nom);
              return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
            })
          : impl,
      ),
    }));
    rendre({ clientApi: client });
    await attendreEcran();
    await userEvent.click(lien(/^16:00/));
    expect(ecritures).toEqual([]);
  });

  it.each([
    [38, 40, "vert"],
    [32, 40, "vert"],
    [31, 40, "ambre"],
    [19, 40, "ambre"],
    [16, 40, "ambre"],
    [15, 40, "rouge"],
    [9, 40, "rouge"],
    [0, 40, "rouge"],
  ] as const)("couleur de %i/%i : %s (rouge sous 40 %, seuil de la fusion)", (v, c, ton) => {
    expect(couleurRemplissage(v, c)).toBe(ton);
  });
});

describe("Superviseur · états chargement, vide et erreur", () => {
  function rendreVue(etat: EtatGare, onReessayer?: () => void) {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <FournisseurApi client={creerClientMock({ latenceMs: 0 })}>
          <ConceptionProvider actif={false}>
            <GareVue etat={etat} {...(onReessayer ? { onReessayer } : {})} />
          </ConceptionProvider>
        </FournisseurApi>
      </I18nextProvider>,
    );
  }

  it("chargement : mêmes blocs, aucun texte de donnée, raccourcis utilisables", () => {
    rendreVue("chargement");
    expect(principal()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Chargement de la gare" })).toBeInTheDocument();
    expect(screen.queryByText(/demandes attendent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Départs/)).not.toBeInTheDocument();
    expect(within(principal()).getAllByRole("link")).toHaveLength(4);
  });

  it("vide : message dans le style nuit, raccourcis toujours là", () => {
    rendreVue("vide");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aucune information pour cette gare pour le moment.",
    );
    expect(lien("Équipe · PIN")).toHaveAttribute("href", "/equipe");
  });

  it("erreur : message, bouton Réessayer, et les raccourcis restent accessibles", async () => {
    let appels = 0;
    const client = clientAvec((scenario) => ({
      ...scenario,
      // sans direct : un message du canal relancerait la lecture avant le clic sur « Réessayer »
      flux: [],
      operations: scenario.operations.map((impl) =>
        impl.operation.nom === agence.OP_SUPERVISEUR_GARE.nom
          ? implementer(agence.OP_SUPERVISEUR_GARE, (params, ctx) => {
              appels += 1;
              if (appels === 1) throw new ErreurReseau("coupure");
              return (impl.repondre as (p: unknown, c: unknown) => never)(params, ctx);
            })
          : impl,
      ),
    }));
    rendre({ clientApi: client });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("La gare ne s'est pas chargée.");
    expect(lien("Rapport 21 h")).toHaveAttribute("href", "/rapport");
    expect(screen.queryByText(/demandes attendent/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.getByText("2 demandes attendent ton PIN")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sans demande en attente, le bloc des demandes n'est pas affiché", async () => {
    const client = clientAvec((scenario) => ({
      ...scenario,
      flux: [],
      operations: scenario.operations.map((impl) =>
        impl.operation.nom === agence.OP_SUPERVISEUR_GARE.nom
          ? implementer(agence.OP_SUPERVISEUR_GARE, async (params, ctx) => ({
              ...((await (impl.repondre as (p: unknown, c: unknown) => unknown)(
                params,
                ctx,
              )) as SuperviseurGare),
              demandes: [],
            }))
          : impl,
      ),
    }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.queryByText(/attend/)).not.toBeInTheDocument();
    expect(screen.getByText("Guichet 2")).toBeInTheDocument();
  });

  it("une seule demande : le titre passe au singulier", async () => {
    const client = clientAvec((scenario) => ({
      ...scenario,
      flux: [],
      operations: scenario.operations.map((impl) =>
        impl.operation.nom === agence.OP_SUPERVISEUR_GARE.nom
          ? implementer(agence.OP_SUPERVISEUR_GARE, async (params, ctx) => {
              const gare = (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
                params,
                ctx,
              )) as SuperviseurGare;
              return { ...gare, demandes: gare.demandes.slice(0, 1) };
            })
          : impl,
      ),
    }));
    rendre({ clientApi: client });
    await attendreEcran();
    expect(screen.getByText("1 demande attend ton PIN")).toBeInTheDocument();
  });

  it("synchronisation incomplète : le point passe à l'ambre", async () => {
    const client = clientAvec((scenario) => ({
      ...scenario,
      operations: scenario.operations.map((impl) =>
        impl.operation.nom === agence.OP_SUPERVISEUR_GARE.nom
          ? implementer(agence.OP_SUPERVISEUR_GARE, async (params, ctx) => {
              const gare = (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
                params,
                ctx,
              )) as SuperviseurGare;
              return { ...gare, synchro: { synchronises: 2, total: 3 } };
            })
          : impl,
      ),
    }));
    rendre({ clientApi: client });
    await attendreEcran();
    const pastille = screen.getByText("2 / 3 sync");
    expect(pastille.querySelector("[data-ton='ambre']")).not.toBeNull();
  });
});

describe("Superviseur · fonctions pures", () => {
  it("formate heures, montants et numéros de billet comme la planche", () => {
    expect(heureDouala("2027-01-05T14:02:00.000+01:00")).toBe("14:02");
    expect(montant(694_500)).toBe("694 500");
    expect(montant(-1000)).toBe("− 1 000");
    expect(montant(4000)).toBe("4 000");
    expect(montant(0)).toBe("0");
    expect(sequenceBillet(171)).toBe("0171");
  });

  const lecture: SuperviseurGare = {
    gare: { id: "g", nom: "Akwa" },
    superviseur: { id: "s", nom: "Mme Essono" },
    at: "2027-01-05T14:02:00.000+01:00",
    quais: 2,
    synchro: { synchronises: 3, total: 3 },
    demandes: [],
    guichets: [{ rang: 1, billets: 1, ecart: 0, etat: "ouvert", ouvertA: null }],
    apresMidi: [
      {
        departId: "d1",
        heureDepart: "2027-01-05T14:30:00.000+01:00",
        destination: "Yaoundé",
        quai: 3,
        bus: null,
        vendus: 10,
        capacite: 40,
        fusionProposeeAvec: null,
      },
    ],
  };

  it("ignore un message plus ancien que la lecture (déjà compté dedans)", () => {
    const direct = recevoir(DIRECT_VIDE, {
      type: "remplissage",
      at: "2027-01-05T14:01:00.000+01:00",
      departId: "d1",
      vendus: 12,
      capacite: 40,
    });
    expect(avecDirect(lecture, direct).apresMidi[0]?.vendus).toBe(10);
  });

  it("applique un message plus récent, le dernier d'un même départ gagnant", () => {
    let direct = recevoir(DIRECT_VIDE, {
      type: "remplissage",
      at: "2027-01-05T14:03:00.000+01:00",
      departId: "d1",
      vendus: 12,
      capacite: 40,
    });
    direct = recevoir(direct, {
      type: "remplissage",
      at: "2027-01-05T14:04:00.000+01:00",
      departId: "d1",
      vendus: 13,
      capacite: 40,
    });
    expect(avecDirect(lecture, direct).apresMidi[0]?.vendus).toBe(13);
  });
});

describe("Superviseur · textes des trois langues", () => {
  function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
    return Object.entries(objet).flatMap(([k, v]) =>
      typeof v === "object" && v !== null
        ? cles(v as Record<string, unknown>, `${prefixe}${k}.`)
        : [`${prefixe}${k}`],
    );
  }

  it("l'anglais et le pidgin ont exactement les clés du français", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
