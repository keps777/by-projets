import { ErreurHttp, ErreurReseau, implementer, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { CodeQr } from "@afrimove/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";
import { PREFIXE_CACHE_BILLET } from "./cache-billet";
import {
  BILLET_ID,
  HORLOGE_PLANCHE,
  avecBillet,
  avecPanne,
  cacheDEssai,
  clientPass,
  rendrePass,
  sourceModifiee,
  stockageMemoire,
} from "./rendre-pass";

afterEach(() => {
  vi.restoreAllMocks();
});

async function attendreBillet() {
  return screen.findByRole("article", { name: /^Billet Bêta Express/ });
}

const lien = (nom: string | RegExp) => screen.getByRole("link", { name: nom });

/** Identifiant du billet côté serveur : les liens sortants l'utilisent, pas celui de l'adresse. */
async function idDuBillet(): Promise<string> {
  const billet = await clientPass().executer(voyageur.OP_BILLET, { billetId: BILLET_ID });
  return billet.id;
}

describe("Pass · rendu de la planche (scénario de démo)", () => {
  it("affiche la pastille, le billet, le code sans scanner et la consigne de la maquette", async () => {
    rendrePass();
    const billet = await attendreBillet();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Billet · QR · code 4 chiffres",
    );
    expect(screen.getByText("Payé · billet envoyé par SMS")).toBeInTheDocument();

    expect(within(billet).getByText("Bêta Express")).toBeInTheDocument();
    expect(within(billet).getByText("BEX-DLA-270105-0142")).toBeInTheDocument();
    expect(within(billet).getByText("DLA")).toBeInTheDocument();
    expect(within(billet).getByText("Douala Akwa")).toBeInTheDocument();
    expect(within(billet).getByText("3 h 30")).toBeInTheDocument();
    expect(within(billet).getByText("YDE")).toBeInTheDocument();
    expect(within(billet).getByText("Yaoundé Mvan")).toBeInTheDocument();

    const champs: Array<[string, string]> = [
      ["Départ", "08:00"],
      ["Date", "05.01"],
      ["Siège", "7"],
      ["Classe", "VIP"],
    ];
    for (const [nom, valeur] of champs) {
      expect(within(billet).getByText(nom).nextElementSibling).toHaveTextContent(valeur);
    }

    expect(within(billet).getByText("Code sans scanner")).toBeInTheDocument();
    expect(within(billet).getByRole("img", { name: "Code du billet : 7 3 4 1" })).toHaveTextContent(
      "7341",
    );
    expect(within(billet).getByText(/Aïcha Ngo · CNI ··· 4471/)).toBeInTheDocument();
    expect(within(billet).getByText(/Au quai 20 min avant, avec ta pièce\./)).toBeInTheDocument();
  });

  it("dessine le QR du billet avec le composant du kit, à partir du contenu du billet (sans réseau)", async () => {
    const client = clientPass();
    const billet = await client.executer(voyageur.OP_BILLET, { billetId: BILLET_ID });
    rendrePass({ client });
    await attendreBillet();

    const qr = screen.getByRole("img", { name: "QR code du billet" });
    expect(qr).toHaveAttribute("width", "132");
    const attendu = render(<CodeQr valeur={billet.qr} taille={132} />).container.querySelector(
      "path",
    );
    expect(qr.querySelector("path")?.getAttribute("d")).toBe(attendu?.getAttribute("d"));
  });

  it("propose les actions de la maquette avec l'heure et le prix de la moto et la limite d'annulation", async () => {
    const id = await idDuBillet();
    rendrePass();
    await attendreBillet();

    expect(lien(/^Suivre mon bus\s*et prévenir un proche$/)).toHaveAttribute(
      "href",
      `/billet/${id}/direct`,
    );
    expect(lien(/^Moto vers la gare\s*part à 07:10 · 700 F$/)).toHaveAttribute(
      "href",
      `/course?billetId=${id}`,
    );
    expect(lien("Reporter ou annuler · gratuit jusqu'à 07:00")).toHaveAttribute("href", "/moi");
    expect(lien("+ colis")).toHaveAttribute("href", "/colis");
    expect(lien("Retour à l'accueil")).toHaveAttribute("href", "/voyager");
  });

  it("garde des cibles tactiles nommées : retour et partager sont de vrais éléments cliquables", async () => {
    rendrePass();
    await attendreBillet();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Partager le billet" })).toBeEnabled();
  });
});

