import { describe, expect, it } from "vitest";
import { ecartConnu, utiliserBanc } from "../support/contexte";

/**
 * Les autres cases de la carte des parcours qui portent un nombre de touches, au-delà des 16 fonctions de la
 * règle (« Je conduis », « Monter en route », « Réseau », « Vendeur ambulant », « Dépôt prépayé », etc.).
 * Règle du comptage : README.md.
 */
const { ouvrir } = utiliserBanc();

describe("monter en route : 1 · bus 2 · payer 3", () => {
  it("accueil → « Monter en route » → bus qui passe → payer", async () => {
    const p = await ouvrir({ route: "/voyager", scenario: "Main", role: "voyageur" });
    await p.toucher(p.page.getByRole("link", { name: /^Monter en route/ }), "Monter en route");
    await p.attendreEcran("Arret");
    await p.toucher(p.page.getByRole("link", { name: /10:05.*Bêta Express/ }), "bus de 10:05");
    await p.attendreEcran("SiegePay");
    await p.toucher(p.page.getByRole("button", { name: /^Payer et recevoir le billet/ }), "payer");
    await p.attendreEcran("Pass", "paye");
    await p.verifierTouches(3);
  });
});

describe("réseau en direct : 1 · ligne 2 · siège 3", () => {
  it("accueil → « voir tout » → ligne → payer (siège déjà proposé)", async () => {
    const p = await ouvrir({ route: "/voyager", scenario: "Main", role: "voyageur" });
    await p.toucher(
      p.page.getByRole("link", { name: /voir tout/ }),
      "Le réseau en direct · voir tout",
    );
    await p.attendreEcran("Reseau");
    await p.toucher(
      p.page.getByRole("link", { name: /^Douala → Yaoundé 3 compagnies/ }),
      "ligne Douala → Yaoundé",
    );
    await p.attendreEcran("SiegePay");
    await p.toucher(p.page.getByRole("button", { name: /^Payer et recevoir le billet/ }), "payer");
    await p.attendreEcran("Pass", "paye");
    await p.verifierTouches(3);
  });
});

describe("bus en direct, prévenir Maman : 1 touche", () => {
  it("l'interrupteur « SMS d'arrivée pour Maman » s'allume en une touche", async () => {
    const p = await ouvrir({
      route: "/billet/BEX-DLA-270105-0142/direct",
      scenario: "Direct",
      role: "voyageur",
      planche: "Direct",
    });
    const interrupteur = p.page.getByRole("switch", { name: "SMS d'arrivée pour Maman" });
    expect(await interrupteur.getAttribute("aria-checked")).toBe("false");
    await p.toucher(interrupteur, "prévenir Maman à l'arrivée");
    await p.voir(
      p.page.locator('[role="switch"][aria-checked="true"]'),
      "le SMS d'arrivée doit être activé",
    );
    await p.verifierTouches(1);
  });
});

describe("point relais, choisir : 1 touche", () => {
  it("sur la carte des relais, « Choisir » enregistre le relais en une touche", async () => {
    const p = await ouvrir({
      route: "/colis/colis-c-dla-270105-0017/relais",
      scenario: "Relais",
      role: "voyageur",
      planche: "Relais",
    });
    await p.toucher(
      p.page.getByRole("button", { name: /^Choisir Mama Fotso/ }),
      "Choisir Mama Fotso",
    );
    await p.verifierTouches(1);
  });
});

describe("vendeur ambulant : départ 1 · siège 2 · payer 3", () => {
  it("accueil vendeur → départ → siège → payer", async () => {
    const p = await ouvrir({
      route: "/vendeur/accueil",
      scenario: "Vendeur",
      role: "vendeur",
      planche: "Vendeur",
    });
    await p.toucher(
      p.page.getByRole("link", { name: /^Vendre un billet à un voisin/ }),
      "Vendre un billet à un voisin",
    );
    await p.attendreEcran("SiegePay");
    await p.toucher(p.page.getByRole("button", { name: "Siège 6, libre" }), "siège 6");
    await p.toucher(p.page.getByRole("button", { name: /^Payer et recevoir le billet/ }), "payer");
    await p.attendreEcran("Pass", "paye");
    await p.verifierTouches(3);
  });
});

