import { CLE_JETON, agence } from "@afrimove/api-client";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLE_APPAREIL_ENROLE, CLE_JETON_EXPIRE, ErreurAgent, memoriserEnrolement } from "@/agent";
import { CLES } from "@/coquille/stockage";
import { rendreApp } from "@/test/rendre";
import { erreurDe } from "./EcranConnexionAgent";

/** `import.meta.env` est figé à la compilation : le mode http se choisit en remplaçant la lecture du mode. */
const mode = vi.hoisted(() => ({ http: true }));
vi.mock("@/agent/mode", async (original) => ({
  ...(await original<typeof import("@/agent/mode")>()),
  modeHttp: () => mode.http,
}));

interface Appel {
  methode: string;
  chemin: string;
  corps: unknown;
  entetes: Record<string, string>;
}

type Gestionnaire = (appel: Appel) => Response | Promise<Response> | undefined;

function json(statut: number, corps: unknown, entetes: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json", ...entetes },
  });
}

const ENROLEMENT = {
  appareilId: "appareil-dla-g1-ab12cd34",
  secret: "apd_secret-de-l-appareil",
  compagnieId: "c-1",
  gareId: "g-1",
  libelle: "Guichet 1 Akwa",
  agence: "DEM",
  gare: "DLA",
  genre: "guichet" as const,
  rang: 1,
  plage: { debut: 1, fin: 999 },
};

const MOI_GUICHETIER = {
  id: "personne-guichet",
  role: "guichetier",
  compagnieId: "c-1",
  gareId: "g-1",
  peutVendre: true,
  accesPatron: false,
};

/** Un faux serveur : les routes par défaut sont celles qui réussissent, `surcharges` passe avant. */
function serveur(...surcharges: Gestionnaire[]) {
  const appels: Appel[] = [];
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    const chemin = new URL(url, "http://api.test").pathname.replace(/^\/api/, "");
    const appel: Appel = {
      methode: init.method ?? "GET",
      chemin,
      corps: init.body ? JSON.parse(String(init.body)) : undefined,
      entetes: (init.headers ?? {}) as Record<string, string>,
    };
    appels.push(appel);
    for (const g of surcharges) {
      const r = await g(appel);
      if (r) return r;
    }
    if (chemin === "/appareils/enrolement") return json(200, ENROLEMENT);
    if (chemin === "/auth/guichet/connexion") {
      return json(200, {
        accessToken: "jwt-guichet",
        tokenType: "Bearer",
        expiresIn: 3600,
        role: "guichetier",
      });
    }
    if (chemin === "/auth/direction/connexion") {
      return json(202, { defiId: "11111111-1111-4111-8111-111111111111", expireDans: 300 });
    }
    if (chemin === "/auth/direction/verification") {
      return json(200, {
        accessToken: "jwt-patron",
        tokenType: "Bearer",
        expiresIn: 1800,
        role: "patron",
      });
    }
    if (chemin === "/me") {
      const jeton = appel.entetes["Authorization"];
      return json(
        200,
        jeton === "Bearer jwt-patron"
          ? {
              ...MOI_GUICHETIER,
              id: "personne-patron",
              role: "patron",
              peutVendre: false,
              accesPatron: true,
            }
          : MOI_GUICHETIER,
      );
    }
    // Tout le reste (commande de l'appareil, données de l'écran d'arrivée) : rien à signaler.
    return json(204, null);
  });
  vi.stubGlobal("fetch", f);
  return { appels, appelsA: (chemin: string) => appels.filter((a) => a.chemin === chemin) };
}

