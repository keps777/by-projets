import {
  ErreurHttp,
  ErreurReseau,
  creerClientMock,
  implementer,
  voyageur,
  type ClientApi,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { horlogeFigee, type Horloge } from "@/coquille/horloge";
import { CLES, lire } from "@/coquille/stockage";
import { rendreApp } from "@/test/rendre";
import { DEMO_CONNEXION } from "./demo";
import { ATTENTE_APRES_ESSAIS_S, ESSAIS_MAX } from "./EcranConnexion";

const DEBUT = "2027-01-05T07:38:00+01:00";
const NUMERO = "691221008";
const INTERNATIONAL = "+237691221008";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "OTPCredential");
});

/* ------------------------------------------------------------------ outils */

type Demande = contrats.DemandeCode;
type Verification = contrats.VerificationCode;

interface Reglages {
  /** Réponse à la vérification ; par défaut le code « 4821 » est bon et tout autre est refusé (400). */
  verifier?: (p: Verification) => unknown | Promise<unknown>;
  demander?: (p: Demande) => unknown | Promise<unknown>;
  renvoiDansSecondes?: number;
}

function session(telephone: string, nouveauCompte = false): contrats.SessionVoyageur {
  return {
    jeton: "jeton-test",
    expireA: "2027-02-04T07:38:00.000+01:00",
    nouveauCompte,
    profil: {
      id: "voy-test",
      prenom: "Aïcha",
      nom: "Ngo",
      initiales: "AN",
      telephone,
      pieceVerifiee: false,
      inscritDepuis: "2027-01-05T07:38:00.000+01:00",
      langue: "fr",
    },
  };
}

/** Banc d'essai : un serveur de démonstration qui note les appels et dont on règle les réponses. */
function banc(reglages: Reglages = {}) {
  const demandes: Demande[] = [];
  const verifications: Verification[] = [];
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    async charger(nom): Promise<Scenario> {
      const scenario = await base.charger(nom);
      const remplacements = [
        implementer(voyageur.OP_DEMANDER_CODE, async (p) => {
          demandes.push(p);
          if (reglages.demander) return (await reglages.demander(p)) as contrats.ReponseDemandeCode;
          return {
            telephone: p.telephone,
            canal: p.canal ?? "sms",
            longueurCode: 4,
            renvoiDansSecondes: reglages.renvoiDansSecondes ?? 42,
            expireA: "2027-01-05T07:43:00.000+01:00",
          };
        }),
        implementer(voyageur.OP_VERIFIER_CODE, async (p) => {
          verifications.push(p);
          if (reglages.verifier) return (await reglages.verifier(p)) as contrats.SessionVoyageur;
          if (p.code !== "4821") throw new ErreurHttp(400, "Code incorrect", "CODE_INCORRECT");
          return session(p.telephone);
        }),
      ];
      const noms = new Set(remplacements.map((r) => r.operation.nom));
      return {
        ...scenario,
        operations: [
          ...remplacements,
          ...scenario.operations.filter((o) => !noms.has(o.operation.nom)),
        ] as Scenario["operations"],
      };
    },
  };
  const client: ClientApi = creerClientMock({ source, scenario: "Connexion", latenceMs: 0 });
  return { client, demandes, verifications, source };
}

/** Horloge que le test fait avancer (les comptes à rebours suivent au tic suivant, dans la seconde). */
function horlogeMobile(debut = DEBUT): Horloge & { avancer: (secondes: number) => void } {
  let instant = new Date(debut).getTime();
  return {
    maintenant: () => new Date(instant),
    avancer: (secondes) => {
      instant += secondes * 1000;
    },
  };
}

async function rendre(options: Parameters<typeof rendreApp>[0] & { reglages?: Reglages } = {}) {
  const { reglages, ...reste } = options;
  const serveur = banc(reglages);
  const rendu = rendreApp({
    url: "/connexion",
    horloge: horlogeFigee(DEBUT),
    langue: "fr",
    clientApi: serveur.client,
    ...reste,
  });
  await screen.findByRole("heading", { level: 1 });
  return { ...rendu, ...serveur, utilisateur: userEvent.setup() };
}

