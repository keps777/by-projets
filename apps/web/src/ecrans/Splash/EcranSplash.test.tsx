import {
  creerClientMock,
  implementer,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { horlogeFigee } from "@/coquille/horloge";
import { CLES, lire } from "@/coquille/stockage";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { EcranSplash } from "./EcranSplash";
import type { Jingle } from "./jingle";
import { CLE_PREMIERE_OUVERTURE, premiereOuvertureTerminee } from "./premiere-ouverture";

const HORLOGE = horlogeFigee("2027-01-05T07:38:00+01:00");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Source dont l'aperçu du réseau (d'où vient le nombre de compagnies) est remplacé. */
function sourceReseau(
  changer: (apercu: { compagnies: number }) => unknown | Promise<unknown>,
): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    async charger(nom) {
      const scenario: Scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((impl) =>
          impl.operation.nom === voyageur.OP_RESEAU.nom
            ? implementer(voyageur.OP_RESEAU, async (params, ctx) =>
                changer(
                  (await (impl.repondre as (p: unknown, c: unknown) => unknown)(params, ctx)) as {
                    compagnies: number;
                  },
                ),
              )
            : impl,
        ) as Scenario["operations"],
      };
    },
  };
}

function client(source: SourceScenarios = sourceScenariosFixtures(), latenceMs = 0): ClientApi {
  return creerClientMock({ source, scenario: "Splash", latenceMs });
}

/** Monte l'application sur /bienvenue et attend que la page (chargée à la demande) soit arrivée. */
async function rendre(options: Parameters<typeof rendreApp>[0] = {}) {
  const rendu = rendreApp({
    url: "/bienvenue",
    horloge: HORLOGE,
    langue: "fr",
    clientApi: client(),
    ...options,
  });
  await waitFor(() =>
    expect(screen.queryByRole("status", { name: "Chargement" })).not.toBeInTheDocument(),
  );
  return rendu;
}

