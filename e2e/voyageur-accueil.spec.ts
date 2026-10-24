// Parcours voyageur : panorama 3D, filtres, calendrier, destination, voix et orbe (application construite, horloge figée au 3 nov. 2026, 07 h 30).
import type { Page } from '@playwright/test';
import { expect, test } from './aide'; // le test d'aide échoue à la moindre exception de page ou console.error

const NOW = '?maintenant=2026-11-03T07:30';
async function entrer(page: Page) {
  await page.goto('/entree' + NOW);
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await page.goto('/' + NOW);
}
const devant = (page: Page) => page.locator('.colm.front .hh');

test('le panorama tourne au glisser, aux flèches et aux repères horaires', async ({ page }) => {
  await entrer(page);
  await expect(page.locator('.hd .pl')).toContainText('19 départs');
  await expect(devant(page)).toContainText('06');
  const box = (await page.locator('.pano').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 150); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 200 + i * 10, box.y + 150);
  await page.mouse.up();
  await expect(devant(page)).toContainText('03');
  await page.locator('.pano').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(devant(page)).toContainText('09');
  await expect(page.locator('p.sr')).toContainText('Tranche 09 – 12 h');
  await page.locator('.tick', { hasText: '21h' }).click();
  await expect(devant(page)).toContainText('21');
  await expect(page.locator('.colm.front .tm')).toHaveText('22:30');
});

test('choisir un départ mène au siège, un covoiturage au paiement', async ({ page }) => {
  await entrer(page);
  await expect(page.locator('.sel')).toContainText('06:00 · Alpha VIP');
  // le Bêta Express de 07:00 est complet (l'historique du patron l'a rempli) : on prend le Finex de 06:15
  await page.locator('.colm.front .bus', { hasText: '07:00' }).click();
  await expect(page.locator('.sel')).toContainText('07:00 · Bêta Express');
  await expect(page.locator('.sel')).toContainText('Complet');
  await page.locator('.colm.front .bus', { hasText: '06:15' }).click();
  await expect(page.locator('.sel')).toContainText('06:15 · Finex');
  await expect(page.locator('.sel a.b.p')).toHaveAttribute('href', /^\/siege\?depart=d-2026-11-04-.*0615&prix=6000$/);
  await page.getByRole('button', { name: 'Covoit', exact: true }).click();
  await page.locator('.tick', { hasText: '9h' }).click();
  await expect(page.locator('.sel')).toContainText('Jean-Paul N.');
  await page.locator('.sel a.b.p').click();
  await expect(page).toHaveURL(/\/paiement\?covoit=v3/);
});

test('les filtres comptent les vrais départs', async ({ page }) => {
  await entrer(page);
  await page.getByRole('link', { name: 'Filtres' }).click();
  await expect(page.getByRole('link', { name: 'Voir 19 départs' })).toBeVisible();
  await page.getByRole('button', { name: 'Matin' }).click();
  await expect(page.getByRole('link', { name: 'Voir 6 départs' })).toBeVisible();
  await page.getByRole('button', { name: 'Bêta Express' }).click();
  await expect(page.getByRole('link', { name: 'Voir 2 départs' })).toBeVisible();
  await page.getByRole('switch', { name: 'Wi-Fi à bord' }).click();
  await expect(page.getByRole('link', { name: 'Voir 1 départ' })).toBeVisible();
  await page.getByRole('switch', { name: 'Wi-Fi à bord' }).click();
  await page.getByRole('link', { name: 'Voir 2 départs' }).click();
  await expect(page.getByRole('link', { name: 'Filtres · 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Filtres · 2' }).click();
  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(page.getByRole('link', { name: 'Voir 19 départs' })).toBeVisible();
});

test('destination, calendrier et tambour : la tranche choisie est mise en face', async ({ page }) => {
  await entrer(page);
  await page.goto('/destination' + NOW);
  await page.locator('.city', { hasText: 'Bafoussam' }).click();
  await page.getByRole('button', { name: /Choisir la date et l’heure/ }).click();
  await expect(page).toHaveURL(/\/calendrier/);
  await page.getByRole('button', { name: /vendredi 6 novembre/ }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Heure suivante' }).click();
  await page.getByRole('button', { name: ':30', exact: true }).click();
  await expect(page.locator('.sheet')).toContainText('ven. 6 nov. · 14:30');
  await page.getByRole('button', { name: 'Voir les départs en 3D' }).click();
  await expect(page.getByText('Yaoundé → Bafoussam')).toBeVisible();
  await expect(devant(page)).toContainText('12');
});

test('« Dis où tu vas » comprend la phrase écrite', async ({ page }) => {
  await entrer(page);
  await page.goto('/voix' + NOW);
  await page.getByRole('button', { name: /Écrire plutôt/ }).click().catch(() => undefined);
  await page.locator('#phrase').fill('Je veux aller à Bafoussam demain matin');
  await expect(page.locator('.bento')).toContainText('Bafoussam');
  await expect(page.locator('.bento')).toContainText('Demain · matin');
  await page.getByRole('button', { name: /C’est ça/ }).click();
  await expect(page.getByText('Yaoundé → Bafoussam')).toBeVisible();
  await page.goto('/voix' + NOW);
  await page.getByRole('button', { name: /Écrire plutôt/ }).click().catch(() => undefined);
  await page.locator('#phrase').fill('Bertoua demain');
  await expect(page.getByRole('button', { name: /C’est ça/ })).toBeDisabled();
});

test('l’orbe cherche une ville, un billet ou un colis', async ({ page }) => {
  await entrer(page);
  await page.goto('/orbe' + NOW);
  await page.locator('#orbe-q').fill('billet AM7F3K');
  await expect(page.locator('.res')).toContainText('AM7F3K22');
  await page.locator('#orbe-q').fill('douala demain');
  await page.locator('.res').first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.hd .pl')).toContainText('19 départs');
});

test('aucun débordement horizontal à 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await entrer(page);
  for (const r of ['', 'filtres', 'ville', 'voix', 'orbe', 'destination', 'calendrier']) {
    await page.goto('/' + r + NOW);
    await expect(page.locator('.bd')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});
