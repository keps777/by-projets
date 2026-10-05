import { defineConfig } from '@playwright/test';

// Parcours de bout en bout sur l'app construite, en mode local (sans Supabase), au format iPhone.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4179',
    viewport: { width: 390, height: 844 },
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' }
  },
  webServer: { command: 'npm run build && npx vite preview --port 4179 --strictPort', port: 4179, reuseExistingServer: true, timeout: 120_000 }
});
