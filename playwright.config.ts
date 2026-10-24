// Tests de bout en bout : l'application construite (`vite build`) servie par `vite preview`, pilotée dans Chromium en 390 × 844 (iPhone).
// Chromium préinstallé : dossier PLAYWRIGHT_BROWSERS_PATH (par défaut /opt/pw-browsers) ; sinon Playwright utilise le sien.
import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.AM_PORT) || 4180;
const dossierNavigateurs = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
function chromiumPreinstalle(): string | undefined {
  if (!existsSync(dossierNavigateurs)) return undefined;
  const versions = readdirSync(dossierNavigateurs).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const v of versions) {
    const exe = join(dossierNavigateurs, v, 'chrome-linux', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}
const executablePath = process.env.CHROMIUM_PATH || chromiumPreinstalle();

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox'] }
  },
  projects: [{ name: 'mobile', use: {} }],
  webServer: {
    command: `npm run build && npx vite preview --host --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore'
  }
});
