import { existsSync, readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { FUSEAU, HORLOGE_ISO, LANGUE, type Config } from "./config";
import type { Taille } from "./maquettes";

const CHROMIUM_PAR_DEFAUT = "/opt/pw-browsers/chromium";

/** Chromium à utiliser : variable FIDELITE_CHROMIUM, sinon celui du poste/CI s'il existe, sinon celui de Playwright. */
export function cheminChromium(): string | undefined {
  const env =
    process.env["FIDELITE_CHROMIUM"] ?? process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
  if (env) return env;
  return existsSync(CHROMIUM_PAR_DEFAUT) ? CHROMIUM_PAR_DEFAUT : undefined;
}

export async function ouvrirNavigateur(): Promise<Browser> {
  const executablePath = cheminChromium();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    // Rendu du texte identique d'une machine à l'autre : pas d'hinting, pas de LCD, sRGB.
    args: [
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--force-color-profile=srgb",
      "--disable-gpu",
    ],
  });
}

async function nouveauContexte(navigateur: Browser, taille: Taille): Promise<BrowserContext> {
  const ctx = await navigateur.newContext({
    viewport: { width: taille.largeur, height: taille.hauteur },
    deviceScaleFactor: 1,
    locale: LANGUE,
    timezoneId: FUSEAU,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  // Horloge figée au 05/01/2027 07:38 (Douala) : Date.now() et new Date() ne bougent plus,
  // les minuteries continuent de tourner (les écrans qui s'animent ou se rafraîchissent restent vivants).
  await ctx.clock.install({ time: new Date(HORLOGE_ISO) });
  await ctx.clock.setFixedTime(new Date(HORLOGE_ISO));
  return ctx;
}

export type Capture = { png: Buffer; texte: string; avertissements: string[] };

async function finaliser(page: Page, avertissements: string[]): Promise<Capture> {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const texte = await page.evaluate(() => document.body.innerText);
  const png = await page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
  return { png, texte, avertissements };
}

function surveillerPolices(page: Page, avertissements: string[]): void {
  const signaler = (u: string) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) {
      const m = `police non chargée (${new URL(u).hostname}) : le texte retombe sur une police de secours`;
      if (!avertissements.includes(m)) avertissements.push(m);
    }
  };
  page.on("requestfailed", (r) => signaler(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) signaler(r.url());
  });
}

/** Polices locales fournies par config.json ("polices") : remplacent Google Fonts dans la maquette. */
async function brancherPolices(page: Page, config: Config): Promise<void> {
  if (config.polices.length === 0) return;
  const css = config.polices
    .map((p) => {
      const b64 = readFileSync(p.fichier).toString("base64");
      return `@font-face{font-family:"${p.famille}";font-weight:${p.poids};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
    })
    .join("\n");
  await page.route(/fonts\.googleapis\.com/, (r) =>
    r.fulfill({ contentType: "text/css", body: css }),
  );
  await page.route(/fonts\.gstatic\.com/, (r) => r.abort());
}

export async function capturerMaquette(
  navigateur: Browser,
  config: Config,
  url: string,
  taille: Taille,
): Promise<Capture> {
  const ctx = await nouveauContexte(navigateur, taille);
  try {
    const page = await ctx.newPage();
    const avertissements: string[] = [];
    surveillerPolices(page, avertissements);
    await brancherPolices(page, config);
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("html[data-planche-prete]", { timeout: 5000 }).catch(() => {
      avertissements.push(
        "support.js de la planche non exécuté (attribut data-planche-prete absent)",
      );
    });
    return await finaliser(page, avertissements);
  } finally {
    await ctx.close();
  }
}

export type ResultatApp = { etat: "ok"; capture: Capture } | { etat: "absent"; raison: string };

/**
 * Capture l'écran de l'app. « Absent » = l'app ne répond pas ou répond HTTP ≥ 400 sur cette
 * route : ce n'est pas une erreur du banc, c'est un écran pas encore livré.
 */
export async function capturerApp(
  navigateur: Browser,
  config: Config,
  url: string,
  taille: Taille,
  attente?: string,
): Promise<ResultatApp> {
  const ctx = await nouveauContexte(navigateur, taille);
  try {
    // Flag « conception » aussi côté stockage local, au cas où l'app ne lise pas le paramètre d'URL.
    await ctx.addInitScript((cle: string) => {
      try {
        localStorage.setItem(cle, "1");
      } catch {
        /* stockage indisponible */
      }
    }, config.cleStockageConception);
    const page = await ctx.newPage();
    const avertissements: string[] = [];
    surveillerPolices(page, avertissements);
    let reponse;
    try {
      reponse = await page.goto(url, { waitUntil: "load", timeout: 20000 });
    } catch (e) {
      return { etat: "absent", raison: `app injoignable (${(e as Error).message.split("\n")[0]})` };
    }
    if (reponse && reponse.status() >= 400) {
      return { etat: "absent", raison: `l'app répond HTTP ${reponse.status()} sur cette route` };
    }
    if (attente) await page.waitForSelector(attente, { timeout: 10000 });
    return { etat: "ok", capture: await finaliser(page, avertissements) };
  } finally {
    await ctx.close();
  }
}
