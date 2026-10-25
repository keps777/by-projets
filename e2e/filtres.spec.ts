// Fenêtre de filtres de l'accueil : une pop-up (pas une autre page) avec tri, type, prix, heure, compagnie, confort ; compteur en direct ; l'ancienne route /filtres reste valide.
import type { Locator, Page } from '@playwright/test';
import { expect, ouvrir, test } from './aide';

const MAINTENANT = '2026-11-03T07:30'; // demain : 19 départs Yaoundé → Douala
async function accueil(page: Page) {
  await ouvrir(page, '/', { connecte: 'p-aicha', maintenant: MAINTENANT });
  await expect(page.locator('.hd .pl')).toContainText('19 départs');
}
const boutonFiltres = (page: Page) => page.getByRole('button', { name: /^Filtres/ });
async function ouvrirFiltres(page: Page): Promise<Locator> {
  await boutonFiltres(page).click();
  const f = page.getByRole('dialog', { name: 'Filtres' });
  await expect(f).toBeVisible();
  return f;
}
/** Nombre de départs que l'accueil montre derrière la fenêtre : somme des repères des 8 tranches. */
const departsDerriere = async (page: Page) => (await page.locator('.ribbon .tick b').allTextContents()).reduce((s, t) => s + (Number(t) || 0), 0);
const curseur = (f: Locator) => f.getByRole('slider');
async function regler(c: Locator, valeur: number) { await c.evaluate((el, v) => { (el as HTMLInputElement).value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, valeur); }

test('« Filtres » ouvre une fenêtre sur l’accueil, sans changer de page, avec tous les réglages', async ({ page }) => {
  await accueil(page);
  // le tri n'est plus une ligne de la page : il vit dans la fenêtre
  for (const nom of ['Heure', 'Prix', 'Places', 'Confort']) await expect(page.getByRole('button', { name: nom, exact: true })).toHaveCount(0);
  const f = await ouvrirFiltres(page);
  await expect(page).toHaveURL(/\/\?maintenant=/);
  await expect(page.locator('.pano')).toBeAttached(); // l'accueil est toujours là, derrière
  for (const titre of ['Trier par', 'Type', 'Prix max', 'Heure de départ', 'Compagnie', 'Confort']) await expect(f.locator('.lab').filter({ hasText: new RegExp(`^${titre}$`) })).toBeVisible();
  for (const nom of ['Heure', 'Prix', 'Places', 'Confort']) await expect(f.getByRole('button', { name: nom, exact: true })).toBeVisible();
  for (const nom of ['Tout', 'Bus', 'Covoit', 'Aube', 'Matin', 'Après-midi', 'Nuit', 'Bêta Express', 'Alpha VIP']) await expect(f.getByRole('button', { name: nom, exact: true })).toBeVisible();
  for (const nom of ['Climatisation', 'Prise USB', 'VIP 3 sièges', 'Wi-Fi à bord']) await expect(f.getByRole('switch', { name: nom })).toBeAttached();
  await expect(f.getByText('Sans limite')).toBeVisible();
  await expect(f.getByRole('button', { name: 'Voir 19 départs' })).toBeVisible();
  await expect(f.getByRole('button', { name: 'Effacer' })).toBeDisabled();
});

test('le bouton « Voir N départs » compte en direct les vrais départs, et l’accueil suit derrière', async ({ page }) => {
  await accueil(page);
  const f = await ouvrirFiltres(page);
  await f.getByRole('button', { name: 'Matin', exact: true }).click();
  await expect(f.getByRole('button', { name: 'Voir 6 départs' })).toBeVisible();
  expect(await departsDerriere(page)).toBe(6);
  await f.getByRole('button', { name: 'Bêta Express', exact: true }).click();
  await expect(f.getByRole('button', { name: 'Voir 2 départs' })).toBeVisible();
  await f.getByRole('switch', { name: 'Wi-Fi à bord' }).click();
  await expect(f.getByRole('button', { name: 'Voir 1 départ', exact: true })).toBeVisible();
  expect(await departsDerriere(page)).toBe(1);
  await f.getByRole('switch', { name: 'Wi-Fi à bord' }).click();
  await expect(f.getByRole('button', { name: 'Effacer · 2' })).toBeEnabled();
  await f.getByRole('button', { name: 'Voir 2 départs' }).click();
  await expect(f).toHaveCount(0); // « Voir » ferme la fenêtre
  expect(await departsDerriere(page)).toBe(2);
  // rouverte, elle garde les réglages ; « Effacer » les remet à zéro
  const g = await ouvrirFiltres(page);
  await expect(g.getByRole('button', { name: 'Matin', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await g.getByRole('button', { name: /^Effacer/ }).click();
  await expect(g.getByRole('button', { name: 'Voir 19 départs' })).toBeVisible();
  await expect(g.getByRole('button', { name: 'Matin', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await departsDerriere(page)).toBe(19);
});

test('type, prix max par pas de 500 F et heure de départ', async ({ page }) => {
  await accueil(page);
  const f = await ouvrirFiltres(page);
  await f.getByRole('button', { name: 'Covoit', exact: true }).click();
  await expect(f.getByRole('button', { name: 'Voir 5 départs' })).toBeVisible();
  await f.getByRole('button', { name: 'Bus', exact: true }).click();
  await expect(f.getByRole('button', { name: 'Voir 14 départs' })).toBeVisible();
  await f.getByRole('button', { name: 'Tout', exact: true }).click();
  const c = curseur(f);
  await expect(c).toHaveAttribute('step', '500');
  await regler(c, 6000);
  await expect(f.getByText(/6\s?000\sF/).first()).toBeVisible();
  const n6 = Number((await f.getByRole('button', { name: /^Voir \d+ départs?$/ }).textContent())!.replace(/\D/g, ''));
  expect(n6).toBeGreaterThan(0); expect(n6).toBeLessThan(19);
  expect(await departsDerriere(page)).toBe(n6);
  await regler(c, 15000);
  await expect(f.getByText('Sans limite')).toBeVisible();
  await expect(f.getByRole('button', { name: 'Voir 19 départs' })).toBeVisible();
  await regler(c, 5000); // plancher du curseur
  await f.getByRole('button', { name: 'Nuit', exact: true }).click();
  await expect(f.getByRole('button', { name: /^(Voir \d+ départs?|Aucun départ.*)$/ })).toBeVisible();
});

test('le tri se règle dans la fenêtre et réordonne la tranche de face', async ({ page }) => {
  await accueil(page);
  const premier = () => page.locator('.colm.front .bus').first();
  await expect(premier()).toContainText('06:00'); // par heure
  const f = await ouvrirFiltres(page);
  await f.getByRole('button', { name: 'Prix', exact: true }).click();
  await expect(f.getByRole('button', { name: 'Prix', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(premier()).toContainText('07:30'); // le covoiturage à 4 500 F passe avant les bus
  await f.getByRole('button', { name: 'Heure', exact: true }).click();
  await expect(premier()).toContainText('06:00');
  await f.getByRole('button', { name: 'Places', exact: true }).click();
  await f.getByRole('button', { name: 'Confort', exact: true }).click();
  await expect(f.getByRole('button', { name: 'Effacer · 1' })).toBeVisible();
});

test('Échap, la croix et le voile ferment la fenêtre ; aucun départ désactive le bouton principal', async ({ page }) => {
  await accueil(page);
  let f = await ouvrirFiltres(page);
  await page.keyboard.press('Escape');
  await expect(f).toHaveCount(0);
  f = await ouvrirFiltres(page);
  await f.getByRole('button', { name: 'Fermer' }).click();
  await expect(f).toHaveCount(0);
  f = await ouvrirFiltres(page);
  await page.mouse.click(195, 40); // le voile, au-dessus de la fenêtre
  await expect(f).toHaveCount(0);
  f = await ouvrirFiltres(page);
  await f.getByRole('button', { name: 'Covoit', exact: true }).click();
  await f.getByRole('button', { name: 'Aube', exact: true }).click();
  await f.getByRole('switch', { name: 'Wi-Fi à bord' }).click();
  await expect(f.getByRole('button', { name: /^Aucun départ/ })).toBeDisabled();
});

test('cibles tactiles de la fenêtre ≥ 44 px, clavier complet, pas de débordement à 320 px', async ({ page }) => {
  await accueil(page);
  const f = await ouvrirFiltres(page);
  const boutons = f.locator('.seg2 button, .ch, header button, footer button, .li');
  const n = await boutons.count();
  expect(n).toBeGreaterThan(15);
  for (let i = 0; i < n; i++) {
    const b = (await boutons.nth(i).boundingBox())!;
    expect(b.height, `${await boutons.nth(i).textContent()} : hauteur`).toBeGreaterThanOrEqual(43.5);
    expect(b.width, `${await boutons.nth(i).textContent()} : largeur`).toBeGreaterThanOrEqual(43.5);
  }
  // clavier : le focus reste dans la fenêtre et Entrée/Espace actionnent un chip
  await f.getByRole('button', { name: 'Matin', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(f.getByRole('button', { name: 'Matin', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(await f.evaluate((el) => [el.scrollWidth <= el.clientWidth, ...[...el.querySelectorAll<HTMLElement>('.corps')].map((c) => c.scrollWidth <= c.clientWidth)])).not.toContain(false);
  const fb = (await f.boundingBox())!;
  expect(fb.x).toBeGreaterThanOrEqual(0); expect(fb.x + fb.width).toBeLessThanOrEqual(320.5);
  await expect(f.getByRole('button', { name: /^Voir/ })).toBeInViewport();
});

test('l’ancienne route /filtres reste valide (lien profond)', async ({ page }) => {
  await ouvrir(page, '/filtres', { connecte: 'p-aicha', maintenant: MAINTENANT });
  await expect(page.getByRole('link', { name: 'Voir 19 départs' })).toBeVisible();
  await page.getByRole('button', { name: 'Matin' }).click();
  await expect(page.getByRole('link', { name: 'Voir 6 départs' })).toBeVisible();
});
