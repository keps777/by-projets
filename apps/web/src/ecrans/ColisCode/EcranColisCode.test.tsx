import { ErreurHttp, colis, implementer, simulerFlux } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODE,
  COLIS_ID,
  rendreColisCode,
  surveiller,
  transformer,
  type OptionsRenduColisCode,
} from "./rendre-colis-code";

/** Attend que l'écran soit affiché (le colis est lu). */
async function attendreEcran() {
  await screen.findByRole("img", { name: "Code de retrait : 4 8 2 9 1 3" });
}

const pathname = (routeur: { state: { location: { pathname: string } } }) =>
  routeur.state.location.pathname;
const frise = () => screen.getByRole("list", { name: "Suivi du colis" });
const etapes = () => within(frise()).getAllByRole("listitem");
const boutonEnvoyer = () => screen.getByRole("button", { name: "Envoyer le code" });
const boutonReclamer = () => screen.getByRole("button", { name: /^Un problème \?/ });
const boutonPartager = () => screen.getByRole("button", { name: "Partager le suivi" });
const iso = (heure: string) => `2027-01-05T${heure}:00.000+01:00`;

/** Émetteur du suivi en direct : le test publie lui-même les scans. */
function fluxCommande() {
  const commande: { emettre?: (message: unknown) => void } = {};
  const flux: NonNullable<OptionsRenduColisCode["flux"]> = () => [
    simulerFlux(colis.CANAL_SUIVI_COLIS, (_params, ctx) => {
      commande.emettre = ctx.emettre;
    }),
  ];
  return { commande, flux };
}