const champNumero = () => screen.getByRole("textbox", { name: "Numéro de téléphone" });
const champCode = () => screen.getByLabelText(/Étape 2 · code reçu par/, { selector: "input" });
const continuer = () => screen.getByRole("button", { name: "Continuer" });
const carteCode = () => screen.getByRole("region", { name: /Étape 2 · code reçu par/ });
/** Texte des quatre cases, « 482_ ». */
function cases(): string {
  const grille = carteCode().querySelector("input")!.parentElement!;
  return [...grille.querySelectorAll("span")].map((c) => c.textContent).join("");
}

async function saisirNumero(utilisateur: ReturnType<typeof userEvent.setup>, numero = NUMERO) {
  await utilisateur.type(champNumero(), numero);
}

/** Saisit le numéro puis demande le code par SMS ; attend que le code soit parti. */
async function demanderLeCode(utilisateur: ReturnType<typeof userEvent.setup>) {
  await saisirNumero(utilisateur);
  await utilisateur.click(continuer());
  await waitFor(() => expect(champCode()).toBeEnabled());
}

/* ------------------------------------------------------------------ planche */

describe("Connexion · rendu de la planche de démonstration", () => {
  it("affiche chaque élément de la maquette : étape, titre, numéro, code à moitié tapé, actions, mentions", async () => {
    await rendre({ scenario: "Connexion" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ton numéro,c'est ton compte.",
    );
    expect(screen.getByText("Étape 1 sur 2 · 30 secondes")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pas de mot de passe. Un code arrive par SMS, et ton billet aussi. Le même numéro marche sur un téléphone simple avec *123#.",
      ),
    ).toBeInTheDocument();

    expect(champNumero()).toHaveValue("6 91 22 10 08");
    expect(champNumero()).toHaveAttribute("type", "tel");
    expect(screen.getByText("+237")).toBeInTheDocument();
    expect(screen.getByTestId("numero-valide")).toBeInTheDocument();

    expect(screen.getByText("Étape 2 · code reçu par SMS")).toBeInTheDocument();
    expect(cases()).toBe("482_");
    expect(
      screen.getByText(
        "Le code se remplit tout seul quand le SMS arrive. Personne d'AfriMove ne te le demandera jamais.",
      ),
    ).toBeInTheDocument();

    expect(continuer()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Par WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sans internet · *123#" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "En continuant, tu acceptes les conditions d'utilisation et la politique de données. Tes données ne sont jamais vendues.",
      ),
    ).toBeInTheDocument();
  });

  it("prend le compte à rebours du serveur : « renvoyer dans 0:42 »", async () => {
    const { demandes } = await rendre({ scenario: "Connexion" });
    expect(await screen.findByText("renvoyer dans 0:42")).toBeInTheDocument();
    expect(demandes).toEqual([{ telephone: INTERNATIONAL, canal: "sms" }]);
    expect(screen.queryByRole("button", { name: "Renvoyer le code" })).not.toBeInTheDocument();
  });

  it("met la dernière case tapée en avant, comme la maquette", async () => {
    await rendre({ scenario: "Connexion" });
    await screen.findByText("renvoyer dans 0:42");
    const etats = [...champCode().parentElement!.querySelectorAll("span")].map((c) =>
      c.getAttribute("data-etat"),
    );
    expect(etats).toEqual(["plein", "plein", "actif", "vide"]);
  });

  it("garde le même départ que le scénario `Connexion` des fixtures", () => {
    const { telephone, code } = ecrans.Connexion.donnees;
    expect(DEMO_CONNEXION.numero).toBe(telephone.numero.replace(/\s/g, ""));
    expect(DEMO_CONNEXION.code).toBe(code.filter((c) => c !== "_").join(""));
  });

  it("n'a aucun bouton grisé ni « bientôt », des cibles nommées et des icônes décoratives", async () => {
    await rendre({ scenario: "Connexion" });
    await screen.findByText("renvoyer dans 0:42");
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(document.body).not.toHaveTextContent(/bientôt/i);
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/bienvenue");
    expect(screen.getByRole("link", { name: "Sans internet · *123#" })).toHaveAttribute(
      "href",
      "/sans-internet",
    );
    for (const svg of document.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("Connexion · départ à vide (hors démonstration)", () => {
  it("démarre sans numéro ni code, sans rien demander au serveur", async () => {
    const { demandes } = await rendre();
    expect(champNumero()).toHaveValue("");
    expect(champNumero()).toHaveFocus();
    expect(screen.queryByTestId("numero-valide")).not.toBeInTheDocument();
    expect(cases()).toBe("____");
    expect(champCode()).toBeDisabled();
    expect(screen.queryByText(/renvoyer dans/)).not.toBeInTheDocument();
    expect(demandes).toEqual([]);
  });

  it("même en démonstration, un autre scénario laisse l'écran vide", async () => {
    const { demandes } = await rendre({ scenario: "Main" });
    expect(champNumero()).toHaveValue("");
    expect(demandes).toEqual([]);
  });
});

/* ------------------------------------------------------------------ numéro */

describe("Connexion · numéro", () => {
  it("écrit le numéro au fil de la saisie et affiche la coche seulement quand il est complet", async () => {
    const { utilisateur } = await rendre();
    await utilisateur.type(champNumero(), "6912210");
    expect(champNumero()).toHaveValue("6 91 22 10");
    expect(screen.queryByTestId("numero-valide")).not.toBeInTheDocument();

    await utilisateur.type(champNumero(), "08");
    expect(champNumero()).toHaveValue("6 91 22 10 08");
    expect(screen.getByTestId("numero-valide")).toBeInTheDocument();
  });

  it("accepte un numéro collé avec l'indicatif et refuse les lettres", async () => {
    const { utilisateur } = await rendre();
    await utilisateur.click(champNumero());
    await utilisateur.paste("+237 691 22 10 08");
    expect(champNumero()).toHaveValue("6 91 22 10 08");

    await utilisateur.clear(champNumero());
    await utilisateur.type(champNumero(), "6ab9");
    expect(champNumero()).toHaveValue("6 9");
  });

  it("« Continuer » sans numéro complet : explique, remet le curseur dans le champ, ne demande rien", async () => {
    const { utilisateur, demandes } = await rendre();
    await utilisateur.type(champNumero(), "69122");
    await utilisateur.click(continuer());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Entre ton numéro à 9 chiffres, il commence par 6.",
    );
    expect(champNumero()).toHaveAttribute("aria-invalid", "true");
    expect(champNumero()).toHaveFocus();
    expect(demandes).toEqual([]);

    await utilisateur.type(champNumero(), "1008");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuse un numéro qui ne commence pas par 6", async () => {
    const { utilisateur, demandes } = await rendre();
    await saisirNumero(utilisateur, "291221008");
    expect(screen.queryByTestId("numero-valide")).not.toBeInTheDocument();
    await utilisateur.click(continuer());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(demandes).toEqual([]);
  });

  it("changer de numéro après l'envoi du code annule ce code", async () => {
    const { utilisateur } = await rendre();
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "48");
    expect(cases()).toBe("48__");

    await utilisateur.type(champNumero(), "{Backspace}");
    expect(champCode()).toBeDisabled();
    expect(cases()).toBe("____");
    expect(screen.queryByText(/renvoyer dans/)).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ envoi du code */

describe("Connexion · envoi du code par SMS", () => {
  it("« Continuer » avec un numéro valide demande un code par SMS, lance le compte à rebours et passe aux cases", async () => {
    const { utilisateur, demandes } = await rendre({ reglages: { renvoiDansSecondes: 42 } });
    await demanderLeCode(utilisateur);

    expect(demandes).toEqual([{ telephone: INTERNATIONAL, canal: "sms" }]);
    expect(screen.getByText("renvoyer dans 0:42")).toBeInTheDocument();
    expect(champCode()).toHaveFocus();
    expect(screen.getByText("Étape 2 · code reçu par SMS")).toBeInTheDocument();
  });

  it("n'envoie pas deux codes quand on touche deux fois « Continuer »", async () => {
    const { utilisateur, demandes } = await rendre();
    await saisirNumero(utilisateur);
    await utilisateur.dblClick(continuer());
    await waitFor(() => expect(champCode()).toBeEnabled());
    expect(demandes).toHaveLength(1);
  });

  it("la touche Entrée dans le numéro envoie le code", async () => {
    const { utilisateur, demandes } = await rendre();
    await saisirNumero(utilisateur);
    await utilisateur.keyboard("{Enter}");
    await waitFor(() => expect(champCode()).toBeEnabled());
    expect(demandes).toHaveLength(1);
  });

  it("chargement : le bouton garde son texte et sa place, et signale l'attente", async () => {
    let finir: (valeur: contrats.ReponseDemandeCode) => void = () => undefined;
    const attente = new Promise<contrats.ReponseDemandeCode>((r) => (finir = r));
    const { utilisateur } = await rendre({ reglages: { demander: () => attente } });
    await saisirNumero(utilisateur);
    await utilisateur.click(continuer());

    await waitFor(() => expect(continuer()).toHaveAttribute("aria-busy", "true"));
    expect(continuer()).toHaveTextContent("Continuer");
    expect(continuer()).toBeEnabled();
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();

    await act(async () => {
      finir({
        telephone: INTERNATIONAL,
        canal: "sms",
        longueurCode: 4,
        renvoiDansSecondes: 42,
        expireA: "2027-01-05T07:43:00.000+01:00",
      });
      await attente;
    });
    await waitFor(() => expect(continuer()).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByText("renvoyer dans 0:42")).toBeInTheDocument();
  });

  it("erreur d'envoi : message dans le style de l'écran, mise en page intacte, on peut réessayer", async () => {
    let appels = 0;
    const { utilisateur, demandes } = await rendre({
      reglages: {
        demander: (p) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau();
          return {
            telephone: p.telephone,
            canal: "sms",
            longueurCode: 4,
            renvoiDansSecondes: 42,
            expireA: "2027-01-05T07:43:00.000+01:00",
          };
        },
      },
    });
    await saisirNumero(utilisateur);
    await utilisateur.click(continuer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le code n'a pas pu être envoyé. Vérifie ta connexion et réessaie.",
    );
    expect(champCode()).toBeDisabled();
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sans internet · *123#" })).toBeVisible();

    await utilisateur.click(continuer());
    await waitFor(() => expect(champCode()).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(demandes).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ remplissage automatique */

describe("Connexion · le code se remplit tout seul", () => {
  it("le champ du code propose le code du SMS (Safari iOS, clavier Android) et ouvre le pavé numérique", async () => {
    const { utilisateur } = await rendre();
    await demanderLeCode(utilisateur);
    expect(champCode()).toHaveAttribute("autocomplete", "one-time-code");
    expect(champCode()).toHaveAttribute("inputmode", "numeric");
  });

  it("WebOTP (Chrome Android) : le code lu dans le SMS remplit les quatre cases", async () => {
    const get = vi.fn(() => Promise.resolve({ code: "4821" }));
    vi.stubGlobal("navigator", { ...navigator, credentials: { get } });
    Object.defineProperty(window, "OTPCredential", { value: class {}, configurable: true });

    const { utilisateur } = await rendre();
    expect(get).not.toHaveBeenCalled();
    await demanderLeCode(utilisateur);

    await waitFor(() => expect(cases()).toBe("4821"));
    expect(get).toHaveBeenCalledTimes(1);
    expect((get.mock.calls[0] as unknown[])[0]).toMatchObject({ otp: { transport: ["sms"] } });
  });

  it("n'attend pas de SMS quand le code est demandé par WhatsApp", async () => {
    const get = vi.fn(() => new Promise<{ code: string }>(() => undefined));
    vi.stubGlobal("navigator", { ...navigator, credentials: { get } });
    Object.defineProperty(window, "OTPCredential", { value: class {}, configurable: true });

    const { utilisateur } = await rendre();
    await saisirNumero(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Par WhatsApp" }));
    await waitFor(() => expect(champCode()).toBeEnabled());
    expect(get).not.toHaveBeenCalled();
  });

  it("sans WebOTP la personne tape le code : seuls les chiffres comptent, 4 au plus", async () => {
    const { utilisateur } = await rendre();
    await demanderLeCode(utilisateur);

    await utilisateur.type(champCode(), "4a8-2");
    expect(cases()).toBe("482_");
    await utilisateur.type(champCode(), "1999");
    expect(cases()).toBe("4821");
    expect(champCode()).toHaveValue("4821");
  });

  it("accepte un code collé", async () => {
    const { utilisateur } = await rendre();
    await demanderLeCode(utilisateur);
    await utilisateur.click(champCode());
    await utilisateur.paste("4821");
    expect(cases()).toBe("4821");
  });
});

/* ------------------------------------------------------------------ vérification */

describe("Connexion · vérification du code", () => {
  it("un bon code ouvre la session et mène au tutoriel", async () => {
    const { utilisateur, verifications, routeur } = await rendre();
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "4821");
    await utilisateur.click(continuer());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/tutoriel"));
    expect(verifications).toEqual([{ telephone: INTERNATIONAL, code: "4821" }]);
    expect(JSON.parse(lire(CLES.session)!)).toEqual({ role: "voyageur" });
  });

  it("n'a ni mot de passe ni champ caché : le compte vient du premier code valide, le serveur dit s'il est neuf", async () => {
    const { utilisateur, routeur } = await rendre({
      reglages: { verifier: (p) => session(p.telephone, true) },
    });
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "9999");
    await utilisateur.click(continuer());

    await waitFor(() => expect(routeur.state.location.pathname).toBe("/tutoriel"));
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("un code incomplet n'est pas envoyé : on dit ce qui manque", async () => {
    const { utilisateur, verifications, routeur } = await rendre();
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "48");
    await utilisateur.click(continuer());

    expect(screen.getByRole("alert")).toHaveTextContent("Entre les 4 chiffres du code reçu.");
    expect(verifications).toEqual([]);
    expect(routeur.state.location.pathname).toBe("/connexion");
    expect(champCode()).toHaveFocus();
  });

  it("un mauvais code est refusé, vidé, et on dit combien d'essais restent", async () => {
    const { utilisateur, routeur } = await rendre();
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "1111");
    await utilisateur.click(continuer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce code n'est pas bon. Il te reste 4 essais.",
    );
    expect(cases()).toBe("____");
    expect(routeur.state.location.pathname).toBe("/connexion");
    expect(lire(CLES.session)).toBeNull();

    await utilisateur.type(champCode(), "2222");
    await utilisateur.click(continuer());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Il te reste 3 essais."),
    );
  });

  it("5 essais ratés : attente, plus aucun appel au serveur, puis on peut réessayer", async () => {
    const horloge = horlogeMobile();
    const { utilisateur, verifications } = await rendre({ horloge });
    await demanderLeCode(utilisateur);

    for (let essai = 1; essai <= ESSAIS_MAX; essai += 1) {
      await utilisateur.type(champCode(), "1111");
      await utilisateur.click(continuer());
      await waitFor(() => expect(verifications).toHaveLength(essai));
    }
    expect(await screen.findByText("Trop d'essais. Réessaie dans 1:00.")).toBeInTheDocument();
    expect(ATTENTE_APRES_ESSAIS_S).toBe(60);
    expect(champCode()).toBeDisabled();

    // Pendant l'attente, même le bon code n'est pas envoyé.
    await utilisateur.click(continuer());
    expect(verifications).toHaveLength(ESSAIS_MAX);

    act(() => horloge.avancer(61));
    await waitFor(() => expect(champCode()).toBeEnabled());
    expect(screen.queryByText(/Trop d'essais/)).not.toBeInTheDocument();

    await utilisateur.type(champCode(), "4821");
    await utilisateur.click(continuer());
    await waitFor(() => expect(verifications).toHaveLength(ESSAIS_MAX + 1));
  });

  it("le serveur qui limite le débit (429) déclenche l'attente qu'il indique", async () => {
    const { utilisateur } = await rendre({
      reglages: {
        verifier: () => {
          throw new ErreurHttp(429, "Trop d'essais", "TROP_D_ESSAIS", undefined, 30_000);
        },
      },
    });
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "4821");
    await utilisateur.click(continuer());
    expect(await screen.findByText("Trop d'essais. Réessaie dans 0:30.")).toBeInTheDocument();
  });

  it("une panne réseau n'est pas un mauvais code : elle ne consomme pas d'essai et le code reste saisi", async () => {
    let appels = 0;
    const { utilisateur } = await rendre({
      reglages: {
        verifier: (p) => {
          appels += 1;
          if (appels === 1) throw new ErreurReseau();
          throw new ErreurHttp(400, "Code incorrect", "CODE_INCORRECT");
        },
      },
    });
    await demanderLeCode(utilisateur);
    await utilisateur.type(champCode(), "4821");
    await utilisateur.click(continuer());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le code n'a pas pu être vérifié. Vérifie ta connexion et réessaie.",
    );
    expect(cases()).toBe("4821");

    await utilisateur.click(continuer());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Il te reste 4 essais."),
    );
  });
});

/* ------------------------------------------------------------------ renvoi, WhatsApp, USSD */

describe("Connexion · renvoyer le code", () => {
  it("n'est possible qu'à la fin du compte à rebours", async () => {
    const horloge = horlogeMobile();
    const { utilisateur, demandes } = await rendre({
      horloge,
      reglages: { renvoiDansSecondes: 42 },
    });
    await demanderLeCode(utilisateur);

    expect(screen.getByText("renvoyer dans 0:42")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renvoyer le code" })).not.toBeInTheDocument();

    act(() => horloge.avancer(30));
    expect(await screen.findByText("renvoyer dans 0:12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renvoyer le code" })).not.toBeInTheDocument();

    act(() => horloge.avancer(12));
    const renvoyer = await screen.findByRole("button", { name: "Renvoyer le code" });
    expect(screen.queryByText(/renvoyer dans/)).not.toBeInTheDocument();

    await utilisateur.type(champCode(), "11");
    await utilisateur.click(renvoyer);
    await waitFor(() => expect(demandes).toHaveLength(2));
    expect(demandes[1]).toEqual({ telephone: INTERNATIONAL, canal: "sms" });
    await waitFor(() => expect(screen.getByText("renvoyer dans 0:42")).toBeInTheDocument());
    expect(cases()).toBe("____");
    expect(screen.queryByRole("button", { name: "Renvoyer le code" })).not.toBeInTheDocument();
  });

  it("le renvoi se fait par le même canal que la demande", async () => {
    const horloge = horlogeMobile();
    const { utilisateur, demandes } = await rendre({ horloge });
    await saisirNumero(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Par WhatsApp" }));
    await waitFor(() => expect(champCode()).toBeEnabled());

    act(() => horloge.avancer(43));
    await utilisateur.click(await screen.findByRole("button", { name: "Renvoyer le code" }));
    await waitFor(() => expect(demandes).toHaveLength(2));
    expect(demandes[1]).toEqual({ telephone: INTERNATIONAL, canal: "whatsapp" });
  });
});

describe("Connexion · par WhatsApp", () => {
  it("envoie le code par WhatsApp et le dit dans le titre de la carte", async () => {
    const { utilisateur, demandes } = await rendre();
    await saisirNumero(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Par WhatsApp" }));

    await waitFor(() => expect(champCode()).toBeEnabled());
    expect(demandes).toEqual([{ telephone: INTERNATIONAL, canal: "whatsapp" }]);
    expect(screen.getByText("Étape 2 · code reçu par WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("renvoyer dans 0:42")).toBeInTheDocument();
  });

  it("sans numéro valide, demande d'abord le numéro", async () => {
    const { utilisateur, demandes } = await rendre();
    await utilisateur.click(screen.getByRole("button", { name: "Par WhatsApp" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Entre ton numéro à 9 chiffres");
    expect(champNumero()).toHaveFocus();
    expect(demandes).toEqual([]);
  });

  it("un code demandé par WhatsApp se vérifie comme les autres", async () => {
    const { utilisateur, verifications, routeur } = await rendre();
    await saisirNumero(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Par WhatsApp" }));
    await waitFor(() => expect(champCode()).toBeEnabled());
    await utilisateur.type(champCode(), "4821");
    await utilisateur.click(continuer());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/tutoriel"));
    expect(verifications).toEqual([{ telephone: INTERNATIONAL, code: "4821" }]);
  });
});

describe("Connexion · navigation", () => {
  it("« Sans internet · *123# » ouvre l'écran USSD", async () => {
    const { utilisateur, routeur } = await rendre();
    await utilisateur.click(screen.getByRole("link", { name: "Sans internet · *123#" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/sans-internet"));
  });

  it("« Retour » ramène à l'écran de bienvenue", async () => {
    const { utilisateur, routeur } = await rendre();
    await utilisateur.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/bienvenue"));
  });
});
