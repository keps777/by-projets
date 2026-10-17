import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { expect } from "vitest";

/**
 * Banc des parcours : un téléphone émulé (390 × 844, tactile) qui joue un parcours et compte les touches.
 *
 * Règle de comptage (la même pour tous les parcours, écrite dans README.md) :
 * - on part de l'accueil du rôle ; l'ouverture de l'accueil ne compte pas ;
 * - une touche = un appui sur un contrôle de l'écran (lien, bouton, siège, interrupteur, zone photo) ;
 * - un code tapé sur le clavier numérique de l'application (PIN) compte pour UNE touche, comme la carte des
 *   parcours (« 3 · PIN du superviseur ») ; le banc compte aussi les appuis bruts (un par chiffre) ;
 * - remplir un champ texte ne compte pas : « Photo + qui + où, 1 écran » est une seule touche sur la carte.
 */

export const HORLOGE = "2027-01-05T07:38:00+01:00";
const CLE_APPUIS = "__parcours_appuis";

export type Role =
  | "voyageur"
  | "guichet"
  | "quai"
  | "bus"
  | "controle"
  | "superviseur"
  | "patron"
  | "relais"
  | "livreur"
  | "vendeur";

export interface Etape {
  /** Ce que fait l'utilisateur (libellé lisible dans le rapport). */
  libelle: string;
  /** Touches ajoutées par cette étape (0 pour un champ texte). */
  touches: number;
}