/** Faux jingle : compte les appels, sans aucun son. */
function fauxJingle(options: { echec?: boolean } = {}) {
  let enLecture = false;
  let position = 0;
  const abonnes = new Set<() => void>();
  const notifier = () => abonnes.forEach((r) => r());
  const jingle: Jingle & {
    jouer: ReturnType<typeof vi.fn>;
    arreter: ReturnType<typeof vi.fn>;
    avancer: (s: number) => void;
  } = {
    duree: 10,
    enLecture: () => enLecture,
    position: () => position,
    jouer: vi.fn(async () => {
      if (options.echec) throw new Error("pas de son");
      enLecture = true;
      notifier();
    }),
    arreter: vi.fn(() => {
      if (!enLecture) return;
      enLecture = false;
      position = 0;
      notifier();
    }),
    abonner: (rappel) => {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
    avancer: (s) => {
      position = s;
    },
  };
  return jingle;
}

/** Routes de test : l'écran avec un faux jingle, plus de quoi voir où l'on arrive. */
function routesAvec(jingle: Jingle) {
  return [
    { path: "/bienvenue", element: <EcranSplash jingle={jingle} /> },
    { path: "/connexion", element: <p>Page de connexion</p> },
    { path: "/voyager", element: <p>Accueil voyageur</p> },
  ];
}

describe("Splash · rendu de la planche", () => {
  it("affiche le logo, la signature, le slogan, le jingle, les langues et les actions de la maquette", async () => {
    await rendre();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Première ouverture · logo, jingle, langue",
    );
    expect(
      screen.getByRole("img", { name: "Logo AfriMove : panneau à volets, A ambre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Douala · 07:38")).toBeInTheDocument();
    expect(screen.getByText("AfriMove")).toBeInTheDocument();
    expect(screen.getByText("A · comme Avance")).toBeInTheDocument();
    expect(screen.getByText("on te trouve.")).toBeInTheDocument();
    expect(screen.getByText("on te trouve.").parentElement).toHaveTextContent(
      "Où que tu sois,on te trouve.",
    );
    expect(screen.getByText("Jingle AfriMove · 10 s")).toBeInTheDocument();
    expect(screen.getByText("« Où que tu sois, on te trouve : Afri… Move ! »")).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:10")).toBeInTheDocument();

    const langues = screen.getByRole("group", { name: "Langue" });
    expect(
      within(langues)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["FR", "EN", "Pidgin"]);

    expect(screen.getByRole("link", { name: "Commencer · 30 secondes" })).toHaveAttribute(
      "href",
      "/connexion",
    );
    expect(screen.getByRole("link", { name: "J'ai déjà un compte" })).toHaveAttribute(
      "href",
      "/connexion",
    );
    expect(
      await screen.findByText(
        "Billets, colis et covoiturage · 5 compagnies partenaires · marche aussi sans internet",
      ),
    ).toBeInTheDocument();
  });

  it("n'affiche aucun bouton grisé ni « bientôt »", async () => {
    await rendre();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(document.body).not.toHaveTextContent(/bientôt/i);
  });

  it("garde l'heure de Douala : 07:38 pour 06:38 UTC, quel que soit le fuseau de l'appareil", async () => {
    await rendre({ horloge: horlogeFigee("2027-01-05T06:38:00Z") });
    expect(screen.getByText("Douala · 07:38")).toBeInTheDocument();
  });
});

describe("Splash · nombre de compagnies partenaires", () => {
  it("vient de l'API, pas du texte", async () => {
    await rendre({ clientApi: client(sourceReseau((a) => ({ ...a, compagnies: 12 }))) });
    expect(await screen.findByText(/12 compagnies partenaires/)).toBeInTheDocument();
    expect(screen.queryByText(/5 compagnies/)).not.toBeInTheDocument();
  });

  it("accorde le singulier", async () => {
    await rendre({ clientApi: client(sourceReseau((a) => ({ ...a, compagnies: 1 }))) });
    expect(await screen.findByText(/1 compagnie partenaire ·/)).toBeInTheDocument();
  });

  it("pendant le chargement : une barre qui pulse à la place du nombre, mise en page intacte", async () => {
    await rendre({ clientApi: client(sourceScenariosFixtures(), 60) });
    const mention = screen.getByText(/Billets, colis et covoiturage/);
    expect(mention).toHaveAttribute("aria-busy", "true");
    expect(mention).not.toHaveTextContent("compagnies");
    expect(mention).toHaveTextContent("marche aussi sans internet");
    expect(screen.getByRole("link", { name: "Commencer · 30 secondes" })).toBeVisible();

    await waitFor(() => expect(mention).toHaveAttribute("aria-busy", "false"));
    expect(mention).toHaveTextContent("5 compagnies partenaires");
  });

  it("vide (zéro compagnie) : la mention reste lisible sans nombre", async () => {
    await rendre({ clientApi: client(sourceReseau((a) => ({ ...a, compagnies: 0 }))) });
    const mention = screen.getByText(/Billets, colis et covoiturage/);
    await waitFor(() => expect(mention).toHaveAttribute("aria-busy", "false"));
    expect(mention).toHaveTextContent("Billets, colis et covoiturage · marche aussi sans internet");
    expect(mention).not.toHaveTextContent("compagnie");
  });

  it("erreur de l'API (ou hors ligne) : la mention reste lisible et l'écran reste utilisable", async () => {
    await rendre({
      clientApi: client(
        sourceReseau(() => {
          throw new Error("hors ligne");
        }),
      ),
    });
    const mention = screen.getByText(/Billets, colis et covoiturage/);
    await waitFor(() => expect(mention).toHaveAttribute("aria-busy", "false"));
    expect(mention).toHaveTextContent("Billets, colis et covoiturage · marche aussi sans internet");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "J'ai déjà un compte" })).toBeVisible();
  });
});

describe("Splash · langue", () => {
  it("applique tout de suite la langue choisie, la mémorise et la retrouve au prochain lancement", async () => {
    const utilisateur = userEvent.setup();
    await rendre();
    const fr = screen.getByRole("button", { name: "FR" });
    const en = screen.getByRole("button", { name: "EN" });
    const pidgin = screen.getByRole("button", { name: "Pidgin" });
    expect(fr).toHaveAttribute("aria-pressed", "true");
    expect(en).toHaveAttribute("aria-pressed", "false");

    await utilisateur.click(pidgin);
    expect(pidgin).toHaveAttribute("aria-pressed", "true");
    expect(fr).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.lang).toBe("pcm");
    expect(lire(CLES.langue)).toBe("pcm");
    expect(creerI18n().language).toBe("pcm");

    await utilisateur.click(en);
    expect(en).toHaveAttribute("aria-pressed", "true");
    expect(pidgin).toHaveAttribute("aria-pressed", "false");
    expect(lire(CLES.langue)).toBe("en");
  });

  it("démarre avec la langue mémorisée et se replie sur le français quand le texte manque", async () => {
    await rendre({ langue: "pcm" });
    expect(screen.getByRole("button", { name: "Pidgin" })).toHaveAttribute("aria-pressed", "true");
    // Les textes pidgin ne sont pas encore écrits : le français s'affiche, jamais une clé brute.
    expect(screen.getByText("A · comme Avance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Commencer · 30 secondes" })).toBeInTheDocument();
  });
});

