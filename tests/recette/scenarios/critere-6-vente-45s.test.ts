import { aammjjDouala, plageGuichet } from "@afrimove/domain";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connecter, lire, pile, type Session } from "../support/api";
import { creerDepart, etatDepuisLaBase, type DepartCree } from "../support/journee";
import { Parcours, stockageDeTelephone } from "../support/parcours";
import { lancerNavigateur } from "../support/telephone";

/**
 * Critère 6 : « un guichetier vend un billet en moins de 45 secondes ».
 *
 * Le téléphone émulé (390 × 844, tactile) ouvre l'application web construite en mode HTTP et joue la vente contre la
 * vraie API. On mesure :
 *   - les touches (même règle que le banc des parcours : un appui sur un contrôle ; remplir un champ ne compte pas) ;
 *   - le temps machine, de la première touche au billet vendu et à l'accueil revenu ;
 *   - un temps humain ESTIMÉ avec le barème ci-dessous. C'est un modèle, pas une mesure : il faudra le remplacer par
 *     la mesure de vrais guichetiers sur de vrais téléphones (voir le procès-verbal).
 */
const BAREME = {
  /** Lire un écran qui vient de s'afficher (secondes). */
  lectureEcran: 2,
  /** Viser et appuyer. */
  parTouche: 1,
  /** Taper un caractère sur le clavier du téléphone (deux pouces). */
  parCaractere: 0.4,
  /** Le client donne son nom ou son numéro à voix haute : on laisse le temps de l'entendre. */
  dictee: 3,
} as const;

const LIMITE_S = 45;

let navigateur: Browser;
let guichetier: Session;
let depart: DepartCree;
let p: Parcours;
let ventes = 0;
let premierNumero = 1;

interface Mesure {
  nom: string;
  touches: number;
  machineS: number;
  humainS: number;
}
const mesures: Mesure[] = [];

beforeAll(async () => {
  navigateur = await lancerNavigateur();
  guichetier = await connecter("guichetier");
  // D'autres scénarios ont pu vendre aujourd'hui au même guichet : la première vente du téléphone prend la suite.
  premierNumero =
    etatDepuisLaBase(1, Date.now()).billets[aammjjDouala(Date.now())] ?? plageGuichet(1).debut;
  depart = creerDepart({ heureDepart: new Date(Date.now() + 2 * 3_600_000) });
  const { urlWeb, urlApi } = pile();
  if (!urlWeb) throw new Error("L'application web n'est pas servie (RECETTE_SANS_WEB ?)");
  // Un seul téléphone pour tout le fichier : son compteur de numéros de billet survit d'une vente à l'autre.
  p = await Parcours.ouvrir(navigateur, {
    urlWeb,
    urlApi,
    route: "/guichet/accueil",
    stockage: stockageDeTelephone(guichetier, "guichet", { id: "recette-tel-1", rang: 1 }),
  });
  await p.attendreEcran("Guichet");
});

afterAll(async () => {
  await p?.fermer();
  await navigateur?.close();
  console.log(
    "\nCritère 6, mesures :\n" +
      mesures
        .map(
          (m) =>
            `  ${m.nom} : ${m.touches} touches, ${m.machineS.toFixed(1)} s machine, ${m.humainS.toFixed(1)} s estimées pour une personne`,
        )
        .join("\n"),
  );
});

/** Joue une vente depuis l'accueil et rend ses mesures. `suite` ajoute des gestes entre l'écran Vendre et « Encaisser ». */
async function vendre(
  nom: string,
  o: {
    passager: string;
    suite?: () => Promise<{ touches: number; caracteres: number; dictees: number }>;
  },
): Promise<Mesure> {
  await p.remettreAZero();
  p.appels.length = 0;
  await p.attendreEcran("Guichet");
  const debut = await p.maintenant();
  await p.toucher(p.page.getByRole("link", { name: /^Vendre un billet/ }), "Vendre un billet");
  await p.voir(p.page.getByLabel("Nom du voyageur"), "le formulaire de vente doit se charger");
  await p.remplir(p.page.getByLabel("Nom du voyageur"), o.passager, "nom du voyageur");
  const sup = o.suite ? await o.suite() : { touches: 0, caracteres: 0, dictees: 0 };
  await p.toucher(
    p.page.getByRole("link", { name: /^Encaisser et imprimer/ }),
    "encaisser et imprimer",
  );
  await p.attendreEcran("Guichet");
  await p.voir(p.page.getByRole("link", { name: /^Vendre un billet/ }), "l'accueil doit revenir");
  const fin = await p.maintenant();
  ventes += 1;
  const touches = p.touches;
  const machineS = (fin - debut) / 1000;
  const humainS =
    machineS +
    2 * BAREME.lectureEcran +
    touches * BAREME.parTouche +
    (o.passager.length + sup.caracteres) * BAREME.parCaractere +
    (1 + sup.dictees) * BAREME.dictee;
  const mesure = { nom, touches, machineS, humainS };
  mesures.push(mesure);
  return mesure;
}

