import { patron } from "@afrimove/api-client";
import { ALPHA_AKWA } from "@afrimove/fixtures";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { modules } from "./client-modules";
import { PIN_REFUSE, PIN_VALIDE, rendreModules } from "./rendre-modules";

/** Attend que la liste soit affichée (l'en-tête est déjà là pendant le chargement). */
async function attendreListe() {
  await screen.findByText("Guichet et caisse");
}

const interrupteur = (nom: string) => screen.getByRole("switch", { name: nom });
const pied = () => document.querySelector<HTMLElement>("p")!;

/** Tape un PIN sur le clavier de la feuille de confirmation. */
async function taperPin(pin: string) {
  const clavier = await screen.findByRole("group", { name: "Clavier PIN" });
  for (const chiffre of pin) {
    fireEvent.click(within(clavier).getByRole("button", { name: chiffre }));
  }
}

/** Les modules vus de l'agence, comme les lisent les menus de l'application. */
async function etatMenus(client: ReturnType<typeof rendreModules>["client"], contexte = {}) {
  const lecture = await client.executer(modules.OP_MODULES_ACTIFS, contexte);
  return Object.fromEntries(lecture.modules.map((m) => [m.code, m.actif]));
}

const NOMS = [
  "Guichet et caisse",
  "Colis",
  "Quai, convoyeur, chauffeur",
  "Supervision, rapport, assistant",
  "Voyageur · app, web, WhatsApp",
  "USSD *123#",
  "Points relais",
  "Livraison moto",
  "Inter-agences et réseau",
  "Covoiturage et vendeurs ambulants",
  "Financement et crédit",
  "Fidélité et parrainage",
];

describe("Modules · rendu de la planche", () => {
  it("affiche l'en-tête, les 12 modules avec leur phrase d'état et le pied du scénario de démo", async () => {
    rendreModules();
    await attendreListe();

    expect(screen.getByRole("heading", { level: 1, name: "Les 12 modules" })).toBeInTheDocument();
    expect(
      screen.getByText("Tout est livré. Tu allumes ce que tu utilises, par gare ou par ville."),
    ).toBeInTheDocument();

    const lignes = within(screen.getByRole("list", { name: "Les 12 modules" })).getAllByRole(
      "listitem",
    );
    expect(lignes.map((l) => l.querySelector("span > span")?.textContent)).toEqual(NOMS);

    const details: Array<[string, string]> = [
      ["Guichet et caisse", "socle · toujours actif"],
      ["Colis", "3 gares · assurance partenaire active"],
      ["Quai, convoyeur, chauffeur", "vente en route autorisée · 14 bus"],
      ["Supervision, rapport, assistant", "rapport à 21 h · 3 destinataires"],
      ["Voyageur · app, web, WhatsApp", "paiement en ligne actif · sièges visibles"],
      ["USSD *123#", "code court attribué par MTN · Orange en attente"],
      ["Points relais", "Douala 12 · Bafoussam 6 · Yaoundé 0"],
      ["Livraison moto", "Douala actif · 18 livreurs · Bafoussam dès 15 livreurs"],
      ["Inter-agences et réseau", "convention signée avec Oméga · colis en correspondance"],
      ["Covoiturage et vendeurs ambulants", "covoit visible dans l'app voyageur · 0 vendeur"],
      ["Financement et crédit", "partenaire financier en cours · simulation disponible"],
      ["Fidélité et parrainage", "1 point = 1 F · code AMI · 250 F offerts"],
    ];
    for (const [nom, detail] of details) {
      expect(interrupteur(nom)).toHaveAccessibleDescription(detail);
    }

    expect(pied()).toHaveTextContent(
      "Un module masqué disparaît des écrans de tes équipes et de tes voyageurs, sans rien perdre. 10 sur 12 actifs chez Alpha.",
    );
  });

  it("allume 10 modules sur 12 : covoiturage et financement sont éteints", async () => {
    rendreModules();
    await attendreListe();
    const eteints = ["Covoiturage et vendeurs ambulants", "Financement et crédit"];
    for (const nom of NOMS) {
      expect(interrupteur(nom)).toHaveAttribute(
        "aria-checked",
        eteints.includes(nom) ? "false" : "true",
      );
    }
  });

  it("écrit en ambre les conditions qui attendent quelqu'un (USSD, financement) et elles seules", async () => {
    rendreModules();
    await attendreListe();
    const enAttente = [...document.querySelectorAll("[data-attente]")].map((e) => e.textContent);
    expect(enAttente).toEqual([
      "code court attribué par MTN · Orange en attente",
      "partenaire financier en cours · simulation disponible",
    ]);
  });

  it("n'a aucun bouton désactivé, nomme chaque interrupteur et le retour", async () => {
    rendreModules();
    await attendreListe();
    expect(document.querySelectorAll("button:disabled, [disabled]")).toHaveLength(0);
    expect(screen.getAllByRole("switch")).toHaveLength(12);
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toBeInTheDocument();
  });
});

