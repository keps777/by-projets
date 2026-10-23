import { expect, test } from '@playwright/test';
import { aller, AUJOURDHUI, ouvrir, ouvrirDemo } from './aide';

test.describe('PWA : manifeste, service worker, chargement', () => {
  test('le manifeste et les icônes sont servis, la page les déclare', async ({ page, request }) => {
    await ouvrir(page, '/bienvenue');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/);
    const reponse = await request.get('/manifest.webmanifest');
    expect(reponse.ok()).toBe(true);
    const m = await reponse.json();
    expect(m).toMatchObject({ name: 'AssureMe', short_name: 'AssureMe', lang: 'fr', display: 'standalone', start_url: '/', theme_color: '#07090F', background_color: '#07090F' });
    expect(m.icons.map((i: any) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect((await request.get(i.src)).ok(), i.src).toBe(true);
    expect((await request.get('/apple-touch-icon.png')).status() === 200 || (await request.get('/icon-192.png')).ok()).toBe(true);
  });

  test('le service worker est généré (precache de l’application) et le HTML de repli existe', async ({ request }) => {
    const sw = await request.get('/sw.js');
    expect(sw.ok()).toBe(true);
    const code = await sw.text();
    expect(code).toContain('precacheAndRoute');
    expect(code).toContain('index.html');
    expect((await request.get('/registerSW.js')).ok()).toBe(true);
    // une route de l'application (rechargement direct d'une URL profonde) renvoie bien le HTML de l'app
    const profonde = await request.get('/ecole/frais');
    expect(profonde.ok()).toBe(true);
    expect(await profonde.text()).toContain('<div id="app">');
  });

  test.describe('avec le service worker actif', () => {
    test.use({ serviceWorkers: 'allow' });
    test('hors connexion, l’application déjà visitée se rouvre', async ({ page, context }) => {
      await ouvrir(page, '/bienvenue');
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      // le précache est rempli à l'installation du service worker
      await expect.poll(async () => page.evaluate(async () => { const noms = await caches.keys(); let n = 0; for (const k of noms) n += (await (await caches.open(k)).keys()).length; return n; }), { timeout: 20_000 }).toBeGreaterThan(5);
      await page.reload(); // la page est maintenant contrôlée par le service worker
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Essayer avec un compte de démonstration' })).toBeVisible();
      await context.setOffline(false);
    });
  });
});

test.describe('chargement paresseux des écrans', () => {
  test('pendant le chargement d’une route, un squelette remplace l’écran précédent', async ({ page }) => {
    await ouvrirDemo(page);
    // on retient le fichier de l'écran Score tant que le test ne le libère pas
    let liberer: () => void = () => {};
    const retenu = new Promise<void>((ok) => (liberer = ok));
    await page.route(/\/assets\/Score-[^/]+\.js$/, async (route) => { await retenu; await route.continue(); });
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Score' }).click();
    const squelette = page.getByRole('status', { name: 'Chargement' });
    await expect(squelette).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toHaveCount(0); // l'accueil n'est plus affiché
    await expect(page.getByTestId('solde')).toHaveCount(0);
    await expect(page).toHaveTitle('AssureScore · AssureMe');
    liberer();
    await expect(page.getByRole('heading', { name: 'AssureScore', level: 1 })).toBeVisible();
    await expect(squelette).toHaveCount(0);
  });
});