beforeEach(() => {
  localStorage.clear();
  mode.http = true;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const ouvrir = (url = "/connexion?agent=1", langue?: "fr" | "en" | "pcm") =>
  rendreApp({ url, demo: false, fixtures: true, ...(langue ? { langue } : {}) });

async function choisirRole(nom: string) {
  await userEvent.click(await screen.findByRole("radio", { name: nom }));
  await userEvent.click(screen.getByRole("button", { name: "Continuer" }));
}

describe("accès à la connexion des agents", () => {
  it("propose le lien sous la connexion des voyageurs avec l'API réelle", async () => {
    serveur();
    ouvrir("/connexion");
    await userEvent.click(
      await screen.findByRole("button", { name: "Je fais partie de l'équipe AfriMove" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Connexion de l'équipe" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Je suis voyageur" }));
    expect(await screen.findByText("Numéro de téléphone")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Connexion de l'équipe" }),
    ).not.toBeInTheDocument();
  });

  it("ne le propose pas en démonstration (mode mock)", async () => {
    mode.http = false;
    ouvrir("/connexion");
    expect(await screen.findByText("Numéro de téléphone")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Je fais partie de l'équipe AfriMove" }),
    ).not.toBeInTheDocument();
  });

  it("s'ouvre d'office sur un téléphone déjà enrôlé", async () => {
    serveur();
    memoriserEnrolement(ENROLEMENT);
    ouvrir("/connexion");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Connexion de l'équipe" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ce téléphone est enrôlé : Guichet 1 Akwa.")).toBeInTheDocument();
  });
});

describe("guichetier sur un téléphone à enrôler", () => {
  it("enrôle le téléphone, puis connecte par PIN et ouvre l'espace guichet", async () => {
    const { appels, appelsA } = serveur();
    const { routeur } = ouvrir();
    await choisirRole("Guichetier");

    // Ce rôle vend des billets : le téléphone doit être enrôlé d'abord.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Enrôler ce téléphone" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ce rôle vend des billets");
    await userEvent.type(screen.getByLabelText("Code d'enrôlement"), "abcde-fghjk");
    await userEvent.click(screen.getByRole("button", { name: "Enrôler le téléphone" }));

    expect(await screen.findByText("Téléphone enrôlé : Guichet 1 Akwa.")).toBeInTheDocument();
    expect(appelsA("/appareils/enrolement")[0]?.corps).toEqual({ code: "ABCDE-FGHJK" });
    expect(JSON.parse(localStorage.getItem(CLE_APPAREIL_ENROLE) ?? "{}")).toMatchObject({
      appareilId: ENROLEMENT.appareilId,
      secret: ENROLEMENT.secret,
    });

    // Le rôle reste à choisir ; le téléphone est reconnu.
    await choisirRole("Guichetier");
    await userEvent.type(await screen.findByLabelText("Numéro de téléphone"), "655000002");
    await userEvent.type(screen.getByLabelText("PIN à 6 chiffres"), "482916");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    expect(appelsA("/auth/guichet/connexion")[0]?.corps).toEqual({
      telephone: "+237655000002",
      pin: "482916",
      role: "guichetier",
    });
    // /me est lu avec le jeton reçu, avant qu'il ne soit gardé.
    expect(appelsA("/me")[0]?.entetes).toMatchObject({ Authorization: "Bearer jwt-guichet" });
    expect(localStorage.getItem(CLE_JETON)).toBe("jwt-guichet");
    expect(Number(localStorage.getItem(CLE_JETON_EXPIRE))).toBeGreaterThan(Date.now());
    expect(JSON.parse(localStorage.getItem(CLES.session) ?? "{}")).toEqual({ role: "guichet" });
    // Le moteur de vente trouve l'identité du téléphone, avec la personne connectée comme auteur.
    expect(agence.lireProvisionnement()).toEqual({
      appareilId: ENROLEMENT.appareilId,
      auteurId: "personne-guichet",
      agence: "DEM",
      gare: "DLA",
      plage: { debut: 1, fin: 999 },
    });
    expect(appels.some((a) => a.chemin === "/auth/guichet/connexion")).toBe(true);
  });

  it("dit pourquoi un code d'enrôlement est refusé", async () => {
    serveur((a) =>
      a.chemin === "/appareils/enrolement"
        ? json(a.corps && (a.corps as { code: string }).code === "EXPIRE-EXPIR" ? 410 : 404, {
            message: "non",
          })
        : undefined,
    );
    ouvrir();
    await choisirRole("Guichetier");
    const champ = await screen.findByLabelText("Code d'enrôlement");
    await userEvent.type(champ, "inconnu-code");
    await userEvent.click(screen.getByRole("button", { name: "Enrôler le téléphone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce code n'existe pas ou a déjà servi",
    );
    await userEvent.clear(champ);
    await userEvent.type(champ, "expire-expir");
    await userEvent.click(screen.getByRole("button", { name: "Enrôler le téléphone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce code a expiré");
    expect(localStorage.getItem(CLE_APPAREIL_ENROLE)).toBeNull();
  });
});

describe("connexion par PIN", () => {
  beforeEach(() => {
    memoriserEnrolement(ENROLEMENT);
  });

  it("vérifie le numéro et le PIN avant d'appeler le serveur", async () => {
    const { appelsA } = serveur();
    ouvrir();
    await choisirRole("Guichetier");
    await userEvent.type(await screen.findByLabelText("Numéro de téléphone"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Entre ton numéro à 9 chiffres");
    await userEvent.clear(screen.getByLabelText("Numéro de téléphone"));
    await userEvent.type(screen.getByLabelText("Numéro de téléphone"), "655000002");
    await userEvent.type(screen.getByLabelText("PIN à 6 chiffres"), "12ab34");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Entre les 6 chiffres de ton PIN");
    expect(appelsA("/auth/guichet/connexion")).toHaveLength(0);
  });

  it("ne choisit pas de rôle à la place de la personne", async () => {
    ouvrir();
    await userEvent.click(await screen.findByRole("button", { name: "Continuer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choisis ton rôle.");
  });

  it.each([
    [401, {}, "Numéro, PIN ou mot de passe incorrect."],
    [423, {}, "Compte bloqué après trop d'essais. Réessaie dans 15:00."],
    [429, {}, "Trop de demandes. Réessaie dans 1:00."],
    [503, {}, "Le serveur ne répond pas."],
  ])("explique un refus %i sans ouvrir de session", async (statut, corps, attendu) => {
    serveur((a) =>
      a.chemin === "/auth/guichet/connexion"
        ? json(statut, { message: "non", ...corps })
        : undefined,
    );
    ouvrir();
    await choisirRole("Guichetier");
    await userEvent.type(await screen.findByLabelText("Numéro de téléphone"), "655000002");
    await userEvent.type(screen.getByLabelText("PIN à 6 chiffres"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(attendu);
    expect(localStorage.getItem(CLE_JETON)).toBeNull();
    expect(localStorage.getItem(CLES.session)).toBeNull();
  });

  it("ouvre l'espace du bus pour un convoyeur", async () => {
    serveur(
      (a) =>
        a.chemin === "/auth/guichet/connexion"
          ? json(200, {
              accessToken: "jwt-c",
              tokenType: "Bearer",
              expiresIn: 3600,
              role: "convoyeur",
            })
          : undefined,
      (a) =>
        a.chemin === "/me"
          ? json(200, { ...MOI_GUICHETIER, id: "personne-convoyeur", role: "convoyeur" })
          : undefined,
    );
    const { routeur } = ouvrir();
    await choisirRole("Convoyeur");
    await userEvent.type(await screen.findByLabelText("Numéro de téléphone"), "655000021");
    await userEvent.type(screen.getByLabelText("PIN à 6 chiffres"), "482916");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/chauffeur"));
    expect(JSON.parse(localStorage.getItem(CLES.session) ?? "{}")).toEqual({ role: "bus" });
  });
});

describe("connexion de la direction", () => {
  it("demande le mot de passe, puis le code reçu par SMS, et ouvre l'espace patron", async () => {
    const { appelsA } = serveur();
    const { routeur } = ouvrir();
    await choisirRole("Patron");
    await userEvent.type(await screen.findByLabelText("Numéro de téléphone"), "655000004");
    expect(screen.queryByLabelText("PIN à 6 chiffres")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Mot de passe"), "Recette-Mdp-2026!");
    await userEvent.click(screen.getByRole("button", { name: "Continuer" }));

    expect(await screen.findByLabelText("Code reçu par SMS")).toBeInTheDocument();
    expect(screen.getByText(/Il est valable 5 minutes/)).toBeInTheDocument();
    expect(appelsA("/auth/direction/connexion")[0]?.corps).toEqual({
      telephone: "+237655000004",
      motDePasse: "Recette-Mdp-2026!",
      role: "patron",
    });
    // Le mot de passe ne reste pas en mémoire de l'écran une fois le code demandé.
    await userEvent.type(screen.getByLabelText("Code reçu par SMS"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Valider le code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Entre les 6 chiffres du code reçu.",
    );
    await userEvent.type(screen.getByLabelText("Code reçu par SMS"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Valider le code" }));

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
    expect(appelsA("/auth/direction/verification")[0]?.corps).toEqual({
      defiId: "11111111-1111-4111-8111-111111111111",
      code: "123456",
    });
    expect(localStorage.getItem(CLE_JETON)).toBe("jwt-patron");
    expect(JSON.parse(localStorage.getItem(CLES.session) ?? "{}")).toEqual({ role: "patron" });
    // Le patron n'est pas sur un téléphone de vente : aucune identité de vente n'est composée.
    expect(agence.lireProvisionnement()).toBeNull();
  });

  it("refuse un mauvais code sans ouvrir de session", async () => {
    serveur((a) =>
      a.chemin === "/auth/direction/verification"
        ? json(401, { message: "Code incorrect" })
        : undefined,
    );
    ouvrir();
    await choisirRole("Superviseur de gare");
    await userEvent.type(await screen.findByLabelText("Numéro de téléphone"), "655000003");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "Recette-Mdp-2026!");
    await userEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await userEvent.type(await screen.findByLabelText("Code reçu par SMS"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Valider le code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce code n'est pas bon ou a expiré");
    expect(localStorage.getItem(CLE_JETON)).toBeNull();
    expect(localStorage.getItem(CLES.session)).toBeNull();
  });
});

describe("langues", () => {
  it("s'affiche en anglais et en pidgin", async () => {
    serveur();
    ouvrir("/connexion?agent=1", "en");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Team sign-in" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ticket clerk" })).toBeInTheDocument();
    cleanup();
    ouvrir("/connexion?agent=1", "pcm");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Team login" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Driver" })).toBeInTheDocument();
  });
});

describe("erreurDe", () => {
  it("range chaque réponse de l'API dans le bon message", () => {
    const e = (statut: number) => new ErreurAgent(statut, null, "x");
    expect(erreurDe(new Error("autre"), "connexion")).toEqual({ cle: "inattendue" });
    expect(erreurDe(e(0), "connexion")).toEqual({ cle: "reseau" });
    expect(erreurDe(e(410), "enrolement")).toEqual({ cle: "enrolementExpire" });
    expect(erreurDe(e(404), "enrolement")).toEqual({ cle: "enrolementInconnu" });
    expect(erreurDe(e(422), "enrolement")).toEqual({ cle: "codeEnrolement" });
    expect(erreurDe(e(401), "code")).toEqual({ cle: "codeFaux" });
    expect(erreurDe(e(401), "connexion")).toEqual({ cle: "identifiants" });
    expect(erreurDe(e(404), "connexion")).toEqual({ cle: "inattendue" });
  });
});
