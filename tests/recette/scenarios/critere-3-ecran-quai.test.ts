import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connecter, lire, pile, type Session } from "../support/api";
import { creerDepart, type DepartCree } from "../support/journee";
import { Parcours, stockageDeTelephone } from "../support/parcours";
import { Poste } from "../support/postes";
import { lancerNavigateur } from "../support/telephone";

/**
 * Critère 3, côté écran : le quai de l'application web (mode HTTP) lit le QR d'un billet vendu au guichet, le fait
 * monter, puis REFUSE le même QR présenté une seconde fois. La caméra est factice : le détecteur de QR du navigateur
 * (`BarcodeDetector`) rend ce que le test lui donne, comme le banc des parcours.
 */
const FAUX_DETECTEUR = `
  window.__qr = null;
  window.BarcodeDetector = class {
    static async getSupportedFormats() { return ["qr_code"]; }
    async detect() { return window.__qr ? [{ rawValue: window.__qr }] : []; }
  };
`;

let navigateur: Browser;
let agent: Session;
let depart: DepartCree;
let guichet: Poste;

beforeAll(async () => {
  navigateur = await lancerNavigateur();
  agent = await connecter("guichetier");
  // Le premier départ de la fenêtre du quai (une heure avant maintenant) : l'écran sans paramètre le choisit.
  depart = creerDepart({ heureDepart: new Date(Date.now() - 3_600_000), etat: "embarquement" });
  guichet = new Poste(agent, 1);
});

afterAll(async () => {
  await navigateur?.close();
});

describe("critère 3, à l'écran : un billet scanné deux fois est refusé au quai", () => {
  it("le premier passage du QR fait monter le voyageur, le second affiche « Refusé · déjà scanné »", async () => {
    const { urlWeb, urlApi } = pile();
    if (!urlWeb) throw new Error("L'application web n'est pas servie (RECETTE_SANS_WEB ?)");
    const billet = await guichet.vendre({ depart, siege: 4, nom: "Ngo Paul" });

    const p = await Parcours.ouvrir(navigateur, {
      urlWeb,
      urlApi,
      route: "/embarquement",
      stockage: stockageDeTelephone(agent, "quai", { id: "recette-tel-quai", rang: 1 }),
      scriptInit: FAUX_DETECTEUR,
    });
    await p.attendreEcran("Quai");
    await p.voir(
      p.page.getByText(/Aucun billet scanné pour l'instant/),
      "le quai doit être prêt, sans scan",
    );

    // La caméra voit le QR du billet : il monte, sans aucune touche.
    await p.page.evaluate(
      (qr) => ((window as unknown as { __qr: string | null }).__qr = qr),
      billet.qr,
    );
    await p.voir(
      p.page.getByText(/Dernier scan · OK · monte/),
      "le premier passage doit faire monter le voyageur",
      10_000,
    );
    await p.voir(p.page.getByText(/1\s*\/\s*\d+/), "le compteur d'embarqués doit passer à 1");
    expect(await p.appuisBruts()).toBe(0);

    // Le voyageur tend de nouveau son billet (le détecteur ne répète un même QR qu'après quelques secondes).
    await p.page.evaluate(() => ((window as unknown as { __qr: string | null }).__qr = null));
    await p.page.waitForTimeout(3_300);
    await p.page.evaluate(
      (qr) => ((window as unknown as { __qr: string | null }).__qr = qr),
      billet.qr,
    );
    await p.voir(
      p.page.getByText(/Refusé · déjà scanné à/),
      "le second passage doit être refusé",
      10_000,
    );

    // Le serveur a la même version des faits : un « monte », un « deja_scanne », un seul embarqué.
    const scans = lire<{ resultat: string }>(
      `select resultat from scan_quai where "billetId" = '${billet.billetId}' order by "at"`,
    );
    expect(scans.map((s) => s.resultat)).toEqual(["monte", "deja_scanne"]);
    const [etat] = lire<{ etat: string }>(
      `select etat from billet where id = '${billet.billetId}'`,
    );
    expect(etat?.etat).toBe("embarque");
    // Le compteur de l'écran n'a pas bougé avec le refus.
    await p.voir(p.page.getByText(/1\s*\/\s*\d+/), "le compteur doit rester à 1 après le refus");
    await p.fermer();
  });
});