describe("dépôt prépayé : 1 · scan 2 · accepter 3", () => {
  it("accueil guichet → Dépôt prépayé → photo au dépôt → accepter, étiquette imprimée", async () => {
    const p = await ouvrir({ route: "/guichet/accueil", scenario: "Guichet", role: "guichet" });
    await p.toucher(p.page.getByRole("link", { name: /^Dépôt prépayé/ }), "Dépôt prépayé");
    await p.attendreEcran("Depot");
    // Le code du client est lu ou tapé : le texte ne compte pas, la fiche du colis s'affiche.
    await p.remplir(
      p.page.getByLabel("Code du colis prépayé"),
      "C-ALP-DLA-270105-0017",
      "code du colis",
    );
    await p.voir(p.page.getByText(/Trouvé · payé/));
    await p.photographier(p.page.getByRole("button", { name: /Photo au dépôt/ }), "photo au dépôt");
    await p.toucher(
      p.page.getByRole("link", { name: /^Accepter · imprimer l'étiquette/ }),
      "accepter",
    );
    // Sans imprimante prête (cas du banc), l'écran garde l'agent sur place avec « Continuer vers le quai » :
    // la 3e touche a bien enregistré le dépôt, la 4e (hors règle) ne sert qu'à quitter l'écran.
    await p.voir(
      p.page.getByText(/L'étiquette sortira dès que l'imprimante sera prête/),
      "le dépôt doit être accepté (étiquette en attente d'imprimante)",
    );
    await p.verifierTouches(3);
  });
});

describe("vente en route : 1 · places 2 · cash 3", () => {
  it("chauffeur → Pouma → places → CASH", async () => {
    const p = await ouvrir({ route: "/chauffeur", scenario: "Chauffeur", role: "bus" });
    await p.toucher(
      p.page.getByRole("link", { name: /^Arrivé à Pouma/ }),
      "Arrivé à Pouma · ouvrir les portes",
    );
    await p.attendreEcran("Convoyeur");
    await p.toucher(
      p.page.getByRole("button", { name: "Une place de moins" }),
      "une place de moins",
    );
    await p.toucher(p.page.getByRole("button", { name: /^CASH/ }), "CASH");
    await p.verifierTouches(3);
  });
});

describe("contrôle inopiné : siège 1 · régulariser 2", () => {
  it("toucher le siège sans billet puis régulariser", async () => {
    const p = await ouvrir({ route: "/inopine", scenario: "Controleur", role: "controle" });
    // Le siège sans billet est déjà ouvert à l'arrivée sur l'écran : « Régulariser » est la seule touche.
    await p.toucher(p.page.getByRole("button", { name: /^Régulariser/ }), "régulariser");
    await p.voir(p.page.getByText(/est en règle/));
    await p.verifierTouches(2);
  });
});

describe("point relais, remettre : code 1 · photo 2", () => {
  it("remettre contre le code, puis la photo du colis remis", async () => {
    const p = await ouvrir({ route: "/relais/accueil", scenario: "RelaisApp", role: "relais" });
    await p.toucher(
      p.page.getByRole("button", { name: /^Remettre code \+ pièce/ }),
      "Remettre code + pièce",
    );
    await p.toucher(
      p.page.getByRole("button", { name: /^Colis remis · photo/ }),
      "Colis remis · photo",
    );
    await p.verifierTouches(2);
  });
});

describe("livreur moto : accepter 1 · remettre 2", () => {
  ecartConnu(
    "accepter la mission puis remettre le colis",
    "« Accepter » ouvre /colis/…/livraison, la vue du client : aucune action « remettre » (code + photo) pour le livreur",
    async () => {
      const p = await ouvrir({ route: "/livreur/accueil", scenario: "Livreur", role: "livreur" });
      await p.toucher(p.page.getByRole("link", { name: /^Accepter/ }), "Accepter la mission");
      await p.attendreEcran("Livraison");
      await p.toucher(
        p.page.getByRole("button", { name: /remettre|remise/i }),
        "remettre le colis",
      );
      await p.verifierTouches(2);
    },
  );
});

describe("je conduis : proposer 1 · publier 2", () => {
  it("« Proposer mon trajet » → « Publier le trajet »", async () => {
    const p = await ouvrir({
      route: "/covoit/conducteur",
      scenario: "CovoitConducteur",
      role: "voyageur",
    });
    await p.toucher(
      p.page.getByRole("button", { name: /^Proposer mon trajet/ }),
      "Proposer mon trajet",
    );
    await p.attendreEcran("Conducteur");
    await p.toucher(
      p.page.getByRole("button", { name: /^Publier le trajet/ }),
      "Publier le trajet",
    );
    await p.verifierTouches(2);
  });
});

describe("le patron : tout à 1 touche de l'accueil", () => {
  const cartes: Array<[string, RegExp, string]> = [
    ["Assistant", /L'assistant a 2 choses à te dire/, "Assistant"],
    ["Analyses", /^Analyses/, "Analyses"],
    ["Comptable", /^Comptable/, "Comptable"],
    ["Config", /^Réglages/, "Config"],
    ["Modules", /^Modules/, "Modules"],
    ["Financement", /^Financement/, "Financement"],
    ["InterAgences", /^Entre compagnies/, "InterAgences"],
    ["Controle", /^Salle de contrôle/, "Controle"],
  ];
  it.each(cartes)("%s s'ouvre en 1 touche", async (planche, nom, libelle) => {
    const p = await ouvrir({ route: "/aujourdhui", scenario: "Patron", role: "patron" });
    await p.toucher(p.page.getByRole("link", { name: nom }).first(), libelle);
    await p.attendreEcran(planche);
    await p.verifierTouches(1);
  });

  it("financement : « Demander » envoie le dossier en 1 touche", async () => {
    const p = await ouvrir({
      route: "/financement",
      scenario: "Financement",
      role: "patron",
      planche: "Financement",
    });
    await p.toucher(p.page.getByRole("button", { name: /^Demander 6 M/ }), "Demander 6 M");
    await p.verifierTouches(1);
  });
});