describe("Splash · jingle", () => {
  it("ne lance rien tout seul : aucun contexte audio avant le toucher", async () => {
    const AudioContext = vi.fn();
    vi.stubGlobal("AudioContext", AudioContext);
    await rendre();
    await screen.findByText(/5 compagnies/);
    expect(AudioContext).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Écouter le jingle" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("démarre au toucher du bouton, avance, puis s'arrête sur un second toucher", async () => {
    const jingle = fauxJingle();
    await rendre({ routes: routesAvec(jingle) });
    expect(jingle.jouer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Écouter le jingle" }));
    expect(jingle.jouer).toHaveBeenCalledOnce();
    const arreter = await screen.findByRole("button", { name: "Arrêter le jingle" });
    expect(arreter).toHaveAttribute("aria-pressed", "true");

    jingle.avancer(3.4);
    await waitFor(() => expect(screen.getByText("0:03 / 0:10")).toBeInTheDocument());

    fireEvent.click(arreter);
    expect(jingle.arreter).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Écouter le jingle" })).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:10")).toBeInTheDocument();
  });

  it("se coupe en quittant l'écran", async () => {
    const jingle = fauxJingle();
    const { routeur } = await rendre({ routes: routesAvec(jingle) });
    fireEvent.click(screen.getByRole("button", { name: "Écouter le jingle" }));
    await screen.findByRole("button", { name: "Arrêter le jingle" });
    expect(jingle.enLecture()).toBe(true);

    await act(async () => {
      await routeur.navigate("/connexion");
    });
    expect(screen.getByText("Page de connexion")).toBeInTheDocument();
    expect(jingle.enLecture()).toBe(false);
  });

  it("se coupe aussi quand l'application passe en arrière-plan et quand le composant disparaît", async () => {
    const jingle = fauxJingle();
    await rendre({ routes: routesAvec(jingle) });
    fireEvent.click(screen.getByRole("button", { name: "Écouter le jingle" }));
    await screen.findByRole("button", { name: "Arrêter le jingle" });

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(jingle.enLecture()).toBe(false);

    fireEvent.click(await screen.findByRole("button", { name: "Écouter le jingle" }));
    await screen.findByRole("button", { name: "Arrêter le jingle" });
    cleanup();
    expect(jingle.enLecture()).toBe(false);
  });

  it("annonce l'échec quand le son ne peut pas démarrer, sans bloquer le reste de l'écran", async () => {
    const jingle = fauxJingle({ echec: true });
    await rendre({ routes: routesAvec(jingle) });
    fireEvent.click(screen.getByRole("button", { name: "Écouter le jingle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le son n'a pas pu démarrer sur ce téléphone.",
    );
    expect(screen.getByRole("link", { name: "Commencer · 30 secondes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Écouter le jingle" })).toBeEnabled();
  });
});

describe("Splash · navigation et premier lancement", () => {
  it("« Commencer · 30 secondes » ouvre la connexion et mémorise la fin du premier lancement", async () => {
    const { routeur } = await rendre({ demo: false });
    expect(premiereOuvertureTerminee()).toBe(false);

    await userEvent.click(screen.getByRole("link", { name: "Commencer · 30 secondes" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/connexion"));
    expect(lire(CLE_PREMIERE_OUVERTURE)).toBe("1");
  });

  it("« J'ai déjà un compte » ouvre aussi la connexion", async () => {
    const { routeur } = await rendre({ demo: false });
    await userEvent.click(screen.getByRole("link", { name: "J'ai déjà un compte" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/connexion"));
    expect(premiereOuvertureTerminee()).toBe(true);
  });

  it("n'apparaît plus ensuite : l'application ouvre l'accueil du rôle", async () => {
    localStorage.setItem(CLE_PREMIERE_OUVERTURE, "1");
    const { routeur } = await rendre({ demo: false });
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
    expect(screen.queryByRole("link", { name: "Commencer · 30 secondes" })).not.toBeInTheDocument();
  });

  it("renvoie un compte de guichet vers l'accueil du guichet", async () => {
    localStorage.setItem(CLE_PREMIERE_OUVERTURE, "1");
    const { routeur } = await rendre({ demo: false, session: { role: "guichet" } });
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
  });

  it("reste accessible en mode démo (banc de fidélité, développement) même après le premier lancement", async () => {
    localStorage.setItem(CLE_PREMIERE_OUVERTURE, "1");
    const { routeur } = await rendre({ demo: true });
    expect(screen.getByRole("link", { name: "Commencer · 30 secondes" })).toBeInTheDocument();
    expect(routeur.state.location.pathname).toBe("/bienvenue");
  });

  it("un rechargement avant d'avoir choisi montre encore l'écran", async () => {
    await rendre({ demo: false });
    cleanup();
    await rendre({ demo: false });
    expect(screen.getByRole("link", { name: "Commencer · 30 secondes" })).toBeInTheDocument();
  });
});