/** Un scan : le suivi en direct annonce un nouveau jalon. */
function scanner(
  commande: { emettre?: (message: unknown) => void },
  jalon: contrats.JalonSuivi,
  etat: contrats.MessageSuiviColis["etat"],
  heure: string,
) {
  act(() => commande.emettre?.({ colisId: COLIS_ID, etat, jalon, a: iso(heure) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ColisCode · rendu de la planche", () => {
  it("affiche le titre, le résumé, le code, la photo, la frise, les choix et la réclamation de la planche", async () => {
    rendreColisCode();
    await attendreEcran();

    // Le titre de la planche est du texte ; le h1 est celui de l'écran, lu par les lecteurs d'écran.
    expect(
      screen.getByRole("heading", { level: 1, name: "Colis · code · suivi · photo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Colis pour Maman")).toBeInTheDocument();
    expect(screen.getByText("C-ALP-DLA-270105-0017 · 2 kg · assuré 25 000")).toBeInTheDocument();

    expect(screen.getByText("Code de retrait · à donner à Maman seulement")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Code de retrait : 4 8 2 9 1 3" })).toHaveTextContent(
      "482 913",
    );
    expect(
      screen.getByText(
        "Remis contre ce code + sa pièce. Jamais sur l'étiquette, jamais au téléphone.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^photo au dépôt/)).toHaveTextContent("photo au dépôt07:52");

    expect(etapes().map((e) => e.textContent)).toEqual([
      "Passé : Déposé · gare Alpha Douala · étiquette imprimée07:52",
      "Passé : Chargé · bus LT 118 AB · scanné par le convoyeur08:10",
      "En cours : En route · après Bafang · arrivée vers 13:0011:20",
      "À venir : Disponible à Bafoussam · SMS à Maman avec le lieu~13:00",
      "À venir : Remis · photo de la remise envoyée aux deux—",
    ]);
    expect(etapes()[2]).toHaveAttribute("aria-current", "step");

    expect(
      screen.getByText(
        "Un problème ? Réclamation en 1 touche, réponse sous 2 jours ouvrés. Perte prouvée par le suivi : 10 × le port, ou la valeur assurée.",
      ),
    ).toBeInTheDocument();
  });

  it("propose la livraison à domicile et le relais avec leur prix", async () => {
    rendreColisCode();
    await attendreEcran();
    const livraison = screen.getByRole("link", { name: /^Faire livrer chez elle/ });
    expect(livraison).toHaveTextContent("Faire livrer chez ellemoto · 1 000 F · dès l'arrivée");
    expect(livraison).toHaveAttribute("href", `/colis/${COLIS_ID}/livraison`);
    const relais = screen.getByRole("link", { name: /^Déposer en relais/ });
    expect(relais).toHaveTextContent("Déposer en relaisprès de chez elle · 300 F");
    expect(relais).toHaveAttribute("href", `/colis/${COLIS_ID}/relais`);
  });

  it("n'a aucun bouton grisé, nomme les boutons ronds et éclaire « Colis » dans la barre", async () => {
    rendreColisCode();
    await attendreEcran();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
    expect(boutonPartager()).toBeInTheDocument();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: "Colis" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("écrit « non assuré » quand le colis n'a pas d'assurance", async () => {
    rendreColisCode({
      operations: (originale) => [
        transformer(colis.OP_COLIS, originale, (c) => ({ ...c, assure: false, valeurAssuree: 0 })),
      ],
    });
    await attendreEcran();
    expect(screen.getByText("C-ALP-DLA-270105-0017 · 2 kg · non assuré")).toBeInTheDocument();
  });

  it("n'affiche pas la photo au dépôt quand le colis n'en a pas, et garde « Envoyer le code »", async () => {
    rendreColisCode({
      operations: (originale) => [
        transformer(colis.OP_COLIS, originale, (c) => ({
          ...c,
          retrait: { ...c.retrait, photoDepot: null },
        })),
      ],
    });
    await attendreEcran();
    expect(screen.queryByText(/^photo au dépôt/)).not.toBeInTheDocument();
    expect(boutonEnvoyer()).toBeInTheDocument();
  });

  it("n'affiche le badge de conception nulle part : l'écran n'en a pas", async () => {
    rendreColisCode({ conception: true });
    await attendreEcran();
    expect(screen.queryByText(/TOUCHE/)).not.toBeInTheDocument();
  });
});

describe("ColisCode · navigation", () => {
  it("revient à l'accueil avec « Retour »", async () => {
    const { routeur } = rendreColisCode();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(pathname(routeur)).toBe("/voyager"));
  });

  it("ouvre la livraison avec « Faire livrer chez elle »", async () => {
    const { routeur } = rendreColisCode();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: /^Faire livrer chez elle/ }));
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}/livraison`));
  });

  it("ouvre le choix du relais avec « Déposer en relais »", async () => {
    const { routeur } = rendreColisCode();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: /^Déposer en relais/ }));
    await waitFor(() => expect(pathname(routeur)).toBe(`/colis/${COLIS_ID}/relais`));
  });

  it.each([
    ["Voyager", "/voyager"],
    ["Colis", "/colis"],
    ["Covoit", "/covoit"],
    ["Moi", "/moi"],
  ])("la barre mène de « %s » vers %s", async (nom, chemin) => {
    const { routeur } = rendreColisCode();
    await attendreEcran();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    await userEvent.click(within(barre).getByRole("link", { name: nom }));
    await waitFor(() => expect(pathname(routeur)).toBe(chemin));
  });
});

describe("ColisCode · suivi en direct", () => {
  it("avance la frise à chaque scan, avec l'heure du scan, puis relit le colis", async () => {
    const { commande, flux } = fluxCommande();
    const lectures: unknown[] = [];
    rendreColisCode({
      flux,
      operations: (originale) => [surveiller(colis.OP_COLIS, originale, (p) => lectures.push(p))],
    });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());
    expect(lectures).toHaveLength(1);

    scanner(commande, "disponible", "disponible", "12:47");
    await waitFor(() =>
      expect(etapes()[3]).toHaveTextContent(
        "En cours : Disponible à Bafoussam · SMS à Maman avec le lieu12:47",
      ),
    );
    // La frise ne dépend pas de la relecture : l'étape est franchie tout de suite.
    expect(etapes()[3]).toHaveAttribute("aria-current", "step");
    expect(etapes()[2]).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(lectures).toHaveLength(2));

    scanner(commande, "remis", "remis", "13:20");
    await waitFor(() => expect(etapes()[4]).toHaveTextContent(/^Passé : Remis/));
    expect(etapes().map((e) => e.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(etapes()[4]).toHaveTextContent("13:20");
  });

  it("reprend le détail du serveur quand le colis est relu après un scan", async () => {
    const { commande, flux } = fluxCommande();
    rendreColisCode({
      flux,
      operations: (originale) => [
        transformer(colis.OP_COLIS, originale, (c, appel) =>
          appel < 2
            ? c
            : {
                ...c,
                etat: "disponible" as const,
                suivi: c.suivi.map((e) =>
                  e.jalon === "disponible"
                    ? {
                        ...e,
                        fait: true,
                        estimee: false,
                        a: iso("12:47"),
                        detail: "à Bafoussam · retrait à la gare",
                      }
                    : e,
                ),
              },
        ),
      ],
    });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());
    scanner(commande, "disponible", "disponible", "12:47");
    await waitFor(() =>
      expect(etapes()[3]).toHaveTextContent("Disponible à Bafoussam · retrait à la gare12:47"),
    );
  });

  it("ignore un scan déjà connu : pas de relecture inutile", async () => {
    const { commande, flux } = fluxCommande();
    const lectures: unknown[] = [];
    rendreColisCode({
      flux,
      operations: (originale) => [surveiller(colis.OP_COLIS, originale, (p) => lectures.push(p))],
    });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());
    scanner(commande, "en_route", "en_route", "11:20");
    scanner(commande, "charge", "charge", "08:10");
    await new Promise((r) => setTimeout(r, 50));
    expect(lectures).toHaveLength(1);
    expect(etapes()[2]).toHaveAttribute("aria-current", "step");
  });

  it("masque les choix « livrer » et « relais » une fois le colis remis", async () => {
    const { commande, flux } = fluxCommande();
    rendreColisCode({ flux });
    await attendreEcran();
    await waitFor(() => expect(commande.emettre).toBeDefined());
    expect(screen.getByRole("link", { name: /^Faire livrer chez elle/ })).toBeInTheDocument();
    scanner(commande, "remis", "remis", "13:20");
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /^Faire livrer chez elle/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /^Déposer en relais/ })).not.toBeInTheDocument();
  });

  it("garde l'écran affiché quand le suivi en direct s'interrompt", async () => {
    rendreColisCode({
      flux: () => [
        simulerFlux(colis.CANAL_SUIVI_COLIS, (_params, ctx) => {
          ctx.echouer(new ErreurHttp(503, "Direct coupé", "DIRECT"));
        }),
      ],
    });
    await attendreEcran();
    expect(etapes()).toHaveLength(5);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ColisCode · envoyer le code", () => {
  it("envoie le code au destinataire et confirme sans le répéter", async () => {
    const envois: contrats.EnvoiCodeColis[] = [];
    rendreColisCode({
      operations: (originale) => [
        surveiller(colis.OP_ENVOYER_CODE_COLIS, originale, (p) => envois.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonEnvoyer());
    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("Code envoyé par SMS au 6 99 ….");
    expect(confirmation.textContent).not.toContain("482");
    expect(envois).toEqual([{ colisId: COLIS_ID }]);
  });

  it("signale l'échec de l'envoi et laisse réessayer", async () => {
    let appels = 0;
    rendreColisCode({
      operations: (originale) => [
        implementer(colis.OP_ENVOYER_CODE_COLIS, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (
            originale(colis.OP_ENVOYER_CODE_COLIS.nom).repondre as (p: unknown, c: unknown) => never
          )(params, ctx);
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonEnvoyer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le code n'a pas pu être envoyé. Réessaie.",
    );
    expect(boutonEnvoyer()).toBeEnabled();
    await userEvent.click(boutonEnvoyer());
    expect(await screen.findByRole("status")).toHaveTextContent("Code envoyé par SMS");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("n'envoie qu'un message quand on touche deux fois de suite", async () => {
    const envois: unknown[] = [];
    rendreColisCode({
      latenceMs: 30,
      operations: (originale) => [
        surveiller(colis.OP_ENVOYER_CODE_COLIS, originale, (p) => envois.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.dblClick(boutonEnvoyer());
    await screen.findByRole("status");
    expect(envois).toHaveLength(1);
  });
});

describe("ColisCode · réclamation en une touche", () => {
  it("ouvre la réclamation d'une touche et promet la réponse sous 2 jours ouvrés", async () => {
    const demandes: contrats.DemandeReclamation[] = [];
    rendreColisCode({
      operations: (originale) => [
        surveiller(colis.OP_RECLAMER_COLIS, originale, (p) => demandes.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonReclamer());
    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent(
      "Réclamation RCL-C-DLA-270105-0017-1 ouverte. Réponse avant jeudi 7 janvier.",
    );
    expect(demandes).toEqual([{ colisId: COLIS_ID, motif: "autre" }]);
  });

  it("signale l'échec de la réclamation", async () => {
    rendreColisCode({
      operations: () => [
        implementer(colis.OP_RECLAMER_COLIS, () => {
          throw new ErreurHttp(500, "Panne", "PANNE");
        }),
      ],
    });
    await attendreEcran();
    await userEvent.click(boutonReclamer());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La réclamation n'a pas pu être ouverte. Réessaie.",
    );
  });

  it("n'ouvre qu'une réclamation quand on touche deux fois de suite", async () => {
    const demandes: unknown[] = [];
    rendreColisCode({
      latenceMs: 30,
      operations: (originale) => [
        surveiller(colis.OP_RECLAMER_COLIS, originale, (p) => demandes.push(p)),
      ],
    });
    await attendreEcran();
    await userEvent.dblClick(boutonReclamer());
    await screen.findByRole("status");
    expect(demandes).toHaveLength(1);
  });
});

describe("ColisCode · partager le suivi", () => {
  /** Remplace le partage et le presse-papiers du navigateur de test. */
  function brancherNavigateur(options: { share?: boolean; clipboard?: boolean }) {
    const share = vi.fn<(donnees: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    const writeText = vi.fn<(texte: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...(options.share ? { share } : {}),
      ...(options.clipboard ? { clipboard: { writeText } } : {}),
    });
    return { share, writeText };
  }

  it("partage le lien du suivi sans jamais y mettre le code", async () => {
    const { share } = brancherNavigateur({ share: true });
    rendreColisCode();
    await attendreEcran();
    await userEvent.click(boutonPartager());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const donnees = share.mock.calls[0]?.[0];
    expect(donnees).toMatchObject({
      title: "Colis pour Maman",
      text: "Suivi du colis C-ALP-DLA-270105-0017",
    });
    expect(donnees?.url).toContain(`/colis/${COLIS_ID}`);
    expect(JSON.stringify(donnees)).not.toContain(CODE);
    expect(JSON.stringify(donnees)).not.toContain("482");
  });

  it("copie le lien quand le navigateur ne sait pas partager", async () => {
    const { writeText } = brancherNavigateur({ clipboard: true });
    rendreColisCode();
    await attendreEcran();
    await userEvent.click(boutonPartager());
    expect(await screen.findByRole("status")).toHaveTextContent("Lien du suivi copié.");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/colis/${COLIS_ID}`));
    expect(writeText.mock.calls[0]?.[0]).not.toContain(CODE);
  });

  it("ne dit rien quand on ferme la feuille de partage", async () => {
    const { share } = brancherNavigateur({ share: true });
    share.mockRejectedValue(new DOMException("Fermé", "AbortError"));
    rendreColisCode();
    await attendreEcran();
    await userEvent.click(boutonPartager());
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("signale un partage impossible", async () => {
    brancherNavigateur({});
    rendreColisCode();
    await attendreEcran();
    await userEvent.click(boutonPartager());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le suivi n'a pas pu être partagé. Réessaie.",
    );
  });
});

describe("ColisCode · le code reste chez l'expéditeur et le destinataire", () => {
  it("n'est écrit qu'à un endroit de l'écran, ni dans le titre de la page ni dans le stockage", async () => {
    const { routeur } = rendreColisCode();
    await attendreEcran();
    const texte = document.body.textContent ?? "";
    expect(texte.split("482 913")).toHaveLength(2);
    expect(texte).not.toContain(CODE);
    expect(document.title).not.toContain("482");
    expect(pathname(routeur)).not.toContain("482");
    expect(JSON.stringify({ ...localStorage })).not.toContain("482");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("482");
    for (const lien of screen.getAllByRole("link")) {
      expect(lien.getAttribute("href")).not.toContain("482");
    }
  });

  it("n'affiche aucun code quand le colis n'existe pas ou n'est pas à cette personne", async () => {
    rendreColisCode({ colisId: "colis-inconnu" });
    expect(await screen.findByText("Colis introuvable")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{3} \d{3}/);
    expect(screen.queryByRole("img", { name: /^Code de retrait/ })).not.toBeInTheDocument();
  });
});

describe("ColisCode · chargement, vide et erreur", () => {
  it("montre le squelette de la planche pendant le chargement, avec le retour et la barre", async () => {
    rendreColisCode({ latenceMs: 200 });
    const chargement = await screen.findByRole("status", { name: "Chargement du suivi du colis" });
    expect(chargement).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyager");
    expect(screen.getByRole("navigation", { name: "Navigation" })).toBeInTheDocument();
    await attendreEcran();
    expect(
      screen.queryByRole("status", { name: "Chargement du suivi du colis" }),
    ).not.toBeInTheDocument();
  });

  it("dit que le colis est introuvable sur un 404, avec le retour", async () => {
    rendreColisCode({
      operations: () => [
        implementer(colis.OP_COLIS, () => {
          throw new ErreurHttp(404, "Colis introuvable", "colis_introuvable");
        }),
      ],
    });
    expect(await screen.findByRole("heading", { name: "Colis introuvable" })).toBeInTheDocument();
    expect(screen.getByText("Ce colis n'existe pas, ou il n'est pas à toi.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Colis · code · suivi · photo" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });

  it("dit aussi « introuvable » sur un 403 : on ne révèle pas qu'un colis existe", async () => {
    rendreColisCode({
      operations: () => [
        implementer(colis.OP_COLIS, () => {
          throw new ErreurHttp(403, "Interdit", "interdit");
        }),
      ],
    });
    expect(await screen.findByRole("heading", { name: "Colis introuvable" })).toBeInTheDocument();
  });

  it("propose de réessayer après une panne, puis affiche le colis", async () => {
    let appels = 0;
    rendreColisCode({
      operations: (originale) => [
        implementer(colis.OP_COLIS, (params, ctx) => {
          appels += 1;
          if (appels === 1) throw new ErreurHttp(500, "Panne", "PANNE");
          return (originale(colis.OP_COLIS.nom).repondre as (p: unknown, c: unknown) => never)(
            params,
            ctx,
          );
        }),
      ],
    });
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de charger le colis");
    expect(alerte).toHaveTextContent("Vérifie ta connexion, puis réessaie.");
    expect(screen.queryByRole("img", { name: /^Code de retrait/ })).not.toBeInTheDocument();
    await userEvent.click(within(alerte).getByRole("button", { name: "Réessayer" }));
    await attendreEcran();
    expect(appels).toBe(2);
  });
});
