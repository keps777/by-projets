import { describe, expect, it } from "vitest";
import { ecartConnu, utiliserBanc } from "../support/contexte";

/**
 * Parcours du voyageur, comptés depuis l'accueil `/voyager` (planche Main).
 * Règle du comptage : README.md. Chaque test finit sur le résultat du parcours, pas seulement sur le nombre de touches.
 */
const { ouvrir } = utiliserBanc();

const accueil = () => ouvrir({ route: "/voyager", scenario: "Main", role: "voyageur" });

describe("acheter un billet : 3 touches", () => {
  it("départ → siège + MoMo → payer, le billet arrive", async () => {
    const p = await accueil();
    await p.toucher(
      p.page.getByRole("link", { name: /08:00.*Bêta Express/ }),
      "départ 08:00 Bêta Express",
    );
    await p.attendreEcran("SiegePay");
    await p.toucher(
      p.page.getByRole("button", { name: "Siège 6, libre" }),
      "siège 6 (MoMo déjà choisi)",
    );
    await p.toucher(p.page.getByRole("button", { name: /^Payer et recevoir le billet/ }), "payer");
    // Le paiement simulé se confirme tout seul puis ouvre le billet.
    await p.attendreEcran("Pass", "paye");
    expect(p.chemin()).toMatch(/^\/billet\//);
    await p.voir(p.page.getByText("Payé · billet envoyé par SMS"));
    await p.verifierTouches(3);
  });
});

describe("payer pour un proche : 3 touches", () => {
  it("proche → départ → payer", async () => {
    const p = await accueil();
    await p.toucher(
      p.page.getByRole("link", { name: /Payer pour un proche/ }),
      "Payer pour un proche",
    );
    await p.attendreEcran("Proche");
    await p.toucher(
      p.page.getByRole("button", { name: /08:30.*Alpha Voyages/ }),
      "départ 08:30 Alpha",
    );
    // Le bouton affiche son prix quand le devis est arrivé : un voyageur attend ce prix avant de payer.
    const payer = p.page.getByRole("button", { name: /^Payer · .* reçoit son billet.*\d\s*F$/ });
    await p.voir(payer, "le bouton Payer doit afficher son prix");
    await p.toucher(payer, "payer");
    await p.voir(p.page.getByText(/Paiement envoyé/));
    await p.verifierTouches(3);
  });
});

describe("envoyer un colis avec code : 3 touches", () => {
  it("« Envoyer un colis » → photo + qui + où → payer, le code de retrait s'affiche", async () => {
    const p = await accueil();
    await p.toucher(p.page.getByRole("link", { name: /Envoyer un colis/ }), "Envoyer un colis");
    await p.attendreEcran("ColisEnvoi");
    await p.remplir(p.page.getByLabel("Pour qui"), "Maman · 6 99 40 18 22", "pour qui");
    await p.remplir(p.page.getByLabel("Où"), "Bafoussam · gare Alpha", "où");
    await p.remplir(p.page.getByLabel("Contenu déclaré"), "Médicaments", "contenu");
    await p.remplir(p.page.getByLabel("Valeur (F)"), "25000", "valeur");
    await p.photographier(
      p.page.getByRole("button", { name: /prendre le colis en photo/ }),
      "photo du colis",
    );
    await p.voir(p.page.getByText(/Photo prise|photo prise/i).first());
    await p.toucher(
      p.page.getByRole("button", { name: /^Payer et obtenir le code/ }),
      "payer et obtenir le code",
    );
    await p.attendreEcran("ColisCode");
    await p.voir(p.page.getByText("CODE DE RETRAIT", { exact: false }).first());
    await p.verifierTouches(3);
  });
});

describe("suivre son colis, prévenir un proche : 1 touche", () => {
  ecartConnu(
    "le bandeau « Ton colis pour Maman est arrivé » ouvre le suivi du colis",
    "dans le scénario Main, /colis/colis-c-dla-270105-0017 répond « Colis introuvable »",
    async () => {
      const p = await accueil();
      await p.toucher(
        p.page.getByRole("link", { name: /Ton colis pour Maman est arrivé/ }),
        "bandeau colis arrivé",
      );
      await p.attendreEcran("ColisCode");
      await p.absent(p.page.getByText("Colis introuvable"));
      await p.voir(p.page.getByText(/CODE DE RETRAIT/i).first());
      await p.verifierTouches(1);
    },
  );

  it("le suivi du colis, une fois ouvert, montre le code et les étapes (écran seul)", async () => {
    const p = await ouvrir({
      route: "/colis/colis-c-dla-270105-0017",
      scenario: "ColisCode",
      role: "voyageur",
      planche: "ColisCode",
    });
    await p.voir(p.page.getByText(/CODE DE RETRAIT/i).first());
    await p.voir(p.page.getByText(/En route/).first());
  });
});

describe("covoiturage réservé et payé : 3 touches", () => {
  it("covoiturage → réserver → payer, le billet arrive", async () => {
    const p = await accueil();
    await p.toucher(
      p.page.getByRole("link", { name: /Covoiturage Samuel/ }),
      "covoiturage de Samuel",
    );
    await p.attendreEcran("Covoit");
    await p.toucher(p.page.getByRole("button", { name: /Réserver/ }), "réserver");
    await p.attendreEcran("Paiement");
    await p.toucher(p.page.getByRole("button", { name: /^Payer 4 250 F/ }), "payer");
    await p.attendreEcran("Pass");
    expect(p.chemin()).toMatch(/^\/billet\//);
    await p.verifierTouches(3);
  });
});

describe("groupe ou bus entier : 3 touches", () => {
  ecartConnu(
    "« Groupe · bus entier » → places → payer",
    "le lien /groupe de l'accueil n'a ni ?depart= ni ?groupe= : l'écran affiche « Aucun départ choisi »",
    async () => {
      const p = await accueil();
      await p.toucher(
        p.page.getByRole("link", { name: /Groupe · bus entier/ }),
        "Groupe · bus entier",
      );
      await p.attendreEcran("Groupe");
      await p.absent(p.page.getByText("Aucun départ choisi"));
      await p.toucher(
        p.page.getByRole("button", { name: "Plus de voyageurs" }),
        "places : +1 voyageur",
      );
      await p.toucher(p.page.getByRole("button", { name: /^Payer ma part/ }), "payer");
      await p.verifierTouches(3);
    },
  );

  it("l'écran Groupe, avec son groupe de démonstration : places puis payer = 2 touches", async () => {
    const p = await ouvrir({ route: "/groupe", scenario: "Groupe", role: "voyageur" });
    await p.toucher(
      p.page.getByRole("button", { name: "Plus de voyageurs" }),
      "places : +1 voyageur",
    );
    await p.toucher(p.page.getByRole("button", { name: /^Payer ma part/ }), "payer ma part");
    await p.verifierTouches(2);
  });
});

describe("moto vers la gare : 2 touches", () => {
  it("moto → réserver, le billet reste payé et la course est réservée", async () => {
    const p = await accueil();
    await p.toucher(p.page.getByRole("link", { name: /Moto vers la gare/ }), "Moto vers la gare");
    await p.attendreEcran("Course");
    await p.toucher(
      p.page.getByRole("button", { name: /^Réserver la moto pour 07:10/ }),
      "réserver la moto",
    );
    await p.attendreEcran("Pass");
    expect(p.chemin()).toMatch(/^\/billet\//);
    await p.verifierTouches(2);
  });
});

describe("billet sans internet (*123#) : 3 réponses", () => {
  it("depuis l'accueil, « Sans internet » ouvre la séance USSD, qui tient en 3 réponses", async () => {
    const p = await accueil();
    await p.toucher(p.page.getByRole("link", { name: /^Sans internet/ }), "Sans internet");
    await p.attendreEcran("USSD");
    // Chaque invite de la séance attend une réponse : « Repondre: », « Place: » et « Payer MoMo? 1=oui ».
    const seance =
      (await p.page
        .getByLabel(/Écran USSD simulé/)
        .first()
        .getAttribute("aria-label")) ?? "";
    const invites = seance
      .split("\n")
      .filter((l) => /^(Repondre:|Place:|Payer MoMo\?)/.test(l.trim()));
    expect(invites, "invites de la séance *123#").toHaveLength(3);
    await p.voir(p.page.getByText(/3 réponses = un billet/));
    expect(p.touches).toBeLessThanOrEqual(1);
  });
});
