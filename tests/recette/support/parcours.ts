import { plageGuichet } from "@afrimove/domain";
import type { Browser, BrowserContext, Locator, Page } from "playwright";
import type { Session } from "./api";
import { etatDepuisLaBase } from "./journee";
import { ouvrirTelephone } from "./telephone";

/**
 * Un téléphone émulé branché sur l'application web construite en mode HTTP (`VITE_API_MODE=http`) : il joue un
 * parcours contre la vraie API et compte les touches, avec la même règle que le banc `tests/parcours` :
 * une touche = un appui sur un contrôle ; remplir un champ texte ne compte pas ; un code PIN tapé compte pour une
 * touche (le banc compte aussi les appuis bruts).
 */
const CLE_APPUIS = "__recette_appuis";

export interface Etape {
  libelle: string;
  touches: number;
  /** Instant de l'étape sur le téléphone (ms, `performance.now`). */
  a: number;
}

/** Ce que l'installation d'un appareil dépose dans le téléphone : session, jeton, identité de l'appareil. */
export function stockageDeTelephone(
  session: Session,
  role: "guichet" | "quai" | "superviseur" | "patron" | "bus",
  appareil?: { id: string; rang: number },
): Record<string, string> {
  const stockage: Record<string, string> = {
    "afrimove.session": JSON.stringify({ role }),
    "afrimove.jeton": session.jeton,
  };
  if (appareil) {
    stockage["afrimove.appareil"] = JSON.stringify({
      appareilId: appareil.id,
      auteurId: session.id,
      agence: "DEM",
      gare: "DLA",
      plage: plageGuichet(appareil.rang),
      // Constat de la recette (anomalie A9) : l'application web ne reprend pas le « prochain numéro » que le serveur
      // lui donne ; elle numérote avec le compteur de l'appareil. Un appareil neuf, sur un guichet qui a déjà vendu
      // aujourd'hui, repartirait de 1 et se heurterait au numéro déjà pris. L'installation réelle (AM-160) devra
      // donner à l'appareil la suite de la plage ; ici le banc le fait, comme elle le fera.
      etat: etatDepuisLaBase(appareil.rang, Date.now()),
    });
  }
  return stockage;
}

export class Parcours {
  readonly etapes: Etape[] = [];
  /** Requêtes envoyées à l'API pendant le parcours : [méthode, chemin, statut]. */
  readonly appels: Array<[string, string, number]> = [];
  /** Erreurs de la page (exceptions non rattrapées, erreurs de console). */
  readonly erreurs: string[] = [];

  private constructor(
    readonly page: Page,
    private readonly contexte: BrowserContext,
    private readonly urlApi: string,
  ) {}

  static async ouvrir(
    navigateur: Browser,
    o: {
      urlWeb: string;
      urlApi: string;
      route: string;
      stockage: Record<string, string>;
      /** Script exécuté avant le chargement (faux détecteur de QR du quai). */
      scriptInit?: string;
    },
  ): Promise<Parcours> {
    const { contexte, page } = await ouvrirTelephone(navigateur, { stockage: o.stockage });
    await page.addInitScript((cle) => {
      document.addEventListener(
        "click",
        (e) => {
          if (!e.isTrusted) return;
          try {
            window.sessionStorage.setItem(
              cle,
              String(Number(window.sessionStorage.getItem(cle) ?? "0") + 1),
            );
          } catch {
            // stockage bloqué
          }
        },
        true,
      );
    }, CLE_APPUIS);
    if (o.scriptInit) await page.addInitScript(o.scriptInit);
    const parcours = new Parcours(page, contexte, o.urlApi);
    page.on("pageerror", (e) => parcours.erreurs.push(`exception : ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") parcours.erreurs.push(`console : ${m.text()}`);
    });
    page.on("response", (r) => {
      if (r.url().startsWith(o.urlApi)) {
        parcours.appels.push([r.request().method(), new URL(r.url()).pathname, r.status()]);
      }
    });
    await page.goto(`${o.urlWeb}${o.route}`, { waitUntil: "networkidle" });
    return parcours;
  }

  async fermer(): Promise<void> {
    await this.contexte.close();
  }

  /** Coupe (ou rétablit) le réseau du téléphone : le navigateur se déclare hors ligne et les requêtes échouent. */
  async coupureReseau(coupe: boolean): Promise<void> {
    await this.contexte.setOffline(coupe);
  }

  get touches(): number {
    return this.etapes.reduce((somme, e) => somme + e.touches, 0);
  }

  async appuisBruts(): Promise<number> {
    return this.page.evaluate(
      (cle) => Number(window.sessionStorage.getItem(cle) ?? "0"),
      CLE_APPUIS,
    );
  }

  async remettreAZero(): Promise<void> {
    this.etapes.length = 0;
    await this.page.evaluate((cle) => window.sessionStorage.setItem(cle, "0"), CLE_APPUIS);
  }

  /** Attend que l'écran de cette planche soit affiché (`data-planche`). */
  async attendreEcran(planche: string, delai = 15_000): Promise<void> {
    await this.voir(
      this.page.locator(`[data-planche="${planche}"]`),
      `l'écran ${planche} doit s'afficher`,
      delai,
    );
  }

  async voir(cible: Locator, message: string, delai = 8_000): Promise<void> {
    try {
      await cible.first().waitFor({ state: "visible", timeout: delai });
    } catch {
      const corps = await this.page
        .locator("body")
        .innerText()
        .then((t) => t.replace(/\s+/g, " ").slice(0, 500))
        .catch(() => "");
      const appels = this.appels
        .slice(-6)
        .map(([m, c, s]) => `${m} ${c} → ${s}`)
        .join(" ; ");
      throw new Error(
        `${message} (sur ${new URL(this.page.url()).pathname}) — écran : ${corps} — appels : ${appels}`,
      );
    }
  }

  async toucher(cible: Locator, libelle: string): Promise<void> {
    await this.voir(cible, `« ${libelle} » doit être visible`);
    await cible.tap();
    this.etapes.push({ libelle, touches: 1, a: await this.maintenant() });
  }

  async remplir(champ: Locator, texte: string, libelle: string): Promise<void> {
    await this.voir(champ, `le champ « ${libelle} » doit être visible`);
    await champ.fill(texte);
    this.etapes.push({ libelle: `saisie · ${libelle}`, touches: 0, a: await this.maintenant() });
  }

  async maintenant(): Promise<number> {
    return this.page.evaluate(() => performance.now());
  }

  chemin(): string {
    return new URL(this.page.url()).pathname;
  }

  resume(): string {
    return `${this.touches} touche(s) : ${this.etapes.map((e) => (e.touches > 0 ? e.libelle : `(${e.libelle})`)).join(" → ")}`;
  }
}
