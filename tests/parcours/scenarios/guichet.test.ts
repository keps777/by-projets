import { describe, expect, it } from "vitest";
import { ecartConnu, utiliserBanc } from "../support/contexte";

/**
 * Parcours de l'agent de guichet, comptés depuis l'accueil `/guichet/accueil` (planche Guichet).
 * Règle du comptage : README.md.
 */
const { ouvrir } = utiliserBanc();

const accueil = () => ouvrir({ route: "/guichet/accueil", scenario: "Guichet", role: "guichet" });

describe("vendre un billet au guichet, imprimé : 3 touches", () => {
  it("« Vendre un billet » → siège + nom sur un écran → encaisser et imprimer", async () => {
    const p = await accueil();
    await p.toucher(p.page.getByRole("link", { name: /^Vendre un billet/ }), "Vendre un billet");
    await p.attendreEcran("Vente");
    await p.remplir(p.page.getByLabel("Nom du voyageur"), "Ngo Paul", "nom du voyageur");
    await p.toucher(p.page.getByRole("button", { name: /^Siège 15 libre/ }), "siège 15");
    await p.toucher(
      p.page.getByRole("link", { name: /^Encaisser et imprimer/ }),
      "encaisser et imprimer",
    );
    // Le billet est vendu : l'agent revient à son accueil, prêt pour le client suivant.
    await p.attendreEcran("Guichet");
    expect(p.chemin()).toBe("/guichet/accueil");
    await p.verifierTouches(3);
  });
});

describe("billet en mode cadence : 1 touche par billet", () => {
  ecartConnu(
    "deux billets de suite en cash, une touche chacun",
    "après la vente, l'écran « Vendu » impose « Billet suivant » : le 2e billet coûte 2 touches (Cadence, étape « Billet suivant »)",
    async () => {
      const p = await accueil();
      await p.toucher(p.page.getByRole("link", { name: /^Mode cadence/ }), "Mode cadence (entrée)");
      await p.attendreEcran("Cadence");
      // Le mode est ouvert une fois pour la file : la règle se mesure par billet vendu.
      const parBillet: number[] = [];
      for (let billet = 1; billet <= 2; billet++) {
        await p.remettreAZero();
        if (billet > 1) {
          await p.toucher(p.page.getByRole("link", { name: /Billet suivant/ }), "Billet suivant");
          await p.attendreEcran("Cadence");
        }
        await p.toucher(p.page.getByRole("button", { name: /^CASH/ }), `CASH · billet ${billet}`);
        await p.attendreEcran("CadenceBillet");
        parBillet.push(p.touches);
      }
      expect(parBillet, `touches par billet : ${parBillet.join(", ")}`).toEqual([1, 1]);
    },
  );

  it("le premier billet en cash tient en 1 touche depuis l'écran cadence", async () => {
    const p = await ouvrir({ route: "/guichet/cadence", scenario: "Cadence", role: "guichet" });
    await p.toucher(p.page.getByRole("button", { name: /^CASH/ }), "CASH");
    await p.attendreEcran("CadenceBillet");
    await p.voir(p.page.getByText(/Numéroté \d+, sans trou/));
    await p.verifierTouches(1);
  });
});

describe("enregistrer un colis au guichet : 3 touches", () => {
  it("« Enregistrer un colis » → photo + infos sur un écran → encaisser, étiquette imprimée", async () => {
    const p = await accueil();
    await p.toucher(
      p.page.getByRole("link", { name: /^Enregistrer un colis/ }),
      "Enregistrer un colis",
    );
    await p.attendreEcran("GuichetColis");
    await p.remplir(p.page.getByLabel(/^Expéditeur/), "Ngo Aïcha · 6 91 22 10 08", "expéditeur");
    await p.remplir(
      p.page.getByLabel(/^Destinataire/),
      "Ngo Thérèse · 6 99 40 18 22",
      "destinataire",
    );
    await p.remplir(p.page.getByLabel("Contenu déclaré"), "Médicaments, vêtements", "contenu");
    await p.remplir(p.page.getByLabel("Poids"), "2 kg", "poids");
    await p.remplir(p.page.getByLabel("Valeur"), "25 000", "valeur");
    await p.photographier(p.page.getByRole("button", { name: /photo/i }), "photo du colis");
    await p.toucher(
      p.page.getByRole("link", { name: /^Encaisser · imprimer l'étiquette/ }),
      "encaisser et imprimer l'étiquette",
    );
    await p.attendreEcran("Guichet");
    await p.verifierTouches(3);
  });
});

describe("fermer sa caisse, validée : 3 touches", () => {
  it("« Ma caisse » → compter les billets → clôturer : la gare reçoit la demande de PIN", async () => {
    const p = await accueil();
    await p.toucher(p.page.getByRole("link", { name: /^Ma caisse/ }), "Ma caisse");
    await p.attendreEcran("Caisse");
    await p.toucher(
      p.page.getByRole("button", { name: /^Billets de 500 : \d+ comptés/ }),
      "compter un billet de 500",
    );
    await p.toucher(p.page.getByRole("link", { name: /^Clôturer/ }), "clôturer · faire valider");
    // La clôture est transmise : l'écran du superviseur montre la demande à valider.
    await p.attendreEcran("Superviseur");
    await p.voir(p.page.getByRole("link", { name: /^Valider · PIN/ }));
    await p.verifierTouches(3);
  });

  it("côté superviseur, la validation de la clôture : lien → PIN → valider = 3 touches", async () => {
    const p = await ouvrir({ route: "/gare", scenario: "Superviseur", role: "superviseur" });
    await p.toucher(p.page.getByRole("link", { name: /^Valider · PIN/ }), "Valider · PIN");
    await p.attendreEcran("SuperviseurValider");
    await p.saisirCode("123456", "PIN du superviseur");
    await p.toucher(p.page.getByRole("link", { name: /^Valider · écart/ }), "valider la clôture");
    await p.attendreEcran("RapportSoir");
    await p.verifierTouches(3);
  });
});
