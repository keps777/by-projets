import { defineConfig } from '@playwright/test';

// Après l'heure du rapport (23:45), une fenêtre invite à l'envoyer et couvre l'écran : les parcours la mettent de côté pour la journée.
const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());

// Parcours de bout en bout sur l'app construite, en mode local (sans Supabase), au format iPhone.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4179',
    viewport: { width: 390, height: 844 },
    // L'horaire type se pose tout seul au premier démarrage : les parcours partent d'un Fil vide (voir e2e/fil-deux-parties.spec.ts pour la pose automatique).
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:4179', localStorage: [{ name: 'luther-life:horaire-type', value: 'retire' }, { name: 'luther-life:invitation-rapport', value: JSON.stringify({ jour: aujourdhui, jusqua: 'jour' }) }] }] },
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' }
  },
  webServer: { command: 'npm run build && npx vite preview --port 4179 --strictPort', port: 4179, reuseExistingServer: true, timeout: 120_000 }
});
