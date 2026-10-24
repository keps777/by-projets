// (m) PWA : manifeste complet, icônes servies, service worker actif, et une page déjà visitée se rouvre sans réseau.
import { expect, ouvrir, test } from './aide';

test.use({ serviceWorkers: 'allow' });

test('(m) manifeste, icônes, langue et titre', async ({ page, request }) => {
  await ouvrir(page, '/entree');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page).toHaveTitle('Entrée · AfriMove');
  const lien = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(lien).toBeTruthy();
  const m = await (await request.get(lien!)).json();
  expect(m).toMatchObject({ name: 'AfriMove', short_name: 'AfriMove', lang: 'fr', display: 'standalone', start_url: '/', scope: '/', background_color: '#05070D', theme_color: '#05070D' });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons as { src: string; type: string }[]) { const r = await request.get(i.src); expect(r.status(), i.src).toBe(200); expect(r.headers()['content-type']).toContain('image/png'); }
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#05070D');
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0);
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
});

test('(m) le service worker s’installe, précache l’application, et une page déjà visitée se rouvre hors ligne', async ({ page, context }) => {
  await ouvrir(page, '/entree');
  await expect(page.getByRole('button', { name: 'Entrer directement comme Aïcha' })).toBeVisible();
  // le service worker prend le contrôle de la page (après son activation)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? '')).toBe('activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const caches = await page.evaluate(async () => { const n = await globalThis.caches.keys(); const c = await globalThis.caches.open(n[0]); return (await c.keys()).map((r) => new URL(r.url).pathname); });
  expect(caches.some((c) => c.endsWith('.js'))).toBe(true);
  expect(caches.some((c) => c.endsWith('.css'))).toBe(true);
  // visite d'une page de plus (chargée à la demande), puis plus de réseau
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.pano')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.pano')).toBeVisible(); // la voyageuse retrouve ses départs, hors ligne
  await expect(page).toHaveTitle('Voyager · AfriMove');
  await page.goto('/pass');
  await expect(page.getByText('AM-7F3K-22')).toBeVisible(); // son billet signé aussi
  await context.setOffline(false);
});
