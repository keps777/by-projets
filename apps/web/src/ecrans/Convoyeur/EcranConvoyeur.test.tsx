import {
  ErreurHttp,
  agence,
  creerClientMock,
  type ClientMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { horlogeFigee } from "@/coquille/horloge";
import { rendreApp } from "@/test/rendre";
import { dateAammjj, heureDouala, lireVoyageur, montant } from "./formats";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const HORLOGE = "2027-01-05T07:38:00+01:00";

type Panne = "chargement" | "erreur" | "vide";

/** Source du scénario « Convoyeur » des fixtures, avec au besoin une panne injectée dans la lecture de l'état. */
function sourceAvecPanne(panne: Panne): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      return {
        ...scenario,
        operations: scenario.operations.map((implementation) =>
          implementation.operation === (agence.OP_CONVOYEUR_ETAT as unknown)
            ? ({
                operation: implementation.operation,
                repondre: () => {
                  if (panne === "chargement") return new Promise(() => undefined);
                  throw panne === "vide"
                    ? new ErreurHttp(404, "Aucun départ", "INTROUVABLE")
                    : new ErreurHttp(500, "Panne simulée", "PANNE");
                },
              } as ImplementationMock)
            : implementation,
        ),
      };
    },
  };
}

interface Options {
  panne?: Panne;
  conception?: boolean;
  url?: string;
}

function rendreConvoyeur(options: Options = {}) {
  const client: ClientMock = creerClientMock({
    source: options.panne ? sourceAvecPanne(options.panne) : sourceScenariosFixtures(),
    scenario: "Convoyeur",
    latenceMs: 0,
  });
  const espion = vi.spyOn(client, "executer");
  const rendu = rendreApp({
    url: options.url ?? "/convoyeur",
    scenario: "Convoyeur",
    clientApi: client,
    conception: options.conception ?? false,
    horloge: horlogeFigee(HORLOGE),
    langue: "fr",
  });
  /** Les événements `route.billet_vendu` envoyés à l'API, dans l'ordre. */
  const ventes = () =>
    espion.mock.calls
      .filter(([operation]) => operation.nom === agence.ECRITURES.routeBilletVendu.operation.nom)
      .map(([, evenement]) => evenement as unknown as EvenementVente);
  return { ...rendu, client, ventes };
}

interface EvenementVente {
  id: string;
  at: string;
  appareilId: string;
  auteurId: string;
  numeroPlage: number;
  donnees: {
    departId: string;
    arretMontee: string;
    arretDescente: string;
    siege: number;
    prix: number;
    passager: { nom: string | null; telephone: string | null };
    paiement: { mode: string; recu: number; rendu: number; reference: string | null };
    codeBillet: string;
    gps: { latitude: number; longitude: number; precisionM: number } | null;
  };
}

async function attendreEcran() {
  await screen.findByText("Bus LT 412 AB · Douala → Yaoundé · parti 08:34");
}

const tuile = (etiquette: string) => screen.getByText(etiquette).parentElement as HTMLElement;
const carte = () => screen.getByRole("region", { name: "Vente en route" });
const cash = () => screen.getByRole("button", { name: /^CASH/ });
const momo = () => screen.getByRole("button", { name: /^MOMO/ });
const voyageur = () => screen.getByRole("textbox", { name: /^Nom · téléphone/ });

function simulerGps(releve: { latitude: number; longitude: number; accuracy: number }) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (succes: (p: { coords: typeof releve }) => void) => {
        succes({ coords: releve });
        return 1;
      },
      clearWatch: () => undefined,
      getCurrentPosition: (succes: (p: { coords: typeof releve }) => void) =>
        succes({ coords: releve }),
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "geolocation");
  window.localStorage.clear();
});