export async function lancerNavigateur(): Promise<Browser> {
  return chromium.launch({
    executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] ?? cheminChromium(),
    // Caméra factice : le quai scanne « en continu » sans objectif réel.
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
}

function cheminChromium(): string | undefined {
  const dossier = process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? "/opt/pw-browsers";
  return `${dossier}/chromium`;
}

export interface OptionsOuverture {
  /** Route de l'accueil du rôle (ou de l'écran de départ), avec ou sans paramètres. */
  route: string;
  /** Scénario de démonstration (`?scenario=`) : la planche dont les données alimentent la démo. */
  scenario: string;
  role: Role;
  /** Planche attendue à l'arrivée, si la route n'est pas un accueil connu du banc. */
  planche?: string;
  /** Script exécuté avant le chargement (ex. faux détecteur de QR pour le quai). */
  scriptInit?: string;
}

/** Un parcours en cours : la page, le compteur de touches et le journal des étapes. */
export class Parcours {
  readonly etapes: Etape[] = [];

  private constructor(
    readonly page: Page,
    private readonly contexte: BrowserContext,
  ) {}

  static async ouvrir(
    navigateur: Browser,
    urlApp: string,
    options: OptionsOuverture,
  ): Promise<Parcours> {
    const contexte = await navigateur.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      locale: "fr-FR",
      timezoneId: "Africa/Douala",
      serviceWorkers: "block",
      permissions: ["camera"],
    });
    const page = await contexte.newPage();
    // Appuis bruts : tout clic de confiance (appui du doigt) est compté, qu'un lien recharge la page ou non.
    await page.addInitScript(
      ({ cle, role }) => {
        try {
          if (!window.localStorage.getItem("afrimove.session")) {
            window.localStorage.setItem("afrimove.session", JSON.stringify({ role }));
          }
        } catch {
          // stockage bloqué : la démo fonctionne sans session
        }
        document.addEventListener(
          "click",
          (e) => {
            if (!e.isTrusted) return;
            const n = Number(window.sessionStorage.getItem(cle) ?? "0");
            window.sessionStorage.setItem(cle, String(n + 1));
          },
          true,
        );
      },
      { cle: CLE_APPUIS, role: options.role },
    );
    if (options.scriptInit) await page.addInitScript(options.scriptInit);

    const parcours = new Parcours(page, contexte);
    const sep = options.route.includes("?") ? "&" : "?";
    const params = new URLSearchParams({
      scenario: options.scenario,
      conception: "1",
      horloge: HORLOGE,
    });
    await page.goto(`${urlApp}${options.route}${sep}${params.toString()}`, {
      waitUntil: "networkidle",
    });
    await parcours.attendreEcran(options.planche ?? planchePar(options.route));
    // L'accueil est affiché : on part de zéro.
    await page.evaluate((cle) => window.sessionStorage.setItem(cle, "0"), CLE_APPUIS);
    return parcours;
  }

  async fermer(): Promise<void> {
    await this.contexte.close();
  }

  /** Touches comptées selon la règle du banc. */
  get touches(): number {
    return this.etapes.reduce((somme, e) => somme + e.touches, 0);
  }

  /** Appuis bruts lus dans la page (un par chiffre du clavier PIN). */
  async appuisBruts(): Promise<number> {
    return this.page.evaluate(
      (cle) => Number(window.sessionStorage.getItem(cle) ?? "0"),
      CLE_APPUIS,
    );
  }

  /** Remet le compteur à zéro (début d'une nouvelle mesure dans un même test). */
  async remettreAZero(): Promise<void> {
    this.etapes.length = 0;
    await this.page.evaluate((cle) => window.sessionStorage.setItem(cle, "0"), CLE_APPUIS);
  }

  /**
   * Laisse l'écran se poser : un voyageur regarde l'écran avant de toucher. Résout quand le DOM ne bouge plus
   * depuis `calmeMs` (au plus `maxMs`) ; sans cela, un appui parti avant la fin du chargement des données de
   * démonstration serait sans effet, ce qu'aucune personne ne ferait.
   */
  async attendreCalme(calmeMs = 250, maxMs = 4_000): Promise<void> {
    await this.page.evaluate(
      ({ calmeMs, maxMs }) =>
        new Promise<void>((fini) => {
          let minuterie = window.setTimeout(fin, calmeMs);
          const butoir = window.setTimeout(fin, maxMs);
          const observateur = new MutationObserver(() => {
            window.clearTimeout(minuterie);
            minuterie = window.setTimeout(fin, calmeMs);
          });
          observateur.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
          });
          function fin() {
            observateur.disconnect();
            window.clearTimeout(minuterie);
            window.clearTimeout(butoir);
            fini();
          }
        }),
      { calmeMs, maxMs },
    );
  }

  /** Appuie sur un contrôle : une touche. */
  async toucher(cible: Locator, libelle: string): Promise<void> {
    await this.voir(cible, `« ${libelle} » doit être visible à l'écran`);
    await this.attendreCalme();
    await cible.tap();
    this.etapes.push({ libelle, touches: 1 });
  }

  /** Remplit un champ texte : zéro touche (voir la règle de comptage). */
  async remplir(champ: Locator, texte: string, libelle: string): Promise<void> {
    await this.voir(champ, `le champ « ${libelle} » doit être visible`);
    await champ.fill(texte);
    this.etapes.push({ libelle: `saisie · ${libelle}`, touches: 0 });
  }

  /** Appuie sur une zone photo et choisit une image : une touche. */
  async photographier(cible: Locator, libelle: string): Promise<void> {
    await this.voir(cible, `« ${libelle} » doit être visible`);
    const [selecteur] = await Promise.all([this.page.waitForEvent("filechooser"), cible.tap()]);
    await selecteur.setFiles({
      name: "colis.jpg",
      mimeType: "image/jpeg",
      // Un JPEG minimal : l'application garde seulement une référence de la photo.
      buffer: Buffer.from(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
        "base64",
      ),
    });
    this.etapes.push({ libelle, touches: 1 });
  }

  /** Tape un code sur le clavier numérique de l'application (PIN) : une touche, un appui par chiffre. */
  async saisirCode(code: string, libelle: string): Promise<void> {
    for (const chiffre of code) {
      const touche = this.page.getByRole("button", { name: chiffre, exact: true });
      await this.voir(touche, `la touche ${chiffre} du clavier doit être visible`);
      await touche.tap();
    }
    this.etapes.push({ libelle: `${libelle} (${code.length} chiffres)`, touches: 1 });
  }

  /** Attend que l'écran de cette planche soit affiché (`data-planche`). */
  async attendreEcran(planche: string, etat?: string): Promise<void> {
    const selecteur = etat
      ? `[data-planche="${planche}"][data-etat="${etat}"]`
      : `[data-planche="${planche}"]`;
    await this.voir(
      this.page.locator(selecteur),
      `l'écran ${planche}${etat ? ` (${etat})` : ""} doit s'afficher`,
      15_000,
    );
  }

  /** Attend qu'un élément soit visible ; sinon l'échec porte `message`. */
  async voir(cible: Locator, message = `${cible} doit être visible`, delai = 5_000): Promise<void> {
    try {
      await cible.first().waitFor({ state: "visible", timeout: delai });
    } catch {
      const corps = await this.page
        .locator("body")
        .innerText()
        .then((t) => t.replace(/\s+/g, " ").slice(0, 400))
        .catch(() => "");
      throw new Error(`${message} (introuvable sur ${this.chemin()}) — écran : ${corps}`);
    }
  }

  /** Vérifie qu'aucun élément ne correspond (après un court délai de stabilisation). */
  async absent(cible: Locator, message = `${cible} ne doit pas s'afficher`): Promise<void> {
    await this.page.waitForTimeout(300);
    expect(await cible.count(), message).toBe(0);
  }

  /** Chemin courant (sans paramètres de démonstration). */
  chemin(): string {
    return new URL(this.page.url()).pathname;
  }

  /** Résumé lisible : « 3 touches : Départ 08:00 → Siège 6 → Payer ». */
  resume(): string {
    const detail = this.etapes
      .map((e) => (e.touches > 0 ? e.libelle : `(${e.libelle})`))
      .join(" → ");
    return `${this.touches} touche(s) : ${detail}`;
  }

  /**
   * Vérifie la règle de la carte : au plus `attendu` touches. Le message dit combien de touches et lesquelles,
   * pour qu'un échec se lise comme une ligne de rapport.
   */
  async verifierTouches(attendu: number): Promise<void> {
    const bruts = await this.appuisBruts();
    // Cohérence du banc : chaque appui brut vient d'une étape déclarée (un chiffre de PIN = un appui brut).
    const declares = this.etapes.reduce((s, e) => {
      const chiffres = /\((\d+) chiffres\)$/.exec(e.libelle);
      return s + (e.touches > 0 ? (chiffres ? Number(chiffres[1]) : 1) : 0);
    }, 0);
    expect(
      bruts,
      `appuis réels (${bruts}) ≠ appuis déclarés (${declares}) : une touche a été oubliée dans le scénario`,
    ).toBe(declares);
    expect(this.touches, `${this.resume()} — attendu : ${attendu} au plus`).toBeLessThanOrEqual(
      attendu,
    );
  }
}

/** Planche attendue à l'arrivée sur une route de départ (les accueils de rôle). */
function planchePar(route: string): string {
  const chemin = route.split("?")[0]!;
  const table: Record<string, string> = {
    "/voyager": "Main",
    "/guichet/accueil": "Guichet",
    "/guichet/cadence": "Cadence",
    "/chauffeur": "Chauffeur",
    "/embarquement": "Quai",
    "/gare": "Superviseur",
    "/aujourdhui": "Patron",
    "/rapport": "RapportSoir",
    "/sans-internet": "USSD",
    "/groupe": "Groupe",
    "/inopine": "Controleur",
    "/vendeur/accueil": "Vendeur",
    "/livreur/accueil": "Livreur",
    "/relais/accueil": "RelaisApp",
    "/covoit": "Covoit",
    "/covoit/conducteur": "CovoitConducteur",
    "/monter-en-route": "Arret",
    "/reseau": "Reseau",
  };
  const planche = table[chemin];
  if (!planche) throw new Error(`Route de départ inconnue du banc : ${chemin}`);
  return planche;
}