describe("Pass · dans l'application (route, barre d'onglets, navigation)", () => {
  async function ouvrir() {
    const { routeur } = rendreApp({
      url: `/billet/${BILLET_ID}`,
      fixtures: true,
      scenario: "Pass",
    });
    await screen.findByRole("article", { name: /^Billet Bêta Express/ });
    return routeur;
  }

  it("monte l'écran sur /billet/:billetId et éclaire « Voyager » dans la barre du bas", async () => {
    await ouvrir();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    expect(within(barre).getByRole("link", { name: "Voyager" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(barre).getByRole("link", { name: "Colis" })).toHaveAttribute("href", "/colis");
    expect(within(barre).getByRole("link", { name: "Covoit" })).toHaveAttribute("href", "/covoit");
    expect(within(barre).getByRole("link", { name: "Moi" })).toHaveAttribute("href", "/moi");
  });

  it.each([
    ["Retour à l'accueil", "/voyager"],
    [/^Suivre mon bus/, "/billet/ID/direct"],
    [/^Moto vers la gare/, "/course"],
    [/^Reporter ou annuler/, "/moi"],
    ["+ colis", "/colis"],
  ] as const)("« %s » mène à %s", async (nom, chemin) => {
    const routeur = await ouvrir();
    const id = await idDuBillet();
    await userEvent.click(screen.getByRole("link", { name: nom }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin.replace("ID", id)));
  });

  it.each([
    ["Voyager", "/voyager"],
    ["Colis", "/colis"],
    ["Covoit", "/covoit"],
    ["Moi", "/moi"],
  ] as const)("l'onglet « %s » mène à %s", async (nom, chemin) => {
    const routeur = await ouvrir();
    const barre = screen.getByRole("navigation", { name: "Navigation" });
    await userEvent.click(within(barre).getByRole("link", { name: nom }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe(chemin));
  });
});

describe("Pass · partager par WhatsApp", () => {
  it("ouvre WhatsApp avec le trajet et un lien vers le billet, sans le QR ni le code", async () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    rendrePass();
    await attendreBillet();

    await userEvent.click(screen.getByRole("button", { name: "Partager le billet" }));

    expect(ouvrir).toHaveBeenCalledTimes(1);
    const [adresse, cible, options] = ouvrir.mock.calls[0] ?? [];
    expect(cible).toBe("_blank");
    expect(options).toContain("noopener");
    const url = new URL(String(adresse));
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    const message = url.searchParams.get("text") ?? "";
    expect(message).toContain("Bêta Express");
    expect(message).toContain("Douala Akwa → Yaoundé Mvan");
    expect(message).toContain("05.01 à 08:00");
    expect(message).toContain(`${window.location.origin}/billet/${await idDuBillet()}`);
    expect(message).not.toContain("7341");
    expect(message).not.toContain("AFM|");
  });
});

describe("Pass · limite d'annulation gratuite", () => {
  it("vient de l'aperçu d'annulation du serveur (règle de la compagnie), pas du texte de la planche", async () => {
    const source = sourceModifiee((operations) => [
      implementer(
        voyageur.OP_APERCU_ANNULATION,
        (): c.ApercuAnnulation => ({
          billetId: BILLET_ID,
          autorise: true,
          gratuite: true,
          retenue: 0,
          remboursement: 5500,
          gratuiteJusqua: "2027-01-05T06:30:00.000+01:00",
        }),
      ),
      ...operations,
    ]);
    rendrePass({ client: clientPass(source) });
    await attendreBillet();
    await screen.findByText("Reporter ou annuler · gratuit jusqu'à 06:30");
  });

  it("reprend celle du billet quand l'aperçu n'arrive pas (sans réseau)", async () => {
    const { source } = avecPanne([voyageur.OP_APERCU_ANNULATION], () => new ErreurReseau());
    rendrePass({ client: clientPass(source) });
    await attendreBillet();
    expect(await screen.findByText("Reporter ou annuler · gratuit jusqu'à 07:00")).toBeVisible();
  });

  it("suit la règle du domaine du mock : 1 h avant le départ", async () => {
    // Le mock de la planche calcule l'aperçu avec `limiteAnnulationGratuite` du domaine (60 min par défaut).
    const client = clientPass();
    const apercu = await client.executer(voyageur.OP_APERCU_ANNULATION, { billetId: BILLET_ID });
    const billet = await client.executer(voyageur.OP_BILLET, { billetId: BILLET_ID });
    expect(Date.parse(billet.heureDepart) - Date.parse(apercu.gratuiteJusqua)).toBe(60 * 60_000);
  });
});

describe("Pass · états du billet", () => {
  it.each([
    ["annule", "Annulé"],
    ["reporte", "Reporté"],
    ["non_presente", "Non présenté"],
  ] as const)("billet %s : pastille « %s », plus d'actions de voyage", async (etat, texte) => {
    rendrePass({ client: clientPass(avecBillet((b) => ({ ...b, etat }))) });
    await attendreBillet();
    expect(screen.getByText(texte)).toBeInTheDocument();
    expect(screen.queryByText("Payé · billet envoyé par SMS")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Suivre mon bus/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Moto vers la gare/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Reporter ou annuler/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ colis" })).toBeVisible();
  });

  it("payé sans SMS : la pastille ne promet pas de SMS", async () => {
    rendrePass({ client: clientPass(avecBillet((b) => ({ ...b, smsEnvoye: false }))) });
    await attendreBillet();
    expect(screen.getByText("Payé")).toBeInTheDocument();
    expect(screen.queryByText(/billet envoyé par SMS/)).not.toBeInTheDocument();
  });

  it("sans moto proposée : la carte disparaît, « Suivre mon bus » prend la rangée", async () => {
    rendrePass({
      client: clientPass(
        avecBillet((b) => {
          const { courseProposee: _retiree, ...reste } = b;
          return reste;
        }),
      ),
    });
    await attendreBillet();
    expect(screen.queryByRole("link", { name: /^Moto vers la gare/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Suivre mon bus/ })).toBeVisible();
  });

  it("sans siège ni pièce : un tiret et le nom seul", async () => {
    rendrePass({
      client: clientPass(
        avecBillet((b) => ({
          ...b,
          siege: null,
          passager: { nom: "Aïcha Ngo" },
        })),
      ),
    });
    const billet = await attendreBillet();
    expect(within(billet).getByText("Siège").nextElementSibling).toHaveTextContent("–");
    expect(within(billet).getByText(/Aïcha Ngo/)).not.toHaveTextContent("CNI");
  });
});

describe("Pass · chargement, vide et erreur", () => {
  it("montre le chargement avec le retour, sans le bouton partager", async () => {
    let liberer: () => void = () => {};
    const attente = new Promise<void>((resolve) => (liberer = resolve));
    const source = sourceModifiee((operations) =>
      operations.map((impl) =>
        impl.operation.nom === voyageur.OP_BILLET.nom
          ? implementer(voyageur.OP_BILLET, async (params, ctx) => {
              await attente;
              return (impl.repondre as (p: unknown, c: unknown) => Promise<c.BilletVoyageur>)(
                params,
                ctx,
              );
            })
          : impl,
      ),
    );
    rendrePass({ client: clientPass(source) });

    expect(await screen.findByRole("status", { name: "Chargement du billet" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Partager le billet" })).not.toBeInTheDocument();

    liberer();
    await attendreBillet();
    expect(screen.queryByRole("status", { name: "Chargement du billet" })).not.toBeInTheDocument();
  });

  it("billet inconnu (404) : état vide, rien d'inventé sur le billet", async () => {
    const { source } = avecPanne(
      [voyageur.OP_BILLET],
      () => new ErreurHttp(404, "Introuvable", "INTROUVABLE"),
    );
    rendrePass({ client: clientPass(source) });
    expect(await screen.findByRole("heading", { name: "Billet introuvable" })).toBeVisible();
    expect(screen.getByText("Ce billet n'existe plus ou n'est pas à ton nom.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("panne sans copie locale : message d'erreur, puis le billet au clic sur Réessayer", async () => {
    const { source, appels } = avecPanne([voyageur.OP_BILLET], (n) =>
      n === 1 ? new ErreurHttp(500, "Panne", "PANNE") : undefined,
    );
    rendrePass({ client: clientPass(source) });

    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Le billet ne s'est pas chargé");
    expect(alerte).toHaveTextContent("Vérifie ta connexion, puis réessaie.");

    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await attendreBillet();
    expect(appels()).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Pass · sans réseau (copie chiffrée sur l'appareil)", () => {
  it("garde le billet chiffré à chaque réponse du serveur, sans le moindre champ en clair", async () => {
    const stockage = stockageMemoire();
    rendrePass({ cache: cacheDEssai(stockage) });
    await attendreBillet();

    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    const [cle = "", valeur = ""] = [...stockage.contenu][0] ?? [];
    expect(cle).toBe(`${PREFIXE_CACHE_BILLET}${BILLET_ID}`);
    for (const secret of ["7341", "Aïcha", "4471", "AFM|", "BEX-DLA", "Bêta Express"]) {
      expect(valeur).not.toContain(secret);
    }
  });

  it("rouvre le billet sans réseau : même QR, même code, et un bandeau qui le dit", async () => {
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);

    // 1. En ligne : le billet est lu et gardé.
    const premier = rendrePass({ cache });
    await attendreBillet();
    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    const qrEnLigne = screen
      .getByRole("img", { name: "QR code du billet" })
      .querySelector("path")
      ?.getAttribute("d");
    premier.unmount();

    // 2. Plus de réseau : toutes les lectures échouent.
    const { source } = avecPanne(
      [voyageur.OP_BILLET, voyageur.OP_APERCU_ANNULATION],
      () => new ErreurReseau("coupure"),
    );
    rendrePass({ client: clientPass(source), cache });

    const billet = await attendreBillet();
    expect(within(billet).getByRole("img", { name: "Code du billet : 7 3 4 1" })).toBeVisible();
    expect(
      screen.getByRole("img", { name: "QR code du billet" }).querySelector("path"),
    ).toHaveAttribute("d", qrEnLigne);
    expect(screen.getByText("Payé · billet envoyé par SMS")).toBeVisible();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Billet enregistré sur ce téléphone, mis à jour dès que le réseau revient.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Les actions qui ne demandent pas le réseau restent là.
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeVisible();
    expect(screen.getByRole("link", { name: /^Moto vers la gare/ })).toBeVisible();
  });

  it("sans réseau et sans copie : l'erreur, pas un billet inventé", async () => {
    const { source } = avecPanne([voyageur.OP_BILLET], () => new ErreurReseau("coupure"));
    rendrePass({ client: clientPass(source), cache: cacheDEssai() });
    expect(await screen.findByRole("alert")).toHaveTextContent("Le billet ne s'est pas chargé");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("un billet refusé par le serveur (404) efface la copie locale", async () => {
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);
    const premier = rendrePass({ cache });
    await attendreBillet();
    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    premier.unmount();

    const { source } = avecPanne(
      [voyageur.OP_BILLET],
      () => new ErreurHttp(404, "Introuvable", "INTROUVABLE"),
    );
    rendrePass({ client: clientPass(source), cache });
    expect(await screen.findByRole("heading", { name: "Billet introuvable" })).toBeVisible();
    await waitFor(() => expect(stockage.contenu.size).toBe(0));
  });

  it("une réponse du serveur remplace la copie : un billet annulé n'est plus montré comme payé", async () => {
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);
    const premier = rendrePass({ cache });
    await attendreBillet();
    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    premier.unmount();

    rendrePass({
      client: clientPass(avecBillet((b) => ({ ...b, etat: "annule" }))),
      cache,
    });
    expect(await screen.findByText("Annulé")).toBeVisible();
    expect(screen.queryByText("Payé · billet envoyé par SMS")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /./ })).not.toBeInTheDocument();
  });

  it("n'utilise pas la copie d'un autre billet", async () => {
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);
    const premier = rendrePass({ cache });
    await attendreBillet();
    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    premier.unmount();

    // Quelqu'un recopie l'entrée sous un autre identifiant : elle ne se déchiffre pas.
    const valeur = [...stockage.contenu.values()][0] ?? "";
    stockage.contenu.set(`${PREFIXE_CACHE_BILLET}autre-billet`, valeur);
    const { source } = avecPanne([voyageur.OP_BILLET], () => new ErreurReseau("coupure"));
    rendrePass({ client: clientPass(source), cache, url: "/billet/autre-billet" });
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});

describe("Pass · cohérence avec les fixtures", () => {
  it("l'horloge de la planche est celle du banc de fidélité", () => {
    expect(Date.parse(HORLOGE_PLANCHE)).toBe(
      Date.parse(sourceScenariosFixtures().instantInitial?.("Pass") ?? ""),
    );
  });
});