describe("Convoyeur · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête, la pastille HORS LIGNE, le bus et le trajet", async () => {
    rendreConvoyeur();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 1, name: "Convoyeur · Alain" }),
    ).toBeInTheDocument();
    expect(screen.getByText("HORS LIGNE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au quai" })).toBeInTheDocument();
  });

  it("affiche les trois tuiles À bord, Libres, En route", async () => {
    rendreConvoyeur();
    await attendreEcran();
    for (const [etiquette, valeur, detail] of [
      ["À bord", "33", "scannés"],
      ["Libres", "7", "4 réservées Pouma"],
      ["En route", "2", "vendus · 9 000"],
    ] as const) {
      expect(within(tuile(etiquette)).getByText(valeur)).toBeInTheDocument();
      expect(within(tuile(etiquette)).getByText(detail)).toBeInTheDocument();
    }
  });

  it("affiche la carte de vente : stepper, siège, prix, voyageur, CASH et MOMO", async () => {
    rendreConvoyeur();
    await attendreEcran();
    const vente = within(carte());
    expect(vente.getByText("Vente en route")).toBeInTheDocument();
    expect(vente.getByText("Pouma → Yaoundé")).toBeInTheDocument();
    expect(vente.getByRole("status")).toHaveTextContent("1 place");
    expect(vente.getByText("siège 36 · prix prorata fixé par l'agence")).toBeInTheDocument();
    expect(voyageur()).toHaveValue("Mballa J. · 6 55 …");
    expect(vente.getByRole("button", { name: "Une place de moins" })).toBeInTheDocument();
    expect(vente.getByRole("button", { name: "Une place de plus" })).toBeInTheDocument();
    expect(cash()).toHaveTextContent("CASH 4 500");
    expect(cash()).toHaveTextContent("billet par SMS");
    expect(momo()).toHaveTextContent("MOMO");
    expect(momo()).toHaveTextContent("push · confirmé à bord");
    expect(
      vente.getByText(
        "Numéroté hors ligne dans ma plage (ALP-DLA-270105-3xxx). Le patron voit chaque vente en route ce soir, avec l'heure et le lieu GPS.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche les actions et la liste nominative à montrer", async () => {
    rendreConvoyeur();
    await attendreEcran();
    expect(screen.getByRole("link", { name: "Scanner à Pouma" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Colis à décharger · 6" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Incident · panne" })).toBeInTheDocument();
    expect(
      screen.getByText("Liste nominative : 33 à bord · 1 contrôle possible à tout moment"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "montrer" })).toBeInTheDocument();
  });

  it("n'affiche « touche n » que si le flag conception est actif", async () => {
    rendreConvoyeur();
    await attendreEcran();
    expect(screen.queryByText(/touche/)).not.toBeInTheDocument();
  });

  it("affiche « touche 1 » et « touche 2 » avec le flag conception", async () => {
    rendreConvoyeur({ conception: true });
    await attendreEcran();
    expect(screen.getByText("Vente en route · touche 1")).toBeInTheDocument();
    expect(cash()).toHaveTextContent("touche 2 · billet par SMS");
  });

  it("n'a ni bouton grisé, ni emoji, ni mention « bientôt »", async () => {
    rendreConvoyeur();
    await attendreEcran();
    expect(document.querySelectorAll(":disabled")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/bient[ôo]t/i);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("garde des cibles tactiles d'au moins 44 px", async () => {
    rendreConvoyeur();
    await attendreEcran();
    const principal = document.querySelector("main") as HTMLElement;
    const cibles = [
      ...within(principal).getAllByRole("button"),
      ...within(principal).getAllByRole("link"),
      voyageur(),
      screen.getByRole("link", { name: "montrer" }),
    ];
    for (const cible of cibles) {
      const style = getComputedStyle(cible);
      const hauteur = parseFloat(style.minHeight || style.height);
      expect(
        hauteur,
        cible.textContent || cible.getAttribute("aria-label") || "",
      ).toBeGreaterThanOrEqual(44);
    }
    for (const rond of ["Une place de moins", "Une place de plus"]) {
      expect(parseFloat(getComputedStyle(screen.getByRole("button", { name: rond })).width)).toBe(
        48,
      );
    }
  });
});

describe("Convoyeur · navigation identique à la maquette", () => {
  it.each([
    ["Retour au quai", "/embarquement"],
    ["Scanner à Pouma", "/embarquement"],
    ["Incident · panne", "/chauffeur"],
    ["montrer", "/inopine"],
  ] as const)("« %s » mène à %s", async (nom, chemin) => {
    const { routeur } = rendreConvoyeur();
    await attendreEcran();
    const lien = screen.getByRole("link", { name: nom });
    expect(lien).toHaveAttribute("href", chemin);
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });

  it("CASH et MOMO restent sur l'écran (action sur place)", async () => {
    const { routeur } = rendreConvoyeur();
    await attendreEcran();
    await userEvent.click(cash());
    await userEvent.click(momo());
    expect(routeur.state.location.pathname).toBe("/convoyeur");
  });
});

describe("Convoyeur · stepper de places", () => {
  it("ajoute des places, recalcule le prix et les sièges, et ne descend pas sous 1", async () => {
    rendreConvoyeur();
    await attendreEcran();
    const plus = screen.getByRole("button", { name: "Une place de plus" });
    const moins = screen.getByRole("button", { name: "Une place de moins" });

    await userEvent.click(plus);
    expect(within(carte()).getByRole("status")).toHaveTextContent("2 places");
    expect(screen.getByText("sièges 36 à 37 · prix prorata fixé par l'agence")).toBeInTheDocument();
    expect(cash()).toHaveTextContent("CASH 9 000");

    await userEvent.click(moins);
    await userEvent.click(moins);
    expect(within(carte()).getByRole("status")).toHaveTextContent("1 place");
    expect(cash()).toHaveTextContent("CASH 4 500");
  });

  it("ne dépasse pas les places libres", async () => {
    rendreConvoyeur();
    await attendreEcran();
    const plus = screen.getByRole("button", { name: "Une place de plus" });
    for (let i = 0; i < 10; i++) await userEvent.click(plus);
    expect(within(carte()).getByRole("status")).toHaveTextContent("7 places");
  });
});

describe("Convoyeur · vente en route", () => {
  it("CASH : un billet de la plage convoyeur 3xxx, heure, GPS, tuiles mises à jour", async () => {
    simulerGps({ latitude: 3.9, longitude: 10.1, accuracy: 12 });
    const { ventes } = rendreConvoyeur();
    await attendreEcran();

    await userEvent.click(cash());
    await screen.findByText(/^Billet ALP-DLA-\d{6}-3001 enregistré\.$/);

    const [evenement] = ventes();
    expect(ventes()).toHaveLength(1);
    expect(evenement).toMatchObject({
      numeroPlage: 3001,
      donnees: {
        arretMontee: "Pouma",
        arretDescente: "Yaoundé",
        siege: 36,
        prix: 4500,
        paiement: { mode: "cash", recu: 4500, rendu: 0, reference: null },
        gps: { latitude: 3.9, longitude: 10.1, precisionM: 12 },
      },
    });
    expect(evenement?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*\+01:00$/);
    expect(evenement?.donnees.codeBillet).toMatch(/^\d{4}$/);
    expect(evenement?.id).toMatch(/^[0-9a-f-]{36}$/);

    // Les compteurs viennent du serveur : un voyageur de plus en route, une place libre de moins, siège suivant.
    await waitFor(() => expect(within(tuile("En route")).getByText("3")).toBeInTheDocument());
    expect(within(tuile("En route")).getByText("vendus · 13 500")).toBeInTheDocument();
    expect(within(tuile("Libres")).getByText("6")).toBeInTheDocument();
    expect(screen.getByText("siège 37 · prix prorata fixé par l'agence")).toBeInTheDocument();
    expect(voyageur()).toHaveValue("");
  });

  it("MOMO : paiement mobile money, hors cash", async () => {
    const { ventes } = rendreConvoyeur();
    await attendreEcran();
    await userEvent.click(momo());
    await screen.findByText(/^Billet ALP-DLA-\d{6}-3001 enregistré\.$/);
    expect(ventes()[0]?.donnees.paiement).toEqual({
      mode: "momo",
      recu: 4500,
      rendu: 0,
      reference: null,
    });
    expect(ventes()[0]?.donnees.gps).toBeNull();
  });

  it("deux places : deux billets, deux numéros de suite, deux sièges, le même voyageur", async () => {
    const { ventes } = rendreConvoyeur();
    await attendreEcran();
    await userEvent.click(screen.getByRole("button", { name: "Une place de plus" }));
    await userEvent.clear(voyageur());
    await userEvent.type(voyageur(), "Nkoa P. · 677 30 11 45");
    await userEvent.click(cash());
    await screen.findByText(/^Billets ALP-DLA-\d{6}-3001, ALP-DLA-\d{6}-3002 enregistrés\.$/);

    expect(ventes().map((v) => [v.numeroPlage, v.donnees.siege])).toEqual([
      [3001, 36],
      [3002, 37],
    ]);
    for (const v of ventes()) {
      expect(v.donnees.passager).toEqual({ nom: "Nkoa P.", telephone: "+237677301145" });
      expect(v.donnees.paiement).toMatchObject({ mode: "cash", recu: 4500, rendu: 0 });
    }
    await waitFor(() =>
      expect(within(tuile("En route")).getByText("vendus · 18 000")).toBeInTheDocument(),
    );
  });

  it("un téléphone partiel ne part pas : le billet est vendu sans SMS", async () => {
    const { ventes } = rendreConvoyeur();
    await attendreEcran();
    await userEvent.click(cash());
    await screen.findByText(/enregistré\./);
    expect(ventes()[0]?.donnees.passager).toEqual({ nom: "Mballa J.", telephone: null });
  });

  it("garde le compteur de numéros d'une ouverture de l'écran à la suivante (hors ligne, sans trou)", async () => {
    const premiere = rendreConvoyeur();
    await attendreEcran();
    await userEvent.click(cash());
    await screen.findByText(/^Billet ALP-DLA-\d{6}-3001 enregistré\.$/);
    expect(premiere.ventes()).toHaveLength(1);
    // L'écran est rouvert (nouvelle session de l'appareil) : le numéro suivant est 3002.
    cleanup();
    const seconde = rendreConvoyeur();
    await attendreEcran();
    await userEvent.click(momo());
    await screen.findByText(/^Billet ALP-DLA-\d{6}-3002 enregistré\.$/);
    expect(seconde.ventes()[0]?.numeroPlage).toBe(3002);
  });

  it("annonce l'échec quand le serveur refuse la vente", async () => {
    const { client } = rendreConvoyeur();
    await attendreEcran();
    const executer = client.executer.bind(client);
    vi.spyOn(client, "executer").mockImplementation(((operation, params, options) => {
      if (operation.nom === agence.ECRITURES.routeBilletVendu.operation.nom) {
        return Promise.reject(new ErreurHttp(409, "Plus de place libre", "DEPART_COMPLET"));
      }
      return executer(operation, params, options);
    }) as typeof client.executer);
    await userEvent.click(cash());
    expect(await screen.findByRole("alert")).toHaveTextContent("La vente n'a pas été enregistrée.");
  });
});

describe("Convoyeur · états", () => {
  it("chargement : l'en-tête, les actions et le pied restent en place sur le style nuit", async () => {
    rendreConvoyeur({ panne: "chargement" });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Convoyeur · vente en route" }),
    ).toBeInTheDocument();
    const principal = document.querySelector("main") as HTMLElement;
    expect(principal).toHaveAttribute("data-etat", "chargement");
    expect(principal).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: "Retour au quai" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Incident · panne" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "montrer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^CASH/ })).not.toBeInTheDocument();
  });

  it("vide : annonce qu'il n'y a pas de départ, sans casser la page", async () => {
    rendreConvoyeur({ panne: "vide" });
    expect(await screen.findByText("Aucun départ en cours pour ce convoyeur.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Scanner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("erreur : l'annonce avec de quoi réessayer", async () => {
    rendreConvoyeur({ panne: "erreur" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L'état du bus ne s'est pas chargé.",
    );
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "montrer" })).toBeInTheDocument();
  });
});

