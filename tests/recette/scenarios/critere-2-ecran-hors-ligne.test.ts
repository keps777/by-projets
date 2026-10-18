import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connecter, lire, pile, type Session } from "../support/api";
import { creerDepart, declarerAppareil } from "../support/journee";
import { Parcours, stockageDeTelephone } from "../support/parcours";
import { lancerNavigateur } from "../support/telephone";

/**
 * Critère 2, à l'écran : un guichetier vend sans réseau avec l'application web (mode HTTP), la vente est mise en file
 * par le moteur de synchronisation de l'appareil, l'indicateur dit HORS LIGNE, puis au retour du réseau la vente est
 * rejouée sur le vrai serveur (A6) : un billet en base, sur un siège de la part du guichet (A7), sans doublon.
 *
 * Le détail des 4 h, des trois téléphones et des reprises est dans `critere-2-hors-ligne.test.ts` (moteur seul) ; ici
 * on vérifie que l'application est bien branchée sur ce moteur.
 */
const APPAREIL = "recette-ui-hors-ligne";
const RANG = 2;

let navigateur: Browser;
let guichetier: Session;
let p: Parcours;

interface LigneBillet {
  id: string;
  numero: string;
  departId: string;
  siege: number | null;
  mode: string;
}

const billetsDeLAppareil = () =>
  lire<LigneBillet>(
    `select id, numero, "departId", siege, paiement->>'mode' as mode
     from billet where "appareilId" = '${APPAREIL}' order by sequence`,
  );

async function attendre(condition: () => boolean, message: string, delaiMs = 25_000) {
  const limite = Date.now() + delaiMs;
  while (Date.now() < limite) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Délai dépassé : ${message}`);
}

beforeAll(async () => {
  navigateur = await lancerNavigateur();
  guichetier = await connecter("guichetier2");
  declarerAppareil(APPAREIL, RANG);
  creerDepart({ heureDepart: new Date(Date.now() + 3 * 3_600_000) });
  const { urlWeb, urlApi } = pile();
  if (!urlWeb) throw new Error("L'application web n'est pas servie (RECETTE_SANS_WEB ?)");
  p = await Parcours.ouvrir(navigateur, {
    urlWeb,
    urlApi,
    route: "/guichet/accueil",
    stockage: stockageDeTelephone(guichetier, "guichet", { id: APPAREIL, rang: RANG }),
  });
  await p.attendreEcran("Guichet");
});

afterAll(async () => {
  await p?.fermer();
  await navigateur?.close();
});

describe("critère 2, à l'écran : une vente sans réseau", () => {
  it("l'application enrôle l'appareil et prend des nouvelles du serveur (part de sièges reçue)", async () => {
    await attendre(
      () =>
        lire<{ n: number }>(
          `select count(*)::int as n from appareil_sync where id = '${APPAREIL}' and "clePublique" is not null and "derniereSyncA" is not null`,
        )[0]?.n === 1,
      "l'appareil n'a ni enregistré sa clé ni synchronisé",
    );
    await p.voir(p.page.getByText("SYNC", { exact: true }), "l'indicateur doit dire SYNC");
  });

  it("sans réseau : HORS LIGNE, la vente aboutit sur l'appareil, le serveur n'a rien ; au retour du réseau, un seul billet", async () => {
    const avant = billetsDeLAppareil().length;
    // La vente se prépare avec le réseau (contexte de vente lu et gardé), puis le réseau tombe.
    await p.toucher(p.page.getByRole("link", { name: /^Vendre un billet/ }), "Vendre un billet");
    await p.voir(p.page.getByLabel("Nom du voyageur"), "le formulaire de vente doit se charger");
    await p.coupureReseau(true);
    await p.remplir(p.page.getByLabel("Nom du voyageur"), "Hors Ligne Écran", "nom du voyageur");
    const encaisser = p.page.getByRole("link", { name: /^Encaisser et imprimer/ });
    await p.toucher(encaisser, "encaisser et imprimer");
    // Le siège proposé en ligne n'est peut-être pas dans la part de ce guichet : l'écran le dit et propose un siège
    // de la part ; on valide une seconde fois.
    const guichet = p.page.locator('[data-planche="Guichet"]');
    const refus = p.page.getByText(/Ce siège vient d'être pris/);
    await Promise.race([
      guichet.first().waitFor({ state: "visible", timeout: 10_000 }),
      refus.first().waitFor({ state: "visible", timeout: 10_000 }),
    ]);
    if (await refus.first().isVisible()) {
      await p.toucher(encaisser, "encaisser et imprimer (siège de la part)");
    }
    await p.attendreEcran("Guichet");
    await p.voir(
      p.page.getByText("HORS LIGNE", { exact: true }),
      "l'accueil doit rester HORS LIGNE",
    );

    // Hors ligne : le serveur ne sait encore rien de cette vente.
    expect(billetsDeLAppareil()).toHaveLength(avant);

    // Retour du réseau : la file est rejouée, le serveur crée le billet.
    await p.coupureReseau(false);
    await attendre(
      () => billetsDeLAppareil().length === avant + 1,
      "la vente hors ligne n'est pas arrivée au serveur",
    );
    const billets = billetsDeLAppareil();
    const billet = billets[billets.length - 1]!;
    expect(billet.mode).toBe("cash");
    expect(billet.siege).not.toBeNull();
    const [occupation] = lire<{ billetId: string | null }>(
      `select "billetId" from siege_depart where "departId" = '${billet.departId}' and siege = ${billet.siege}`,
    );
    expect(occupation?.billetId).toBe(billet.id);
    expect(billet.numero).toMatch(/^[A-Z]+-[A-Z]+-\d{6}-\d+$/);

    // L'indicateur revient à SYNC sans recharger la page.
    await p.voir(p.page.getByText("SYNC", { exact: true }), "l'indicateur doit revenir à SYNC");

    // Une seule fois : de nouvelles prises de nouvelles ne créent rien de plus.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(billetsDeLAppareil()).toHaveLength(avant + 1);
  });
});