const billetsDuTelephone = () =>
  lire<{
    numero: string;
    sequence: number;
    siege: number | null;
    prix: number;
    bagage: number;
    mode: string;
    etat: string;
    canal: string;
    auteur: string;
  }>(
    `select numero, sequence, siege, prix, bagage, paiement->>'mode' as mode, etat, canal, "auteurId" as auteur
     from billet where "appareilId" = 'recette-tel-1' order by sequence`,
  );

describe("critère 6 : vendre un billet en moins de 45 s", () => {
  it("billet cash au nom du voyageur : 2 touches, bien sous les 45 s", async () => {
    const m = await vendre("cash, nom seul", { passager: "Ngo Paul" });
    expect(m.touches).toBe(2);
    expect(m.machineS).toBeLessThan(10);
    expect(m.humainS).toBeLessThan(LIMITE_S);
    const [billet] = billetsDuTelephone();
    expect(billet).toMatchObject({
      prix: 8000,
      bagage: 0,
      mode: "cash",
      etat: "paye",
      canal: "guichet",
      auteur: guichetier.id,
    });
    expect(billet?.siege).not.toBeNull();
    expect(billet?.numero).toMatch(
      new RegExp(`^DEM-DLA-\\d{6}-${String(premierNumero).padStart(4, "0")}$`),
    );
  });

  it("billet avec bagage et téléphone, payé par MoMo : 4 touches, sous les 45 s", async () => {
    const m = await vendre("MoMo, bagage, téléphone", {
      passager: "Fotso Marie",
      suite: async () => {
        await p.remplir(p.page.getByLabel("Téléphone"), "6 91 22 10 08", "téléphone");
        await p.toucher(p.page.getByRole("button", { name: /bagage/i }), "bagage");
        await p.toucher(p.page.getByRole("button", { name: /^MoMo/ }), "MoMo");
        return { touches: 2, caracteres: 9, dictees: 1 };
      },
    });
    expect(m.touches).toBe(4);
    expect(m.humainS).toBeLessThan(LIMITE_S);
    const billets = billetsDuTelephone();
    expect(billets).toHaveLength(2);
    expect(billets[1]).toMatchObject({ prix: 8000, bagage: 500, mode: "momo", etat: "paye" });
  });

  it("dix billets de suite : jamais un trou ni un doublon de numéro, chacun sous les 45 s", async () => {
    for (let i = 3; i <= 10; i++) {
      const m = await vendre(`billet ${i}`, { passager: `Voyageur ${i}` });
      expect(m.humainS, `billet ${i}`).toBeLessThan(LIMITE_S);
    }
    const billets = billetsDuTelephone();
    expect(billets).toHaveLength(10);
    expect(billets.map((b) => b.sequence)).toEqual(billets.map((_, i) => premierNumero + i));
    expect(new Set(billets.map((b) => b.siege)).size).toBe(10);
    const pire = Math.max(...mesures.map((m) => m.humainS));
    expect(pire).toBeLessThan(LIMITE_S);
  });

  it("un double appui sur « Encaisser et imprimer » ne vend qu'un billet", async () => {
    await p.remettreAZero();
    await p.attendreEcran("Guichet");
    const avant = billetsDuTelephone().length;
    await p.toucher(p.page.getByRole("link", { name: /^Vendre un billet/ }), "Vendre un billet");
    await p.remplir(p.page.getByLabel("Nom du voyageur"), "Double Appui", "nom du voyageur");
    await p.page
      .getByRole("link", { name: /^Encaisser et imprimer/ })
      .evaluate((a: HTMLElement) => {
        a.click();
        a.click();
      });
    await p.attendreEcran("Guichet");
    expect(billetsDuTelephone()).toHaveLength(avant + 1);
  });

  it("le réseau tombe pendant la vente : le billet n'est ni perdu ni vendu deux fois", async () => {
    const avant = billetsDuTelephone().length;
    let coupures = 0;
    // La première requête de vente est coupée avant d'atteindre l'API (et le serveur n'a rien reçu).
    await p.page.route("**/agence/billets", async (route) => {
      if (coupures === 0) {
        coupures += 1;
        await route.abort("connectionreset");
      } else {
        await route.continue();
      }
    });
    await p.toucher(p.page.getByRole("link", { name: /^Vendre un billet/ }), "Vendre un billet");
    await p.remplir(p.page.getByLabel("Nom du voyageur"), "Réseau Coupé", "nom du voyageur");
    await p.toucher(
      p.page.getByRole("link", { name: /^Encaisser et imprimer/ }),
      "encaisser et imprimer",
    );
    // Soit le client relance tout seul (même événement, même identifiant), soit l'écran propose de réessayer : dans
    // les deux cas, au bout du compte, un seul billet.
    const alerte = p.page.getByRole("alert");
    await Promise.race([
      p.attendreEcran("Guichet", 10_000),
      p.voir(alerte, "ni l'accueil ni un message d'erreur ne s'affichent", 10_000),
    ]);
    if (p.chemin() !== "/guichet/accueil") {
      await p.toucher(
        p.page.getByRole("link", { name: /^Encaisser et imprimer/ }),
        "encaisser (nouvel essai)",
      );
      await p.attendreEcran("Guichet");
    }
    await p.page.unroute("**/agence/billets");
    expect(coupures).toBe(1);
    expect(billetsDuTelephone()).toHaveLength(avant + 1);
  });

  // Anomalie A2 corrigée (lot Db) : l'accueil du guichet et les impressions ont leurs routes.
  it("pendant une vente, aucun appel de l'application n'échoue (accueil du guichet, impressions)", async () => {
    await p.remettreAZero();
    p.appels.length = 0;
    await p.page.goto(`${pile().urlWeb}/guichet/accueil`, { waitUntil: "networkidle" });
    await vendre("billet de contrôle", { passager: "Contrôle Appels" });
    const echecs = p.appels.filter(([, , statut]) => statut >= 400).map(([m, c]) => `${m} ${c}`);
    expect([...new Set(echecs)]).toEqual([]);
    // Le billet est vendu et l'écran revient.
    expect(p.chemin()).toBe("/guichet/accueil");
  });

  it("l'accueil du guichet se charge (SYNC, billets, colis, en caisse) sans erreur", async () => {
    await p.page.goto(`${pile().urlWeb}/guichet/accueil`, { waitUntil: "networkidle" });
    await p.attendreEcran("Guichet");
    const texte = await p.page.locator("body").innerText();
    expect(texte).not.toContain("ne s'est pas chargé");
  });

  // Anomalie A9 corrigée (lot Db) : l'application numérote avec le « prochain numéro » que le serveur annonce. Un
  // téléphone neuf (ou au stockage vidé) sur un guichet qui a déjà vendu aujourd'hui repart de la suite de la plage,
  // pas de son début : plus de 409 NUMERO_EN_DOUBLE.
  it("un téléphone neuf sur un guichet qui a déjà vendu aujourd'hui vend sans heurter un numéro déjà pris", async () => {
    const { urlWeb, urlApi } = pile();
    const stockage = stockageDeTelephone(guichetier, "guichet", {
      id: "recette-tel-neuf",
      rang: 1,
    });
    const installe = JSON.parse(stockage["afrimove.appareil"]!) as Record<string, unknown>;
    delete installe["etat"]; // l'appareil ne sait rien des numéros déjà pris
    stockage["afrimove.appareil"] = JSON.stringify(installe);
    const neuf = await Parcours.ouvrir(navigateur, {
      urlWeb: urlWeb!,
      urlApi,
      route: "/guichet/vendre",
      stockage,
    });
    try {
      await neuf.voir(
        neuf.page.getByLabel("Nom du voyageur"),
        "le formulaire de vente doit se charger",
      );
      await neuf.remplir(
        neuf.page.getByLabel("Nom du voyageur"),
        "Téléphone Neuf",
        "nom du voyageur",
      );
      await neuf.toucher(
        neuf.page.getByRole("link", { name: /^Encaisser et imprimer/ }),
        "encaisser et imprimer",
      );
      await neuf.attendreEcran("Guichet");
      expect(
        neuf.appels.filter(([m, c, st]) => m === "POST" && c === "/agence/billets" && st === 409),
      ).toEqual([]);
    } finally {
      await neuf.fermer();
    }
  });
});