describe("Modules · le socle", () => {
  it("garde « Guichet et caisse » allumé : le toucher n'ouvre rien", async () => {
    const { client } = rendreModules();
    await attendreListe();
    const socle = interrupteur("Guichet et caisse");
    expect(socle).toHaveAttribute("aria-checked", "true");
    expect(socle).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(socle);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(socle).toHaveAttribute("aria-checked", "true");
    expect((await etatMenus(client)).guichet_caisse).toBe(true);
  });
});

describe("Modules · activer ou masquer", () => {
  it("allume un module éteint avec le PIN : l'interrupteur, le pied et les menus suivent", async () => {
    const { client } = rendreModules();
    await attendreListe();
    expect((await etatMenus(client)).covoit_vendeurs).toBe(false);

    await userEvent.click(interrupteur("Covoiturage et vendeurs ambulants"));
    const feuille = await screen.findByRole("dialog", { name: "Confirme avec ton PIN" });
    expect(feuille).toHaveTextContent("Allumer « Covoiturage et vendeurs ambulants »");
    // Rien n'est changé avant le PIN.
    expect(interrupteur("Covoiturage et vendeurs ambulants")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await taperPin(PIN_VALIDE);

    await waitFor(() =>
      expect(interrupteur("Covoiturage et vendeurs ambulants")).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(pied()).toHaveTextContent("11 sur 12 actifs chez Alpha.");
    expect((await etatMenus(client)).covoit_vendeurs).toBe(true);
  });

  it("masque un module allumé avec le PIN : il disparaît des modules visibles", async () => {
    const { client } = rendreModules();
    await attendreListe();

    await userEvent.click(interrupteur("Colis"));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Masquer « Colis »");
    await taperPin(PIN_VALIDE);

    await waitFor(() => expect(interrupteur("Colis")).toHaveAttribute("aria-checked", "false"));
    expect(pied()).toHaveTextContent("9 sur 12 actifs chez Alpha.");
    expect((await etatMenus(client)).colis).toBe(false);

    // Le réglage lu par le patron est le même que celui des menus.
    const reglage = await client.executer(patron.OP_MODULES, undefined);
    expect(reglage.modules.find((m) => m.code === "colis")?.actif).toBe(false);
    expect(reglage.actifs).toBe(9);
  });

  it("signe le changement : PIN, méthode et instant de l'horloge du client, portée « agence »", async () => {
    const appels: unknown[] = [];
    rendreModules({ ecritures: appels });
    await attendreListe();

    await userEvent.click(interrupteur("Points relais"));
    await taperPin(PIN_VALIDE);
    await waitFor(() =>
      expect(interrupteur("Points relais")).toHaveAttribute("aria-checked", "false"),
    );

    expect(appels).toEqual([
      {
        code: "relais",
        actif: false,
        portee: { type: "agence" },
        signature: { pin: PIN_VALIDE, methode: "pin", signeA: "2027-01-05T07:38:00.000+01:00" },
      },
    ]);
  });

  it("refuse un PIN incorrect : un message, rien n'est changé, la feuille reste ouverte", async () => {
    const { client } = rendreModules();
    await attendreListe();

    await userEvent.click(interrupteur("Colis"));
    await taperPin(PIN_REFUSE);

    expect(await screen.findByText("PIN incorrect. 2 essais restants.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(interrupteur("Colis")).toHaveAttribute("aria-checked", "true");
    expect((await etatMenus(client)).colis).toBe(true);
    expect(pied()).toHaveTextContent("10 sur 12 actifs");

    // Le bon PIN passe ensuite.
    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(interrupteur("Colis")).toHaveAttribute("aria-checked", "false"));
  });

  it("abandonne sans rien changer quand on ferme la feuille", async () => {
    const { client } = rendreModules();
    await attendreListe();

    await userEvent.click(interrupteur("Colis"));
    await userEvent.click(await screen.findByRole("button", { name: "Fermer" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(interrupteur("Colis")).toHaveAttribute("aria-checked", "true");
    expect((await etatMenus(client)).colis).toBe(true);
  });

  it("dit que la vérification est impossible quand l'écriture échoue, sans rien changer", async () => {
    const { client } = rendreModules({ panne: "changement" });
    await attendreListe();

    await userEvent.click(interrupteur("Colis"));
    await taperPin(PIN_VALIDE);

    expect(await screen.findByText("Vérification impossible. Réessayez.")).toBeInTheDocument();
    expect(interrupteur("Colis")).toHaveAttribute("aria-checked", "true");
    expect((await etatMenus(client)).colis).toBe(true);
  });
});

describe("Modules · par gare ou par ville", () => {
  it("applique le changement à la gare nommée par l'URL, pas à l'agence", async () => {
    const { client } = rendreModules({ url: `/reglages/modules?gare=${ALPHA_AKWA.id}` });
    await attendreListe();
    expect(interrupteur("Covoiturage et vendeurs ambulants")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await userEvent.click(interrupteur("Covoiturage et vendeurs ambulants"));
    await taperPin(PIN_VALIDE);
    await waitFor(() =>
      expect(interrupteur("Covoiturage et vendeurs ambulants")).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(pied()).toHaveTextContent("11 sur 12 actifs chez Alpha.");

    // La gare voit le module, l'agence et les autres gares non.
    expect((await etatMenus(client, { gare: ALPHA_AKWA.id })).covoit_vendeurs).toBe(true);
    expect((await etatMenus(client, { gare: "gare-alp-baf" })).covoit_vendeurs).toBe(false);
    expect((await etatMenus(client)).covoit_vendeurs).toBe(false);
    const reglage = await client.executer(patron.OP_MODULES, undefined);
    const covoit = reglage.modules.find((m) => m.code === "covoit_vendeurs");
    expect(covoit?.actif).toBe(false);
    expect(covoit?.exceptions).toEqual([
      { portee: { type: "gare", id: ALPHA_AKWA.id }, actif: true },
    ]);
  });

  it("applique le changement à la ville nommée par l'URL", async () => {
    const { client } = rendreModules({ url: "/reglages/modules?ville=Douala" });
    await attendreListe();

    await userEvent.click(interrupteur("Colis"));
    await taperPin(PIN_VALIDE);
    await waitFor(() => expect(interrupteur("Colis")).toHaveAttribute("aria-checked", "false"));

    expect((await etatMenus(client, { ville: "Douala" })).colis).toBe(false);
    expect((await etatMenus(client, { ville: "Yaoundé" })).colis).toBe(true);
    expect((await etatMenus(client)).colis).toBe(true);
    const reglage = await client.executer(patron.OP_MODULES, undefined);
    expect(reglage.modules.find((m) => m.code === "colis")?.exceptions).toEqual([
      { portee: { type: "ville", nom: "Douala" }, actif: false },
    ]);
  });
});

describe("Modules · navigation", () => {
  it("« Retour aux réglages » mène à Config (/reglages)", async () => {
    const { routeur } = rendreModules();
    await attendreListe();
    const retour = screen.getByRole("link", { name: "Retour aux réglages" });
    expect(retour).toHaveAttribute("href", "/reglages");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/reglages"));
  });
});

describe("Modules · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête, le retour et les 12 lignes", async () => {
    rendreModules({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement des modules" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Les 12 modules" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toBeInTheDocument();
    expect(document.querySelectorAll("li")).toHaveLength(12);
    await attendreListe();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("montre l'état vide quand l'agence n'a aucun module", async () => {
    rendreModules({ panne: "vide" });
    expect(await screen.findByText("Aucun module")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreModules({ panne: "erreur" });
    expect(await screen.findByText("Impossible de charger les modules")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour aux réglages" })).toBeInTheDocument();
  });

  it("montre l'erreur quand la gare demandée n'existe pas", async () => {
    rendreModules({ url: "/reglages/modules?gare=gare-inconnue" });
    expect(await screen.findByText("Impossible de charger les modules")).toBeInTheDocument();
  });
});
