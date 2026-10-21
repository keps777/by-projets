import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

/** Chromium préinstallé (`PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers` par défaut), comme le banc des parcours. */
export async function lancerNavigateur(): Promise<Browser> {
  const dossier = process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? "/opt/pw-browsers";
  return chromium.launch({
    executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] ?? `${dossier}/chromium`,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
}

/** Un téléphone émulé 390 × 844, tactile, fuseau de Douala. */
export async function ouvrirTelephone(
  navigateur: Browser,
  options: { stockage?: Record<string, string> } = {},
): Promise<{ contexte: BrowserContext; page: Page }> {
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
  if (options.stockage) {
    await page.addInitScript((valeurs) => {
      for (const [cle, valeur] of Object.entries(valeurs)) {
        try {
          if (!window.localStorage.getItem(cle)) window.localStorage.setItem(cle, valeur);
        } catch {
          // stockage bloqué
        }
      }
    }, options.stockage);
  }
  return { contexte, page };
}
