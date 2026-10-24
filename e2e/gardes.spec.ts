// (l) Gardes de rôles : chaque espace est fermé aux autres rôles (renvoi vers l'entrée), le patron passe partout, la session expire après 15 min d'inactivité.
import { aller, entrerEn, expect, MAINTENANT, ouvrir, test } from './aide';

const lieu = (page: import('@playwright/test').Page) => page.evaluate(() => location.pathname);

test('(l) la voyageuse est renvoyée de /guichet et des autres espaces réservés', async ({ page }) => {
  await ouvrir(page, '/guichet', { connecte: 'p-aicha' });
  await expect.poll(() => lieu(page)).toBe('/entree');
  for (const interdit of ['/vente', '/caisse', '/quai', '/superviseur', '/patron', '/siege/analyses', '/chauffeur', '/relais/app', '/modules']) {
    await aller(page, interdit);
    await expect.poll(() => lieu(page), interdit).toBe('/entree');
  }
  // ses propres écrans restent ouverts
  await aller(page, '/pass'); await expect(page).toHaveURL(/\/pass$/);
  await aller(page, '/moi'); await expect(page).toHaveURL(/\/moi$/);
});

test('(l) le patron passe partout ; les agents restent chacun chez eux', async ({ page }) => {
  await ouvrir(page, '/guichet', { connecte: 'p-luther' });
  await expect(page).toHaveTitle('Guichet · AfriMove');
  for (const [chemin, titre] of [['/quai', 'Quai · radar de scan'], ['/superviseur', 'La gare en direct'], ['/caisse', 'Caisse'], ['/siege/analyses', 'Analyses'], ['/patron', 'Tableau du patron']] as const) {
    await aller(page, chemin);
    await expect(page).toHaveTitle(`${titre} · AfriMove`);
    expect(await lieu(page)).toBe(chemin);
  }
  // Fatou (guichet) ne va ni chez le patron, ni chez le chauffeur ; Ibrahim (quai) ne vend pas
  await entrerEn(page, 'p-fatou');
  for (const interdit of ['/patron', '/chauffeur', '/siege/config', '/superviseur']) { await aller(page, interdit); await expect.poll(() => lieu(page), interdit).toBe('/entree'); }
  await entrerEn(page, 'p-ibrahim');
  for (const interdit of ['/vente', '/caisse', '/guichet']) { await aller(page, interdit); await expect.poll(() => lieu(page), interdit).toBe('/entree'); }
  await aller(page, '/quai'); await expect(page).toHaveTitle('Quai · radar de scan · AfriMove');
});

test('(l) sans session : le tutoriel d’abord, puis la connexion une fois le tutoriel vu', async ({ page }) => {
  await ouvrir(page, '/pass');
  await expect.poll(() => lieu(page)).toBe('/splash'); // tutoriel jamais vu
  const vu = await page.context().newPage();
  await ouvrir(vu, '/pass', { vuTuto: true });
  await expect.poll(() => lieu(vu)).toBe('/connexion');
});

test('(l) la session d’une voyageuse inactive depuis plus de 15 min expire : retour à la connexion', async ({ page }) => {
  await ouvrir(page, '/pass', { connecte: 'p-aicha', preparer: (e) => { e.session.derniereActivite = Date.parse(MAINTENANT) - 16 * 60_000; } });
  await expect.poll(() => lieu(page)).toBe('/connexion'); // tutoriel déjà vu : on redemande la connexion
});