describe("Convoyeur · formats et textes", () => {
  it("lit la zone « Nom · téléphone »", () => {
    expect(lireVoyageur("")).toEqual({ nom: null, telephone: null });
    expect(lireVoyageur("Mballa J. · 6 55 …")).toEqual({ nom: "Mballa J.", telephone: null });
    expect(lireVoyageur("Mballa J. · 6 55 12 34 56")).toEqual({
      nom: "Mballa J.",
      telephone: "+237655123456",
    });
    expect(lireVoyageur("655123456")).toEqual({ nom: null, telephone: "+237655123456" });
    expect(lireVoyageur("+237 655 12 34 56")).toEqual({ nom: null, telephone: "+237655123456" });
    expect(lireVoyageur("Mballa J.")).toEqual({ nom: "Mballa J.", telephone: null });
  });

  it("formate les montants, les heures et la date de Douala", () => {
    expect(montant(9000)).toBe("9 000");
    expect(montant(500)).toBe("500");
    expect(montant(1234567)).toBe("1 234 567");
    expect(heureDouala("2027-01-05T08:34:00.000+01:00")).toBe("08:34");
    expect(dateAammjj(new Date("2027-01-05T07:38:00+01:00"))).toBe("270105");
    // 23 h 30 à Douala, c'est encore le 5 (22 h 30 UTC).
    expect(dateAammjj(new Date("2027-01-05T23:30:00+01:00"))).toBe("270105");
  });

  it("a les mêmes clés en français, en anglais et en pidgin", () => {
    const cles = (o: object, prefixe = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? cles(v, `${prefixe}${k}.`) : [`${prefixe}${k}`],
      );
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
